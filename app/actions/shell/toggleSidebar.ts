"use server";
import { cookies } from "next/headers";
import { cookieSecure } from "@/lib/supabase/cookie-secure";

/**
 * Só persiste a preferência no cookie (pra SSR não "piscar" no próximo load).
 *
 * NÃO revalida o layout: `/app/layout.tsx` refaz autenticação, resolve a
 * organização ativa e roda várias queries Supabase — invalidar aquilo por um
 * clique de recolher/expandir custava a tela inteira de novo só para trocar
 * um `w-16`/`w-60`. O estado visual é 100% client-side (`Sidebar.tsx`); este
 * action é fire-and-forget.
 */
export async function toggleSidebar(currentlyCollapsed: boolean): Promise<void> {
  const store = await cookies();
  store.set("sidebar_collapsed", currentlyCollapsed ? "0" : "1", {
    httpOnly: true,
    sameSite: "strict",
    secure: cookieSecure(),
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}
