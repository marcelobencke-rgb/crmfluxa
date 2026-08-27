/**
 * Gestão de funis pela tela do Kanban — a jornada de quem organiza o próprio CRM.
 *
 * Cobre a feature inteira num só fio, porque é assim que ela é usada: a lista
 * respeita a organização ativa, o funil nasce com colunas, é renomeado,
 * reordenado, vira padrão, e as duas recusas que protegem a operação aparecem
 * explicadas na tela (arquivar o padrão, arquivar o último).
 *
 * ⚠️ O PRIMEIRO CASO SÓ TEM PODER COM DUAS ORGANIZAÇÕES. `seed-e2e-funis.ts`
 * coloca o manager numa segunda org que também tem um funil "Funil de vendas" (o gatilho
 * de seed cria um em toda org nova). Com uma org só, o caso passaria mesmo com o
 * filtro de `organization_id` apagado da página — mediria o seed, não o código.
 *
 * O teste devolve o estado como encontrou (o funil criado termina arquivado, e o
 * padrão volta para onde estava) — garantido por `try/finally` no segundo caso,
 * não só pela sequência feliz: a organização usada aqui (`e2e-test-org`) é
 * compartilhada com outros specs no mesmo CI, e um assert que estoura no meio
 * não pode deixar o funil semeado sem ser padrão para quem rodar depois.
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
/**
 * O NOME DO FUNIL QUE O GATILHO SEMEIA — e ele MUDOU.
 *
 * Até a migration 0144, `fn_seed_default_pipeline_for_org` criava "Pedidos" com
 * 8 etapas de e-commerce em toda organização nova. A 0144 trocou por um padrão
 * neutro: "Funil de vendas" com Novo · Em andamento · Ganho · Perdido.
 *
 * Este spec (e o comentário de `scripts/seed-e2e-funis.ts`) ficaram com o nome
 * antigo, então TODA busca por linha do funil devolvia zero — a causa das três
 * falhas depois que o dropdown já abria certo.
 *
 * Constante, e não literal espalhado por 11 lugares: se outra migration mexer no
 * seed, o conserto é uma linha, e o comentário acima diz onde olhar.
 */
const FUNIL_SEMEADO = "Funil de vendas";

const NOME = `Clinica E2E ${Date.now()}`;
const RENOMEADO = `${NOME} renomeado`;

async function login(page: Page, email: string): Promise<void> {
  await page.goto("/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(creds.password);
  await page.getByRole("button", { name: /entrar/i }).click();
  await page.waitForURL(/\/app(\/|$)/);
}

/**
 * A LISTA DE FUNIS VIVE DENTRO DO DROPDOWN, não numa página.
 *
 * A versão anterior deste spec procurava `li[data-testid^="funil-"]` numa tela
 * de lista que não existe mais: a gestão de funis passou a ser o
 * `PipelineSelector` do quadro (components/kanban/PipelineSelector.tsx), um
 * menu que se abre pelo nome do funil atual. As linhas são `div`, não `li`, e
 * só estão no DOM com o menu ABERTO — daí `abrirSeletor` antes de cada leitura.
 */
async function abrirSeletor(page: Page): Promise<void> {
  await page.getByTestId("alternar-funil").click();
  // O SINAL DE ABERTO É O `role="menu"` do Radix, e não um item de dentro.
  //
  // A primeira versão esperava `getByTestId("novo-funil").or(...linha...)`. Duas
  // coisas erradas: `novo-funil` só existe para quem tem `podeGerenciar`, então
  // o caso do agent nunca o veria; e `.or()` casa OS DOIS quando os dois existem,
  // o que é violação de modo estrito no `toBeVisible()`.
  //
  // `role="menu"` é um elemento só, existe para qualquer papel, e é o mesmo
  // mundo de seletor que `kanban-owner-filter.spec.ts` usa para abrir menu Radix
  // — o único spec desta suíte que faz isso e passa.
  await expect(page.getByRole("menu")).toBeVisible({ timeout: 15_000 });
}

function linhaDoFunil(page: Page, nome: string) {
  return page.locator('[data-testid^="funil-"]').filter({ hasText: nome });
}

/** Troca o funil ATUAL — renomear e arquivar agem sobre ele, não sobre uma linha. */
async function selecionarFunil(page: Page, nome: string): Promise<void> {
  await abrirSeletor(page);
  await linhaDoFunil(page, nome).first().click();
  await page.waitForURL(/\/app\/pipelines/);
}

/**
 * O id do funil, lido da própria linha.
 *
 * ⚠️ SEM ISTO O SPEC PEGA O BOTÃO ERRADO. "Arquivar" aparece três vezes na tela
 * com o painel de confirmação aberto (o botão de cada linha e o de confirmar), e
 * casar por TEXTO resolve para vários elementos. Com o id, cada clique aponta
 * para um alvo só — que é o que o teste quer dizer quando diz "clique aqui".
 */
async function idDoFunil(page: Page, nome: string): Promise<string> {
  const testid = await linhaDoFunil(page, nome).first().getAttribute("data-testid");
  if (!testid) throw new Error(`funil «${nome}» não está na lista`);
  return testid.replace(/^funil-/, "");
}

/**
 * ⚠️ O QUE ESTE SPEC DEIXOU DE COBRIR, e por quê.
 *
 * **Reordenar funis.** A versão anterior tinha um passo `subir-${id}` que subia
 * o funil para o topo da lista. O `PipelineSelector` não oferece reordenação de
 * FUNIS — o `subir-`/`descer-` que existe hoje (em
 * app/app/settings/tenant/pipelines/_stages.tsx) é de ETAPAS, outra coisa. O
 * passo saiu porque não há UI para exercer; se a reordenação de funis voltar,
 * volta com ele.
 *
 * **Recusa como elemento inline.** A versão anterior asseria
 * `arquivar-erro-${id}`, um elemento de erro por linha. O dropdown mostra a
 * recusa por TOAST — `handleArchive` repassa a mensagem da API. O que o caso
 * guarda (a recusa é EXPLICADA, não silenciosa) continua guardado; o que mudou
 * é onde a explicação aparece.
 */
test.describe("gestão de funis", () => {
  test.beforeEach(async ({ page }) => {
    await login(page, creds.users.manager!.email);
    await page.goto("/app/pipelines");
    // `/app/pipelines` renderiza o QUADRO direto (page.tsx:25); o heading
    // "Pipelines" só existe no ramo de estado vazio, que o seed nunca produz.
    await expect(page.getByTestId("alternar-funil")).toBeVisible({ timeout: 30_000 });
  });

  test("a lista mostra só a organização ativa, mesmo com funil homônimo em outra", async ({
    page,
  }) => {
    // O manager é membro de DUAS organizações, e as duas têm um funil com o
    // MESMO nome (o gatilho semeia o mesmo em toda org).
    // Sem o filtro por organização, apareceriam as duas linhas — indistinguíveis,
    // cada uma levando a um quadro diferente.
    await abrirSeletor(page);
    await expect(linhaDoFunil(page, FUNIL_SEMEADO)).toHaveCount(1);
  });

  test("cria funil com colunas, edita, e as recusas aparecem explicadas", async ({ page }) => {
    // Capturado ANTES da mutação começar: se algo estourar mais adiante, o
    // `finally` precisa saber a quem devolver o "Padrão" mesmo sem ter chegado
    // até lá pela sequência feliz.
    // ABRE O MENU ANTES DE LER — as linhas só existem no DOM com ele aberto.
    //
    // Esta chamada estava sem `abrirSeletor` e por isso estourava 30s: o
    // `idDoFunil` procurava a linha num menu fechado. O caso irmão acima passava
    // porque abre explicitamente; este falhava na PRIMEIRA linha do corpo, antes
    // de chegar em qualquer conserto que eu tivesse feito adiante — e por isso
    // três rodadas seguidas mostraram o mesmo sintoma em lugares diferentes.
    await abrirSeletor(page);
    const idSemeado = await idDoFunil(page, FUNIL_SEMEADO);
    await page.keyboard.press("Escape");
    let id: string | undefined;

    try {
      // ---- criar ----
      // Criar REDIRECIONA para o quadro do funil novo (handleCreate faz
      // router.push), então ele já fica sendo o "funil atual" — que é sobre
      // quem renomear e arquivar agem.
      await abrirSeletor(page);
      await page.getByTestId("novo-funil").click();
      await page.getByTestId("nome-do-novo-funil").fill(NOME);
      await page.getByTestId("confirmar-novo-funil").click();
      await page.waitForURL(/\/app\/pipelines\//, { timeout: 30_000 });
      // ESPERA O QUADRO NOVO ASSENTAR, e não só a URL trocar.
      //
      // `handleCreate` faz `router.push` para o funil recém-criado; a URL muda
      // ANTES de o Server Component novo chegar com a lista atualizada. Abrir o
      // seletor nessa janela clicava no gatilho da página velha, e a navegação
      // seguinte trocava o DOM com o menu aberto — a linha do funil novo nunca
      // aparecia, e o `idDoFunil` estourava os 30s.
      //
      // O gatilho exibe `currentPipelineName`: ele conter NOME é a prova de que
      // o quadro do funil novo já é o que está na tela.
      await expect(page.getByTestId("alternar-funil")).toContainText(NOME, { timeout: 30_000 });
      await page.screenshot({ path: path.join(EVIDENCIA, "funis-01-criado.png"), fullPage: true });

      await abrirSeletor(page);
      await expect(linhaDoFunil(page, NOME)).toHaveCount(1);
      id = await idDoFunil(page, NOME);
      await page.keyboard.press("Escape");

      // ---- o funil nasce com as quatro colunas (senão o quadro é morto) ----
      for (const coluna of ["Novo", "Em andamento", "Ganho", "Perdido"]) {
        await expect(page.getByText(coluna, { exact: true }).first()).toBeVisible();
      }
      await page.screenshot({ path: path.join(EVIDENCIA, "funis-02-quadro-novo.png"), fullPage: true });

      // ---- renomear (age no funil ATUAL, que é o recém-criado) ----
      await abrirSeletor(page);
      await page.getByTestId("renomear-funil").click();
      await page.getByTestId("nome-do-funil").fill(RENOMEADO);
      await page.getByTestId("salvar-nome-funil").click();
      // Mesmo sinal de assentamento do passo de criar: o gatilho exibe o nome do
      // funil atual, então ele conter RENOMEADO prova que a mutação chegou à
      // tela — abrir o seletor antes disso lê a lista velha.
      await expect(page.getByTestId("alternar-funil")).toContainText(RENOMEADO, { timeout: 30_000 });
      await abrirSeletor(page);
      await expect(linhaDoFunil(page, RENOMEADO)).toHaveCount(1);
      await page.keyboard.press("Escape");

      // ---- tornar padrão ----
      await abrirSeletor(page);
      await page.getByTestId(`padrao-${id}`).click();
      await abrirSeletor(page);
      await expect(linhaDoFunil(page, RENOMEADO)).toContainText("Padrão");
      await page.keyboard.press("Escape");
      await page.screenshot({ path: path.join(EVIDENCIA, "funis-03-padrao.png"), fullPage: true });

      // ---- recusa: arquivar o funil padrão ----
      // A recusa chega por TOAST, não por elemento inline: `handleArchive`
      // repassa a mensagem da API (`toast.error(\`Erro: \${e.message}\`)`). O que o
      // caso guarda é que a recusa é EXPLICADA — e continua guardando.
      await abrirSeletor(page);
      await page.getByTestId("arquivar-funil").click();
      await page.getByTestId("arquivar-confirmar").click();
      await expect(page.getByText(/padrão/i).first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({
        path: path.join(EVIDENCIA, "funis-04-recusa-padrao.png"),
        fullPage: true,
      });
      await page.keyboard.press("Escape");

      // ---- devolve o padrão e arquiva de verdade ----
      await abrirSeletor(page);
      await page.getByTestId(`padrao-${idSemeado}`).click();
      await abrirSeletor(page);
      await expect(linhaDoFunil(page, FUNIL_SEMEADO)).toContainText("Padrão");
      await page.keyboard.press("Escape");

      await selecionarFunil(page, RENOMEADO);
      await abrirSeletor(page);
      await page.getByTestId("arquivar-funil").click();
      await page.getByTestId("arquivar-confirmar").click();
      await page.waitForURL(/\/app\/pipelines/, { timeout: 30_000 });
      await abrirSeletor(page);
      await expect(linhaDoFunil(page, RENOMEADO)).toHaveCount(0);
      await page.keyboard.press("Escape");

      // ---- recusa: arquivar o último funil ----
      await selecionarFunil(page, FUNIL_SEMEADO);
      await abrirSeletor(page);
      await page.getByTestId("arquivar-funil").click();
      await page.getByTestId("arquivar-confirmar").click();
      await expect(page.getByText(/único|último/i).first()).toBeVisible({ timeout: 15_000 });
      await page.screenshot({
        path: path.join(EVIDENCIA, "funis-05-recusa-ultimo.png",
        ),
        fullPage: true,
      });
    } finally {
      // Limpeza pelo caminho do produto — a organização é compartilhada com
      // outros specs (e outras sessões de CI), e um rerun tem que encontrar a
      // casa como a deixou mesmo que um assert acima tenha estourado no meio.
      // Cada passo em seu próprio try/catch: falha na limpeza não pode mascarar
      // o erro original do teste nem impedir o resto da limpeza de rodar.
      await page.goto("/app/pipelines").catch(() => {});

      try {
        await abrirSeletor(page);
        const semeadoEhPadrao = await linhaDoFunil(page, FUNIL_SEMEADO)
          .filter({ hasText: "Padrão" })
          .count()
          .then((n) => n > 0)
          .catch(() => false);
        if (!semeadoEhPadrao) await page.getByTestId(`padrao-${idSemeado}`).click();
        await page.keyboard.press("Escape").catch(() => {});
      } catch {
        // melhor esforço
      }

      try {
        if (id) {
          await abrirSeletor(page);
          const aindaExiste = (await linhaDoFunil(page, RENOMEADO).count()) > 0;
          await page.keyboard.press("Escape").catch(() => {});
          if (aindaExiste) {
            // Arquivar age no funil ATUAL: precisa selecioná-lo antes.
            await selecionarFunil(page, RENOMEADO);
            await abrirSeletor(page);
            await page.getByTestId("arquivar-funil").click();
            await page.getByTestId("arquivar-confirmar").click();
          }
        }
      } catch {
        // melhor esforço
      }
    }
  });

});

/**
 * Fora do `describe` acima de propósito: este caso entra com OUTRO usuário, e o
 * `beforeEach` de lá já teria logado como manager — a sessão do manager mascararia
 * exatamente o que se quer medir.
 */
test("quem não pode gerenciar vê a lista sem os controles de escrita", async ({ page }) => {
  // Botão que o servidor recusaria é promessa que não se cumpre: `requireRole`
  // cobra manager nas rotas, então agent não vê "Novo funil" nem "Arquivar".
  await login(page, creds.users.agent!.email);
  await page.goto("/app/pipelines");
  await expect(page.getByTestId("alternar-funil")).toBeVisible({ timeout: 30_000 });
  await abrirSeletor(page);
  await expect(linhaDoFunil(page, FUNIL_SEMEADO)).toHaveCount(1);
  // `podeGerenciar` esconde criar/renomear/arquivar do dropdown para quem é
  // agent — botão que o servidor recusaria é promessa que não se cumpre.
  await expect(page.getByTestId("novo-funil")).toHaveCount(0);
  await expect(page.getByTestId("renomear-funil")).toHaveCount(0);
  await expect(page.getByTestId("arquivar-funil")).toHaveCount(0);
});
