"use client";
import { useEffect, useRef, useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { CaretDown, Clock } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

interface Props {
  id?: string;
  /** "HH:mm" (o mesmo formato de `<input type="time">`) ou "". */
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
  "aria-label"?: string;
}

const HORAS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, "0"));
const MINUTOS = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0"));

/**
 * Campo de horário com duas colunas próprias, no lugar do `<input
 * type="time">` nativo — o mesmo defeito do `<input type="date">` (visto no
 * print: o seletor sai da casca do produto, cada navegador desenha o seu). A
 * INTERAÇÃO fica a mesma (duas colunas roláveis, hora e minuto) porque é
 * reconhecível; só o estilo troca para o do produto.
 */
export function TimePickerField({
  id,
  value,
  onChange,
  placeholder,
  className,
  disabled,
  "aria-label": ariaLabel,
}: Props) {
  const [open, setOpen] = useState(false);
  const [hora, minuto] = value ? value.split(":") : ["", ""];
  const colHoraRef = useRef<HTMLDivElement>(null);
  const colMinutoRef = useRef<HTMLDivElement>(null);

  // Mesmo comportamento do `DatePickerField`: fecha ao rolar o corpo do modal
  // em vez de tentar perseguir o popover, que não acompanha esse scroll.
  useEffect(() => {
    if (!open) return;
    const fechar = () => setOpen(false);
    window.addEventListener("scroll", fechar, true);
    return () => window.removeEventListener("scroll", fechar, true);
  }, [open]);

  // Ao abrir, rola cada coluna até o valor já escolhido — sem isto, editar um
  // horário tarde (ex.: 22h) sempre abriria no topo da lista, longe do que já
  // estava marcado.
  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      colHoraRef.current
        ?.querySelector<HTMLElement>('[data-selecionado="true"]')
        ?.scrollIntoView({ block: "center" });
      colMinutoRef.current
        ?.querySelector<HTMLElement>('[data-selecionado="true"]')
        ?.scrollIntoView({ block: "center" });
    });
  }, [open]);

  function escolher(h: string, m: string) {
    onChange(`${h}:${m}`);
  }

  return (
    <Popover open={open} onOpenChange={(v) => !disabled && setOpen(v)}>
      <PopoverTrigger asChild>
        <button
          type="button"
          id={id}
          disabled={disabled}
          aria-label={ariaLabel}
          className={cn(
            "flex h-10 w-full items-center justify-between rounded-sm border border-border bg-bg px-4 py-2 text-left text-sm tabular-nums",
            "transition-[border-color,box-shadow] duration-fast ease-out hover:border-border-strong",
            "focus-visible:outline-hidden focus-visible:border-accent-500 focus-visible:ring-2 focus-visible:ring-accent-soft",
            "disabled:cursor-not-allowed disabled:opacity-55",
            value ? "text-text" : "text-text-subtle",
            className,
          )}
        >
          <span className="flex items-center gap-1.5">
            <Clock size={14} className="shrink-0 text-text-subtle" aria-hidden />
            {value || placeholder || "00:00"}
          </span>
          <CaretDown size={14} className="shrink-0 text-text-subtle" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <div className="flex max-h-56 divide-x divide-border">
          <div ref={colHoraRef} className="w-16 overflow-y-auto py-1">
            {HORAS.map((h) => (
              <button
                key={h}
                type="button"
                data-selecionado={h === hora}
                onClick={() => escolher(h, minuto || "00")}
                className={cn(
                  "block w-full px-3 py-1.5 text-center text-sm tabular-nums text-text hover:bg-accent-soft",
                  h === hora && "bg-accent font-semibold text-accent-foreground hover:bg-accent-hover",
                )}
              >
                {h}
              </button>
            ))}
          </div>
          <div ref={colMinutoRef} className="w-16 overflow-y-auto py-1">
            {MINUTOS.map((m) => (
              <button
                key={m}
                type="button"
                data-selecionado={m === minuto}
                onClick={() => escolher(hora || "00", m)}
                className={cn(
                  "block w-full px-3 py-1.5 text-center text-sm tabular-nums text-text hover:bg-accent-soft",
                  m === minuto && "bg-accent font-semibold text-accent-foreground hover:bg-accent-hover",
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
