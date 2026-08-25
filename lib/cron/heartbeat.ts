/**
 * BATIMENTO DE CRON — registrar que rodou, e derivar quem parou.
 *
 * ## O paradoxo que decide o desenho
 *
 * A tentação é criar um cron-vigia que varre os batimentos e abre o aviso. Ele
 * não funciona, e falha exatamente no caso que importa: quando o `scheduler`
 * morre, NENHUM cron roda — inclusive o vigia. O detector morre junto com o que
 * ele detectaria, e o silêncio dele é indistinguível de "está tudo bem".
 *
 * Por isso `cronsAtrasados()` **não escreve nada e não é agendado**: é derivação
 * em tempo de LEITURA. Quem pergunta é quem já está vivo por outro motivo — o
 * `/api/v1/health` (chamado por monitor externo, load balancer, ou pelo próprio
 * operador). Um observador de fora do sistema é a única coisa que continua
 * funcionando quando o de dentro para.
 *
 * É a mesma razão pela qual um dead-man's-switch de verdade vive fora da máquina
 * que ele vigia.
 *
 * ## Por que o batimento nunca derruba o cron
 *
 * `baterPonto` engole os próprios erros. Um cron que fizesse o trabalho certo e
 * falhasse ao registrar o batimento seria reportado como quebrado — e trocaria
 * uma falha invisível por um alarme falso, que é pior: alarme falso é desligado,
 * e leva junto o alarme verdadeiro.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { AGENDA, limiteDeAtraso } from "@/lib/cron/agenda";
import { logger } from "@/lib/logger";

type Admin = ReturnType<typeof createAdminClient>;

export interface CronAtrasado {
  job_name: string;
  intervalo_seg: number;
  /** `null` = nunca bateu ponto desde que a tabela existe. */
  ultimo_batimento: string | null;
  atrasado_ha_seg: number | null;
  motivo: "nunca_rodou" | "parou" | "falhando";
  consecutive_errors: number;
}

/**
 * Registra que este cron rodou. Chamado no fim do handler, com o desfecho.
 *
 * Upsert por `job_name`: uma linha por cron, sempre a mais recente. Histórico
 * não entra aqui de propósito — a pergunta é "está vivo AGORA", e guardar toda
 * execução de um cron de minuto criaria 1.440 linhas por dia por job que ninguém
 * lê. Quem quiser histórico tem o log estruturado.
 */
export async function baterPonto(
  admin: Admin,
  jobName: string,
  desfecho: { ok: boolean; duracaoMs: number; erro?: string },
): Promise<void> {
  try {
    // `consecutive_errors` precisa do valor anterior para incrementar, e o
    // PostgREST não faz `col = col + 1`. Uma leitura a mais num caminho que roda
    // no máximo uma vez por minuto é barato; um RPC só para isto seria função
    // nova em `public` (com o ritual de revoke que a doutrina exige) para
    // economizar um round-trip que ninguém está esperando.
    const { data: atual } = await admin
      .from("cron_heartbeat")
      .select("consecutive_errors, run_count")
      .eq("job_name", jobName)
      .maybeSingle();

    const errosSeguidos = desfecho.ok ? 0 : ((atual?.consecutive_errors ?? 0) as number) + 1;

    await admin.from("cron_heartbeat").upsert(
      {
        job_name: jobName,
        last_run_at: new Date().toISOString(),
        last_status: desfecho.ok ? "ok" : "error",
        last_duration_ms: Math.round(desfecho.duracaoMs),
        last_error: desfecho.ok ? null : (desfecho.erro ?? "").slice(0, 500),
        consecutive_errors: errosSeguidos,
        run_count: ((atual?.run_count ?? 0) as number) + 1,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "job_name" },
    );
  } catch (err) {
    // NUNCA propaga — ver o cabeçalho. O cron fez o trabalho dele; falhar ao
    // anotar isso não pode virar falha do trabalho.
    logger.warn("[cron.heartbeat] não foi possível registrar o batimento", {
      job_name: jobName,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Quem deveria ter rodado e não rodou — derivado, nunca armazenado.
 *
 * Um job sem linha nenhuma conta como `nunca_rodou`, e isso é deliberado: numa
 * instalação recém-atualizada é o estado legítimo por uma rodada, mas numa
 * instalação em que o `scheduler` nunca subiu é O defeito — e é justamente o que
 * o self-hoster não descobre sozinho. Deixar de reportar por ser ambíguo seria
 * escolher o silêncio de novo.
 */
export async function cronsAtrasados(admin: Admin): Promise<CronAtrasado[]> {
  const { data, error } = await admin
    .from("cron_heartbeat")
    .select("job_name, last_run_at, last_status, consecutive_errors");

  if (error) throw new Error(`[cron.heartbeat] leitura falhou: ${error.message}`);

  const porNome = new Map(
    (data ?? []).map((r) => [
      r.job_name as string,
      r as { last_run_at: string; last_status: string; consecutive_errors: number },
    ]),
  );

  const agora = Date.now();
  const atrasados: CronAtrasado[] = [];

  for (const [jobName, intervaloSeg] of Object.entries(AGENDA)) {
    const linha = porNome.get(jobName);

    if (!linha) {
      atrasados.push({
        job_name: jobName,
        intervalo_seg: intervaloSeg,
        ultimo_batimento: null,
        atrasado_ha_seg: null,
        motivo: "nunca_rodou",
        consecutive_errors: 0,
      });
      continue;
    }

    const desdeSeg = Math.round((agora - new Date(linha.last_run_at).getTime()) / 1000);
    const passouDoLimite = desdeSeg > limiteDeAtraso(intervaloSeg);

    // "Roda e falha" é reportado mesmo dentro do prazo: o scheduler está vivo,
    // então o silêncio de atraso nunca chegaria — e o trabalho não está sendo
    // feito do mesmo jeito. Dois defeitos, duas ações, um lugar só para ver.
    const falhandoSempre = linha.consecutive_errors >= 3;

    if (passouDoLimite || falhandoSempre) {
      atrasados.push({
        job_name: jobName,
        intervalo_seg: intervaloSeg,
        ultimo_batimento: linha.last_run_at,
        atrasado_ha_seg: desdeSeg,
        motivo: passouDoLimite ? "parou" : "falhando",
        consecutive_errors: linha.consecutive_errors,
      });
    }
  }

  return atrasados;
}
