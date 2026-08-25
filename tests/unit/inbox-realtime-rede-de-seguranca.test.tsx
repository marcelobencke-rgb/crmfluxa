// @vitest-environment jsdom
import { QueryClient, QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useRef } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { Message } from "@/lib/types/messaging";

/**
 * O BUG QUE ESTE ARQUIVO GUARDA: com a conversa aberta, mensagem nova não
 * aparecia — só saindo da conversa e voltando.
 *
 * A assinatura do realtime estava correta (filtro, RLS, publicação, tudo
 * verificado). O que faltava era o PLANO B: o canal responde SUBSCRIBED e pode
 * parar de entregar sem erro nenhum, e nesse estado o inbox não tinha nada que
 * o tirasse do lugar — `refetchOnWindowFocus` está desligado global e não havia
 * intervalo. Trocar de conversa "consertava" só porque muda a queryKey e força
 * uma busca nova.
 *
 * São dois consertos distintos, e os dois têm teste aqui porque falham de
 * formas diferentes:
 *   1. a rede de segurança passou a existir no inbox (antes só board/dossiê);
 *   2. a rede de segurança PRECISOU ser consertada para funcionar em tela que
 *      redesenha — ver o bloco "o intervalo sobrevive ao redesenho".
 */

const h = vi.hoisted(() => ({
  onChange: null as ((payload: unknown) => void) | null,
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
import { useRefetchDeSeguranca } from "@/hooks/realtime/useRefetchDeSeguranca";

const CONV = "conv-1";

function msg(over: Partial<Message> & Pick<Message, "id">): Message {
  return {
    organization_id: "org-1",
    conversation_id: CONV,
    channel_session_id: "sess-1",
    contact_id: "contact-1",
    external_id: null,
    type: "text",
    direction: "inbound",
    status: "received",
    ack: null,
    error_code: null,
    error_message: null,
    body: "oi",
    media_url: null,
    media_mime: null,
    media_size_bytes: null,
    media_storage_path: null,
    sent_via: "contact",
    sent_by_user_id: null,
    sent_at: "2026-08-24T10:00:00.000Z",
    delivered_at: null,
    read_at: null,
    metadata: {},
    created_at: "2026-08-24T10:00:00.000Z",
    ...over,
  } as Message;
}

let qc: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Todas as mensagens do cache, achatadas — é o que a tela renderiza. */
function noCache(): Message[] {
  const d = qc.getQueryData<InfiniteData<{ data: Message[] }>>(["messages", CONV]);
  return (d?.pages ?? []).flatMap((p) => p.data);
}

beforeEach(() => {
  h.onChange = null;
  h.ultimaEntrega.current = null;
  h.get.mockReset();
  qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
});

describe("a mensagem do canal entra na tela sem ida à rede", () => {
  it("INSERT do realtime aparece no cache e NÃO dispara refetch", async () => {
    h.get.mockResolvedValue({ data: [msg({ id: "m1" })], meta: { has_more: false, cursor: null } });
    renderHook(() => useMessagesRealtime(CONV), { wrapper });
    await waitFor(() => expect(noCache()).toHaveLength(1));
    const buscasAteAqui = h.get.mock.calls.length;

    act(() => {
      h.onChange?.({
        eventType: "INSERT",
        new: msg({ id: "m2", body: "mensagem nova", sent_at: "2026-08-24T10:05:00.000Z" }),
      });
    });

    // A mensagem está na tela...
    expect(noCache().map((m) => m.id)).toEqual(["m1", "m2"]);
    // ...e nenhuma requisição nova foi feita para saber disso. Este `expect` é o
    // ponto do conserto: antes, todo evento invalidava a query e a mensagem só
    // aparecia depois do round-trip (e, sendo infinite query, refazia TODAS as
    // páginas já carregadas).
    expect(h.get.mock.calls.length).toBe(buscasAteAqui);
  });

  it("UPDATE substitui a linha em vez de duplicar", async () => {
    h.get.mockResolvedValue({
      data: [msg({ id: "m1", direction: "outbound", status: "queued" })],
      meta: { has_more: false, cursor: null },
    });
    renderHook(() => useMessagesRealtime(CONV), { wrapper });
    await waitFor(() => expect(noCache()).toHaveLength(1));

    act(() => {
      h.onChange?.({
        eventType: "UPDATE",
        new: msg({ id: "m1", direction: "outbound", status: "sent" }),
      });
    });

    expect(noCache()).toHaveLength(1);
    expect(noCache()[0]?.status).toBe("sent");
  });

  it("a bolha otimista some quando a mensagem real chega — não ficam as duas", async () => {
    h.get.mockResolvedValue({ data: [], meta: { has_more: false, cursor: null } });
    renderHook(() => useMessagesRealtime(CONV), { wrapper });
    await waitFor(() => expect(h.get).toHaveBeenCalled());

    // O que `useSendMessage.onMutate` escreve antes da resposta do servidor.
    qc.setQueryData<InfiniteData<{ data: Message[] }>>(["messages", CONV], (old) => {
      const otimista = msg({
        id: "temp-123",
        direction: "outbound",
        body: "tchau",
        metadata: { _optimistic: true },
      });
      if (!old) return old;
      const pages = [...old.pages];
      pages[0] = { ...pages[0]!, data: [...pages[0]!.data, otimista] };
      return { ...old, pages };
    });
    expect(noCache()).toHaveLength(1);

    act(() => {
      h.onChange?.({
        eventType: "INSERT",
        new: msg({ id: "real-1", direction: "outbound", body: "tchau" }),
      });
    });

    const ids = noCache().map((m) => m.id);
    expect(ids).toEqual(["real-1"]);
  });

  it("DELETE tira a linha do cache", async () => {
    h.get.mockResolvedValue({
      data: [msg({ id: "m1" }), msg({ id: "m2" })],
      meta: { has_more: false, cursor: null },
    });
    renderHook(() => useMessagesRealtime(CONV), { wrapper });
    await waitFor(() => expect(noCache()).toHaveLength(2));

    act(() => h.onChange?.({ eventType: "DELETE", old: { id: "m1" } }));

    expect(noCache().map((m) => m.id)).toEqual(["m2"]);
  });
});

describe("a rede de segurança cura o canal que morreu calado", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  /**
   * ESTE É O TESTE DO BUG RELATADO. O canal fica SUBSCRIBED e nunca entrega
   * (`ultimaEntrega` permanece null, e `onChange` nunca é chamado) enquanto o
   * servidor já tem uma mensagem nova. Sem rede de segurança a tela ficaria
   * parada para sempre — que era exatamente o "preciso sair e abrir de novo".
   */
  it("mensagem que o canal perdeu aparece sozinha depois do intervalo", async () => {
    h.get.mockResolvedValue({ data: [msg({ id: "m1" })], meta: { has_more: false, cursor: null } });
    renderHook(() => useMessagesRealtime(CONV), { wrapper });
    await vi.waitFor(() => expect(noCache()).toHaveLength(1));

    // O servidor ganhou uma mensagem. O canal não avisou nada (morte silenciosa).
    h.get.mockResolvedValue({
      data: [msg({ id: "m1" }), msg({ id: "m2", sent_at: "2026-08-24T10:09:00.000Z" })],
      meta: { has_more: false, cursor: null },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(46_000);
    });

    expect(noCache().map((m) => m.id)).toEqual(["m1", "m2"]);
  });

  /**
   * O CONSERTO DENTRO DO CONSERTO.
   *
   * `queryKey` chega como array literal, recriado a cada render. Ele entrava nas
   * dependências do `useCallback` de `verificar`, que entra nas dependências do
   * efeito do intervalo — então CADA RENDER dava clearInterval + setInterval e a
   * contagem para os 45s recomeçava do zero. Numa tela que redesenha mais rápido
   * que o intervalo (o inbox redesenha a cada mensagem, scroll e foco), a
   * verificação era adiada para sempre: a rede existia, montava, e nunca checava.
   *
   * Aqui a tela redesenha a cada 5s e o tempo total passa dos 45s. Antes do
   * conserto, `refetchQueries` não era chamado nenhuma vez.
   */
  it("o intervalo sobrevive ao redesenho constante da tela", async () => {
    const refetch = vi.spyOn(qc, "refetchQueries").mockResolvedValue(undefined);

    const { rerender } = renderHook(
      () => {
        const ultimaEntrega = useRef<number | null>(null);
        return useRefetchDeSeguranca<unknown>({
          // Literal recriado a cada render — o cenário real, não um artifício.
          queryKey: ["messages", CONV],
          assinatura: () => "estavel",
          ultimaEntrega,
          intervaloMs: 45_000,
        });
      },
      { wrapper },
    );

    for (let i = 0; i < 10; i++) {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(5_000);
      });
      rerender();
    }

    expect(refetch).toHaveBeenCalled();
  });
});
