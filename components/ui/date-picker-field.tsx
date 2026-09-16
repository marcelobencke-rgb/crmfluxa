"use client";
import { useEffect, useState } from "react";
import { format, parse, isValid } from "date-fns";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { useLocaleDeData } from "@/hooks/i18n/useLocaleDeData";
import { CaretDown } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  /** "yyyy-MM-dd" (o mesmo formato de `<input type="date">`) ou "". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  /** Mesma semântica do `<input type="date" min/max>` nativo: "yyyy-MM-dd". */
  min?: string;
  max?: string;
}

/** "yyyy-MM-dd" → `Date`, ou `undefined` se vazio/invalido — nunca lança. */
function parseYMD(s: string | undefined): Date | undefined {
  if (!s) return undefined;
  const d = parse(s, "yyyy-MM-dd", new Date());
  return isValid(d) ? d : undefined;
}

/**
 * Campo de data com calendário próprio, no lugar do `<input type="date">`
 * nativo — o picker do navegador (visto no print: "setembro de 2026" fora do
 * estilo do produto). Guarda e expõe sempre "yyyy-MM-dd": nenhum chamador
 * precisa mudar o que já lê/grava, só troca o controle.
 *
 * `min`/`max` desabilitam a CÉLULA no calendário, em vez de deixar escolher e
 * só recusar depois — o nativo aceitava digitar fora do intervalo e só o
 * schema do servidor reclamava; aqui o dia errado nem fica clicável.
 */
export function DatePickerField({
  id,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  min,
  max,
}: Props) {
  const [open, setOpen] = useState(false);
  const locale = useLocaleDeData();

  const parsed = value ? parse(value, "yyyy-MM-dd", new Date()) : undefined;
  const selected = parsed && isValid(parsed) ? parsed : undefined;
  const minDate = parseYMD(min);
  const maxDate = parseYMD(max);
  const diasDesabilitados = [
    ...(minDate ? [{ before: minDate }] : []),
    ...(maxDate ? [{ after: maxDate }] : []),
  ];

  // O popover não acompanha o scroll do CORPO do modal (que rola por conta
  // própria, dentro de um `overflow-y-auto` — não é a janela). Em vez de
  // tentar persegui-lo, fecha ao rolar: mesmo comportamento de Google
  // Calendar/Linear. Captura (3º argumento `true`) porque scroll não
  // borbulha — sem isso, só o scroll da JANELA seria ouvido, nunca o do
  // container interno do diálogo.
  useEffect(() => {
    if (!open) return;
    const fechar = () => setOpen(false);
    window.addEventListener("scroll", fechar, true);
    return () => window.removeEventListener("scroll", fechar, true);
  }, [open]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-sm border border-border bg-bg px-4 py-2 text-left text-sm",
            "transition-[border-color,box-shadow] duration-fast ease-out hover:border-border-strong",
            "focus-visible:outline-hidden focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-soft",
            "disabled:cursor-not-allowed disabled:opacity-55",
            selected ? "text-text" : "text-text-subtle",
            className,
          )}
        >
          <span>{selected ? format(selected, "dd/MM/yyyy", { locale }) : (placeholder ?? "dd/mm/aaaa")}</span>
          <CaretDown size={14} className="shrink-0 text-text-subtle" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-3" align="start">
        <Calendar
          mode="single"
          locale={locale}
          selected={selected}
          disabled={diasDesabilitados.length > 0 ? diasDesabilitados : undefined}
          onSelect={(date) => {
            onChange(date ? format(date, "yyyy-MM-dd") : "");
            setOpen(false);
          }}
        />
      </PopoverContent>
    </Popover>
  );
}
