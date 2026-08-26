/**
 * Issue #64 — o teto está LIGADO no login, não só disponível numa lib.
 *
 * O helper tem teste próprio (lib/auth/rate-limit.test.ts); este aqui prova a
 * fiação: a action recusa a 6ª tentativa contra a MESMA conta dentro da janela,
 * antes de falar com o GoTrue. Sem a chamada em signInWithPassword.ts, as seis
 * tentativas chegariam ao provedor e o teste fica vermelho.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { headers } from "next/headers";
import { createClient } from "@/lib/supabase/server";

/**
 * FORÇA O CONTADOR EM MEMÓRIA — o teto tem de ser medido, não herdado.
 *
 * `tests/setup/vitest.setup.ts` carrega `.env.local` para dentro de
 * `process.env`. Numa máquina com Upstash de verdade configurado (a do
 * mantenedor), estes casos passavam a contar num REDIS COMPARTILHADO E REAL —
 * com três consequências, todas ruins:
 *
 *   1. o contador PERSISTE entre execuções: rodar a suíte duas vezes seguidas
 *      estourava o teto na segunda, e o caso reprovava sem defeito nenhum;
 *   2. a ordem dos casos passava a importar, porque dividem os mesmos baldes;
 *   3. a suíte escrevia chaves de teste num Redis de produção.
 *
 * O sintoma parecia flake sob carga — foi o que eu concluí duas vezes antes de
 * medir. Não era: renomeando `.env.local`, 9/9 passam; com ele, falham em
 * bloco depois de algumas rodadas.
 *
 * É o mesmo defeito de `lib/ai/dispatcher/rate-limit.test.ts`, corrigido lá
 * antes e não visto aqui. O mock fixa as duas variáveis como ausentes, que é a
 * definição de "cair para a memória" — e a memória zera a cada processo.
 */
vi.mock("@/lib/env", () => ({
  env: {
    UPSTASH_REDIS_REST_URL: undefined,
    UPSTASH_REDIS_REST_TOKEN: undefined,
  },
}));

vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  audit: vi.fn(async () => undefined),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const signIn = vi.fn(async () => ({
  data: { user: null, session: null },
  error: { message: "Invalid login credentials", status: 400 },
}));

describe("signInWithPassword — teto de tentativas", () => {
  beforeEach(() => {
    vi.resetModules();
    signIn.mockClear();
    vi.mocked(headers).mockResolvedValue({
      get: (k: string) => (k === "x-forwarded-for" ? "203.0.113.77" : null),
    } as never);
    signIn.mockResolvedValue({
      data: { user: null, session: null },
      error: { message: "Invalid login credentials", status: 400 },
    } as never);
    vi.mocked(createClient).mockResolvedValue({
      auth: {
        signInWithPassword: signIn,
        mfa: { listFactors: vi.fn(async () => ({ data: { totp: [{ id: "f1" }] } })) },
      },
    } as never);
  });

  it("recusa a 6ª tentativa contra a mesma conta sem chamar o provedor", async () => {
    const { signInWithPassword } = await import("./signInWithPassword");
    const input = { email: "alvo@example.com", password: "senha-errada-123" };

    const resultados = [];
    for (let i = 0; i < 6; i++) {
      resultados.push(await signInWithPassword(input));
    }

    // AUTH_LIMITS.login.id = 5 → as 5 primeiras passam do teto e falham no
    // provedor; a 6ª nem chega lá.
    expect(resultados.slice(0, 5).map((r) => r.error)).toEqual(
      Array(5).fill("invalid_credentials"),
    );
    expect(resultados[5]?.error).toBe("rate_limited");
    expect(signIn).toHaveBeenCalledTimes(5);
  });

  it("acertar a senha não gasta o orçamento de bloqueio da conta", async () => {
    const { signInWithPassword } = await import("./signInWithPassword");
    const input = { email: "certo@example.com", password: "senha-certa-123" };

    // Provedor aceita, e a conta tem MFA — o retorno é mfa_required, o que
    // basta: o ponto é que o caminho de SUCESSO não incrementa o contador.
    signIn.mockResolvedValue({
      data: { user: { id: "u1" }, session: {} },
      error: null,
    } as never);

    const resultados = [];
    for (let i = 0; i < 10; i++) {
      resultados.push(await signInWithPassword(input));
    }

    // Nenhuma das dez foi barrada: se o sucesso contasse, a 6ª seria.
    expect(resultados.filter((r) => r?.error === "rate_limited")).toHaveLength(0);
    expect(signIn).toHaveBeenCalledTimes(10);
  });
});
