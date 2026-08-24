/**
 * Idempotência de POST, na tabela `idempotency_keys`.
 *
 * ═══ O DEFEITO QUE ISTO CONSERTA (medido lendo o código em 2026-08-24) ═══
 *
 * `lib/api/client.ts` já manda `Idempotency-Key` em TODO método mutante
 * (linha 116-117) e a chave é gerada ANTES do laço de tentativas — ou seja, as
 * 3 tentativas de um mesmo `post()` mandam a MESMA chave. Isso estava certo.
 *
 * O que faltava era o outro lado: `POST /api/v1/messages` nunca lia o header.
 * Como o client retenta em timeout (`DEFAULT_TIMEOUT_MS = 10_000`) e em erro de
 * rede, um envio lento vira **mensagem duplicada no WhatsApp do cliente** — o
 * pior desfecho possível num CRM de atendimento, porque quem paga o erro é o
 * contato do outro lado, não o operador.
 *
 * O `CLAUDE.md` já mandava aceitar o header ("POSTs de criação na API aceitam
 * header `Idempotency-Key`"), e `lib/mcp/tools/messages.ts` já implementava
 * exatamente isto em volta do MESMO `sendMessageHandler`. Este módulo é aquele
 * padrão extraído, para as duas portas do mesmo handler passarem a se comportar
 * igual em vez de só a do MCP estar protegida.
 *
 * ═══ O CUSTO, ASSUMIDO DE OLHOS ABERTOS ═══
 *
 * A consulta acrescenta UM round-trip (~150ms na produção medida) a todo envio.
 * Foi aceito porque o que ela compra é correção, não conforto — e porque o
 * mesmo commit tirou quatro round-trips do caminho (audit, emit_event, remoção
 * do eco e uma das duas queries de permissão). O saldo continua bem negativo.
 *
 * NÃO usa o Upstash apesar do CLAUDE.md citar "TTL 24h via Upstash": o Redis
 * responde em ~271ms daqui, quase o dobro do Postgres, e é a dependência mais
 * lenta do sistema. A tabela já existe, já tem `UNIQUE (organization_id, key,
 * endpoint)` e índice próprio (`idx_idem_lookup`).
 */
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";

/** 24h — o mesmo TTL que o MCP já praticava. */
const TTL_MS = 24 * 60 * 60 * 1000;

/** Limite defensivo: header é entrada externa, e vai para uma coluna de texto. */
const MAX_TAMANHO_CHAVE = 200;

export interface RespostaIdempotente<T> {
  body: T;
  statusCode: number;
}

export function hashDaRequisicao(input: unknown): string {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}

/**
 * Lê a chave do header, já validada.
 *
 * Devolve `null` quando ausente ou fora do formato — chave inválida vira
 * "sem idempotência", nunca erro 400: recusar o envio por causa do header
 * seria trocar um risco de duplicata por uma falha certa.
 */
export function chaveDoHeader(req: { headers: Headers }): string | null {
  const bruta = req.headers.get("Idempotency-Key") ?? req.headers.get("idempotency-key");
  if (!bruta) return null;
  const chave = bruta.trim();
  if (chave.length === 0 || chave.length > MAX_TAMANHO_CHAVE) return null;
  return chave;
}

/**
 * A resposta já dada para esta chave, se houver.
 *
 * ⚠️ `request_hash` é conferido: a mesma chave com corpo DIFERENTE não é
 * retentativa, é reuso indevido da chave (bug de cliente). Nesse caso devolve
 * `null` e o envio segue normalmente — melhor mandar a mensagem certa do que
 * responder com o eco de outra.
 */
export async function respostaJaDada<T>(
  supabase: SupabaseClient,
  params: { organizationId: string; endpoint: string; chave: string; requestHash: string },
): Promise<RespostaIdempotente<T> | null> {
  const { data, error } = await supabase
    .from("idempotency_keys")
    .select("response_body, status_code, request_hash")
    .eq("organization_id", params.organizationId)
    .eq("endpoint", params.endpoint)
    .eq("key", params.chave)
    .maybeSingle();

  // Falha de leitura NÃO bloqueia o envio: sem esta linha, uma instabilidade do
  // banco viraria "não consigo enviar mensagem". O risco que sobra é o de
  // antes desta função existir.
  if (error || !data) return null;
  if (data.request_hash && data.request_hash !== params.requestHash) return null;
  if (data.status_code == null) return null;

  return { body: data.response_body as T, statusCode: data.status_code };
}

/**
 * Guarda a resposta para as próximas tentativas — SEM esperar.
 *
 * Fire-and-forget de propósito: quem está esperando é o atendente com a
 * mensagem já enviada, e este INSERT só serve a uma retentativa que talvez
 * nunca venha. `23505` é ignorado porque significa que outra tentativa da mesma
 * chave chegou primeiro — que é exatamente o desfecho desejado.
 */
export function guardarResposta(
  supabase: SupabaseClient,
  params: {
    organizationId: string;
    endpoint: string;
    chave: string;
    requestHash: string;
    body: unknown;
    statusCode: number;
  },
): void {
  void supabase
    .from("idempotency_keys")
    .insert({
      organization_id: params.organizationId,
      endpoint: params.endpoint,
      key: params.chave,
      request_hash: params.requestHash,
      response_body: params.body as never,
      status_code: params.statusCode,
      expires_at: new Date(Date.now() + TTL_MS).toISOString(),
    })
    .then(({ error }) => {
      if (error && error.code !== "23505") {
        console.error("[idempotencia] não consegui guardar a resposta", error.message);
      }
    });
}
