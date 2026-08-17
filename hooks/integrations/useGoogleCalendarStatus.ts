"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface CalendarConnection {
  id: string;
  resource_id: string | null;
  external_calendar_id: string;
  status: "connected" | "disconnected" | "error";
  last_synced_at: string | null;
  last_error: string | null;
  created_at: string;
}

export interface GoogleCalendarStatus {
  configured: boolean;
  connection: CalendarConnection | null;
}

export const googleCalendarStatusKey = (resourceId: string) => ["google-calendar-status", resourceId];

/** Spec 18 §4 — status da integração Google Agenda pra um recurso. */
export function useGoogleCalendarStatus(resourceId: string | null) {
  return useQuery({
    queryKey: googleCalendarStatusKey(resourceId ?? ""),
    queryFn: async () =>
      apiClient.get<{ data: GoogleCalendarStatus }>(
        `/api/v1/integrations/google-calendar/status?resource_id=${resourceId}`,
      ),
    enabled: !!resourceId,
    staleTime: 15_000,
    select: (res) => res.data,
  });
}
