"use client";
import type { MouseEvent } from "react";

import { cn } from "@/lib/utils";
import { useDecidirProximaAcao } from "@/hooks/kanban/useNextAction";

interface NextActionSlotProps {
  /** O texto que o agente propôs, já roteado para este negócio. */
  label: string;
  leadId: string;
  /** A identidade da proposta na tela — a trava do servidor compara com ela. */
  approvedSeq: number;
  pipelineId: string;
}

/**
 * A faixa ③ quando o agente propôs alguma coisa: o que ele quer fazer, e a
 * decisão do humano ao lado.
 *
 * Cabe na altura já reservada do slot (`h-6`) — nenhum elemento novo entra no
 * orçamento do card (§5). O texto encolhe (`truncate`) e os botões não: numa
 * coluna estreita é a decisão que precisa continuar clicável, e a proposta
 * inteira já está no `title`.
 */
export function NextActionSlot({
  label,
  leadId,
  approvedSeq,
  pipelineId,
}: NextActionSlotProps) {
  const decidir = useDecidirProximaAcao(pipelineId);

  const decide = (e: MouseEvent<HTMLButtonElement>, decision: "approve" | "dismiss") => {
    // O card inteiro seleciona ao clique; decidir não é selecionar.
    e.stopPropagation();
    decidir.mutate({ leadId, decision, approvedSeq });
  };

  return (
    <>
      <span className="min-w-0 flex-1 truncate text-accent" title={label}>
        Propõe: {label}
      </span>
      <span className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          disabled={decidir.isPending}
          onClick={(e) => decide(e, "approve")}
          // O rótulo curto cabe no card; o acessível diz DE QUE proposta se
          // trata — "Aprovar" sozinho, lido fora de contexto, não decide nada.
          aria-label={`Aprovar: ${label}`}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] font-medium transition-colors",
            "bg-accent/10 text-accent hover:bg-accent/20",
            "disabled:opacity-50",
          )}
        >
          Aprovar
        </button>
        <button
          type="button"
          disabled={decidir.isPending}
          onClick={(e) => decide(e, "dismiss")}
          aria-label={`Ignorar: ${label}`}
          className={cn(
            "rounded px-1.5 py-0.5 text-[11px] transition-colors",
            "text-text-muted hover:bg-surface-muted hover:text-text",
            "disabled:opacity-50",
          )}
        >
          Ignorar
        </button>
      </span>
    </>
  );
}

export function NextActionBanner({
  label,
  leadId,
  approvedSeq,
  pipelineId,
}: NextActionSlotProps) {
  const decidir = useDecidirProximaAcao(pipelineId);

  const decide = (e: MouseEvent<HTMLButtonElement>, decision: "approve" | "dismiss") => {
    e.stopPropagation();
    decidir.mutate({ leadId, decision, approvedSeq });
  };

  return (
    <div className="mt-4 flex flex-col gap-2 rounded-md border border-accent/20 bg-accent/5 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-accent">
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-accent/10 text-[10px]">✨</span>
        Proposta da IA
      </div>
      <p className="text-sm text-text-muted">{label}</p>
      
      <div className="mt-1 flex items-center gap-2">
        <button
          type="button"
          disabled={decidir.isPending}
          onClick={(e) => decide(e, "approve")}
          aria-label={`Aprovar: ${label}`}
          className={cn(
            "rounded bg-accent px-3 py-1.5 text-xs font-medium text-accent-foreground transition-colors hover:bg-accent-hover",
            "disabled:opacity-50",
          )}
        >
          Aprovar
        </button>
        <button
          type="button"
          disabled={decidir.isPending}
          onClick={(e) => decide(e, "dismiss")}
          aria-label={`Ignorar: ${label}`}
          className={cn(
            "rounded bg-surface-elevated px-3 py-1.5 text-xs font-medium text-text transition-colors border border-border hover:bg-surface-muted",
            "disabled:opacity-50",
          )}
        >
          Ignorar
        </button>
      </div>
    </div>
  );
}
