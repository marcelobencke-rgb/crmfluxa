/**
 * A URL clicável de site/Instagram/Facebook — montada aqui, nunca gravada.
 *
 * `contacts.site/instagram/facebook` (migration 0150) guardam o IDENTIFICADOR
 * (domínio, handle), não a URL inteira — decisão de produto: se a regra de
 * montagem mudar um dia, muda uma função, não 20 linhas de contato reescritas
 * uma a uma. Um lugar só monta a URL para não repetir a regra do Facebook
 * (vanity name × `profile.php?id=`) em cada tela que precisar do link.
 */

/** `dettenbornodontologia.com.br` → `https://dettenbornodontologia.com.br`. Já com protocolo, mantém como está. */
export function urlDoSite(site: string | null | undefined): string | null {
  const v = (site ?? "").trim();
  if (v === "") return null;
  return /^https?:\/\//i.test(v) ? v : `https://${v}`;
}

/** `armstrainning` → `https://instagram.com/armstrainning`. */
export function urlDoInstagram(handle: string | null | undefined): string | null {
  const v = (handle ?? "").trim();
  if (v === "") return null;
  return `https://instagram.com/${v}`;
}

/**
 * `fluxaautomacao` → `https://facebook.com/fluxaautomacao`.
 * `123456789` (página sem vanity name) → `https://facebook.com/profile.php?id=123456789`.
 */
export function urlDoFacebook(identificador: string | null | undefined): string | null {
  const v = (identificador ?? "").trim();
  if (v === "") return null;
  if (/^\d+$/.test(v)) return `https://facebook.com/profile.php?id=${v}`;
  return `https://facebook.com/${v}`;
}
