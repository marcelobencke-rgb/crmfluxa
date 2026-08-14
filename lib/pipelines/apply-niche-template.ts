import type { createAdminClient } from "@/lib/supabase/admin";
import { ETAPAS_GENERICO, findNicheTemplate, type NicheOrGeneric } from "./niche-templates";

type Admin = ReturnType<typeof createAdminClient>;

const SLUGS_GENERICO = new Set(ETAPAS_GENERICO.map((e) => e.slug));

/**
 * A guarda, pura e testável sem banco: só troca as etapas de um funil que
 * ainda está exatamente como nasceu — nenhuma outra condição some.
 *
 *   1. a organização tem EXATAMENTE 1 funil (o auto-semeado — mais de um
 *      significa que a pessoa já criou outro, e menos que um não deveria
 *      existir, mas de qualquer jeito não é "só o padrão intocado");
 *   2. o conjunto de slugs das etapas atuais é EXATAMENTE o das 4 neutras —
 *      renomeou uma etapa, adicionou ou removeu, o slug muda e a guarda pega;
 *   3. zero negócios apontam pra esse funil.
 */
export function podeAplicarTemplate(args: {
  totalPipelines: number;
  slugsAtuais: string[];
  totalLeads: number;
}): boolean {
  if (args.totalPipelines !== 1) return false;
  if (args.totalLeads !== 0) return false;
  const atuais = new Set(args.slugsAtuais);
  if (atuais.size !== SLUGS_GENERICO.size) return false;
  for (const slug of atuais) {
    if (!SLUGS_GENERICO.has(slug)) return false;
  }
  return true;
}

export interface AplicarTemplateResultado {
  applied: boolean;
  /** Só presente quando applied=true — pra quem chama poder auditar/logar. */
  pipelineId?: string;
}

/**
 * Troca as etapas do funil único da organização pelas do nicho escolhido,
 * SE a guarda deixar. `nicheId === "generic"` (ou desconhecido) nunca aplica
 * nada — "prefiro configurar depois" é uma escolha válida, não um erro.
 *
 * DELETE + INSERT (não UPDATE in-place) porque o número de etapas muda entre
 * nichos — e é seguro porque a guarda já garantiu zero `crm_leads` na hora da
 * leitura. Sem transação: mesma decisão já tomada em `POST /api/v1/pipelines`
 * (app/api/v1/pipelines/route.ts) — custaria migration pra um caminho que só
 * roda uma vez, no onboarding, sobre um funil que a guarda provou vazio.
 */
export async function aplicarTemplateDeNicho(
  admin: Admin,
  orgId: string,
  nicheId: NicheOrGeneric,
): Promise<AplicarTemplateResultado> {
  const template = findNicheTemplate(nicheId);
  if (!template) return { applied: false };

  const { data: pipelines, error: pipelinesErr } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", orgId)
    .eq("is_archived", false);
  if (pipelinesErr) throw new Error(`aplicarTemplateDeNicho: ${pipelinesErr.message}`);

  const totalPipelines = pipelines?.length ?? 0;
  const pipelineId = pipelines?.[0]?.id as string | undefined;
  if (totalPipelines !== 1 || !pipelineId) return { applied: false };

  const { data: etapas, error: etapasErr } = await admin
    .from("crm_stages")
    .select("id, slug")
    .eq("pipeline_id", pipelineId);
  if (etapasErr) throw new Error(`aplicarTemplateDeNicho: ${etapasErr.message}`);

  const { count: totalLeads, error: leadsErr } = await admin
    .from("crm_leads")
    .select("id", { count: "exact", head: true })
    .eq("pipeline_id", pipelineId);
  if (leadsErr) throw new Error(`aplicarTemplateDeNicho: ${leadsErr.message}`);

  const pode = podeAplicarTemplate({
    totalPipelines,
    slugsAtuais: (etapas ?? []).map((e) => e.slug as string),
    totalLeads: totalLeads ?? 0,
  });
  if (!pode) return { applied: false };

  const { error: deleteErr } = await admin.from("crm_stages").delete().eq("pipeline_id", pipelineId);
  if (deleteErr) throw new Error(`aplicarTemplateDeNicho: ${deleteErr.message}`);

  const paraLinhas = (etapasDoTemplate: readonly { name: string; slug: string; is_won: boolean; is_lost: boolean }[]) =>
    etapasDoTemplate.map((etapa, i) => ({
      organization_id: orgId,
      pipeline_id: pipelineId,
      name: etapa.name,
      slug: etapa.slug,
      position: (i + 1) * 1000,
      is_won: etapa.is_won,
      is_lost: etapa.is_lost,
    }));

  const { error: insertErr } = await admin.from("crm_stages").insert(paraLinhas(template.stages));
  if (insertErr) {
    // COMPENSAÇÃO: sem isto, um insert que falha DEPOIS do delete deixa o
    // único funil da organização sem etapa nenhuma — quadro morto (anti-pattern
    // nº7 do CLAUDE.md), pior do que nunca ter tentado a troca. A guarda já
    // provou que as etapas atuais eram EXATAMENTE as genéricas, então
    // devolvê-las é restaurar o estado anterior, não inventar um novo.
    const { error: restoreErr } = await admin.from("crm_stages").insert(paraLinhas(ETAPAS_GENERICO));
    if (restoreErr) {
      throw new Error(
        `aplicarTemplateDeNicho: insert falhou (${insertErr.message}) E a restauração também falhou (${restoreErr.message}) — funil ${pipelineId} ficou sem etapas`,
      );
    }
    throw new Error(`aplicarTemplateDeNicho: ${insertErr.message} (restaurado ao padrão genérico)`);
  }

  return { applied: true, pipelineId };
}
