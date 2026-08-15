/**
 * Gatilho de MUDANÇA DE ETAPA — event-driven, ao contrário do silêncio (que é
 * AUSÊNCIA de evento e por isso vive em `silence-sweep.ts` como varredura
 * periódica; ver o comentário desse arquivo pra doutrina completa da divisão).
 * `lead.stage_changed` já é emitido em `event_log` com `entity_kind='crm_lead'`
 * por `app/api/v1/leads/_handler.ts` (`moveLeadHandler`) — o MESMO evento que
 * `lib/automation/engine.ts` consome pras regras QUANDO/SE/ENTÃO. Reusa o
 * dispatcher genérico (`lib/event-log/dispatcher.ts`), não um sweep novo.
 *
 * Guard de `entity_kind`: IGUAL ao do automation engine
 * (`EXPECTED_ENTITY_KIND`). O trigger legado de banco
 * `fn_emit_event_on_lead_change` também emite `lead.stage_changed`, mas com
 * `entity_kind='lead'` — sem o filtro, este handler reagiria 2x pela mesma
 * mudança (duas linhas de `event_log` pro mesmo evento de negócio).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow } from "@/lib/event-log/dispatcher";
import { flowGraphSchema } from "./graph-schema";
import { triggerConfigSchema } from "./api-schemas";
import { resolveAgentForAutomaticTrigger, type FollowupGateDb } from "./agent-followup-gate";
import { enrollContactIntoPointer, type EnrollContactDb } from "./enroll-contact";

const EXPECTED_ENTITY_KIND = "crm_lead";

export interface StagePointer {
  id: string;
  active_version_id: string;
  stage_id: string;
}

export interface StageTriggerDb extends EnrollContactDb {
  /** Pointers ATIVOS da org com `trigger_config.kind='stage_change'`. */
  loadActiveStagePointers(orgId: string): Promise<StagePointer[]>;
  /** `contact_id` do lead, ou `null` se o lead não existe/não é desta org. */
  loadLeadContactId(orgId: string, leadId: string): Promise<string | null>;
  /** id do nó `trigger` do grafo pinado da version; `null` se não existir. */
  loadTriggerNodeId(orgId: string, versionId: string): Promise<string | null>;
}

export interface StageTriggerSummary {
  /** `false` quando o evento nem era `lead.stage_changed` com o entity_kind certo. */
  matched: boolean;
  pointers_scanned: number;
  pointers_gated_out: number;
  enrolled: number;
  skipped_existing: number;
}

export interface StageTriggerDeps {
  db: StageTriggerDb;
  gateDb: FollowupGateDb;
  clock: () => Date;
}

const NOOP: StageTriggerSummary = {
  matched: false,
  pointers_scanned: 0,
  pointers_gated_out: 0,
  enrolled: 0,
  skipped_existing: 0,
};

export async function applyStageTriggerEvent(
  deps: StageTriggerDeps,
  row: EventRow,
): Promise<StageTriggerSummary> {
  if (row.event_type !== "lead.stage_changed") return NOOP;
  if (row.entity_kind !== EXPECTED_ENTITY_KIND) return NOOP; // dedupe contra o trigger legado

  const leadId = row.entity_id;
  const toStageId = typeof row.payload.to_stage_id === "string" ? row.payload.to_stage_id : null;
  if (!leadId || !toStageId) return NOOP;

  const { db, gateDb, clock } = deps;

  const pointers = await db.loadActiveStagePointers(row.organization_id);
  const matching = pointers.filter((p) => p.stage_id === toStageId);
  if (matching.length === 0) return NOOP;

  const contactId = await db.loadLeadContactId(row.organization_id, leadId);
  if (!contactId) {
    return { ...NOOP, matched: true, pointers_scanned: matching.length };
  }

  const summary: StageTriggerSummary = {
    matched: true,
    pointers_scanned: matching.length,
    pointers_gated_out: 0,
    enrolled: 0,
    skipped_existing: 0,
  };

  for (const pointer of matching) {
    const agentId = await resolveAgentForAutomaticTrigger(gateDb, row.organization_id, pointer.id);
    if (agentId === null) {
      summary.pointers_gated_out++;
      continue;
    }

    const triggerNodeId = await db.loadTriggerNodeId(row.organization_id, pointer.active_version_id);
    if (!triggerNodeId) continue;

    const result = await enrollContactIntoPointer(db, {
      organizationId: row.organization_id,
      pointerId: pointer.id,
      versionId: pointer.active_version_id,
      contactId,
      triggerNodeId,
      agentId,
      nextEvalAt: clock().toISOString(),
    });
    if (result.inserted) summary.enrolled++;
    else summary.skipped_existing++;
  }

  return summary;
}

/** Production adapter: `StageTriggerDb` sobre o client service-role real. */
export function createSupabaseStageTriggerDb(admin: SupabaseClient): StageTriggerDb {
  return {
    async loadActiveStagePointers(orgId) {
      const { data, error } = await admin
        .from("followup_flow_pointers")
        .select("id, active_version_id, trigger_config")
        .eq("organization_id", orgId)
        .eq("status", "active")
        .not("active_version_id", "is", null);
      if (error) throw new Error(error.message);

      const pointers: StagePointer[] = [];
      for (const row of (data ?? []) as Array<{
        id: string;
        active_version_id: string | null;
        trigger_config: unknown;
      }>) {
        if (!row.active_version_id) continue;
        const parsed = triggerConfigSchema.safeParse(row.trigger_config);
        if (!parsed.success || parsed.data.kind !== "stage_change") continue;
        pointers.push({
          id: row.id,
          active_version_id: row.active_version_id,
          stage_id: parsed.data.params.stage_id,
        });
      }
      return pointers;
    },

    async loadLeadContactId(orgId, leadId) {
      const { data, error } = await admin
        .from("crm_leads")
        .select("contact_id")
        .eq("id", leadId)
        .eq("organization_id", orgId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data as { contact_id: string | null } | null)?.contact_id ?? null;
    },

    async loadTriggerNodeId(orgId, versionId) {
      const { data, error } = await admin
        .from("followup_flow_versions")
        .select("graph")
        .eq("organization_id", orgId)
        .eq("id", versionId)
        .maybeSingle();
      if (error) throw new Error(error.message);
      if (!data) return null;
      const graph = flowGraphSchema.parse(data.graph);
      return graph.nodes.find((n) => n.type === "trigger")?.id ?? null;
    },

    async insertEnrollment(input) {
      const { error } = await admin.from("followup_enrollments").insert(input);
      if (error) {
        if (error.code === "23505") return { inserted: false };
        throw new Error(error.message);
      }
      return { inserted: true };
    },
  };
}
