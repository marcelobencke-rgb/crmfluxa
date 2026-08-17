/**
 * Token válido pra uma conexão — decifra, renova se expirado, persiste o novo
 * access_token. Compartilhado entre o worker de push e o de pull (spec 18 §4.4):
 * duplicar essa lógica nos dois seria duplicar exatamente o ponto em que um bug
 * de renovação vira sync quebrado silenciosamente.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { decryptWebhookSecret, encryptWebhookSecret } from "@/lib/webhooks/secrets";
import { logger } from "@/lib/logger";
import { getConfig } from "./config";
import { refreshAccessToken } from "./oauth";

interface ConnectionTokenRow {
  id: string;
  oauth_access_token_encrypted: string;
  oauth_refresh_token_encrypted: string | null;
  token_expires_at: string | null;
}

/** Margem de segurança — renova um pouco antes do vencimento real. */
const EXPIRY_SKEW_MS = 60_000;

export async function getValidAccessToken(
  admin: SupabaseClient,
  conn: ConnectionTokenRow,
): Promise<string | null> {
  const expiresAt = conn.token_expires_at ? new Date(conn.token_expires_at).getTime() : 0;
  const stillValid = expiresAt > Date.now() + EXPIRY_SKEW_MS;

  const current = await decryptWebhookSecret(admin, conn.oauth_access_token_encrypted);
  if (!current) return null;
  if (stillValid) return current;

  if (!conn.oauth_refresh_token_encrypted) {
    logger.warn("[google-calendar.tokens] access_token expirado sem refresh_token", {
      connection_id: conn.id,
    });
    return null;
  }
  const refreshToken = await decryptWebhookSecret(admin, conn.oauth_refresh_token_encrypted);
  if (!refreshToken) return null;

  const cfg = getConfig();
  if (!cfg) return null;

  const refreshed = await refreshAccessToken(refreshToken, cfg);
  if (!refreshed.ok) {
    logger.warn("[google-calendar.tokens] refresh falhou", {
      connection_id: conn.id,
      error: refreshed.error,
    });
    await admin
      .from("crm_calendar_connections")
      .update({ status: "error", last_error: `refresh_failed: ${refreshed.error}` })
      .eq("id", conn.id);
    return null;
  }

  const newAccessEnc = await encryptWebhookSecret(admin, refreshed.accessToken);
  if (newAccessEnc) {
    await admin
      .from("crm_calendar_connections")
      .update({
        oauth_access_token_encrypted: newAccessEnc,
        token_expires_at: new Date(Date.now() + refreshed.expiresInSeconds * 1000).toISOString(),
        status: "connected",
        last_error: null,
      })
      .eq("id", conn.id);
  }

  return refreshed.accessToken;
}
