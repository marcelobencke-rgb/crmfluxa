/**
 * POST /api/v1/webhooks/waha/[token]
 *
 * Rota per-tenant canônica de produção: cada channel_session tem um
 * webhook_path_token único url-safe. Pipeline: lookup por token -> verifica
 * HMAC SHA512 -> loga em webhook_events_log -> dispatchWahaEvent (ingestão
 * compartilhada, ver lib/waha/ingest.ts).
 *
 * Idempotência e resolução atômica de contato/conversa vivem no módulo
 * compartilhado — este handler só faz auth + roteamento.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest, NextResponse } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { ARCHIVED_AT, queryTolerantToMissingArchived } from "@/lib/channels/archived";
import { createAdminClient } from "@/lib/supabase/admin";
import { dispatchWahaEvent, type WahaEnvelope } from "@/lib/waha/ingest";
import { registrarFalhaDeIngestao } from "@/lib/waha/falha-de-ingestao";
import { segredoDoWebhook } from "@/lib/waha/segredo-do-webhook";
import { authenticateWahaWebhook } from "@/lib/waha/webhook-auth";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteCtx {
  params: Promise<{ token: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<NextResponse> {
  const requestId = randomUUID();
  const { token } = await ctx.params;

  if (!token || token.length < 8) {
    return fail("not_found", "unknown webhook token", 404, { requestId });
  }

  const rawBody = await req.text();
  let envelope: WahaEnvelope;
  try {
    envelope = JSON.parse(rawBody) as WahaEnvelope;
  } catch {
    return fail("invalid_request", "invalid_json", 400, { requestId });
  }

  const admin = createAdminClient();

  // Canal ARQUIVADO não ingere: o usuário mandou excluí-lo e a sessão já foi
  // removida do WAHA. O que ainda pode chegar é evento em voo (ou retentativa),
  // e aceitá-lo ressuscitaria o canal no inbox — com o operador sem conseguir
  // responder, porque o arquivamento deixa a sessão STOPPED.
  const base = () =>
    admin
      .from("channel_sessions")
      .select(
        "id, organization_id, waha_session_name, webhook_secret_encrypted, status, is_warmup_complete, warmup_started_at",
      )
      .eq("webhook_path_token", token);
  const { data: session, error: sessErr } = await queryTolerantToMissingArchived(
    () => base().is(ARCHIVED_AT, null).maybeSingle(),
    () => base().maybeSingle(),
  );

  if (sessErr) {
    return fail("internal_error", sessErr.message, 500, { requestId });
  }
  if (!session) {
    return fail("not_found", "unknown webhook token", 404, { requestId });
  }

  // Autenticação fail-closed — regras e o porquê em lib/waha/webhook-auth.ts.
  const sigHeader = req.headers.get("x-webhook-hmac") ?? req.headers.get("X-Webhook-Hmac");
  // Decifrado no máximo uma vez por valor de segredo — ver o porquê (e por que a
  // chave do cache é o próprio cifrado) em lib/waha/segredo-do-webhook.ts.
  const sessionSecret = await segredoDoWebhook(admin, session.webhook_secret_encrypted);

  const auth = authenticateWahaWebhook({ rawBody, signatureHeader: sigHeader, sessionSecret });
  if (!auth.ok) {
    await audit({
      action: "webhook.hmac_invalid",
      organizationId: session.organization_id,
      metadata: {
        provider: "waha",
        session: session.waha_session_name,
        event: envelope.event,
        reason: auth.reason,
        had_signature: Boolean(sigHeader),
      },
    });
    return fail("unauthenticated", auth.reason, 401, { requestId });
  }
  const validSignature = auth.signatureVerified;

  const eventType = envelope.event ?? "unknown";
  const externalId = envelope.payload?.id ?? null;

  const headersJson: Record<string, string> = {};
  req.headers.forEach((value, key) => {
    if (key.toLowerCase().startsWith("authorization")) return;
    if (key.toLowerCase() === "cookie") return;
    headersJson[key] = value;
  });
  // NÃO ESPERA. Este log é forense (ninguém o atualiza depois, e a idempotência
  // do WAHA não passa por ele — ela é o unique de `messages` + captura do
  // 23505). Esperá-lo adiava em um round-trip o INSERT da mensagem, que é
  // justamente o que o atendente está esperando ver na tela: o realtime só
  // dispara quando aquela linha existe.
  void admin.from("webhook_events_log").insert({
    organization_id: session.organization_id,
    channel_session_id: session.id,
    provider: "waha",
    webhook_path_token: token,
    http_method: "POST",
    headers: headersJson,
    raw_body: rawBody,
    payload_parsed: envelope as unknown as Record<string, unknown>,
    signature_header: sigHeader ?? null,
    valid_signature: validSignature,
    event_type: eventType,
    external_id: externalId,
    status: "received",
    attempts: 0,
  });

  // FALHA AQUI NÃO PODE VIRAR 200 — ver lib/waha/falha-de-ingestao.ts.
  //
  // Este `catch` engolia a exceção num `console.error` e seguia para o `ok()`
  // abaixo. Para o WAHA, 200 é confirmacao de processamento: ele nao reentrega,
  // e a mensagem do cliente morria ali, sem entrar no inbox, sem virar evento,
  // sem aviso e sem Sentry. O 500 devolve a chance de reentrega (a ingestao e
  // idempotente por `unique (organization_id, external_id)`) e o helper abre o
  // aviso na Central para a parte que a reentrega nao alcanca.
  try {
    await dispatchWahaEvent(admin, session, envelope, requestId);
  } catch (err) {
    await registrarFalhaDeIngestao({
      admin,
      organizationId: session.organization_id,
      sessionName: session.waha_session_name,
      eventType,
      externalId,
      requestId,
      erro: err,
    });
    return fail("internal_error", "waha event dispatch failed", 500, { requestId });
  }

  return ok({ accepted: true }, { requestId });
}
