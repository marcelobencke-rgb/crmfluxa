import { ETAPAS_INICIAIS } from "./pipeline-editing";

export interface EtapaDeNicho {
  name: string;
  slug: string;
  is_won: boolean;
  is_lost: boolean;
}

export interface NicheTemplate {
  id: string;
  label: string;
  /** Frase curta pro Select do onboarding — o que a pessoa reconhece, não o id técnico. */
  description: string;
  stages: readonly EtapaDeNicho[];
}

/**
 * Etapas por nicho — usadas SÓ no onboarding, pra reconfigurar o funil padrão
 * que `fn_seed_default_pipeline_for_org` semeia neutro (migration 0144). Ver
 * `lib/pipelines/apply-niche-template.ts` pra guarda de segurança.
 *
 * "e-commerce" e "clinica" não são invenção: e-commerce era o seed antigo
 * (hardcoded, agora vira OPÇÃO em vez de padrão forçado) e clínica foi
 * MEDIDO num tenant real já rodando neste banco (docs/current-state.md §1 —
 * "clínica → Primeiro contato, Avaliação, Proposta enviada, Negociação,
 * Tratamento fechado, Perdido"). Os outros três (imobiliária, infoproduto,
 * serviços) são rascunho de domínio, sem tenant medido — ajustar é
 * renomear/reordenar aqui, sem tocar em quem já escolheu o nicho antes.
 */
export const NICHE_TEMPLATES: readonly NicheTemplate[] = [
  {
    id: "ecommerce",
    label: "Loja online",
    description: "Carrinho, pagamento, envio — o funil clássico de e-commerce.",
    stages: [
      { name: "Carrinho abandonado", slug: "carrinho_abandonado", is_won: false, is_lost: false },
      { name: "Aguardando pagamento", slug: "aguardando_pagamento", is_won: false, is_lost: false },
      { name: "Pago", slug: "pago", is_won: true, is_lost: false },
      { name: "Em separação", slug: "em_separacao", is_won: false, is_lost: false },
      { name: "Enviado", slug: "enviado", is_won: false, is_lost: false },
      { name: "Entregue", slug: "entregue", is_won: false, is_lost: false },
      { name: "Pós-venda", slug: "pos_venda", is_won: false, is_lost: false },
      { name: "Cancelado", slug: "cancelado", is_won: false, is_lost: true },
    ],
  },
  {
    id: "clinica",
    label: "Clínica ou consultório",
    description: "Da primeira mensagem até o tratamento fechado.",
    stages: [
      { name: "Primeiro contato", slug: "primeiro_contato", is_won: false, is_lost: false },
      { name: "Avaliação", slug: "avaliacao", is_won: false, is_lost: false },
      { name: "Proposta enviada", slug: "proposta_enviada", is_won: false, is_lost: false },
      { name: "Negociação", slug: "negociacao", is_won: false, is_lost: false },
      { name: "Tratamento fechado", slug: "tratamento_fechado", is_won: true, is_lost: false },
      { name: "Perdido", slug: "perdido", is_won: false, is_lost: true },
    ],
  },
  {
    id: "imobiliaria",
    label: "Imobiliária",
    description: "Da visita agendada até o contrato assinado.",
    stages: [
      { name: "Novo contato", slug: "novo_contato", is_won: false, is_lost: false },
      { name: "Visita agendada", slug: "visita_agendada", is_won: false, is_lost: false },
      { name: "Visita realizada", slug: "visita_realizada", is_won: false, is_lost: false },
      { name: "Proposta enviada", slug: "proposta_enviada", is_won: false, is_lost: false },
      { name: "Contrato assinado", slug: "contrato_assinado", is_won: true, is_lost: false },
      { name: "Perdido", slug: "perdido", is_won: false, is_lost: true },
    ],
  },
  {
    id: "infoproduto",
    label: "Infoproduto / curso online",
    description: "Do interesse até a compra confirmada.",
    stages: [
      { name: "Lead", slug: "lead", is_won: false, is_lost: false },
      { name: "Interessado", slug: "interessado", is_won: false, is_lost: false },
      { name: "Checkout iniciado", slug: "checkout_iniciado", is_won: false, is_lost: false },
      { name: "Comprou", slug: "comprou", is_won: true, is_lost: false },
      { name: "Não comprou", slug: "nao_comprou", is_won: false, is_lost: true },
    ],
  },
  {
    id: "servicos",
    label: "Serviços em geral",
    description: "Do orçamento até o serviço fechado.",
    stages: [
      { name: "Novo contato", slug: "novo_contato", is_won: false, is_lost: false },
      { name: "Orçamento enviado", slug: "orcamento_enviado", is_won: false, is_lost: false },
      { name: "Negociação", slug: "negociacao", is_won: false, is_lost: false },
      { name: "Serviço fechado", slug: "servico_fechado", is_won: true, is_lost: false },
      { name: "Perdido", slug: "perdido", is_won: false, is_lost: true },
    ],
  },
] as const;

export type NicheId = (typeof NICHE_TEMPLATES)[number]["id"];

/** IDs válidos + "generic" (o padrão neutro — não mexe no funil). */
export const NICHE_IDS = [...NICHE_TEMPLATES.map((n) => n.id), "generic"] as const;
export type NicheOrGeneric = (typeof NICHE_IDS)[number];

export function findNicheTemplate(id: string): NicheTemplate | null {
  return NICHE_TEMPLATES.find((n) => n.id === id) ?? null;
}

/** As 4 etapas neutras, no mesmo formato — o que "generic" representa. */
export const ETAPAS_GENERICO: readonly EtapaDeNicho[] = ETAPAS_INICIAIS;
