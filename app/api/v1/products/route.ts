/**
 * GET  /api/v1/products — lista o catálogo (produtos/serviços) da org ativa.
 * POST /api/v1/products — cria um item de catálogo.
 *
 * Spec: docs/specs/18-spec-agendamento-catalogo.md §5.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createProductSchema } from "@/lib/schemas/products";
import { createClient } from "@/lib/supabase/server";

import { listProductsHandler } from "./_handler";

export const dynamic = "force-dynamic";
const COLS =
  "id, organization_id, type, name, description, price_cents, currency, sku, requires_scheduling, duration_minutes, tags, is_active, created_at, updated_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_products" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const url = new URL(req.url);
  const supabase = await createClient();
  try {
    const products = await listProductsHandler(
      supabase,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId },
      {
        search: url.searchParams.get("search") ?? undefined,
        type: (url.searchParams.get("type") as "product" | "service" | null) ?? undefined,
        include_inactive: url.searchParams.has("include_inactive")
          ? url.searchParams.get("include_inactive") === "true"
          : undefined,
        limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
      },
    );
    return ok(products, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  // Escrita é agent+ (viewer é read-only) — mesmo corte do resto do CRM.
  const authz = await requireRole("agent", { requestId, resource: "crm_products" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = createProductSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const { name, type, description, price_cents, currency, sku, requires_scheduling, duration_minutes, is_active } =
    parsed.data;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_products")
    .insert({
      organization_id: org.orgId,
      type,
      name,
      description: description ?? null,
      price_cents,
      currency,
      sku: sku ?? null,
      requires_scheduling,
      duration_minutes: duration_minutes ?? null,
      is_active,
      created_by_user_id: user.id,
    })
    .select(COLS)
    .single();
  if (error || !data) {
    // uniq_crm_products_org_sku — SKU duplicado na mesma org.
    if (error?.code === "23505") {
      return fail("sku_already_exists", "Já existe um item com esse SKU.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao criar item de catálogo.", 500, { requestId });
  }

  void audit({
    action: "product.created",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_product",
    resourceId: data.id,
    requestId,
    metadata: { type, name },
  });
  return ok(data, { requestId, status: 201 });
}
