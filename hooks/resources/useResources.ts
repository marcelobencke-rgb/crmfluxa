"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface Resource {
  id: string;
  organization_id: string;
  type: "professional" | "room" | "equipment";
  name: string;
  user_id: string | null;
  color: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const RESOURCES_KEY = ["crm-resources"];

/** Spec 18 — recursos agendáveis (profissionais/salas/equipamentos). */
export function useResources() {
  return useQuery({
    queryKey: RESOURCES_KEY,
    queryFn: async () => apiClient.get<{ data: Resource[] }>("/api/v1/resources"),
    staleTime: 30_000,
    select: (res) => res.data,
  });
}
