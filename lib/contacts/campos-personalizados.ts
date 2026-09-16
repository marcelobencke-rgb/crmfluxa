import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";

/**
 * Lê `organizations.settings.contact_fields` sem explodir se o jsonb estiver
 * velho ou vazio.
 *
 * ⚠️ INDEPENDENTE de `lib/leads/campos-do-funil.ts`. Os campos do NEGÓCIO
 * moram no funil (`crm_pipelines.settings.fields[]`) porque cada negócio
 * pertence a um funil só; os campos do CONTATO moram na organização porque um
 * contato pode ter negócio em vários funis — usar "o funil padrão, seja ele
 * qual for" como fonte fazia a ficha do contato mudar de campo sozinha se
 * alguém trocasse qual funil é o padrão, sem essa ser uma decisão sobre
 * contatos.
 */
export function camposDoContato(
  orgSettings: Record<string, unknown> | null | undefined,
): CustomFieldDef[] {
  if (!orgSettings) return [];
  const raw = orgSettings.contact_fields;
  if (!Array.isArray(raw)) return [];
  const out: CustomFieldDef[] = [];
  for (const item of raw) {
    const parsed = customFieldSchema.safeParse(item);
    if (parsed.success) out.push(parsed.data);
  }
  return out;
}
