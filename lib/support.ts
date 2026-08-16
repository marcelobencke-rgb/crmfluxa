/**
 * Contato de suporte (WhatsApp) — configurável pelo `.env`, SEM rebuild.
 *
 * Mesmo modelo de `lib/branding.ts`: cada instalação self-host tem um dono
 * diferente, então o número não pode ser fixo no código (isso mostraria o
 * WhatsApp de quem escreveu o CRM pra todo clone, não o do operador real).
 *
 * NÃO é `NEXT_PUBLIC_*` de propósito — seria queimado no bundle durante o
 * `next build`, e o self-hoster roda uma imagem PRÉ-BUILDADA. Vale para
 * servidor (`process.env`) e navegador (`window.__PUBLIC_ENV__`, injetado em
 * runtime pelo `<PublicEnvScript/>`).
 */

/**
 * Normaliza um número de WhatsApp em link `wa.me`. Aceita o número com ou sem
 * formatação (espaços, parênteses, `+`) — mantém só os dígitos.
 */
export function resolveSupportWhatsappLink(rawNumber: string | undefined | null): string | null {
  const digits = (rawNumber ?? "").replace(/\D/g, "");
  if (digits.length < 10) return null;
  return `https://wa.me/${digits}`;
}

/** Lê o número da fonte correta em cada lado da fronteira servidor/navegador. */
export function supportWhatsappLink(): string | null {
  if (typeof window !== "undefined") {
    return resolveSupportWhatsappLink(window.__PUBLIC_ENV__?.SUPPORT_WHATSAPP_NUMBER);
  }
  return resolveSupportWhatsappLink(process.env.SUPPORT_WHATSAPP_NUMBER);
}
