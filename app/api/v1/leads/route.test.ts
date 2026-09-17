/**
 * GET /api/v1/leads — o CONTRATO de resposta, não só o status.
 *
 * ─── O defeito que esta cerca prende ────────────────────────────────────────
 *
 * Medido em produção em 2026-09-16: o picker de lead do formulário de tarefa
 * (`SeletorDeLead.tsx`) quebrava com "leads.map is not a function" assim que
 * alguém digitava uma busca. A rota devolvia `ok({ leads }, …)` — ou seja
 * `{ data: { leads: [...] } }` — enquanto `hooks/leads/useLeadList.ts` (feito
 * no molde de `useContactList.ts`, que lê `GET /api/v1/contacts`) espera
 * `{ data: [...] }`, o array DIRETO em `data`. `res.status` era 200 nos dois
 * casos — só o FORMATO do corpo divergia, e nenhum teste de status pega isso.
 *
 * Por isso a asserção central aqui não é `res.status === 200`: é
 * `Array.isArray(body.data)`.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import type { AuthUser } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("./_handler", () => ({
  listLeadsHandler: vi.fn(async () => ({
    leads: [{ id: "lead-1", title: "Maria — combo presente" }],
    cursor: null,
    has_more: false,
  })),
  createLeadHandler: vi.fn(),
}));

import { listLeadsHandler } from "./_handler";

const ORG_ID = "22222222-2222-4222-8222-222222222222";
const USER_ID = "11111111-1111-4111-8111-111111111111";
const FAKE_SESSION_CLIENT = { session: true } as never;

function req(url = "http://localhost/api/v1/leads?search=maria") {
  return new NextRequest(url);
}

function sessaoOk(): void {
  const user: AuthUser = {
    id: USER_ID,
    email: "a@example.com",
    full_name: null,
    avatar_url: null,
    is_platform_admin: false,
    idioma: "pt-BR" as const,
    organizations: [{ organization_id: ORG_ID, organization_name: "Org", role: "viewer" }],
  };
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user,
    org: { orgId: ORG_ID, name: "Org", role: "viewer" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createClient).mockResolvedValue(FAKE_SESSION_CLIENT);
});

describe("GET /api/v1/leads — contrato do corpo", () => {
  it("`data` é o ARRAY de leads direto — não `{ leads: [...] }`", async () => {
    sessaoOk();
    const { GET } = await import("./route");
    const res = await GET(req());
    const body = (await res.json()) as { data: unknown; meta?: unknown };

    expect(res.status).toBe(200);
    expect(
      Array.isArray(body.data),
      "o picker faz `resultado.data?.data.map(...)` — se `data` for um objeto " +
        '`{ leads: [...] }` em vez do array, o `.map` explode com "leads.map is ' +
        'not a function" assim que a busca responder',
    ).toBe(true);
    expect(body.data).toEqual([{ id: "lead-1", title: "Maria — combo presente" }]);
  });

  it("`meta.cursor`/`meta.has_more` continuam expostos (paginação futura do picker)", async () => {
    sessaoOk();
    const { GET } = await import("./route");
    const res = await GET(req());
    const body = (await res.json()) as { meta?: { cursor: unknown; has_more: unknown } };

    expect(body.meta).toMatchObject({ cursor: null, has_more: false });
  });

  it("`search` da querystring chega ao handler", async () => {
    sessaoOk();
    const { GET } = await import("./route");
    await GET(req("http://localhost/api/v1/leads?search=maria"));

    expect(vi.mocked(listLeadsHandler).mock.calls[0]?.[2]).toMatchObject({ search: "maria" });
  });

  it("sem sessão → 401, handler nunca chamado", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("unauthenticated", "Auth required.", 401, {}),
    });
    const { GET } = await import("./route");
    const res = await GET(req());

    expect(res.status).toBe(401);
    expect(listLeadsHandler).not.toHaveBeenCalled();
  });

  it("`limit` inválido (fora de 1-100) → 422, handler nunca chamado", async () => {
    sessaoOk();
    const { GET } = await import("./route");
    const res = await GET(req("http://localhost/api/v1/leads?limit=500"));

    expect(res.status).toBe(422);
    expect(listLeadsHandler).not.toHaveBeenCalled();
  });
});
