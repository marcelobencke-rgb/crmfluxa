/**
 * O QUE FAZER QUANDO A INGESTÃO DO WEBHOOK DO WAHA FALHA.
 *
 * ## O defeito que isto substitui
 *
 * Os dois handlers de webhook (`/webhooks/waha` e `/webhooks/waha/[token]`)
 * terminavam assim:
 *
 *     try {
 *       await dispatchWahaEvent(admin, session, envelope, requestId);
 *     } catch (err) {
 *       logger.error("[waha.webhook] handler failed", { error: err instanceof Error ? err.message : String(err) });
 *     }
 *     return ok({ accepted: true }, { requestId });
 *
 * Quatro consequências, todas invisíveis:
 *
 *  1. **O WAHA nunca reentrega.** `200 accepted:true` é, no protocolo dele, a
 *     confirmação de que o evento foi processado. A mensagem morre ali.
 *  2. **Não vai ao Sentry.** `console.error` num contêiner vai para o stdout e
 *     evapora: sem `request_id`, sem tenant, sem nível, sem retenção.
 *  3. **Não abre aviso na Central.** O dono do negócio não tem como saber.
 *  4. **Não deixa marca em lugar nenhum.** É o que separa este defeito dos dois
 *     primos que a Central já cobre: `message_send_stuck` (0109) deixava a
 *     bolha eternamente "enviando" e `midia_nao_lida` (0129) deixava o agente
 *     mudo — errados, mas VISÍVEIS. Aqui o sistema parecia ocioso, e o sintoma
 *     só chegava pela boca do cliente: "mandei e ninguém respondeu".
 *
 * ## Por que 500 e por que reentrega é segura
 *
 * A ingestão é idempotente por desenho: `unique (organization_id, external_id)`
 * em `messages` mais a captura do `23505` no INSERT (doutrina do CLAUDE.md).
 * Reprocessar o mesmo evento não duplica a mensagem do cliente.
 *
 * ⚠️ LIMITE DECLARADO, porque prometer mais que isto seria mentira: a reentrega
 * salva a falha que acontece ANTES do INSERT — que é a maioria (banco fora do
 * ar, rede, timeout). Uma falha DEPOIS do INSERT cai no dedup do 23505 na
 * segunda tentativa, e `handleInbound` retorna cedo: os efeitos seguintes
 * (marcar conversa, virar lead, enfileirar o turno do agente) NÃO reexecutam.
 * É exatamente para esse resto que o aviso da Central existe — reentrega e
 * aviso cobrem metades diferentes do problema, e por isso os dois entram.
 *
 * ## Anti-enxurrada
 *
 * Quando a ingestão quebra, ela quebra para TODAS as mensagens — não para uma.
 * Um aviso por evento enterraria a Central justamente no dia em que ela precisa
 * ser lida (mesmo raciocínio do `recover-stuck-messages`: um aviso por org por
 * rodada). Aqui a janela é de tempo: um aviso aberto por organização por
 * `JANELA_DE_AVISO_MS`. Falhar em avisar não pode derrubar o 500 — o 500 é a
 * parte que recupera dado, e é ela que precisa sair inteira.
 */

import type { createAdminClient } from "@/lib/supabase/admin";
import { logger } from "@/lib/logger";

/** Mesma forma que `lib/waha/ingest.ts` usa — o client, não um genérico à mão. */
type Admin = ReturnType<typeof createAdminClient>;

/** Uma hora: longo o bastante para uma pane inteira caber num aviso só. */
const JANELA_DE_AVISO_MS = 60 * 60 * 1000;

export interface FalhaDeIngestao {
  admin: Admin;
  organizationId: string;
  sessionName: string;
  eventType: string;
  externalId: string | null;
  requestId: string;
  erro: unknown;
}

/**
 * Registra a falha nos três lugares que importam e devolve nada — quem chama
 * decide o status HTTP (e deve devolver 500).
 *
 * Nunca lança: uma exceção aqui dentro voltaria ao `catch` do handler e o
 * faria parecer um segundo defeito.
 */
export async function registrarFalhaDeIngestao(f: FalhaDeIngestao): Promise<void> {
  const detalhe = f.erro instanceof Error ? f.erro.message : String(f.erro);

  logger.error("[waha.webhook] despacho do evento falhou — devolvendo 500 para reentrega", {
    organization_id: f.organizationId,
    session: f.sessionName,
    event: f.eventType,
    external_id: f.externalId,
    request_id: f.requestId,
    error: detalhe,
  });

  // Import dinâmico igual a `lib/audit/index.ts`: o SDK do Sentry não precisa
  // entrar no caminho quente de todo webhook que dá certo.
  void import("@sentry/nextjs")
    .then((Sentry) => {
      Sentry.captureException(
        f.erro instanceof Error ? f.erro : new Error(`[waha.ingest] ${detalhe}`),
        {
          level: "error",
          tags: { subsystem: "waha-webhook", waha_event: f.eventType },
          extra: {
            organization_id: f.organizationId,
            session: f.sessionName,
            external_id: f.externalId,
            request_id: f.requestId,
          },
        },
      );
    })
    .catch(() => {
      // Sentry ausente ou desligado (SENTRY_DSN=off) é config válida no
      // self-host; o `logger.error` acima já registrou o que importa.
    });

  try {
    const desde = new Date(Date.now() - JANELA_DE_AVISO_MS).toISOString();
    const { data: jaAberto } = await f.admin
      .from("agent_inbox_items")
      .select("id")
      .eq("organization_id", f.organizationId)
      .eq("kind", "webhook_ingest_failed")
      .eq("status", "open")
      .gte("created_at", desde)
      .limit(1)
      .maybeSingle();

    if (jaAberto) return;

    await f.admin.from("agent_inbox_items").insert({
      organization_id: f.organizationId,
      kind: "webhook_ingest_failed",
      severity: "critical",
      title: "Mensagem de cliente não chegou ao sistema",
      body:
        `O canal "${f.sessionName}" entregou um evento (${f.eventType}) que o sistema não conseguiu processar. ` +
        `O WhatsApp foi instruído a reenviar, e mensagens repetidas não duplicam. ` +
        `Se o cliente disser que escreveu e não foi respondido, é por aqui. ` +
        `Verifique se o banco e a conexão do WhatsApp estão de pé. Motivo técnico: ${detalhe.slice(0, 200)}`,
      ref_kind: "channel_session",
      ref_id: null,
    });
  } catch (avisoErr) {
    // Falhar em avisar não pode derrubar a resposta 500 — ela é a parte que
    // recupera a mensagem.
    logger.warn("[waha.webhook] não foi possível abrir o aviso na Central", {
      organization_id: f.organizationId,
      request_id: f.requestId,
      error: avisoErr instanceof Error ? avisoErr.message : String(avisoErr),
    });
  }
}
