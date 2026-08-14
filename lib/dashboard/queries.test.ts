import { describe, expect, it } from "vitest";
import { demandasDeHoje, metaMensal, movimentacoesDaSemana, previsaoDoMes } from "./queries";
import type { Janela } from "./period";

/**
 * Dublê mínimo do query builder: registra os filtros encadeados e resolve
 * como a chamada real do supabase-js resolveria (o builder é "thenable").
 * Mesmo molde de tests/unit/recover-stuck-messages.test.ts.
 */
function supabaseDuplo(data: unknown, error: { message: string } | null = null) {
  const chamadas: { metodo: string; args: unknown[] }[] = [];
  const builder = {
    select(...a: unknown[]) {
      chamadas.push({ metodo: "select", args: a });
      return builder;
    },
    eq(...a: unknown[]) {
      chamadas.push({ metodo: "eq", args: a });
      return builder;
    },
    is(...a: unknown[]) {
      chamadas.push({ metodo: "is", args: a });
      return builder;
    },
    not(...a: unknown[]) {
      chamadas.push({ metodo: "not", args: a });
      return builder;
    },
    gte(...a: unknown[]) {
      chamadas.push({ metodo: "gte", args: a });
      return builder;
    },
    lt(...a: unknown[]) {
      chamadas.push({ metodo: "lt", args: a });
      return builder;
    },
    limit(...a: unknown[]) {
      chamadas.push({ metodo: "limit", args: a });
      return builder;
    },
    order(...a: unknown[]) {
      chamadas.push({ metodo: "order", args: a });
      return builder;
    },
    then(resolve: (r: { data: unknown; error: { message: string } | null }) => unknown) {
      return Promise.resolve(resolve({ data, error }));
    },
    maybeSingle() {
      return Promise.resolve({ data, error });
    },
  };
  const client = {
    from(tabela: string) {
      chamadas.push({ metodo: "from", args: [tabela] });
      return builder;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return { client, chamadas };
}

const janela: Janela = { from: new Date(2026, 7, 14, 0, 0, 0), to: new Date(2026, 7, 15, 0, 0, 0) };

describe("demandasDeHoje", () => {
  it("filtra por org, sem fechamento, dentro da janela — e traduz o nome do contato", async () => {
    const { client, chamadas } = supabaseDuplo([
      {
        id: "d1",
        assunto: "Confirmar orçamento",
        proximo_passo: "Ligar de novo",
        proximo_passo_em: "2026-08-14T14:00:00Z",
        contact_id: "c1",
        contacts: { display_name: "Ana Souza" },
      },
    ]);

    const result = await demandasDeHoje(client, "org-1", janela);

    expect(result).toEqual([
      {
        id: "d1",
        assunto: "Confirmar orçamento",
        proximo_passo: "Ligar de novo",
        proximo_passo_em: "2026-08-14T14:00:00Z",
        contact_id: "c1",
        contact_name: "Ana Souza",
      },
    ]);
    expect(chamadas.find((c) => c.metodo === "from")?.args).toEqual(["demandas"]);
    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "organization_id" && c.args[1] === "org-1")).toBe(true);
    expect(chamadas.some((c) => c.metodo === "is" && c.args[0] === "fechada_em" && c.args[1] === null)).toBe(true);
  });

  it("contato sem nome não quebra — vira null", async () => {
    const { client } = supabaseDuplo([
      {
        id: "d2",
        assunto: null,
        proximo_passo: null,
        proximo_passo_em: "2026-08-14T09:00:00Z",
        contact_id: "c2",
        contacts: null,
      },
    ]);
    const result = await demandasDeHoje(client, "org-1", janela);
    expect(result[0]!.contact_name).toBeNull();
  });

  it("propaga erro do banco em vez de engolir em silêncio", async () => {
    const { client } = supabaseDuplo(null, { message: "conexão recusada" });
    await expect(demandasDeHoje(client, "org-1", janela)).rejects.toThrow("conexão recusada");
  });
});

describe("movimentacoesDaSemana", () => {
  it("traz o motivo já pronto e o título do negócio", async () => {
    const { client, chamadas } = supabaseDuplo([
      {
        id: "a1",
        lead_id: "l1",
        reason: "Movido de Novo para Em andamento",
        performed_at: "2026-08-12T10:00:00Z",
        crm_leads: { title: "Reforma da cozinha" },
      },
    ]);

    const result = await movimentacoesDaSemana(client, "org-1", janela);

    expect(result).toEqual([
      {
        id: "a1",
        lead_id: "l1",
        lead_title: "Reforma da cozinha",
        reason: "Movido de Novo para Em andamento",
        performed_at: "2026-08-12T10:00:00Z",
      },
    ]);
    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "type" && c.args[1] === "stage_changed")).toBe(true);
  });

  it("reason nulo (atividade antiga) não quebra a leitura", async () => {
    const { client } = supabaseDuplo([
      {
        id: "a2",
        lead_id: "l2",
        reason: null,
        performed_at: "2026-08-12T10:00:00Z",
        crm_leads: { title: "Negócio X" },
      },
    ]);
    const result = await movimentacoesDaSemana(client, "org-1", janela);
    expect(result[0]!.reason).toBeNull();
  });
});

describe("previsaoDoMes", () => {
  it("soma value_cents dos negócios abertos na janela, sem ponderar por placar", async () => {
    const { client, chamadas } = supabaseDuplo([
      { value_cents: 50000 },
      { value_cents: 30000 },
      { value_cents: null },
    ]);

    const result = await previsaoDoMes(client, "org-1", janela);

    expect(result).toEqual({ totalCents: 80000, quantidade: 3 });
    expect(chamadas.find((c) => c.metodo === "from")?.args).toEqual(["crm_leads"]);
    expect(chamadas.some((c) => c.metodo === "eq" && c.args[0] === "status" && c.args[1] === "open")).toBe(true);
  });

  it("sem negócios na janela devolve zero, não erro", async () => {
    const { client } = supabaseDuplo([]);
    const result = await previsaoDoMes(client, "org-1", janela);
    expect(result).toEqual({ totalCents: 0, quantidade: 0 });
  });
});

describe("metaMensal", () => {
  it("lê monthly_revenue_goal_cents de organizations.settings", async () => {
    const { client, chamadas } = supabaseDuplo({
      settings: { monthly_revenue_goal_cents: 500000, lost_reasons_extra: [] },
    });
    const result = await metaMensal(client, "org-1");
    expect(result).toBe(500000);
    expect(chamadas.find((c) => c.metodo === "from")?.args).toEqual(["organizations"]);
  });

  it("sem meta definida devolve null, não zero", async () => {
    const { client } = supabaseDuplo({ settings: { lost_reasons_extra: [] } });
    const result = await metaMensal(client, "org-1");
    expect(result).toBeNull();
  });

  it("settings nulo não quebra a leitura", async () => {
    const { client } = supabaseDuplo({ settings: null });
    expect(await metaMensal(client, "org-1")).toBeNull();
  });
});
