"use client";
import * as React from "react";
import { format, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useAppointmentsByDay } from "@/hooks/appointments/useAppointmentsByDay";
import { useResources } from "@/hooks/resources/useResources";
import { useProducts } from "@/hooks/products/useProducts";
import type { Appointment } from "@/hooks/appointments/useAppointments";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";

const PX_PER_MIN = 1.2;
const DEFAULT_START_MIN = 7 * 60;
const DEFAULT_END_MIN = 21 * 60;

/** ISO instant (UTC) → minutos desde meia-noite em -03:00 (fuso fixo, ver lib/scheduling/slots.ts). */
function brasiliaMinutesOfDay(iso: string): number {
  const d = new Date(iso);
  let min = d.getUTCHours() * 60 + d.getUTCMinutes() - 180;
  if (min < 0) min += 1440;
  return min;
}

function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

interface Props {
  canWrite: boolean;
}

export function CalendarView({ canWrite }: Props) {
  const [date, setDate] = React.useState(todayDateStr());
  const { data: appointments, isLoading: loadingAppts } = useAppointmentsByDay(date);
  const { data: resources, isLoading: loadingResources } = useResources();
  const { data: products } = useProducts();
  const [cancelling, setCancelling] = React.useState<Appointment | null>(null);

  const productName = React.useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products],
  );
  const activeResources = React.useMemo(
    () => (resources ?? []).filter((r) => r.is_active),
    [resources],
  );
  const visible = (appointments ?? []).filter((a) => a.status !== "cancelled");

  const { windowStart, windowEnd } = React.useMemo(() => {
    let start = DEFAULT_START_MIN;
    let end = DEFAULT_END_MIN;
    for (const a of visible) {
      const s = brasiliaMinutesOfDay(a.starts_at);
      const e = brasiliaMinutesOfDay(a.ends_at);
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return { windowStart: start, windowEnd: end };
  }, [visible]);

  const hourMarks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += 60) hourMarks.push(m);
  const totalHeight = (windowEnd - windowStart) * PX_PER_MIN;

  const isLoading = loadingAppts || loadingResources;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => setDate(addDays(new Date(date), -1).toISOString().slice(0, 10))}>
            <CaretLeft />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-transparent px-2 py-1 text-sm"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => setDate(addDays(new Date(date), 1).toISOString().slice(0, 10))}>
            <CaretRight />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDate(todayDateStr())}>
            Hoje
          </Button>
        </div>
        <p className="text-sm font-medium capitalize">
          {format(new Date(`${date}T12:00:00`), "EEEE, d 'de' MMMM", { locale: ptBR })}
        </p>
      </div>

      {isLoading ? (
        <Skeleton className="h-96 w-full" />
      ) : !activeResources.length ? (
        <p className="text-sm text-muted-foreground">Nenhum recurso ativo cadastrado ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <div
            className="grid min-w-[600px]"
            style={{ gridTemplateColumns: `60px repeat(${activeResources.length}, minmax(140px, 1fr))` }}
          >
            <div className="border-b border-r p-2 text-xs text-muted-foreground">Hora</div>
            {activeResources.map((r) => (
              <div key={r.id} className="flex items-center gap-1.5 border-b border-r p-2 text-sm font-medium last:border-r-0">
                {r.color && (
                  <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: r.color }} aria-hidden />
                )}
                <span className="truncate">{r.name}</span>
              </div>
            ))}

            <div className="relative border-r" style={{ height: totalHeight }}>
              {hourMarks.map((m) => (
                <div
                  key={m}
                  className="absolute left-0 right-0 border-t px-1 text-[10px] text-muted-foreground"
                  style={{ top: (m - windowStart) * PX_PER_MIN }}
                >
                  {minutesToLabel(m)}
                </div>
              ))}
            </div>

            {activeResources.map((r) => {
              const apptsForResource = visible.filter((a) => a.resource_id === r.id);
              return (
                <div key={r.id} className="relative border-r last:border-r-0" style={{ height: totalHeight }}>
                  {hourMarks.map((m) => (
                    <div key={m} className="absolute left-0 right-0 border-t" style={{ top: (m - windowStart) * PX_PER_MIN }} />
                  ))}
                  {apptsForResource.map((a) => {
                    const startMin = brasiliaMinutesOfDay(a.starts_at);
                    const endMin = brasiliaMinutesOfDay(a.ends_at);
                    const top = (startMin - windowStart) * PX_PER_MIN;
                    const height = Math.max((endMin - startMin) * PX_PER_MIN, 18);
                    return (
                      <button
                        type="button"
                        key={a.id}
                        onClick={() => canWrite && setCancelling(a)}
                        className={cn(
                          "absolute left-0.5 right-0.5 overflow-hidden rounded-sm border px-1.5 py-0.5 text-left text-[11px] leading-tight",
                          "border-accent bg-accent-soft text-accent hover:brightness-95",
                          !canWrite && "cursor-default",
                        )}
                        style={{ top, height }}
                        title={`${minutesToLabel(startMin)}–${minutesToLabel(endMin)} · ${productName.get(a.product_id) ?? "Serviço"}`}
                      >
                        <span className="font-medium">{minutesToLabel(startMin)}</span>{" "}
                        {productName.get(a.product_id) ?? "Serviço"}
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        </div>
      )}

      <CancelAppointmentDialog
        appointment={cancelling}
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        onCancelled={() => toast.success("Agendamento cancelado.")}
      />
    </div>
  );
}
