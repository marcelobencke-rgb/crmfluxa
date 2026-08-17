/**
 * Push de agendamento pro Google Agenda — consumidor de `appointment.upserted`/
 * `appointment.cancelled` no event_log (spec 18 §4.1).
 *
 * Sempre relê o agendamento do banco em vez de confiar no payload do evento: o
 * evento é só um sinal de "algo mudou", o estado atual é a fonte da verdade
 * (podem ter passado outras mudanças entre o evento nascer e este tick rodar).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { createEvent, updateEvent, deleteEvent } from "@/lib/integrations/google-calendar/client";
import { getValidAccessToken } from "@/lib/integrations/google-calendar/tokens";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const CALENDAR_SYNC_PUSH_HANDLER_KEY = "calendar-sync-push.v1";

interface AppointmentRow {
  id: string;
  organization_id: string;
  resource_id: string;
  product_id: string | null;
  starts_at: string;
  ends_at: string;
  status: string;
  notes: string | null;
  is_external_block: boolean;
  external_calendar_connection_id: string | null;
  external_calendar_event_id: string | null;
}

async function findConnection(admin: SupabaseClient, organizationId: string, resourceId: string) {
  const { data: byResource } = await admin
    .from("crm_calendar_connections")
    .select(
      "id, external_calendar_id, oauth_access_token_encrypted, oauth_refresh_token_encrypted, token_expires_at",
    )
    .eq("organization_id", organizationId)
    .eq("resource_id", resourceId)
    .eq("status", "connected")
    .maybeSingle();
  if (byResource) return byResource;

  const { data: byDefault } = await admin
    .from("crm_calendar_connections")
    .select(
      "id, external_calendar_id, oauth_access_token_encrypted, oauth_refresh_token_encrypted, token_expires_at",
    )
    .eq("organization_id", organizationId)
    .is("resource_id", null)
    .eq("status", "connected")
    .maybeSingle();
  return byDefault ?? null;
}

export async function processCalendarSyncPush(row: EventRow): Promise<HandlerResult> {
  const admin = createAdminClient();
  const appointmentId = (row.payload as { appointment_id?: string }).appointment_id ?? row.entity_id;
  if (!appointmentId) {
    return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "skipped", detail: "sem appointment_id" };
  }

  const { data: appt, error: apptErr } = await admin
    .from("crm_appointments")
    .select(
      "id, organization_id, resource_id, product_id, starts_at, ends_at, status, notes, is_external_block, external_calendar_connection_id, external_calendar_event_id",
    )
    .eq("id", appointmentId)
    .maybeSingle();
  if (apptErr) {
    return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "error", detail: apptErr.message };
  }
  // Apagado ou é um bloqueio importado (nunca reenviado — spec §4.1).
  if (!appt || (appt as AppointmentRow).is_external_block) {
    return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "skipped" };
  }
  const appointment = appt as AppointmentRow;

  const conn = await findConnection(admin, appointment.organization_id, appointment.resource_id);
  if (!conn) {
    // Recurso sem Google Agenda conectada — não é erro, é o caso comum.
    return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "skipped", detail: "sem conexão" };
  }

  const accessToken = await getValidAccessToken(admin, conn);
  if (!accessToken) {
    return {
      consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY,
      status: "retry",
      detail: "token indisponível (renovação falhou)",
    };
  }

  let productName = "Agendamento";
  if (appointment.product_id) {
    const { data: product } = await admin
      .from("crm_products")
      .select("name")
      .eq("id", appointment.product_id)
      .maybeSingle();
    if (product?.name) productName = product.name;
  }

  const eventInput = {
    summary: productName,
    description: appointment.notes,
    startIso: appointment.starts_at,
    endIso: appointment.ends_at,
  };

  const markSynced = async (eventId: string | null) => {
    await admin
      .from("crm_appointments")
      .update({
        external_calendar_connection_id: conn.id,
        external_calendar_event_id: eventId,
        external_calendar_sync_status: "synced",
        external_calendar_synced_at: new Date().toISOString(),
        external_calendar_sync_error: null,
      })
      .eq("id", appointment.id);
  };
  const markError = async (message: string) => {
    await admin
      .from("crm_appointments")
      .update({ external_calendar_sync_status: "error", external_calendar_sync_error: message })
      .eq("id", appointment.id);
  };

  try {
    if (appointment.status === "cancelled" || appointment.status === "no_show") {
      if (appointment.external_calendar_event_id) {
        const res = await deleteEvent(accessToken, conn.external_calendar_id, appointment.external_calendar_event_id);
        // 410 Gone = já não existe lá — sucesso pro nosso propósito.
        if (!res.ok && res.status !== 410 && res.status !== 404) {
          await markError(res.errorMessage ?? "delete falhou");
          return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "retry", detail: res.errorMessage };
        }
      }
      await markSynced(appointment.external_calendar_event_id);
      return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "ok" };
    }

    if (appointment.external_calendar_event_id) {
      const res = await updateEvent(
        accessToken,
        conn.external_calendar_id,
        appointment.external_calendar_event_id,
        eventInput,
      );
      if (!res.ok) {
        await markError(res.errorMessage ?? "update falhou");
        return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "retry", detail: res.errorMessage };
      }
      await markSynced(appointment.external_calendar_event_id);
    } else {
      const res = await createEvent(accessToken, conn.external_calendar_id, eventInput);
      if (!res.ok || !res.data?.id) {
        await markError(res.errorMessage ?? "create falhou");
        return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "retry", detail: res.errorMessage };
      }
      await markSynced(res.data.id);
    }
    return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "ok" };
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[calendar-sync-push] falhou", { appointment_id: appointment.id, error: detail });
    await markError(detail);
    return { consumer_key: CALENDAR_SYNC_PUSH_HANDLER_KEY, status: "retry", detail };
  }
}
