/**
 * LINK INTERNO NÃO APONTA PARA ROTA QUE NÃO EXISTE.
 *
 * ## O defeito, medido em 2026-08-25
 *
 * O commit `5599d4a` ("restructure Kanban navigation") removeu
 * `app/app/kanban/page.tsx` e deixou para trás tudo o que apontava para lá:
 *
 *   - um `<Link href="/app/kanban">` VISÍVEL AO USUÁRIO, em SourceDetail.tsx —
 *     clicar dava 404;
 *   - `page.goto("/app/kanban")` em TRÊS specs de e2e, uma delas num
 *     `beforeEach` que governa um bloco inteiro;
 *   - o próprio diretório órfão, com 386 linhas de componente que ninguém
 *     importava e um teste unitário verde exercitando código morto.
 *
 * As specs viviam na lista de "12 falhas crônicas do e2e" — tratada por meses
 * como dívida opaca, minha inclusive. Não era: cinco delas tinham UMA causa, e a
 * causa era um `sed` que não foi feito.
 *
 * ## Por que teste e não revisão
 *
 * Ninguém revisa um PR procurando o que DEIXOU de existir. O autor do
 * `5599d4a` sabia que estava movendo a rota; quem revisou viu o que estava
 * escrito, não a ausência. É a mesma classe de `navegacao-completude` (tela sem
 * porta) vista pelo outro lado: aqui é porta sem tela.
 *
 * ## O que se cobra, e o que deliberadamente não
 *
 * Só href/goto ESTÁTICO começando com `/app` ou `/admin`. Caminho montado em
 * runtime (`/app/pipelines/${id}`) fica de fora — sem executar não dá para saber
 * o valor, e acusar o que não se sabe traz falso positivo, que faz o teste ser
 * desligado. A parte estática de um template é conferida até o primeiro `${`,
 * que é onde a certeza acaba.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

const RAIZ = process.cwd();
const APP = path.join(RAIZ, "app");

/** Rotas que existem: todo diretório com `page.tsx`, em caminho HTTP. */
function rotasQueExistem(dir: string, prefixo = ""): Set<string> {
  const rotas = new Set<string>();
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) {
      if (e.name === "page.tsx") rotas.add(prefixo || "/");
      continue;
    }
    // `(grupo)` não aparece na URL; `_x` não é segmento de rota.
    if (e.name.startsWith("_")) continue;
    const seg = e.name.startsWith("(") && e.name.endsWith(")") ? "" : `/${e.name}`;
    for (const r of rotasQueExistem(path.join(dir, e.name), prefixo + seg)) rotas.add(r);
  }
  return rotas;
}

const EXISTEM = rotasQueExistem(APP);

/**
 * Casa `/app/...` e `/admin/...` nas QUATRO formas em que um caminho aparece
 * neste repo — e as quatro são obrigatórias, medido:
 *
 *   href="/app/x"        JSX            ← a forma do usuário
 *   href={"/app/x"}      JSX expression
 *   href: "/app/x"       objeto         ← lib/navigation/registry.ts
 *   goto("/app/x")       chamada        ← specs de e2e
 *
 * A primeira versão era `(?:href|goto|push)\(?\s*["'\`]` — ela exigia `(` ou
 * espaço depois do nome e portanto NÃO casava `href="..."`, porque entre os dois
 * há um `=`. O resultado foi um invariante que pegava os `goto` dos specs e era
 * cego justamente para o link clicável — o defeito que motivou o arquivo.
 *
 * Só descobri porque sabotei: reintroduzir o `<Link href="/app/kanban">`
 * original deixava a suíte VERDE. Guarda que não reprova o caso que a originou
 * é decoração, e essa passa despercebida melhor que bug nenhum.
 */
const LINK =
  /(?:href|goto|push|replace|waitForURL)\s*[=(:]\s*\{?\s*["'`](\/(?:app|admin)[^"'`\s)}]*)/g;

function arquivosVarridos(dir: string, achados: string[] = []): string[] {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".")) continue;
      arquivosVarridos(path.join(dir, e.name), achados);
      continue;
    }
    if (/\.tsx?$/.test(e.name)) achados.push(path.join(dir, e.name));
  }
  return achados;
}

/**
 * Parte de que se tem certeza, e se ela foi TRUNCADA.
 *
 * A distinção decide a régua, e errá-la produz falso positivo — que é o que faz
 * um invariante ser desligado. Medido: `` `/admin/lgpd/requests/${row.id}` ``
 * trunca em `/admin/lgpd/requests`, caminho que não tem `page.tsx` nenhum. Exigir
 * rota exata ali acusaria um link PERFEITAMENTE VÁLIDO, porque
 * `/admin/lgpd/requests/[id]` existe e é ele quem a parte dinâmica completa.
 *
 * Truncado ⇒ basta existir alguma rota que COMECE com o prefixo.
 * Inteiro    ⇒ tem de casar uma rota, exata ou por segmento dinâmico.
 */
function parteEstatica(href: string): { alvo: string; truncado: boolean } {
  const cortes = [href.indexOf("${"), href.indexOf("?"), href.indexOf("#")].filter((i) => i >= 0);
  const corte = cortes.length > 0 ? Math.min(...cortes) : href.length;
  return {
    alvo: href.slice(0, corte).replace(/\/$/, "") || "/",
    truncado: cortes.length > 0,
  };
}

describe("link interno aponta para rota viva", () => {
  it("a varredura achou rotas — lista vazia é falha do instrumento", () => {
    expect(EXISTEM.size, "nenhuma rota encontrada em app/ — a varredura quebrou").toBeGreaterThan(
      40,
    );
    // Controle positivo nomeado: se estas duas sumirem, é o parser, não o repo.
    expect(EXISTEM.has("/app/inbox")).toBe(true);
    expect(EXISTEM.has("/app/pipelines")).toBe(true);
  });

  it("nenhum href ou goto estático aponta para rota inexistente", () => {
    const mortos: string[] = [];

    for (const abs of [
      ...arquivosVarridos(APP),
      ...arquivosVarridos(path.join(RAIZ, "components")),
      // `lib/` entra por causa de `lib/navigation/registry.ts`: ali o caminho
      // aparece como `href: "/app/x"`, e é a porta do MENU — link morto nele é
      // pior que num componente solto, porque some do sistema inteiro de uma vez.
      // Descoberto sabotando: sem esta linha, trocar uma href do registry por
      // rota inexistente deixava a suíte verde.
      ...arquivosVarridos(path.join(RAIZ, "lib")),
      ...arquivosVarridos(path.join(RAIZ, "tests", "e2e")),
    ]) {
      const rel = path.relative(RAIZ, abs).replace(/\\/g, "/");
      const fonte = readFileSync(abs, "utf8");
      for (const m of fonte.matchAll(LINK)) {
        const { alvo, truncado } = parteEstatica(m[1]!);
        if (EXISTEM.has(alvo)) continue;

        // Truncado: a parte dinâmica ainda pode completar uma rota real.
        if (truncado && [...EXISTEM].some((r) => r.startsWith(`${alvo}/`))) continue;

        // Segmento dinâmico: `/app/pipelines/abc` casa `/app/pipelines/[id]`.
        const partes = alvo.split("/").filter(Boolean);
        const casaDinamico = [...EXISTEM].some((r) => {
          const rp = r.split("/").filter(Boolean);
          if (rp.length !== partes.length) return false;
          return rp.every((s, i) => s.startsWith("[") || s === partes[i]);
        });
        if (casaDinamico) continue;

        mortos.push(`${rel} → ${alvo}${truncado ? "/…" : ""}`);
      }
    }

    expect(
      mortos,
      "estes links apontam para rotas que não existem (nenhum `page.tsx` " +
        "corresponde). Ou a rota foi removida/renomeada e o link ficou para trás, " +
        `ou o caminho está errado:\n  ${mortos.join("\n  ")}`,
    ).toEqual([]);
  });
});
