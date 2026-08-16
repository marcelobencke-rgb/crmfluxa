import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { fail } from "@/lib/api/wrappers";
import type { AuthUser } from "@/lib/auth/types";

/**
 * POST /api/v1/team/[user_id]/reset-mfa — admin remove o MFA de um colega que
 * perdeu o autenticador E os 10 códigos de recuperação (o único caminho
 * self-service). Guarda: exige admin, não deixa resetar o próprio, e só age
 * em membro ativo do mesmo tenant.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/admin", () => ({ createAdminClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const TARGET_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

function makeReq() {
  return new NextRequest("http://localhost/api/v1/team/x/reset-mfa", { method: "POST" });
}

function mockAuthzOk() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: ADMIN_ID } as AuthUser,
    org: { orgId: ORG_ID, role: "admin" } as never,
  } as never);
}

function mockMembership(row: { id: string; revoked_at: string | null } | null) {
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }),
    }),
  } as never);
}

function mockAdminMfa(factors: { id: string }[]) {
  const deleteFactor = vi.fn(async () => ({ data: {}, error: null }));
  vi.mocked(createAdminClient).mockReturnValue({
    auth: {
      admin: {
        mfa: {
          listFactors: vi.fn(async () => ({ data: { factors }, error: null })),
          deleteFactor,
        },
      },
    },
  } as never);
  return { deleteFactor };
}

describe("POST /api/v1/team/[user_id]/reset-mfa", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia quem não é admin (delega no requireRole)", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "sem permissão", 403, { requestId: "r1" }),
    } as never);

    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ user_id: TARGET_ID }) });
    expect(res.status).toBe(403);
  });

  it("recusa resetar o próprio MFA", async () => {
    mockAuthzOk();
    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ user_id: ADMIN_ID }) });
    expect(res.status).toBe(409);
  });

  it("404 quando o alvo não é membro ativo do tenant", async () => {
    mockAuthzOk();
    mockMembership(null);
    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ user_id: TARGET_ID }) });
    expect(res.status).toBe(404);
  });

  it("404 quando o alvo está revogado", async () => {
    mockAuthzOk();
    mockMembership({ id: "membership-1", revoked_at: "2026-01-01T00:00:00Z" });
    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ user_id: TARGET_ID }) });
    expect(res.status).toBe(404);
  });

  it("remove todos os fatores MFA e audita team.mfa_reset", async () => {
    mockAuthzOk();
    mockMembership({ id: "membership-1", revoked_at: null });
    const { deleteFactor } = mockAdminMfa([{ id: "f1" }, { id: "f2" }]);

    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ user_id: TARGET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ user_id: TARGET_ID, factors_removed: 2 });
    expect(deleteFactor).toHaveBeenCalledTimes(2);
    expect(deleteFactor).toHaveBeenNthCalledWith(1, { userId: TARGET_ID, id: "f1" });
    expect(deleteFactor).toHaveBeenNthCalledWith(2, { userId: TARGET_ID, id: "f2" });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "team.mfa_reset",
        actorUserId: ADMIN_ID,
        organizationId: ORG_ID,
        metadata: expect.objectContaining({ target_user_id: TARGET_ID, factors_removed: 2 }),
      }),
    );
  });

  it("é idempotente quando o colega já não tem fator nenhum", async () => {
    mockAuthzOk();
    mockMembership({ id: "membership-1", revoked_at: null });
    mockAdminMfa([]);

    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ user_id: TARGET_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data.factors_removed).toBe(0);
  });
});
