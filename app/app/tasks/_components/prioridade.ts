import type { PrioridadeDaTarefa } from "@/lib/tarefas/tipos";

/**
 * Apresentação da prioridade — cor e rótulo —, compartilhada entre a Lista e
 * o Kanban. Extraída de `ListaDeTarefas` quando o Kanban chegou: duas cópias
 * do mesmo mapa de 4 entradas é exatamente a duplicação sem source of truth
 * que o CLAUDE.md deste repo marca como anti-pattern.
 */

/** A cor é do TEMA, nunca um hex: ela tem de sobreviver ao claro e ao escuro. */
export const COR_DA_PRIORIDADE: Record<PrioridadeDaTarefa, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-primary/10 text-primary",
  high: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  urgent: "bg-destructive/15 text-destructive",
};

export function rotuloDaPrioridade(t: (texto: string) => string): Record<PrioridadeDaTarefa, string> {
  return {
    low: t("Baixa"),
    medium: t("Média"),
    high: t("Alta"),
    urgent: t("Urgente"),
  };
}
