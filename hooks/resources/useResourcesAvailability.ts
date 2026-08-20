"use client";
import { useQueries } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { resourceAvailabilityKey, type AvailabilitySlot } from "./useResourceAvailability";

/**
 * Disponibilidade semanal de vários recursos de uma vez — usado pra grade dia/semana da
 * agenda calcular a janela de horário a mostrar (spec 18: parar de exibir 07h-21h fixo
 * quando o expediente real é mais curto). Um fetch por recurso (endpoint só existe por
 * `[id]`), em paralelo via `useQueries` — não é N+1 sequencial, e o número de recursos
 * ativos de uma organização é pequeno (profissionais/salas), não uma lista que cresce.
 */
export function useResourcesAvailability(resourceIds: string[]) {
  const results = useQueries({
    queries: resourceIds.map((id) => ({
      queryKey: resourceAvailabilityKey(id),
      queryFn: async () => apiClient.get<{ data: AvailabilitySlot[] }>(`/api/v1/resources/${id}/availability`),
      staleTime: 30_000,
      select: (res: { data: AvailabilitySlot[] }) => res.data,
    })),
  });

  const isLoading = results.some((r) => r.isLoading);
  const data = results.flatMap((r) => r.data ?? []);
  return { data, isLoading };
}
