/**
 * Cliente fino da Google Calendar API v3 — fetch puro, sem SDK novo.
 * https://developers.google.com/calendar/api/v3/reference/events
 */

import { GOOGLE_CALENDAR_API_BASE } from "./config";

export interface GoogleApiResult<T> {
  ok: boolean;
  status: number;
  data: T | null;
  errorMessage?: string;
}

async function call<T>(
  accessToken: string,
  path: string,
  init: RequestInit = {},
): Promise<GoogleApiResult<T>> {
  let res: Response;
  try {
    res = await fetch(`${GOOGLE_CALENDAR_API_BASE}${path}`, {
      ...init,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        ...(init.headers ?? {}),
      },
      cache: "no-store",
    });
  } catch (err) {
    return { ok: false, status: 0, data: null, errorMessage: (err as Error).message };
  }

  if (res.status === 204) return { ok: true, status: 204, data: null };

  const text = await res.text();
  let parsed: unknown = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    // corpo não-JSON — mantém null, o status já diz se foi ok
  }

  if (!res.ok) {
    const errBody = parsed as { error?: { message?: string } } | null;
    return {
      ok: false,
      status: res.status,
      data: null,
      errorMessage: errBody?.error?.message ?? (text || `HTTP ${res.status}`),
    };
  }
  return { ok: true, status: res.status, data: parsed as T };
}

export interface GoogleEventInput {
  summary: string;
  description?: string | null;
  startIso: string; // RFC3339 com offset
  endIso: string;
}

export interface GoogleEvent {
  id: string;
  status?: string; // "confirmed" | "cancelled" | ...
  summary?: string;
  start?: { dateTime?: string };
  end?: { dateTime?: string };
  updated?: string;
}

export function createEvent(
  accessToken: string,
  calendarId: string,
  input: GoogleEventInput,
): Promise<GoogleApiResult<GoogleEvent>> {
  return call<GoogleEvent>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
    method: "POST",
    body: JSON.stringify({
      summary: input.summary,
      description: input.description ?? undefined,
      start: { dateTime: input.startIso },
      end: { dateTime: input.endIso },
    }),
  });
}

export function updateEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
  input: GoogleEventInput,
): Promise<GoogleApiResult<GoogleEvent>> {
  return call<GoogleEvent>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    {
      method: "PATCH",
      body: JSON.stringify({
        summary: input.summary,
        description: input.description ?? undefined,
        start: { dateTime: input.startIso },
        end: { dateTime: input.endIso },
      }),
    },
  );
}

export function deleteEvent(
  accessToken: string,
  calendarId: string,
  eventId: string,
): Promise<GoogleApiResult<null>> {
  return call<null>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    { method: "DELETE" },
  );
}

export interface ListEventsResult {
  items: GoogleEvent[];
  nextSyncToken?: string;
  nextPageToken?: string;
}

/**
 * `syncToken` ausente = full sync (janela `timeMinIso`..`timeMaxIso`, obrigatória
 * nesse caso). `syncToken` presente = incremental; se o Google devolver 410, o
 * token expirou e quem chama precisa refazer o full sync (sem token).
 */
export function listEvents(
  accessToken: string,
  calendarId: string,
  opts: { syncToken?: string; timeMinIso?: string; timeMaxIso?: string; pageToken?: string },
): Promise<GoogleApiResult<ListEventsResult>> {
  const qs = new URLSearchParams();
  if (opts.syncToken) qs.set("syncToken", opts.syncToken);
  if (opts.timeMinIso) qs.set("timeMin", opts.timeMinIso);
  if (opts.timeMaxIso) qs.set("timeMax", opts.timeMaxIso);
  if (opts.pageToken) qs.set("pageToken", opts.pageToken);
  qs.set("singleEvents", "true");
  return call<ListEventsResult>(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events?${qs.toString()}`,
  );
}

export interface WatchResult {
  id: string; // channel id que nós geramos
  resourceId: string; // id de recurso do canal, do Google
  expiration?: string; // epoch ms, string
}

export function watch(
  accessToken: string,
  calendarId: string,
  channelId: string,
  channelToken: string,
  webhookUrl: string,
): Promise<GoogleApiResult<WatchResult>> {
  return call<WatchResult>(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/watch`, {
    method: "POST",
    body: JSON.stringify({ id: channelId, type: "web_hook", address: webhookUrl, token: channelToken }),
  });
}

export function stopWatch(
  accessToken: string,
  channelId: string,
  resourceId: string,
): Promise<GoogleApiResult<null>> {
  return call<null>(accessToken, `/channels/stop`, {
    method: "POST",
    body: JSON.stringify({ id: channelId, resourceId }),
  });
}
