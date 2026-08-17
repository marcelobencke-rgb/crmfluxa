/**
 * GET /api/v1/integrations/google-calendar/status?resource_id=...
 *
 * `configured` diz se o app TEM credencial OAuth pra oferecer a integração (env
 * var) — nunca some do payload, mesmo sem conexão, pra UI decidir se mostra o
 * botão "Conectar". `connection` é a conexão deste recurso (ou a padrão da
 * org, se `resource_id` omitido), sem os campos cifrados.
 */
import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { requireRole } from "@/lib/auth/require-role";
import { isConfigured } from "@/lib/integrations/google-calendar/config";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";
const COLS = "id, resource_id, external_calendar_id, status, last_synced_at, last_error, created_at";

export async function GET(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();
  const authz = await requireRole("admin", { requestId, resource: "crm_calendar_connections" });
  if (!authz.ok) return authz.response;
  const { org } = authz;

  const resourceId = new URL(req.url).searchParams.get("resource_id");
  const supabase = await createClient();
  let query = supabase.from("crm_calendar_connections").select(COLS).eq("organization_id", org.orgId);
  query = resourceId ? query.eq("resource_id", resourceId) : query.is("resource_id", null);
  const { data, error } = await query.maybeSingle();
  if (error) return fail("internal_error", "Erro ao buscar conexão.", 500, { requestId });

  return ok({ configured: isConfigured(), connection: data ?? null }, { requestId });
}
