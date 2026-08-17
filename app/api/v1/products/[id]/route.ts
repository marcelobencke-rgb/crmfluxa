/**
 * PATCH  /api/v1/products/[id] — atualiza um item de catálogo.
 * DELETE /api/v1/products/[id] — remove um item de catálogo.
 *
 * `.eq("organization_id", org.orgId)` é defesa extra, não substitui a RLS
 * `tenant_isolation_crm_products_all`.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateProductSchema } from "@/lib/schemas/products";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS =
  "id, organization_id, type, name, description, price_cents, currency, sku, requires_scheduling, duration_minutes, tags, is_active, created_at, updated_at";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_products" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = updateProductSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_products")
    .update({ ...parsed.data, updated_at: new Date().toISOString() })
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select(COLS)
    .maybeSingle();
  if (error) {
    if (error.code === "23505") {
      return fail("sku_already_exists", "Já existe um item com esse SKU.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao atualizar item de catálogo.", 500, { requestId });
  }
  if (!data) return fail("not_found", "Item de catálogo não encontrado.", 404, { requestId });

  void audit({
    action: "product.updated",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_product",
    resourceId: data.id,
    requestId,
    metadata: { fields: Object.keys(parsed.data) },
  });
  return ok(data, { requestId });
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_products" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  const { data: deleted, error } = await supabase
    .from("crm_products")
    .delete()
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .select("id")
    .maybeSingle();
  if (error) {
    // crm_appointments.product_id é ON DELETE RESTRICT — serviço com agendamento
    // (passado ou futuro) não pode sumir do catálogo, senão o agendamento perde
    // o que foi vendido. Inativar (is_active=false) é o caminho correto.
    if (error.code === "23503") {
      return fail(
        "product_in_use",
        "Este item tem agendamentos vinculados e não pode ser excluído. Marque como inativo em vez de excluir.",
        409,
        { requestId },
      );
    }
    return fail("internal_error", "Erro ao excluir item de catálogo.", 500, { requestId });
  }
  if (!deleted) return fail("not_found", "Item de catálogo não encontrado.", 404, { requestId });

  void audit({
    action: "product.deleted",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_product",
    resourceId: deleted.id,
    requestId,
  });
  return noContent(requestId);
}
