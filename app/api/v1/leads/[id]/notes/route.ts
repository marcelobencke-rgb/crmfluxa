import { requireSupportWrite } from "@/lib/impersonate/support";
/**
 * POST /api/v1/leads/[id]/notes
 *
 * A anotação manual no negócio — o humano registrando algo que não é um efeito
 * de nenhuma outra ação (não é "mudou de etapa", não é "editou campo"; é
 * alguém escrevendo um lembrete na timeline). Vira uma linha `type: "note"` em
 * `crm_lead_activities` — o tipo já existia no vocabulário (activity-vocabulary.ts,
 * rótulo "Anotação"); só faltava uma rota que escrevesse nele.
 *
 * Ao contrário do `emitLeadActivity` de outros escritores (fire-and-forget: a
 * timeline não pode derrubar a operação que ela descreve), aqui a nota É a
 * operação — se o insert falhar, a resposta tem de falhar também, senão o
 * usuário vê o campo esvaziar e acredita que a nota foi salva.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";
import { z } from "zod";

import { fail, ok } from "@/lib/api/wrappers";
import { createClient } from "@/lib/supabase/server";
import { requireRole } from "@/lib/auth/require-role";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";
import { traduzir } from "@/lib/i18n/dicionario";

export const dynamic = "force-dynamic";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

const Body = z.object({
  body: z.string().trim().min(1).max(4000),
});

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const supportDenied = await requireSupportWrite();
  if (supportDenied) return supportDenied;

  const requestId = randomUUID();
  const { id: leadId } = await ctx.params;

  // spec 13 §4: escrita no funil é agent+ — viewer lê a timeline, não escreve nela.
  const authz = await requireRole("agent", { requestId, resource: "crm_leads" });
  if (!authz.ok) return authz.response;
  const t = (texto: string) => traduzir(texto, authz.user.idioma);

  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return fail("validation_failed", t("Escreva algo antes de enviar."), 422, {
      requestId,
      details: { issues: parsed.error.issues },
    });
  }

  const supabase = await createClient();

  // O lead vem pela RLS do caller — é ele que prova a org, nunca o body.
  const { data: lead, error: leadErr } = await supabase
    .from("crm_leads")
    .select("id, organization_id, contact_id")
    .eq("id", leadId)
    .maybeSingle();
  if (leadErr) return fail("internal_error", leadErr.message, 500, { requestId });
  if (!lead) return fail("not_found", t("Lead não encontrado."), 404, { requestId });

  const row = lead as { id: string; organization_id: string; contact_id: string | null };

  const atividade = await emitLeadActivity(supabase, {
    organizationId: row.organization_id,
    leadId: row.id,
    contactId: row.contact_id,
    type: "note",
    sourceModule: "crm",
    sourceId: row.id,
    actor: { type: "user", id: authz.user.id },
    reason: parsed.data.body,
  });
  if (!atividade.ok) {
    return fail("internal_error", atividade.error ?? "activity insert failed", 500, { requestId });
  }

  return ok({ lead_id: row.id, body: parsed.data.body }, { requestId, status: 201 });
}
