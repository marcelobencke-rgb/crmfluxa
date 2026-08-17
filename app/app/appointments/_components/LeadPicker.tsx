"use client";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CaretDown, X } from "@/lib/ui/icons";
import { useSearchLeads } from "@/hooks/leads/useSearchLeads";

interface Props {
  value: { id: string; title: string } | null;
  onChange: (lead: { id: string; title: string } | null) => void;
}

/**
 * Busca-e-seleciona um lead pelo título. Opcional de propósito (spec 18 §3): sem
 * lead vinculado, o agendamento não aparece na timeline do CRM — mas continua
 * sendo um agendamento válido (ex.: cliente que ainda não virou lead).
 */
export function LeadPicker({ value, onChange }: Props) {
  const [open, setOpen] = React.useState(false);
  const [search, setSearch] = React.useState("");
  const { data: results, isLoading } = useSearchLeads(search);

  if (value) {
    return (
      <div className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
        <span className="min-w-0 flex-1 truncate">{value.title}</span>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-5 w-5 shrink-0"
          aria-label="Remover lead vinculado"
          onClick={() => onChange(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="w-full justify-between font-normal text-muted-foreground">
          Vincular a um lead (opcional)
          <CaretDown className="h-4 w-4 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-2" align="start">
        <Input
          autoFocus
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome do negócio…"
          className="mb-2"
        />
        {search.trim().length < 2 ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Digite ao menos 2 letras.</p>
        ) : isLoading ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Buscando…</p>
        ) : !results?.length ? (
          <p className="px-1 py-2 text-xs text-muted-foreground">Nenhum lead encontrado.</p>
        ) : (
          <ul className="max-h-56 space-y-0.5 overflow-y-auto">
            {results.map((lead) => (
              <li key={lead.id}>
                <button
                  type="button"
                  onClick={() => {
                    onChange({ id: lead.id, title: lead.title });
                    setSearch("");
                    setOpen(false);
                  }}
                  className="w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-surface-elevated"
                >
                  {lead.title}
                </button>
              </li>
            ))}
          </ul>
        )}
      </PopoverContent>
    </Popover>
  );
}
