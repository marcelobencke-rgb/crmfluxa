/**
 * O PAINEL NÃO PODE ESTREAR VERMELHO SEM DEFEITO.
 *
 * `cron_heartbeat` nasce vazia. A primeira versão de `cronsAtrasados()` reportava
 * job sem linha como `nunca_rodou` imediatamente — correto para os crons de
 * minuto (a linha aparece em segundos), e errado para os quatro DIÁRIOS, que
 * ficariam como alerta crítico no painel do admin por até 24h depois do deploy
 * sem nada quebrado.
 *
 * A migration 0153 grava um marco (`__referencia_de_instalacao`) e a derivação
 * passa a contar a tolerância de cada job a partir dele. Este arquivo guarda os
 * TRÊS estados que a mudança criou, porque acertar um e errar outro é o modo de
 * falha real:
 *
 *  1. **Estreia** — marco recente, nenhum batimento: silêncio.
 *  2. **Scheduler morto** — marco antigo, nenhum batimento: alarme.
 *  3. **Sem marco** — clone que aplicou a 0152 e não a 0153: alarme na hora
 *     (comportamento anterior; preferir alarme falso ao silêncio quando não se
 *     sabe desde quando se mede).
 *
 * O caso 2 é o que impede o conserto de virar mordaça: seria fácil "resolver" a
 * estreia calando job sem linha para sempre, e aí o defeito que o épico inteiro
 * existe para pegar — scheduler que nunca subiu — ficaria invisível.
 */
import { describe, expect, it } from "vitest";

import { cronsAtrasados } from "@/lib/cron/heartbeat";
import { AGENDA } from "@/lib/cron/agenda";

type Linha = {
  job_name: string;
  last_run_at: string;
  last_status: string;
  consecutive_errors: number;
};

/** Admin mínimo: `from().select()` resolve com as linhas dadas. */
function adminCom(linhas: Linha[]) {
  return {
    from: () => ({
      select: async () => ({ data: linhas, error: null }),
    }),
  } as unknown as Parameters<typeof cronsAtrasados>[0];
}

function haSegundos(seg: number): string {
  return new Date(Date.now() - seg * 1000).toISOString();
}

const MARCO = "__referencia_de_instalacao";
const DIARIO = "sync-model-catalog";
const DE_MINUTO = "event-log-drain";

describe("estreia do batimento de cron", () => {
  it("a agenda tem os dois extremos que este arquivo assume", () => {
    // Controle positivo: se alguém mudar os intervalos, os casos abaixo passam a
    // medir outra coisa sem avisar.
    expect(AGENDA[DIARIO], `${DIARIO} deveria ser diário`).toBe(86400);
    expect(AGENDA[DE_MINUTO], `${DE_MINUTO} deveria ser de minuto`).toBe(60);
  });

  it("1. estreia: marco recente e nenhum batimento não acende alarme nenhum", async () => {
    const atrasados = await cronsAtrasados(
      adminCom([
        { job_name: MARCO, last_run_at: haSegundos(30), last_status: "ok", consecutive_errors: 0 },
      ]),
    );
    expect(
      atrasados,
      "instalação que acabou de subir não tem cron atrasado — ela tem cron que " +
        "ainda não teve a vez dele",
    ).toEqual([]);
  });

  it("1b. estreia: o cron de MINUTO já cobra depois de 3 minutos, o diário não", async () => {
    // 10 min: passou da tolerância do de-minuto (3 min) e está longe da do
    // diário (3 dias). É a distinção inteira que a 0153 introduziu.
    const atrasados = await cronsAtrasados(
      adminCom([
        { job_name: MARCO, last_run_at: haSegundos(600), last_status: "ok", consecutive_errors: 0 },
      ]),
    );
    const nomes = atrasados.map((c) => c.job_name);
    expect(nomes).toContain(DE_MINUTO);
    expect(
      nomes,
      "10 minutos depois do deploy, um cron DIÁRIO ainda não deve nada a ninguém",
    ).not.toContain(DIARIO);
  });

  it("2. scheduler morto: marco antigo e nenhum batimento acende — inclusive o diário", async () => {
    // 4 dias: venceu até a tolerância dos diários (3×86400).
    const atrasados = await cronsAtrasados(
      adminCom([
        {
          job_name: MARCO,
          last_run_at: haSegundos(4 * 86400),
          last_status: "ok",
          consecutive_errors: 0,
        },
      ]),
    );
    expect(
      atrasados.length,
      "o conserto da estreia não pode virar mordaça: scheduler que nunca subiu " +
        "é o defeito que este épico existe para pegar",
    ).toBe(Object.keys(AGENDA).length);
    expect(atrasados.every((c) => c.motivo === "nunca_rodou")).toBe(true);
  });

  it("3. sem marco (0152 sem 0153): reporta na hora, como antes", async () => {
    const atrasados = await cronsAtrasados(adminCom([]));
    expect(atrasados.length).toBe(Object.keys(AGENDA).length);
  });

  it("o marco não vira item de painel", async () => {
    const atrasados = await cronsAtrasados(
      adminCom([
        {
          job_name: MARCO,
          last_run_at: haSegundos(4 * 86400),
          last_status: "ok",
          consecutive_errors: 0,
        },
      ]),
    );
    expect(
      atrasados.map((c) => c.job_name),
      "a linha reservada não é job e não pode aparecer como alerta",
    ).not.toContain(MARCO);
  });

  it("job com batimento em dia continua silencioso mesmo com marco antigo", async () => {
    const atrasados = await cronsAtrasados(
      adminCom([
        {
          job_name: MARCO,
          last_run_at: haSegundos(4 * 86400),
          last_status: "ok",
          consecutive_errors: 0,
        },
        {
          job_name: DE_MINUTO,
          last_run_at: haSegundos(10),
          last_status: "ok",
          consecutive_errors: 0,
        },
      ]),
    );
    expect(atrasados.map((c) => c.job_name)).not.toContain(DE_MINUTO);
  });
});
