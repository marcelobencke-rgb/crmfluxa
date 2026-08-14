import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { createClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(
  _req: NextRequest,
  ctx: { params: Promise<{ id: string }> },
): Promise<Response> {
  const requestId = randomUUID();
  const { id: contactId } = await ctx.params;

  const supabase = await createClient();
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();
  if (authErr || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }

  // Busca a conversa 1 a 1 (is_group = false) associada ao contato.
  // Pela regra do sistema (migration 0027), há apenas 1 conversa 1 a 1 por canal.
  const { data, error } = await supabase
    .from("conversations")
    .select("id")
    .eq("contact_id", contactId)
    .eq("is_group", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    return fail("internal_error", error.message, 500, { requestId });
  }

  return ok({ conversationId: data?.id ?? null }, { requestId });
}
