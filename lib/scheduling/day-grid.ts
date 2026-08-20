/**
 * Helpers do eixo de horário (pixel ↔ minuto ↔ instante ISO) usados pelas
 * visualizações dia/semana da agenda (spec 18), incluindo o cálculo de
 * arrastar-e-soltar pra remarcar. Fuso fixo `ORG_TZ_OFFSET` — mesma
 * simplificação documentada em slots.ts.
 */
import { ORG_TZ_OFFSET } from "./slots";

export const PX_PER_MIN = 1.2;
export const DEFAULT_START_MIN = 7 * 60;
export const DEFAULT_END_MIN = 21 * 60;
/** Ao soltar um agendamento arrastado, arredonda pro múltiplo de N minutos mais próximo — mesmo grid de 15min do Google Agenda. */
export const DRAG_SNAP_MIN = 15;

/** ISO instant (UTC) → minutos desde meia-noite em ORG_TZ_OFFSET (-03:00 fixo). */
export function minutesOfDay(iso: string): number {
  const d = new Date(iso);
  let min = d.getUTCHours() * 60 + d.getUTCMinutes() - 180;
  if (min < 0) min += 1440;
  return min;
}

export function minutesToLabel(min: number): string {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" + minutos desde meia-noite → instante ISO, em ORG_TZ_OFFSET. */
export function minutesToIso(dateStr: string, minutesFromMidnight: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, Math.round(minutesFromMidnight)));
  const hh = String(Math.floor(clamped / 60)).padStart(2, "0");
  const mm = String(clamped % 60).padStart(2, "0");
  return new Date(`${dateStr}T${hh}:${mm}:00${ORG_TZ_OFFSET}`).toISOString();
}

/** ISO instant (UTC) → "YYYY-MM-DD" do dia local em ORG_TZ_OFFSET (-03:00 fixo). */
export function dateStrOf(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  return shifted.toISOString().slice(0, 10);
}

function timeStringToMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export interface AvailabilityRow {
  weekday: number;
  start_time: string;
  end_time: string;
}

/**
 * União (início mais cedo, fim mais tarde) das grades de disponibilidade de um ou mais
 * recursos nesse dia da semana. `null` quando ninguém atende naquele dia — quem chama
 * decide o fallback (spec 18: grade do dia/semana usa isso pra não mostrar 07h-21h fixo
 * quando o expediente real é bem mais curto).
 */
export function availabilityWindow(rows: AvailabilityRow[], weekday: number): { start: number; end: number } | null {
  const matches = rows.filter((r) => r.weekday === weekday);
  if (!matches.length) return null;
  let start = Infinity;
  let end = -Infinity;
  for (const r of matches) {
    start = Math.min(start, timeStringToMinutes(r.start_time));
    end = Math.max(end, timeStringToMinutes(r.end_time));
  }
  return { start, end };
}
