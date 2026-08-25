/**
 * A AGENDA DECLARADA E O CRONTAB REAL NÃO PODEM DIVERGIR EM SILÊNCIO.
 *
 * ## O defeito que este arquivo impede
 *
 * `lib/cron/agenda.ts` guarda o intervalo esperado de cada cron, e é ele que
 * decide o que conta como "atrasado". O crontab de verdade — o que o `crond`
 * obedece — vive num heredoc de shell dentro do `docker-compose.prod.yml`. São
 * duas listas escritas à mão sobre o mesmo fato, e o anti-pattern nº 2 do
 * CLAUDE.md só admite duplicação com dono declarado. O dono é o compose; a
 * agenda é projeção. Isto aqui é o que mantém a projeção honesta.
 *
 * Os dois modos de divergir têm consequências diferentes, e por isso são casos
 * separados:
 *
 *  1. **Cron no compose e fora da agenda** → ele nunca é classificado como
 *     atrasado. É o pior dos dois: o job roda em produção, para um dia, e o
 *     detector que existe para avisar não sabe que ele existia. Foi exatamente
 *     assim que a cobertura de e2e apodreceu duas vezes (ver
 *     `e2e-cobertura-completa`), e é o mesmo remédio.
 *  2. **Cron na agenda e fora do compose** → alarme falso permanente: o health
 *     reporta "parou" para algo que nunca foi agendado. Alarme que toca sem
 *     defeito é desligado, e leva junto o alarme verdadeiro.
 *
 * ## Por que estático, e por que aqui
 *
 * A propriedade é enumerável a partir do repositório — linhas do heredoc ×
 * chaves do objeto — e `tests/unit/` roda no check `verify`, que é OBRIGATÓRIO
 * na branch protection. Em `tests/invariants/` dependeria de Postgres e de um
 * job que não bloqueia merge.
 */
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { AGENDA, NAO_AGENDADO, limiteDeAtraso } from "@/lib/cron/agenda";

const RAIZ = process.cwd();

/**
 * CRLF normalizado na leitura — mesma lição de `e2e-cobertura-completa`: num
 * checkout Windows com `core.autocrlf=true` o `.` do JavaScript não consome
 * `\r`, e o parser voltaria vazio fazendo o teste reprovar pelo sistema
 * operacional de quem rodou, não pelo conteúdo do arquivo.
 */
const COMPOSE = readFileSync(path.join(RAIZ, "docker-compose.prod.yml"), "utf8").replace(
  /\r\n/g,
  "\n",
);

/** Converte os campos de minuto/hora que o crontab deste projeto usa em segundos. */
function intervaloEmSegundos(minuto: string, hora: string): number | null {
  if (minuto === "*") return 60;
  const aCada = /^\*\/(\d+)$/.exec(minuto);
  if (aCada) return Number(aCada[1]) * 60;
  // Minuto fixo: de hora em hora se a hora é `*`, senão uma vez por dia.
  if (/^\d+$/.test(minuto)) return hora === "*" ? 3600 : 86400;
  return null;
}

/** Lê as linhas de `curl` do heredoc e devolve `job_name → intervalo (s)`. */
function crontabDoCompose(): Record<string, number> {
  const achados: Record<string, number> = {};
  for (const linha of COMPOSE.split("\n")) {
    const t = linha.trim();
    if (t.startsWith("#") || !t.includes("/api/v1/cron/")) continue;
    const campos = t.split(/\s+/);
    const rota = /\/api\/v1\/cron\/([a-z0-9-]+)/.exec(t);
    if (!rota) continue;
    const seg = intervaloEmSegundos(campos[0] ?? "", campos[1] ?? "");
    if (seg === null) continue;
    achados[rota[1]!] = seg;
  }
  return achados;
}

const NO_COMPOSE = crontabDoCompose();
const NO_DISCO = readdirSync(path.join(RAIZ, "app", "api", "v1", "cron"), {
  withFileTypes: true,
})
  .filter((e) => e.isDirectory())
  .map((e) => e.name)
  .sort();

describe("agenda de cron × crontab do compose", () => {
  it("o parser está vivo — controle positivo antes de qualquer conclusão", () => {
    // Sem isto, um heredoc reescrito faria `crontabDoCompose()` devolver `{}` e
    // as duas asserções abaixo passariam por vacuidade: nenhuma divergência
    // porque nenhuma lista. Mesmo raciocínio de `e2e-cobertura-completa`.
    expect(
      Object.keys(NO_COMPOSE).length,
      "o parser não achou linha de cron no docker-compose.prod.yml — a forma do " +
        "heredoc mudou e este arquivo parou de medir qualquer coisa",
    ).toBeGreaterThan(10);
  });

  it("todo cron do compose tem intervalo declarado na agenda", () => {
    const semAgenda = Object.keys(NO_COMPOSE).filter((n) => !(n in AGENDA)).sort();
    expect(
      semAgenda,
      "estes rodam em produção mas não têm intervalo em lib/cron/agenda.ts — " +
        "nunca serão classificados como atrasados, e o detector não vai saber que " +
        `existiam quando pararem:\n  ${semAgenda.join("\n  ")}`,
    ).toEqual([]);
  });

  it("toda entrada da agenda existe no compose com o MESMO intervalo", () => {
    const divergentes = Object.entries(AGENDA)
      .filter(([nome, seg]) => NO_COMPOSE[nome] !== seg)
      .map(([nome, seg]) => `${nome}: agenda=${seg}s compose=${NO_COMPOSE[nome] ?? "ausente"}`)
      .sort();
    expect(
      divergentes,
      "a agenda promete um intervalo que o crontab não cumpre. Ausente = alarme " +
        `falso permanente; diferente = janela de atraso errada:\n  ${divergentes.join("\n  ")}`,
    ).toEqual([]);
  });

  it("toda rota de cron no disco está agendada ou declarada como sem agenda", () => {
    const orfas = NO_DISCO.filter((n) => !(n in AGENDA) && !(n in NAO_AGENDADO));
    expect(
      orfas,
      "rota de cron que ninguém agenda e ninguém declarou como deliberadamente " +
        "sem agenda. Ponha em AGENDA (com o intervalo do compose) ou em " +
        `NAO_AGENDADO COM o motivo escrito:\n  ${orfas.join("\n  ")}`,
    ).toEqual([]);
  });

  it("NAO_AGENDADO não abriga cron que voltou ao crontab", () => {
    // Se alguém reagendar `agent-dispatcher`, a justificativa escrita vira
    // mentira e o job passa a rodar sem vigilância — silenciosamente.
    const contradicao = Object.keys(NAO_AGENDADO).filter((n) => n in NO_COMPOSE);
    expect(
      contradicao,
      `estes estão no crontab mas declarados como sem agenda:\n  ${contradicao.join("\n  ")}`,
    ).toEqual([]);
  });

  it("a tolerância nunca é menor que o intervalo — senão todo cron nasce atrasado", () => {
    for (const [nome, seg] of Object.entries(AGENDA)) {
      expect(limiteDeAtraso(seg), `${nome}`).toBeGreaterThan(seg);
    }
  });
});
