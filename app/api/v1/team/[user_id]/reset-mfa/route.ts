/**
 * POST /api/v1/team/[user_id]/reset-mfa — admin removes a teammate's MFA.
 *
 * Only self-service path today is the recovery-code flow (10 single-use
 * codes generated at enrollment). This route covers what happens when BOTH
 * the authenticator and every recovery code are gone — the teammate can't
 * log in at all, so nothing they do can fix it. An org admin resets it for
 * them from the Team screen; the teammate re-enrolls MFA on next login
 * (mfa_required stays enforced — see lib/auth/server.ts).
 *
 * Guardrails:
 *  - Caller must be admin of the active org.
 *  - Target must be an active (non-revoked) member of the same org.
 *  - Cannot target self (self-service already covers your own account: you
 *    generate/regenerate your own recovery codes at /app/settings/security).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

export async function POST(
  _req: NextRequest,
  ctx: { params: Promise<{ user_id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { user_id: targetUserId } = await ctx.params;

  const authz = await requireRole("admin", { requestId, resource: "team" });
  if (!authz.ok) return authz.response;
  const { user: authUser, org: activeOrg } = authz;

  if (targetUserId === authUser.id) {
    return fail(
      "state_conflict",
      "Use as configurações de segurança da sua própria conta.",
      409,
      { requestId },
    );
  }

  const supabase = await createClient();
  const { data: target, error: fetchErr } = await supabase
    .from("user_organizations")
    .select("id, user_id, revoked_at")
    .eq("organization_id", activeOrg.orgId)
    .eq("user_id", targetUserId)
    .maybeSingle();
  if (fetchErr) return fail("internal_error", fetchErr.message, 500, { requestId });
  if (!target || target.revoked_at) {
    return fail("not_found", "Membro não encontrado.", 404, { requestId });
  }

  const admin = createAdminClient();
  const { data: listRes, error: listErr } = await admin.auth.admin.mfa.listFactors({
    userId: targetUserId,
  });
  if (listErr) return fail("internal_error", listErr.message, 500, { requestId });

  const factors = listRes?.factors ?? [];
  for (const factor of factors) {
    const { error: delErr } = await admin.auth.admin.mfa.deleteFactor({
      userId: targetUserId,
      id: factor.id,
    });
    if (delErr) return fail("internal_error", delErr.message, 500, { requestId });
  }

  await audit({
    action: "team.mfa_reset",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "membership",
    resourceId: target.id,
    requestId,
    metadata: { target_user_id: targetUserId, factors_removed: factors.length },
  });

  return ok({ user_id: targetUserId, factors_removed: factors.length }, { requestId });
}
