import { describe, expect, it } from "vitest";
import { metricsToCsv } from "./csv-export";

const GERADO_EM = new Date(2026, 7, 14, 10, 0, 0);

describe("metricsToCsv", () => {
  it("gera as duas tabelas com cabeçalho", () => {
    const csv = metricsToCsv(
      [{ stage_id: "s1", stage_name: "Novo", position: 1000, count: 3 }],
      [
        {
          user_id: "u1",
          name: "Ana Souza",
          email: "ana@empresa.com",
          won: 2,
          lost: 1,
          conversations_handled: 10,
          avg_first_response_seconds: 45,
        },
      ],
      GERADO_EM,
    );

    expect(csv).toContain("Etapa,Negócios abertos");
    expect(csv).toContain("Novo,3");
    expect(csv).toContain("Ana Souza,2,1,10,45");
  });

  it("usa email quando não há nome, e id quando não há nenhum dos dois", () => {
    const csv = metricsToCsv(
      [],
      [
        {
          user_id: "u2",
          name: null,
          email: "sem-nome@empresa.com",
          won: 0,
          lost: 0,
          conversations_handled: 0,
          avg_first_response_seconds: null,
        },
        {
          user_id: "u3",
          name: null,
          email: null,
          won: 0,
          lost: 0,
          conversations_handled: 0,
          avg_first_response_seconds: null,
        },
      ],
      GERADO_EM,
    );

    expect(csv).toContain("sem-nome@empresa.com");
    expect(csv).toContain("u3");
  });

  it("escapa vírgula e aspas no nome do atendente", () => {
    const csv = metricsToCsv(
      [],
      [
        {
          user_id: "u4",
          name: 'Ana, "a chefe"',
          email: null,
          won: 0,
          lost: 0,
          conversations_handled: 0,
          avg_first_response_seconds: null,
        },
      ],
      GERADO_EM,
    );

    expect(csv).toContain('"Ana, ""a chefe"""');
  });

  it("começa com BOM pra acentuação abrir certo no Excel", () => {
    const csv = metricsToCsv([], [], GERADO_EM);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
  });
});
