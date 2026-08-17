/**
 * GET  /api/v1/resources/[id]/services — lista os serviços que este recurso executa.
 * POST /api/v1/resources/[id]/services — vincula um serviço do catálogo ao recurso.
 *
 * Spec: docs/specs/18-spec-agendamento-catalogo.md §2.3.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { linkResourceServiceSchema } from "@/lib/schemas/resources";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS =
  "id, organization_id, resource_id, product_id, duration_minutes_override, price_cents_override, created_at, product:crm_products(id, name, type, price_cents, duration_minutes)";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function GET(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_resource_services" });
  if (!authz.ok) return authz.response;
  const { org } = authz;
  const { id } = await params;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("crm_resource_services")
    .select(COLS)
    .eq("organization_id", org.orgId)
    .eq("resource_id", id)
    .order("created_at", { ascending: true });
  if (error) return fail("internal_error", "Erro ao listar serviços do recurso.", 500, { requestId });
  return ok(data ?? [], { requestId });
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_resource_services" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = linkResourceServiceSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }
  const { product_id, duration_minutes_override, price_cents_override } = parsed.data;

  const supabase = await createClient();

  // Confere que o recurso e o produto são desta org — a FK garante que EXISTEM,
  // não que são da MESMA org (anti-pattern 10 do CLAUDE.md: id vazado de outro
  // tenant não pode virar vínculo por engano).
  const { data: resource, error: resourceErr } = await supabase
    .from("crm_resources")
    .select("id")
    .eq("id", id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (resourceErr) return fail("internal_error", "Erro ao validar recurso.", 500, { requestId });
  if (!resource) return fail("not_found", "Recurso não encontrado.", 404, { requestId });

  const { data: product, error: productErr } = await supabase
    .from("crm_products")
    .select("id")
    .eq("id", product_id)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (productErr) return fail("internal_error", "Erro ao validar produto.", 500, { requestId });
  if (!product) return fail("not_found", "Serviço não encontrado no catálogo.", 404, { requestId });

  const { data, error } = await supabase
    .from("crm_resource_services")
    .insert({
      organization_id: org.orgId,
      resource_id: id,
      product_id,
      duration_minutes_override: duration_minutes_override ?? null,
      price_cents_override: price_cents_override ?? null,
    })
    .select(COLS)
    .single();
  if (error || !data) {
    if (error?.code === "23505") {
      return fail("already_linked", "Este recurso já executa este serviço.", 409, { requestId });
    }
    return fail("internal_error", "Erro ao vincular serviço.", 500, { requestId });
  }

  void audit({
    action: "resource.service_linked",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_resource_service",
    resourceId: data.id,
    requestId,
    metadata: { resource_id: id, product_id },
  });
  return ok(data, { requestId, status: 201 });
}
