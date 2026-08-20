/**
 * GET  /api/v1/appointments — lista agendamentos (filtros: resource_id, lead_id, contact_id,
 *      status, starts_from/starts_to).
 * POST /api/v1/appointments — cria um agendamento. `ends_at` é SEMPRE calculado no
 *      servidor a partir da duração do serviço (nunca aceito do cliente).
 *
 * Lógica em ./_handler.ts (reusada pelas tools MCP em lib/mcp/tools/agendamento.ts).
 * A trava real contra double-booking é a exclusion constraint do banco (spec 18 §2.6);
 * aqui só traduzimos a violação (23P01) num 409 legível.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createAppointmentSchema } from "@/lib/schemas/appointments";
import { createClient } from "@/lib/supabase/server";

import { listAppointmentsHandler, createAppointmentHandler } from "./_handler";

export const dynamic = "force-dynamic";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("viewer", { requestId, resource: "crm_appointments" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const url = new URL(req.url);
  const supabase = await createClient();
  try {
    const appointments = await listAppointmentsHandler(
      supabase,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId },
      {
        resource_id: url.searchParams.get("resource_id") ?? undefined,
        lead_id: url.searchParams.get("lead_id") ?? undefined,
        contact_id: url.searchParams.get("contact_id") ?? undefined,
        status: url.searchParams.get("status") ?? undefined,
        starts_from: url.searchParams.get("starts_from") ?? undefined,
        starts_to: url.searchParams.get("starts_to") ?? undefined,
      },
    );
    return ok(appointments, { requestId });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_appointments" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;

  const raw = await req.json().catch(() => null);
  const parsed = createAppointmentSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const supabase = await createClient();
  try {
    const appointment = await createAppointmentHandler(
      supabase,
      { organization_id: org.orgId, actor: { type: "user", id: user.id }, requestId },
      parsed.data,
    );
    return ok(appointment, { requestId, status: 201 });
  } catch (err) {
    if (err instanceof ApiError) return fail(err.code, err.message, err.status, { requestId });
    throw err;
  }
}
