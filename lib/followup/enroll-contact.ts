/**
 * Insert idempotente de um enrollment de follow-up — núcleo compartilhado
 * entre `silence-sweep.ts` (Task 8.1) e o gatilho de mudança de etapa
 * (`stage-trigger.ts`). Cada consumidor já resolveu `agent_id` (gate,
 * `resolveAgentForAutomaticTrigger`) e `triggerNodeId` (nó `trigger` do grafo
 * pinado) antes de chamar — os dois variam por caller (silence amortiza os 2
 * por pointer pra N contatos; stage_change resolve 1x por evento), então
 * ficam de fora daqui. O que sempre se repetiria — e por isso mora aqui — é
 * só a forma do insert e o 23505→skip silencioso (índice único org-wide da
 * migration 0062: 1 follow-up vivo por contato).
 */
export interface EnrollContactDb {
  insertEnrollment(input: {
    organization_id: string;
    pointer_id: string;
    version_id: string;
    contact_id: string;
    current_node_id: string;
    next_eval_at: string;
    agent_id: string | null;
  }): Promise<{ inserted: boolean }>;
}

export interface EnrollContactInput {
  organizationId: string;
  pointerId: string;
  versionId: string;
  contactId: string;
  triggerNodeId: string;
  agentId: string;
  nextEvalAt: string;
}

export type EnrollContactResult = { inserted: true } | { inserted: false; reason: "already_live" };

export async function enrollContactIntoPointer(
  db: EnrollContactDb,
  input: EnrollContactInput,
): Promise<EnrollContactResult> {
  const { inserted } = await db.insertEnrollment({
    organization_id: input.organizationId,
    pointer_id: input.pointerId,
    version_id: input.versionId,
    contact_id: input.contactId,
    current_node_id: input.triggerNodeId,
    next_eval_at: input.nextEvalAt,
    agent_id: input.agentId,
  });
  return inserted ? { inserted: true } : { inserted: false, reason: "already_live" };
}
