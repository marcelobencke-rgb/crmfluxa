"use client";

import { useEffect, useState } from "react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useT } from "@/hooks/i18n/useT";
import { useLead, useLeadList } from "@/hooks/leads/useLeadList";
import { CaretDown, Kanban, MagnifyingGlass, X } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  leadId: string | null;
  onChange: (leadId: string | null) => void;
  disabled?: boolean;
  className?: string;
}

/**
 * Campo "vincular a um negócio" do formulário de tarefa — busca por título,
 * não uma lista fixa (a org pode ter centenas de leads, um `Select` comum
 * não escala). Vive como `Popover` DENTRO do próprio Dialog da tarefa, e não
 * como outro `Dialog` (o padrão do `ContactPickerDialog`): dois `Dialog`
 * empilhados do Radix competem pelo foco/`Escape`, e aqui o formulário já É
 * um Dialog.
 *
 * `useLead(leadId)` resolve o TÍTULO de quem já está vinculado (editar uma
 * tarefa antiga) — `useLeadList` não serve pra isso, ela só busca por texto,
 * e o texto começa vazio.
 */
export function SeletorDeLead({ id, leadId, onChange, disabled, className }: Props) {
  const t = useT();
  const [aberto, setAberto] = useState(false);
  const [busca, setBusca] = useState("");
  const [buscaDebounced, setBuscaDebounced] = useState("");

  useEffect(() => {
    if (!aberto) {
      setBusca("");
      setBuscaDebounced("");
      return;
    }
    const id = setTimeout(() => setBuscaDebounced(busca.trim()), 250);
    return () => clearTimeout(id);
  }, [busca, aberto]);

  const selecionado = useLead(leadId);
  const resultado = useLeadList({ search: buscaDebounced || undefined });
  const leads = resultado.data?.data ?? [];

  const tituloSelecionado = selecionado.data?.data.title?.trim() || null;

  return (
    <Popover open={aberto} onOpenChange={setAberto}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-haspopup="listbox"
          className={cn(
            "flex h-10 w-full items-center justify-between gap-2 rounded-sm border border-border bg-bg px-4 py-2 text-sm",
            "transition-[border-color,box-shadow] duration-fast ease-out hover:border-border-strong",
            "focus-visible:outline-hidden focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-soft",
            "disabled:cursor-not-allowed disabled:opacity-55",
            className,
          )}
        >
          <span className={cn("truncate text-left", !leadId && "text-text-muted")}>
            {leadId
              ? (tituloSelecionado ?? t("Carregando…"))
              : t("Nenhum — busque pelo título do negócio")}
          </span>
          <span className="flex shrink-0 items-center gap-1.5">
            {leadId && !disabled ? (
              <span
                role="button"
                tabIndex={0}
                aria-label={t("Remover vínculo com o negócio")}
                onClick={(e) => {
                  e.stopPropagation();
                  onChange(null);
                }}
                onKeyDown={(e) => {
                  if (e.key !== "Enter" && e.key !== " ") return;
                  e.preventDefault();
                  e.stopPropagation();
                  onChange(null);
                }}
                className="rounded-sm p-0.5 text-text-muted transition-colors hover:bg-surface-elevated hover:text-text"
              >
                <X size={14} aria-hidden />
              </span>
            ) : null}
            <CaretDown size={14} className="text-text-muted" aria-hidden />
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        className="w-(--radix-popover-trigger-width) p-0"
        align="start"
        onOpenAutoFocus={(e) => {
          // O Popover focaria o CONTAINER; queremos o campo de busca — senão
          // quem chegou pelo teclado precisa de um Tab extra pra digitar.
          e.preventDefault();
          document.getElementById(`${id ?? "lead"}-busca`)?.focus();
        }}
      >
        <div className="border-b border-border p-2">
          <div className="relative">
            <MagnifyingGlass
              size={14}
              className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-text-muted"
              aria-hidden
            />
            <Input
              id={`${id ?? "lead"}-busca`}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={t("Buscar pelo título do negócio…")}
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>
        <div className="max-h-56 overflow-y-auto p-1" role="listbox">
          {!buscaDebounced ? (
            <p className="px-2 py-3 text-center text-xs text-text-subtle">
              {t("Digite para buscar um negócio.")}
            </p>
          ) : resultado.isLoading ? (
            <p className="px-2 py-3 text-center text-xs text-text-subtle">{t("Buscando…")}</p>
          ) : leads.length === 0 ? (
            <p className="px-2 py-3 text-center text-xs text-text-subtle">
              {t("Nenhum negócio encontrado.")}
            </p>
          ) : (
            leads.map((lead) => (
              <button
                key={lead.id}
                type="button"
                role="option"
                aria-selected={lead.id === leadId}
                onClick={() => {
                  onChange(lead.id);
                  setAberto(false);
                }}
                className={cn(
                  "flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition-colors hover:bg-accent-soft",
                  lead.id === leadId && "bg-accent-soft",
                )}
              >
                <Kanban size={13} className="shrink-0 text-text-subtle" aria-hidden />
                <span className="truncate">{lead.title?.trim() || t("Sem título")}</span>
              </button>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
