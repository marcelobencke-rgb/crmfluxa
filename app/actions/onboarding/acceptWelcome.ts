"use server";

/**
 * Server Action: completes the welcome step. Updates `display_name`/`timezone`
 * on the org and stamps `onboarding_state.welcome` with accepted_at + meta.
 */
import { redirect } from "next/navigation";
import { z } from "zod";

import { audit } from "@/lib/audit";
import { logger } from "@/lib/logger";
import { welcomeSchema } from "@/lib/schemas/onboarding";
import { createAdminClient } from "@/lib/supabase/admin";
import { aplicarTemplateDeNicho } from "@/lib/pipelines/apply-niche-template";
import { requireOnboardingCtx, patchOnboardingState, OnboardingError } from "./_shared";

export type AcceptWelcomeResult =
  | { ok: true }
  | { ok: false; error: "auth_required" | "no_active_org" | "invalid_input" | "db_error"; details?: unknown };

export async function acceptWelcome(formData: FormData): Promise<AcceptWelcomeResult> {
  let ctx;
  try {
    ctx = await requireOnboardingCtx();
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: err.code as never };
    throw err;
  }

  const raw = {
    display_name: String(formData.get("display_name") ?? "").trim(),
    timezone: String(formData.get("timezone") ?? "America/Sao_Paulo"),
    accepted_terms_at: new Date().toISOString(),
    niche: String(formData.get("niche") ?? "generic"),
  };

  let input;
  try {
    input = welcomeSchema.parse(raw);
  } catch (err) {
    if (err instanceof z.ZodError) {
      return { ok: false, error: "invalid_input", details: err.flatten() };
    }
    throw err;
  }

  try {
    await patchOnboardingState(
      ctx.orgId,
      {
        welcome: {
          accepted_at: input.accepted_terms_at ?? new Date().toISOString(),
          timezone: input.timezone,
          display_name: input.display_name,
          niche: input.niche,
        },
      },
      { display_name: input.display_name, timezone: input.timezone },
    );
  } catch (err) {
    if (err instanceof OnboardingError) return { ok: false, error: "db_error", details: err.message };
    throw err;
  }

  // Nicho fica gravado em `settings.niche` (config atual, consultável sem
  // interpretar o histórico do wizard) E tenta reconfigurar o funil — a
  // guarda de `aplicarTemplateDeNicho` decide sozinha se é seguro. Erro aqui
  // NUNCA derruba o onboarding: a pior consequência é o funil continuar
  // genérico, o que já era o estado antes desta feature existir.
  let templateApplied = false;
  try {
    const admin = createAdminClient();
    const { data: orgRow } = await admin
      .from("organizations")
      .select("settings")
      .eq("id", ctx.orgId)
      .maybeSingle();
    const currentSettings = (orgRow?.settings as Record<string, unknown> | null) ?? {};
    await admin
      .from("organizations")
      .update({ settings: { ...currentSettings, niche: input.niche } })
      .eq("id", ctx.orgId);

    if (input.niche !== "generic") {
      const resultado = await aplicarTemplateDeNicho(admin, ctx.orgId, input.niche);
      templateApplied = resultado.applied;
    }
  } catch (err) {
    logger.error("[acceptWelcome] aplicar template de nicho falhou (não bloqueante)", {
      organization_id: ctx.orgId,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  await audit({
    action: "onboarding.welcome_completed",
    actorUserId: ctx.userId,
    organizationId: ctx.orgId,
    resourceType: "organization",
    resourceId: ctx.orgId,
    metadata: {
      display_name: input.display_name,
      timezone: input.timezone,
      niche: input.niche,
      niche_template_applied: templateApplied,
    },
  });

  redirect("/onboarding/connect-whatsapp");
}
