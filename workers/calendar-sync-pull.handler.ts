/**
 * Adapter que expõe `calendar-sync-pull` ao dispatcher do event_log.
 * Consome `calendar_connection.sync_requested`, emitido pelo webhook do Google
 * e pelo cron de poll (app/api/v1/cron/calendar-sync-poll).
 */
import type { EventHandler } from "@/lib/event-log/dispatcher";
import { CALENDAR_SYNC_PULL_HANDLER_KEY, processCalendarSyncPull } from "@/workers/calendar-sync-pull";

export const calendarSyncPullHandler: EventHandler = {
  key: CALENDAR_SYNC_PULL_HANDLER_KEY,
  events: ["calendar_connection.sync_requested"],
  handle: processCalendarSyncPull,
};
