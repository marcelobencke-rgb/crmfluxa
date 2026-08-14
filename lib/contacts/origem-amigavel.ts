/**
 * Traduz `contacts.source_metadata` (qualquer `utm_*` recebido no webhook de
 * captação — ver `lib/webhooks/inbound.ts`) pra uma frase que o dono do
 * negócio lê sem precisar saber o que é UTM.
 *
 * Só traduz o que reconhece — valor de `utm_source` fora da lista aparece
 * como veio (honesto), não vira um chute de tradução.
 */
const UTM_SOURCE_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  google: "Google",
  whatsapp: "WhatsApp",
  tiktok: "TikTok",
  youtube: "YouTube",
  linkedin: "LinkedIn",
  email: "E-mail",
  organic: "Busca orgânica",
  direct: "Direto",
};

export function origemAmigavel(sourceMetadata: Record<string, unknown> | null | undefined): string | null {
  const utmSource = sourceMetadata?.utm_source;
  if (typeof utmSource !== "string" || utmSource.trim().length === 0) return null;

  const label = UTM_SOURCE_LABELS[utmSource.toLowerCase()] ?? utmSource;
  const campaign = sourceMetadata?.utm_campaign;
  if (typeof campaign === "string" && campaign.trim().length > 0) {
    return `${label} — campanha "${campaign}"`;
  }
  return label;
}
