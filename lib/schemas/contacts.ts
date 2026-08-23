/**
 * Zod schemas for `/api/v1/contacts/*` endpoints (EPIC-05 waves 1, 2, 8).
 *
 * Contracts:
 *  - contactCreateSchema    → POST /api/v1/contacts
 *  - contactPatchSchema     → PATCH /api/v1/contacts/[id]
 *  - contactListQuerySchema → GET /api/v1/contacts (search/tag/source/cursor)
 *  - lgpdAnonymizeSchema    → POST /api/v1/lgpd/anonymize (irreversible)
 */
import { z } from "zod";

const PHONE_REGEX = /^\+\d{8,15}$/;
const CPF_DIGITS = /^\d{11}$/;

/**
 * Normalizações de entrada pra `site`/`instagram`/`facebook` (migration 0150).
 * O banco guarda IDENTIFICADOR (domínio/handle), nunca URL — quem digita pode
 * colar a URL inteira, com ou sem `@`/`www.`/protocolo, e sai reduzido ao
 * identificador puro antes de gravar. A URL clicável é montada só na exibição
 * (`lib/contacts/social-links.ts`).
 */
export function normalizarSite(v: string): string {
  return v.trim().replace(/\/+$/, "");
}

export function normalizarInstagram(v: string): string {
  return v
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^instagram\.com\//i, "")
    .replace(/^@/, "")
    .split(/[?/]/)[0]!;
}

/**
 * Facebook não tem uma regra única de handle: página sem vanity name só tem
 * `profile.php?id=<numero>`. Reduz pro número puro nesse caso; senão, pro
 * vanity name — quem exibe decide qual URL montar olhando se é só dígito.
 */
export function normalizarFacebook(v: string): string {
  const semPrefixo = v
    .trim()
    .replace(/^https?:\/\//i, "")
    .replace(/^www\./i, "")
    .replace(/^facebook\.com\//i, "")
    .replace(/^@/, "");
  const comoId = /^profile\.php\?id=(\d+)/i.exec(semPrefixo);
  if (comoId) return comoId[1]!;
  return semPrefixo.split(/[?/]/)[0]!;
}

/**
 * CPF check-digit validator (algoritmo oficial Receita Federal).
 * Rejeita repetidos (00000000000, 11111111111, ...) e dígitos verificadores inválidos.
 */
export function isValidCpf(raw: string): boolean {
  const s = raw.replace(/\D/g, "");
  if (!CPF_DIGITS.test(s) || /^(\d)\1{10}$/.test(s)) return false;
  let sum = 0;
  for (let i = 0; i < 9; i++) sum += parseInt(s[i]!, 10) * (10 - i);
  let d1 = (sum * 10) % 11;
  if (d1 === 10) d1 = 0;
  if (d1 !== parseInt(s[9]!, 10)) return false;
  sum = 0;
  for (let i = 0; i < 10; i++) sum += parseInt(s[i]!, 10) * (11 - i);
  let d2 = (sum * 10) % 11;
  if (d2 === 10) d2 = 0;
  return d2 === parseInt(s[10]!, 10);
}

export const contactCreateSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  display_name: z.string().min(1).max(200).optional(),
  email: z.string().email().optional(),
  phone_number: z
    .string()
    .regex(PHONE_REGEX, "Telefone deve estar em formato E.164 (+5511999998888)")
    .optional(),
  cpf: z.string().refine(isValidCpf, "CPF inválido").optional(),
  site: z.string().trim().max(200).transform(normalizarSite).optional(),
  instagram: z.string().trim().max(120).transform(normalizarInstagram).optional(),
  facebook: z.string().trim().max(120).transform(normalizarFacebook).optional(),
  birthdate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  tags: z.array(z.string()).optional(),
  source: z.string().min(1).default("manual"),
  source_metadata: z.record(z.string(), z.unknown()).optional(),
  consent: z.record(z.string(), z.unknown()).optional(),
});
export type ContactCreate = z.infer<typeof contactCreateSchema>;

export const contactPatchSchema = contactCreateSchema.partial().extend({
  source: z.string().min(1).optional(),
});
export type ContactPatch = z.infer<typeof contactPatchSchema>;

export const contactListQuerySchema = z.object({
  search: z.string().optional(),
  tag: z.string().optional(),
  source: z.string().optional(),
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});
export type ContactListQuery = z.infer<typeof contactListQuerySchema>;

export const lgpdAnonymizeSchema = z.object({
  contact_id: z.string().uuid(),
  justification: z.string().min(10).max(1000),
});
export type LgpdAnonymizeInput = z.infer<typeof lgpdAnonymizeSchema>;
