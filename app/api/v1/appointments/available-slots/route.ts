/**
 * GET /api/v1/appointments/available-slots — horários livres pra marcar um serviço.
 *
 * `resource_id` omitido = varre todos os recursos que executam o serviço (spec 18 §6,
 * usado pelo agente quando o cliente não pede um profissional específico).
 * Lógica em ../_handler.ts (reusada pela tool MCP crm_list_available_slots).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { availableSlotsQuerySchema } from "@/lib/schemas/appointments";
import { createClient } from "@/lib/supabase/server";

import { listAvailableSlotsHandler } from "../_handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_appointments" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const url = new URL(req.url);
  const parsed = availableSlotsQuerySchema.safeParse({
    resource_id: url.searchParams.get("resource_id") ?? undefined,
    product_id: url.searchParams.get("product_id") ?? undefined,
    date_from: url.searchParams.get("date_from") ?? undefined,
    date_to: url.searchParams.get("date_to") ?? undefined,
  });
  if (!parsed.success) {
    return fail("validation_failed", "Parâmetros inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  try {
    const slots = await listAvailableSlotsHandler(
      supabase,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId },
      parsed.data,
    );
    return ok(slots, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}
