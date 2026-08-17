/**
 * Adapter que expõe `calendar-sync-push` ao dispatcher do event_log.
 * Ver workers/rag-indexer.handler.ts pro mesmo padrão.
 */
import type { EventHandler } from "@/lib/event-log/dispatcher";
import { CALENDAR_SYNC_PUSH_HANDLER_KEY, processCalendarSyncPush } from "@/workers/calendar-sync-push";

export const calendarSyncPushHandler: EventHandler = {
  key: CALENDAR_SYNC_PUSH_HANDLER_KEY,
  events: ["appointment.upserted", "appointment.cancelled"],
  handle: processCalendarSyncPush,
};
