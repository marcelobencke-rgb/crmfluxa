/**
 * GET /api/v1/resources/[id]/availability — grade semanal recorrente do recurso.
 * PUT /api/v1/resources/[id]/availability — substitui a grade inteira (idempotente:
 *     o cliente manda o conjunto completo de slots; o servidor troca tudo de uma vez).
 *
 * Spec: docs/specs/18-spec-agendamento-catalogo.md §2.4.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { replaceAvailabilitySchema } from "@/lib/schemas/resources";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS = "id, organization_id, resource_id, weekday, start_time, end_time, created_at";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_resource_availability" });
  if (!authz.ok) return authz.response;
  const { org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_resource_availability")
    .select(COLS)
    .eq("organization_id", org.orgId)
    .eq("resource_id", id)
    .order("weekday", { ascending: true })
    .order("start_time", { ascending: true });
  if (error) return fail("internal_error", "Erro ao listar disponibilidade.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function PUT(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_resource_availability" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = replaceAvailabilitySchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  const { data: resource, error: resourceErr } = await supabase
    .from("crm_resources")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (resourceErr) return fail("internal_error", "Erro ao validar recurso.", 500, { requestId });
  if (!resource) return fail("not_found", "Recurso não encontrado.", 404, { requestId });

  const { error: delErr } = await supabase
    .from("crm_resource_availability")
    .delete()
    .eq("organization_id", org.orgId)
    .eq("resource_id", id);
  if (delErr) return fail("internal_error", "Erro ao limpar grade anterior.", 500, { requestId });

  const rows = parsed.data.slots.map((s) => ({
    organization_id: org.orgId,
    resource_id: id,
    weekday: s.weekday,
    start_time: s.start_time,
    end_time: s.end_time,
  }));

  let inserted: unknown[] = [];
  if (rows.length > 0) {
    const { data, error: insErr } = await supabase.from("crm_resource_availability").insert(rows).select(COLS);
    if (insErr) return fail("internal_error", "Erro ao gravar nova grade.", 500, { requestId });
    inserted = data ?? [];
  }

  void audit({
    action: "resource.availability_replaced",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_resource",
    resourceId: id,
    requestId,
    metadata: { slot_count: rows.length },
  });
  return ok(inserted, { requestId });
}
