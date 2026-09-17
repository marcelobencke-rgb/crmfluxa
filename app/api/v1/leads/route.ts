import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET  /api/v1/leads — busca/lista (handler em ./_handler.ts).
 * POST /api/v1/leads — create lead (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { traduzir } from "@/lib/i18n/dicionario";
import { requireRole } from "@/lib/auth/require-role";
import {
  createLeadSchema,
  leadListQuerySchema,
  validateRequest,
  type CreateLeadInput,
} from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { createLeadHandler, listLeadsHandler } from "./_handler";

export const dynamic = "force-dynamic";

/**
 * Nasceu para o campo "lead" do formulário de tarefa (`FormularioDeTarefa`)
 * ter como buscar um negócio pelo título — até aqui só o MCP listava leads
 * (`listLeadsHandler` chamado direto por `lib/mcp/server.ts`, client
 * admin/service-role). Esta rota é a MESMA função, só que pela sessão do
 * navegador — `requireRole` filtra por `organization_id` como o resto de
 * `/api/v1/*` (a RLS também protege, mas o filtro explícito é a regra do
 * CLAUDE.md, não redundância).
 */
export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const authz = await requireRole("viewer", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const url = new URL(req.url);
  const parsed = leadListQuerySchema.safeParse({
    pipeline_id: url.searchParams.get("pipeline_id") ?? undefined,
    stage_id: url.searchParams.get("stage_id") ?? undefined,
    status: url.searchParams.get("status") ?? undefined,
    owner_user_id: url.searchParams.get("owner_user_id") ?? undefined,
    search: url.searchParams.get("search") ?? undefined,
    cursor: url.searchParams.get("cursor") ?? undefined,
    limit: url.searchParams.get("limit") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", t("Query inválida."), 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();

  try {
    const { leads, cursor, has_more } = await listLeadsHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
        idioma: authz.user.idioma,
      },
      parsed.data,
    );
    // O ARRAY direto em `data`, não `{ leads }` — mesmo contrato de
    // `GET /api/v1/contacts` (`ok(contacts, ...)`), que é o que
    // `hooks/leads/useLeadList.ts` já espera. `{ leads }` aqui quebrava o
    // picker com "leads.map is not a function": `resultado.data?.data` lia
    // o OBJETO `{ leads: [...] }` em vez do array.
    return ok(leads, { requestId, meta: { cursor, has_more } });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  let input;
  try {
    input = await validateRequest(createLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  const supabase = await createClient();

  try {
    const lead = await createLeadHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: authUser.id },
        requestId,
        idioma: authUser.idioma,
      },
      input as CreateLeadInput,
    );
    return ok(lead, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
