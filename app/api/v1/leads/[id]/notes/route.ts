/**
 * POST /api/v1/leads/[id]/notes — anotação manual do time sobre o negócio.
 *
 * NÃO é tabela própria: `crm_lead_activities` já reserva `type='note'`
 * (lib/leads/activity-vocabulary.ts) com `reason` como o texto legível — é
 * exatamente o formato de uma nota. Uma `crm_lead_notes` separada duplicaria a
 * mesma informação (a doutrina DIRC pergunta "vive aqui mesmo?" antes de
 * qualquer coisa) e teria que reaprender, sozinha, o que a 0071 já resolveu:
 * RLS por org, redação em cascade LGPD (a função de redact já zera `reason` de
 * toda `crm_lead_activities` do contato) e o join de nome do autor.
 *
 * A escrita FALHA ALTO (500) quando o INSERT falha — diferente do
 * `lead_edited` de `_handler.ts`, que registra o RASTRO de uma mutação que já
 * aconteceu em `crm_leads` e por isso pode falhar baixo sem enganar ninguém.
 * Aqui não há mutação nenhuma fora desta linha: a atividade É a nota. Mesmo
 * raciocínio do POST /leads/[id]/next-action.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { createNoteSchema } from "@/lib/schemas/notes";
import { createClient } from "@/lib/supabase/server";
import { emitLeadActivity } from "@/lib/leads/activity-emitter";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("agent", { requestId, resource: "crm_lead_notes" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { id: leadId } = await params;

  const supabase = await createClient();
  // O lead vem pela RLS do caller — é ele que prova a org, nunca o body.
  const { data: lead, error: leadErr } = await supabase
    .from("crm_leads")
    .select("id, contact_id")
    .eq("id", leadId)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (leadErr) return fail("internal_error", leadErr.message, 500, { requestId });
  if (!lead) return fail("not_found", "Negócio não encontrado.", 404, { requestId });

  const raw = await req.json().catch(() => null);
  const parsed = createNoteSchema.safeParse(raw);
  if (!parsed.success) {
    return fail("validation_failed", "Dados inválidos.", 422, {
      requestId,
      details: parsed.error.flatten().fieldErrors as Record<string, unknown>,
    });
  }

  const atividade = await emitLeadActivity(supabase, {
    organizationId: org.orgId,
    leadId,
    contactId: (lead as { contact_id: string | null }).contact_id,
    type: "note",
    sourceModule: "lead_note",
    sourceId: null,
    actor: { type: "user", id: user.id },
    // O REASON É O TEXTO DA NOTA — diferente do `lead_edited`, que proíbe
    // valor no reason. Aqui a nota INTEIRA é o que a pessoa quis registrar; a
    // redação LGPD do contato já limpa este campo (0071 §F), então o mesmo
    // cuidado que protege o resto da timeline protege esta linha.
    reason: parsed.data.body,
  });
  if (!atividade.ok) {
    return fail("internal_error", atividade.error ?? "activity insert failed", 500, {
      requestId,
    });
  }

  void audit({
    action: "lead.note_added",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_lead",
    resourceId: leadId,
    requestId,
  });

  return ok({ lead_id: leadId }, { requestId, status: 201 });
}
