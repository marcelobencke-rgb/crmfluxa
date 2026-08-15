import { createClient } from "@supabase/supabase-js";
import { carregarEnvLocal } from "./lib/env-de-teste";

class DummyWebSocket {}
globalThis.WebSocket = DummyWebSocket as unknown as typeof WebSocket;

const env = carregarEnvLocal();

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY!;
if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY in .env.local");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function getFirstOrg(): Promise<string> {
  const { data, error } = await admin.from("organizations").select("id").limit(1).maybeSingle();
  if (error) throw new Error(`Erro ao buscar org: ${error.message}`);
  if (!data) throw new Error("Nenhuma organização encontrada.");
  return data.id;
}

async function createFlow(orgId: string, name: string, triggerConfig: Record<string, unknown>, handoffPolicy: string, graph: Record<string, unknown>) {
  console.log(`\n> Criando fluxo: "${name}"...`);
  
  // Create pointer
  const { data: pointer, error: pointerError } = await admin
    .from("followup_flow_pointers")
    .insert({
      organization_id: orgId,
      name,
      status: "draft",
      handoff_policy: handoffPolicy,
      trigger_config: triggerConfig,
      draft_graph: graph,
    })
    .select("id")
    .single();

  if (pointerError) {
    if (pointerError.code === "23505") {
      console.log(`Fluxo "${name}" já existe. Ignorando.`);
      return;
    }
    throw new Error(`Erro ao criar pointer: ${pointerError.message}`);
  }

  const pointerId = pointer.id;

  // Publish using RPC
  const { data: versionId, error: rpcError } = await admin.rpc("fn_publish_followup_flow_version", {
    p_pointer: pointerId,
    p_org: orgId,
    p_graph: graph,
    p_created_by: null,
  });

  if (rpcError) {
    throw new Error(`Erro ao publicar fluxo: ${rpcError.message}`);
  }

  console.log(`✅ Fluxo "${name}" publicado (pointer=${pointerId}, version=${versionId})`);
}

async function main() {
  const orgId = await getFirstOrg();
  console.log(`Iniciando seed de follow-ups para a org: ${orgId}`);

  // Flow 1: Recuperação de Contato
  const graph1 = {
    nodes: [
      {
        id: "trigger_1",
        type: "trigger",
        label: "Gatilho",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "action_1",
        type: "action",
        label: "Mensagem de Recuperação",
        position: { x: 0, y: 100 },
        config: {
          mode: "ai_message",
          prompt_hint: "Envie uma mensagem amigável para retomar o contato, perguntando se o cliente ainda está buscando imóveis ou se já fechou negócio. O tom deve ser leve e prestativo.",
        },
      },
      {
        id: "end_1",
        type: "end",
        label: "Fim do Fluxo",
        position: { x: 0, y: 200 },
        config: { outcome: "exhausted", note: "Mensagem de recuperação enviada." },
      },
    ],
    edges: [
      {
        id: "e1",
        source: "trigger_1",
        target: "action_1",
        priority: 0,
        condition: { type: "always" },
      },
      {
        id: "e2",
        source: "action_1",
        target: "end_1",
        priority: 0,
        condition: { type: "always" },
      },
    ],
  };

  await createFlow(orgId, "Recuperação de Contato", { kind: "silence", params: { threshold_minutes: 2880 } }, "cancel", graph1); // 48h silence

  // Flow 2: Pós-Visita
  const graph2 = {
    nodes: [
      {
        id: "trigger_2",
        type: "trigger",
        label: "Gatilho Manual",
        position: { x: 0, y: 0 },
        config: {},
      },
      {
        id: "wait_1",
        type: "wait",
        label: "Espera 1 dia",
        position: { x: 0, y: 100 },
        config: {
          mode: "fixed",
          duration_ms: 86400000, // 24h
        },
      },
      {
        id: "action_2",
        type: "action",
        label: "Mensagem Pós-Visita",
        position: { x: 0, y: 200 },
        config: {
          mode: "ai_message",
          prompt_hint: "Olá! O que achou da visita ao imóvel ontem? Se quiser podemos simular uma proposta sem compromisso, ou agendar para ver outras opções.",
        },
      },
      {
        id: "end_2",
        type: "end",
        label: "Fim do Fluxo",
        position: { x: 0, y: 300 },
        config: { outcome: "exhausted", note: "Follow-up pós visita enviado." },
      },
    ],
    edges: [
      {
        id: "e3",
        source: "trigger_2",
        target: "wait_1",
        priority: 0,
        condition: { type: "always" },
      },
      {
        id: "e4",
        source: "wait_1",
        target: "action_2",
        priority: 0,
        condition: { type: "always" },
      },
      {
        id: "e5",
        source: "action_2",
        target: "end_2",
        priority: 0,
        condition: { type: "always" },
      },
    ],
  };

  await createFlow(orgId, "Follow-up Pós-Visita", { kind: "manual" }, "cancel", graph2);

  console.log("\n✅ Seed de follow-ups imobiliários concluído!");
}

main().catch((err) => {
  console.error("\n❌ Erro durante o seed:", err);
  process.exit(1);
});
