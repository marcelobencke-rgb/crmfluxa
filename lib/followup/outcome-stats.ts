/**
 * Task 8.2 — agregação de outcomes de follow-up por fluxo (pointer+version),
 * org-scoped. O sinal bruto já existe (`followup_enrollments.outcome`,
 * gravado pelo engine/reactivity nas Ondas 4/5); este módulo só soma.
 *
 * Definições (ver check constraints do baseline, migration 0054):
 * - `in_flight` = enrollments vivos (status active/waiting_reply/paused_handoff);
 *   outcome é sempre null nesses estados.
 * - terminal (denominador de conversion_rate) = status completed OU cancelled.
 *   'dead' (worker desistiu por erro/max_attempts) é EXCLUÍDO do terminal de
 *   propósito — é falha de infra, não resultado do fluxo, e não deve puxar a
 *   taxa de conversão pra baixo.
 * - `conversion_rate` = converted / terminal; `null` quando terminal = 0
 *   (divisão por zero — nenhum enrollment terminou ainda pra esse fluxo).
 * - `total` = todos os enrollments do pointer/version (inclui `dead`, fora
 *   dos buckets de `counts`) — visibilidade bruta, não entra na taxa.
 */
import type pg from "pg";

export interface FlowOutcomeCounts {
  converted: number;
  replied: number;
  exhausted: number;
  opted_out: number;
  handoff: number;
  in_flight: number;
}

export interface FlowOutcomeStat {
  pointer_id: string;
  version_id: string;
  flow_name: string;
  counts: FlowOutcomeCounts;
  total: number;
  /** Denominador de `conversion_rate` — status completed OU cancelled. Exposto à
   *  parte de `counts` (que é só os buckets por `outcome`) porque enrollments
   *  `cancelled` sem outcome setado (ex.: `exclusivity_backfill`) são terminais
   *  sem caírem em nenhum bucket de `counts` — somar os buckets subestimaria. */
  terminal: number;
  conversion_rate: number | null;
}

interface OutcomeStatRow {
  pointer_id: string;
  version_id: string;
  flow_name: string;
  total: string;
  converted: string;
  replied: string;
  exhausted: string;
  opted_out: string;
  handoff: string;
  in_flight: string;
  terminal: string;
}

export async function aggregateFollowupOutcomes(pool: pg.Pool, orgId: string): Promise<FlowOutcomeStat[]> {
  const { rows } = await pool.query<OutcomeStatRow>(
    `select
       e.pointer_id,
       e.version_id,
       p.name as flow_name,
       count(*) as total,
       count(*) filter (where e.outcome = 'converted') as converted,
       count(*) filter (where e.outcome = 'replied') as replied,
       count(*) filter (where e.outcome = 'exhausted') as exhausted,
       count(*) filter (where e.outcome = 'opted_out') as opted_out,
       count(*) filter (where e.outcome = 'handoff') as handoff,
       count(*) filter (where e.status in ('active', 'waiting_reply', 'paused_handoff')) as in_flight,
       count(*) filter (where e.status in ('completed', 'cancelled')) as terminal
     from followup_enrollments e
     join followup_flow_pointers p on p.id = e.pointer_id
     where e.organization_id = $1
     group by e.pointer_id, e.version_id, p.name
     order by p.name, e.version_id`,
    [orgId],
  );

  return rows.map((row) => {
    const converted = Number(row.converted);
    const terminal = Number(row.terminal);
    return {
      pointer_id: row.pointer_id,
      version_id: row.version_id,
      flow_name: row.flow_name,
      counts: {
        converted,
        replied: Number(row.replied),
        exhausted: Number(row.exhausted),
        opted_out: Number(row.opted_out),
        handoff: Number(row.handoff),
        in_flight: Number(row.in_flight),
      },
      total: Number(row.total),
      terminal,
      conversion_rate: terminal > 0 ? converted / terminal : null,
    };
  });
}

export interface FlagForReviewOptions {
  /** Mínimo de enrollments terminais pra ter significância estatística — abaixo
   *  disso, 1 ou 2 conversões já movem a taxa inteira e a proposta seria ruído. */
  minTerminal?: number;
  /** `conversion_rate` estritamente abaixo disso é candidato a proposta. */
  maxConversionRate?: number;
}

const DEFAULT_MIN_TERMINAL = 20;
const DEFAULT_MAX_CONVERSION_RATE = 0.15;

/**
 * Task B.1 — critério PURO (sem I/O) de quais fluxos merecem virar proposta
 * do flywheel: volume terminal suficiente pra o número significar algo, E
 * conversion_rate abaixo do limiar. `conversion_rate === null` (zero
 * terminal) nunca é flagado — não há o que julgar ainda.
 */
export function flagFlowsForReview(
  stats: FlowOutcomeStat[],
  opts: FlagForReviewOptions = {},
): FlowOutcomeStat[] {
  const minTerminal = opts.minTerminal ?? DEFAULT_MIN_TERMINAL;
  const maxConversionRate = opts.maxConversionRate ?? DEFAULT_MAX_CONVERSION_RATE;
  return stats.filter(
    (s) => s.conversion_rate !== null && s.terminal >= minTerminal && s.conversion_rate < maxConversionRate,
  );
}
