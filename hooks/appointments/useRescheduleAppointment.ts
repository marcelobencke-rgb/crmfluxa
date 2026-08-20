"use client";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { APPOINTMENTS_KEY, type Appointment } from "./useAppointments";

/**
 * Base compartilhada por remarcar (arrastar o card) e redimensionar (arrastar a borda
 * inferior) na grade dia/semana (spec 18). Atualiza o cache do react-query diretamente
 * com a resposta do PATCH (em vez de invalidar e esperar um refetch) pra o bloco não
 * "piscar" de volta na posição/tamanho antigo entre soltar e a rede responder — ver
 * AppointmentBlock.tsx.
 */
function usePatchAppointment(successMessage: string) {
  const qc = useQueryClient();

  return async function patch(appointment: Appointment, body: Record<string, unknown>): Promise<void> {
    try {
      const res = await apiClient.patch<{ data: Appointment }>(`/api/v1/appointments/${appointment.id}`, body);
      qc.setQueriesData<{ data: Appointment[] } | undefined>({ queryKey: APPOINTMENTS_KEY }, (old) =>
        old ? { data: old.data.map((a) => (a.id === res.data.id ? res.data : a)) } : old,
      );
      toast.success(successMessage);
    } catch (err) {
      showApiError(err);
      throw err;
    }
  };
}

/** Remarca via arrastar-e-soltar o card (muda `starts_at`, preserva a duração). */
export function useRescheduleAppointment() {
  const patch = usePatchAppointment("Agendamento remarcado.");
  return (appointment: Appointment, newStartsAtIso: string) => patch(appointment, { starts_at: newStartsAtIso });
}

/** Redimensiona via arrastar a borda inferior do card (muda só `ends_at`, ou seja, a duração). */
export function useResizeAppointment() {
  const patch = usePatchAppointment("Duração atualizada.");
  return (appointment: Appointment, newEndsAtIso: string) => patch(appointment, { ends_at: newEndsAtIso });
}

/** Confirma via botão rápido (card da agenda ou lista) — não abre diálogo. */
export function useConfirmAppointment() {
  const patch = usePatchAppointment("Agendamento confirmado.");
  return (appointment: Appointment) => patch(appointment, { status: "confirmed" });
}

/**
 * Salvar do diálogo de edição — só os campos de "conteúdo" que o backend aceita mudar
 * num agendamento já existente (ver doutrina em app/api/v1/appointments/_handler.ts):
 * horário e nota. Recurso/serviço/contato ficam de fora de propósito.
 */
export function useUpdateAppointmentDetails() {
  const patch = usePatchAppointment("Agendamento atualizado.");
  return (appointment: Appointment, body: { starts_at?: string; ends_at?: string; notes?: string | null }) =>
    patch(appointment, body);
}
