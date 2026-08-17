"use server";

/**
 * Server Action: inicia o fluxo OAuth do Google Agenda pra um recurso (ou pra
 * conexão padrão da org, quando `resourceId` é null). Espelha
 * app/actions/integrations/connectNuvemshop.ts — mesmo formato de resultado,
 * mesma checagem de role.
 */

import { redirect } from "next/navigation";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { env } from "@/lib/env";
import { getConfig, redirectUri } from "@/lib/integrations/google-calendar/config";
import { buildAuthorizeUrl } from "@/lib/integrations/google-calendar/oauth";
import { issueState } from "@/lib/integrations/google-calendar/state";

export type ConnectResult =
  | { ok: false; error: "auth_required" | "no_active_org" | "forbidden" | "not_configured" };

export async function connectGoogleCalendar(resourceId: string | null): Promise<ConnectResult> {
  const user = await loadAuthUser();
  if (!user) return { ok: false, error: "auth_required" };

  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) return { ok: false, error: "no_active_org" };

  // Só admin conecta integração — crm_calendar_connections guarda credencial
  // (RLS crm_calendar_connections_admin_only, spec 18 §2.7).
  if (activeOrg.role !== "admin" && !user.is_platform_admin) {
    return { ok: false, error: "forbidden" };
  }

  const cfg = getConfig();
  if (!cfg) return { ok: false, error: "not_configured" };

  const state = issueState(activeOrg.orgId, resourceId);
  const url = buildAuthorizeUrl({
    cfg,
    redirectUri: redirectUri(env.NEXT_PUBLIC_APP_URL),
    state,
  });
  redirect(url);
}

/**
 * Wrapper de retorno `void` pra uso direto em `<form action={...}>` — form
 * action exige `(formData) => void | Promise<void>`, e `connectGoogleCalendar`
 * devolve `ConnectResult` nos caminhos que NÃO redirecionam (erro de validação).
 * Falha vira silêncio no clique aqui de propósito: são casos que a própria tela
 * já impede (aba só aparece pra admin, botão só aparece com `configured=true`).
 */
export async function connectGoogleCalendarFormAction(resourceId: string | null): Promise<void> {
  await connectGoogleCalendar(resourceId);
}
