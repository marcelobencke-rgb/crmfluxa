/**
 * GET /api/v1/integrations/google-calendar/callback
 *
 * OAuth callback. Valida state, troca code por token, cifra e grava em
 * crm_calendar_connections. Falha redireciona pra Recursos com `?gcal_error=<code>`.
 *
 * Spec: docs/specs/18-spec-agendamento-catalogo.md §4.
 */
import { randomUUID } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { loadAuthUser } from "@/lib/auth/server";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { getConfig, redirectUri } from "@/lib/integrations/google-calendar/config";
import { exchangeCodeForToken } from "@/lib/integrations/google-calendar/oauth";
import { verifyState } from "@/lib/integrations/google-calendar/state";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

function redirectTo(path: string): NextResponse {
  const base = env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(new URL(path, base));
}

export async function GET(req: NextRequest): Promise<NextResponse> {
  const requestId = randomUUID();
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const stateParam = url.searchParams.get("state");
  const oauthError = url.searchParams.get("error");

  const cfg = getConfig();
  if (!cfg) return redirectTo("/app/resources?gcal_error=not_configured");

  const state = verifyState(stateParam);
  if (!state) return redirectTo("/app/resources?gcal_error=invalid_state");

  if (oauthError || !code) {
    void audit({
      action: "calendar_connection.oauth_failed",
      organizationId: state.orgId,
      requestId,
      metadata: { reason: oauthError ?? "missing_code" },
    });
    return redirectTo("/app/resources?gcal_error=oauth_denied");
  }

  const tokenRes = await exchangeCodeForToken(code, redirectUri(env.NEXT_PUBLIC_APP_URL), cfg);
  if (!tokenRes.ok) {
    void audit({
      action: "calendar_connection.oauth_failed",
      organizationId: state.orgId,
      requestId,
      metadata: { reason: tokenRes.error, status: tokenRes.status ?? null },
    });
    return redirectTo("/app/resources?gcal_error=token_exchange_failed");
  }
  if (!tokenRes.refreshToken) {
    // Sem refresh_token a conexão morre em ~1h (validade do access_token) — melhor
    // falhar aqui, explícito, do que criar uma conexão que vai parar de sincronizar
    // sozinha sem aviso nenhum.
    void audit({
      action: "calendar_connection.oauth_failed",
      organizationId: state.orgId,
      requestId,
      metadata: { reason: "no_refresh_token" },
    });
    return redirectTo("/app/resources?gcal_error=no_refresh_token");
  }

  const admin = createAdminClient();

  const [accessEnc, refreshEnc] = await Promise.all([
    admin.rpc("fn_encrypt_oauth", { plaintext: tokenRes.accessToken }),
    admin.rpc("fn_encrypt_oauth", { plaintext: tokenRes.refreshToken }),
  ]);
  if (accessEnc.error || !accessEnc.data || refreshEnc.error || !refreshEnc.data) {
    logger.error("[google-calendar.callback] encrypt falhou", {
      requestId,
      accessErr: accessEnc.error?.message,
      refreshErr: refreshEnc.error?.message,
    });
    void audit({
      action: "calendar_connection.oauth_failed",
      organizationId: state.orgId,
      requestId,
      metadata: { reason: "encrypt_failed" },
    });
    return redirectTo("/app/resources?gcal_error=encrypt_failed");
  }

  const tokenExpiresAt = new Date(Date.now() + tokenRes.expiresInSeconds * 1000).toISOString();
  const authUser = await loadAuthUser();

  const row = {
    organization_id: state.orgId,
    resource_id: state.resourceId,
    provider: "google" as const,
    // "primary" é um alias válido da Calendar API pra agenda principal da conta —
    // dispensa uma segunda chamada só pra descobrir o calendar_id de verdade.
    external_calendar_id: "primary",
    oauth_access_token_encrypted: accessEnc.data,
    oauth_refresh_token_encrypted: refreshEnc.data,
    token_expires_at: tokenExpiresAt,
    status: "connected",
    last_error: null,
    connected_by_user_id: authUser?.id ?? null,
  };

  // Sem .upsert(onConflict:...): os dois índices únicos de crm_calendar_connections
  // são PARCIAIS (resource_id is/is not null), e o Postgres só infere um índice
  // parcial como alvo de ON CONFLICT se a cláusula repetir o WHERE — que o parâmetro
  // onConflict do supabase-js não permite passar. Select-then-upsert evita depender
  // disso (mesma lição da migration 0146 sobre tenant_integrations).
  let existingQuery = admin
    .from("crm_calendar_connections")
    .select("id")
    .eq("organization_id", state.orgId);
  existingQuery = state.resourceId
    ? existingQuery.eq("resource_id", state.resourceId)
    : existingQuery.is("resource_id", null);
  const { data: existing } = await existingQuery.maybeSingle();

  const { error: upsertErr } = existing
    ? await admin.from("crm_calendar_connections").update(row).eq("id", existing.id)
    : await admin.from("crm_calendar_connections").insert(row);
  if (upsertErr) {
    logger.error("[google-calendar.callback] upsert falhou", { requestId, error: upsertErr.message });
    void audit({
      action: "calendar_connection.oauth_failed",
      organizationId: state.orgId,
      requestId,
      metadata: { reason: "db_upsert_failed" },
    });
    return redirectTo("/app/resources?gcal_error=db_upsert_failed");
  }

  void audit({
    action: "calendar_connection.connected",
    organizationId: state.orgId,
    resourceType: "crm_calendar_connection",
    resourceId: state.resourceId ?? state.orgId,
    requestId,
    metadata: { resource_id: state.resourceId },
  });
  return redirectTo("/app/resources?gcal_ok=1");
}
