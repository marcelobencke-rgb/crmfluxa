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

/**
 * E-mail de suporte — MESMA regra do WhatsApp, e pela mesma razão medida.
 *
 * As duas telas em que o usuário está trancado do lado de fora (`/account-suspended`
 * e o cartão de Billing) traziam endereços fixos no código: `support@deskcomm.com.br`
 * e `suporte@deskcomm.app`. Os dois são da marca ANTERIOR do produto e não recebem
 * mensagem. Ou seja, a tela que existe para dizer "fale com alguém" mandava o usuário
 * escrever para o vazio — e é a tela em que ele tem menos alternativas, porque não
 * consegue nem entrar para procurar outro caminho.
 *
 * Endereço fixo no código está errado duas vezes num produto self-host: quem instala
 * para o próprio cliente precisa do suporte DELE ali, e um patch local se perderia no
 * `update.sh` (é a dor nº 1 de quem hospeda, e o motivo de `lib/branding.ts` existir).
 *
 * Sem configurar, devolve `null` e a tela não mostra contato nenhum. Isso é
 * deliberado: não ter para onde escrever é ruim, mas escrever para um endereço morto
 * é pior — some a mensagem e o usuário fica esperando resposta que não vem.
 *
 * Validação mínima de propósito (tem `@` com algo dos dois lados, sem espaço): o alvo
 * é pegar `.env` preenchido errado, não recusar endereço exótico porém válido.
 */
export function resolveSupportEmail(rawEmail: string | undefined | null): string | null {
  const email = (rawEmail ?? "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Lê o e-mail da fonte correta em cada lado da fronteira servidor/navegador. */
export function supportEmail(): string | null {
  if (typeof window !== "undefined") {
    return resolveSupportEmail(window.__PUBLIC_ENV__?.SUPPORT_EMAIL);
  }
  return resolveSupportEmail(process.env.SUPPORT_EMAIL);
}
