import { QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryClient } from "@/lib/query/client";
import type { Message } from "@/lib/types/messaging";

/**
 * REPRODUÇÃO COM A CONFIGURAÇÃO REAL DA APLICAÇÃO.
 *
 * O teste que acompanhou o conserto criou um QueryClient próprio
 * (`{ retry: false }`). A produção usa `makeQueryClient()`, com
 * `staleTime: 30_000`, `gcTime: 5min` e `refetchOnWindowFocus: false`.
 *
 * Relato de produção depois do deploy: a rede de segurança DISPARA (as chamadas
 * aparecem na aba Network), mas a conversa não atualiza. Ou seja: busca
 * acontecendo e dado não chegando à tela. Este arquivo existe para achar a
 * diferença entre o ambiente do teste e o real — se ele passar, o defeito não
 * está no hook e sim no componente.
 */

const h = vi.hoisted(() => ({
  onChange: null as ((p: unknown) => void) | null,
  ultimaEntrega: { current: null as number | null },
  get: vi.fn(),
}));

vi.mock("@/hooks/realtime/useRealtimeChannel", () => ({
  useRealtimeChannel: (opts: { onChange: (p: unknown) => void }) => {
    h.onChange = opts.onChange;
    return { status: "subscribed" as const, ultimaEntrega: h.ultimaEntrega };
  },
}));
vi.mock("@/lib/api/client", () => ({ apiClient: { get: (url: string) => h.get(url) } }));
vi.mock("@/components/feedback/ApiErrorToast", () => ({ showApiError: vi.fn() }));

import { useMessagesRealtime } from "@/hooks/inbox/useMessagesRealtime";

const CONV = "3aabb300-e7bc-4acd-baa4-d8bf7ceb9203";

function msg(id: string, sentAt: string): Message {
  return {
    id,
    organization_id: "org-1",
    conversation_id: CONV,
    channel_session_id: "s1",
    contact_id: "c1",
    external_id: null,
    type: "text",
    direction: "inbound",
    status: "delivered",
    ack: null,
    error_code: null,
    error_message: null,
    body: id,
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    // "system" e não "external_device" (que é o que o ingest realmente grava,
    // em ingest.ts:489) porque o tipo `Message` só admite user|ai|system — o
    // tipo está incompleto frente ao banco. Irrelevante para este teste.
    sent_via: "system",
    sent_by_user_id: null,
    sent_at: sentAt,
    delivered_at: null,
    read_at: null,
    metadata: {},
    created_at: sentAt,
  } as Message;
}

let qc: ReturnType<typeof makeQueryClient>;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  h.onChange = null;
  h.ultimaEntrega.current = null;
  h.get.mockReset();
  qc = makeQueryClient();
  vi.useFakeTimers();
});
afterEach(() => vi.useRealTimers());

function noCache(): string[] {
  const d = qc.getQueryData<InfiniteData<{ data: Message[] }>>(["messages", CONV]);
  return (d?.pages ?? []).flatMap((p) => p.data).map((m) => m.id);
}

describe("com o QueryClient REAL da aplicação", () => {
  it("a mensagem que o canal perdeu chega pela rede de segurança", async () => {
    h.get.mockResolvedValue({
      data: [msg("m1", "2026-08-24T19:39:00.000Z")],
      meta: { has_more: false, cursor: null },
    });

    renderHook(() => useMessagesRealtime(CONV), { wrapper });
    await vi.waitFor(() => expect(noCache()).toEqual(["m1"]));
    const buscasIniciais = h.get.mock.calls.length;

    // O servidor ganha a mensagem nova. O canal não avisa (morte silenciosa).
    h.get.mockResolvedValue({
      data: [msg("m1", "2026-08-24T19:39:00.000Z"), msg("oi", "2026-08-24T20:17:38.000Z")],
      meta: { has_more: false, cursor: null },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46_000);
    });

    // A busca aconteceu?
    expect(h.get.mock.calls.length).toBeGreaterThan(buscasIniciais);
    // E o dado chegou ao cache que a tela lê?
    expect(noCache()).toEqual(["m1", "oi"]);
  });
});
