/**
 * DELETE /api/v1/resources/[id]/services/[productId] — desvincula um serviço do recurso.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string; productId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_resource_services" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id, productId } = await params;

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("crm_resource_services")
    .delete()
    .eq("organization_id", org.orgId)
    .eq("resource_id", id)
    .eq("product_id", productId)
    .select("id")
    .maybeSingle();
  if (error) return fail("internal_error", "Erro ao desvincular serviço.", 500, { requestId });
  if (!deleted) return fail("not_found", "Vínculo não encontrado.", 404, { requestId });

  void audit({
    action: "resource.service_unlinked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_resource_service",
    resourceId: deleted.id,
    requestId,
    metadata: { resource_id: id, product_id: productId },
  });
  return noContent(requestId);
}
