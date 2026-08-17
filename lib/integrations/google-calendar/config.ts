/**
 * Google Calendar integration — static config + env-derived credentials.
 *
 * `GOOGLE_OAUTH_CLIENT_ID`/`_SECRET` são opcionais (eixo self-host, regra nº1):
 * `getConfig()` devolve null quando ausentes, e quem chama trata como "integração
 * não configurada" (esconde o botão de conectar, nunca erro 500). Ver spec 18 §4.4.
 */

export const GOOGLE_AUTH_BASE = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_CALENDAR_API_BASE = "https://www.googleapis.com/calendar/v3";
export const GOOGLE_CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

export interface GoogleCalendarConfig {
  clientId: string;
  clientSecret: string;
}

export function getConfig(): GoogleCalendarConfig | null {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID || "";
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET || "";
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

export function isConfigured(): boolean {
  return getConfig() !== null;
}

export function redirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/$/, "")}/api/v1/integrations/google-calendar/callback`;
}
