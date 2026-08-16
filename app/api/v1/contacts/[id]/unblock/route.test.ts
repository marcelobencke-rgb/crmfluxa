import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { fail } from "@/lib/api/wrappers";
import type { AuthUser } from "@/lib/auth/types";

/**
 * POST /api/v1/contacts/[id]/unblock — W-02: reverte o bloqueio automático de
 * STOP. Admin-only (não agent+) porque reativa envio automatizado pra um
 * contato que pode ter pedido descadastro de verdade.
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));

const ADMIN_ID = "11111111-1111-4111-8111-111111111111";
const CONTACT_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";

function makeReq() {
  return new NextRequest("http://localhost/api/v1/contacts/x/unblock", { method: "POST" });
}

function mockAuthzOk() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: ADMIN_ID } as AuthUser,
    org: { orgId: ORG_ID, role: "admin" } as never,
  } as never);
}

function mockContact(row: { id: string; is_blocked: boolean; blocked_reason: string | null } | null) {
  const update = vi.fn(() => ({ eq: async () => ({ error: null }) }));
  vi.mocked(createClient).mockResolvedValue({
    from: () => ({
      select: () => ({
        eq: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: row, error: null }),
          }),
        }),
      }),
      update,
    }),
  } as never);
  return { update };
}

describe("POST /api/v1/contacts/[id]/unblock", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia quem não é admin (delega no requireRole)", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "sem permissão", 403, { requestId: "r1" }),
    } as never);

    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ id: CONTACT_ID }) });
    expect(res.status).toBe(403);
  });

  it("404 quando o contato não existe no tenant ativo", async () => {
    mockAuthzOk();
    mockContact(null);
    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ id: CONTACT_ID }) });
    expect(res.status).toBe(404);
  });

  it("é idempotente quando o contato já não está bloqueado", async () => {
    mockAuthzOk();
    const { update } = mockContact({ id: CONTACT_ID, is_blocked: false, blocked_reason: null });
    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ id: CONTACT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ contact_id: CONTACT_ID, already_unblocked: true });
    expect(update).not.toHaveBeenCalled();
  });

  it("desbloqueia, limpa motivo/timestamp e audita contact.unblocked", async () => {
    mockAuthzOk();
    const { update } = mockContact({
      id: CONTACT_ID,
      is_blocked: true,
      blocked_reason: "stop_keyword",
    });

    const { POST } = await import("./route");
    const res = await POST(makeReq(), { params: Promise.resolve({ id: CONTACT_ID }) });
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.data).toEqual({ contact_id: CONTACT_ID, unblocked: true });
    expect(update).toHaveBeenCalledWith({
      is_blocked: false,
      blocked_reason: null,
      blocked_at: null,
    });
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "contact.unblocked",
        actorUserId: ADMIN_ID,
        organizationId: ORG_ID,
        resourceId: CONTACT_ID,
        metadata: { previous_reason: "stop_keyword" },
      }),
    );
  });
});
