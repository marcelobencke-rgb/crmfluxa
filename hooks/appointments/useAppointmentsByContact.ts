"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { APPOINTMENTS_KEY, type Appointment } from "./useAppointments";

/**
 * Histórico de agendamentos do contato — spec 18 revisitada: `contact_id` é populado
 * por trigger (migration 0148) em todo caminho de escrita, mesmo quando o agendamento
 * também está vinculado a um negócio (lead_id). Por isso um filtro simples por
 * `contact_id` já é suficiente; não precisa do merge "direto OU via leads do contato"
 * que `crm_lead_activities`/timeline usa (lá o gap existe porque contact_id nem sempre
 * foi populado; aqui a migration garante que sim).
 */
export function useAppointmentsByContact(contactId: string) {
  return useQuery({
    queryKey: [...APPOINTMENTS_KEY, "by-contact", contactId],
    queryFn: async () =>
      apiClient.get<{ data: Appointment[] }>(`/api/v1/appointments?contact_id=${encodeURIComponent(contactId)}`),
    enabled: !!contactId,
    staleTime: 15_000,
    select: (res) => res.data,
  });
}
