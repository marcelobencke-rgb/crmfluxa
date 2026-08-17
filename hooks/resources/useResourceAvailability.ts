"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface AvailabilitySlot {
  id: string;
  organization_id: string;
  resource_id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  created_at: string;
}

export const resourceAvailabilityKey = (resourceId: string) => ["crm-resource-availability", resourceId];

/** Grade semanal recorrente de um recurso (spec 18 §2.4). */
export function useResourceAvailability(resourceId: string | null) {
  return useQuery({
    queryKey: resourceAvailabilityKey(resourceId ?? ""),
    queryFn: async () =>
      apiClient.get<{ data: AvailabilitySlot[] }>(`/api/v1/resources/${resourceId}/availability`),
    enabled: !!resourceId,
    staleTime: 30_000,
    select: (res) => res.data,
  });
}
