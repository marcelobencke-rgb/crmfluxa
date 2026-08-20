"use client";
import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import {
  DEFAULT_END_MIN,
  DEFAULT_START_MIN,
  PX_PER_MIN,
  availabilityWindow,
  minutesOfDay,
  minutesToIso,
  minutesToLabel,
} from "@/lib/scheduling/day-grid";
import { weekdayOfDateStr } from "@/lib/scheduling/slots";
import { useAppointmentsByDay } from "@/hooks/appointments/useAppointmentsByDay";
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

interface Props {
  date: string;
  canWrite: boolean;
  onOpen: (appointment: Appointment) => void;
  onCancelRequest: (appointment: Appointment) => void;
}

/**
 * Grade dia único — colunas por recurso, linhas por horário (spec 18). Dentro de um
 * recurso os agendamentos nunca se sobrepõem (exclusion constraint no banco), então
 * cada coluna usa uma única raia — sem precisar do empacotamento de lib/scheduling/overlap-layout.ts
 * (esse é assunto da grade semanal, que mistura recursos numa mesma coluna de dia).
 */
export function DayView({ date, canWrite, onOpen, onCancelRequest }: Props) {
  const { data: appointments, isLoading: loadingAppts } = useAppointmentsByDay(date);
  const { data: resources, isLoading: loadingResources } = useResources();
  const { data: products } = useProducts();
  const reschedule = useRescheduleAppointment();
  const resize = useResizeAppointment();
  const confirm = useConfirmAppointment();

  const productName = React.useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products],
  );
  const activeResources = React.useMemo(
    () => (resources ?? []).filter((r) => r.is_active),
    [resources],
  );
  const activeResourceIds = React.useMemo(() => activeResources.map((r) => r.id), [activeResources]);
  const { data: availabilityRows } = useResourcesAvailability(activeResourceIds);
  const visible = (appointments ?? []).filter((a) => a.status !== "cancelled");

  const { windowStart, windowEnd } = React.useMemo(() => {
    // Janela parte do expediente configurado (Recursos → Disponibilidade) — sem isso,
    // toda agenda mostrava 07h-21h fixo mesmo pra quem atende só de manhã. Sem
    // disponibilidade cadastrada pra nenhum recurso ativo, cai no default de sempre.
    const weekday = weekdayOfDateStr(date);
    const avail = availabilityWindow(availabilityRows, weekday);
    let start = avail ? Math.floor(avail.start / 60) * 60 : DEFAULT_START_MIN;
    let end = avail ? Math.ceil(avail.end / 60) * 60 : DEFAULT_END_MIN;
    for (const a of visible) {
      const s = minutesOfDay(a.starts_at);
      const e = minutesOfDay(a.ends_at);
      if (s < start) start = Math.floor(s / 60) * 60;
      if (e > end) end = Math.ceil(e / 60) * 60;
    }
    return { windowStart: start, windowEnd: end };
  }, [visible, availabilityRows, date]);

  const hourMarks: number[] = [];
  for (let m = windowStart; m <= windowEnd; m += 60) hourMarks.push(m);
  const totalHeight = (windowEnd - windowStart) * PX_PER_MIN;

  const isLoading = loadingAppts || loadingResources;

  async function handleDrop(appointment: Appointment, result: DropResult) {
    const newStartsAt = minutesToIso(date, result.minutesOfDay);
    if (newStartsAt === appointment.starts_at) return;
    await reschedule(appointment, newStartsAt);
  }

  async function handleResize(appointment: Appointment, result: ResizeResult) {
    const newEndsAt = minutesToIso(date, result.endMinutesOfDay);
    if (newEndsAt === appointment.ends_at) return;
    await resize(appointment, newEndsAt);
  }

  function handleConfirm(appointment: Appointment) {
    confirm(appointment).catch(() => {});
  }

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (!activeResources.length) {
    return <p className="text-sm text-muted-foreground">Nenhum recurso ativo cadastrado ainda.</p>;
  }

  return (
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
                const startMin = minutesOfDay(a.starts_at);
                const endMin = minutesOfDay(a.ends_at);
                const top = (startMin - windowStart) * PX_PER_MIN;
                const height = Math.max((endMin - startMin) * PX_PER_MIN, 18);
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
                    canWrite={canWrite}
                    onOpen={onOpen}
                    onDrop={handleDrop}
                    onResize={handleResize}
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
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
