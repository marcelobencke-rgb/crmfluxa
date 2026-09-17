import { describe, it, expect } from "vitest";
import { bulkLeadActionSchema, leadListQuerySchema, loseLeadSchema, moveLeadSchema } from "./leads";

const UUID = "11111111-1111-4111-8111-111111111111";
const UUID2 = "22222222-2222-4222-8222-222222222222";

describe("moveLeadSchema", () => {
  it("accepts a valid move payload", () => {
    const r = moveLeadSchema.safeParse({
      stage_id: UUID,
      position_in_stage: 1.5,
      expected_updated_at: "2026-04-28T10:00:00.000Z",
    });
    expect(r.success).toBe(true);
  });

  it("rejects non-uuid stage_id", () => {
    const r = moveLeadSchema.safeParse({
      stage_id: "not-uuid",
      position_in_stage: 1,
      expected_updated_at: "2026-04-28T10:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });

  it("rejects non-finite position", () => {
    const r = moveLeadSchema.safeParse({
      stage_id: UUID,
      position_in_stage: Number.POSITIVE_INFINITY,
      expected_updated_at: "2026-04-28T10:00:00.000Z",
    });
    expect(r.success).toBe(false);
  });
});

describe("loseLeadSchema", () => {
  it("requires lost_reason", () => {
    const r = loseLeadSchema.safeParse({});
    expect(r.success).toBe(false);
  });

  it("rejects empty lost_reason", () => {
    const r = loseLeadSchema.safeParse({ lost_reason: "" });
    expect(r.success).toBe(false);
  });

  it("accepts a non-empty reason", () => {
    const r = loseLeadSchema.safeParse({ lost_reason: "Sem orçamento" });
    expect(r.success).toBe(true);
  });
});

describe("bulkLeadActionSchema", () => {
  it("accepts a valid move bulk", () => {
    const r = bulkLeadActionSchema.safeParse({
      action: "move",
      lead_ids: [UUID],
      params: { stage_id: UUID2, position_in_stage: 1 },
    });
    expect(r.success).toBe(true);
  });

  it("rejects more than 50 lead_ids", () => {
    const ids = Array.from({ length: 51 }, () => UUID);
    const r = bulkLeadActionSchema.safeParse({
      action: "delete",
      lead_ids: ids,
      params: {},
    });
    expect(r.success).toBe(false);
  });

  it("rejects empty lead_ids", () => {
    const r = bulkLeadActionSchema.safeParse({
      action: "delete",
      lead_ids: [],
      params: {},
    });
    expect(r.success).toBe(false);
  });

  it("accepts assign with null owner", () => {
    const r = bulkLeadActionSchema.safeParse({
      action: "assign",
      lead_ids: [UUID],
      params: { owner_user_id: null },
    });
    expect(r.success).toBe(true);
  });

  it("rejects unknown action", () => {
    const r = bulkLeadActionSchema.safeParse({
      action: "explode",
      lead_ids: [UUID],
      params: {},
    });
    expect(r.success).toBe(false);
  });
});

describe("leadListQuerySchema — GET /api/v1/leads (picker de lead da tarefa)", () => {
  it("query vazia é válida — tudo é opcional", () => {
    const r = leadListQuerySchema.safeParse({});
    expect(r.success).toBe(true);
  });

  it("aceita `search` livre, sem exigir formato", () => {
    const r = leadListQuerySchema.safeParse({ search: "Maria — combo" });
    expect(r.success).toBe(true);
  });

  it("`limit` vem como string da URLSearchParams e é coagido pra número", () => {
    const r = leadListQuerySchema.safeParse({ limit: "20" });
    expect(r.success && typeof r.data.limit).toBe("number");
  });

  it("`limit` acima de 100 é rejeitado — o teto que `listLeadsHandler` também aplica", () => {
    const r = leadListQuerySchema.safeParse({ limit: "500" });
    expect(r.success).toBe(false);
  });

  it("`limit` zero ou negativo é rejeitado", () => {
    expect(leadListQuerySchema.safeParse({ limit: "0" }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ limit: "-5" }).success).toBe(false);
  });

  it("rejeita `status` fora do vocabulário", () => {
    const r = leadListQuerySchema.safeParse({ status: "arquivado" });
    expect(r.success).toBe(false);
  });

  it("rejeita `pipeline_id`/`stage_id`/`owner_user_id` que não sejam uuid", () => {
    expect(leadListQuerySchema.safeParse({ pipeline_id: "não-é-uuid" }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ stage_id: "não-é-uuid" }).success).toBe(false);
    expect(leadListQuerySchema.safeParse({ owner_user_id: "não-é-uuid" }).success).toBe(false);
  });
});
