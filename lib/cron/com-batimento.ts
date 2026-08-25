/**
 * Embrulha um handler de cron para que ele registre o próprio batimento.
 *
 * Fica separado de `lib/cron/heartbeat.ts` porque as 16 rotas importam ISTO, e
 * `heartbeat.ts` também carrega `cronsAtrasados` — que só o `/api/v1/health`
 * usa. Um arquivo por lado da fronteira mantém o import de cada rota estreito.
 *
 * ## SÓ CHAMADA AUTENTICADA BATE PONTO
 *
 * A primeira versão gravava o batimento de qualquer requisição, e o raciocínio
 * escrito aqui era que "o crond BATEU na porta, que é o que se quer detectar".
 * Está errado, e de um jeito que anula o detector inteiro: as rotas de cron são
 * públicas (`public-paths.ts`), então **qualquer pessoa na internet manteria o
 * batimento fresco com o `scheduler` morto**. O alarme que este épico existe
 * para acender ficaria permanentemente apagado, e por ação de terceiro.
 *
 * De carona, gravar antes de conferir o segredo dava a um anônimo uma escrita no
 * banco por requisição — amplificação barata para quem quiser fazer barulho.
 *
 * Segredo errado ⇒ não bate ponto, e o handler devolve o 403 dele como sempre.
 *
 * ## O que conta como "rodou"
 *
 * Com o segredo certo, o batimento é gravado **depois** do handler responder:
 *
 *  - status < 500 → `ok`
 *  - status 5xx ou exceção → `error`, com a mensagem.
 *
 * ## Não altera o que o cron devolve
 *
 * A resposta do handler passa intacta, inclusive quando ele lança: a exceção é
 * registrada e RELANÇADA. Um wrapper que engolisse erro para "proteger" o
 * batimento transformaria falha de cron em sucesso silencioso — exatamente o
 * defeito que este épico existe para acabar.
 */

import type { NextRequest } from "next/server";

import { baterPonto } from "@/lib/cron/heartbeat";
import { logger } from "@/lib/logger";
import { segredoDeCronConfere } from "@/lib/cron/segredo";
import { createAdminClient } from "@/lib/supabase/admin";

type Handler = (req: NextRequest) => Promise<Response>;

export function comBatimento(jobName: string, handler: Handler): Handler {
  return async (req: NextRequest): Promise<Response> => {
    // Conferido ANTES de rodar, mas usado só DEPOIS: o handler não pode ter o
    // comportamento alterado por este wrapper — ele faz o próprio gate e devolve
    // o próprio 403. Aqui só se decide se o batimento conta.
    const autenticado = segredoDeCronConfere(req);
    const t0 = Date.now();

    // `createAdminClient()` fica atrás do `autenticado`: construir o client de
    // service role para uma requisição anônima é trabalho e superfície à toa.
    const registrar = async (ok: boolean, erro?: string): Promise<void> => {
      if (!autenticado) return;
      try {
        // `createAdminClient()` LANÇA quando falta env de Supabase (é o que ele
        // deve fazer). Mas isso não pode derrubar o cron: ele já fez o trabalho,
        // e falhar ao anotar o batimento transformaria bookkeeping em falha de
        // produção. `baterPonto` protege o INSERT; o `try` daqui protege a
        // construção do client, que acontece antes de ele ser chamado.
        await baterPonto(createAdminClient(), jobName, {
          ok,
          duracaoMs: Date.now() - t0,
          erro,
        });
      } catch (bookkeepingErr) {
        logger.warn("[cron.batimento] não foi possível registrar o batimento", {
          job_name: jobName,
          error:
            bookkeepingErr instanceof Error ? bookkeepingErr.message : String(bookkeepingErr),
        });
      }
    };

    try {
      const res = await handler(req);
      await registrar(res.status < 500, res.status >= 500 ? `http_${res.status}` : undefined);
      return res;
    } catch (err) {
      await registrar(false, err instanceof Error ? err.message : String(err));
      throw err;
    }
  };
}
