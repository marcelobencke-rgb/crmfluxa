import { randomUUID } from "node:crypto";
import { type NextRequest } from "next/server";

import { fail, ok } from "@/lib/api/wrappers";
import { loadAuthUser, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";

interface RouteCtx {
  params: Promise<{ id: string }>;
}

export async function POST(req: NextRequest, ctx: RouteCtx): Promise<Response> {
  const requestId = randomUUID();
  const { id: conversationId } = await ctx.params;
  const supabase = await createClient();

  const user = await loadAuthUser();
  const activeOrg = user ? await resolveActiveOrg(user) : null;
  if (!activeOrg || !user) {
    return fail("unauthenticated", "Auth required.", 401, { requestId });
  }

  // Zera o unread_count_for_assignee para a conversa.
  // Apenas quem tem acesso à conversa consegue zerar (a RLS aplica na update).
  const { error } = await supabase
    .from("conversations")
    .update({ unread_count_for_assignee: 0 })
    .eq("id", conversationId)
    .eq("organization_id", activeOrg.orgId);

  if (error) {
    return fail("internal_error", "Erro ao marcar como lida.", 500, { requestId });
  }

  return ok({ success: true }, { requestId });
}
