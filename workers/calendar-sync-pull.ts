/**
 * Pull do Google Agenda — importa mudanças feitas DIRETO no Google pro Fluxa
 * (spec 18 §4.2). Disparado por dois caminhos, ambos via event_log:
 *  - webhook do Google (`calendar_connection.sync_requested`, emitido por
 *    app/api/v1/integrations/google-calendar/webhook/route.ts);
 *  - poll de segurança (app/api/v1/cron/calendar-sync-poll/route.ts), que cobre
 *    VPS sem domínio público ou canal de watch expirado sem renovar.
 *
 * Toda escrita que vem de um evento do Google passa por
 * `fn_crm_pull_upsert_appointment` (migration 0147) — nunca `.update()`/`.insert()`
 * direto — porque só dentro dessa RPC o `SET LOCAL fluxa.sync_origin` consegue
 * durar até o trigger de push rodar na mesma transação (ver comentário na 0147).
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import type { EventRow, HandlerResult } from "@/lib/event-log/dispatcher";
import { listEvents, type GoogleEvent } from "@/lib/integrations/google-calendar/client";
import { getValidAccessToken } from "@/lib/integrations/google-calendar/tokens";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const CALENDAR_SYNC_PULL_HANDLER_KEY = "calendar-sync-pull.v1";

const FULL_SYNC_PAST_DAYS = 7;
const FULL_SYNC_FUTURE_DAYS = 180;
const MAX_PAGES = 10;

interface ConnectionRow {
  id: string;
  organization_id: string;
  resource_id: string | null;
  external_calendar_id: string;
  sync_token: string | null;
  status: string;
  oauth_access_token_encrypted: string;
  oauth_refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

export interface PullResult {
  ok: boolean;
  error?: string;
  eventsProcessed?: number;
}

function isoWindow(): { timeMinIso: string; timeMaxIso: string } {
  const now = Date.now();
  return {
    timeMinIso: new Date(now - FULL_SYNC_PAST_DAYS * 86_400_000).toISOString(),
    timeMaxIso: new Date(now + FULL_SYNC_FUTURE_DAYS * 86_400_000).toISOString(),
  };
}

async function applyEvent(
  admin: SupabaseClient,
  conn: ConnectionRow,
  event: GoogleEvent,
): Promise<void> {
  const { data: local } = await admin
    .from("crm_appointments")
    .select("id")
    .eq("external_calendar_connection_id", conn.id)
    .eq("external_calendar_event_id", event.id)
    .maybeSingle();

  if (event.status === "cancelled") {
    if (!local) return; // evento que nunca existiu pra gente, cancelado — nada a fazer
    const { error } = await admin.rpc("fn_crm_pull_upsert_appointment", {
      p_appointment_id: local.id,
      p_organization_id: conn.organization_id,
      p_resource_id: null,
      p_starts_at: null,
      p_ends_at: null,
      p_status: "cancelled",
      p_cancel_reason: "synced_from_google",
      p_external_calendar_connection_id: conn.id,
      p_external_calendar_event_id: event.id,
    });
    if (error) logger.warn("[calendar-sync-pull] cancelar local falhou", { error: error.message, event_id: event.id });
    return;
  }

  const startIso = event.start?.dateTime;
  const endIso = event.end?.dateTime;
  // Evento de dia inteiro (sem horário) não mapeia pra um agendamento — fora do
  // escopo do MVP (spec não cobre "bloquear o dia todo").
  if (!startIso || !endIso) return;

  if (local) {
    const { error } = await admin.rpc("fn_crm_pull_upsert_appointment", {
      p_appointment_id: local.id,
      p_organization_id: conn.organization_id,
      p_resource_id: null,
      p_starts_at: startIso,
      p_ends_at: endIso,
      p_status: null,
      p_cancel_reason: null,
      p_external_calendar_connection_id: conn.id,
      p_external_calendar_event_id: event.id,
    });
    if (error) logger.warn("[calendar-sync-pull] atualizar local falhou", { error: error.message, event_id: event.id });
    return;
  }

  // Evento novo criado direto no Google. Só importável como bloqueio de agenda
  // quando a conexão é de um recurso específico — conexão padrão da org (sem
  // resource_id) não tem pra quem atribuir o bloqueio.
  if (!conn.resource_id) return;
  const { error } = await admin.rpc("fn_crm_pull_upsert_appointment", {
    p_appointment_id: null,
    p_organization_id: conn.organization_id,
    p_resource_id: conn.resource_id,
    p_starts_at: startIso,
    p_ends_at: endIso,
    p_status: "scheduled",
    p_cancel_reason: null,
    p_external_calendar_connection_id: conn.id,
    p_external_calendar_event_id: event.id,
  });
  if (error) {
    // 23P01 (exclusion constraint) é o caso esperado de double-booking real —
    // detectado, não escondido (spec §4.2: "overbooking detectado é sinal").
    logger.warn("[calendar-sync-pull] importar bloqueio falhou", {
      error: error.message,
      code: (error as { code?: string }).code,
      event_id: event.id,
      resource_id: conn.resource_id,
    });
  }
}

export async function pullConnection(admin: SupabaseClient, connectionId: string): Promise<PullResult> {
  const { data: conn, error: connErr } = await admin
    .from("crm_calendar_connections")
    .select(
      "id, organization_id, resource_id, external_calendar_id, sync_token, status, oauth_access_token_encrypted, oauth_refresh_token_encrypted, token_expires_at",
    )
    .eq("id", connectionId)
    .maybeSingle();
  if (connErr) return { ok: false, error: connErr.message };
  if (!conn || conn.status !== "connected") return { ok: true, eventsProcessed: 0 };
  const connection = conn as ConnectionRow;

  const accessToken = await getValidAccessToken(admin, connection);
  if (!accessToken) return { ok: false, error: "token indisponível" };

  let syncToken = connection.sync_token ?? undefined;
  let pageToken: string | undefined;
  let nextSyncToken: string | undefined;
  let processed = 0;
  let pages = 0;
  let didFullSyncFallback = false;

  for (;;) {
    pages += 1;
    if (pages > MAX_PAGES) break;

    const res = await listEvents(accessToken, connection.external_calendar_id, {
      syncToken,
      pageToken,
      ...(syncToken ? {} : isoWindow()),
    });

    if (!res.ok) {
      // 410 Gone = syncToken expirado/inválido — cai pra full sync UMA vez.
      if (res.status === 410 && syncToken && !didFullSyncFallback) {
        syncToken = undefined;
        pageToken = undefined;
        didFullSyncFallback = true;
        continue;
      }
      return { ok: false, error: res.errorMessage, eventsProcessed: processed };
    }

    for (const event of res.data?.items ?? []) {
      await applyEvent(admin, connection, event);
      processed += 1;
    }
    if (res.data?.nextSyncToken) nextSyncToken = res.data.nextSyncToken;
    pageToken = res.data?.nextPageToken;
    if (!pageToken) break;
  }

  await admin
    .from("crm_calendar_connections")
    .update({
      sync_token: nextSyncToken ?? connection.sync_token,
      last_synced_at: new Date().toISOString(),
      status: "connected",
      last_error: null,
    })
    .eq("id", connection.id);

  return { ok: true, eventsProcessed: processed };
}

export async function processCalendarSyncPull(row: EventRow): Promise<HandlerResult> {
  const admin = createAdminClient();
  const connectionId = (row.payload as { connection_id?: string }).connection_id;
  if (!connectionId) {
    return { consumer_key: CALENDAR_SYNC_PULL_HANDLER_KEY, status: "skipped", detail: "sem connection_id" };
  }

  const result = await pullConnection(admin, connectionId);
  if (!result.ok) {
    await admin
      .from("crm_calendar_connections")
      .update({ status: "error", last_error: result.error ?? "pull falhou" })
      .eq("id", connectionId);
    return { consumer_key: CALENDAR_SYNC_PULL_HANDLER_KEY, status: "retry", detail: result.error };
  }
  return { consumer_key: CALENDAR_SYNC_PULL_HANDLER_KEY, status: "ok" };
}
