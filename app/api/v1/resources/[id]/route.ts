/**
 * PATCH  /api/v1/resources/[id] — atualiza um recurso.
 * DELETE /api/v1/resources/[id] — remove um recurso.
 *
 * `.eq("organization_id", org.orgId)` é defesa extra, não substitui a RLS
 * `tenant_isolation_crm_resources_all`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateResourceSchema } from "@/lib/schemas/resources";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS = "id, organization_id, type, name, user_id, color, is_active, created_at, updated_at";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_resources" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = updateResourceSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_resources")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select(COLS)
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao atualizar recurso.", 500, { requestId });
  if (!data) return fail("not_found", "Recurso não encontrado.", 404, { requestId });

  void audit({
    action: "resource.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_resource",
    resourceId: data.id,
    requestId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_resources" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("crm_resources")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) {
    // crm_appointments.resource_id é ON DELETE RESTRICT — recurso com
    // agendamento vinculado não pode sumir. Inativar é o caminho correto.
    if (error.code === "23503") {
      return fail(
        "resource_in_use",
        "Este recurso tem agendamentos vinculados e não pode ser excluído. Marque como inativo em vez de excluir.",
        409,
        { requestId },
      );
    }
    return fail("internal_error", "Erro ao excluir recurso.", 500, { requestId });
  }
  if (!deleted) return fail("not_found", "Recurso não encontrado.", 404, { requestId });

  void audit({
    action: "resource.deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_resource",
    resourceId: deleted.id,
    requestId,
  });
  return noContent(requestId);
}
