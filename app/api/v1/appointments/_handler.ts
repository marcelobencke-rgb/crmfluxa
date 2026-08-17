/**
 * Core handlers para /api/v1/appointments — chamados tanto pelos Route Handlers
 * REST quanto pelas tools MCP (lib/mcp/tools/agendamento.ts), mesmo padrão de
 * app/api/v1/leads/_handler.ts: `HandlerCtx` + `ApiError`, sem depender de
 * `NextRequest`/`Response`.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { ApiError } from "@/lib/api/types";
import type { Actor, HandlerCtx } from "@/lib/api/handlers/types";
import { audit } from "@/lib/audit";
import { computeAvailableSlots, MAX_DATE_RANGE_DAYS, type BusyRange } from "@/lib/scheduling/slots";
import type {
  AvailableSlotsQuery,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@/lib/schemas/appointments";
import type { AuditAction } from "@/lib/audit/actions";

type SB = SupabaseClient;

const APPT_COLS =
  "id, organization_id, lead_id, contact_id, resource_id, product_id, starts_at, ends_at, status, cancel_reason, source, notes, created_at, updated_at";

function actorAuditPayload(actor: Actor): {
  actorUserId: string | null;
  metadataActor: Record<string, unknown>;
} {
  if (actor.type === "user") {
    return { actorUserId: actor.id, metadataActor: { actor_type: "user" } };
  }
  if (actor.type === "webhook_source") {
    return { actorUserId: null, metadataActor: { actor_type: "webhook_source", actor_id: actor.id } };
  }
  return {
    actorUserId: null,
    metadataActor: {
      actor_type: "ai_agent",
      actor_id: actor.id,
      ...(actor.api_token_id ? { actor_api_token_id: actor.api_token_id } : {}),
    },
  };
}

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  const msA = Date.UTC(ay ?? 1970, (am ?? 1) - 1, ad ?? 1);
  const msB = Date.UTC(by ?? 1970, (bm ?? 1) - 1, bd ?? 1);
  return Math.round((msB - msA) / 86_400_000);
}

// ---------------------------------------------------------------------------
// list
// ---------------------------------------------------------------------------

export interface ListAppointmentsQuery {
  resource_id?: string;
  lead_id?: string;
  status?: string;
  starts_from?: string;
  starts_to?: string;
}

export async function listAppointmentsHandler(
  supabase: SB,
  ctx: HandlerCtx,
  q: ListAppointmentsQuery,
): Promise<Array<Record<string, unknown>>> {
  let query = supabase
    .from("crm_appointments")
    .select(APPT_COLS)
    .eq("organization_id", ctx.organization_id)
    .eq("is_external_block", false)
    .order("starts_at", { ascending: true });
  if (q.resource_id) query = query.eq("resource_id", q.resource_id);
  if (q.lead_id) query = query.eq("lead_id", q.lead_id);
  if (q.status) query = query.eq("status", q.status);
  if (q.starts_from) query = query.gte("starts_at", q.starts_from);
  if (q.starts_to) query = query.lte("starts_at", q.starts_to);

  const { data, error } = await query;
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

// ---------------------------------------------------------------------------
// available slots
// ---------------------------------------------------------------------------

export interface FreeSlotResult {
  resource_id: string;
  slot_start: string;
  slot_end: string;
}

const MAX_SLOTS_RETURNED = 200;

export async function listAvailableSlotsHandler(
  supabase: SB,
  ctx: HandlerCtx,
  query: AvailableSlotsQuery,
): Promise<FreeSlotResult[]> {
  const { resource_id, product_id, date_from, date_to } = query;
  if (daysBetween(date_from, date_to) > MAX_DATE_RANGE_DAYS) {
    throw new ApiError(
      422,
      "range_too_wide",
      undefined,
      ctx.requestId,
      `Intervalo máximo é ${MAX_DATE_RANGE_DAYS} dias.`,
    );
  }

  const { data: product, error: productErr } = await supabase
    .from("crm_products")
    .select("id, duration_minutes, requires_scheduling")
    .eq("id", product_id)
    .eq("organization_id", ctx.organization_id)
    .maybeSingle();
  if (productErr) throw new ApiError(500, "internal_error", undefined, ctx.requestId, productErr.message);
  if (!product) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Serviço não encontrado no catálogo.");
  if (!product.requires_scheduling) {
    throw new ApiError(422, "not_schedulable", undefined, ctx.requestId, "Este item do catálogo não exige agendamento.");
  }

  let linkQuery = supabase
    .from("crm_resource_services")
    .select("resource_id, duration_minutes_override")
    .eq("organization_id", ctx.organization_id)
    .eq("product_id", product_id);
  if (resource_id) linkQuery = linkQuery.eq("resource_id", resource_id);
  const { data: links, error: linksErr } = await linkQuery;
  if (linksErr) throw new ApiError(500, "internal_error", undefined, ctx.requestId, linksErr.message);
  if (!links || links.length === 0) return [];

  const resourceIds = links.map((l) => l.resource_id);
  const durationByResource = new Map<string, number>(
    links.map((l) => [l.resource_id, l.duration_minutes_override ?? product.duration_minutes ?? 30]),
  );

  const [{ data: availabilityRows, error: availErr }, { data: appointmentRows, error: apptErr }, { data: timeOffRows, error: timeOffErr }] =
    await Promise.all([
      supabase
        .from("crm_resource_availability")
        .select("resource_id, weekday, start_time, end_time")
        .eq("organization_id", ctx.organization_id)
        .in("resource_id", resourceIds),
      supabase
        .from("crm_appointments")
        .select("resource_id, starts_at, ends_at")
        .eq("organization_id", ctx.organization_id)
        .in("resource_id", resourceIds)
        .not("status", "in", "(cancelled,no_show)")
        .gte("starts_at", `${date_from}T00:00:00-03:00`)
        .lte("starts_at", `${date_to}T23:59:59-03:00`),
      supabase
        .from("crm_resource_time_off")
        .select("resource_id, starts_at, ends_at")
        .eq("organization_id", ctx.organization_id)
        .or(`resource_id.in.(${resourceIds.join(",")}),resource_id.is.null`)
        .lte("starts_at", `${date_to}T23:59:59-03:00`)
        .gte("ends_at", `${date_from}T00:00:00-03:00`),
    ]);
  if (availErr || apptErr || timeOffErr) {
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, "Erro ao calcular disponibilidade.");
  }

  const now = new Date().toISOString();
  const allSlots: FreeSlotResult[] = [];

  for (const rid of resourceIds) {
    const availability = (availabilityRows ?? []).filter((a) => a.resource_id === rid);
    if (!availability.length) continue;

    const busy: BusyRange[] = [
      ...(appointmentRows ?? []).filter((a) => a.resource_id === rid),
      ...(timeOffRows ?? []).filter((t) => t.resource_id === rid || t.resource_id === null),
    ].map((r) => ({ starts_at: r.starts_at as string, ends_at: r.ends_at as string }));

    const slots = computeAvailableSlots({
      dateFrom: date_from,
      dateTo: date_to,
      durationMinutes: durationByResource.get(rid) ?? 30,
      availability,
      busy,
      now,
    });
    for (const s of slots) allSlots.push({ resource_id: rid, ...s });
  }

  allSlots.sort((a, b) => a.slot_start.localeCompare(b.slot_start));
  return allSlots.slice(0, MAX_SLOTS_RETURNED);
}

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

export async function createAppointmentHandler(
  supabase: SB,
  ctx: HandlerCtx,
  input: CreateAppointmentInput,
): Promise<Record<string, unknown>> {
  const { resource_id, product_id, starts_at, lead_id, contact_id, notes } = input;

  const { data: product, error: productErr } = await supabase
    .from("crm_products")
    .select("id, duration_minutes, requires_scheduling")
    .eq("id", product_id)
    .eq("organization_id", ctx.organization_id)
    .maybeSingle();
  if (productErr) throw new ApiError(500, "internal_error", undefined, ctx.requestId, productErr.message);
  if (!product) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Serviço não encontrado no catálogo.");
  if (!product.requires_scheduling) {
    throw new ApiError(422, "not_schedulable", undefined, ctx.requestId, "Este item do catálogo não exige agendamento.");
  }

  const { data: link, error: linkErr } = await supabase
    .from("crm_resource_services")
    .select("duration_minutes_override")
    .eq("organization_id", ctx.organization_id)
    .eq("resource_id", resource_id)
    .eq("product_id", product_id)
    .maybeSingle();
  if (linkErr) throw new ApiError(500, "internal_error", undefined, ctx.requestId, linkErr.message);
  if (!link) {
    throw new ApiError(
      422,
      "resource_does_not_perform_service",
      undefined,
      ctx.requestId,
      "Este recurso não executa este serviço.",
    );
  }

  const durationMinutes = link.duration_minutes_override ?? product.duration_minutes ?? 30;
  const startsAtDate = new Date(starts_at);
  const endsAtDate = new Date(startsAtDate.getTime() + durationMinutes * 60_000);

  const a = actorAuditPayload(ctx.actor);
  const { data, error } = await supabase
    .from("crm_appointments")
    .insert({
      organization_id: ctx.organization_id,
      resource_id,
      product_id,
      lead_id: lead_id ?? null,
      contact_id: contact_id ?? null,
      starts_at: startsAtDate.toISOString(),
      ends_at: endsAtDate.toISOString(),
      notes: notes ?? null,
      source: ctx.actor.type === "ai_agent" ? "agent" : "manual",
      created_by_user_id: ctx.actor.type === "user" ? ctx.actor.id : null,
    })
    .select(APPT_COLS)
    .single();
  if (error || !data) {
    // exclusion constraint (crm_appointments_resource_id_tstzrange_excl).
    if (error?.code === "23P01") {
      throw new ApiError(409, "slot_unavailable", undefined, ctx.requestId, "Este horário não está mais disponível.");
    }
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, error?.message ?? "Erro ao criar agendamento.");
  }

  void audit({
    action: "appointment.created",
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "crm_appointment",
    resourceId: data.id,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, resource_id, product_id, starts_at: data.starts_at },
  });
  return data as Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// update (remarcar / mudar status / cancelar)
// ---------------------------------------------------------------------------

export async function updateAppointmentHandler(
  supabase: SB,
  ctx: HandlerCtx,
  appointmentId: string,
  input: UpdateAppointmentInput,
): Promise<Record<string, unknown>> {
  const { data: existing, error: selErr } = await supabase
    .from("crm_appointments")
    .select("id, starts_at, ends_at, status")
    .eq("id", appointmentId)
    .eq("organization_id", ctx.organization_id)
    .maybeSingle();
  if (selErr) throw new ApiError(500, "internal_error", undefined, ctx.requestId, selErr.message);
  if (!existing) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Agendamento não encontrado.");

  const patch: Record<string, unknown> = {};
  if (input.starts_at) {
    const durationMs = new Date(existing.ends_at).getTime() - new Date(existing.starts_at).getTime();
    const newStart = new Date(input.starts_at);
    patch.starts_at = newStart.toISOString();
    patch.ends_at = new Date(newStart.getTime() + durationMs).toISOString();
  }
  if (input.status) patch.status = input.status;
  if (input.cancel_reason) patch.cancel_reason = input.cancel_reason;

  const { data, error } = await supabase
    .from("crm_appointments")
    .update(patch)
    .eq("id", appointmentId)
    .eq("organization_id", ctx.organization_id)
    .select(APPT_COLS)
    .maybeSingle();
  if (error) {
    if (error.code === "23P01") {
      throw new ApiError(409, "slot_unavailable", undefined, ctx.requestId, "Este horário não está mais disponível.");
    }
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  }
  if (!data) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Agendamento não encontrado.");

  const action: AuditAction =
    input.status === "cancelled" ? "appointment.cancelled" : patch.starts_at ? "appointment.rescheduled" : "appointment.status_changed";
  const a = actorAuditPayload(ctx.actor);
  void audit({
    action,
    actorUserId: a.actorUserId,
    organizationId: ctx.organization_id,
    resourceType: "crm_appointment",
    resourceId: appointmentId,
    requestId: ctx.requestId,
    metadata: { ...a.metadataActor, fields: Object.keys(patch) },
  });
  return data as Record<string, unknown>;
}
