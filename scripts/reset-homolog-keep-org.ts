/**
 * Zera o dado de teste do Fluxa CRM em homologação, mantendo intactos a
 * organization e o(s) usuário(s) já criados — para o Marcelo começar a operar
 * o próprio CRM com dado real (comercial-hub/pipeline) em vez de seed.
 *
 * Uso:
 *   npx tsx scripts/reset-homolog-keep-org.ts
 *     → dry-run: lista organizations e contagem de linhas por tabela. Não apaga nada.
 *
 *   npx tsx scripts/reset-homolog-keep-org.ts --confirm --keep-org=<id-ou-slug>
 *     → executa de verdade, via REST (supabase-js), tabela por tabela, na
 *       ordem de TABELAS_DE_DADO_EM_ORDEM (verificada contra as FKs reais em
 *       baseline.sql). NÃO é uma transação única: a conexão direta ao Postgres
 *       (`db.<ref>.supabase.co`) só resolve em IPv6 nesta máquina, sem rota —
 *       `getaddrinfo ENOTFOUND` (confirmado com nslookup em 21/08/2026). Se
 *       parar no meio, as tabelas antes já foram apagadas de verdade (sem
 *       rollback) — o log mostra até onde chegou. O script é idempotente:
 *       rodar de novo só conta 0 nas tabelas já vazias e segue.
 *
 * O que NUNCA é tocado: organizations (a linha mantida), user_organizations,
 * auth.users, platform_admins, crm_pipelines, crm_stages (estrutura de funil
 * é configuração, não dado de teste — decisão do Marcelo em 21/08/2026).
 *
 * ai_budgets TAMBÉM foi deixada de fora da lista de limpeza (desvio pontual do
 * plano original, decidido ao escrever o script): pela definição em
 * `baseline.sql` ela não tem coluna `id` própria — `organization_id` É a chave
 * primária, uma linha de config por tenant (limite mensal de IA, etc.), sem
 * gatilho confirmado de reseed depois de apagada. Apagar arriscava deixar a
 * organização mantida sem orçamento de IA configurado. Mais seguro tratar como
 * config, igual a `crm_pipelines`/`crm_stages`.
 *
 * Sobre o anti-pattern #7 do CLAUDE.md ("cascade fantasma — deletar contact
 * cascade em messages perde histórico") e a doutrina de LGPD (anonimizar >
 * deletar contato): isto é sobre CLIENTE REAL em produção. Aqui não há
 * cliente real — é limpeza deliberada de dado de teste em homologação
 * (ambiente confirmado fora do código pelo Marcelo, no Supabase Dashboard, em
 * 21/08/2026). DELETE direto é o correto neste caso específico; não é o
 * padrão a copiar para qualquer outra situação.
 */

import { createClient } from "@supabase/supabase-js";
import { credenciaisSupabaseDeTeste, anunciarDestino } from "./lib/env-de-teste";

const SCRIPT = "reset-homolog-keep-org";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const keepArg = args.find((a) => a.startsWith("--keep-org="));
const KEEP_ORG = keepArg?.split("=")[1];

const creds = credenciaisSupabaseDeTeste();
anunciarDestino(SCRIPT, creds);

const admin = createClient(creds.url, creds.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

/**
 * Tabelas de dado/conteúdo com organization_id, na ordem segura de DELETE —
 * filhas antes de pais, verificado lendo cada FK real em supabase/baseline.sql
 * (não é uma ordem "provável", cada seta abaixo foi conferida):
 *
 *   ai_agent_runs      → ai_agents, ai_agent_versions, conversations,
 *                        contacts, channel_sessions, messages
 *   ai_invocations     → ai_agents, conversations, messages
 *   ai_chunks          → ai_knowledge_sources, ai_knowledge_versions
 *   ai_faq_items       → ai_knowledge_sources
 *   crm_lead_activities→ crm_leads, contacts
 *   crm_lead_links     → crm_leads
 *   lgpd_requests      → contacts (nullable)
 *   storage_redaction_queue → lgpd_requests (nullable, via request_id)
 *   orders             → contacts (nullable)
 *   messages           → conversations, channel_sessions, contacts
 *   crm_leads          → contacts (nullable); pipeline/stage ficam (mantidos)
 *   ai_knowledge_sources/versions → ai_agents
 *   ai_agent_versions  → ai_agents, channel_sessions
 *   conversations      → contacts, channel_sessions
 *   contacts           → (sem dependentes restantes depois daqui)
 *   channel_session_warmup → channel_sessions
 *   channel_sessions   → (sem dependentes restantes depois daqui)
 *   ai_agents          → (sem dependentes restantes depois daqui)
 *
 * api_tokens, event_log, idempotency_keys, incidents, merge_queue,
 * nuvemshop_products, tenant_integrations, ai_provider_credentials e
 * webhook_events_log não têm FK que bloqueie nada aqui — vão primeiro, em
 * qualquer ordem entre si.
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
  "crm_pipelines",
  "crm_stages",
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
    console.log(`As outras ${orgs.length - 1} organização(ões) seriam apagadas inteiras (cascade nativo).`);
  }

  console.log(`\nNunca tocado, em nenhum cenário: ${NUNCA_TOCADAS.join(", ")}.\n`);

  const contagem = await contarPorTabela(alvo.id);
  const total = imprimirContagem(`Dado de teste em "${alvo.slug}" que seria apagado:`, contagem);

  console.log(`\nTotal de linhas a apagar na org mantida: ${total}`);
  console.log(
    `\nNada foi apagado (dry-run). Pra executar de verdade:\n` +
      `  npx tsx scripts/${SCRIPT}.ts --confirm --keep-org=${alvo.slug}\n`,
  );
}

async function executar(): Promise<void> {
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
  console.log(`Limpando dado de teste dentro de "${alvo.slug}"...\n`);

  // Via REST (supabase-js), não via conexão direta ao Postgres: nesta máquina
  // `db.<ref>.supabase.co` só resolve em IPv6 (confirmado com nslookup contra
  // 8.8.8.8 em 21/08/2026 — sem rota IPv6 daqui, `getaddrinfo ENOTFOUND`), e o
  // host da API/REST tem IPv4 normal. Isso significa CADA delete abaixo é sua
  // própria transação — não existe um BEGIN/COMMIT cobrindo as 28 tabelas de
  // uma vez. O que sustenta a segurança aqui é que TABELAS_DE_DADO_EM_ORDEM foi
  // verificada contra as FKs reais em baseline.sql (não é palpite) — o risco
  // de parar no meio por erro de ordem é baixo. Se mesmo assim parar no meio,
  // o log abaixo mostra exatamente até onde chegou, pra retomar sem repetir.

  if (outras.length > 0) {
    const { error, count } = await admin
      .from("organizations")
      .delete({ count: "exact" })
      .neq("id", alvo.id);
    if (error) throw new Error(`Falhou apagando outras organizations: ${error.message}`);
    console.log(`[org] ${count} organização(ões) removida(s) (cascade nativo do schema).`);
  }

  for (const tabela of TABELAS_DE_DADO_EM_ORDEM) {
    const { error, count } = await admin
      .from(tabela)
      .delete({ count: "exact" })
      .eq("organization_id", alvo.id);
    if (error) {
      throw new Error(
        `Parou em "${tabela}" (organization_id=${alvo.id}): ${error.message}. ` +
          `As tabelas ANTES desta na lista já foram apagadas de verdade (sem rollback — ver comentário acima). ` +
          `Ajuste TABELAS_DE_DADO_EM_ORDEM se for erro de ordem de FK e rode de novo — o script é idempotente ` +
          `(tabela já vazia só conta 0 e segue).`,
      );
    }
    if ((count ?? 0) > 0) console.log(`  ${tabela.padEnd(28)} -${count}`);
  }

  // api_audit_log por último: limpa o histórico de teste e grava o marco zero.
  await admin.from("api_audit_log").delete().eq("organization_id", alvo.id);
  const { error: auditErr } = await admin.from("api_audit_log").insert({
    organization_id: alvo.id,
    action: "homolog.cleanup",
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
