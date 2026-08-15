/**
 * Seed de demonstração: Imobiliária (Vendas e Locação)
 * Cria um ambiente simulado com agentes especialistas, contatos e dezenas de leads
 * em vários estágios de um funil imobiliário, com interações simuladas.
 *
 * Execução: pnpm tsx scripts/seed-imobiliaria.ts
 */

import { createClient } from "@supabase/supabase-js";
import { carregarEnvLocal } from "./lib/env-de-teste";

// Fix Node 20 WebSocket missing error in Supabase Client
if (typeof globalThis.WebSocket === "undefined") {
  globalThis.WebSocket = class WebSocket {
    constructor() { throw new Error("WebSocket not implemented"); }
  } as unknown as typeof globalThis.WebSocket;
}

const env = carregarEnvLocal();

const SUPABASE_URL = env.NEXT_PUBLIC_SUPABASE_URL!;
const SERVICE_ROLE = env.SUPABASE_SERVICE_ROLE_KEY!;

if (!SUPABASE_URL || !SERVICE_ROLE) {
  throw new Error("Faltam variáveis NEXT_PUBLIC_SUPABASE_URL ou SUPABASE_SERVICE_ROLE_KEY no .env.local");
}

const admin = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const PIPELINE_SLUG = "imobiliaria-vendas-locacao";
const HOUR = 3_600_000;

const STAGES = [
  { slug: "lead_novo", name: "Lead Novo", position: 1000, hours: 24 },
  { slug: "qualificacao", name: "Qualificação / Perfil", position: 2000, hours: 48 },
  { slug: "agendamento_visita", name: "Agendamento de Visita", position: 3000, hours: 72 },
  { slug: "visita_realizada", name: "Visita Realizada", position: 4000, hours: 48 },
  { slug: "proposta_negociacao", name: "Proposta e Negociação", position: 5000, hours: 120 },
  { slug: "analise_documentacao", name: "Análise de Documentação", position: 6000, hours: 72 },
  { slug: "fechado", name: "Fechado (Vendido/Alugado)", position: 7000, hours: null, isWon: true },
  { slug: "perdido", name: "Perdido (Desistência)", position: 8000, hours: null, isLost: true },
] as const;

const AGENTS = [
  {
    name: "Helena - Alto Padrão",
    description: "Corretora Especialista em Imóveis de Luxo e Vendas",
    model: "anthropic/claude-3-5-sonnet-20240620",
    system_prompt: "Você é Helena, uma corretora sênior especializada em imóveis de alto padrão. Seu tom é polido, sofisticado e consultivo. Sempre busque entender o perfil de investimento do cliente e destacar diferenciais de exclusividade.",
  },
  {
    name: "Marcos - Locação Ágil",
    description: "Corretor Especialista em Locação e Burocracia",
    model: "anthropic/claude-3-5-sonnet-20240620",
    system_prompt: "Você é Marcos, corretor especialista em locação. Seu foco é agilidade, fechamento rápido e tirar dúvidas sobre garantias locatícias, fiador e seguro fiança. Seu tom é prático, direto e amigável.",
  }
];

const CONTACTS = [
  { name: "Dr. Alberto", phone: "+5511999990001", email: "alberto.invest@email.com" },
  { name: "Família Silva", phone: "+5511999990002", email: "silva.familia@email.com" },
  { name: "Marina Costa", phone: "+5511999990003", email: "marina.costa@email.com" },
  { name: "Empresa XPTO Logística", phone: "+5511999990004", email: "logistica@xpto.com" },
  { name: "Lucas Fernandes", phone: "+5511999990005", email: "lucas.f@email.com" }
];

const LEADS = [
  {
    key: "venda_cobertura",
    title: "Venda - Cobertura Duplex Itaim Bibi",
    stage: "proposta_negociacao",
    agentRef: "Helena - Alto Padrão",
    contactRef: "Dr. Alberto",
    valueCents: 5_200_000_00, // 5.2 Milhões
    tags: ["alto-padrao", "venda", "investidor"],
    staleHours: 24,
    nextAction: "Apresentar a contraproposta de 5 milhões para o Dr. Alberto e confirmar a forma de pagamento.",
  },
  {
    key: "locacao_2qts",
    title: "Locação - Apto 2 Quartos Pinheiros",
    stage: "analise_documentacao",
    agentRef: "Marcos - Locação Ágil",
    contactRef: "Marina Costa",
    valueCents: 4_500_00, // R$ 4.500
    tags: ["locacao", "residencial"],
    staleHours: 80, // Estourou 72h do estágio
    nextAction: "Cobrar a Marina Costa sobre o envio do comprovante de renda do mês anterior.",
  },
  {
    key: "venda_galpao",
    title: "Venda - Galpão Comercial 1000m²",
    stage: "visita_realizada",
    agentRef: "Helena - Alto Padrão",
    contactRef: "Empresa XPTO Logística",
    valueCents: 8_500_000_00,
    tags: ["comercial", "venda"],
    staleHours: 12,
    nextAction: "Ligar para o diretor de logística e colher feedback sobre a estrutura do galpão após a visita de ontem.",
  },
  {
    key: "locacao_casa",
    title: "Locação - Casa 3 Quartos Brooklin",
    stage: "qualificacao",
    agentRef: "Marcos - Locação Ágil",
    contactRef: "Família Silva",
    valueCents: 7_800_00, // R$ 7.800
    tags: ["locacao", "casa"],
    staleHours: 50, // Estourou 48h
    nextAction: "Descobrir se a família Silva aceita seguro fiança ou possui fiador.",
  },
  {
    key: "venda_estudio",
    title: "Venda - Estúdio Jardins (Na Planta)",
    stage: "lead_novo",
    agentRef: "Marcos - Locação Ágil",
    contactRef: "Lucas Fernandes",
    valueCents: 450_000_00,
    tags: ["lancamento", "investimento"],
    staleHours: 2,
    nextAction: "Enviar o book digital do empreendimento e agendar visita ao decorado.",
  }
];

async function getOrg(): Promise<string> {
  const { data, error } = await admin.from("organizations").select("id").order("created_at").limit(1);
  if (error || !data || data.length === 0) {
    throw new Error("Nenhuma organização encontrada. Crie uma conta no CRM antes de rodar este seed.");
  }
  return data[0].id;
}

async function ensurePipeline(orgId: string): Promise<string> {
  const { data: existing } = await admin
    .from("crm_pipelines")
    .select("id")
    .eq("organization_id", orgId)
    .eq("slug", PIPELINE_SLUG)
    .maybeSingle();

  const vocabulary = {
    lead: "Negócio",
    lead_plural: "Negócios",
    deal: "Imóvel",
    deal_plural: "Imóveis",
    won: "Fechado",
    lost: "Perdido",
    stage: "Etapa",
    stage_plural: "Etapas",
  };

  const settings = {
    fields: [],
    canonical_tags: ["venda", "locacao"],
    lost_reasons: ["Preço muito alto", "Encontrou outro imóvel", "Desistiu da mudança"],
    identity_resolution: { fields_in_priority_order: ["phone_e164", "email", "cpf"] },
  };

  if (existing) {
    const id = existing.id;
    await admin.from("crm_pipelines").update({ vocabulary, settings } as never).eq("id", id);
    console.log(`[seed] pipeline existente: ${id}`);
    return id;
  }

  const { data, error } = await admin
    .from("crm_pipelines")
    .insert({
      organization_id: orgId,
      name: "Imobiliária - Vendas e Locação",
      slug: PIPELINE_SLUG,
      description: "Funil de Vendas de Imóveis e Locação.",
      is_default: false,
      position: 8000,
      vocabulary,
      settings,
    } as never)
    .select("id")
    .single();

  if (error || !data) throw new Error(`insert pipeline: ${error?.message}`);
  const id = data.id;
  console.log(`[seed] pipeline criado: ${id}`);
  return id;
}

async function ensureStages(orgId: string, pipelineId: string): Promise<Record<string, string>> {
  const ids: Record<string, string> = {};
  for (const s of STAGES) {
    const row = {
      organization_id: orgId,
      pipeline_id: pipelineId,
      name: s.name,
      slug: s.slug,
      position: s.position,
      expected_duration_hours: s.hours,
      is_won: "isWon" in s ? s.isWon : false,
      is_lost: "isLost" in s ? s.isLost : false,
      is_archived: false,
    };
    const { data: existing } = await admin
      .from("crm_stages")
      .select("id")
      .eq("pipeline_id", pipelineId)
      .eq("slug", s.slug)
      .maybeSingle();

    if (existing) {
      const id = existing.id;
      await admin.from("crm_stages").update(row as never).eq("id", id);
      ids[s.slug] = id;
    } else {
      const { data, error } = await admin
        .from("crm_stages")
        .insert(row as never)
        .select("id")
        .single();
      if (error || !data) throw new Error(`insert stage ${s.slug}: ${error?.message}`);
      ids[s.slug] = data.id;
    }
  }
  return ids;
}

async function ensureAgents(orgId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const a of AGENTS) {
    const { data: existing } = await admin.from("ai_agents").select("id").eq("organization_id", orgId).eq("name", a.name).maybeSingle();
    if (existing) {
      found.set(a.name, existing.id);
      continue;
    }
    const { data, error } = await admin.from("ai_agents").insert({
      organization_id: orgId,
      name: a.name,
      description: a.description,
      is_active: true,
      is_default: false,
      model: a.model,
      system_prompt: a.system_prompt,
      config: { temperature: 0.5, max_tokens: 1024 },
      guardrails: [],
    } as never).select("id").single();

    if (error || !data) throw new Error(`insert agent ${a.name}: ${error?.message}`);
    found.set(a.name, data.id);
  }
  return found;
}

async function ensureContacts(orgId: string): Promise<Map<string, string>> {
  const found = new Map<string, string>();
  for (const c of CONTACTS) {
    const { data: existing } = await admin.from("contacts").select("id").eq("organization_id", orgId).eq("phone_number", c.phone).maybeSingle();
    if (existing) {
      found.set(c.name, existing.id);
      continue;
    }
    const { data, error } = await admin.from("contacts").insert({
      organization_id: orgId,
      name: c.name,
      display_name: c.name,
      phone_number: c.phone,
      email: c.email,
      source: "manual",
      is_anonymized: false
    } as never).select("id").single();
    if (error || !data) throw new Error(`insert contact ${c.name}: ${error?.message}`);
    found.set(c.name, data.id);
  }
  return found;
}

async function upsertLead(
  orgId: string,
  pipelineId: string,
  stageIds: Record<string, string>,
  spec: typeof LEADS[number],
  agentIds: Map<string, string>,
  contactIds: Map<string, string>,
  position: number
): Promise<{ id: string; contactId: string | null }> {
  const stageId = stageIds[spec.stage];
  const lastActivityAt = new Date(Date.now() - spec.staleHours * HOUR).toISOString();
  
  const ownerAgentId = agentIds.get(spec.agentRef) ?? null;
  const contactId = contactIds.get(spec.contactRef) ?? null;

  const mutable = {
    stage_id: stageId,
    contact_id: contactId,
    owner_agent_id: ownerAgentId,
    owner_kind: "ai",
    assigned_at: lastActivityAt,
    value_cents: spec.valueCents,
    currency: "BRL",
    tags: spec.tags,
    last_activity_at: lastActivityAt,
    position_in_stage: position,
  };

  const { data: existing } = await admin
    .from("crm_leads")
    .select("id")
    .eq("organization_id", orgId)
    .eq("pipeline_id", pipelineId)
    .eq("title", spec.title)
    .maybeSingle();

  if (existing) {
    const id = existing.id;
    await admin.from("crm_leads").update(mutable as never).eq("id", id);
    return { id, contactId };
  }

  const { data, error } = await admin
    .from("crm_leads")
    .insert({
      organization_id: orgId,
      pipeline_id: pipelineId,
      title: spec.title,
      status: "open",
      source: "manual",
      ...mutable,
    } as never)
    .select("id")
    .single();

  if (error || !data) throw new Error(`insert lead "${spec.key}": ${error?.message}`);
  return { id: data.id, contactId };
}

async function ensureLeadState(orgId: string, contactId: string, nextAction: string) {
  const { data: atual } = await admin
    .from("lead_state")
    .select("id")
    .eq("organization_id", orgId)
    .eq("contact_id", contactId)
    .maybeSingle();

  if (atual) {
    await admin.from("lead_state").update({ next_action: nextAction }).eq("id", atual.id);
  } else {
    await admin.from("lead_state").insert({ organization_id: orgId, contact_id: contactId, next_action: nextAction } as never);
  }
}

async function main() {
  console.log("Iniciando simulação Imobiliária...");
  const orgId = await getOrg();
  console.log(`Organização vinculada: ${orgId}`);

  const pipelineId = await ensurePipeline(orgId);
  const stageIds = await ensureStages(orgId, pipelineId);
  const agentIds = await ensureAgents(orgId);
  const contactIds = await ensureContacts(orgId);

  let position = 1000;
  for (const spec of LEADS) {
    const { contactId } = await upsertLead(orgId, pipelineId, stageIds, spec, agentIds, contactIds, position);
    if (contactId && spec.nextAction) {
      await ensureLeadState(orgId, contactId, spec.nextAction);
    }
    position += 1000;
  }

  console.log(`\n✅ Simulação Imobiliária Completa!`);
  console.log(`Acesse o CRM e visualize o novo board: "Imobiliária - Vendas e Locação"`);
}

main().catch(console.error);
