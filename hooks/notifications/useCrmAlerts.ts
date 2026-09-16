"use client";

import { useCallback, useRef } from "react";

import { useActiveOrg, useUser } from "@/hooks/auth/AuthProvider";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import { entregarAviso } from "@/lib/notifications/deliver";
import { mencaoAtingeUsuario } from "@/lib/notifications/mentions";

function str(v: unknown): string | null {
  return typeof v === "string" && v.length > 0 ? v : null;
}

function sides(payload: unknown): {
  novo: Record<string, unknown> | null;
  antigo: Record<string, unknown> | null;
} {
  if (!payload || typeof payload !== "object") return { novo: null, antigo: null };
  const p = payload as { new?: unknown; old?: unknown; payload?: { new?: unknown; old?: unknown } };
  const novoRaw = p.new ?? p.payload?.new;
  const antigoRaw = p.old ?? p.payload?.old;
  return {
    novo: novoRaw && typeof novoRaw === "object" && !Array.isArray(novoRaw) ? (novoRaw as Record<string, unknown>) : null,
    antigo:
      antigoRaw && typeof antigoRaw === "object" && !Array.isArray(antigoRaw)
        ? (antigoRaw as Record<string, unknown>)
        : null,
  };
}

export interface AvisoDeLead {
  category: "lead_assigned" | "lead_won" | "lead_lost";
  kind: "lead_assigned" | "lead_won" | "lead_lost";
  title: string;
  body: string;
  tag: string;
  href: string;
}

/**
 * A DECISÃO, pura — separada do canal para ser testável sem montar
 * `useRealtimeChannel`, mock de auth nem `entregarAviso`.
 *
 * `vistoAntes` vem do MAPA DO CLIENTE (o que este canal já observou para este
 * lead), nunca do `old` do payload — ver o comentário grande no hook sobre por
 * que `old` só carrega o `id` nesta tabela. `undefined` = "nunca vi este lead
 * nesta sessão", e por isso nenhum aviso dispara: não há "antes" para dizer
 * que algo mudou.
 */
export function avisosDeAtualizacaoDeLead(input: {
  leadId: string;
  title: string;
  href: string;
  owner: string | null;
  status: string | null;
  vistoAntes: { owner: string | null; status: string | null } | undefined;
  meuUserId: string;
}): AvisoDeLead[] {
  const { leadId, title, href, owner, status, vistoAntes, meuUserId } = input;
  if (!vistoAntes) return [];

  const avisos: AvisoDeLead[] = [];
  if (owner && owner === meuUserId && owner !== vistoAntes.owner) {
    avisos.push({
      category: "lead_assigned",
      kind: "lead_assigned",
      title: "Lead atribuído a você",
      body: title,
      tag: leadId,
      href,
    });
  }
  if (owner === meuUserId && status === "won" && vistoAntes.status !== "won") {
    avisos.push({
      category: "lead_won",
      kind: "lead_won",
      title: "Lead ganho",
      body: title,
      tag: leadId,
      href,
    });
  }
  if (owner === meuUserId && status === "lost" && vistoAntes.status !== "lost") {
    avisos.push({
      category: "lead_lost",
      kind: "lead_lost",
      title: "Lead perdido",
      body: title,
      tag: leadId,
      href,
    });
  }
  return avisos;
}

export function useCrmAlerts(): void {
  const orgId = useActiveOrg()?.orgId ?? null;
  const user = useUser();

  /**
   * O "antes" que `payload.old` PROMETE e não entrega.
   *
   * `crm_leads` não tem `replica identity full` (decisão da migration 0183: sem
   * assinante que precisasse, ligar `full` só engordaria o WAL de toda escrita
   * da tabela). Com o padrão (PK), o `old` de um UPDATE só carrega o `id` — todo
   * outro campo, incluindo `owner_user_id` e `status`, chega `undefined`.
   *
   * O código anterior lia `antigo?.owner_user_id` como se fosse o dono de
   * ANTES, e como ele é sempre `undefined`, `owner !== ownerAntes` era
   * VERDADEIRO em toda edição de um lead que já é meu — não só numa
   * reatribuição. Resultado medido: editar título/descrição/data de um lead
   * MEU disparava "Lead atribuído a você" (e o mesmo defeito valia para
   * "ganho"/"perdido" contra `status`).
   *
   * O conserto mora no CONSUMIDOR, como o comentário da 0183 já previa ("a
   * decisão de como a tela lida... é de quem escrever o hook"): guardar aqui,
   * do lado do cliente, o último valor que ESTE canal já viu para cada lead, e
   * só notificar quando o valor novo diverge do que foi visto antes — nunca do
   * que o payload finge ter visto. O preço é não notificar a PRIMEIRA vez que
   * um lead aparece na sessão (não há "antes" para comparar) — falso negativo
   * raro, e muito mais barato que o falso positivo em toda edição.
   */
  const ownerVistoPorLead = useRef<Map<string, string | null>>(new Map());
  const statusVistoPorLead = useRef<Map<string, string | null>>(new Map());

  const onLead = useCallback(
    (payload: unknown) => {
      const { novo } = sides(payload);
      if (!novo) return;
      const leadId = str(novo.id);
      if (!leadId) return;
      const title = str(novo.title) || "Lead";
      const pipelineId = str(novo.pipeline_id);
      const href = pipelineId ? `/app/pipelines/${pipelineId}` : "/app/kanban";
      const owner = str(novo.owner_user_id);
      const status = str(novo.status);

      const vistoAntes = ownerVistoPorLead.current.has(leadId)
        ? { owner: ownerVistoPorLead.current.get(leadId) ?? null, status: statusVistoPorLead.current.get(leadId) ?? null }
        : undefined;

      for (const aviso of avisosDeAtualizacaoDeLead({
        leadId,
        title,
        href,
        owner,
        status,
        vistoAntes,
        meuUserId: user.id,
      })) {
        entregarAviso(aviso);
      }

      ownerVistoPorLead.current.set(leadId, owner);
      statusVistoPorLead.current.set(leadId, status);
    },
    [user.id],
  );

  const onNote = useCallback(
    (payload: unknown) => {
      const { novo } = sides(payload);
      if (!novo) return;
      const author = str(novo.created_by_user_id);
      if (author === user.id) return;
      const body = str(novo.body) ?? "";
      if (
        !mencaoAtingeUsuario(body, {
          id: user.id,
          email: user.email,
          full_name: user.full_name,
        })
      ) {
        return;
      }
      const conversationId = str(novo.conversation_id);
      entregarAviso({
        category: "mention",
        kind: "mention",
        title: "Você foi mencionado",
        body,
        tag: conversationId ?? undefined,
        href: conversationId ? `/app/inbox?id=${conversationId}` : "/app/inbox",
      });
    },
    [user.id, user.email, user.full_name],
  );

  useRealtimeChannel({
    name: orgId ? `alerts-leads-${orgId}` : "alerts-leads-disabled",
    postgresChanges: orgId
      ? {
          event: "UPDATE",
          schema: "public",
          table: "crm_leads",
          filter: `organization_id=eq.${orgId}`,
        }
      : undefined,
    onChange: onLead,
    enabled: !!orgId,
  });

  useRealtimeChannel({
    name: orgId ? `alerts-notes-${orgId}` : "alerts-notes-disabled",
    postgresChanges: orgId
      ? {
          event: "INSERT",
          schema: "public",
          table: "conversation_notes",
          filter: `organization_id=eq.${orgId}`,
        }
      : undefined,
    onChange: onNote,
    enabled: !!orgId,
  });
}
