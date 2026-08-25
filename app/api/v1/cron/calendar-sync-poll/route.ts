/**
 * GET/POST /api/v1/cron/calendar-sync-poll
 *
 * Poll de segurança do sync com Google Agenda (spec 18 §4.2) — cobre VPS sem
 * domínio público (webhook do Google não alcança) ou canal de watch expirado
 * sem renovar. Roda a cada ~15min: por conexão `connected` sem sync recente,
 * emite `calendar_connection.sync_requested` — o trabalho pesado (chamar a API
 * do Google) fica no dispatcher genérico do event_log
 * (workers/calendar-sync-pull.handler.ts), não aqui.
 *
 * Auth: mesmo contrato dos demais crons (Bearer INTERNAL_CRON_SECRET|INTERNAL_SECRET).
 *
 * NOTA DE DEPLOY: sem `vercel.json` neste repo (self-host) — agenda no serviço
 * `scheduler` do `docker-compose.prod.yml`, junto dos outros crons.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { comBatimento } from "@/lib/cron/com-batimento";

export const dynamic = "force-dynamic";

/** Não repete sync de uma conexão que já rodou há pouco (mesmo sem webhook, o
 * poll sozinho já cobriria a latência esperada). */
const MIN_INTERVAL_MS = 10 * 60 * 1000;
const SCAN_LIMIT = 200;

export interface PollResult {
  scanned: number;
  requested: number;
}

export async function pollCalendarConnections(admin: ReturnType<typeof createAdminClient>): Promise<PollResult> {
  const cutoff = new Date(Date.now() - MIN_INTERVAL_MS).toISOString();
  const { data, error } = await admin
    .from("crm_calendar_connections")
    .select("id, organization_id")
    .eq("status", "connected")
    .or(`last_synced_at.is.null,last_synced_at.lt.${cutoff}`)
    .limit(SCAN_LIMIT);

  if (error) throw new Error(`query_failed: ${error.message}`);
  const connections = data ?? [];

  let requested = 0;
  for (const conn of connections) {
    const { error: emitErr } = await admin.rpc("emit_event", {
      p_event_type: "calendar_connection.sync_requested",
      p_entity_kind: "calendar_connection",
      p_entity_id: conn.id,
      p_payload: { connection_id: conn.id },
      p_metadata: { source: "calendar-sync-poll" },
      p_organization_id: conn.organization_id,
    });
    if (emitErr) {
      logger.warn("[calendar-sync-poll] emit falhou", { connection_id: conn.id, error: emitErr.message });
      continue;
    }
    requested += 1;
  }

  return { scanned: connections.length, requested };
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  try {
    const result = await pollCalendarConnections(createAdminClient());
    return ok(result, { requestId });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[calendar-sync-poll] falhou", { error: detail, requestId });
    return fail("internal_error", "Failed to poll calendar connections.", 500, { requestId });
  }
}

async function getInterno(req: NextRequest): Promise<Response> {
  return handle(req);
}

async function postInterno(req: NextRequest): Promise<Response> {
  return handle(req);
}

// Batimento de cron — ver lib/cron/com-batimento.ts. O nome vem do segmento
// da rota, que é o mesmo que o crontab do docker-compose.prod.yml escreve.
export const GET = comBatimento("calendar-sync-poll", getInterno);
export const POST = comBatimento("calendar-sync-poll", postInterno);
