"use server";

import { supportWriteError } from "@/lib/impersonate/support";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { createAdminClient } from "@/lib/supabase/admin";
import { audit } from "@/lib/audit";
import {
  contactFieldsConfigPatchSchema,
  type ContactFieldsConfigPatch,
} from "@/lib/schemas/settings";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

export type UpdateContactFieldsConfigResult =
  | { ok: true }
  | { ok: false; error: string; details?: unknown };

/**
 * Grava `organizations.settings.contact_fields` — as definições de campo
 * personalizado da FICHA DO CONTATO, independentes de qual funil é o padrão.
 *
 * Mesmo gate de `updatePipelineConfig`: admin+ (vocabulário/campos é decisão
 * de estrutura, não de operação do dia a dia).
 */
export async function updateContactFieldsConfig(
  patch: ContactFieldsConfigPatch,
): Promise<UpdateContactFieldsConfigResult> {
  const parsed = contactFieldsConfigPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return { ok: false, error: "validation_failed", details: parsed.error.flatten() };
  }

  const authUser = await loadAuthUser();
  if (!authUser) return { ok: false, error: "unauthenticated" };
  if (supportWriteError(authUser.support)) return { ok: false, error: "forbidden" };
  const activeOrg = await resolveActiveOrg(authUser);
  if (!activeOrg) return { ok: false, error: "forbidden_tenant" };
  if (!authUser.is_platform_admin && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    return { ok: false, error: "forbidden_role" };
  }

  // A ESCRITA EM `organizations` VAI PELO ADMIN CLIENT — mesma razão de
  // `updateTenant.ts`: a única policy de escrita da tabela é
  // `orgs_write_platform_admin`; pelo client de sessão, o UPDATE de quem não é
  // platform admin casa ZERO linhas e o PostgREST devolve sucesso (nenhuma
  // linha bateu o filtro não é erro). O gate de papel continua sendo o de
  // cima; o filtro por `organization_id` abaixo é explícito.
  const supabase = createAdminClient();
  const hdrs = await headers();
  const requestId = hdrs.get("x-request-id");

  const { data: orgRow, error: readErr } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };

  const currentSettings = (orgRow?.settings as Record<string, unknown> | null) ?? {};
  const nextSettings = { ...currentSettings, contact_fields: parsed.data.fields };

  const { error } = await supabase
    .from("organizations")
    .update({ settings: nextSettings })
    .eq("id", activeOrg.orgId);
  if (error) return { ok: false, error: error.message };

  await audit({
    action: "org.contact_fields_updated",
    actorUserId: authUser.id,
    organizationId: activeOrg.orgId,
    resourceType: "organization",
    resourceId: activeOrg.orgId,
    requestId,
    metadata: { fields_count: parsed.data.fields.length },
  });

  revalidatePath("/app/settings/tenant/contact-fields");
  return { ok: true };
}
