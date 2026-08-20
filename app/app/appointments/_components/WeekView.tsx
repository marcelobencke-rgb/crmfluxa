"use client";
import * as React from "react";
import { addDays, format, isSameDay, startOfWeek } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import {
  DEFAULT_END_MIN,
  DEFAULT_START_MIN,
  PX_PER_MIN,
  availabilityWindow,
  minutesOfDay,
  minutesToIso,
  minutesToLabel,
} from "@/lib/scheduling/day-grid";
import { layoutOverlaps } from "@/lib/scheduling/overlap-layout";
import { useAppointmentsByRange } from "@/hooks/appointments/useAppointmentsByDay";
import {
  useConfirmAppointment,
  useRescheduleAppointment,
  useResizeAppointment,
} from "@/hooks/appointments/useRescheduleAppointment";
import { useResources } from "@/hooks/resources/useResources";
import { useResourcesAvailability } from "@/hooks/resources/useResourcesAvailability";
import { useProducts } from "@/hooks/products/useProducts";
import type { Appointment } from "@/hooks/appointments/useAppointments";
import { AppointmentBlock, type DropResult, type ResizeResult } from "./AppointmentBlock";

const DAY_COUNT = 7;

function toDateStr(d: Date): string {
  return format(d, "yyyy-MM-dd");
}

interface Props {
  date: string;
  canWrite: boolean;
  onOpen: (appointment: Appointment) => void;
  onCancelRequest: (appointment: Appointment) => void;
  onSelectDay: (dateStr: string) => void;
}

/**
 * Agenda semanal — 7 colunas (dia) x eixo de horário (spec 18), mesmo visual de grade
 * do Google Agenda. Diferente da visualização diária (colunas por recurso, onde nunca
 * há sobreposição), aqui uma coluna de dia mistura vários recursos — dois agendamentos
 * podem cair no mesmo horário — então usa `layoutOverlaps` pra dividir em raias
 * lado a lado. Todos os agendamentos da semana vivem num único canvas relativo (não
 * 7 divs separadas) pra dar pra arrastar um bloco de um dia pro outro — ver
 * AppointmentBlock (`dragAxis="both"`).
 */
export function WeekView({ date, canWrite, onOpen, onCancelRequest, onSelectDay }: Props) {
  const anchor = new Date(`${date}T12:00:00`);
  const weekStart = startOfWeek(anchor, { locale: ptBR });
  const days = React.useMemo(
    () => Array.from({ length: DAY_COUNT }, (_, i) => addDays(weekStart, i)),
    [weekStart],
  );
  const dayStrs = React.useMemo(() => days.map(toDateStr), [days]);
  const dayLabels = React.useMemo(
    () => days.map((d) => format(d, "EEEEEE dd", { locale: ptBR })),
    [days],
  );
  const fromStr = dayStrs[0]!;
  const toStr = dayStrs[6]!;

  const canvasRef = React.useRef<HTMLDivElement>(null);
  const getCanvasWidth = React.useCallback(() => canvasRef.current?.getBoundingClientRect().width ?? 0, []);

  const { data: appointments, isLoading: loadingAppts } = useAppointmentsByRange(fromStr, toStr);
  const { data: resources, isLoading: loadingResources } = useResources();
  const { data: products } = useProducts();
  const reschedule = useRescheduleAppointment();
  const resize = useResizeAppointment();
  const confirm = useConfirmAppointment();

  const resourceColor = React.useMemo(
    () => new Map((resources ?? []).map((r) => [r.id, r.color])),
    [resources],
  );
  const activeResourceIds = React.useMemo(
    () => (resources ?? []).filter((r) => r.is_active).map((r) => r.id),
    [resources],
  );
  const { data: availabilityRows } = useResourcesAvailability(activeResourceIds);
  const productName = React.useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products],
  );
  const visible = (appointments ?? []).filter((a) => a.status !== "cancelled");

  const { windowStart, windowEnd } = React.useMemo(() => {
    // Une o expediente configurado dos 7 dias da semana — cada dia pode ter um
    // recorte diferente; a janela mostrada precisa caber o mais cedo e o mais tarde de
    // qualquer um deles. Sem disponibilidade cadastrada, cai no default de sempre.
    const dayWindows = Array.from({ length: 7 }, (_, wd) => availabilityWindow(availabilityRows, wd)).filter(
      (w): w is { start: number; end: number } => w !== null,
    );
    let start = dayWindows.length ? Math.min(...dayWindows.map((w) => w.start)) : DEFAULT_START_MIN;
    let end = dayWindows.length ? Math.max(...dayWindows.map((w) => w.end)) : DEFAULT_END_MIN;
    start = Math.floor(start / 60) * 60;
    end = Math.ceil(end / 60) * 60;
    for (const a of visible) {
      const s = minutesOfDay(a.starts_at);
      const e = minutesOfDay(a.ends_at);
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return { windowStart: start, windowEnd: end };
  }, [visible, availabilityRows]);

  const hourMarks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += 60) hourMarks.push(m);
  const totalHeight = (windowEnd - windowStart) * PX_PER_MIN;

  const isLoading = loadingAppts || loadingResources;

  async function handleDrop(appointment: Appointment, originDayIndex: number, result: DropResult) {
    const targetDateStr = dayStrs[result.dayIndex ?? originDayIndex]!;
    const newStartsAt = minutesToIso(targetDateStr, result.minutesOfDay);
    if (newStartsAt === appointment.starts_at) return;
    await reschedule(appointment, newStartsAt);
  }

  async function handleResize(appointment: Appointment, dayIndex: number, result: ResizeResult) {
    const dateStr = dayStrs[dayIndex]!;
    const newEndsAt = minutesToIso(dateStr, result.endMinutesOfDay);
    if (newEndsAt === appointment.ends_at) return;
    await resize(appointment, newEndsAt);
  }

  function handleConfirm(appointment: Appointment) {
    confirm(appointment).catch(() => {});
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;

  const today = new Date();
  const dayWidthPercent = 100 / DAY_COUNT;

  return (
    <div className="overflow-x-auto rounded-md border">
      <div className="grid min-w-[900px]" style={{ gridTemplateColumns: `60px repeat(${DAY_COUNT}, minmax(120px, 1fr))` }}>
        <div className="border-b border-r" />
        {days.map((day) => (
          <button
            type="button"
            key={day.toISOString()}
            onClick={() => onSelectDay(toDateStr(day))}
            className={cn(
              "flex flex-col items-center gap-0.5 border-b border-r p-2 text-center last:border-r-0 hover:bg-muted/50",
              isSameDay(day, today) && "bg-accent-soft",
            )}
          >
            <span className="text-[10px] uppercase text-muted-foreground">{format(day, "EEEEEE", { locale: ptBR })}</span>
            <span className={cn("text-sm font-medium", isSameDay(day, today) && "text-accent")}>{format(day, "d")}</span>
          </button>
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

        <div ref={canvasRef} className="relative" style={{ height: totalHeight, gridColumn: `span ${DAY_COUNT}` }}>
          {hourMarks.map((m) => (
            <div key={m} className="absolute left-0 right-0 border-t" style={{ top: (m - windowStart) * PX_PER_MIN }} />
          ))}
          {Array.from({ length: DAY_COUNT - 1 }, (_, i) => i + 1).map((i) => (
            <div key={i} className="absolute top-0 bottom-0 border-r" style={{ left: `${i * dayWidthPercent}%` }} />
          ))}

          {days.map((day, dayIndex) => {
            const dayAppts = visible.filter((a) => isSameDay(new Date(a.starts_at), day));
            const lanes = layoutOverlaps(dayAppts);
            const laneById = new Map(lanes.map((l) => [l.id, l]));

            return dayAppts.map((a) => {
              const startMin = minutesOfDay(a.starts_at);
              const endMin = minutesOfDay(a.ends_at);
              const top = (startMin - windowStart) * PX_PER_MIN;
              const height = Math.max((endMin - startMin) * PX_PER_MIN, 16);
              const lane = laneById.get(a.id) ?? { lane: 0, laneCount: 1 };
              const widthPercent = dayWidthPercent / lane.laneCount;
              const leftPercent = dayIndex * dayWidthPercent + lane.lane * widthPercent;
              const service = productName.get(a.product_id) ?? "Serviço";
              return (
                <AppointmentBlock
                  key={a.id}
                  appointment={a}
                  top={top}
                  height={height}
                  pxPerMin={PX_PER_MIN}
                  windowStart={windowStart}
                  columnHeight={totalHeight}
                  leftPercent={leftPercent}
                  widthPercent={widthPercent}
                  indicatorColor={resourceColor.get(a.resource_id) ?? undefined}
                  dragAxis="both"
                  dayIndex={dayIndex}
                  dayCount={DAY_COUNT}
                  dayLabels={dayLabels}
                  getCanvasWidth={getCanvasWidth}
                  canWrite={canWrite}
                  onOpen={onOpen}
                  onDrop={(appt, result) => handleDrop(appt, dayIndex, result)}
                  onResize={(appt, result) => handleResize(appt, dayIndex, result)}
                  onConfirm={handleConfirm}
                  onCancelRequest={onCancelRequest}
                  title={`${minutesToLabel(startMin)}–${minutesToLabel(endMin)} · ${a.contact_name ? `${a.contact_name} · ` : ""}${service}`}
                >
                  <div className="flex flex-col overflow-hidden">
                    <span className="truncate font-medium">
                      {minutesToLabel(startMin)}–{minutesToLabel(endMin)}
                    </span>
                    {a.contact_name && <span className="truncate">{a.contact_name}</span>}
                    <span className="truncate opacity-80">{service}</span>
                  </div>
                </AppointmentBlock>
              );
            });
          })}
        </div>
      </div>
    </div>
  );
}
