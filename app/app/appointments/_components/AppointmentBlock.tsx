"use client";
import * as React from "react";

import { cn } from "@/lib/utils";
import { DRAG_SNAP_MIN, minutesToLabel } from "@/lib/scheduling/day-grid";
import { Check, X } from "@/lib/ui/icons";
import type { Appointment } from "@/hooks/appointments/useAppointments";

const MOVE_THRESHOLD_PX = 4;
/** Duração mínima ao redimensionar — mesmo grid de 15min do arraste de horário. */
const MIN_HEIGHT_MIN = DRAG_SNAP_MIN;

export interface DropResult {
  /** Minuto do dia (0-1439), já arredondado pro grid de DRAG_SNAP_MIN. */
  minutesOfDay: number;
  /** Só presente quando `dragAxis="both"` — índice (0-based) da coluna de dia onde soltou. */
  dayIndex?: number;
}

export interface ResizeResult {
  /** Minuto do dia (0-1439) do novo fim, já arredondado pro grid de DRAG_SNAP_MIN. */
  endMinutesOfDay: number;
}

interface Snap {
  clampedTop: number;
  minutesOfDay: number;
  dayIndex?: number;
}

interface Props {
  appointment: Appointment;
  /** Posição/tamanho em px, já convertidos pela view (dia ou semana). */
  top: number;
  height: number;
  pxPerMin: number;
  windowStart: number;
  columnHeight: number;
  leftPercent?: number;
  widthPercent?: number;
  /** Listra a borda esquerda com essa cor — usado na semana pra distinguir recurso dentro de uma coluna de dia. */
  indicatorColor?: string;
  /**
   * "vertical" (default, dia único — só muda o horário) ou "both" (semana — arrasta
   * pra outro dia também). Em "both", `dayIndex`/`dayCount`/`getCanvasWidth` são obrigatórios.
   */
  dragAxis?: "vertical" | "both";
  dayIndex?: number;
  dayCount?: number;
  /** Rótulo curto de cada dia (ex. "seg 17") — só usado em "both", pro tooltip mostrar o dia junto do horário. */
  dayLabels?: string[];
  /** Largura em px do canvas que abrange todas as colunas de dia — medida sob demanda no início do arraste. */
  getCanvasWidth?: () => number;
  canWrite: boolean;
  /** Clique no corpo do card (sem arrastar) — abre o diálogo de edição. */
  onOpen: (appointment: Appointment) => void;
  onDrop: (appointment: Appointment, result: DropResult) => Promise<void>;
  /** Arrastar a borda inferior do card — muda só a duração (ends_at), mesmo dia/recurso. */
  onResize: (appointment: Appointment, result: ResizeResult) => Promise<void>;
  /** Botão de confirmação rápida — só aparece se o status for "scheduled". */
  onConfirm: (appointment: Appointment) => void;
  /** Botão de cancelamento rápido — abre o diálogo de cancelar (pede motivo). */
  onCancelRequest: (appointment: Appointment) => void;
  title?: string;
  children: React.ReactNode;
}

/**
 * Bloco de agendamento posicionado por horário. Clique no corpo abre edição; botões de
 * confirmar/cancelar aparecem no canto ao passar o mouse (mesma ação rápida da Lista,
 * sem abrir diálogo pra confirmar). Arrastável pra remarcar (spec 18 — "parecido com o
 * Google Agenda") e redimensionável pela borda inferior pra mudar a duração. Vertical
 * muda o horário sempre, horizontal muda o dia quando `dragAxis="both"` (grade semanal).
 * Mostra um selo com o horário/duração já atualizado enquanto arrasta — o selo é irmão
 * do botão, não filho, porque o botão tem `overflow-hidden` (recorta o texto do próprio
 * card) e recortaria o selo também se ele estivesse por dentro. Distingue clique de
 * arraste por deslocamento mínimo; um arraste marca `suppressClickRef` pra o click
 * disparado no fim do gesto não reabrir a edição.
 */
export function AppointmentBlock({
  appointment,
  top,
  height,
  pxPerMin,
  windowStart,
  columnHeight,
  leftPercent = 0,
  widthPercent = 100,
  indicatorColor,
  dragAxis = "vertical",
  dayIndex = 0,
  dayCount = 1,
  dayLabels,
  getCanvasWidth,
  canWrite,
  onOpen,
  onDrop,
  onResize,
  onConfirm,
  onCancelRequest,
  title,
  children,
}: Props) {
  const [dragOffsetY, setDragOffsetY] = React.useState(0);
  const [dragOffsetXPercent, setDragOffsetXPercent] = React.useState(0);
  const [isDragging, setIsDragging] = React.useState(false);
  const [preview, setPreview] = React.useState<Snap | null>(null);
  const dragState = React.useRef<{ startX: number; startY: number; moved: boolean; canvasWidth: number } | null>(
    null,
  );
  const suppressClickRef = React.useRef(false);

  const [resizeOffsetY, setResizeOffsetY] = React.useState(0);
  const [isResizing, setIsResizing] = React.useState(false);
  const [resizeEndMinutes, setResizeEndMinutes] = React.useState<number | null>(null);
  const resizeState = React.useRef<{ startY: number; moved: boolean } | null>(null);

  function computeSnap(dy: number, dx: number, canvasWidth: number): Snap {
    const clampedTop = Math.max(0, Math.min(columnHeight - height, top + dy));
    const minutesOfDay = Math.round((windowStart + clampedTop / pxPerMin) / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;

    if (dragAxis !== "both") return { clampedTop, minutesOfDay };

    const dayWidthPercent = 100 / dayCount;
    const offsetXPercent = canvasWidth > 0 ? (dx / canvasWidth) * 100 : 0;
    const droppedLeftPercent = dayIndex * dayWidthPercent + offsetXPercent;
    const snappedDayIndex = Math.max(0, Math.min(dayCount - 1, Math.round(droppedLeftPercent / dayWidthPercent)));
    return { clampedTop, minutesOfDay, dayIndex: snappedDayIndex };
  }

  function computeResize(dy: number): { clampedHeight: number; endMinutesOfDay: number } {
    const minHeight = MIN_HEIGHT_MIN * pxPerMin;
    const maxHeight = columnHeight - top;
    const rawHeight = Math.max(minHeight, Math.min(maxHeight, height + dy));
    const rawEndMinutes = windowStart + (top + rawHeight) / pxPerMin;
    const endMinutesOfDay = Math.round(rawEndMinutes / DRAG_SNAP_MIN) * DRAG_SNAP_MIN;
    const clampedHeight = Math.max(minHeight, (endMinutesOfDay - windowStart) * pxPerMin - top);
    return { clampedHeight, endMinutesOfDay };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLButtonElement>) {
    if (!canWrite) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      canvasWidth: dragAxis === "both" ? (getCanvasWidth?.() ?? 0) : 0,
    };
  }

  function handlePointerMove(e: React.PointerEvent<HTMLButtonElement>) {
    const state = dragState.current;
    if (!state) return;
    const dy = e.clientY - state.startY;
    const dx = dragAxis === "both" ? e.clientX - state.startX : 0;
    if (!state.moved) {
      if (Math.abs(dy) < MOVE_THRESHOLD_PX && Math.abs(dx) < MOVE_THRESHOLD_PX) return;
      state.moved = true;
      setIsDragging(true);
    }
    const snap = computeSnap(dy, dx, state.canvasWidth);
    setDragOffsetY(snap.clampedTop - top);
    if (dragAxis === "both") {
      setDragOffsetXPercent(state.canvasWidth > 0 ? (dx / state.canvasWidth) * 100 : 0);
    }
    setPreview(snap);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLButtonElement>) {
    const state = dragState.current;
    dragState.current = null;
    if (!state) return;

    // Recalcula a partir das coordenadas do próprio pointerup, em vez de confiar só no
    // acumulado do pointermove: um gesto sintético (automação) ou um flick rápido pode
    // soltar num ponto sem um pointermove correspondente logo antes — se a gente só
    // olhasse o último offset visto, o drop ficaria preso na posição do penúltimo move.
    const finalDy = e.clientY - state.startY;
    const finalDx = dragAxis === "both" ? e.clientX - state.startX : 0;
    const moved = state.moved || Math.abs(finalDy) >= MOVE_THRESHOLD_PX || Math.abs(finalDx) >= MOVE_THRESHOLD_PX;
    if (!moved) {
      setPreview(null);
      return; // clique simples — o onClick nativo do botão trata
    }

    suppressClickRef.current = true;
    setIsDragging(false);

    const snap = computeSnap(finalDy, finalDx, state.canvasWidth);
    setDragOffsetY(snap.clampedTop - top);
    if (dragAxis === "both") {
      const dayWidthPercent = 100 / dayCount;
      setDragOffsetXPercent(((snap.dayIndex ?? dayIndex) - dayIndex) * dayWidthPercent);
    }

    void onDrop(appointment, { minutesOfDay: snap.minutesOfDay, dayIndex: snap.dayIndex })
      .then(() => {
        setDragOffsetY(0);
        setDragOffsetXPercent(0);
        setPreview(null);
      })
      .catch(() => {
        setDragOffsetY(0);
        setDragOffsetXPercent(0);
        setPreview(null);
      });
  }

  function handlePointerCancel() {
    dragState.current = null;
    setIsDragging(false);
    setDragOffsetY(0);
    setDragOffsetXPercent(0);
    setPreview(null);
  }

  function handleClick() {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    onOpen(appointment);
  }

  function handleResizePointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!canWrite) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    resizeState.current = { startY: e.clientY, moved: false };
  }

  function handleResizePointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const state = resizeState.current;
    if (!state) return;
    const dy = e.clientY - state.startY;
    if (!state.moved) {
      if (Math.abs(dy) < MOVE_THRESHOLD_PX) return;
      state.moved = true;
      setIsResizing(true);
    }
    const { clampedHeight, endMinutesOfDay } = computeResize(dy);
    setResizeOffsetY(clampedHeight - height);
    setResizeEndMinutes(endMinutesOfDay);
  }

  function handleResizePointerUp(e: React.PointerEvent<HTMLDivElement>) {
    const state = resizeState.current;
    resizeState.current = null;
    if (!state) return;
    const finalDy = e.clientY - state.startY;
    const moved = state.moved || Math.abs(finalDy) >= MOVE_THRESHOLD_PX;
    setIsResizing(false);
    if (!moved) {
      setResizeEndMinutes(null);
      return;
    }

    const { clampedHeight, endMinutesOfDay } = computeResize(finalDy);
    setResizeOffsetY(clampedHeight - height);

    void onResize(appointment, { endMinutesOfDay })
      .then(() => {
        setResizeOffsetY(0);
        setResizeEndMinutes(null);
      })
      .catch(() => {
        setResizeOffsetY(0);
        setResizeEndMinutes(null);
      });
  }

  function handleResizePointerCancel() {
    resizeState.current = null;
    setIsResizing(false);
    setResizeOffsetY(0);
    setResizeEndMinutes(null);
  }

  const dragPreviewLabel = preview
    ? dragAxis === "both" && dayLabels?.[preview.dayIndex ?? dayIndex]
      ? `${dayLabels[preview.dayIndex ?? dayIndex]} · ${minutesToLabel(preview.minutesOfDay)}`
      : minutesToLabel(preview.minutesOfDay)
    : null;
  const resizePreviewLabel = resizeEndMinutes !== null ? `até ${minutesToLabel(resizeEndMinutes)}` : null;
  const showConfirm = canWrite && appointment.status === "scheduled";
  const showCancel = canWrite && !["completed", "no_show", "cancelled"].includes(appointment.status);

  return (
    <div
      className="group absolute"
      style={{
        top: top + dragOffsetY,
        height: height + resizeOffsetY,
        left: `calc(${leftPercent + dragOffsetXPercent}% + 2px)`,
        width: `calc(${widthPercent}% - 4px)`,
      }}
    >
      <button
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        onClick={handleClick}
        className={cn(
          "absolute inset-0 overflow-hidden rounded-sm border px-1.5 py-0.5 text-left text-[11px] leading-tight",
          "border-accent bg-accent-soft text-accent hover:brightness-95",
          !canWrite && "cursor-default",
          canWrite && "touch-none cursor-grab",
          (isDragging || isResizing) && "z-10 cursor-grabbing shadow-md",
        )}
        style={indicatorColor ? { borderLeftWidth: 3, borderLeftColor: indicatorColor } : undefined}
        title={title}
      >
        {children}
      </button>

      {(showConfirm || showCancel) && (
        <div className="absolute right-0.5 top-0.5 z-20 flex gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          {showConfirm && (
            <button
              type="button"
              aria-label="Confirmar agendamento"
              title="Confirmar"
              onClick={(e) => {
                e.stopPropagation();
                onConfirm(appointment);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-sm bg-surface text-success shadow hover:brightness-95"
            >
              <Check className="h-3 w-3" />
            </button>
          )}
          {showCancel && (
            <button
              type="button"
              aria-label="Cancelar agendamento"
              title="Cancelar"
              onClick={(e) => {
                e.stopPropagation();
                onCancelRequest(appointment);
              }}
              className="flex h-4 w-4 items-center justify-center rounded-sm bg-surface text-destructive shadow hover:brightness-95"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>
      )}

      {canWrite && (
        <div
          onPointerDown={handleResizePointerDown}
          onPointerMove={handleResizePointerMove}
          onPointerUp={handleResizePointerUp}
          onPointerCancel={handleResizePointerCancel}
          className="group absolute inset-x-0 bottom-0 z-20 flex h-2.5 touch-none cursor-ns-resize items-end justify-center"
        >
          <div className="mb-0.5 h-0.5 w-5 rounded-full bg-accent-foreground/0 group-hover:bg-accent-foreground/60" />
        </div>
      )}

      {isDragging && dragPreviewLabel ? (
        <span className="pointer-events-none absolute -top-6 left-0 z-30 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground shadow">
          {dragPreviewLabel}
        </span>
      ) : null}
      {isResizing && resizePreviewLabel ? (
        <span className="pointer-events-none absolute -bottom-6 left-0 z-30 whitespace-nowrap rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground shadow">
          {resizePreviewLabel}
        </span>
      ) : null}
    </div>
  );
}
