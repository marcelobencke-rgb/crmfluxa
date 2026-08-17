/**
 * Google OAuth2 helpers — authorize URL + troca/renovação de token.
 * Endpoints: https://developers.google.com/identity/protocols/oauth2/web-server
 */

import { GOOGLE_AUTH_BASE, GOOGLE_CALENDAR_SCOPE, GOOGLE_TOKEN_URL, type GoogleCalendarConfig } from "./config";

export interface BuildAuthorizeUrlInput {
  cfg: GoogleCalendarConfig;
  redirectUri: string;
  state: string;
}

export function buildAuthorizeUrl({ cfg, redirectUri, state }: BuildAuthorizeUrlInput): string {
  const url = new URL(GOOGLE_AUTH_BASE);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", GOOGLE_CALENDAR_SCOPE);
  // access_type=offline pra ganhar refresh_token; prompt=consent força o Google a
  // reemitir mesmo se o usuário já autorizou antes (senão só vem no primeiro consent).
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  url.searchParams.set("state", state);
  return url.toString();
}

export interface TokenSuccess {
  ok: true;
  accessToken: string;
  refreshToken: string | null;
  expiresInSeconds: number;
  scope: string;
}
export interface TokenFailure {
  ok: false;
  error: string;
  status?: number;
  raw?: string;
}
export type TokenResult = TokenSuccess | TokenFailure;

interface RawTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
}

async function postToken(params: Record<string, string>): Promise<TokenResult> {
  let res: Response;
  try {
    res = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params).toString(),
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, error: "network_error", raw: (err as Error).message };
  }

  const text = await res.text();
  let parsed: RawTokenResponse;
  try {
    parsed = JSON.parse(text) as RawTokenResponse;
  } catch {
    return { ok: false, error: "invalid_token_response", status: res.status, raw: text };
  }

  if (!res.ok || !parsed.access_token) {
    return {
      ok: false,
      error: parsed.error ?? "token_exchange_failed",
      status: res.status,
      raw: parsed.error_description ?? text,
    };
  }

  return {
    ok: true,
    accessToken: parsed.access_token,
    refreshToken: parsed.refresh_token ?? null,
    expiresInSeconds: parsed.expires_in ?? 3600,
    scope: parsed.scope ?? GOOGLE_CALENDAR_SCOPE,
  };
}

export function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  cfg: GoogleCalendarConfig,
): Promise<TokenResult> {
  return postToken({
    code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: redirectUri,
    grant_type: "authorization_code",
  });
}

/** Renova o access_token. Google não reemite refresh_token aqui (refreshToken volta null). */
export function refreshAccessToken(
  refreshToken: string,
  cfg: GoogleCalendarConfig,
): Promise<TokenResult> {
  return postToken({
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
}
