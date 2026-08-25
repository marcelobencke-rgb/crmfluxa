"use client";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect, useRef } from "react";

import { apiClient } from "@/lib/api/client";
import type { ConversationWithContact } from "@/hooks/inbox/useConversationsRealtime";

interface ListaDeConversas {
  data: ConversationWithContact[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

/**
 * Zera o contador de não-lidas NO CACHE, em todas as listas carregadas.
 *
 * ═══ O DEFEITO QUE ISTO CONSERTA (relatado em 2026-08-25) ═══
 *
 * Com a conversa aberta, o indicador de não-lida continuava aceso na lista da
 * esquerda — e só sumia com F5 ou trocando de conversa e voltando.
 *
 * O `POST /mark-read` sempre funcionou: ele zera
 * `conversations.unread_count_for_assignee` e o banco fica correto (é por isso
 * que recarregar resolvia). O que faltava era avisar a TELA. A versão anterior
 * deste hook não invalidava nada e explicava a escolha assim:
 *
 *     "we can also just wait for the realtime event to trigger the update on
 *      the conversations list"
 *
 * A aposta era que o UPDATE em `conversations` voltaria pelo postgres_changes e
 * o `onChange` de `useConversationsRealtime` invalidaria a lista. Na prática não
 * se paga, e o motivo importa: **o próprio cliente que fez a escrita não deveria
 * depender de um canal para saber de uma mudança que ele mesmo causou.** Ele já
 * sabe o resultado — a conversa foi lida, o contador é zero. Ir buscar essa
 * informação de volta pela rede (ou esperar que ela chegue) é ao mesmo tempo
 * mais lento e mais frágil que escrevê-la.
 *
 * Por isso aqui é escrita direta no cache, e não `invalidateQueries`: não custa
 * round-trip nenhum, é instantânea, e funciona mesmo com o canal mudo. O evento
 * do realtime, quando chegar, só vai confirmar o que a tela já mostra.
 *
 * `setQueriesData` (plural) e não `setQueryData`: a lista é uma query POR
 * CONJUNTO DE FILTROS (`["conversations", filters]`), e o inbox mantém várias
 * vivas ao mesmo tempo — Fila, Minhas, Todos, IA. Zerar só a que está à vista
 * deixaria o indicador aceso nas outras abas, que é o mesmo defeito com menos
 * passos para reproduzir.
 */
function zerarNaoLidasNoCache(
  qc: ReturnType<typeof useQueryClient>,
  conversationId: string,
): void {
  qc.setQueriesData<InfiniteData<ListaDeConversas>>(
    { queryKey: ["conversations"] },
    (atual) => {
      if (!atual) return atual;
      let mudou = false;
      const pages = atual.pages.map((p) => ({
        ...p,
        data: p.data.map((c) => {
          if (c.id !== conversationId || (c.unread_count_for_assignee ?? 0) === 0) return c;
          mudou = true;
          return { ...c, unread_count_for_assignee: 0 };
        }),
      }));
      // Sem mudança, devolve a referência ORIGINAL: um objeto novo faria o
      // React Query notificar os assinantes e a lista redesenhar à toa a cada
      // conversa aberta.
      return mudou ? { ...atual, pages } : atual;
    },
  );
}

/**
 * @param sinalDeMensagemNova algo que MUDA quando chega mensagem nova na
 *   conversa aberta (o id da última inbound serve). Sem isto, o hook marcava
 *   como lida UMA única vez por abertura — e como a ingestão INCREMENTA
 *   `unread_count_for_assignee` a cada inbound (`fn_mark_conversation_message`,
 *   baseline.sql:4230), a primeira mensagem que chegasse com a conversa aberta
 *   reacendia o indicador para sempre. Antes isso passava despercebido porque a
 *   lista não se atualizava sozinha; com o realtime entregando, ficou visível.
 */
export function useMarkAsRead(conversationId: string | null, sinalDeMensagemNova?: string | null) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: string) =>
      apiClient.post<{ success: boolean }>(`/api/v1/conversations/${id}/mark-read`, {}),
    onMutate: async (id) => {
      // Cancela refetch em voo ANTES de escrever: uma resposta em trânsito,
      // pedida antes do mark-read, traria o contador antigo e sobrescreveria a
      // escrita abaixo — o indicador voltaria a acender sozinho.
      await qc.cancelQueries({ queryKey: ["conversations"] });
      zerarNaoLidasNoCache(qc, id);
    },
    onError: () => {
      // A escrita otimista descreve algo que não aconteceu: relê o servidor em
      // vez de deixar a tela mentindo que está tudo lido.
      void qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // A mutation muda de identidade a cada render; guardá-la numa ref deixa o
  // efeito abaixo depender só do que importa (a conversa aberta).
  const mutateRef = useRef(mutation.mutate);
  useEffect(() => {
    mutateRef.current = mutation.mutate;
  }, [mutation.mutate]);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!conversationId) return;

    /**
     * SÓ MARCA COMO LIDA SE A ABA ESTIVER VISÍVEL.
     *
     * Sem esta guarda, o hook passaria a marcar como lida toda mensagem que
     * chegasse com a conversa aberta — inclusive com o CRM em segundo plano,
     * enquanto ninguém olha. Numa ferramenta de atendimento isso é pior que o
     * defeito original: some o aviso de algo que o atendente nunca viu.
     *
     * Preferência confirmada com o dono em 2026-08-25: mensagem que chega com
     * a aba oculta continua não-lida.
     */
    const tentarMarcar = () => {
      if (document.visibilityState !== "visible") return;
      mutateRef.current(conversationId);
    };

    // Debounce: só marca como lida depois de 1,5s olhando a conversa — passar
    // o olho por uma lista de conversas não deve zerar todas elas.
    timerRef.current = setTimeout(tentarMarcar, 1500);

    // Ao VOLTAR para a aba, tenta de novo: o que chegou enquanto ela estava
    // oculta ficou (corretamente) não-lido, e agora está sendo visto.
    const aoVoltar = () => {
      if (document.visibilityState === "visible") tentarMarcar();
    };
    document.addEventListener("visibilitychange", aoVoltar);

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", aoVoltar);
    };
  }, [conversationId, sinalDeMensagemNova]);
}
