/**
 * PATCH /api/v1/appointments/[id] — remarca (`starts_at`) e/ou muda status (inclui
 * cancelar, que exige `cancel_reason`). Lógica em ../_handler.ts.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { updateAppointmentSchema } from "@/lib/schemas/appointments";
import { createClient } from "@/lib/supabase/server";

import { updateAppointmentHandler } from "../_handler";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PATCH(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_appointments" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id } = await params;

  const raw = await req.json().catch(() => null);
  const parsed = updateAppointmentSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  try {
    const appointment = await updateAppointmentHandler(
      supabase,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId },
      id,
      parsed.data,
    );
    return ok(appointment, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}
