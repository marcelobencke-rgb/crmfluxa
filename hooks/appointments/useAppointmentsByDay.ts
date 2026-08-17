"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { APPOINTMENTS_KEY, type Appointment } from "./useAppointments";

/** -03:00 fixo — mesma simplificação documentada em lib/scheduling/slots.ts. */
const TZ_OFFSET = "-03:00";

export function dayRangeIso(dateStr: string): { starts_from: string; starts_to: string } {
  return {
    starts_from: `${dateStr}T00:00:00${TZ_OFFSET}`,
    starts_to: `${dateStr}T23:59:59${TZ_OFFSET}`,
  };
}

/** Agendamentos de um único dia — visualização em agenda (spec 18). */
export function useAppointmentsByDay(dateStr: string) {
  const { starts_from, starts_to } = dayRangeIso(dateStr);
  return useQuery({
    // Prefixado por APPOINTMENTS_KEY de propósito: invalidateQueries({queryKey:
    // APPOINTMENTS_KEY}) (create/cancel/reschedule) precisa alcançar esta query
    // também — chave que não compartilha o prefixo fica órfã de invalidação.
    queryKey: [...APPOINTMENTS_KEY, "by-day", dateStr],
    queryFn: async () =>
      apiClient.get<{ data: Appointment[] }>(
        `/api/v1/appointments?starts_from=${encodeURIComponent(starts_from)}&starts_to=${encodeURIComponent(starts_to)}`,
      ),
    staleTime: 15_000,
    select: (res) => res.data,
  });
}
