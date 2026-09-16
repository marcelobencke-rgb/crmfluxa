/**
 * Quais faixas do card do Kanban ficam visíveis — `crm_pipelines.settings.card_fields`.
 *
 * Compartilhado por FUNIL, não por pessoa: quem configura, o time inteiro vê
 * igual — mesmo modelo já usado para `canonical_tags` e para os campos
 * personalizados do negócio. Uma preferência por usuário faria o mesmo board
 * parecer diferente pra cada atendente, e "o card do Fulano tem um campo que o
 * meu não tem" é precisamente a confusão que este contrato existe pra evitar.
 *
 * Só os campos que o card JÁ sabe desenhar entram na lista — nada de campo
 * PERSONALIZADO aqui (isso é outro pedido, com outro custo: desenhar cada
 * TIPO de campo dentro do espaço fixo do card). `contact_name`/`contact_phone`
 * não são exceção a essa regra: são campos FIXOS de `contacts` (nome,
 * telefone), resolvidos pela mesma rota que já resolve `conversa` — não um
 * campo arbitrário que o funil cadastrou.
 */
export const CAMPOS_DO_CARD = [
  "value",
  "tag",
  "owner",
  "stage_age",
  "ai_signal",
  "conversation",
  "contact_name",
  "contact_phone",
] as const;

export type CampoDoCard = (typeof CAMPOS_DO_CARD)[number];

/** O rótulo de cada campo, para o seletor — passa por `t()` no componente. */
export const ROTULO_DO_CAMPO: Record<CampoDoCard, string> = {
  value: "Valor",
  tag: "Tag",
  owner: "Responsável",
  stage_age: "Tempo na etapa",
  ai_signal: "Sinal da IA",
  conversation: "Última mensagem",
  contact_name: "Nome do contato",
  contact_phone: "Telefone do contato",
};

function ehCampoDoCard(v: unknown): v is CampoDoCard {
  return typeof v === "string" && (CAMPOS_DO_CARD as readonly string[]).includes(v);
}

/**
 * Lê `settings.card_fields`. Chave AUSENTE (pipeline nunca configurado) cai
 * para "tudo visível" — o comportamento de sempre, sem exigir migração nem
 * backfill. Chave PRESENTE mas vazia é diferente: é a pessoa dizendo "não
 * quero nenhum destes no card", e isso tem de ser respeitado, não revertido
 * para o padrão.
 */
export function camposVisiveisDoCard(
  settings: Record<string, unknown> | null | undefined,
): Set<CampoDoCard> {
  const raw = (settings as { card_fields?: unknown } | null | undefined)?.card_fields;
  if (raw === undefined || raw === null) return new Set(CAMPOS_DO_CARD);
  if (!Array.isArray(raw)) return new Set(CAMPOS_DO_CARD);
  return new Set(raw.filter(ehCampoDoCard));
}
