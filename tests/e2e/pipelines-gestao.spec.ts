/**
 * Gestão de funis pelo SELETOR do quadro — a jornada de quem organiza o próprio CRM.
 *
 * ⚠️ REESCRITO quando "Funis" deixou de abrir uma listagem (`/app/kanban`) e
 * passou a cair direto no quadro do funil padrão. A gestão — criar, renomear,
 * reordenar, tornar padrão, arquivar — que antes vivia numa página própria
 * agora mora no seletor aberto onde ficava o `<h1>` do quadro
 * (`components/kanban/PipelineSwitcher.tsx`, testid `seletor-de-funil`). Os
 * testids de cada linha e ação são os MESMOS de antes — só a forma de
 * alcançá-los mudou: abrir o seletor em vez de estar numa lista sempre visível.
 *
 * Cobre a feature inteira num só fio, porque é assim que ela é usada: a lista
 * respeita a organização ativa, o funil nasce com colunas e te leva direto pra
 * ele, é renomeado, reordenado, vira padrão, e as duas recusas que protegem a
 * operação aparecem explicadas no diálogo de arquivamento (arquivar o padrão,
 * arquivar o último).
 *
 * ⚠️ O PRIMEIRO CASO SÓ TEM PODER COM DUAS ORGANIZAÇÕES. `seed-e2e-funis.ts`
 * coloca o manager numa segunda org que também tem um funil "Pedidos" (o gatilho
 * de seed cria um em toda org nova). Com uma org só, o caso passaria mesmo com o
 * filtro de `organization_id` apagado da página — mediria o seed, não o código.
 *
 * O teste devolve o estado como encontrou (o funil criado termina arquivado, e o
 * padrão volta para onde estava), então roda quantas vezes for preciso.
 *
 * Pré-requisito: seed de credenciais + seed de funis (rodados aqui se faltarem).
 */
import { execFileSync } from "node:child_process";
import * as fs from "node:fs";
import * as path from "node:path";

import { test, expect, type Page } from "@playwright/test";

const CREDS_PATH = path.join(process.cwd(), ".e2e-creds.json");
const EVIDENCIA = path.join(process.cwd(), ".superpowers", "evidence");

interface Creds {
  password: string;
  users: Record<string, { email: string }>;
  funis?: { segunda_org_id: string };
}

function loadCreds(): Creds {
  if (!fs.existsSync(CREDS_PATH)) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
  }
  let c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  if (!c.users?.manager) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-credentials.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  if (!c.funis?.segunda_org_id) {
    execFileSync("npx", ["tsx", "scripts/seed-e2e-funis.ts"], { stdio: "inherit" });
    c = JSON.parse(fs.readFileSync(CREDS_PATH, "utf8")) as Creds;
  }
  return c;
}

const creds = loadCreds();
const NOME = `Clinica E2E ${Date.now()}`;
const RENOMEADO = `${NOME} renomeado`;

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/);
}

/** Abre o seletor de funil — a chamada pressupõe que ele está FECHADO. */
async function abrirSeletor(page: Page): Promise<void> {
  await page.getByTestId("seletor-de-funil").click();
  await expect(page.getByRole("menu")).toBeVisible();
}

/** A linha do funil pelo nome visível — o seletor não expõe id para o usuário. */
function linhaDoFunil(page: Page, nome: string) {
  return page.locator('li[data-testid^="funil-"]').filter({ hasText: nome });
}

/**
 * O id do funil, lido da própria linha.
 *
 * ⚠️ SEM ISTO O SPEC PEGA O BOTÃO ERRADO. "Arquivar" aparece mais de uma vez
 * na tela com o diálogo de confirmação aberto (o botão da linha e o do
 * diálogo), e casar por TEXTO resolve para vários elementos. Com o id, cada
 * clique aponta para um alvo só.
 */
async function idDoFunil(page: Page, nome: string): Promise<string> {
  const testid = await linhaDoFunil(page, nome).getAttribute("data-testid");
  if (!testid) throw new Error(`funil «${nome}» não está no seletor`);
  return testid.replace(/^funil-/, "");
}

test.describe("gestão de funis", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, creds.users.manager!.email);
    // "Funis" cai direto no quadro do padrão — não há mais listagem própria.
    await page.goto("/app/kanban");
    await page.waitForURL(/\/app\/pipelines\//);
    await expect(page.getByTestId("seletor-de-funil")).toBeVisible();
  });

  test("a lista mostra só a organização ativa, mesmo com funil homônimo em outra", async ({
    page,
  }) => {
    // O manager é membro de DUAS organizações, e as duas têm um funil "Pedidos".
    // Sem o filtro por organização, apareceriam as duas linhas — indistinguíveis,
    // cada uma levando a um quadro diferente.
    await abrirSeletor(page);
    await expect(page.getByRole("menu").getByText("Pedidos", { exact: true })).toHaveCount(1);
  });

  test("cria funil com colunas e leva direto pra ele, edita, e as recusas aparecem explicadas", async ({
    page,
  }) => {
    // ---- criar ----
    await abrirSeletor(page);
    await page.getByTestId("novo-funil").click();
    await page.getByTestId("nome-do-novo-funil").fill(NOME);
    await page.getByTestId("confirmar-novo-funil").click();

    // ---- criar já LEVA para o quadro novo, com as quatro colunas padrão ----
    await page.waitForURL(/\/app\/pipelines\//);
    for (const coluna of ["Novo", "Em andamento", "Ganho", "Perdido"]) {
      await expect(page.getByText(coluna, { exact: true }).first()).toBeVisible();
    }
    await expect(page.getByTestId("seletor-de-funil")).toHaveText(NOME);
    await page.screenshot({ path: path.join(EVIDENCIA, "funis-01-criado-e-aberto.png"), fullPage: true });

    // ---- renomear (o seletor fica ABERTO depois de cada ação de gestão) ----
    await abrirSeletor(page);
    const id = await idDoFunil(page, NOME);
    await page.getByTestId(`renomear-${id}`).click();
    await page.getByTestId(`nome-${id}`).fill(RENOMEADO);
    await page.getByTestId(`salvar-nome-${id}`).click();
    await expect(linhaDoFunil(page, RENOMEADO)).toBeVisible();
    // O rótulo do seletor (a "capa" do quadro atual) acompanha o rename.
    await expect(page.getByTestId("seletor-de-funil")).toHaveText(RENOMEADO);

    // ---- reordenar: sobe para o topo ----
    await page.getByTestId(`subir-${id}`).click();
    await expect(page.locator('li[data-testid^="funil-"]').first()).toContainText(RENOMEADO);

    // ---- tornar padrão ----
    await page.getByTestId(`padrao-${id}`).click();
    await expect(linhaDoFunil(page, RENOMEADO).getByText("Padrão")).toBeVisible();
    await page.screenshot({ path: path.join(EVIDENCIA, "funis-02-padrao.png"), fullPage: true });

    // ---- recusa: arquivar o funil padrão (abre o diálogo, e fecha o seletor) ----
    await page.getByTestId(`arquivar-${id}`).click();
    await expect(page.getByTestId(`arquivar-painel-${id}`)).toBeVisible();
    await page.getByTestId(`arquivar-confirmar-${id}`).click();
    await expect(page.getByTestId(`arquivar-erro-${id}`)).toContainText(/padrão/i);
    await page.screenshot({
      path: path.join(EVIDENCIA, "funis-03-recusa-padrao.png"),
      fullPage: true,
    });
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();

    // ---- devolve o padrão para "Pedidos" e arquiva de verdade ----
    await abrirSeletor(page);
    const idPedidos = await idDoFunil(page, "Pedidos");
    await page.getByTestId(`padrao-${idPedidos}`).click();
    await expect(linhaDoFunil(page, "Pedidos").getByText("Padrão")).toBeVisible();

    await page.getByTestId(`arquivar-${id}`).click();
    await page.getByTestId(`arquivar-confirmar-${id}`).click();
    // Arquivar o funil que você está OLHANDO te tira de lá: o quadro deixou de
    // existir para você, e "/app/kanban" te leva para o novo padrão.
    await page.waitForURL(/\/app\/pipelines\//);
    await expect(page.getByTestId("seletor-de-funil")).toHaveText("Pedidos");

    await abrirSeletor(page);
    await expect(linhaDoFunil(page, RENOMEADO)).toHaveCount(0);

    // ---- recusa: arquivar o último funil ----
    await page.getByTestId(`arquivar-${idPedidos}`).click();
    await page.getByTestId(`arquivar-confirmar-${idPedidos}`).click();
    await expect(page.getByTestId(`arquivar-erro-${idPedidos}`)).toContainText(/único/i);
    await page.screenshot({
      path: path.join(EVIDENCIA, "funis-04-recusa-ultimo.png"),
      fullPage: true,
    });
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar" }).click();
  });

  test("\"Gerenciar funis\" fecha o seletor e abre Etapas do funil", async ({ page }) => {
    await abrirSeletor(page);
    await page.getByTestId("gerenciar-funis").click();
    await page.waitForURL(/settings\/tenant\/pipelines/);
    await expect(page.getByRole("heading", { name: "Etapas do funil", level: 1 })).toBeVisible();
  });
});

/**
 * Fora do `describe` acima de propósito: este caso entra com OUTRO usuário, e o
 * `beforeEach` de lá já teria logado como manager — a sessão do manager mascararia
 * exatamente o que se quer medir.
 */
test("quem não pode gerenciar vê o seletor sem os controles de escrita", async ({ page }) => {
  // Botão que o servidor recusaria é promessa que não se cumpre: `requireRole`
  // cobra manager nas rotas, então agent não vê "Novo funil", "Arquivar" nem
  // "Gerenciar funis" (que também é manager+).
  await login(page, creds.users.agent!.email);
  await page.goto("/app/kanban");
  await page.waitForURL(/\/app\/pipelines\//);
  await page.getByTestId("seletor-de-funil").click();
  await expect(page.getByRole("menu")).toBeVisible();
  await expect(page.getByRole("menu").getByText("Pedidos", { exact: true })).toHaveCount(1);
  await expect(page.getByTestId("novo-funil")).toHaveCount(0);
  await expect(page.locator('[data-testid^="arquivar-"]')).toHaveCount(0);
  await expect(page.getByTestId("gerenciar-funis")).toHaveCount(0);
});
