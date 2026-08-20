"use client";
import * as React from "react";
import { addDays, endOfMonth, endOfWeek, format, isSameDay, isSameMonth, startOfMonth, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useAppointmentsByRange } from "@/hooks/appointments/useAppointmentsByDay";
import { useProducts } from "@/hooks/products/useProducts";

const MAX_CHIPS_PER_DAY = 3;
const WEEKDAY_LABELS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

function timeLabel(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" }).format(
    new Date(iso),
  );
}

interface Props {
  date: string;
  onSelectDay: (dateStr: string) => void;
}

/** Grade mensal — semanas x dias, com chips de agendamentos por dia (spec 18). */
export function MonthView({ date, onSelectDay }: Props) {
  const anchor = new Date(`${date}T12:00:00`);
  const monthStart = startOfMonth(anchor);
  const monthEnd = endOfMonth(anchor);
  const gridStart = startOfWeek(monthStart, { locale: ptBR });
  const gridEnd = endOfWeek(monthEnd, { locale: ptBR });

  const days: Date[] = [];
  for (let d = gridStart; d <= gridEnd; d = addDays(d, 1)) days.push(d);

  const fromStr = toDateStr(gridStart);
  const toStr = toDateStr(gridEnd);
  const { data: appointments, isLoading } = useAppointmentsByRange(fromStr, toStr);
  const { data: products } = useProducts();

  const productName = React.useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products],
  );
  const visible = (appointments ?? []).filter((a) => a.status !== "cancelled");

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const today = new Date();

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="grid min-w-[700px] grid-cols-7">
        {WEEKDAY_LABELS.map((w) => (
          <div key={w} className="border-b border-r p-1.5 text-center text-[10px] uppercase text-muted-foreground last:border-r-0">
            {w}
          </div>
        ))}
        {days.map((day) => {
          const dayAppts = visible
            .filter((a) => isSameDay(new Date(a.starts_at), day))
            .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
          const extra = dayAppts.length - MAX_CHIPS_PER_DAY;
          return (
            <button
              type="button"
              key={day.toISOString()}
              onClick={() => onSelectDay(toDateStr(day))}
              className={cn(
                "flex min-h-[96px] flex-col items-stretch gap-1 border-b border-r p-1.5 text-left align-top last:border-r-0 hover:bg-muted/50",
                !isSameMonth(day, monthStart) && "bg-muted/20 text-muted-foreground",
              )}
            >
              <span
                className={cn(
                  "self-start rounded-full px-1.5 text-xs font-medium",
                  isSameDay(day, today) && "bg-accent text-accent-foreground",
                )}
              >
                {format(day, "d")}
              </span>
              <span className="flex flex-col gap-0.5">
                {dayAppts.slice(0, MAX_CHIPS_PER_DAY).map((a) => (
                  <span
                    key={a.id}
                    className="truncate rounded-sm border border-accent bg-accent-soft px-1 text-[10px] leading-tight text-accent"
                  >
                    {timeLabel(a.starts_at)} {productName.get(a.product_id) ?? "Serviço"}
                  </span>
                ))}
                {extra > 0 && <span className="text-[10px] text-muted-foreground">+{extra} mais</span>}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
