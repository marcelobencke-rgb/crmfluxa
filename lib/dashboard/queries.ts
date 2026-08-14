import type { createClient } from "@/lib/supabase/server";
import type { Janela } from "./period";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export interface AtividadeHoje {
  id: string;
  assunto: string | null;
  proximo_passo: string | null;
  proximo_passo_em: string;
  contact_id: string;
  contact_name: string | null;
}

/**
 * O que está agendado pra hoje — mesmo motor do Radar (`demandas`,
 * `lib/leads/radar-de-risco.ts`), aqui só o corte "hoje" em vez de "esfriou".
 * RLS de usuário (client vem de `lib/supabase/server`, não admin): a mesma
 * regra que decide o que o Radar mostra decide o que o Painel mostra.
 */
export async function demandasDeHoje(
  supabase: Supabase,
  orgId: string,
  janela: Janela,
): Promise<AtividadeHoje[]> {
  const { data, error } = await supabase
    .from("demandas")
    .select("id, assunto, proximo_passo, proximo_passo_em, contact_id, contacts(display_name)")
    .eq("organization_id", orgId)
    .is("fechada_em", null)
    .not("proximo_passo_em", "is", null)
    .gte("proximo_passo_em", janela.from.toISOString())
    .lt("proximo_passo_em", janela.to.toISOString())
    .order("proximo_passo_em", { ascending: true });

  if (error) throw new Error(`demandasDeHoje: ${error.message}`);

  return (data ?? []).map((d) => ({
    id: d.id as string,
    assunto: d.assunto as string | null,
    proximo_passo: d.proximo_passo as string | null,
    proximo_passo_em: d.proximo_passo_em as string,
    contact_id: d.contact_id as string,
    contact_name:
      (d.contacts as unknown as { display_name: string | null } | null)?.display_name ?? null,
  }));
}

export interface MovimentacaoSemana {
  id: string;
  lead_id: string;
  lead_title: string | null;
  reason: string | null;
  performed_at: string;
}

/**
 * Negócios que mudaram de etapa esta semana. `reason` já vem pronto em
 * português (`stageChangeReason()`, gravado por quem move o card) — não
 * reconstrói frase a partir de `payload`, que não é uniforme entre os
 * emissores (arrasto humano usa `from_stage_id/to_stage_id`, sincronização do
 * agente usa `de/para`).
 */
export async function movimentacoesDaSemana(
  supabase: Supabase,
  orgId: string,
  janela: Janela,
  limite = 8,
): Promise<MovimentacaoSemana[]> {
  const { data, error } = await supabase
    .from("crm_lead_activities")
    .select("id, lead_id, reason, performed_at, crm_leads(title)")
    .eq("organization_id", orgId)
    .eq("type", "stage_changed")
    .gte("performed_at", janela.from.toISOString())
    .order("performed_at", { ascending: false })
    .limit(limite);

  if (error) throw new Error(`movimentacoesDaSemana: ${error.message}`);

  return (data ?? []).map((a) => ({
    id: a.id as string,
    lead_id: a.lead_id as string,
    lead_title: (a.crm_leads as unknown as { title: string } | null)?.title ?? null,
    reason: a.reason as string | null,
    performed_at: a.performed_at as string,
  }));
}

export interface PrevisaoDoMes {
  totalCents: number;
  quantidade: number;
}

/**
 * "Quanto deve entrar este mês" — soma o `value_cents` dos negócios ABERTOS
 * com fechamento previsto dentro da janela, sem ponderar por placar de risco.
 *
 * Decisão deliberada: `crm_lead_scores` (o placar de `score.probability`) fica
 * de fora. Ausência de placar é estado LEGÍTIMO — "sinal insuficiente", não
 * exceção rara (ver comentário em lib/types/leads.ts) — então ponderar por ele
 * faria a previsão cair pra zero ou pra um número inventado exatamente nos
 * negócios sem placar, que costumam ser a maioria. Este número é a data que a
 * PESSOA que vende se comprometeu, não uma estimativa de máquina — mesmo
 * princípio que fez a Evolução da IA recusar prometer uma comparação que não
 * calculava de verdade.
 */
export async function previsaoDoMes(
  supabase: Supabase,
  orgId: string,
  janela: Janela,
): Promise<PrevisaoDoMes> {
  const { data, error } = await supabase
    .from("crm_leads")
    .select("value_cents")
    .eq("organization_id", orgId)
    .eq("status", "open")
    .gte("expected_close_date", janela.from.toISOString().slice(0, 10))
    .lt("expected_close_date", janela.to.toISOString().slice(0, 10));

  if (error) throw new Error(`previsaoDoMes: ${error.message}`);

  const linhas = data ?? [];
  const totalCents = linhas.reduce((acc, l) => acc + ((l.value_cents as number | null) ?? 0), 0);
  return { totalCents, quantidade: linhas.length };
}

/**
 * Meta de receita mensal — organizations.settings.monthly_revenue_goal_cents
 * (Configurações › Organização). `null` = sem meta definida, estado normal de
 * quem ainda não configurou — não é 0, que significaria "a meta é vender nada".
 */
export async function metaMensal(supabase: Supabase, orgId: string): Promise<number | null> {
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", orgId)
    .maybeSingle();

  if (error) throw new Error(`metaMensal: ${error.message}`);

  const raw = (data?.settings as { monthly_revenue_goal_cents?: unknown } | null)
    ?.monthly_revenue_goal_cents;
  return typeof raw === "number" ? raw : null;
}
