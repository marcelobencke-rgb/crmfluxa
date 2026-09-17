"use client";

import { useT } from "@/hooks/i18n/useT";
import { calculaIndicadores, type Tarefa } from "@/lib/tarefas/tipos";
import { CalendarCheck, ChartLineUp, CheckCircle, Flag, ListChecks, Warning } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  tarefas: Tarefa[];
}

/**
 * A régua da tela, num relance.
 *
 * Lê o conjunto INTEIRO de tarefas — não o recorte que a Lista/Calendário
 * aplicam com o filtro de situação — de propósito: é a mesma soma das quatro
 * colunas do Kanban (ver o cabeçalho de `calculaIndicadores`), então este
 * cartão não pode discordar do board logo abaixo dele.
 */
export function IndicadoresDeTarefas({ tarefas }: Props) {
  const t = useT();
  const indicadores = calculaIndicadores(tarefas);

  const cartoes = [
    {
      chave: "total",
      rotulo: t("Total"),
      valor: indicadores.total,
      Icone: ListChecks,
      cor: "bg-muted text-foreground",
    },
    {
      chave: "em-andamento",
      rotulo: t("Em andamento"),
      valor: indicadores.emAndamento,
      Icone: ChartLineUp,
      cor: "bg-primary/10 text-primary",
    },
    {
      chave: "concluidas",
      rotulo: t("Concluídas"),
      valor: indicadores.concluidas,
      Icone: CheckCircle,
      cor: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    },
    {
      chave: "atrasadas",
      rotulo: t("Atrasadas"),
      valor: indicadores.atrasadas,
      Icone: Warning,
      cor: "bg-destructive/15 text-destructive",
    },
    {
      chave: "vencem-hoje",
      rotulo: t("Vencem hoje"),
      valor: indicadores.vencemHoje,
      Icone: CalendarCheck,
      cor: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    },
    {
      chave: "urgentes",
      rotulo: t("Urgentes"),
      valor: indicadores.urgentes,
      Icone: Flag,
      cor: "bg-orange-500/15 text-orange-700 dark:text-orange-400",
    },
  ] as const;

  return (
    <div
      className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6"
      role="group"
      aria-label={t("Indicadores das tarefas")}
    >
      {cartoes.map(({ chave, rotulo, valor, Icone, cor }) => (
        <div key={chave} className="flex items-center gap-3 rounded-xl border bg-card p-3">
          <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", cor)}>
            <Icone size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-xl font-semibold leading-none tabular-nums">{valor}</p>
            <p className="mt-1 truncate text-[11px] text-muted-foreground">{rotulo}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
