/**
 * MCP server endpoint (Spec 11 §2 + §5.4).
 *
 * Streamable HTTP transport via `WebStandardStreamableHTTPServerTransport`
 * (Next.js App Router recebe Web `Request`). Stateless: cada request abre
 * um transport+server fresh. Auth via Bearer (`api_tokens`).
 *
 * NUNCA logamos plaintext do bearer. Em erro retornamos JSON-RPC 2.0
 * envelope com `error.code` MCP (-32001/-32002/etc).
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

import { createMcpServer } from "@/lib/mcp/server";
import { McpAuthError, validateBearerToken } from "@/lib/mcp/auth";
import { baldeOpaco, ingressoLimitado, TETOS } from "@/lib/webhooks/limite-de-ingresso";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 300;

function jsonRpcError(code: number, message: string, status: number): Response {
  return new Response(
    JSON.stringify({
      jsonrpc: "2.0",
      error: { code, message },
      id: null,
    }),
    {
      status,
      headers: { "content-type": "application/json" },
    },
  );
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  // TETO ANTES DE VALIDAR O BEARER — os dois motivos são diferentes.
  //
  // 1. Sem teto antes da validação, este endpoint é um balcão de força bruta de
  //    token: cada tentativa custa um hash SHA256 e uma consulta, e nada limita
  //    quantas cabem por minuto.
  // 2. Depois de autenticado, cada chamada MCP pode acionar o agente e QUEIMAR
  //    ORÇAMENTO DE IA. O teto por credencial impede que um cliente mal
  //    configurado (ou um laço de retry) gaste o mês da organização numa tarde.
  //
  // O balde é o header inteiro, hasheado: sem validar ainda não se sabe a qual
  // organização ele pertence, e o hash isola igual sem levar a credencial em
  // claro para o Redis. Header ausente cai num balde só de anônimos, que é o
  // comportamento certo — quem nem manda credencial não merece um balde privado.
  const credencial = req.headers.get("authorization");
  const barrado = await ingressoLimitado(
    `mcp:${credencial ? baldeOpaco(credencial) : "sem-credencial"}`,
    TETOS.mcp(),
    60,
    requestId,
  );
  if (barrado) return barrado;

  let auth;
  try {
    auth = await validateBearerToken(req.headers.get("authorization"));
  } catch (err) {
    if (err instanceof McpAuthError) {
      return jsonRpcError(err.mcpCode, err.message, err.httpStatus);
    }
    const msg = err instanceof Error ? err.message : "auth_failed";
    return jsonRpcError(-32603, msg, 500);
  }

  const transport = new WebStandardStreamableHTTPServerTransport({});
  const server = createMcpServer(auth, requestId);

  try {
    await server.connect(transport);
    const response = await transport.handleRequest(req as unknown as Request);
    response.headers.set("X-Request-Id", requestId);
    return response;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "transport_error";
    return jsonRpcError(-32603, msg, 500);
  }
}

export async function POST(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function GET(req: NextRequest): Promise<Response> {
  return handle(req);
}

export async function DELETE(req: NextRequest): Promise<Response> {
  return handle(req);
}
