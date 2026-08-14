import { describe, expect, it } from "vitest";
import { deveEnviarHoje, janelaDoRelatorio } from "./schedule";

describe("deveEnviarHoje", () => {
  it("weekly só dispara na segunda-feira", () => {
    const segunda = new Date(2026, 7, 10); // 10 ago 2026 é segunda
    const terca = new Date(2026, 7, 11);
    expect(deveEnviarHoje("weekly", segunda)).toBe(true);
    expect(deveEnviarHoje("weekly", terca)).toBe(false);
  });

  it("monthly só dispara no dia 1", () => {
    const dia1 = new Date(2026, 7, 1);
    const dia2 = new Date(2026, 7, 2);
    expect(deveEnviarHoje("monthly", dia1)).toBe(true);
    expect(deveEnviarHoje("monthly", dia2)).toBe(false);
  });
});

describe("janelaDoRelatorio", () => {
  it("weekly cobre os últimos 7 dias", () => {
    const hoje = new Date(2026, 7, 10, 12, 0, 0);
    const j = janelaDoRelatorio("weekly", hoje);
    expect(j.to).toEqual(hoje);
    expect(j.from).toEqual(new Date(2026, 7, 3, 12, 0, 0));
  });

  it("monthly cobre o mês calendário anterior inteiro", () => {
    const hoje = new Date(2026, 7, 1, 12, 0, 0); // 1 ago
    const j = janelaDoRelatorio("monthly", hoje);
    expect(j.from).toEqual(new Date(2026, 6, 1));
    expect(j.to).toEqual(new Date(2026, 7, 1));
  });

  it("monthly atravessa virada de ano", () => {
    const hoje = new Date(2027, 0, 1, 12, 0, 0); // 1 jan 2027
    const j = janelaDoRelatorio("monthly", hoje);
    expect(j.from).toEqual(new Date(2026, 11, 1));
    expect(j.to).toEqual(new Date(2027, 0, 1));
  });
});
