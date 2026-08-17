/**
 * Core read handler para /api/v1/products — reusado pela tool MCP
 * crm_search_catalog (lib/mcp/tools/agendamento.ts). Escrita (POST/PATCH/DELETE)
 * fica só em route.ts: o agente não cadastra item de catálogo, só consulta.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import type { HandlerCtx } from "@/lib/api/handlers/types";

type SB = SupabaseClient;

const PRODUCT_COLS =
  "id, organization_id, type, name, description, price_cents, currency, sku, requires_scheduling, duration_minutes, tags, is_active, created_at, updated_at";

export interface ListProductsQuery {
  /** Busca por nome (ILIKE). */
  search?: string;
  type?: "product" | "service";
  requires_scheduling?: boolean;
  /**
   * Default TRUE — preserva o comportamento original da tela de Catálogo
   * (mostra tudo, inclusive inativo, com badge). A tool MCP passa `false`
   * explicitamente: o agente não deve oferecer item desativado ao cliente.
   */
  include_inactive?: boolean;
  limit?: number;
}

export async function listProductsHandler(
  supabase: SB,
  ctx: HandlerCtx,
  q: ListProductsQuery,
): Promise<Array<Record<string, unknown>>> {
  const limit = Math.min(Math.max(q.limit ?? 100, 1), 100);
  const includeInactive = q.include_inactive ?? true;

  let query = supabase
    .from("crm_products")
    .select(PRODUCT_COLS)
    .eq("organization_id", ctx.organization_id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (!includeInactive) query = query.eq("is_active", true);
  if (q.type) query = query.eq("type", q.type);
  if (q.requires_scheduling !== undefined) query = query.eq("requires_scheduling", q.requires_scheduling);
  if (q.search) query = query.ilike("name", `%${q.search}%`);

  const { data, error } = await query;
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}
