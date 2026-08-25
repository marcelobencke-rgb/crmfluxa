/**
 * Promove funis (crm_pipelines + crm_stages), contacts e crm_leads de
 * HOMOLOGAÇÃO pra PRODUÇÃO — decisão do Marcelo em 2026-08-24, depois de
 * zerar produção com `reset-producao-keep-org.ts`. Escopo confirmado com
 * ele: só essas 4 tabelas (sem conversas/mensagens, sem ai_agents/knowledge/
 * templates — ficou de fora de propósito).
 *
 * Por que precisa de DOIS clients Supabase ao mesmo tempo (não dá pra usar
 * o padrão de `credenciaisSupabaseDeTeste()` dos outros scripts, que só
 * resolve UM destino por vez):
 *
 *   - ORIGEM (homolog) é sempre lida DIRETO do arquivo `.env.local` — nunca
 *     do `process.env`. É o mesmo projeto Supabase que os outros scripts de
 *     homolog já usam (ref hnpdapxbrezmqsunltzf, confirmado em 2026-08-24).
 *   - DESTINO (produção) é sempre lido do `process.env` — o operador carrega
 *     `.env.producao.scripts` antes de rodar (mesma convenção de
 *     `reset-producao-keep-org.ts`). Recusa se a URL não bater com o
 *     projeto de produção conhecido (ref hgipbeobakzyvrcrliel) ou se bater
 *     com o de homolog por engano.
 *
 * Mapeamento de organization_id: linhas de homolog (org de origem) são
 * regravadas em produção com organization_id = org de destino. IDs internos
 * (id de pipeline/stage/contact/lead) são PRESERVADOS — produção estava
 * zerada pelo reset, não deveria colidir. Upsert com `ignoreDuplicates` em
 * todas as tabelas: rodar de novo depois de uma falha no meio não duplica
 * nem quebra em unique constraint.
 *
 * Tratamentos especiais (não é cópia 1:1 ingênua):
 *   - `contacts.email_normalized` é coluna GERADA — nunca vai no payload de
 *     insert (Postgres calcula sozinho).
 *   - `contacts.cpf_encrypted`/`cpf_hash` são zerados no destino: a chave de
 *     criptografia (`CPF_ENCRYPTION_KEY`) é por ambiente, e este repo não
 *     tem a de produção (vive só na VPS) — copiar o ciphertext daria bytes
 *     ilegíveis lá. Se algum contato de homolog tiver CPF preenchido, o
 *     dry-run avisa quantos, pra você decidir se recadastra manualmente.
 *   - `owner_user_id`/`created_by_user_id` (crm_leads, contacts): remapeados
 *     do usuário de homolog pro usuário de produção (cada ambiente tem
 *     exatamente 1 usuário hoje, casados por e-mail
 *     marcelobencke@gmail.com — o script recusa se achar mais de 1 em
 *     qualquer lado, pra não adivinhar).
 *   - `crm_pipelines.is_default`: produção pode já ter um pipeline default
 *     (bootstrap de onboarding). Existe índice único parcial
 *     (`uniq_crm_pipelines_org_default`) que barra 2 defaults na mesma org
 *     — o script CHECA isso antes de inserir e para com erro claro em vez
 *     de deixar o Postgres estourar a constraint no meio do lote.
 *
 * Uso:
 *   set -a; . ./.env.producao.scripts; set +a   # ou o loop de PowerShell equivalente
 *   npx tsx scripts/promover-homolog-para-producao.ts
 *     → dry-run: mostra org/usuário dos dois lados, contagem em homolog
 *       (o que seria copiado) e contagem já existente em produção nas
 *       mesmas 4 tabelas. Não escreve nada.
 *
 *   npx tsx scripts/promover-homolog-para-producao.ts --confirm \
 *     --source-org=<slug-em-homolog> --target-org=<slug-em-producao> --sei-que-e-producao
 *     → executa de verdade.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const SCRIPT = "promover-homolog-para-producao";
const REF_PRODUCAO = "hgipbeobakzyvrcrliel";
const REF_HOMOLOG = "hnpdapxbrezmqsunltzf";
const EMAIL_ESPERADO = "marcelobencke@gmail.com";

const args = process.argv.slice(2);
const CONFIRM = args.includes("--confirm");
const SEI_QUE_E_PRODUCAO = args.includes("--sei-que-e-producao");
const SOURCE_ORG = args.find((a) => a.startsWith("--source-org="))?.split("=")[1];
const TARGET_ORG = args.find((a) => a.startsWith("--target-org="))?.split("=")[1];

function lerArquivoEnv(arquivo: string): Record<string, string> {
  const caminho = path.join(process.cwd(), arquivo);
  if (!fs.existsSync(caminho)) return {};
  const env: Record<string, string> = {};
  for (const linha of fs.readFileSync(caminho, "utf8").split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)$/.exec(linha);
    if (m) env[m[1]!] = (m[2] ?? "").replace(/^"(.*)"$/, "$1").trim();
  }
  return env;
}

function refDaUrl(url: string): string {
  try {
    return new URL(url).hostname.split(".")[0] ?? "";
  } catch {
    return "";
  }
}

function credenciaisHomologDoArquivo(): { url: string; serviceRole: string } {
  const arquivo = lerArquivoEnv(".env.local");
  const url = arquivo.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole = arquivo.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url === "" || serviceRole === "") {
    throw new Error(`.env.local sem NEXT_PUBLIC_SUPABASE_URL/SUPABASE_SERVICE_ROLE_KEY.`);
  }
  const ref = refDaUrl(url);
  if (ref !== REF_HOMOLOG) {
    throw new Error(
      `.env.local aponta para ref="${ref}", esperado homolog (${REF_HOMOLOG}). ` +
        `Este script sempre lê a ORIGEM do .env.local — confira se não mudou.`,
    );
  }
  return { url, serviceRole };
}

function credenciaisProducaoDoAmbiente(): { url: string; serviceRole: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
  if (url === "" || serviceRole === "") {
    throw new Error(
      `Sem credenciais de produção no ambiente. Carregue: set -a; . ./.env.producao.scripts; set +a`,
    );
  }
  const ref = refDaUrl(url);
  if (ref === REF_HOMOLOG) {
    throw new Error(`O ambiente carregado é HOMOLOG (${REF_HOMOLOG}), não produção.`);
  }
  if (ref !== REF_PRODUCAO) {
    throw new Error(`URL de destino desconhecida (ref="${ref}"). Esperado produção (${REF_PRODUCAO}).`);
  }
  return { url, serviceRole };
}

const homologCreds = credenciaisHomologDoArquivo();
const producaoCreds = credenciaisProducaoDoAmbiente();
console.info(`[${SCRIPT}] origem (homolog):  ${homologCreds.url}`);
console.warn(`[${SCRIPT}] destino (⚠️ PRODUÇÃO): ${producaoCreds.url}`);

const homolog = createClient(homologCreds.url, homologCreds.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const producao = createClient(producaoCreds.url, producaoCreds.serviceRole, {
  auth: { autoRefreshToken: false, persistSession: false },
});

interface OrgRow {
  id: string;
  slug: string;
  display_name: string;
}

async function acharOrg(client: SupabaseClient, slugOuId: string | undefined, rotulo: string): Promise<OrgRow> {
  const { data, error } = await client.from("organizations").select("id, slug, display_name");
  if (error) throw new Error(`listando organizations de ${rotulo}: ${error.message}`);
  const orgs = (data ?? []) as OrgRow[];
  if (slugOuId) {
    const achado = orgs.find((o) => o.id === slugOuId || o.slug === slugOuId);
    if (!achado) throw new Error(`--${rotulo}-org=${slugOuId} não bateu com nenhuma organization em ${rotulo}.`);
    return achado;
  }
  if (orgs.length !== 1) {
    throw new Error(
      `${rotulo} tem ${orgs.length} organization(s) — informe qual com --${rotulo}-org=<slug-ou-id>. ` +
        `Encontradas: ${orgs.map((o) => o.slug).join(", ") || "(nenhuma)"}`,
    );
  }
  return orgs[0]!;
}

async function acharUsuarioUnico(client: SupabaseClient, rotulo: string): Promise<{ id: string; email: string }> {
  const { data, error } = await client.auth.admin.listUsers({ perPage: 200 });
  if (error) throw new Error(`listando usuários de ${rotulo}: ${error.message}`);
  if (data.users.length !== 1) {
    throw new Error(
      `${rotulo} tem ${data.users.length} usuário(s) — este script só sabe remapear owner_user_id/` +
        `created_by_user_id quando cada lado tem exatamente 1 usuário. Ajuste manualmente se precisar de mais.`,
    );
  }
  const u = data.users[0]!;
  if (u.email !== EMAIL_ESPERADO) {
    console.warn(`[${SCRIPT}] usuário de ${rotulo} é ${u.email}, esperava ${EMAIL_ESPERADO} — seguindo mesmo assim.`);
  }
  return { id: u.id, email: u.email ?? "" };
}

async function contar(client: SupabaseClient, tabela: string, orgId: string): Promise<number> {
  const { count, error } = await client.from(tabela).select("*", { count: "exact", head: true }).eq("organization_id", orgId);
  if (error) throw new Error(`contando ${tabela}: ${error.message}`);
  return count ?? 0;
}

const TABELAS = ["crm_pipelines", "crm_stages", "contacts", "crm_leads"] as const;

async function dryRun(): Promise<void> {
  const orgHomolog = await acharOrg(homolog, SOURCE_ORG, "homolog");
  const orgProducao = await acharOrg(producao, TARGET_ORG, "producao");
  console.log(`\n[${SCRIPT}] origem:  ${orgHomolog.id} (${orgHomolog.slug}) em homolog`);
  console.log(`[${SCRIPT}] destino: ${orgProducao.id} (${orgProducao.slug}) em produção\n`);

  console.log("Contagem em HOMOLOG (o que seria copiado):");
  for (const tabela of TABELAS) console.log(`  ${tabela.padEnd(16)} ${await contar(homolog, tabela, orgHomolog.id)}`);

  console.log("\nContagem JÁ EXISTENTE em PRODUÇÃO nas mesmas tabelas (upsert não duplica por id, mas confira):");
  for (const tabela of TABELAS) console.log(`  ${tabela.padEnd(16)} ${await contar(producao, tabela, orgProducao.id)}`);

  const { count: cpfCount, error: cpfErr } = await homolog
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgHomolog.id)
    .not("cpf_encrypted", "is", null);
  if (cpfErr) throw new Error(`contando contacts com CPF em homolog: ${cpfErr.message}`);
  if ((cpfCount ?? 0) > 0) {
    console.log(
      `\n⚠️  ${cpfCount} contato(s) em homolog têm CPF preenchido — o CPF NÃO é copiado ` +
        `(chave de criptografia é por ambiente). Esses contatos chegam em produção sem CPF.`,
    );
  }

  const { data: defaultPipelines } = await producao
    .from("crm_pipelines")
    .select("id, slug")
    .eq("organization_id", orgProducao.id)
    .eq("is_default", true);
  if (defaultPipelines && defaultPipelines.length > 0) {
    console.log(
      `\n⚠️  Produção já tem pipeline default: ${defaultPipelines.map((p: { slug: string }) => p.slug).join(", ")}. ` +
        `Se o pipeline de homolog que será copiado TAMBÉM for default, o insert vai falhar ` +
        `(uniq_crm_pipelines_org_default) — resolva antes de rodar com --confirm.`,
    );
  }

  console.log(
    `\nNada foi escrito (dry-run). Pra executar de verdade:\n` +
      `  npx tsx scripts/${SCRIPT}.ts --confirm --source-org=${orgHomolog.slug} --target-org=${orgProducao.slug} --sei-que-e-producao\n`,
  );
}

/**
 * Colunas GENERATED ALWAYS de cada tabela copiada — nunca entram no payload
 * de insert/upsert (o Postgres calcula sozinho, e rejeita valor explícito
 * com "cannot insert a non-DEFAULT value into column"). `contacts` tem 3,
 * todas adicionadas via ALTER TABLE no apêndice idempotente do
 * `baseline.sql` (não estavam no CREATE TABLE original — achadas por tentativa
 * e erro em produção em 2026-08-24: `email_normalized` já era esperada,
 * `wa_identity`/`wa_lid` não). Se este script for estendido pra outra
 * tabela, procure "generated always" em `supabase/baseline.sql` antes de
 * assumir que `select("*")` é seguro pra reinserir.
 */
const COLUNAS_GERADAS: Record<string, readonly string[]> = {
  contacts: ["email_normalized", "wa_identity", "wa_lid"],
};

function semColunasGeradas(tabela: string, row: Record<string, unknown>): Record<string, unknown> {
  const geradas = COLUNAS_GERADAS[tabela];
  if (!geradas) return row;
  const limpo = { ...row };
  for (const col of geradas) delete limpo[col];
  return limpo;
}

const TAMANHO_LOTE = 500;

async function copiarTabela<T extends Record<string, unknown>>(
  tabela: string,
  orgOrigemId: string,
  transformar: (row: Record<string, unknown>) => T,
): Promise<number> {
  const { data, error } = await homolog.from(tabela).select("*").eq("organization_id", orgOrigemId);
  if (error) throw new Error(`lendo ${tabela} de homolog: ${error.message}`);
  const rows = (data ?? []) as Record<string, unknown>[];
  if (rows.length === 0) return 0;

  let total = 0;
  for (let i = 0; i < rows.length; i += TAMANHO_LOTE) {
    const lote = rows.slice(i, i + TAMANHO_LOTE).map((r) => semColunasGeradas(tabela, transformar(r)));
    const { error: upErr, count } = await producao
      .from(tabela)
      .upsert(lote as unknown[], { onConflict: "id", ignoreDuplicates: true, count: "exact" });
    if (upErr) throw new Error(`gravando lote de ${tabela} em produção: ${upErr.message}`);
    total += count ?? lote.length;
  }
  return total;
}

async function executar(): Promise<void> {
  if (!SEI_QUE_E_PRODUCAO) throw new Error(`--confirm exige também --sei-que-e-producao.`);
  if (!SOURCE_ORG || !TARGET_ORG) {
    throw new Error(`--confirm exige --source-org= e --target-org=. Rode sem --confirm primeiro pra ver as opções.`);
  }

  const orgHomolog = await acharOrg(homolog, SOURCE_ORG, "homolog");
  const orgProducao = await acharOrg(producao, TARGET_ORG, "producao");
  const userHomolog = await acharUsuarioUnico(homolog, "homolog");
  const userProducao = await acharUsuarioUnico(producao, "producao");

  console.log(`\n[${SCRIPT}] Copiando ${orgHomolog.slug} (homolog) → ${orgProducao.slug} (produção)...\n`);

  const remapUser = (v: unknown): unknown => (v === userHomolog.id ? userProducao.id : v);

  // Checa conflito de is_default ANTES de tentar inserir — falha clara em vez
  // de estourar a constraint no meio do upsert.
  const { data: pipelinesOrigem, error: pErr } = await homolog
    .from("crm_pipelines")
    .select("id, slug, is_default")
    .eq("organization_id", orgHomolog.id);
  if (pErr) throw new Error(`lendo crm_pipelines de homolog: ${pErr.message}`);
  const idsOrigem = new Set((pipelinesOrigem ?? []).map((p: { id: string }) => p.id));
  const trazDefault = (pipelinesOrigem ?? []).some((p: { is_default: boolean }) => p.is_default);
  if (trazDefault) {
    const { data: defaultsExistentes } = await producao
      .from("crm_pipelines")
      .select("id, slug")
      .eq("organization_id", orgProducao.id)
      .eq("is_default", true);
    // Conflito só existe se o default em produção for uma linha DIFERENTE da
    // que estamos trazendo de homolog — se for a mesma (id igual, de uma
    // execução anterior que já upsertou este pipeline), é idempotência, não
    // colisão.
    const conflitante = (defaultsExistentes ?? []).filter((p: { id: string }) => !idsOrigem.has(p.id));
    if (conflitante.length > 0) {
      throw new Error(
        `Produção já tem pipeline default de OUTRA origem (${conflitante.map((p: { slug: string }) => p.slug).join(", ")}) ` +
          `e o de homolog também é default — violaria uniq_crm_pipelines_org_default. ` +
          `Apague/desmarque o default existente em produção antes de rodar de novo.`,
      );
    }
  }

  const n1 = await copiarTabela("crm_pipelines", orgHomolog.id, (r) => ({
    ...r,
    organization_id: orgProducao.id,
  }));
  console.log(`  crm_pipelines     +${n1}`);

  const n2 = await copiarTabela("crm_stages", orgHomolog.id, (r) => ({
    ...r,
    organization_id: orgProducao.id,
  }));
  console.log(`  crm_stages        +${n2}`);

  const n3 = await copiarTabela("contacts", orgHomolog.id, (r) => ({
    ...r,
    organization_id: orgProducao.id,
    cpf_encrypted: null,
    cpf_hash: null,
    created_by_user_id: remapUser(r.created_by_user_id),
  }));
  console.log(`  contacts          +${n3}`);

  const n4 = await copiarTabela("crm_leads", orgHomolog.id, (r) => ({
    ...r,
    organization_id: orgProducao.id,
    owner_user_id: remapUser(r.owner_user_id),
    created_by_user_id: remapUser(r.created_by_user_id),
  }));
  console.log(`  crm_leads         +${n4}`);

  console.log("\n✅ Promoção concluída.");
}

async function main(): Promise<void> {
  if (!CONFIRM) {
    await dryRun();
    return;
  }
  await executar();
}

main().catch((e) => {
  console.error(`❌ [${SCRIPT}]`, e);
  process.exit(1);
});
