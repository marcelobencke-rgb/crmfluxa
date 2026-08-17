"use client";
import { useState, type FormEvent } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useLeadNotes } from "@/hooks/leads/useLeadNotes";
import { useCreateLeadNote } from "@/hooks/leads/useCreateLeadNote";
import { actorName } from "@/lib/leads/activity-vocabulary";
import type { TimelineItemView } from "@/lib/types/contacts";

interface Props {
  leadId: string;
}

function quando(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function NotaItem({ item }: { item: TimelineItemView }) {
  const nome = actorName(item.actor_kind ?? null, {
    agente: item.actor_agent_name ?? null,
    usuario: item.actor_user_name ?? null,
  });
  return (
    <li className="border-b border-border py-2 last:border-0">
      <p className="whitespace-pre-wrap text-xs text-text">{item.reason}</p>
      <p className="mt-1 text-[11px] text-text-muted">
        {nome} · {quando(item.performed_at)}
      </p>
    </li>
  );
}

/**
 * A aba de notas: registro manual e CUMULATIVO — cada envio soma, nunca
 * substitui (diferente de "Descrição", que é um campo único sobrescrito a cada
 * edição). Cada nota entra na mesma timeline do negócio, com data/hora e autor,
 * e fica também aqui, filtrada, para não se perder atrás do resto da atividade.
 */
export function LeadNotes({ leadId }: Props) {
  const { notes, isLoading, isError } = useLeadNotes(leadId);
  const create = useCreateLeadNote(leadId);
  const [body, setBody] = useState("");

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const trimmed = body.trim();
    if (!trimmed) return;
    try {
      await create.mutateAsync(trimmed);
      setBody("");
      toast.success("Nota adicionada");
    } catch {
      // toast de erro já vem do hook (showApiError)
    }
  }

  return (
    <div className="flex flex-col gap-3">
      <form onSubmit={handleSubmit} className="flex flex-col gap-2">
        <Textarea
          placeholder="Registre o que aconteceu — ex.: falei com o cliente sobre o prazo de entrega"
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          disabled={create.isPending}
        />
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={create.isPending || !body.trim()}>
            {create.isPending ? "Salvando…" : "Adicionar nota"}
          </Button>
        </div>
      </form>

      {isLoading ? (
        <p className="py-4 text-xs text-text-muted">Carregando notas…</p>
      ) : isError ? (
        <p className="py-4 text-xs text-warning-fg">
          Não consegui carregar as notas. Tente de novo em instantes.
        </p>
      ) : notes.length === 0 ? (
        <p className="py-4 text-xs text-text-muted">Nenhuma nota ainda.</p>
      ) : (
        <ul>
          {notes.map((n) => (
            <NotaItem key={n.id} item={n} />
          ))}
        </ul>
      )}
    </div>
  );
}
