import { describe, expect, it } from "vitest";

import { isStopMessage } from "./ingest";

/**
 * W-02 (docs/business-rules/00-business-rules-catalog.md) — detecção de
 * opt-out bloqueia o contato automaticamente. A versão antiga do regex
 * (`\b(STOP|PARAR|SAIR|UNSUBSCRIBE)\b`) casava a palavra em QUALQUER lugar da
 * mensagem — "sair" é verbo comum do português e aparecia em frases sem
 * nenhuma intenção de descadastro, bloqueando contato ativo por engano
 * (achado real: "Eu sei que tu não tá fazendo esse processo... jogar por
 * causa de uma situação" nunca deveria ter marcado is_blocked=true).
 *
 * Contrato correto (sempre foi o documentado em
 * docs/specs/03-spec-whatsapp-waha.md §8.5): só dispara se a mensagem INTEIRA
 * (tirando espaço/pontuação em volta) for a palavra-gatilho.
 */
describe("isStopMessage", () => {
  it("reconhece a palavra-gatilho sozinha, com variações de caixa/pontuação/espaço", () => {
    expect(isStopMessage("PARAR")).toBe(true);
    expect(isStopMessage("parar")).toBe(true);
    expect(isStopMessage("  Sair  ")).toBe(true);
    expect(isStopMessage("Sair!")).toBe(true);
    expect(isStopMessage("stop.")).toBe(true);
    expect(isStopMessage("UNSUBSCRIBE")).toBe(true);
    expect(isStopMessage("Cancelar")).toBe(true);
    expect(isStopMessage("descadastrar")).toBe(true);
  });

  it("NÃO reconhece a palavra-gatilho embutida numa frase normal (o bug real)", () => {
    expect(isStopMessage("quero sair dessa situação")).toBe(false);
    expect(isStopMessage("Eu sei que tu não tá fazendo esse processo")).toBe(false);
    expect(isStopMessage("vou sair mais cedo hoje")).toBe(false);
    expect(isStopMessage("depois eu paro por aqui")).toBe(false);
    expect(isStopMessage("cancelar o pedido 123, por favor")).toBe(false);
  });

  it("ignora mensagem vazia ou irrelevante", () => {
    expect(isStopMessage("")).toBe(false);
    expect(isStopMessage("oi, tudo bem?")).toBe(false);
  });
});
