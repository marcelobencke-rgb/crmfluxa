/**
 * GET  /api/v1/resources — lista recursos agendáveis (profissionais/salas/equipamentos).
 * POST /api/v1/resources — cria um recurso.
 *
 * Spec: docs/specs/18-spec-agendamento-catalogo.md §5.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createResourceSchema } from "@/lib/schemas/resources";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS = "id, organization_id, type, name, user_id, color, is_active, created_at, updated_at";

export async function GET(_req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_resources" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_resources")
    .select(COLS)
    .eq("organization_id", org.orgId)
    .order("created_at", { ascending: false });
  if (error) return fail("internal_error", "Erro ao listar recursos.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // Escrita é agent+ (viewer é read-only) — mesmo corte do resto do CRM.
  const authz = await requireRole("agent", { requestId, resource: "crm_resources" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = createResourceSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const { type, name, user_id, color, is_active } = parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_resources")
    .insert({
      organization_id: org.orgId,
      type,
      name,
      user_id: user_id ?? null,
      color: color ?? null,
      is_active,
    })
    .select(COLS)
    .single();
  if (error || !data) {
    return fail("internal_error", "Erro ao criar recurso.", 500, { requestId });
  }

  void audit({
    action: "resource.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_resource",
    resourceId: data.id,
    requestId,
    metadata: { type, name },
  });
  return ok(data, { requestId, status: 201 });
}
