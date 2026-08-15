import { afterAll, beforeEach, describe, expect, it } from "vitest";
import pg from "pg";

import {
  applyStageTriggerEvent,
  type StageTriggerDb,
  type StagePointer,
} from "@/lib/followup/stage-trigger";
import type { FollowupGateDb } from "@/lib/followup/agent-followup-gate";
import type { EventRow } from "@/lib/event-log/dispatcher";
import type { FlowGraph } from "@/lib/followup/graph-schema";

/**
 * Gatilho de MUDANÇA DE ETAPA (stage_change) contra Postgres real —
 * complementa `followup-silence-sweep.test.ts` (o outro gatilho automático).
 * DESKCOMM_GOV_INVARIANTS_EDIT=1 — arquivo NOVO desta sessão.
 *
 * Congela: (1) evento `lead.stage_changed` com `entity_kind='crm_lead'`
 * batendo o `stage_id` de um pointer ativo + gate habilitado → enrolla o
 * contato do lead no nó trigger; (2) MESMO evento com `entity_kind='lead'`
 * (o trigger legado de banco) → NOOP, não enrolla — a dedupe contra o
 * emissor legado; (3) `to_stage_id` que nenhum pointer configura → NOOP;
 * (4) sem agente publicado habilitando o pointer → gate-out, 0 enrollments;
 * (5) contato já vivo em outro fluxo (exclusividade org-wide, migration
 * 0062) → 23505 vira `skipped_existing`, nunca erro.
 */

const container = process.env.TEST_DB_CONTAINER;
if (!container) {
  throw new Error("TEST_DB_CONTAINER not set — rode via `pnpm test:invariants` (scripts/test-db.sh)");
}

const PORT = Number(process.env.TEST_DB_PORT ?? 54329);
const pool = new pg.Pool({
  connectionString: `postgresql://postgres:postgres@127.0.0.1:${PORT}/postgres`,
  max: 4,
});

afterAll(async () => {
  await pool.end();
});

// Mesmo cuidado de escopo do sweep de silêncio: só limpa pointers
// kind='stage_change' entre casos, pra não contaminar pointers_scanned de
// outro `it` (pointers ficam status='active' pra sempre, nada os desativa).
beforeEach(async () => {
  await pool.query(`delete from followup_flow_pointers where trigger_config->>'kind' = 'stage_change'`);
});

// ---- pg-backed StageTriggerDb (test-only; prod usa createSupabaseStageTriggerDb) ----

function stageTriggerDb(): StageTriggerDb {
  return {
    async loadActiveStagePointers(orgId): Promise<StagePointer[]> {
      const { rows } = await pool.query<{
        id: string;
        active_version_id: string | null;
        trigger_config: { kind: string; params?: { stage_id: string } };
      }>(
        `select id, active_version_id, trigger_config
         from followup_flow_pointers
         where organization_id = $1 and status = 'active' and active_version_id is not null`,
        [orgId],
      );
      const pointers: StagePointer[] = [];
      for (const row of rows) {
        if (row.trigger_config.kind !== "stage_change" || !row.active_version_id) continue;
        pointers.push({
          id: row.id,
          active_version_id: row.active_version_id,
          stage_id: row.trigger_config.params!.stage_id,
        });
      }
      return pointers;
    },
    async loadLeadContactId(orgId, leadId) {
      const { rows } = await pool.query<{ contact_id: string | null }>(
        `select contact_id from crm_leads where id = $1 and organization_id = $2`,
        [leadId, orgId],
      );
      return rows[0]?.contact_id ?? null;
    },
    async loadTriggerNodeId(orgId, versionId) {
      const { rows } = await pool.query<{ graph: FlowGraph }>(
        `select graph from followup_flow_versions where organization_id = $1 and id = $2`,
        [orgId, versionId],
      );
      if (rows.length === 0) return null;
      return rows[0]!.graph.nodes.find((n) => n.type === "trigger")?.id ?? null;
    },
    async insertEnrollment(input) {
      try {
        await pool.query(
          `insert into followup_enrollments
             (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at, agent_id)
           values ($1, $2, $3, $4, $5, 'active', $6, $7)`,
          [
            input.organization_id,
            input.pointer_id,
            input.version_id,
            input.contact_id,
            input.current_node_id,
            input.next_eval_at,
            input.agent_id,
          ],
        );
        return { inserted: true };
      } catch (err) {
        if ((err as { code?: string }).code === "23505") return { inserted: false };
        throw err;
      }
    },
  };
}

function pgGateDb(): FollowupGateDb {
  return {
    async loadEnabledPublishedFollowupAgents(orgId) {
      const { rows } = await pool.query<{ agent_id: string; followup: unknown }>(
        `select agent_id, followup from ai_agent_versions where organization_id = $1 and status = 'published'`,
        [orgId],
      );
      const byAgent = new Map<string, Set<string>>();
      for (const row of rows) {
        const f = row.followup as { enabled?: unknown; flow_pointer_ids?: unknown } | null;
        if (!f || f.enabled !== true || !Array.isArray(f.flow_pointer_ids)) continue;
        const set = byAgent.get(row.agent_id) ?? new Set<string>();
        for (const id of f.flow_pointer_ids) if (typeof id === "string") set.add(id);
        if (set.size > 0) byAgent.set(row.agent_id, set);
      }
      return [...byAgent].map(([agentId, ids]) => ({ agentId, pointerIds: [...ids] }));
    },
  };
}

// ---- seed helpers ----

let orgSeq = 0;
function nextOrgId(): string {
  orgSeq += 1;
  return `fedcba${String(orgSeq).padStart(2, "0")}-0000-4000-8000-000000000001`;
}

async function seedOrg(org: string): Promise<void> {
  const name = `followup-stage-${org.slice(0, 8)}`;
  await pool.query(
    `insert into organizations (id, slug, legal_name, display_name) values ($1, $2, $3, $4) on conflict (id) do nothing`,
    [org, name, name, name],
  );
}

async function seedContact(org: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into contacts (organization_id, display_name) values ($1, 'Stage Contact') returning id`,
    [org],
  );
  return rows[0]!.id;
}

async function seedPipelineAndStages(org: string): Promise<{ pipelineId: string; stageId: string; otherStageId: string }> {
  const { rows: pipeRows } = await pool.query<{ id: string }>(
    `insert into crm_pipelines (organization_id, name, slug) values ($1, 'Funil Stage Trigger', $2) returning id`,
    [org, `funil-stage-trigger-${Date.now()}-${Math.random()}`],
  );
  const pipelineId = pipeRows[0]!.id;
  const { rows: stageRows } = await pool.query<{ id: string }>(
    `insert into crm_stages (organization_id, pipeline_id, name, slug, position) values ($1, $2, 'Alvo', $3, 1000) returning id`,
    [org, pipelineId, `alvo-${Date.now()}-${Math.random()}`],
  );
  const { rows: otherStageRows } = await pool.query<{ id: string }>(
    `insert into crm_stages (organization_id, pipeline_id, name, slug, position) values ($1, $2, 'Outra', $3, 2000) returning id`,
    [org, pipelineId, `outra-${Date.now()}-${Math.random()}`],
  );
  return { pipelineId, stageId: stageRows[0]!.id, otherStageId: otherStageRows[0]!.id };
}

async function seedLead(org: string, pipelineId: string, stageId: string, contactId: string): Promise<string> {
  const { rows } = await pool.query<{ id: string }>(
    `insert into crm_leads (organization_id, pipeline_id, stage_id, contact_id, title) values ($1, $2, $3, $4, 'Lead Stage Trigger') returning id`,
    [org, pipelineId, stageId, contactId],
  );
  return rows[0]!.id;
}

async function seedStageChangeFlow(org: string, stageId: string): Promise<{ pointerId: string; versionId: string }> {
  const graph: FlowGraph = {
    nodes: [
      { id: "t1", type: "trigger", label: "Start", position: { x: 0, y: 0 }, config: {} },
      { id: "e1", type: "end", label: "Done", position: { x: 0, y: 0 }, config: { outcome: "converted" } },
    ],
    edges: [{ id: "t1-e1", source: "t1", target: "e1", priority: 0, condition: { type: "always" } }],
  };
  const { rows: versionRows } = await pool.query<{ id: string }>(
    `insert into followup_flow_versions (organization_id, graph) values ($1, $2) returning id`,
    [org, JSON.stringify(graph)],
  );
  const versionId = versionRows[0]!.id;
  const triggerConfig = { kind: "stage_change", params: { stage_id: stageId } };
  const { rows: pointerRows } = await pool.query<{ id: string }>(
    `insert into followup_flow_pointers (organization_id, name, status, active_version_id, trigger_config)
     values ($1, $2, 'active', $3, $4) returning id`,
    [org, `Stage Flow ${Date.now()}-${Math.random()}`, versionId, JSON.stringify(triggerConfig)],
  );
  return { pointerId: pointerRows[0]!.id, versionId };
}

async function seedPublishedAgentVersion(
  org: string,
  opts: { enabled?: boolean; pointerIds?: string[] },
): Promise<string> {
  const { rows: sessionRows } = await pool.query<{ id: string }>(
    `insert into channel_sessions (organization_id, waha_session_name, status, webhook_secret_encrypted)
     values ($1, $2, 'WORKING', '\\x00'::bytea) returning id`,
    [org, `stage-session-${Date.now()}-${Math.random()}`],
  );
  const { rows: agentRows } = await pool.query<{ id: string }>(
    `insert into ai_agents (organization_id, name, system_prompt) values ($1, $2, 'prompt') returning id`,
    [org, `Stage Gate Agent ${Date.now()}-${Math.random()}`],
  );
  const agentId = agentRows[0]!.id;
  const followup = { enabled: opts.enabled ?? true, flow_pointer_ids: opts.pointerIds ?? [] };
  await pool.query(
    `insert into ai_agent_versions
       (organization_id, agent_id, version_number, system_prompt, provider, model, channel_session_id, status, followup)
     values ($1, $2, 1, 'prompt', 'anthropic', 'claude-sonnet-4-6', $3, 'published', $4)`,
    [org, agentId, sessionRows[0]!.id, JSON.stringify(followup)],
  );
  return agentId;
}

async function countLiveForContact(org: string, contactId: string): Promise<number> {
  const { rows } = await pool.query<{ n: string }>(
    `select count(*) as n from followup_enrollments
     where organization_id = $1 and contact_id = $2
       and status in ('active','waiting_reply','paused_handoff')`,
    [org, contactId],
  );
  return Number(rows[0]!.n);
}

function stageChangedRow(overrides: Partial<EventRow> & Pick<EventRow, "organization_id" | "entity_id" | "payload">): EventRow {
  return {
    id: `${Date.now()}-${Math.random()}`,
    event_type: "lead.stage_changed",
    entity_kind: "crm_lead",
    metadata: {},
    consumed_by: [],
    attempts: 0,
    ...overrides,
  };
}

const CLOCK = () => new Date();

describe("applyStageTriggerEvent — enrolla o contato quando a etapa bate", () => {
  it("pointer stage_change casando to_stage_id + gate habilitado → 1 enrollment no nó trigger", async () => {
    const org = nextOrgId();
    await seedOrg(org);
    const { pipelineId, stageId, otherStageId } = await seedPipelineAndStages(org);
    const contactId = await seedContact(org);
    const leadId = await seedLead(org, pipelineId, otherStageId, contactId);
    const { pointerId, versionId } = await seedStageChangeFlow(org, stageId);
    await seedPublishedAgentVersion(org, { enabled: true, pointerIds: [pointerId] });

    const row = stageChangedRow({
      organization_id: org,
      entity_id: leadId,
      payload: { pipeline_id: pipelineId, from_stage_id: otherStageId, to_stage_id: stageId },
    });

    const summary = await applyStageTriggerEvent({ db: stageTriggerDb(), gateDb: pgGateDb(), clock: CLOCK }, row);
    expect(summary.matched).toBe(true);
    expect(summary.enrolled).toBe(1);

    const enrollment = await pool.query<{ current_node_id: string; status: string; version_id: string }>(
      `select current_node_id, status, version_id from followup_enrollments where pointer_id = $1 and contact_id = $2`,
      [pointerId, contactId],
    );
    expect(enrollment.rows).toHaveLength(1);
    expect(enrollment.rows[0]!.current_node_id).toBe("t1");
    expect(enrollment.rows[0]!.status).toBe("active");
    expect(enrollment.rows[0]!.version_id).toBe(versionId);
  });

  it("evento com entity_kind='lead' (trigger legado de banco) → NOOP, não reage 2x", async () => {
    const org = nextOrgId();
    await seedOrg(org);
    const { pipelineId, stageId, otherStageId } = await seedPipelineAndStages(org);
    const contactId = await seedContact(org);
    const leadId = await seedLead(org, pipelineId, otherStageId, contactId);
    const { pointerId } = await seedStageChangeFlow(org, stageId);
    await seedPublishedAgentVersion(org, { enabled: true, pointerIds: [pointerId] });

    const row = stageChangedRow({
      organization_id: org,
      entity_id: leadId,
      entity_kind: "lead", // emissor legado — dedupe deve ignorar
      payload: { pipeline_id: pipelineId, from_stage_id: otherStageId, to_stage_id: stageId },
    });

    const summary = await applyStageTriggerEvent({ db: stageTriggerDb(), gateDb: pgGateDb(), clock: CLOCK }, row);
    expect(summary.matched).toBe(false);
    expect(await countLiveForContact(org, contactId)).toBe(0);
  });

  it("to_stage_id que nenhum pointer configura → NOOP", async () => {
    const org = nextOrgId();
    await seedOrg(org);
    const { pipelineId, stageId, otherStageId } = await seedPipelineAndStages(org);
    const contactId = await seedContact(org);
    const leadId = await seedLead(org, pipelineId, otherStageId, contactId);
    await seedStageChangeFlow(org, stageId); // pointer configurado pra `stageId`, não `otherStageId`

    const row = stageChangedRow({
      organization_id: org,
      entity_id: leadId,
      payload: { pipeline_id: pipelineId, from_stage_id: stageId, to_stage_id: otherStageId },
    });

    const summary = await applyStageTriggerEvent({ db: stageTriggerDb(), gateDb: pgGateDb(), clock: CLOCK }, row);
    expect(summary.matched).toBe(false);
    expect(await countLiveForContact(org, contactId)).toBe(0);
  });

  it("sem agente publicado habilitando o pointer → gate-out, 0 enrollments", async () => {
    const org = nextOrgId();
    await seedOrg(org);
    const { pipelineId, stageId, otherStageId } = await seedPipelineAndStages(org);
    const contactId = await seedContact(org);
    const leadId = await seedLead(org, pipelineId, otherStageId, contactId);
    await seedStageChangeFlow(org, stageId);
    // nenhum ai_agent_versions publicado nesta org habilitando o pointer

    const row = stageChangedRow({
      organization_id: org,
      entity_id: leadId,
      payload: { pipeline_id: pipelineId, from_stage_id: otherStageId, to_stage_id: stageId },
    });

    const summary = await applyStageTriggerEvent({ db: stageTriggerDb(), gateDb: pgGateDb(), clock: CLOCK }, row);
    expect(summary.matched).toBe(true);
    expect(summary.pointers_gated_out).toBe(1);
    expect(summary.enrolled).toBe(0);
    expect(await countLiveForContact(org, contactId)).toBe(0);
  });

  it("contato já vivo em outro fluxo (exclusividade org-wide) → skipped_existing, não erro", async () => {
    const org = nextOrgId();
    await seedOrg(org);
    const { pipelineId, stageId, otherStageId } = await seedPipelineAndStages(org);
    const contactId = await seedContact(org);
    const leadId = await seedLead(org, pipelineId, otherStageId, contactId);
    const { pointerId, versionId } = await seedStageChangeFlow(org, stageId);
    const agentId = await seedPublishedAgentVersion(org, { enabled: true, pointerIds: [pointerId] });

    // enrollment vivo pré-existente em outro pointer qualquer (simula sweep anterior)
    const other = await seedStageChangeFlow(org, otherStageId);
    await pool.query(
      `insert into followup_enrollments
         (organization_id, pointer_id, version_id, contact_id, current_node_id, status, next_eval_at, agent_id)
       values ($1, $2, $3, $4, 't1', 'active', now(), $5)`,
      [org, other.pointerId, other.versionId, contactId, agentId],
    );

    const row = stageChangedRow({
      organization_id: org,
      entity_id: leadId,
      payload: { pipeline_id: pipelineId, from_stage_id: otherStageId, to_stage_id: stageId },
    });

    const summary = await applyStageTriggerEvent({ db: stageTriggerDb(), gateDb: pgGateDb(), clock: CLOCK }, row);
    expect(summary.matched).toBe(true);
    expect(summary.enrolled).toBe(0);
    expect(summary.skipped_existing).toBe(1);
    expect(await countLiveForContact(org, contactId)).toBe(1); // ainda só o pré-existente
    expect(versionId).toBeTruthy(); // sanity — o fluxo alvo existe, só não ganhou o enrollment
  });
});
