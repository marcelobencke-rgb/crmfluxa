import type { Appointment } from "@/hooks/appointments/useAppointments";

/** Rótulo/cor de status — compartilhado entre a agenda (cards, lista, edição) e o histórico na tela de contato. */
export const STATUS_LABEL: Record<Appointment["status"], string> = {
  scheduled: "Agendado",
  confirmed: "Confirmado",
  completed: "Concluído",
  cancelled: "Cancelado",
  no_show: "Não compareceu",
};

export const STATUS_VARIANT: Record<Appointment["status"], "default" | "success" | "neutral" | "destructive"> = {
  scheduled: "default",
  confirmed: "success",
  completed: "neutral",
  cancelled: "destructive",
  no_show: "destructive",
};
