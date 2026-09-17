import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * GET   /api/v1/leads/[id] — busca um lead pelo id (handler em ../_handler.ts).
 * PATCH /api/v1/leads/[id] — update lead (handler em ../_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateLeadSchema, validateRequest } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { getLeadHandler, updateLeadHandler } from "../_handler";

export const dynamic = "force-dynamic";

/**
 * Nasceu para o campo "lead" do formulário de tarefa: ao editar uma tarefa
 * já vinculada a um negócio, a tela precisa do TÍTULO dele pra mostrar no
 * seletor (não só o `lead_id` cru) — `getLeadHandler` já existia (usado só
 * por dentro), faltava a porta HTTP.
 */
export async function GET(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  const authz = await requireRole("viewer", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;

  const supabase = await createClient();

  try {
    const lead = await getLeadHandler(
      supabase,
      {
        organization_id: authz.org.orgId,
        actor: { type: "user", id: authz.user.id },
        requestId,
        idioma: authz.user.idioma,
      },
      leadId,
    );
    return ok(lead, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}

export async function PATCH(
  req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  const supabase = await createClient();
  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = authz.org;

  let input;
  try {
    input = await validateRequest(updateLeadSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  try {
    const updated = await updateLeadHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: user.id },
        requestId,
        idioma: user.idioma,
      },
      leadId,
      input,
    );
    return ok(updated, { requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
