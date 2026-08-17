"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface ResourceService {
  id: string;
  organization_id: string;
  resource_id: string;
  product_id: string;
  duration_minutes_override: number | null;
  price_cents_override: number | null;
  created_at: string;
  product: {
    id: string;
    name: string;
    type: "product" | "service";
    price_cents: number;
    duration_minutes: number | null;
  } | null;
}

export const resourceServicesKey = (resourceId: string) => ["crm-resource-services", resourceId];

/** Serviços que um recurso executa (spec 18 §2.3). */
export function useResourceServices(resourceId: string | null) {
  return useQuery({
    queryKey: resourceServicesKey(resourceId ?? ""),
    queryFn: async () =>
      apiClient.get<{ data: ResourceService[] }>(`/api/v1/resources/${resourceId}/services`),
    enabled: !!resourceId,
    staleTime: 30_000,
    select: (res) => res.data,
  });
}
