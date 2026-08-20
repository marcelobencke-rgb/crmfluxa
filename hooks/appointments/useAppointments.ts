"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface Appointment {
  id: string;
  organization_id: string;
  lead_id: string | null;
  contact_id: string | null;
  resource_id: string;
  product_id: string;
  starts_at: string;
  ends_at: string;
  status: "scheduled" | "confirmed" | "completed" | "cancelled" | "no_show";
  cancel_reason: string | null;
  source: string;
  notes: string | null;
  created_at: string;
  updated_at: string;
  /** Resolvido no backend (contato direto, ou do lead vinculado, ou o título do lead). */
  contact_name: string | null;
}

export const APPOINTMENTS_KEY = ["crm-appointments"];

/** Spec 18 — agendamentos (exclui bloqueios importados do Google, ainda não sincronizados). */
export function useAppointments() {
  return useQuery({
    queryKey: APPOINTMENTS_KEY,
    queryFn: async () => apiClient.get<{ data: Appointment[] }>("/api/v1/appointments"),
    staleTime: 15_000,
    select: (res) => res.data,
  });
}
