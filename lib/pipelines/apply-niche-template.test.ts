import { describe, expect, it } from "vitest";
import { aplicarTemplateDeNicho, podeAplicarTemplate } from "./apply-niche-template";

describe("podeAplicarTemplate", () => {
  const base = { totalPipelines: 1, slugsAtuais: ["novo", "em_andamento", "ganho", "perdido"], totalLeads: 0 };

  it("tudo intocado ⇒ pode aplicar", () => {
    expect(podeAplicarTemplate(base)).toBe(true);
  });

  it("mais de 1 funil ⇒ não pode (a pessoa já criou outro)", () => {
    expect(podeAplicarTemplate({ ...base, totalPipelines: 2 })).toBe(false);
  });

  it("zero funis ⇒ não pode (estado que não deveria existir, mas não é 'intocado')", () => {
    expect(podeAplicarTemplate({ ...base, totalPipelines: 0 })).toBe(false);
  });

  it("já tem negócio no funil ⇒ não pode", () => {
    expect(podeAplicarTemplate({ ...base, totalLeads: 3 })).toBe(false);
  });

  it("etapa renomeada (slug diferente) ⇒ não pode", () => {
    expect(podeAplicarTemplate({ ...base, slugsAtuais: ["novo", "em_andamento", "ganho", "arquivado"] })).toBe(false);
  });

  it("etapa a mais ou a menos ⇒ não pode", () => {
    expect(podeAplicarTemplate({ ...base, slugsAtuais: [...base.slugsAtuais, "extra"] })).toBe(false);
    expect(podeAplicarTemplate({ ...base, slugsAtuais: base.slugsAtuais.slice(0, 3) })).toBe(false);
  });
});

/**
 * Dublê do admin client: cada `.from(tabela)` devolve uma cadeia "thenable"
 * própria — `crm_pipelines`/`crm_stages` (select)/`crm_leads` resolvem com o
 * que foi configurado; `delete`/`insert` resolvem em sequência (o insert de
 * restauração, quando existe, é o SEGUNDO insert configurado).
 */
function adminDuble(args: {
  pipelines: { id: string }[];
  stages: { id: string; slug: string }[];
  leadCount: number;
  deleteError?: { message: string } | null;
  insertErrors?: (({ message: string } | null))[]; // por chamada de insert, em ordem
}) {
  const chamadas: { tabela: string; op: string }[] = [];
  let insertIdx = 0;

  function selectChain(resolvedData: unknown, error: { message: string } | null = null, count?: number) {
    const chain = {
      eq() {
        return chain;
      },
      then(resolve: (r: { data: unknown; error: unknown; count?: number }) => unknown) {
        return Promise.resolve(resolve({ data: resolvedData, error, count }));
      },
    };
    return chain;
  }

  const admin = {
    from(tabela: string) {
      return {
        select() {
          chamadas.push({ tabela, op: "select" });
          if (tabela === "crm_pipelines") return selectChain(args.pipelines, null);
          if (tabela === "crm_stages") return selectChain(args.stages, null);
          if (tabela === "crm_leads") return selectChain(null, null, args.leadCount);
          throw new Error("tabela inesperada: " + tabela);
        },
        delete() {
          chamadas.push({ tabela, op: "delete" });
          return { eq: () => Promise.resolve({ error: args.deleteError ?? null }) };
        },
        insert(rows: unknown[]) {
          chamadas.push({ tabela, op: "insert" });
          const error = args.insertErrors?.[insertIdx] ?? null;
          insertIdx++;
          return Promise.resolve({ data: rows, error });
        },
      };
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;

  return { admin, chamadas };
}

const ETAPAS_INTOCADAS = [
  { id: "s1", slug: "novo" },
  { id: "s2", slug: "em_andamento" },
  { id: "s3", slug: "ganho" },
  { id: "s4", slug: "perdido" },
];

describe("aplicarTemplateDeNicho", () => {
  it("nicho 'generic' nunca aplica nada", async () => {
    const { admin, chamadas } = adminDuble({ pipelines: [{ id: "p1" }], stages: ETAPAS_INTOCADAS, leadCount: 0 });
    const r = await aplicarTemplateDeNicho(admin, "org-1", "generic");
    expect(r).toEqual({ applied: false });
    expect(chamadas).toEqual([]);
  });

  it("nicho desconhecido não aplica e não quebra", async () => {
    const { admin } = adminDuble({ pipelines: [{ id: "p1" }], stages: ETAPAS_INTOCADAS, leadCount: 0 });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const r = await aplicarTemplateDeNicho(admin, "org-1", "nao-existe" as any);
    expect(r).toEqual({ applied: false });
  });

  it("funil intocado + sem leads ⇒ aplica, deleta e insere as etapas do nicho", async () => {
    const { admin, chamadas } = adminDuble({ pipelines: [{ id: "p1" }], stages: ETAPAS_INTOCADAS, leadCount: 0 });
    const r = await aplicarTemplateDeNicho(admin, "org-1", "clinica");
    expect(r).toEqual({ applied: true, pipelineId: "p1" });
    expect(chamadas.filter((c) => c.op === "delete")).toHaveLength(1);
    expect(chamadas.filter((c) => c.op === "insert")).toHaveLength(1);
  });

  it("mais de 1 funil ⇒ não toca em nada (guarda barra antes do delete)", async () => {
    const { admin, chamadas } = adminDuble({
      pipelines: [{ id: "p1" }, { id: "p2" }],
      stages: ETAPAS_INTOCADAS,
      leadCount: 0,
    });
    const r = await aplicarTemplateDeNicho(admin, "org-1", "clinica");
    expect(r).toEqual({ applied: false });
    expect(chamadas.filter((c) => c.op === "delete" || c.op === "insert")).toEqual([]);
  });

  it("já tem lead no funil ⇒ não toca em nada", async () => {
    const { admin, chamadas } = adminDuble({ pipelines: [{ id: "p1" }], stages: ETAPAS_INTOCADAS, leadCount: 1 });
    const r = await aplicarTemplateDeNicho(admin, "org-1", "clinica");
    expect(r).toEqual({ applied: false });
    expect(chamadas.filter((c) => c.op === "delete" || c.op === "insert")).toEqual([]);
  });

  it("insert falha ⇒ restaura o padrão genérico e lança, em vez de deixar o funil sem etapa", async () => {
    const { admin, chamadas } = adminDuble({
      pipelines: [{ id: "p1" }],
      stages: ETAPAS_INTOCADAS,
      leadCount: 0,
      insertErrors: [{ message: "insert falhou" }, null], // 1º insert (nicho) falha, 2º (restauração) funciona
    });
    await expect(aplicarTemplateDeNicho(admin, "org-1", "clinica")).rejects.toThrow(/restaurado ao padrão genérico/);
    expect(chamadas.filter((c) => c.op === "insert")).toHaveLength(2);
  });
});
