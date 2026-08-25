import { QueryClientProvider, type InfiniteData } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { makeQueryClient } from "@/lib/query/client";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

/**
 * O INDICADOR DE NÃO-LIDA QUE NÃO APAGAVA.
 *
 * Relatado em 2026-08-25: com a conversa aberta, a lista da esquerda continuava
 * marcando não-lida. Só sumia com F5 ou trocando de conversa e voltando — que é
 * a assinatura de "o banco está certo, a tela é que não foi avisada".
 *
 * E era exatamente isso: `POST /mark-read` zera
 * `conversations.unread_count_for_assignee` no banco, mas o hook não tocava no
 * cache. O comentário da versão anterior explicava a aposta — "wait for the
 * realtime event to trigger the update on the conversations list" — e ela não
 * se paga: quem fez a escrita não deveria depender de um canal para saber de
 * uma mudança que ele mesmo causou.
 */

const h = vi.hoisted(() => ({ post: vi.fn() }));
vi.mock("@/lib/api/client", () => ({ apiClient: { post: (u: string, b: unknown) => h.post(u, b) } }));

import { useMarkAsRead } from "@/hooks/inbox/useMarkAsRead";

const CONV = "3aabb300-e7bc-4acd-baa4-d8bf7ceb9203";
const OUTRA = "99999999-9999-4999-8999-999999999999";

function conversa(id: string, naoLidas: number): ConversationWithContact {
  return {
    id,
    unread_count_for_assignee: naoLidas,
    status: "open",
    last_message_at: "2026-08-25T10:00:00.000Z",
  } as unknown as ConversationWithContact;
}

let qc: ReturnType<typeof makeQueryClient>;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

/** Semeia DUAS listas com filtros diferentes — o inbox mantém várias vivas. */
function semear() {
  const pagina = (cs: ConversationWithContact[]) => ({
    pages: [{ data: cs, meta: { has_more: false, cursor: null } }],
    pageParams: [undefined],
  });
  qc.setQueryData(["conversations", { assigned_to: "unassigned" }], pagina([conversa(CONV, 3), conversa(OUTRA, 1)]));
  qc.setQueryData(["conversations", { assigned_to: "me" }], pagina([conversa(CONV, 3)]));
}

function naoLidasEm(filtros: unknown, id: string): number | undefined {
  const d = qc.getQueryData<InfiniteData<{ data: ConversationWithContact[] }>>(["conversations", filtros]);
  return (d?.pages ?? []).flatMap((p) => p.data).find((c) => c.id === id)?.unread_count_for_assignee;
}

beforeEach(() => {
  h.post.mockReset().mockResolvedValue({ success: true });
  qc = makeQueryClient();
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
});
afterEach(() => vi.useRealTimers());

describe("abrir a conversa apaga o indicador na lista", () => {
  it("zera as não-lidas no cache, em TODAS as listas carregadas", async () => {
    semear();
    renderHook(() => useMarkAsRead(CONV, "msg-1"), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });

    expect(h.post).toHaveBeenCalledWith(`/api/v1/conversations/${CONV}/mark-read`, {});
    // A aba visível e a que está em outra guia — as duas.
    expect(naoLidasEm({ assigned_to: "unassigned" }, CONV)).toBe(0);
    expect(naoLidasEm({ assigned_to: "me" }, CONV)).toBe(0);
  });

  it("não encosta nas OUTRAS conversas", async () => {
    semear();
    renderHook(() => useMarkAsRead(CONV, "msg-1"), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    expect(naoLidasEm({ assigned_to: "unassigned" }, OUTRA)).toBe(1);
  });

  it("espera 1,5s — passar o olho pela lista não zera nada", async () => {
    semear();
    renderHook(() => useMarkAsRead(CONV, "msg-1"), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(800);
    });
    expect(h.post).not.toHaveBeenCalled();
    expect(naoLidasEm({ assigned_to: "unassigned" }, CONV)).toBe(3);
  });
});

describe("mensagem nova com a conversa aberta", () => {
  it("remarca como lida — o contador é reincrementado pela ingestão", async () => {
    semear();
    const { rerender } = renderHook(({ sinal }) => useMarkAsRead(CONV, sinal), {
      wrapper,
      initialProps: { sinal: "msg-1" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    expect(h.post).toHaveBeenCalledTimes(1);

    // Chega mensagem nova: a ingestão sobe unread para 1 de novo
    // (fn_mark_conversation_message incrementa a cada inbound).
    qc.setQueryData<InfiniteData<{ data: ConversationWithContact[] }>>(
      ["conversations", { assigned_to: "unassigned" }],
      (a) => ({
        ...a!,
        pages: a!.pages.map((p) => ({
          ...p,
          data: p.data.map((c) => (c.id === CONV ? { ...c, unread_count_for_assignee: 1 } : c)),
        })),
      }),
    );
    rerender({ sinal: "msg-2" });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });

    expect(h.post).toHaveBeenCalledTimes(2);
    expect(naoLidasEm({ assigned_to: "unassigned" }, CONV)).toBe(0);
  });
});

describe("aba oculta NÃO marca como lida", () => {
  it("mensagem que chega com o CRM em segundo plano continua não-lida", async () => {
    // Numa ferramenta de atendimento, apagar o aviso de algo que ninguém viu é
    // pior que o defeito original. Preferência confirmada com o dono.
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    semear();
    renderHook(() => useMarkAsRead(CONV, "msg-1"), { wrapper });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });

    expect(h.post).not.toHaveBeenCalled();
    expect(naoLidasEm({ assigned_to: "unassigned" }, CONV)).toBe(3);
  });

  it("ao VOLTAR para a aba, marca o que agora está sendo visto", async () => {
    Object.defineProperty(document, "visibilityState", { value: "hidden", configurable: true });
    semear();
    renderHook(() => useMarkAsRead(CONV, "msg-1"), { wrapper });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_600);
    });
    expect(h.post).not.toHaveBeenCalled();

    Object.defineProperty(document, "visibilityState", { value: "visible", configurable: true });
    await act(async () => {
      document.dispatchEvent(new Event("visibilitychange"));
      await vi.advanceTimersByTimeAsync(10);
    });

    expect(h.post).toHaveBeenCalledTimes(1);
    expect(naoLidasEm({ assigned_to: "unassigned" }, CONV)).toBe(0);
  });
});
