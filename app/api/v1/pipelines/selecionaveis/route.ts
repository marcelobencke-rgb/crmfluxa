/**
 * GET /api/v1/pipelines/selecionaveis — todos os funis não arquivados da org
 * ativa, cada um já com seus estágios, no role `agent` (não `manager`).
 *
 * Irmã de `/api/v1/pipelines/default` (mesmo motivo, plural): "criar negócio
 * pra este contato" pede ESCOLHER o funil, não só "algum funil" — e
 * `GET /api/v1/pipelines` (a listagem de gestão, usada pelo Select de webhook)
 * é `manager`-only de propósito. Quem atende (`agent`) também cria negócio
 * manualmente pela ficha do contato, e não pode ficar de fora.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import type { Pipeline, Stage } from "@/lib/kanban/types";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "pipelines" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const supabase = await createClient();

  const { data: pipelines, error: pipelinesErr } = await supabase
    .from("crm_pipelines")
    .select("*")
    .eq("organization_id", org.orgId)
    .eq("is_archived", false)
    .order("is_default", { ascending: false })
    .order("position", { ascending: true });
  if (pipelinesErr) return fail("internal_error", pipelinesErr.message, 500, { requestId });

  const { data: stages, error: stagesErr } = await supabase
    .from("crm_stages")
    .select("*")
    .eq("organization_id", org.orgId)
    .eq("is_archived", false)
    .order("position");
  if (stagesErr) return fail("internal_error", stagesErr.message, 500, { requestId });

  const stagesPorPipeline = new Map<string, Stage[]>();
  for (const s of (stages ?? []) as Stage[]) {
    const lista = stagesPorPipeline.get(s.pipeline_id) ?? [];
    lista.push(s);
    stagesPorPipeline.set(s.pipeline_id, lista);
  }

  return ok(
    {
      pipelines: ((pipelines ?? []) as Pipeline[]).map((p) => ({
        ...p,
        stages: stagesPorPipeline.get(p.id) ?? [],
      })),
    },
    { requestId },
  );
}
