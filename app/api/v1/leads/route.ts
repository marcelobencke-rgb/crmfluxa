/**
 * GET  /api/v1/leads?search= — busca leads por título (LeadPicker, spec 18 §5).
 *      Sem `search`, lista os mais recentes da org (mesmo corte de limit/cursor do MCP).
 * POST /api/v1/leads — create lead (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createLeadSchema, validateRequest, type CreateLeadInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { createLeadHandler, listLeadsHandler } from "./_handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const url = new URL(req.url);
  const limitParam = url.searchParams.get("limit");
  const supabase = await createClient();
  try {
    const result = await listLeadsHandler(
      supabase,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId },
      {
        search: url.searchParams.get("search") ?? undefined,
        status: (url.searchParams.get("status") as "open" | "won" | "lost" | null) ?? undefined,
        limit: limitParam ? Number(limitParam) : 10,
      },
    );
    return ok(result.leads, { requestId, meta: { cursor: result.cursor ?? undefined, has_more: result.has_more } });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
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
