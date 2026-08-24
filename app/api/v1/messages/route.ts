/**
 * POST /api/v1/messages — envia mensagem outbound (handler em ./_handler.ts).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import {
  chaveDoHeader,
  guardarResposta,
  hashDaRequisicao,
  respostaJaDada,
} from "@/lib/api/idempotencia";
import { ApiError } from "@/lib/api/types";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { sendMessageSchema, validateRequest, type SendMessageInput } from "@/lib/schemas";
import { createClient } from "@/lib/supabase/server";

import { sendMessageHandler } from "./_handler";

export const dynamic = "force-dynamic";

/** Namespace da chave — o MCP usa o seu (`mcp:crm_send_whatsapp_message`), e as
 *  duas portas não devem se deduplicar entre si. */
const ENDPOINT_TAG = "http:post:/api/v1/messages";

export async function POST(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const supabase = await createClient();

  // spec 13 §4: escrita é agent+ (viewer é read-only).
  const authz = await requireRole("agent", { requestId, resource: "messages" });
  if (!authz.ok) return authz.response;
  const user = authz.user;
  const activeOrg = authz.org;

  let input;
  try {
    input = await validateRequest(sendMessageSchema, req);
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, {
        details: err.details as Record<string, unknown> | undefined,
        requestId,
      });
    }
    throw err;
  }

  // IDEMPOTÊNCIA — sem isto, o retry do próprio client duplica a mensagem no
  // WhatsApp do contato. `lib/api/client.ts` já manda a chave (a MESMA nas 3
  // tentativas de um envio); esta rota é que não a lia. Detalhe e custo em
  // `lib/api/idempotencia.ts`.
  const chave = chaveDoHeader(req);
  const requestHash = hashDaRequisicao(input);
  if (chave) {
    const jaDada = await respostaJaDada<unknown>(supabase, {
      organizationId: activeOrg.orgId,
      endpoint: ENDPOINT_TAG,
      chave,
      requestHash,
    });
    if (jaDada) {
      // Repete o 201 do envio original: para o cliente, a retentativa tem de
      // ser indistinguível da primeira resposta. O `status_code` guardado é
      // conferido em vez de repassado cru — a coluna é `int` genérica e o
      // wrapper `ok()` só admite 200/201/204; um valor inesperado ali viraria
      // resposta inválida em vez de erro visível.
      return ok(jaDada.body, { status: jaDada.statusCode === 200 ? 200 : 201, requestId });
    }
  }

  try {
    const message = await sendMessageHandler(
      supabase,
      {
        organization_id: activeOrg.orgId,
        actor: { type: "user", id: user.id },
        requestId,
      },
      input as SendMessageInput,
    );
    if (chave) {
      guardarResposta(supabase, {
        organizationId: activeOrg.orgId,
        endpoint: ENDPOINT_TAG,
        chave,
        requestHash,
        body: message,
        statusCode: 201,
      });
    }
    return ok(message, { status: 201, requestId });
  } catch (err) {
    if (err instanceof ApiError) {
      return fail(err.code, err.message, err.status, { requestId });
    }
    throw err;
  }
}
