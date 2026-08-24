"use client";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { useRefetchDeSeguranca } from "@/hooks/realtime/useRefetchDeSeguranca";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Message } from "@/lib/types/messaging";

interface MessagesResponse {
  data: Message[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

type Paginas = InfiniteData<MessagesResponse>;

/**
 * O que o postgres_changes entrega, na forma que interessa aqui.
 *
 * `new` vem completo para INSERT e UPDATE, e a rota de listagem seleciona
 * colunas cruas (`MSG_COLS` em `app/api/v1/messages/_handler.ts:106`) sem
 * derivar nada — então a linha do evento tem a MESMA forma que a linha da
 * API, e pode entrar no cache direto. Se um dia a rota passar a derivar
 * campo (URL assinada de mídia, por exemplo), esta igualdade quebra e o
 * merge abaixo precisa voltar a invalidar para os casos derivados.
 */
function linhaDoEvento(payload: unknown): { tipo: string; nova: Message | null; velhoId: string | null } {
  if (!payload || typeof payload !== "object") return { tipo: "", nova: null, velhoId: null };
  const p = payload as { eventType?: string; new?: unknown; old?: { id?: unknown } };
  const nova =
    p.new && typeof p.new === "object" && typeof (p.new as { id?: unknown }).id === "string"
      ? (p.new as Message)
      : null;
  const velhoId = typeof p.old?.id === "string" ? p.old.id : null;
  return { tipo: p.eventType ?? "", nova, velhoId };
}

/**
 * Escreve a mensagem do evento no cache, sem ida à rede.
 *
 * ⚠️ A DEDUPLICAÇÃO TEM DOIS ALVOS DIFERENTES, e tratar só um deixa bolha
 * duplicada na tela:
 *
 *   1. **A mesma linha chegando de novo** (UPDATE de status/ack, ou o INSERT
 *      reentregue): casa por `id` e SUBSTITUI onde já estava.
 *   2. **O gêmeo otimista** (`metadata._optimistic`, criado em
 *      `useSendMessage.onMutate` com id `temp-…`): a linha real que volta pelo
 *      realtime tem id de verdade, então o casamento por `id` NÃO o encontra —
 *      ele sobreviveria ao lado da mensagem real. Casa por conteúdo (mesma
 *      direção e mesmo corpo) e remove UM, não todos: quem manda o mesmo texto
 *      duas vezes seguidas tem dois otimistas legítimos esperando, e apagar os
 *      dois no primeiro retorno sumiria com uma mensagem que ainda está em voo.
 */
function aplicarEvento(atual: Paginas | undefined, tipo: string, nova: Message | null, velhoId: string | null): Paginas | undefined {
  if (!atual) return atual;

  if (tipo === "DELETE") {
    if (!velhoId) return atual;
    return {
      ...atual,
      pages: atual.pages.map((p) => ({ ...p, data: p.data.filter((m) => m.id !== velhoId) })),
    };
  }

  if (!nova) return atual;

  let substituiu = false;
  let pages = atual.pages.map((p) => ({
    ...p,
    data: p.data.map((m) => {
      if (m.id !== nova.id) return m;
      substituiu = true;
      return nova;
    }),
  }));

  if (substituiu) return { ...atual, pages };

  // Não estava no cache: é mensagem nova. Antes de inserir, o gêmeo otimista
  // sai — um só (ver o bloco de doutrina acima).
  if (nova.direction === "outbound") {
    let jaRemoveu = false;
    pages = pages.map((p) => {
      if (jaRemoveu) return p;
      const idx = p.data.findIndex(
        (m) =>
          (m.metadata as { _optimistic?: boolean } | null)?._optimistic === true &&
          m.direction === "outbound" &&
          (m.body ?? "") === (nova.body ?? ""),
      );
      if (idx === -1) return p;
      jaRemoveu = true;
      return { ...p, data: p.data.filter((_, i) => i !== idx) };
    });
  }

  // Entra na página 0, que é a das mensagens MAIS NOVAS (a listagem busca
  // `sent_at` desc e pagina para trás — ver o comentário em
  // `listMessagesHandler`). A posição visual não depende disto: `ChatThread`
  // achata todas as páginas e ordena por `sent_at` em `mergeThreadItems`.
  const primeira = pages[0];
  if (!primeira) return { ...atual, pages };
  const comNova = [...pages];
  comNova[0] = { ...primeira, data: [...primeira.data, nova] };
  return { ...atual, pages: comNova };
}

export function useMessagesRealtime(conversationId: string | null) {
  const qc = useQueryClient();
  const queryKey = ["messages", conversationId] as const;

  const query = useInfiniteQuery({
    queryKey,
    enabled: !!conversationId,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!conversationId) {
        return { data: [], meta: { has_more: false, cursor: null } } as MessagesResponse;
      }
      const qs = new URLSearchParams();
      if (pageParam) qs.set("cursor", pageParam);
      qs.set("limit", "50");
      try {
        return await apiClient.get<MessagesResponse>(
          `/api/v1/conversations/${conversationId}/messages?${qs.toString()}`,
        );
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    getNextPageParam: (last) =>
      last.meta?.has_more && last.meta.cursor ? last.meta.cursor : undefined,
  });

  /**
   * ESCREVE O DADO, não invalida.
   *
   * A versão anterior chamava `invalidateQueries(["messages", id])` a cada
   * evento. Isso custava uma ida à rede POR MENSAGEM RECEBIDA só para buscar o
   * que o próprio evento já trazia no bolso — e, sendo `useInfiniteQuery`, o
   * invalidate refaz TODAS as páginas já carregadas: quem tinha rolado cinco
   * páginas de histórico pagava cinco requisições a cada mensagem que chegava.
   * A mensagem aparecia depois do round-trip, não na hora.
   *
   * `["conversations"]` continua sendo invalidada: é outra query (a lista da
   * esquerda, com prévia e contador), o payload daqui não a serve, e ela é
   * barata.
   */
  const onChange = useCallback(
    (payload: unknown) => {
      const { tipo, nova, velhoId } = linhaDoEvento(payload);
      if (conversationId && (nova || velhoId)) {
        qc.setQueryData<Paginas>(["messages", conversationId], (atual) =>
          aplicarEvento(atual, tipo, nova, velhoId),
        );
      } else if (conversationId) {
        // Payload que não deu para ler (forma inesperada): cai no comportamento
        // antigo em vez de engolir o evento — perder mensagem é pior que uma
        // ida extra à rede.
        qc.invalidateQueries({ queryKey: ["messages", conversationId] });
      }
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
    [qc, conversationId],
  );

  // O RETORNO NÃO PODE SER DESCARTADO — era o defeito. `useRealtimeChannel` já
  // calculava `ultimaEntrega` (o carimbo da última entrega do canal) e o
  // `status`, e a chamada de antes jogava os dois fora na mesma linha. Sem
  // `ultimaEntrega` não existe rede de segurança: ela é o único sinal que
  // separa "o canal está entregando e nada aconteceu" de "o canal morreu
  // calado".
  const { status: realtimeStatus, ultimaEntrega } = useRealtimeChannel({
    name: conversationId ? `messages-${conversationId}` : "messages-disabled",
    postgresChanges: conversationId
      ? {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${conversationId}`,
        }
      : undefined,
    onChange,
    enabled: !!conversationId,
  });

  /**
   * A REDE DE SEGURANÇA — é ela que fecha o bug relatado.
   *
   * O canal responde SUBSCRIBED e pode parar de entregar sem erro nenhum
   * (morte silenciosa, documentada em `useRealtimeChannel`). Nesse estado o
   * inbox não tinha plano B: `refetchOnWindowFocus` está desligado global
   * (`lib/query/client.ts`) e não havia intervalo — a thread congelava num
   * passado com cara de presente até o atendente trocar de conversa, o que
   * muda a `queryKey` e força uma busca de verdade. Era exatamente o "só
   * aparece se eu sair e abrir de novo".
   *
   * A assinatura é contagem + o `sent_at` mais recente: sensível a mensagem
   * nova, que é o que o canal deveria ter trazido, e barata de recalcular.
   */
  const seguranca = useRefetchDeSeguranca<Paginas>({
    queryKey,
    assinatura: (d) => {
      let total = 0;
      let maior = "";
      for (const p of d?.pages ?? []) {
        total += p.data.length;
        for (const m of p.data) {
          if (m.sent_at > maior) maior = m.sent_at;
        }
      }
      return `${total}:${maior}`;
    },
    ultimaEntrega,
    enabled: !!conversationId,
  });

  // Espalha em objeto novo (mesmo padrão de `useBoard`) em vez de mutar o
  // resultado do React Query: aquele objeto é reusado pelo observer e escrever
  // nele vaza estado para fora deste hook.
  return { ...query, realtimeStatus, seguranca };
}
