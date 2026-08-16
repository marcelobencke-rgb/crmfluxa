/**
 * POST /api/v1/contacts/[id]/unblock — reverte o bloqueio automático de STOP.
 *
 * Regra de negócio W-02 (docs/business-rules/00-business-rules-catalog.md):
 * "Tenant admin pode desbloquear manualmente; ação auditada." Não é agent+
 * porque reativar envio automatizado (campanha, IA, follow-up) pra alguém que
 * pode ter pedido descadastro de verdade tem peso de compliance — decisão de
 * admin, não de quem só está respondendo a fila.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: contactId } = await ctx.params;

  const authz = await requireRole("admin", { requestId, resource: "contact" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  const supabase = await createClient();
  const { data: contact, error: fetchErr } = await supabase
    .from("contacts")
    .select("id, is_blocked, blocked_reason")
    .eq("id", contactId)
    .eq("organization_id", activeOrg.orgId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!contact) return fail("not_found", "Contato não encontrado.", 404, { requestId });

  if (!contact.is_blocked) {
    return ok({ contact_id: contactId, already_unblocked: true }, { requestId });
  }

  const previousReason = contact.blocked_reason;
  const { error: updErr } = await supabase
    .from("contacts")
    .update({ is_blocked: false, blocked_reason: null, blocked_at: null })
    .eq("id", contactId);
  if (updErr) return fail("internal_error", updErr.message, 500, { requestId });

  await audit({
    action: "contact.unblocked",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "contact",
    resourceId: contactId,
    requestId,
    metadata: { previous_reason: previousReason },
  });

  return ok({ contact_id: contactId, unblocked: true }, { requestId });
}
