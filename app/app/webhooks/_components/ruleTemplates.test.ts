import { describe, expect, it } from "vitest";
import { RULE_TEMPLATES } from "./ruleTemplates";
import { TRIGGER_EVENTS } from "@/lib/schemas/webhooks";
import { ACTION_LABELS, TRIGGER_LABELS } from "./labels";

/**
 * Guarda estrutural do catálogo: cada modelo precisa apontar pra um gatilho
 * e ações que o motor REALMENTE reconhece hoje — um typo aqui criaria uma
 * automação que a tela oferece e o backend rejeita ao salvar.
 */
describe("RULE_TEMPLATES", () => {
  it("todo modelo tem nome e pelo menos uma ação", () => {
    for (const t of RULE_TEMPLATES) {
      expect(t.name.trim().length).toBeGreaterThan(0);
      expect(t.actions.length).toBeGreaterThan(0);
    }
  });

  it("todo trigger_event existe no vocabulário compartilhado", () => {
    for (const t of RULE_TEMPLATES) {
      expect(TRIGGER_EVENTS).toContain(t.trigger_event);
      expect(TRIGGER_LABELS[t.trigger_event]).toBeDefined();
    }
  });

  it("toda ação tem um type reconhecido por ACTION_LABELS", () => {
    for (const t of RULE_TEMPLATES) {
      for (const action of t.actions) {
        expect(ACTION_LABELS[action.type]).toBeDefined();
      }
    }
  });

  it("nomes de modelo são únicos (usados como key na lista)", () => {
    const nomes = RULE_TEMPLATES.map((t) => t.name);
    expect(new Set(nomes).size).toBe(nomes.length);
  });
});
