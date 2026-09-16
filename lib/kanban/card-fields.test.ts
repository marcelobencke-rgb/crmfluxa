import { describe, expect, it } from "vitest";

import { CAMPOS_DO_CARD, camposVisiveisDoCard } from "./card-fields";

describe("camposVisiveisDoCard", () => {
  it("settings ausente (pipeline nunca configurado) mostra tudo — comportamento de sempre", () => {
    expect(camposVisiveisDoCard(null)).toEqual(new Set(CAMPOS_DO_CARD));
    expect(camposVisiveisDoCard(undefined)).toEqual(new Set(CAMPOS_DO_CARD));
    expect(camposVisiveisDoCard({})).toEqual(new Set(CAMPOS_DO_CARD));
  });

  it("`card_fields: []` é a pessoa dizendo 'nenhum', não 'não configurei' — respeita o vazio", () => {
    expect(camposVisiveisDoCard({ card_fields: [] })).toEqual(new Set());
  });

  it("respeita a lista escolhida", () => {
    expect(camposVisiveisDoCard({ card_fields: ["value", "owner"] })).toEqual(
      new Set(["value", "owner"]),
    );
  });

  it("descarta lixo (tipo desconhecido) sem quebrar", () => {
    expect(camposVisiveisDoCard({ card_fields: ["value", "campo_que_nao_existe", 42] })).toEqual(
      new Set(["value"]),
    );
  });

  it("`card_fields` de tipo errado (não-array) cai no padrão, tudo visível", () => {
    expect(camposVisiveisDoCard({ card_fields: "value" })).toEqual(new Set(CAMPOS_DO_CARD));
  });
});
