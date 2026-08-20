"use client";
import * as React from "react";
import { addDays, addMonths, addWeeks, endOfWeek, format, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { CaretLeft, CaretRight } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import type { Appointment } from "@/hooks/appointments/useAppointments";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";
import { EditAppointmentDialog } from "./EditAppointmentDialog";
import { DayView } from "./DayView";
import { WeekView } from "./WeekView";
import { MonthView } from "./MonthView";

type ViewMode = "day" | "week" | "month";

const VIEW_LABEL: Record<ViewMode, string> = { day: "Dia", week: "Semana", month: "Mês" };

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

interface Props {
  canWrite: boolean;
}

/** Visualização de agenda com granularidade dia/semana/mês (spec 18). */
export function CalendarView({ canWrite }: Props) {
  const [mode, setMode] = React.useState<ViewMode>("day");
  const [date, setDate] = React.useState(todayDateStr());
  const [cancelling, setCancelling] = React.useState<Appointment | null>(null);
  const [editing, setEditing] = React.useState<Appointment | null>(null);

  const anchor = new Date(`${date}T12:00:00`);

  function shift(step: number) {
    if (mode === "day") setDate(toDateStr(addDays(anchor, step)));
    else if (mode === "week") setDate(toDateStr(addWeeks(anchor, step)));
    else setDate(toDateStr(addMonths(anchor, step)));
  }

  function selectDay(dateStr: string) {
    setDate(dateStr);
    setMode("day");
  }

  function requestCancel(appointment: Appointment) {
    setEditing(null);
    setCancelling(appointment);
  }

  let label: string;
  if (mode === "day") {
    label = format(anchor, "EEEE, d 'de' MMMM", { locale: ptBR });
  } else if (mode === "week") {
    const start = startOfWeek(anchor, { locale: ptBR });
    const end = endOfWeek(anchor, { locale: ptBR });
    label =
      start.getMonth() === end.getMonth()
        ? `${format(start, "d")}–${format(end, "d 'de' MMMM", { locale: ptBR })}`
        : `${format(start, "d 'de' MMM", { locale: ptBR })} – ${format(end, "d 'de' MMM", { locale: ptBR })}`;
  } else {
    label = format(anchor, "MMMM 'de' yyyy", { locale: ptBR });
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button type="button" variant="ghost" size="icon" onClick={() => shift(-1)} aria-label="Anterior">
            <CaretLeft />
          </Button>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="rounded-md border bg-transparent px-2 py-1 text-sm"
          />
          <Button type="button" variant="ghost" size="icon" onClick={() => shift(1)} aria-label="Próximo">
            <CaretRight />
          </Button>
          <Button type="button" variant="ghost" size="sm" onClick={() => setDate(todayDateStr())}>
            Hoje
          </Button>
          <p className="text-sm font-medium capitalize">{label}</p>
        </div>

        <div className="flex rounded-md border p-0.5" role="group" aria-label="Granularidade da agenda">
          {(Object.keys(VIEW_LABEL) as ViewMode[]).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              aria-pressed={mode === m}
              className={cn(
                "rounded-sm px-2.5 py-1 text-xs font-medium transition-colors",
                mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {VIEW_LABEL[m]}
            </button>
          ))}
        </div>
      </div>

      {mode === "day" && (
        <DayView date={date} canWrite={canWrite} onOpen={setEditing} onCancelRequest={setCancelling} />
      )}
      {mode === "week" && (
        <WeekView
          date={date}
          canWrite={canWrite}
          onOpen={setEditing}
          onCancelRequest={setCancelling}
          onSelectDay={selectDay}
        />
      )}
      {mode === "month" && <MonthView date={date} onSelectDay={selectDay} />}

      <EditAppointmentDialog
        appointment={editing}
        open={!!editing}
        canWrite={canWrite}
        onOpenChange={(open) => !open && setEditing(null)}
        onRequestCancel={requestCancel}
      />

      <CancelAppointmentDialog
        appointment={cancelling}
        open={!!cancelling}
        onOpenChange={(open) => !open && setCancelling(null)}
        onCancelled={() => toast.success("Agendamento cancelado.")}
      />
    </div>
  );
}
