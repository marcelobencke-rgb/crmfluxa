import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { fail } from "@/lib/api/wrappers";
import type { AuthUser } from "@/lib/auth/types";

/**
 * POST /api/v1/leads/[id]/notes — anotação manual (aba Notas do dossiê).
 * Não há tabela própria: a nota É a atividade `type='note'` em
 * `crm_lead_activities` (ver comentário no route.ts). Por isso a garantia
 * central deste teste é a mesma do `next-action`: falha de INSERT falha ALTO
 * (500), nunca finge sucesso — aqui não existe outra mutação para a atividade
 * só "rastrear".
 */

vi.mock("@/lib/auth/require-role", () => ({ requireRole: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn(async () => undefined) }));
vi.mock("@/lib/leads/activity-emitter", () => ({ emitLeadActivity: vi.fn() }));

const USER_ID = "11111111-1111-4111-8111-111111111111";
const LEAD_ID = "22222222-2222-4222-8222-222222222222";
const ORG_ID = "33333333-3333-4333-8333-333333333333";
const CONTACT_ID = "44444444-4444-4444-8444-444444444444";

const ctx = { params: Promise.resolve({ id: LEAD_ID }) };

function req(body: unknown) {
  return new NextRequest(`http://localhost/api/v1/leads/${LEAD_ID}/notes`, {
    method: "POST",
    body: JSON.stringify(body),
    headers: { "content-type": "application/json" },
  });
}

function mockAuthzOk() {
  vi.mocked(requireRole).mockResolvedValue({
    ok: true,
    user: { id: USER_ID } as AuthUser,
    org: { orgId: ORG_ID, role: "agent" } as never,
  } as never);
}

function mockLead(row: { id: string; contact_id: string | null } | null) {
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

describe("POST /api/v1/leads/[id]/notes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("bloqueia quem não é agent+ (delega no requireRole)", async () => {
    vi.mocked(requireRole).mockResolvedValue({
      ok: false,
      response: fail("forbidden", "sem permissão", 403, { requestId: "r1" }),
    } as never);

    const { POST } = await import("./route");
    const res = await POST(req({ body: "oi" }), ctx);
    expect(res.status).toBe(403);
  });

  it("404 quando o lead não existe no tenant ativo", async () => {
    mockAuthzOk();
    mockLead(null);
    const { POST } = await import("./route");
    const res = await POST(req({ body: "oi" }), ctx);
    expect(res.status).toBe(404);
  });

  it("422 quando o corpo vem vazio", async () => {
    mockAuthzOk();
    mockLead({ id: LEAD_ID, contact_id: null });
    const { POST } = await import("./route");
    const res = await POST(req({ body: "" }), ctx);
    expect(res.status).toBe(422);
    expect(emitLeadActivity).not.toHaveBeenCalled();
  });

  it("falha ALTO (500) quando o INSERT da atividade falha — não finge sucesso", async () => {
    mockAuthzOk();
    mockLead({ id: LEAD_ID, contact_id: CONTACT_ID });
    vi.mocked(emitLeadActivity).mockResolvedValue({ ok: false, error: "boom" });

    const { POST } = await import("./route");
    const res = await POST(req({ body: "falei com o cliente" }), ctx);

    expect(res.status).toBe(500);
    expect(audit).not.toHaveBeenCalled();
  });

  it("cria a nota como atividade type='note' e audita lead.note_added", async () => {
    mockAuthzOk();
    mockLead({ id: LEAD_ID, contact_id: CONTACT_ID });
    vi.mocked(emitLeadActivity).mockResolvedValue({ ok: true });

    const { POST } = await import("./route");
    const res = await POST(req({ body: "Falei com o cliente sobre o prazo" }), ctx);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.data).toEqual({ lead_id: LEAD_ID });
    expect(emitLeadActivity).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        organizationId: ORG_ID,
        leadId: LEAD_ID,
        contactId: CONTACT_ID,
        type: "note",
        sourceModule: "lead_note",
        actor: { type: "user", id: USER_ID },
        reason: "Falei com o cliente sobre o prazo",
      }),
    );
    expect(audit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "lead.note_added",
        actorUserId: USER_ID,
        organizationId: ORG_ID,
        resourceType: "crm_lead",
        resourceId: LEAD_ID,
      }),
    );
  });
});
