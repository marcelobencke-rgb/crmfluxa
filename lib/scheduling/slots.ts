/**
 * Cálculo de horários livres — spec 18 §2.4/§5 (`available-slots`).
 *
 * disponibilidade semanal do recurso − agendamentos existentes − bloqueios = slots livres.
 * Função pura (sem I/O): quem chama busca os dados no banco e passa aqui.
 *
 * SIMPLIFICAÇÃO CONHECIDA: assume fuso fixo `ORG_TZ_OFFSET`. `organizations` não tem
 * coluna de timezone hoje (só `channel_knobs.timezone`, específico da janela anti-ban do
 * WhatsApp). Brasil não observa horário de verão desde 2019 — `-03:00` é o offset de
 * Brasília/São Paulo o ano inteiro, sem o bug clássico de "pular uma hora" que um offset
 * fixo teria em fuso com DST. Quando o produto precisar de multi-fuso de verdade (ex.:
 * organização em Manaus, -04:00), isto vira campo em `organizations` e passa a ser
 * parâmetro em vez de constante.
 */

export const ORG_TZ_OFFSET = "-03:00";

/** Teto de segurança: nem o cliente nem um bug de range viram uma varredura de anos. */
export const MAX_DATE_RANGE_DAYS = 31;

export interface AvailabilityWindow {
  weekday: number; // 0=domingo .. 6=sábado (JS Date#getUTCDay)
  start_time: string; // "HH:MM" ou "HH:MM:SS"
  end_time: string;
}

export interface BusyRange {
  starts_at: string; // ISO instant
  ends_at: string;
}

export interface FreeSlot {
  slot_start: string; // ISO instant, ORG_TZ_OFFSET
  slot_end: string;
}

function toMinutes(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function fromMinutes(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** "YYYY-MM-DD" → weekday, calculado em UTC puro pra não depender do fuso do processo. */
export function weekdayOfDateStr(dateStr: string): number {
  const [y, mo, d] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1)).getUTCDay();
}

function toInstant(dateStr: string, time: string): string {
  return `${dateStr}T${time}:00${ORG_TZ_OFFSET}`;
}

function addDaysToDateStr(dateStr: string, days: number): string {
  const [y, mo, d] = dateStr.split("-").map(Number);
  const dt = new Date(Date.UTC(y ?? 1970, (mo ?? 1) - 1, (d ?? 1) + days));
  return dt.toISOString().slice(0, 10);
}

export interface ComputeSlotsParams {
  dateFrom: string;
  dateTo: string;
  durationMinutes: number;
  availability: AvailabilityWindow[];
  busy: BusyRange[];
  /** Passo entre slots candidatos, em minutos. Default: back-to-back (= duração). */
  stepMinutes?: number;
  /** Não oferece horário que já passou — comparado contra ISO instant. Omitido em teste. */
  now?: string;
}

export function computeAvailableSlots(params: ComputeSlotsParams): FreeSlot[] {
  const { dateFrom, dateTo, durationMinutes, availability, busy, now } = params;
  const step = params.stepMinutes ?? durationMinutes;
  if (durationMinutes <= 0) return [];

  const busyRanges = busy.map((b) => ({
    start: new Date(b.starts_at).getTime(),
    end: new Date(b.ends_at).getTime(),
  }));
  const nowMs = now ? new Date(now).getTime() : null;

  const slots: FreeSlot[] = [];
  let cursorDate = dateFrom;
  let guard = 0;
  while (cursorDate <= dateTo && guard <= MAX_DATE_RANGE_DAYS) {
    guard += 1;
    const weekday = weekdayOfDateStr(cursorDate);
    const windows = availability.filter((w) => w.weekday === weekday);

    for (const w of windows) {
      const windowEnd = toMinutes(w.end_time);
      let cursorMin = toMinutes(w.start_time);
      while (cursorMin + durationMinutes <= windowEnd) {
        const slotStart = toInstant(cursorDate, fromMinutes(cursorMin));
        const slotEnd = toInstant(cursorDate, fromMinutes(cursorMin + durationMinutes));
        const slotStartMs = new Date(slotStart).getTime();
        const slotEndMs = new Date(slotEnd).getTime();

        const inPast = nowMs !== null && slotStartMs < nowMs;
        const overlapsBusy = busyRanges.some((b) => slotStartMs < b.end && b.start < slotEndMs);

        if (!inPast && !overlapsBusy) {
          slots.push({ slot_start: slotStart, slot_end: slotEnd });
        }
        cursorMin += step;
      }
    }

    cursorDate = addDaysToDateStr(cursorDate, 1);
  }

  return slots;
}
