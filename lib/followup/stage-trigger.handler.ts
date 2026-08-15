/**
 * Adapter fino que pluga `applyStageTriggerEvent` (lib/followup/stage-trigger.ts)
 * no dispatcher genérico do event_log — mesmo padrão de
 * `lib/followup/reactivity.handler.ts` (handler key isolado do pipeline, pra
 * não puxar o registry pra dentro dos testes unit da lógica pura).
 */
import type { EventHandler, HandlerResult } from "@/lib/event-log/dispatcher";
import { createAdminClient } from "@/lib/supabase/admin";
import { createSupabaseFollowupGateDb } from "@/lib/followup/agent-followup-gate";
import { applyStageTriggerEvent, createSupabaseStageTriggerDb } from "@/lib/followup/stage-trigger";

export const FOLLOWUP_STAGE_TRIGGER_HANDLER_KEY = "followup-stage-trigger.v1";

export const followupStageTriggerHandler: EventHandler = {
  key: FOLLOWUP_STAGE_TRIGGER_HANDLER_KEY,
  events: ["lead.stage_changed"],
  async handle(row): Promise<HandlerResult> {
    try {
      const admin = createAdminClient();
      const summary = await applyStageTriggerEvent(
        {
          db: createSupabaseStageTriggerDb(admin),
          gateDb: createSupabaseFollowupGateDb(admin),
          clock: () => new Date(),
        },
        row,
      );
      return {
        consumer_key: FOLLOWUP_STAGE_TRIGGER_HANDLER_KEY,
        status: summary.matched ? "ok" : "skipped",
        detail: `enrolled=${summary.enrolled} gated_out=${summary.pointers_gated_out}`,
      };
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      return { consumer_key: FOLLOWUP_STAGE_TRIGGER_HANDLER_KEY, status: "error", detail };
    }
  },
};
