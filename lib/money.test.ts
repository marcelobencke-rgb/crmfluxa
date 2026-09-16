import { describe, it, expect } from "vitest";

import {
  parseReaisToCents,
  formatCentsBRL,
  formatCents,
  maskMoneyBRL,
  moneyBRLMaskedToCents,
  centsToMoneyBRLMasked,
} from "./money";

describe("parseReaisToCents", () => {
  it("lê ponto como decimal quando o grupo final não é de milhar", () => {
    // O defeito que originou este arquivo: "249.90" virava 2499000 centavos
    // (R$ 24.990,00) porque todo ponto era descartado como separador de milhar.
    expect(parseReaisToCents("249.90")).toBe(24990);
    expect(parseReaisToCents("1234.5")).toBe(123450);
    expect(parseReaisToCents("0.99")).toBe(99);
  });

  it("lê vírgula como decimal (pt-BR)", () => {
    expect(parseReaisToCents("249,90")).toBe(24990);
    expect(parseReaisToCents("1.234,56")).toBe(123456);
    expect(parseReaisToCents("1.234.567,89")).toBe(123456789);
  });

  it("trata ponto seguido de 3 dígitos como milhar", () => {
    expect(parseReaisToCents("1.234")).toBe(123400);
    expect(parseReaisToCents("1.234.567")).toBe(123456700);
  });

  it("aceita o formato en quando o último separador é o ponto", () => {
    expect(parseReaisToCents("1,234.56")).toBe(123456);
  });

  it("lê número simples", () => {
    expect(parseReaisToCents("250")).toBe(25000);
    expect(parseReaisToCents(" 250 ")).toBe(25000);
  });

  it("devolve null para o que não é valor", () => {
    expect(parseReaisToCents("")).toBeNull();
    expect(parseReaisToCents("abc")).toBeNull();
    expect(parseReaisToCents("R$ 10")).toBeNull();
    expect(parseReaisToCents("-5")).toBeNull();
  });
});

describe("maskMoneyBRL", () => {
  it("acumula dígitos como centavos, da direita pra esquerda", () => {
    expect(maskMoneyBRL("1")).toBe("0,01");
    expect(maskMoneyBRL("12")).toBe("0,12");
    expect(maskMoneyBRL("123")).toBe("1,23");
    expect(maskMoneyBRL("1234")).toBe("12,34");
    expect(maskMoneyBRL("123456")).toBe("1.234,56");
    expect(maskMoneyBRL("1234567")).toBe("12.345,67");
  });

  it("descarta tudo que não é dígito — não interpreta separador colado", () => {
    // Ao contrário de parseReaisToCents: aqui não existe leitura ambígua
    // porque só dígito entra na máscara. Colar "249.90" ou "249,90" dá o
    // mesmo resultado — os separadores somem e sobram os dígitos "24990",
    // que a máscara lê como 249 reais e 90 centavos (coincide com a
    // intenção porque as duas formas têm exatamente 2 casas decimais).
    expect(maskMoneyBRL("249.90")).toBe("249,90");
    expect(maskMoneyBRL("R$ 12,00")).toBe("12,00");
    // Mas um INTEIRO colado sem decimais não vira "1.234,00" — os últimos
    // dois dígitos sempre viram centavos. É o comportamento normal de
    // campo de valor em máscara (mesmo padrão de POS/caixa eletrônico), e
    // o motivo de recomendar digitar em vez de colar número redondo.
    expect(maskMoneyBRL("1234")).toBe("12,34");
  });

  it("campo vazio continua vazio", () => {
    expect(maskMoneyBRL("")).toBe("");
    expect(maskMoneyBRL("abc")).toBe("");
  });
});

describe("moneyBRLMaskedToCents", () => {
  it("lê de volta exatamente o que a máscara escreveu", () => {
    expect(moneyBRLMaskedToCents("0,01")).toBe(1);
    expect(moneyBRLMaskedToCents("1.234,56")).toBe(123456);
    expect(moneyBRLMaskedToCents("12.345,67")).toBe(1234567);
    expect(moneyBRLMaskedToCents("")).toBe(0);
  });
});

describe("centsToMoneyBRLMasked", () => {
  it("pré-popula no MESMO formato que a máscara produz ao digitar", () => {
    expect(centsToMoneyBRLMasked(123456)).toBe("1.234,56");
    expect(centsToMoneyBRLMasked(1)).toBe("0,01");
    expect(centsToMoneyBRLMasked(0)).toBe("0,00");
  });

  it("nulo/indefinido vira campo vazio, não '0,00'", () => {
    expect(centsToMoneyBRLMasked(null)).toBe("");
    expect(centsToMoneyBRLMasked(undefined)).toBe("");
  });
});

describe("formatCentsBRL", () => {
  it("mostra em reais o que está guardado em centavos", () => {
    expect(formatCentsBRL(24990).replace(/ /g, " ")).toBe("R$ 249,90");
    expect(formatCentsBRL(0).replace(/ /g, " ")).toBe("R$ 0,00");
  });
});

/** Os espaços que o `Intl` emite são NBSP (U+00A0) ou narrow NBSP (U+202F). */
const semNbsp = (s: string) => s.replace(/[\u00A0\u202F]/g, " ");

describe("formatCents", () => {
  /**
   * ⚠️ Quem escolhe o locale do FORMATO é a MOEDA, não o idioma de quem lê.
   *
   * Parecia natural reusar `tagDeIdioma()` — o mesmo `es` que a interface já
   * resolve. Medido, não deduzido:
   *
   *     Intl.NumberFormat("es",    {currency:"MXN"}) -> "249,90 MXN"
   *     Intl.NumberFormat("es-MX", {currency:"MXN"}) -> "$249.90"
   *
   * O `es` puro cai na convenção da ESPANHA: vírgula decimal e o código ISO
   * depois do número. Quem vende no México lê "$249.90". O idioma da interface
   * é preferência de quem LÊ; a moeda é fato do NEGÓCIO, e é ela que manda no
   * separador decimal e no símbolo.
   */
  it("formata cada moeda na convenção de quem a usa", () => {
    expect(semNbsp(formatCents(24990, "BRL"))).toBe("R$ 249,90");
    expect(semNbsp(formatCents(24990, "MXN"))).toBe("$249.90");
    expect(semNbsp(formatCents(24990, "USD"))).toBe("$249.90");
  });

  /**
   * ⚠️ `_cents` não é sempre "centésimos", e o CHECK do banco não impede isso.
   *
   * `catalog_products.moeda` aceita qualquer `^[A-Z]{3}$`, mas todo o código de
   * dinheiro divide por 100 em duro. JPY e CLP não têm subunidade: 25.000
   * unidades menores são ￥25.000, e o /100 fixo mostra ￥250 — cem vezes menos,
   * no número que o agente de IA cota ao cliente.
   *
   * A permissão do schema é mais larga que a aritmética do código. Derivar as
   * unidades menores do próprio `Intl` fecha a diferença sem tabela na mão.
   */
  it("respeita as unidades menores da moeda, que nem sempre são 2", () => {
    expect(semNbsp(formatCents(25000, "JPY"))).toBe("￥25,000");
    expect(semNbsp(formatCents(25000, "CLP"))).toBe("$25.000");
    expect(semNbsp(formatCents(25000, "BRL"))).toBe("R$ 250,00");
  });


  /**
   * ⚠️ `formatCents` é EXPORTADA e roda num client component
   * (`app/app/products/_client.tsx`) — um valor de moeda ruim não pode
   * derrubar o render da lista inteira de produtos. Medido antes de escrever
   * o guard: `new Intl.NumberFormat(locale, {style:"currency", currency})`
   * LANÇA para `""`, `"BR"` (2 letras), `undefined` e `null`, mesmo que o
   * CHECK do banco (`^[A-Z]{3}$`) garanta o formato em toda linha que passa
   * por ele — a função não pode presumir que todo chamador futuro respeita
   * essa garantia. As cinco cópias que esta função substitui tinham
   * `try/catch` (ex.: `CRMSidePanel.tsx:201`); esta precisa da mesma rede.
   */
  it("não lança para moeda ruim — mostra o número em vez de derrubar a tela", () => {
    expect(() => formatCents(24990, "")).not.toThrow();
    expect(() => formatCents(24990, "BR")).not.toThrow();
    expect(() => formatCents(24990, undefined as unknown as string)).not.toThrow();
    expect(() => formatCents(24990, null as unknown as string)).not.toThrow();

    // O fallback precisa continuar informativo — o número certo, não "—" nem "".
    expect(formatCents(24990, "")).toContain("249");
  });
});