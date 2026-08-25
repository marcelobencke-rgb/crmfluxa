"use client";
import { useInfiniteQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useCallback } from "react";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { useRefetchDeSeguranca } from "@/hooks/realtime/useRefetchDeSeguranca";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Conversation } from "@/lib/types/messaging";

export interface ContactSummary {
  id: string;
  display_name: string | null;
  name: string | null;
  phone_number: string | null;
  tags: string[];
  is_blocked: boolean;
  is_anonymized: boolean;
  /** Caminho da foto no bucket privado. A tela nunca usa este valor como src —
   *  só para saber SE existe foto; a imagem vem de /api/v1/contacts/{id}/avatar,
   *  que assina a URL. Opcional: conversas em cache de antes do campo existir. */
  avatar_storage_path?: string | null;
  /**
   * A trava irrevogável pelo agente: ligada, NENHUM envio automático sai (o
   * guard de before-send lê esta coluna). É o sinal mais honesto de "a pessoa
   * está no comando desta conversa" — e o que decide se o botão de devolver o
   * atendimento aparece. Opcional: conversas em cache de antes do campo existir.
   */
  force_human?: boolean | null;
}

export type ConversationWithContact = Conversation & {
  contacts?: ContactSummary | null;
};

export interface ConversationsFilters {
  status?: "open" | "claimed" | "ai_handling" | "closed" | "archived";
  /** Esconde fechadas/arquivadas — ver `exclude_finished` no schema da rota. */
  exclude_finished?: boolean;
  assigned_to?: "me" | "unassigned" | string;
  search?: string;
  channel_session_id?: string;
  tag?: string;
  is_snoozed?: boolean;
}

interface ListResponse {
  data: ConversationWithContact[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

export function useConversationsRealtime(
  filters: ConversationsFilters,
  orgId: string | null,
) {
  const qc = useQueryClient();
  const queryKey = ["conversations", filters] as const;

  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      const qs = new URLSearchParams();
      if (filters.status) qs.set("status", filters.status);
      if (filters.exclude_finished) qs.set("exclude_finished", "true");
      if (filters.assigned_to) qs.set("assigned_to", filters.assigned_to);
      if (filters.search) qs.set("search", filters.search);
      if (filters.channel_session_id) qs.set("channel_session_id", filters.channel_session_id);
      if (filters.tag) qs.set("tag", filters.tag);
      if (filters.is_snoozed === true) qs.set("is_snoozed", "true");
      else if (filters.is_snoozed === false) qs.set("is_snoozed", "false");
      if (pageParam) qs.set("cursor", pageParam);
      qs.set("limit", "50");
      try {
        return await apiClient.get<ListResponse>(`/api/v1/conversations?${qs.toString()}`);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    getNextPageParam: (last) =>
      last.meta?.has_more && last.meta.cursor ? last.meta.cursor : undefined,
  });

  const onChange = useCallback(() => {
    qc.invalidateQueries({ queryKey: ["conversations"] });
  }, [qc]);

  // G4-01 (visibility_mode): a subscription postgres_changes HERDA a RLS de
  // SELECT de `conversations` — o Supabase Realtime avalia as policies do usuário
  // autenticado antes de entregar cada change (docs: "Realtime respects RLS
  // policies"). Como a policy `conversations_select` (migration 0035) aplica
  // fn_can_view_conversation(role + visibility_mode + assigned_to), um agent NÃO
  // recebe changes de conversa fora do seu escopo, mesmo com o filtro amplo
  // `organization_id=eq.<org>` abaixo. Prova do filtro em
  // tests/invariants/gov-5-visibility-scope.test.ts (SELECT sob role agent = 0 rows
  // para conversa de outro atendente — o mesmo SELECT que o Realtime executa).
  //
  // ⚠️ CORREÇÃO DE UM COMENTÁRIO QUE ERA FALSO (2026-08-25). A versão anterior
  // desta nota afirmava que a publication `supabase_realtime` E a REPLICA
  // IDENTITY estavam "já configurados na migration 0025". Metade é verdade e
  // metade custou horas:
  //
  //   • A publication existe mesmo — `supabase/baseline.sql` adiciona messages,
  //     conversations, crm_leads, ai_agents, ai_agent_runs, ai_knowledge_sources
  //     e crm_lead_activities. (A 0025 acrescenta só as três de IA.)
  //   • REPLICA IDENTITY **nunca foi configurada em lugar nenhum** — não há uma
  //     única ocorrência de `replica identity` no baseline nem em nenhuma
  //     migration. As tabelas estão no DEFAULT (só a chave primária no registro
  //     `old`).
  //
  // Isso não é pedantismo, tem consequência concreta: com REPLICA IDENTITY
  // DEFAULT, um evento de **DELETE** carrega apenas a PK em `old`, então uma
  // subscription filtrada por coluna que não seja a PK (como o
  // `conversation_id=eq.<id>` de useMessagesRealtime) não consegue casar o
  // filtro e o evento **não é entregue**. INSERT e UPDATE não sofrem: o
  // registro `new` vem completo e o filtro casa normalmente — que é o caminho
  // do inbox e o que sustenta a entrega em ~1-2s medida em produção.
  //
  // Ou seja: o tratamento de DELETE em `aplicarEvento` (useMessagesRealtime)
  // provavelmente nunca é exercitado hoje. Ele fica porque é barato e correto
  // se a REPLICA IDENTITY mudar; o que NÃO se pode fazer é confiar nele como
  // se a entrega estivesse garantida. Quem for depender de DELETE via realtime
  // precisa ANTES adicionar `alter table ... replica identity full` numa
  // migration + apêndice do baseline — e pesar o custo de WAL que isso traz
  // numa tabela do volume de `messages`.
  // O retorno não é descartado: `ultimaEntrega` alimenta a rede de segurança
  // abaixo, e sem ele ela não consegue distinguir "nada aconteceu" de "o canal
  // parou de entregar".
  const { status: realtimeStatus, ultimaEntrega } = useRealtimeChannel({
    name: orgId ? `inbox-${orgId}` : "inbox-disabled",
    postgresChanges: orgId
      ? {
          event: "*",
          schema: "public",
          table: "conversations",
          filter: `organization_id=eq.${orgId}`,
        }
      : undefined,
    onChange,
    enabled: !!orgId,
  });

  /**
   * Mesma rede de segurança da thread, pelo mesmo motivo: canal SUBSCRIBED que
   * para de entregar deixa a LISTA congelada — conversa nova não aparece e o
   * contador de não-lidas não anda, sem nenhum sinal de erro.
   *
   * A assinatura é contagem + o `last_message_at` mais recente: é o que muda
   * quando chega mensagem em qualquer conversa, que é justamente o evento que
   * o canal deveria ter entregue.
   */
  const seguranca = useRefetchDeSeguranca<InfiniteData<ListResponse>>({
    queryKey,
    assinatura: (d) => {
      let total = 0;
      let maior = "";
      for (const p of d?.pages ?? []) {
        total += p.data.length;
        for (const c of p.data) {
          const t = c.last_message_at ?? "";
          if (t > maior) maior = t;
        }
      }
      return `${total}:${maior}`;
    },
    ultimaEntrega,
    enabled: !!orgId,
  });

  return { ...query, realtimeStatus, seguranca };
}
