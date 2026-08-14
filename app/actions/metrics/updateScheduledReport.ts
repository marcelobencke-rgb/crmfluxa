"use server";

import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { scheduledReportSchema, type ScheduledReportInput } from "@/lib/schemas/settings";
import { audit } from "@/lib/audit";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

export type UpdateScheduledReportResult = { ok: true } | { ok: false; error: string };

/**
 * Quem recebe relatório de Desempenho por email é decisão de admin, não de
 * manager — dado do negócio inteiro saindo por email pra endereços que podem
 * nem ser gente com login no CRM merece o mesmo piso de LGPD/API Tokens.
 *
 * Escrita vai por admin client pelo mesmo motivo de updateTenant.ts: a única
 * policy de escrita de `organizations` é platform_admin-only, então pelo
 * client de sessão um admin comum casaria 0 linhas.
 */
export async function updateScheduledReport(
  input: ScheduledReportInput,
): Promise<UpdateScheduledReportResult> {
  const parsed = scheduledReportSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "validation_failed" };

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }

  const supabase = createAdminClient();

  const { data: orgRow, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const currentSettings = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const nextSettings = { ...currentSettings, scheduled_report: parsed.data };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: error.message };

  await audit({
    action: "org.scheduled_report_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    metadata: {
      enabled: parsed.data.enabled,
      frequency: parsed.data.frequency,
      recipient_count: parsed.data.recipients.length,
    },
  });

  revalidatePath("/app/metrics");
  return { ok: true };
}
