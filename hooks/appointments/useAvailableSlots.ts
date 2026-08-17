"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface FreeSlot {
  resource_id: string;
  slot_start: string;
  slot_end: string;
}

interface Params {
  resourceId: string | null;
  productId: string | null;
  dateFrom: string | null;
  dateTo: string | null;
}

/** Spec 18 §5 — horários livres pra marcar um serviço com um recurso. */
export function useAvailableSlots({ resourceId, productId, dateFrom, dateTo }: Params) {
  return useQuery({
    queryKey: ["crm-available-slots", resourceId, productId, dateFrom, dateTo],
    queryFn: async () => {
      const qs = new URLSearchParams({
        resource_id: resourceId ?? "",
        product_id: productId ?? "",
        date_from: dateFrom ?? "",
        date_to: dateTo ?? "",
      });
      return apiClient.get<{ data: FreeSlot[] }>(`/api/v1/appointments/available-slots?${qs}`);
    },
    enabled: !!resourceId && !!productId && !!dateFrom && !!dateTo,
    staleTime: 10_000,
    select: (res) => res.data,
  });
}
