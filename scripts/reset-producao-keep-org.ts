/**
 * Zera CONVERSAS e FUNIS (estrutura + leads) do Fluxa CRM em PRODUÇÃO,
 * mantendo intactos a organization e o(s) usuário(s) — decisão do Marcelo em
 * 2026-08-24: produção ainda não tem cliente real (só dado de teste/dev dele
 * mesmo), então DELETE direto foi aprovado. Se isso mudar (primeiro cliente
 * real entrar), este script deixa de valer — ver doutrina de LGPD no
 * CLAUDE.md (anonimizar > deletar contact/conversation/message quando há
 * cliente real).
 *
 * DIFERENÇA-CHAVE para `reset-homolog-keep-org.ts` (do qual este nasceu por
 * cópia deliberada, não por acaso):
 *
 *   1. Aqui `crm_pipelines` e `crm_stages` TAMBÉM são apagados — decisão
 *      explícita do Marcelo em 2026-08-24 ("funis criados" inclui a
 *      estrutura, não só os leads de dentro). No homolog isso fica de fora
 *      (estrutura = config). Aqui não.
 *   2. NÃO usa `credenciaisSupabaseDeTeste()` (que cai em `.env.local` se o
 *      ambiente não tiver as variáveis — e `.env.local` deste projeto é
 *      HOMOLOG). Lê só de `process.env`, e RECUSA rodar se a URL não bater
 *      com o projeto de produção conhecido. Isso existe pra nunca rodar por
 *      engano contra o banco errado (nem homolog pensando que é prod, nem
 *      prod pensando que é homolog).
 *   3. Exige a flag extra `--sei-que-e-producao`, além de `--confirm` e
 *      `--keep-org=`. Três flags, de propósito: este script apaga dado real
 *      de um banco real, cópia-colada do de homolog não deveria bastar pra
 *      rodar aqui sem pensar.
 *
 * Uso:
 *   set -a; . ./.env.producao.scripts; set +a
 *   npx tsx scripts/reset-producao-keep-org.ts
 *     → dry-run: lista organizations e contagem de linhas por tabela. Não apaga nada.
 *
 *   npx tsx scripts/reset-producao-keep-org.ts --confirm --keep-org=<id-ou-slug> --sei-que-e-producao
 *     → executa de verdade, via REST (supabase-js), tabela por tabela, na
 *       ordem de TABELAS_DE_DADO_EM_ORDEM. NÃO é uma transação única — cada
 *       delete é sua própria chamada REST. Se parar no meio, as tabelas
 *       antes já foram apagadas de verdade (sem rollback); o log mostra até
 *       onde chegou. O script é idempotente: rodar de novo só conta 0 nas
 *       tabelas já vazias e segue.
 *
 * O que NUNCA é tocado: organizations (a linha mantida), user_organizations,
 * auth.users, platform_admins, ai_budgets (config por tenant, sem coluna id
 * própria — ver comentário equivalente no script de homolog).
 */

import { createClient } from "@supabase/supabase-js";

const SCRIPT = "reset-producao-keep-org";

/** Refs de projeto Supabase conhecidos nesta máquina (confirmados em 2026-08-24). */
const REF_PRODUCAO = "hgipbeobakzyvrcrliel";
const REF_HOMOLOG = "hnpdapxbrezmqsunltzf";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const SEI_QUE_E_PRODUCAO = args.includes("--sei-que-e-producao");
const keepArg = args.find((a) => a.startsWith("--keep-org="));
const KEEP_ORG = keepArg?.split("=")[1];

interface CredenciaisProducao {
  url: string;
  serviceRole: string;
}

function credenciaisDeProducao(): CredenciaisProducao {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url === "" || serviceRole === "") {
    throw new Error(
      `Sem credenciais no ambiente. Este script NUNCA cai em .env.local (é homolog neste projeto). ` +
        `Carregue explicitamente: set -a; . ./.env.producao.scripts; set +a`,
    );
  }
  let ref = "";
  try {
    ref = new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    throw new Error(`NEXT_PUBLIC_SUPABASE_URL ilegível: "${url}"`);
  }
  if (ref === REF_HOMOLOG) {
    throw new Error(
      `As credenciais carregadas são do projeto de HOMOLOG (${REF_HOMOLOG}), não de produção. ` +
        `Use scripts/reset-homolog-keep-org.ts para homolog.`,
    );
  }
  if (ref !== REF_PRODUCAO) {
    throw new Error(
      `URL aponta para um projeto Supabase desconhecido (ref="${ref}"). ` +
        `Esperado produção (${REF_PRODUCAO}). Recusando rodar — confirme a origem das credenciais antes de tentar de novo.`,
    );
  }
  return { url, serviceRole };
}

const creds = credenciaisDeProducao();
console.warn(`[${SCRIPT}] ⚠️  escrevendo em PRODUÇÃO: ${creds.url}`);

const admin = createClient(creds.url, creds.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Mesma cadeia de FK de `reset-homolog-keep-org.ts` (verificada contra
 * `supabase/baseline.sql`), com `crm_stages` e `crm_pipelines` acrescentados
 * logo depois de `crm_leads` — únicas duas tabelas que referenciam pipeline
 * (`crm_leads.pipeline_id`/`stage_id`, RESTRICT; `crm_stages.pipeline_id`,
 * CASCADE) e nenhuma outra tabela do schema referencia `crm_pipelines` ou
 * `crm_stages` (conferido em baseline.sql — só essas 2 constraints existem).
 * Ordem: crm_leads (referencia as duas) → crm_stages (referencia pipelines)
 * → crm_pipelines (não referencia nada aqui).
 */
const TABELAS_DE_DADO_EM_ORDEM = [
  // independentes — sem FK que bloqueie
  "api_tokens",
  "event_log",
  "idempotency_keys",
  "incidents",
  "merge_queue",
  "nuvemshop_products",
  "tenant_integrations",
  "ai_provider_credentials",
  "webhook_events_log",
  // cadeia de dependência (filhas antes de pais)
  "ai_agent_runs",
  "ai_invocations",
  "ai_chunks",
  "ai_faq_items",
  "crm_lead_activities",
  "crm_lead_links",
  "lgpd_requests",
  "storage_redaction_queue",
  "orders",
  "messages",
  "crm_leads",
  "crm_stages",
  "crm_pipelines",
  "ai_knowledge_sources",
  "ai_knowledge_versions",
  "ai_agent_versions",
  "conversations",
  "contacts",
  "channel_session_warmup",
  "channel_sessions",
  "ai_agents",
] as const;

/** Nunca aparecem em TABELAS_DE_DADO_EM_ORDEM — documentado para quem revisar. */
const NUNCA_TOCADAS = [
  "organizations (a linha mantida)",
  "user_organizations",
  "auth.users",
  "platform_admins",
  "ai_budgets",
] as const;

interface OrgRow {
  id: string;
  slug: string;
  display_name: string;
  created_at: string;
}

async function listarOrganizacoes(): Promise<OrgRow[]> {
  const { data, error } = await admin
    .from("organizations")
    .select("id, slug, display_name, created_at")
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as OrgRow[];
}

async function contarPorTabela(orgId: string): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const tabela of TABELAS_DE_DADO_EM_ORDEM) {
    const { count, error } = await admin
      .from(tabela)
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId);
    if (error) {
      console.warn(`[${SCRIPT}] não consegui contar ${tabela}: ${error.message}`);
      out[tabela] = -1;
      continue;
    }
    out[tabela] = count ?? 0;
  }
  return out;
}

function imprimirContagem(titulo: string, contagem: Record<string, number>): number {
  console.log(titulo);
  let total = 0;
  for (const [tabela, n] of Object.entries(contagem)) {
    if (n !== 0) console.log(`  ${tabela.padEnd(28)} ${n}`);
    total += Math.max(n, 0);
  }
  if (total === 0) console.log("  (nada)");
  return total;
}

async function dryRun(): Promise<void> {
  const orgs = await listarOrganizacoes();
  console.log(`\n[${SCRIPT}] Organizações encontradas: ${orgs.length}\n`);
  for (const org of orgs) {
    console.log(`  ${org.id}  slug=${org.slug}  nome="${org.display_name}"  criada=${org.created_at}`);
  }
  if (orgs.length === 0) {
    console.log("\nNenhuma organização encontrada — nada a fazer.");
    return;
  }

  const { data: userList, error: userErr } = await admin.auth.admin.listUsers({ perPage: 200 });
  if (userErr) throw userErr;
  console.log(`\n[${SCRIPT}] Usuários (auth) encontrados: ${userList.users.length}`);
  for (const u of userList.users) console.log(`  ${u.id}  ${u.email}`);

  const alvo = KEEP_ORG
    ? orgs.find((o) => o.id === KEEP_ORG || o.slug === KEEP_ORG)
    : orgs.length === 1
      ? orgs[0]
      : undefined;

  if (!alvo) {
    console.log(
      `\n⚠️  Existem ${orgs.length} organizações — informe qual manter com --keep-org=<id-ou-slug>.`,
    );
    return;
  }

  console.log(`\n[${SCRIPT}] Organização que ficaria: ${alvo.id} (${alvo.slug})`);
  if (orgs.length > 1) {
    console.log(`As outras ${orgs.length - 1} organização(ões) seriam apagadas INTEIRAS (cascade nativo).`);
  }

  console.log(`\nNunca tocado, em nenhum cenário: ${NUNCA_TOCADAS.join(", ")}.\n`);
  console.log(
    `Inclui crm_pipelines e crm_stages (estrutura do funil) — decisão explícita do Marcelo em 2026-08-24.\n`,
  );

  const contagem = await contarPorTabela(alvo.id);
  const total = imprimirContagem(`Dado em "${alvo.slug}" (PRODUÇÃO) que seria apagado:`, contagem);

  console.log(`\nTotal de linhas a apagar na org mantida: ${total}`);
  console.log(
    `\nNada foi apagado (dry-run). Pra executar de verdade:\n` +
      `  npx tsx scripts/${SCRIPT}.ts --confirm --keep-org=${alvo.slug} --sei-que-e-producao\n`,
  );
}

/**
 * Apaga em lotes de `TAMANHO_LOTE`, nunca um DELETE sem LIMIT — medido em
 * produção em 2026-08-24: `webhook_events_log` sozinho estourou o statement
 * timeout do Postgres com delete direto (`event_log`, bem menor, coube
 * inteiro). Select do lote de ids + delete por `id in (...)` porque o
 * REST/PostgREST não expõe `DELETE ... LIMIT`.
 *
 * 2000 por lote ESTOUROU com "Bad Request": `.in("id", ids)` vira query
 * string (`id=in.(uuid,uuid,...)`) — 2000 UUIDs = ~74KB de URL, acima do
 * limite do PostgREST/proxy. 200 por lote (~7,4KB) é seguro.
 */
const TAMANHO_LOTE = 200;

function detalheDoErro(error: { message: string; code?: string; details?: string; hint?: string }): string {
  const partes = [error.message];
  if (error.code) partes.push(`code=${error.code}`);
  if (error.details) partes.push(`details=${error.details}`);
  if (error.hint) partes.push(`hint=${error.hint}`);
  return partes.join(" | ");
}

async function apagarEmLotes(tabela: string, orgId: string): Promise<number> {
  let total = 0;
  for (;;) {
    const { data, error: selError } = await admin
      .from(tabela)
      .select("id")
      .eq("organization_id", orgId)
      .limit(TAMANHO_LOTE);
    if (selError) throw new Error(`selecionando lote: ${detalheDoErro(selError)}`);
    const ids = ((data ?? []) as { id: string }[]).map((r) => r.id);
    if (ids.length === 0) break;
    const { error: delError, count } = await admin.from(tabela).delete({ count: "exact" }).in("id", ids);
    if (delError) throw new Error(`apagando lote de ${ids.length} (ex.: ${ids[0]}): ${detalheDoErro(delError)}`);
    total += count ?? ids.length;
    if (ids.length < TAMANHO_LOTE) break;
  }
  return total;
}

async function executar(): Promise<void> {
  if (!SEI_QUE_E_PRODUCAO) {
    throw new Error(`--confirm exige também --sei-que-e-producao. Isto é dado real, não teste.`);
  }
  const orgs = await listarOrganizacoes();
  const alvo = orgs.find((o) => o.id === KEEP_ORG || o.slug === KEEP_ORG);
  if (!alvo) {
    throw new Error(
      `--keep-org=${KEEP_ORG} não bateu com nenhuma organização. Rode sem --confirm primeiro pra ver a lista.`,
    );
  }
  const outras = orgs.filter((o) => o.id !== alvo.id);

  console.log(`\n[${SCRIPT}] Mantendo: ${alvo.id} (${alvo.slug}).`);
  if (outras.length > 0) {
    console.log(`Apagando ${outras.length} outra(s) organização(ões) inteira(s)...`);
  }
  console.log(`Limpando conversas e funis (estrutura + leads) dentro de "${alvo.slug}"...\n`);

  if (outras.length > 0) {
    const { error, count } = await admin
      .from("organizations")
      .delete({ count: "exact" })
      .neq("id", alvo.id);
    if (error) throw new Error(`Falhou apagando outras organizations: ${error.message}`);
    console.log(`[org] ${count} organização(ões) removida(s) (cascade nativo do schema).`);
  }

  for (const tabela of TABELAS_DE_DADO_EM_ORDEM) {
    let count: number;
    try {
      count = await apagarEmLotes(tabela, alvo.id);
    } catch (e) {
      throw new Error(
        `Parou em "${tabela}" (organization_id=${alvo.id}): ${(e as Error).message}. ` +
          `As tabelas ANTES desta na lista já foram apagadas de verdade (sem rollback). ` +
          `Ajuste TABELAS_DE_DADO_EM_ORDEM se for erro de ordem de FK e rode de novo — o script é idempotente ` +
          `(tabela já vazia só conta 0 e segue).`,
      );
    }
    if (count > 0) console.log(`  ${tabela.padEnd(28)} -${count}`);
  }

  await admin.from("api_audit_log").delete().eq("organization_id", alvo.id);
  const { error: auditErr } = await admin.from("api_audit_log").insert({
    organization_id: alvo.id,
    action: "producao.cleanup",
    resource_type: "organization",
    resource_id: alvo.id,
    metadata: {
      actor: `script:${SCRIPT}`,
      apagou_organizacoes: outras.map((o) => o.id),
      mantida: alvo.id,
      em: new Date().toISOString(),
    },
  } as never);
  if (auditErr) console.warn(`[${SCRIPT}] não consegui gravar o marco em api_audit_log: ${auditErr.message}`);

  console.log("\n✅ Limpeza concluída.");
  console.log(`\nConferindo contagem final...`);
  const contagemFinal = await contarPorTabela(alvo.id);
  const restante = Object.entries(contagemFinal).filter(([, n]) => n > 0);
  if (restante.length === 0) {
    console.log("Tudo zerado, como esperado. Organização e usuário(s) intactos.");
  } else {
    console.warn("⚠️  Ainda restou dado nestas tabelas — investigar:", restante);
  }
}

async function main(): Promise<void> {
  if (!CONFIRM) {
    await dryRun();
    return;
  }
  if (!KEEP_ORG) {
    throw new Error(
      "--confirm exige também --keep-org=<id-ou-slug>. Rode sem --confirm primeiro pra ver as opções.",
    );
  }
  await executar();
}

main().catch((e) => {
  console.error(`❌ [${SCRIPT}]`, e);
  process.exit(1);
});
