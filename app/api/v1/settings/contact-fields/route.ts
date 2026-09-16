/**
 * GET /api/v1/settings/contact-fields — as definições de campo personalizado
 * da ficha do contato (`organizations.settings.contact_fields`), da org ativa.
 *
 * `agent`, não `manager`: quem abre a ficha de um contato para editar (o
 * dossiê, a tabela de contatos) é qualquer atendente — mesmo bar de
 * `GET /api/v1/pipelines/default`, que existe pelo mesmo motivo.
 */
import { randomUUID } from "node:crypto";

import { ok, fail } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createClient } from "@/lib/supabase/server";
import { camposDoContato } from "@/lib/contacts/campos-personalizados";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "contact_fields" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", org.orgId)
    .maybeSingle();
  if (error) return fail("internal_error", error.message, 500, { requestId });

  const fields = camposDoContato((data?.settings as Record<string, unknown> | null) ?? null);
  return ok({ fields }, { requestId });
}
