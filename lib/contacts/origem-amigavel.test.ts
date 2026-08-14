import { describe, expect, it } from "vitest";
import { origemAmigavel } from "./origem-amigavel";

describe("origemAmigavel", () => {
  it("traduz utm_source conhecido", () => {
    expect(origemAmigavel({ utm_source: "instagram" })).toBe("Instagram");
  });

  it("é case-insensitive", () => {
    expect(origemAmigavel({ utm_source: "Instagram" })).toBe("Instagram");
  });

  it("mostra a campanha junto, quando existe", () => {
    expect(origemAmigavel({ utm_source: "google", utm_campaign: "black_friday" })).toBe(
      'Google — campanha "black_friday"',
    );
  });

  it("valor desconhecido aparece como veio, sem chute de tradução", () => {
    expect(origemAmigavel({ utm_source: "referral_parceiro_x" })).toBe("referral_parceiro_x");
  });

  it("sem utm_source retorna null", () => {
    expect(origemAmigavel({})).toBeNull();
    expect(origemAmigavel(null)).toBeNull();
    expect(origemAmigavel(undefined)).toBeNull();
  });
});
