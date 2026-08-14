import { describe, expect, it } from "vitest";
import { ETAPAS_GENERICO, findNicheTemplate, NICHE_IDS, NICHE_TEMPLATES } from "./niche-templates";

describe("NICHE_TEMPLATES", () => {
  it("todo nicho tem exatamente 1 etapa de ganho", () => {
    for (const n of NICHE_TEMPLATES) {
      const ganhos = n.stages.filter((s) => s.is_won);
      expect(ganhos, `nicho ${n.id}`).toHaveLength(1);
    }
  });

  it("todo nicho tem pelo menos 1 etapa de perda", () => {
    for (const n of NICHE_TEMPLATES) {
      const perdas = n.stages.filter((s) => s.is_lost);
      expect(perdas.length, `nicho ${n.id}`).toBeGreaterThanOrEqual(1);
    }
  });

  it("nenhuma etapa é ganho E perda ao mesmo tempo", () => {
    for (const n of NICHE_TEMPLATES) {
      for (const s of n.stages) {
        expect(s.is_won && s.is_lost, `${n.id}/${s.slug}`).toBe(false);
      }
    }
  });

  it("slugs são únicos dentro do mesmo nicho", () => {
    for (const n of NICHE_TEMPLATES) {
      const slugs = n.stages.map((s) => s.slug);
      expect(new Set(slugs).size, `nicho ${n.id}`).toBe(slugs.length);
    }
  });

  it("ids de nicho são únicos", () => {
    const ids = NICHE_TEMPLATES.map((n) => n.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("NICHE_IDS inclui todos os nichos mais 'generic'", () => {
    expect(NICHE_IDS).toContain("generic");
    for (const n of NICHE_TEMPLATES) expect(NICHE_IDS).toContain(n.id);
    expect(NICHE_IDS).toHaveLength(NICHE_TEMPLATES.length + 1);
  });

  it("findNicheTemplate acha por id e devolve null pro que não existe", () => {
    expect(findNicheTemplate("clinica")?.label).toBe("Clínica ou consultório");
    expect(findNicheTemplate("nao-existe")).toBeNull();
  });

  it("ETAPAS_GENERICO tem 1 ganho e 1 perda, igual aos nichos", () => {
    expect(ETAPAS_GENERICO.filter((s) => s.is_won)).toHaveLength(1);
    expect(ETAPAS_GENERICO.filter((s) => s.is_lost)).toHaveLength(1);
  });
});
