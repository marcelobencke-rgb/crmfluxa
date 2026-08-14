/**
 * GET /api/v1/automation-rules/runs?limit=50 — histórico de execuções da ORG
 * inteira (cross-rule), desc. Usado pela aba Atividade (timeline global).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("manager", { requestId, resource: "automation_rules" });
  if (!authz.ok) return authz.response;
  const { org: activeOrg } = authz;

  const rawLimit = Number(req.nextUrl.searchParams.get("limit"));
  const limit = Math.min(Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : DEFAULT_LIMIT, MAX_LIMIT);

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("automation_rule_runs")
    .select("*, automation_rules(name), event_log(entity_kind, entity_id, payload)")
    .eq("organization_id", activeOrg.orgId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const runs = data ?? [];
  const leadIds = new Set<string>();
  const contactIds = new Set<string>();

  for (const run of runs) {
    if (!run.event_log) continue;
    const kind = run.event_log.entity_kind;
    if (kind === "crm_lead" || kind === "lead") {
      leadIds.add(run.event_log.entity_id);
    } else if (kind === "contact") {
      contactIds.add(run.event_log.entity_id);
    } else if (kind === "message" && run.event_log.payload?.contact_id) {
      contactIds.add(run.event_log.payload.contact_id);
    }
  }

  const [leadsRes, contactsRes] = await Promise.all([
    leadIds.size > 0 ? supabase.from("crm_leads").select("id, title").in("id", Array.from(leadIds)) : Promise.resolve({ data: [] }),
    contactIds.size > 0 ? supabase.from("contacts").select("id, name, full_name").in("id", Array.from(contactIds)) : Promise.resolve({ data: [] })
  ]);

  const leadsMap = new Map(leadsRes.data?.map(l => [l.id, l.title]) ?? []);
  const contactsMap = new Map(contactsRes.data?.map(c => [c.id, c.name || c.full_name]) ?? []);

  for (const run of runs) {
    if (!run.event_log) continue;
    const kind = run.event_log.entity_kind;
    const payload = run.event_log.payload || {};
    
    if (kind === "crm_lead" || kind === "lead") {
      payload.title = payload.title || leadsMap.get(run.event_log.entity_id);
    } else if (kind === "contact") {
      payload.name = payload.name || contactsMap.get(run.event_log.entity_id);
    } else if (kind === "message" && payload.contact_id) {
      payload.contact_name = payload.contact_name || contactsMap.get(payload.contact_id);
    }
    run.event_log.payload = payload;
  }

  return ok(runs, { requestId });
}
