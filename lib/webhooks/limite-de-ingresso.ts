/**
 * TETO DE REQUISIÇÕES NOS INGRESSOS PÚBLICOS (webhooks + MCP).
 *
 * ## O buraco que isto fecha
 *
 * `checkRateLimit` existia e era chamado em DOIS lugares: o webhook de captação
 * (`/webhooks/in/[token]`) e o dispatcher de IA. Ficavam sem teto nenhum os
 * ingressos de maior volume do produto — os webhooks do **WAHA** (por onde entra
 * tudo que o cliente manda), da **Meta**, da **Nuvemshop** e o **`/api/mcp`**.
 * Todos são públicos por `public-paths.ts`, ou seja, alcançáveis por qualquer um.
 *
 * ## Por que o balde é o TOKEN, e não o IP
 *
 * `lib/auth/rate-limit.ts` pagou caro para descobrir que teto por IP quase não
 * funciona neste produto: o kit self-host expõe o app direto, sem proxy, então
 * `x-forwarded-for` não existe na instalação padrão. Lá, a saída foi não aplicar
 * teto por IP quando não há IP (balde global compartilhado seria DoS de custo
 * zero contra a própria empresa).
 *
 * Aqui o problema não aparece: todo ingresso destes traz um identificador no
 * próprio caminho ou no header — o `path_token` do canal, o bearer do MCP. Ele é
 * mais estável que IP, não é forjável sem já conhecer o segredo, e isola quem
 * abusa sem encostar em ninguém.
 *
 * ## Por que ANTES de qualquer consulta ao banco
 *
 * No webhook do WAHA, a busca da sessão pelo `webhook_path_token` acontecia antes
 * da checagem de HMAC, e as respostas distinguem 404 (token não existe) de 401
 * (token existe, assinatura errada). Isso é um oráculo de enumeração em que cada
 * tentativa custa uma query e um decrypt — de graça, sem teto. Chamar o limite
 * antes da consulta tira as duas coisas: o custo por tentativa e o volume delas.
 *
 * ## Os tetos são generosos de propósito
 *
 * O alvo é enxurrada, não tráfego real. A doutrina anti-banimento já limita o
 * ENVIO a 1 msg/1,2s; o recebimento de uma organização movimentada fica ordens de
 * grandeza abaixo de 600/min. Teto apertado aqui derrubaria mensagem de cliente,
 * que é o pior desfecho possível deste arquivo — pior que o abuso que ele barra.
 *
 * Sobrescrevíveis por `.env` porque o volume legítimo varia com o tamanho da
 * instalação, e quem hospeda é quem sabe o dele. Lidos de `process.env` cru, como
 * `AUTH_RATE_LIMIT_*` já faz.
 */

import { createHash } from "node:crypto";

import { fail } from "@/lib/api/wrappers";
import { checkRateLimit } from "@/lib/ai/dispatcher/rate-limit";

function teto(envVar: string, padrao: number): number {
  const cru = Number(process.env[envVar]);
  return Number.isFinite(cru) && cru > 0 ? cru : padrao;
}

export const TETOS = {
  /** Ingestão do WhatsApp: o de maior volume, e o que não pode barrar cliente. */
  waha: () => teto("WEBHOOK_RATE_LIMIT_WAHA", 600),
  meta: () => teto("WEBHOOK_RATE_LIMIT_META", 600),
  nuvemshop: () => teto("WEBHOOK_RATE_LIMIT_NUVEMSHOP", 300),
  /** MCP é server-to-server autenticado: volume menor, e cada chamada custa IA. */
  mcp: () => teto("MCP_RATE_LIMIT", 120),
} as const;

/**
 * Nunca use o segredo em claro como chave — ela vai para o Redis e para o log de
 * diagnóstico. O hash isola igual e não vaza credencial.
 */
export function baldeOpaco(valor: string): string {
  return createHash("sha256").update(valor).digest("hex").slice(0, 32);
}

/**
 * Devolve uma resposta 429 pronta quando o teto estourou, ou `null` para seguir.
 *
 * O formato do 429 segue o contrato da API (`fail` + `Retry-After`), o mesmo que
 * `/webhooks/in/[token]` já devolvia — um ingresso novo não inventa formato
 * próprio de erro.
 */
export async function ingressoLimitado(
  balde: string,
  limite: number,
  janelaSeg = 60,
  requestId?: string,
): Promise<Response | null> {
  const rl = await checkRateLimit(balde, limite, janelaSeg);
  if (rl.allowed) return null;
  return fail("rate_limited", "Too many requests.", 429, {
    requestId,
    headers: { "Retry-After": String(janelaSeg) },
  });
}
