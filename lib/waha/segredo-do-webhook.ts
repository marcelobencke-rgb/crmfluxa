/**
 * O segredo HMAC do webhook, decifrado no máximo uma vez por valor.
 *
 * ═══ O QUE ISTO TIRA DO CAMINHO ═══
 *
 * As duas rotas de webhook do WAHA chamavam a RPC `fn_decrypt_oauth` em TODO
 * request, para decifrar um segredo que só muda quando alguém rotaciona o
 * canal — na prática, quase nunca. Era um round-trip ao Postgres (~150ms na
 * produção medida em 2026-08-24) por mensagem recebida, e ele acontece ANTES
 * do INSERT em `messages`, ou seja, dentro da janela que o atendente sente:
 * a linha só existe (e o realtime só dispara) depois que ele termina.
 *
 * ═══ POR QUE A CHAVE DO CACHE É O CIFRADO, E NÃO O ID DA SESSÃO ═══
 *
 * Cachear por `channel_session_id` com TTL criaria uma janela real de defeito:
 * durante o TTL, um segredo ROTACIONADO continuaria sendo validado contra o
 * valor velho — e o modo de falha seria autenticação, o pior lugar para uma
 * leitura obsoleta. Com o próprio ciphertext como chave, a rotação troca a
 * chave do cache junto: o valor novo simplesmente não tem entrada e é
 * decifrado. Não existe estado velho alcançável, então não existe TTL a
 * ajustar nem invalidação a lembrar de chamar.
 *
 * O cache é por processo (não compartilhado entre réplicas) e isso basta:
 * cada réplica paga uma decifração por segredo, uma vez.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Teto de entradas. Cada uma é um par de strings curtas, e o número de canais
 * por instalação é pequeno — o limite existe só para o mapa não virar
 * vazamento se um dia chegar cifrado variável (payload malformado, por
 * exemplo). Ao estourar, o mapa é esvaziado inteiro: é um cache, reconstruir
 * custa uma decifração por canal vivo.
 */
const TETO = 512;

const cache = new Map<string, string>();

/** Só para teste — o mapa é global de propósito. */
export function __limparCacheDeSegredo(): void {
  cache.clear();
}

/**
 * Devolve o segredo em claro, ou `null` quando não dá para decifrar.
 *
 * `null` é o mesmo desfecho que o código anterior produzia em erro, e o
 * chamador já o trata como "sem segredo" — `authenticateWahaWebhook` é
 * fail-closed e recusa o webhook. Falha NÃO é cacheada: um erro transitório da
 * RPC não pode condenar o canal até o processo reiniciar.
 */
export async function segredoDoWebhook(
  admin: SupabaseClient,
  ciphertext: unknown,
): Promise<string | null> {
  if (typeof ciphertext !== "string" || ciphertext.length === 0) return null;

  const emCache = cache.get(ciphertext);
  if (emCache !== undefined) return emCache;

  let claro: string | null = null;
  try {
    const dec = await admin.rpc("fn_decrypt_oauth", { ciphertext });
    if (!dec.error && typeof dec.data === "string") claro = dec.data;
  } catch {
    claro = null;
  }

  if (claro === null) return null;

  if (cache.size >= TETO) cache.clear();
  cache.set(ciphertext, claro);
  return claro;
}
