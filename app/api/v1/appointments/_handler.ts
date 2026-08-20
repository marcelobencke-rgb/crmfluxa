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
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { rotuloDoContato, SEM_NOME, type ContatoNomeavel } from "@/lib/contacts/rotulo-do-contato";
import { computeAvailableSlots, MAX_DATE_RANGE_DAYS, type BusyRange } from "@/lib/scheduling/slots";
import type {
  AvailableSlotsQuery,
  CreateAppointmentInput,
  UpdateAppointmentInput,
} from "@/lib/schemas/appointments";
import type { AuditAction } from "@/lib/audit/actions";

type SB = SupabaseClient;

const APPT_TZ = "America/Sao_Paulo";

/** "20/08/2026 às 10:00" — pro `reason` legível da timeline do lead, mesmo fuso fixo de sempre. */
function formatApptDateTime(iso: string): string {
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat("pt-BR", { timeZone: APPT_TZ, day: "2-digit", month: "2-digit", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("pt-BR", { timeZone: APPT_TZ, hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
  return `${date} às ${time}`;
}

const APPT_COLS =
  "id, organization_id, lead_id, contact_id, resource_id, product_id, starts_at, ends_at, status, cancel_reason, source, notes, created_at, updated_at";

/**
 * Mesmas colunas de sempre + embed pra resolver `contact_name` (spec 18 — cards da
 * agenda mostram o nome do contato). Contato pode vir direto (`crm_appointments.contact_id`,
 * sempre populado pela migration 0148 quando há lead) ou, pra dado anterior a essa
 * migration, via `lead.contact_id`. Sem nenhum dos dois, cai pro título do lead.
 */
const APPT_JOIN_SELECT = `${APPT_COLS}, lead:crm_leads(title, contact:contacts(name, display_name, phone_number)), contact:contacts(name, display_name, phone_number)`;

interface JoinedRow {
  lead: { title: string; contact: ContatoNomeavel | null } | null;
  contact: ContatoNomeavel | null;
  [key: string]: unknown;
}

/**
 * Achata o embed de lead/contato num único `contact_name`, removendo os objetos
 * aninhados da resposta. Usa `rotuloDoContato` (não uma cadeia própria) — é a mesma
 * regra de "como se chama esta pessoa na tela" de toda outra tela, filtro de
 * identificador técnico incluso; reimplementar aqui seria a sétima cópia que
 * `lib/contacts/rotulo-do-contato.ts` existe pra evitar.
 */
function mapAppointmentRow(row: Record<string, unknown>): Record<string, unknown> {
  const { lead, contact, ...rest } = row as unknown as JoinedRow;
  const contatoEncontrado = contact ?? lead?.contact ?? null;
  const rotulo = contatoEncontrado ? rotuloDoContato(contatoEncontrado) : null;
  const contact_name = rotulo && rotulo !== SEM_NOME ? rotulo : (lead?.title ?? rotulo);
  return { ...rest, contact_name };
}

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
  /** Histórico de agendamentos do contato (migration 0148 mantém isso sempre populado quando há lead). */
  contact_id?: string;
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
    .select(APPT_JOIN_SELECT)
    .eq("organization_id", ctx.organization_id)
    .eq("is_external_block", false)
    .order("starts_at", { ascending: true });
  if (q.resource_id) query = query.eq("resource_id", q.resource_id);
  if (q.lead_id) query = query.eq("lead_id", q.lead_id);
  if (q.contact_id) query = query.eq("contact_id", q.contact_id);
  if (q.status) query = query.eq("status", q.status);
  if (q.starts_from) query = query.gte("starts_at", q.starts_from);
  if (q.starts_to) query = query.lte("starts_at", q.starts_to);

  const { data, error } = await query;
  if (error) throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  return (data ?? []).map((row) => mapAppointmentRow(row as unknown as Record<string, unknown>));
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
    .select(APPT_JOIN_SELECT)
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

  // Timeline do lead — só a app sabe quem é o ator de verdade (ctx.actor); o trigger
  // fn_crm_appointment_activity (migration 0146) não tem como saber, então esta emissão
  // vive aqui, não no banco. Ver doutrina no updateAppointmentHandler abaixo.
  if (data.lead_id) {
    void emitLeadActivity(supabase, {
      organizationId: ctx.organization_id,
      leadId: data.lead_id as string,
      contactId: (data.contact_id as string | null) ?? null,
      type: "appointment_scheduled",
      sourceModule: "agendamento",
      sourceId: data.id as string,
      actor: ctx.actor,
      reason: `Agendamento marcado para ${formatApptDateTime(data.starts_at as string)}`,
      payload: { starts_at: data.starts_at, ends_at: data.ends_at, resource_id: data.resource_id },
    });
  }

  return mapAppointmentRow(data as unknown as Record<string, unknown>);
}

// ---------------------------------------------------------------------------
// update (remarcar / redimensionar / mudar status / cancelar / notas)
// ---------------------------------------------------------------------------

/**
 * DECISÃO: resource_id, product_id, lead_id e contact_id NÃO são editáveis via PATCH —
 * de propósito, não é limitação temporária. Motivo (levantado ao construir o diálogo de
 * edição da agenda):
 *
 * 1. IA por referência de ID. `lib/mcp/tools/agendamento.ts` deixa a IA remarcar/cancelar
 *    um agendamento existente sabendo só o `id` — a ferramenta foi chamada dentro de uma
 *    conversa com um contato específico, e o agente assume que aquele ID continua sendo
 *    "o agendamento deste contato" pelo resto da conversa. Se um humano troca o contato
 *    por trás (mesmo ID, cliente diferente), a IA pode seguir agindo sobre o compromisso
 *    de outra pessoa sem saber — não é só um bug de UI, é referência cruzando contato.
 * 2. Timeline do CRM. `lead_id` vira entrada na timeline do lead no momento da criação
 *    (spec 18 §3 — "vincular a um lead faz o agendamento aparecer na timeline dele").
 *    Trocar o lead depois não migra o histórico: o agendamento muda de dono, mas o
 *    rastro de quando/por quem foi criado fica preso ao lead antigo — mesma família de
 *    anti-pattern que "cascade fantasma" no CLAUDE.md (raiz do repo).
 * 3. resource_id/product_id têm a validação de `crm_resource_services` (o recurso
 *    precisa executar aquele serviço) já checada só no create — reabrir isso no update
 *    duplicaria a validação pra um caso de uso que a rotina normal já resolve: cancelar
 *    e criar de novo, com o slot-picker validando tudo de novo do zero.
 *
 * Se isso virar necessidade real (ex.: corrigir contato errado sem perder o agendamento),
 * o caminho correto é uma migração de dados assistida (endpoint dedicado que também
 * repointa a timeline), não abrir esses 4 campos aqui.
 */
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
  if (input.starts_at && input.ends_at) {
    patch.starts_at = new Date(input.starts_at).toISOString();
    patch.ends_at = new Date(input.ends_at).toISOString();
  } else if (input.starts_at) {
    // Remarcar (arrastar o card): preserva a duração atual.
    const durationMs = new Date(existing.ends_at).getTime() - new Date(existing.starts_at).getTime();
    const newStart = new Date(input.starts_at);
    patch.starts_at = newStart.toISOString();
    patch.ends_at = new Date(newStart.getTime() + durationMs).toISOString();
  } else if (input.ends_at) {
    // Redimensionar (arrastar a borda inferior do card): só a duração muda.
    const newEnd = new Date(input.ends_at);
    if (newEnd.getTime() <= new Date(existing.starts_at).getTime()) {
      throw new ApiError(422, "validation_error", undefined, ctx.requestId, "O fim precisa ser depois do início.");
    }
    patch.ends_at = newEnd.toISOString();
  }
  if (input.status) patch.status = input.status;
  if (input.cancel_reason) patch.cancel_reason = input.cancel_reason;
  // Nota é o único campo de "conteúdo" editável por aqui — recurso/serviço/contato ficam
  // de fora de propósito (ver updateAppointmentSchema e o diálogo de edição no frontend).
  if (input.notes !== undefined) patch.notes = input.notes;

  const { data, error } = await supabase
    .from("crm_appointments")
    .update(patch)
    .eq("id", appointmentId)
    .eq("organization_id", ctx.organization_id)
    .select(APPT_JOIN_SELECT)
    .maybeSingle();
  if (error) {
    if (error.code === "23P01") {
      throw new ApiError(409, "slot_unavailable", undefined, ctx.requestId, "Este horário não está mais disponível.");
    }
    throw new ApiError(500, "internal_error", undefined, ctx.requestId, error.message);
  }
  if (!data) throw new ApiError(404, "not_found", undefined, ctx.requestId, "Agendamento não encontrado.");

  const action: AuditAction =
    input.status === "cancelled"
      ? "appointment.cancelled"
      : patch.starts_at
        ? "appointment.rescheduled"
        : patch.ends_at
          ? "appointment.duration_changed"
          : patch.notes !== undefined
            ? "appointment.notes_updated"
            : "appointment.status_changed";
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

  // Timeline do lead — mesma razão do createAppointmentHandler: só a app conhece o
  // ator. Cobre os mesmos 3 eventos que o trigger cobria (cancelar/remarcar) mais
  // duração (não existia quando o trigger foi escrito). Status "confirmed"/notas não
  // geram linha — nem geravam antes.
  if (data.lead_id) {
    const leadActivity: { type: "appointment_cancelled" | "appointment_rescheduled" | "appointment_duration_changed"; reason: string } | null =
      input.status === "cancelled"
        ? { type: "appointment_cancelled", reason: `Agendamento de ${formatApptDateTime(existing.starts_at)} cancelado` }
        : patch.starts_at
          ? { type: "appointment_rescheduled", reason: `Agendamento remarcado para ${formatApptDateTime(data.starts_at as string)}` }
          : patch.ends_at
            ? {
                type: "appointment_duration_changed",
                reason: `Duração do agendamento de ${formatApptDateTime(data.starts_at as string)} alterada`,
              }
            : null;
    if (leadActivity) {
      void emitLeadActivity(supabase, {
        organizationId: ctx.organization_id,
        leadId: data.lead_id as string,
        contactId: (data.contact_id as string | null) ?? null,
        type: leadActivity.type,
        sourceModule: "agendamento",
        sourceId: appointmentId,
        actor: ctx.actor,
        reason: leadActivity.reason,
        payload: { starts_at: data.starts_at, ends_at: data.ends_at, resource_id: data.resource_id },
      });
    }
  }

  return mapAppointmentRow(data as unknown as Record<string, unknown>);
}
