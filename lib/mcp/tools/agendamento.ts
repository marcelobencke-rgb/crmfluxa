/**
 * MCP tools sobre /api/v1/appointments (Spec 18 §6).
 *
 *  Read:
 *   - crm_list_available_slots
 *   - crm_list_appointments
 *  Write:
 *   - crm_create_appointment
 *   - crm_reschedule_appointment
 *   - crm_cancel_appointment
 *
 * Todas passam pela mesma exclusion constraint do banco que a tela usa — o
 * agente não tem via especial que ignore a trava anti-double-booking.
 */
import { z } from "zod";

import {
  listAvailableSlotsHandler,
  listAppointmentsHandler,
  createAppointmentHandler,
  updateAppointmentHandler,
} from "@/app/api/v1/appointments/_handler";
import { listProductsHandler } from "@/app/api/v1/products/_handler";
import type { McpToolDefinition } from "../types";

// ---------------------------------------------------------------------------
// search catalog
// ---------------------------------------------------------------------------

const searchCatalogInputShape = {
  search: z.string().optional(),
  type: z.enum(["product", "service"]).optional(),
  /** true = só itens que exigem agendamento (os que crm_create_appointment aceita). */
  requires_scheduling: z.boolean().optional(),
};

export const crmSearchCatalog: McpToolDefinition<typeof searchCatalogInputShape> = {
  name: "crm_search_catalog",
  description:
    "Busca produtos e serviços do catálogo — nome, preço e duração. Use pra responder 'quanto custa' " +
    "ou pra achar o product_id de um serviço antes de crm_list_available_slots. Só devolve itens ativos.",
  inputSchema: searchCatalogInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const products = await listProductsHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      { ...input, include_inactive: false },
    );
    return { products };
  },
};

// ---------------------------------------------------------------------------
// list available slots
// ---------------------------------------------------------------------------

const listSlotsInputShape = {
  product_id: z.string().uuid(),
  /** Omitido = varre todos os recursos que executam o serviço e devolve o primeiro livre de cada. */
  resource_id: z.string().uuid().optional(),
  date_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
  date_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD"),
};

export const crmListAvailableSlots: McpToolDefinition<typeof listSlotsInputShape> = {
  name: "crm_list_available_slots",
  description:
    "Lista horários livres pra marcar um serviço, num intervalo de datas (máx. 31 dias). " +
    "Se resource_id for omitido, varre todos os profissionais/salas que executam esse serviço. " +
    "Use antes de crm_create_appointment pra oferecer horários reais ao cliente.",
  inputSchema: listSlotsInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const slots = await listAvailableSlotsHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      input,
    );
    return { slots };
  },
};

// ---------------------------------------------------------------------------
// list appointments
// ---------------------------------------------------------------------------

const listAppointmentsInputShape = {
  resource_id: z.string().uuid().optional(),
  lead_id: z.string().uuid().optional(),
  status: z.enum(["scheduled", "confirmed", "completed", "cancelled", "no_show"]).optional(),
  starts_from: z.string().optional(),
  starts_to: z.string().optional(),
};

export const crmListAppointments: McpToolDefinition<typeof listAppointmentsInputShape> = {
  name: "crm_list_appointments",
  description:
    "Lista agendamentos, com filtro por recurso, lead ou status. Use pra responder 'quando é meu horário' " +
    "ou pra conferir se um lead já tem algo marcado antes de criar outro.",
  inputSchema: listAppointmentsInputShape,
  category: "read",
  requiresRole: "agent",
  requiresScope: "mcp:read",
  handler: async (input, ctx) => {
    const appointments = await listAppointmentsHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      input,
    );
    return { appointments };
  },
};

// ---------------------------------------------------------------------------
// create
// ---------------------------------------------------------------------------

const createInputShape = {
  resource_id: z.string().uuid(),
  product_id: z.string().uuid(),
  /** ISO 8601 com offset — use um slot_start devolvido por crm_list_available_slots. */
  starts_at: z.string(),
  lead_id: z.string().uuid().optional(),
  contact_id: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
};

export const crmCreateAppointment: McpToolDefinition<typeof createInputShape> = {
  name: "crm_create_appointment",
  description:
    "Marca um agendamento. `starts_at` deve ser um horário que crm_list_available_slots devolveu — " +
    "se o horário já não estiver mais livre (outra marcação concorrente), a chamada falha com " +
    "slot_unavailable e você deve buscar horários de novo. `ends_at` é calculado pelo servidor.",
  inputSchema: createInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const appointment = await createAppointmentHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      input,
    );
    return { appointment };
  },
};

// ---------------------------------------------------------------------------
// reschedule
// ---------------------------------------------------------------------------

const rescheduleInputShape = {
  appointment_id: z.string().uuid(),
  /** Novo horário — mesma duração original é preservada. */
  starts_at: z.string(),
};

export const crmRescheduleAppointment: McpToolDefinition<typeof rescheduleInputShape> = {
  name: "crm_reschedule_appointment",
  description:
    "Remarca um agendamento existente pra um novo horário, mantendo a mesma duração. " +
    "Falha com slot_unavailable se o novo horário colidir com outro agendamento do mesmo recurso.",
  inputSchema: rescheduleInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const appointment = await updateAppointmentHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      input.appointment_id,
      { starts_at: input.starts_at },
    );
    return { appointment };
  },
};

// ---------------------------------------------------------------------------
// cancel
// ---------------------------------------------------------------------------

const cancelInputShape = {
  appointment_id: z.string().uuid(),
  reason: z.string().min(1).max(500),
};

export const crmCancelAppointment: McpToolDefinition<typeof cancelInputShape> = {
  name: "crm_cancel_appointment",
  description: "Cancela um agendamento. O motivo é obrigatório e fica registrado na timeline do lead.",
  inputSchema: cancelInputShape,
  category: "write",
  requiresRole: "agent",
  requiresScope: "mcp:write",
  handler: async (input, ctx) => {
    const appointment = await updateAppointmentHandler(
      ctx.supabase,
      { organization_id: ctx.organizationId, actor: ctx.actor, requestId: ctx.requestId },
      input.appointment_id,
      { status: "cancelled", cancel_reason: input.reason },
    );
    return { appointment };
  },
};
