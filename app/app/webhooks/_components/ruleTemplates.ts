import type { RuleTemplate } from "./RuleEditor";

/**
 * Modelos prontos pra reduzir a barreira de montar a primeira automação —
 * a tela nasce em branco hoje, e "quando algo acontece, faça algo" é uma
 * pergunta difícil sem exemplo na frente.
 *
 * Só entram combinações que o motor REALMENTE executa hoje — vocabulário de
 * `TRIGGER_LABELS`/`ACTION_LABELS` (lib/schemas/webhooks.ts,
 * app/app/webhooks/_components/labels.ts). "Lead parado 3 dias → avisa o
 * dono" (o exemplo do backlog original) ficou de fora de propósito: não
 * existe gatilho de inatividade nem ação de notificar o dono no motor hoje —
 * um modelo assim prometeria uma automação que nunca dispara.
 *
 * Campos que dependem de configuração do TENANT (funil, etapa, número de
 * WhatsApp, atendente) ficam em branco — o modelo economiza a decisão de
 * "o que automatizar", não finge saber a configuração de quem instalou.
 */
export const RULE_TEMPLATES: Array<RuleTemplate & { description: string }> = [
  {
    name: "Boas-vindas ao primeiro contato",
    description: "Contato novo chega pelo webhook → manda uma mensagem de boas-vindas.",
    trigger_event: "lead.created",
    conditions: [],
    actions: [
      {
        type: "send_whatsapp_message",
        config: {
          channel_session_id: "",
          template: "Oi {{nome}}! Recebemos seu contato e já vamos te atender 🙂",
        },
      },
    ],
  },
  {
    name: "Marcar quem veio do Instagram",
    description: "Lead com origem utm_source=instagram → ganha a tag automaticamente.",
    trigger_event: "lead.created",
    conditions: [{ field: "lead.source_metadata.utm_source", op: "eq", value: "instagram" }],
    actions: [{ type: "add_tag", config: { tags: ["instagram"] } }],
  },
  {
    name: "Marcar quem respondeu no WhatsApp",
    description: "Toda mensagem recebida → tag \"respondeu\", pra filtrar quem já interagiu.",
    trigger_event: "message.received",
    conditions: [],
    actions: [{ type: "add_tag", config: { tags: ["respondeu"] } }],
  },
  {
    name: "Avisar outro sistema quando ganhar um negócio",
    description: "Lead muda de etapa (escolha qual) → chama um webhook seu.",
    trigger_event: "lead.stage_changed",
    conditions: [{ field: "event.to_stage_id", op: "eq", value: "" }],
    actions: [{ type: "call_webhook", config: { url: "" } }],
  },
  {
    name: "Atribuir dono quando marcar urgente",
    description: "Lead ganha a tag \"urgente\" → atribui a um atendente (escolha quem).",
    trigger_event: "lead.tag_added",
    conditions: [{ field: "event.added_tags", op: "contains", value: "urgente" }],
    actions: [{ type: "assign_owner", config: { user_id: "" } }],
  },
];
