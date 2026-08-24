import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { __limparCacheDeSegredo, segredoDoWebhook } from "@/lib/waha/segredo-do-webhook";

/**
 * O SEGREDO DO WEBHOOK ERA DECIFRADO A CADA MENSAGEM RECEBIDA.
 *
 * A RPC `fn_decrypt_oauth` custa um round-trip ao Postgres (~150ms na produção
 * medida) e rodava em TODO request das duas rotas de webhook — para um valor
 * que só muda quando alguém rotaciona o canal. Pior: acontece ANTES do INSERT
 * em `messages`, dentro da janela que o atendente sente, porque o realtime só
 * dispara quando aquela linha existe.
 *
 * ⚠️ O PERIGO DE CACHEAR ISTO é validar assinatura contra segredo velho. Por
 * isso a chave do cache é o próprio CIFRADO e não o id da sessão: rotacionar
 * troca o cifrado, que é uma chave nova, que não tem entrada. O teste da
 * rotação abaixo é o que guarda essa propriedade — sem ele, alguém "simplifica"
 * para cachear por session_id com TTL e abre uma janela de autenticação com
 * valor obsoleto.
 */

function fakeAdmin(mapa: Record<string, string>, falhar = false) {
  const rpc = vi.fn(async (_fn: string, args: { ciphertext: string }) => {
    if (falhar) return { data: null, error: { message: "boom" } };
    const claro = mapa[args.ciphertext];
    return claro === undefined
      ? { data: null, error: { message: "not found" } }
      : { data: claro, error: null };
  });
  return { admin: { rpc } as unknown as SupabaseClient, rpc };
}

beforeEach(() => __limparCacheDeSegredo());

describe("o segredo é decifrado uma vez por valor", () => {
  it("a segunda mensagem não paga a RPC de novo", async () => {
    const { admin, rpc } = fakeAdmin({ "cifra-A": "segredo-A" });

    expect(await segredoDoWebhook(admin, "cifra-A")).toBe("segredo-A");
    expect(await segredoDoWebhook(admin, "cifra-A")).toBe("segredo-A");
    expect(await segredoDoWebhook(admin, "cifra-A")).toBe("segredo-A");

    expect(rpc).toHaveBeenCalledTimes(1);
  });

  it("ROTAÇÃO: cifrado novo nunca cai no valor antigo", async () => {
    // Este é o teste que impede a "simplificação" perigosa (cachear por
    // session_id com TTL). Se alguém mudar a chave do cache, isto quebra.
    const { admin, rpc } = fakeAdmin({ "cifra-A": "segredo-A", "cifra-B": "segredo-B" });

    expect(await segredoDoWebhook(admin, "cifra-A")).toBe("segredo-A");
    expect(await segredoDoWebhook(admin, "cifra-B")).toBe("segredo-B");

    expect(rpc).toHaveBeenCalledTimes(2);
  });
});

describe("o que NÃO entra no cache", () => {
  it("falha da RPC não é memorizada — erro transitório não condena o canal", async () => {
    // Cachear o `null` deixaria o canal recusando webhook até o processo
    // reiniciar, por causa de uma instabilidade de um segundo.
    const { admin, rpc } = fakeAdmin({}, true);

    expect(await segredoDoWebhook(admin, "cifra-A")).toBeNull();
    expect(await segredoDoWebhook(admin, "cifra-A")).toBeNull();

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("cifrado ausente ou vazio nem chega a consultar", async () => {
    const { admin, rpc } = fakeAdmin({ "cifra-A": "segredo-A" });

    expect(await segredoDoWebhook(admin, null)).toBeNull();
    expect(await segredoDoWebhook(admin, "")).toBeNull();
    expect(await segredoDoWebhook(admin, undefined)).toBeNull();

    expect(rpc).not.toHaveBeenCalled();
  });

  it("RPC que lança vira null, não exceção subindo pela rota", async () => {
    const admin = {
      rpc: vi.fn(async () => {
        throw new Error("conexão caiu");
      }),
    } as unknown as SupabaseClient;

    await expect(segredoDoWebhook(admin, "cifra-A")).resolves.toBeNull();
  });
});
