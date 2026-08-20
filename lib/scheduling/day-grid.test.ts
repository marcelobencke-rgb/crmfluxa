import { describe, it, expect } from "vitest";
import { minutesOfDay, minutesToLabel, minutesToIso, dateStrOf, availabilityWindow } from "./day-grid";

describe("day-grid", () => {
  it("minutesOfDay converte instante UTC pro minuto do dia em -03:00", () => {
    expect(minutesOfDay("2026-08-19T13:00:00.000Z")).toBe(10 * 60);
  });

  it("minutesOfDay lida com virada de dia (madrugada em -03:00)", () => {
    expect(minutesOfDay("2026-08-19T02:00:00.000Z")).toBe(23 * 60);
  });

  it("minutesToLabel formata HH:MM com zero à esquerda", () => {
    expect(minutesToLabel(9 * 60 + 5)).toBe("09:05");
  });

  it("minutesToIso e minutesOfDay são inversas dentro do mesmo dia", () => {
    const iso = minutesToIso("2026-08-19", 10 * 60 + 30);
    expect(minutesOfDay(iso)).toBe(10 * 60 + 30);
  });

  it("minutesToIso trava o minuto dentro de [0, 24h)", () => {
    const iso = minutesToIso("2026-08-19", 24 * 60 + 30);
    expect(iso).toBe(new Date("2026-08-19T23:59:00-03:00").toISOString());
  });

  it("dateStrOf lê o dia local em -03:00, não o dia UTC", () => {
    // 2026-08-19T02:00:00Z = 2026-08-18 23:00 em -03:00 — dia anterior.
    expect(dateStrOf("2026-08-19T02:00:00.000Z")).toBe("2026-08-18");
    expect(dateStrOf("2026-08-19T13:00:00.000Z")).toBe("2026-08-19");
  });

  describe("availabilityWindow", () => {
    it("retorna null quando ninguém atende naquele dia da semana", () => {
      const rows = [{ weekday: 1, start_time: "09:00", end_time: "18:00" }];
      expect(availabilityWindow(rows, 0)).toBeNull();
    });

    it("devolve início e fim de um único recurso", () => {
      const rows = [{ weekday: 2, start_time: "09:00:00", end_time: "18:00:00" }];
      expect(availabilityWindow(rows, 2)).toEqual({ start: 9 * 60, end: 18 * 60 });
    });

    it("une a grade de vários recursos no mesmo dia — pega o mais cedo e o mais tarde", () => {
      const rows = [
        { weekday: 3, start_time: "09:00", end_time: "13:00" },
        { weekday: 3, start_time: "14:00", end_time: "22:00" },
        { weekday: 1, start_time: "06:00", end_time: "07:00" }, // outro dia, ignora
      ];
      expect(availabilityWindow(rows, 3)).toEqual({ start: 9 * 60, end: 22 * 60 });
    });
  });
});
