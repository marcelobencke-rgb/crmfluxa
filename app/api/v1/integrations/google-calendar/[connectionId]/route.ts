/**
 * DELETE /api/v1/integrations/google-calendar/[connectionId] — desconecta.
 * Best-effort: para o canal de push no Google antes de apagar a linha (se falhar,
 * o canal expira sozinho em até 30 dias — não é motivo pra bloquear o disconnect).
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { audit } from "@/lib/audit";
import { fail, noContent } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { decryptWebhookSecret } from "@/lib/webhooks/secrets";
import { stopWatch } from "@/lib/integrations/google-calendar/client";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface RouteParams {
  params: Promise<{ connectionId: string }>;
}

export async function DELETE(_req: NextRequest, { params }: RouteParams): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_calendar_connections" });
  if (!authz.ok) return authz.response;
  const { user, org } = authz;
  const { connectionId } = await params;

  const supabase = await createClient();
  const { data: conn, error: selErr } = await supabase
    .from("crm_calendar_connections")
    .select("id, resource_id, watch_channel_id, watch_resource_id, oauth_access_token_encrypted")
    .eq("id", connectionId)
    .eq("organization_id", org.orgId)
    .maybeSingle();
  if (selErr) return fail("internal_error", "Erro ao buscar conexão.", 500, { requestId });
  if (!conn) return fail("not_found", "Conexão não encontrada.", 404, { requestId });

  if (conn.watch_channel_id) {
    const admin = createAdminClient();
    const accessToken = await decryptWebhookSecret(
      admin,
      conn.oauth_access_token_encrypted as unknown as string,
    );
    // watch_resource_id ainda não existe como coluna própria nesta wave — ver §5
    // (renovação de canal fica pro worker de pull). Sem ele não dá pra parar o
    // canal corretamente; deixa expirar sozinho em vez de chamar com dado errado.
    if (accessToken && conn.watch_resource_id) {
      try {
        await stopWatch(accessToken, conn.watch_channel_id, conn.watch_resource_id as string);
      } catch (err) {
        logger.warn("[google-calendar.disconnect] stopWatch falhou", {
          requestId,
          error: (err as Error).message,
        });
      }
    }
  }

  const { error: delErr } = await supabase
    .from("crm_calendar_connections")
    .delete()
    .eq("id", connectionId)
    .eq("organization_id", org.orgId);
  if (delErr) return fail("internal_error", "Erro ao desconectar.", 500, { requestId });

  void audit({
    action: "calendar_connection.disconnected",
    actorUserId: user.id,
    organizationId: org.orgId,
    resourceType: "crm_calendar_connection",
    resourceId: connectionId,
    requestId,
    metadata: { resource_id: conn.resource_id },
  });
  return noContent(requestId);
}
