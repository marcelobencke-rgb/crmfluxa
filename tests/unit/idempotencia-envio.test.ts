import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";

import {
  chaveDoHeader,
  guardarResposta,
  hashDaRequisicao,
  respostaJaDada,
} from "@/lib/api/idempotencia";

/**
 * A MENSAGEM DUPLICADA NO WHATSAPP DO CLIENTE.
 *
 * `lib/api/client.ts` retenta POST em timeout (10s) e em erro de rede, com a
 * MESMA `Idempotency-Key` nas 3 tentativas — isso já era assim e está certo. O
 * que faltava era o servidor ler o header: sem isso, um envio lento vira duas
 * mensagens para o contato, e quem paga o erro é a pessoa do outro lado.
 *
 * Estes testes cobrem as decisões do guarda, que são três e todas erráveis:
 * repetir a resposta na retentativa legítima, NÃO repetir quando a chave foi
 * reusada com outro corpo, e nunca transformar falha de leitura em falha de
 * envio.
 */

type Linha = { response_body: unknown; status_code: number | null; request_hash: string | null };

/** Supabase de mentira com o encadeamento que o helper usa. */
function fakeSupabase(linha: Linha | null, erro: { message: string } | null = null) {
  const insert = vi.fn(() => ({ then: (cb: (r: { error: null }) => void) => cb({ error: null }) }));
  const sb = {
    from: vi.fn(() => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            eq: () => ({ maybeSingle: async () => ({ data: linha, error: erro }) }),
          }),
        }),
      }),
      insert,
    })),
  };
  return { sb: sb as unknown as SupabaseClient, insert };
}

const BASE = {
  organizationId: "11111111-1111-4111-8111-111111111111",
  endpoint: "http:post:/api/v1/messages",
  chave: "chave-1",
};

describe("a chave vinda do header", () => {
  const comHeader = (v: string | null) =>
    ({ headers: new Headers(v === null ? {} : { "Idempotency-Key": v }) }) as { headers: Headers };

  it("lê a chave quando ela vem", () => {
    expect(chaveDoHeader(comHeader("abc-123"))).toBe("abc-123");
  });

  it("ausente vira null — envio sem idempotência, não erro", () => {
    expect(chaveDoHeader(comHeader(null))).toBeNull();
  });

  it("chave absurda vira null em vez de derrubar o envio", () => {
    // Recusar o envio por causa de um header malformado trocaria um RISCO de
    // duplicata por uma falha CERTA. O header é entrada externa.
    expect(chaveDoHeader(comHeader("x".repeat(201)))).toBeNull();
    expect(chaveDoHeader(comHeader("   "))).toBeNull();
  });
});

describe("a resposta já dada", () => {
  const hash = hashDaRequisicao({ conversation_id: "c1", body: "oi" });

  it("retentativa da MESMA requisição repete a resposta original", async () => {
    const { sb } = fakeSupabase({
      response_body: { id: "msg-1", status: "sent" },
      status_code: 201,
      request_hash: hash,
    });
    const r = await respostaJaDada<{ id: string }>(sb, { ...BASE, requestHash: hash });
    expect(r?.body).toEqual({ id: "msg-1", status: "sent" });
    expect(r?.statusCode).toBe(201);
  });

  it("primeira vez (nada guardado) deixa o envio seguir", async () => {
    const { sb } = fakeSupabase(null);
    expect(await respostaJaDada(sb, { ...BASE, requestHash: hash })).toBeNull();
  });

  it("MESMA chave com corpo DIFERENTE não repete resposta de outra mensagem", async () => {
    // Reuso indevido de chave é bug de cliente. Responder com o eco de outra
    // mensagem seria pior que mandar a mensagem certa: o atendente veria
    // "enviado" de um texto que nunca saiu.
    const { sb } = fakeSupabase({
      response_body: { id: "msg-de-outra-coisa" },
      status_code: 201,
      request_hash: hashDaRequisicao({ conversation_id: "c1", body: "OUTRO TEXTO" }),
    });
    expect(await respostaJaDada(sb, { ...BASE, requestHash: hash })).toBeNull();
  });

  it("falha de leitura NÃO bloqueia o envio", async () => {
    // Sem esta garantia, uma instabilidade do banco viraria "não consigo
    // enviar mensagem" — trocar um risco raro por uma parada dura.
    const { sb } = fakeSupabase(null, { message: "connection reset" });
    expect(await respostaJaDada(sb, { ...BASE, requestHash: hash })).toBeNull();
  });

  it("linha guardada sem status ainda não é resposta utilizável", async () => {
    const { sb } = fakeSupabase({ response_body: null, status_code: null, request_hash: hash });
    expect(await respostaJaDada(sb, { ...BASE, requestHash: hash })).toBeNull();
  });
});

describe("guardar a resposta", () => {
  it("não é esperado — quem espera é o atendente com a mensagem já enviada", () => {
    const { sb, insert } = fakeSupabase(null);
    const r = guardarResposta(sb, {
      ...BASE,
      requestHash: "h",
      body: { id: "msg-1" },
      statusCode: 201,
    });
    // A função devolve void (não uma promise para o chamador aguardar) e o
    // INSERT já foi disparado.
    expect(r).toBeUndefined();
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it("grava a chave, o hash e o TTL", () => {
    const { sb, insert } = fakeSupabase(null);
    guardarResposta(sb, { ...BASE, requestHash: "h", body: { id: "m" }, statusCode: 201 });
    const gravado = insert.mock.calls[0]?.[0] as unknown as Record<string, unknown>;
    expect(gravado.key).toBe("chave-1");
    expect(gravado.request_hash).toBe("h");
    expect(gravado.organization_id).toBe(BASE.organizationId);
    expect(new Date(gravado.expires_at as string).getTime()).toBeGreaterThan(Date.now());
  });
});

describe("o hash da requisição", () => {
  it("mesma entrada, mesmo hash; entrada diferente, hash diferente", () => {
    const a = hashDaRequisicao({ conversation_id: "c1", body: "oi" });
    expect(hashDaRequisicao({ conversation_id: "c1", body: "oi" })).toBe(a);
    expect(hashDaRequisicao({ conversation_id: "c1", body: "oi!" })).not.toBe(a);
  });
});
