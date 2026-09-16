/**
 * Máscara de exibição do CPF — client-safe.
 *
 * Vive separado de `lib/contacts/cpf.ts` porque aquele arquivo importa
 * `node:crypto` (pro hash) e não pode ser puxado por um componente de
 * cliente. `normalizeCpf` de lá delega pra cá — uma regra só, dos dois lados.
 */

export function normalizeCpfDigits(raw: string): string {
  return raw.replace(/\D/g, "");
}

/** "00000000000" digitado progressivamente → "000.000.000-00". */
export function maskCpf(raw: string): string {
  const d = normalizeCpfDigits(raw).slice(0, 11);
  const p1 = d.slice(0, 3);
  const p2 = d.slice(3, 6);
  const p3 = d.slice(6, 9);
  const p4 = d.slice(9, 11);
  let out = p1;
  if (p2) out += `.${p2}`;
  if (p3) out += `.${p3}`;
  if (p4) out += `-${p4}`;
  return out;
}
