/**
 * POST /api/v1/integrations/google-calendar/webhook
 *
 * Google Calendar push notification (events.watch). O corpo NÃO traz o que
 * mudou — é assim por design do Google, anti-spoofing — só avisa "algo mudou".
 * Autenticação é o header X-Goog-Channel-Token, um segredo que NÓS geramos ao
 * criar o canal (watch), comparado em tempo constante contra o valor cifrado
 * salvo em crm_calendar_connections.watch_channel_token_encrypted.
 *
 * Não confia em nada do corpo/headers pra decidir O QUE sincronizar — só
 * dispara o pull worker pra essa conexão, que busca a verdade direto na API.
 *
 * Spec: docs/specs/18-spec-agendamento-catalogo.md §4.2.
 */
import { randomUUID } from "node:crypto";
import { timingSafeEqual } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a, "utf8");
  const bufB = Buffer.from(b, "utf8");
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const channelId = req.headers.get("x-goog-channel-id");
  const channelToken = req.headers.get("x-goog-channel-token");
  const resourceState = req.headers.get("x-goog-resource-state");

  if (!channelId || !channelToken) {
    return fail("bad_request", "Headers do Google ausentes.", 400, { requestId });
  }

  const admin = createAdminClient();
  const { data: conn, error } = await admin
    .from("crm_calendar_connections")
    .select("id, organization_id, watch_channel_token_encrypted")
    .eq("watch_channel_id", channelId)
    .maybeSingle();
  if (error) {
    logger.error("[google-calendar.webhook] busca de conexão falhou", { requestId, error: error.message });
    return fail("internal_error", "Erro ao processar notificação.", 500, { requestId });
  }
  // 404 silenciosa: canal de conexão já desconectada/apagada. Google reenviaria
  // pra sempre se respondêssemos erro — 200 sinaliza "recebido, pode parar".
  if (!conn || !conn.watch_channel_token_encrypted) return ok(null, { requestId });

  const expectedToken = await decryptWebhookSecret(
    admin,
    conn.watch_channel_token_encrypted as unknown as string,
  );
  if (!expectedToken || !safeEqual(channelToken, expectedToken)) {
    return fail("forbidden", "Token do canal inválido.", 403, { requestId });
  }

  // "sync" é o handshake inicial do watch (sem mudança real) — nada a fazer.
  if (resourceState === "sync") return ok(null, { requestId });

  const { error: emitErr } = await admin.rpc("emit_event", {
    p_event_type: "calendar_connection.sync_requested",
    p_entity_kind: "calendar_connection",
    p_entity_id: conn.id,
    p_payload: { connection_id: conn.id, resource_state: resourceState },
    p_metadata: { request_id: requestId, source: "google_webhook" },
    p_organization_id: conn.organization_id,
  });
  if (emitErr) {
    logger.error("[google-calendar.webhook] emit_event falhou", { requestId, error: emitErr.message });
  }

  return ok(null, { requestId });
}
