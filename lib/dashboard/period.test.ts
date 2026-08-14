import { describe, expect, it } from "vitest";
import {
  janelaDiaCheio,
  janelaHoje,
  janelaMesAnteriorEquivalente,
  janelaMesAtual,
  janelaMesCheio,
  janelaOntemEquivalente,
  janelaSemanaAtual,
  variacaoPct,
} from "./period";

describe("janelaHoje", () => {
  it("vai da meia-noite de hoje até agora", () => {
    const agora = new Date(2026, 7, 14, 15, 30, 0);
    const j = janelaHoje(agora);
    expect(j.from.toISOString()).toBe(new Date(2026, 7, 14, 0, 0, 0, 0).toISOString());
    expect(j.to).toEqual(agora);
  });
});

describe("janelaOntemEquivalente", () => {
  it("mesmo horário decorrido, um dia antes", () => {
    const agora = new Date(2026, 7, 14, 15, 30, 0);
    const j = janelaOntemEquivalente(agora);
    expect(j.from).toEqual(new Date(2026, 7, 13, 0, 0, 0, 0));
    expect(j.to).toEqual(new Date(2026, 7, 13, 15, 30, 0));
  });

  it("atravessa virada de mês corretamente", () => {
    const agora = new Date(2026, 7, 1, 9, 0, 0);
    const j = janelaOntemEquivalente(agora);
    expect(j.from).toEqual(new Date(2026, 6, 31, 0, 0, 0, 0));
    expect(j.to).toEqual(new Date(2026, 6, 31, 9, 0, 0));
  });
});

describe("janelaDiaCheio", () => {
  it("meia-noite a meia-noite, mesmo que já seja de manhã", () => {
    const agora = new Date(2026, 7, 14, 9, 0, 0);
    const j = janelaDiaCheio(agora);
    expect(j.from).toEqual(new Date(2026, 7, 14, 0, 0, 0, 0));
    expect(j.to).toEqual(new Date(2026, 7, 15, 0, 0, 0, 0));
  });
});

describe("janelaSemanaAtual", () => {
  it("começa na segunda-feira desta semana", () => {
    const quinta = new Date(2026, 7, 13, 14, 0, 0); // 13 ago 2026 é quinta
    const j = janelaSemanaAtual(quinta);
    expect(j.from).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0)); // segunda anterior
    expect(j.to).toEqual(quinta);
  });

  it("no próprio domingo, começa na segunda desta mesma semana (não pula pra próxima)", () => {
    const domingo = new Date(2026, 7, 16, 8, 0, 0); // 16 ago 2026 é domingo
    const j = janelaSemanaAtual(domingo);
    expect(j.from).toEqual(new Date(2026, 7, 10, 0, 0, 0, 0));
  });
});

describe("janelaMesAtual", () => {
  it("vai do dia 1 do mês até agora", () => {
    const agora = new Date(2026, 7, 14, 15, 30, 0);
    const j = janelaMesAtual(agora);
    expect(j.from).toEqual(new Date(2026, 7, 1));
    expect(j.to).toEqual(agora);
  });
});

describe("janelaMesCheio", () => {
  it("vai do dia 1 ao dia 1 do mês seguinte, inclui datas futuras do mesmo mês", () => {
    const agora = new Date(2026, 7, 5, 10, 0, 0); // 5 ago
    const j = janelaMesCheio(agora);
    expect(j.from).toEqual(new Date(2026, 7, 1));
    expect(j.to).toEqual(new Date(2026, 8, 1));
  });

  it("atravessa virada de ano corretamente", () => {
    const agora = new Date(2026, 11, 20, 10, 0, 0); // 20 dez
    const j = janelaMesCheio(agora);
    expect(j.from).toEqual(new Date(2026, 11, 1));
    expect(j.to).toEqual(new Date(2027, 0, 1));
  });
});

describe("janelaMesAnteriorEquivalente", () => {
  it("mesmo corte de dia, um mês antes", () => {
    const agora = new Date(2026, 7, 12, 10, 0, 0); // 12 ago
    const j = janelaMesAnteriorEquivalente(agora);
    expect(j.from).toEqual(new Date(2026, 6, 1));
    expect(j.to).toEqual(new Date(2026, 6, 12, 10, 0, 0));
  });

  it("mês anterior mais curto (31 de março vs fevereiro) usa o mês inteiro, sem estourar", () => {
    const agora = new Date(2026, 2, 31, 10, 0, 0); // 31 mar 2026 — fev/2026 tem 28 dias
    const j = janelaMesAnteriorEquivalente(agora);
    expect(j.from).toEqual(new Date(2026, 1, 1));
    expect(j.to).toEqual(new Date(2026, 1, 28, 10, 0, 0));
  });
});

describe("variacaoPct", () => {
  it("calcula a variação percentual normal", () => {
    expect(variacaoPct(120, 100)).toBe(20);
    expect(variacaoPct(80, 100)).toBe(-20);
  });

  it("retorna null quando o período anterior é zero (evita Infinity/NaN)", () => {
    expect(variacaoPct(5, 0)).toBeNull();
    expect(variacaoPct(0, 0)).toBeNull();
  });
});
