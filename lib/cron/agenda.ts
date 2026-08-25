/**
 * A AGENDA DECLARADA DOS CRONS — quem deveria rodar, e de quanto em quanto tempo.
 *
 * ## Por que isto existe em TypeScript se o crontab já existe no compose
 *
 * Para decidir que um cron está atrasado é preciso saber o intervalo esperado
 * dele, e esse número só existia dentro de um heredoc de shell no
 * `docker-compose.prod.yml`. Código de aplicação não lê heredoc de shell em
 * runtime, então a alternativa seria um "atrasado" com número mágico único para
 * todos — que classificaria `sync-model-catalog` (diário) como atrasado toda
 * hora, e não veria `event-log-drain` (de minuto em minuto) parado por meia hora.
 *
 * ## Duplicação com dono declarado, vigiada por teste
 *
 * Isto É duplicação, e o anti-pattern nº 2 do CLAUDE.md proíbe duplicação SEM
 * source of truth declarado. O dono aqui é o `docker-compose.prod.yml`: é ele que
 * o `crond` obedece, e é ele que manda. Esta tabela é uma projeção.
 *
 * O que impede as duas de divergirem em silêncio é
 * `tests/unit/cron-agenda-bate-com-o-compose.test.ts`, que compara nos DOIS
 * sentidos — linha do crontab sem entrada aqui, e entrada aqui sem linha lá.
 * Mesmo remédio que `e2e-cobertura-completa` aplica às listas de spec do
 * workflow, e pelo mesmo motivo: a divergência entre duas listas escritas à mão
 * é invisível até o dia em que custa caro.
 *
 * ## `NAO_AGENDADO` não é esquecimento
 *
 * `agent-dispatcher` tem rota e NÃO tem linha no crontab: virou NO-OP deprecado
 * na Fase 0 e batia de minuto em minuto só para responder `{skipped:true}`. Quem
 * consome `ai_agent.dispatch_requested` é o processo `agent-worker`, em drain
 * contínuo. A rota segue de pé para não quebrar a config de self-hoster que ainda
 * a chame — e por isso precisa estar declarada aqui como deliberadamente sem
 * agenda, senão o teste a acusaria como cron perdido para sempre.
 */

/** Segundos entre execuções, como o crontab manda. */
export const AGENDA: Record<string, number> = {
  // * * * * *
  "followup-flow-worker": 60,
  "event-log-drain": 60,
  "routing-worker": 60,
  "recover-stuck-messages": 60,
  // */5 * * * *
  "storage-redaction": 300,
  "snooze-watcher": 300,
  "attendant-heartbeat": 300,
  // */10 * * * *
  "contact-avatars": 600,
  // */15 * * * *
  "risk-watcher": 900,
  "calendar-sync-poll": 900,
  // 17 * * * *
  "contact-proposals-watcher": 3600,
  // diários
  "lgpd-sla-watcher": 86400,
  "kb-conversations-batch": 86400,
  "sync-model-catalog": 86400,
  "scheduled-reports": 86400,
};

/**
 * Rotas de cron que existem de propósito SEM linha no crontab. Toda entrada
 * carrega o porquê — é o que separa decisão registrada de esquecimento.
 */
export const NAO_AGENDADO: Record<string, string> = {
  "agent-dispatcher":
    "NO-OP deprecado desde a Fase 0 — respondia {skipped:true}. Quem consome ai_agent.dispatch_requested é o processo agent-worker (workers/agent-worker/main.ts), em drain contínuo. A rota fica de pé para não quebrar config de self-hoster que ainda a chame",
};

/**
 * TOLERÂNCIA ANTES DE CHAMAR DE ATRASADO.
 *
 * Três vezes o intervalo, com piso de 5 minutos. Os dois números têm razão:
 *
 * - **3×** porque uma rodada perdida é ruído normal (deploy, reinício do
 *   contêiner, uma execução que passou do `-m` do curl). Duas seguidas ainda
 *   podem ser azar. Três é padrão.
 * - **piso de 5 min** porque os crons de minuto têm tolerância de 3 minutos, e
 *   um `docker compose up -d` demora mais que isso — sem o piso, todo deploy
 *   acenderia alarme falso. Alarme que toca sem defeito é desligado, e leva
 *   junto o que funcionava.
 */
export function limiteDeAtraso(intervaloSeg: number): number {
  return Math.max(intervaloSeg * 3, 300);
}
