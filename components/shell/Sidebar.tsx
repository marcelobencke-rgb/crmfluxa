"use client";
import { cn } from "@/lib/utils";
import { SidebarNav } from "./SidebarNav";

/**
 * Navegação principal do DESKTOP — `fixed`, sempre visível a partir de `md`.
 *
 * Abaixo de `md` fica `hidden`: o conteúdo da navegação é o mesmo
 * (`SidebarNav`), mas quem desenha em telas estreitas é `MobileNav`, numa
 * drawer que abre por um botão no `TopBar` — o padrão que faltava (ver
 * `docs/current-state.md` §3, achado de produto "transbordo a 390px").
 * Sidebar fixo + tela de 390px não é overflow (isso já foi corrigido, ver
 * `AppShell.tsx`), é 240px permanentemente tomados de 390 — inutilizável.
 */
export function Sidebar({ collapsed }: { collapsed: boolean }) {
  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-30 hidden flex-col border-r bg-card transition-[width] duration-200 md:flex",
        collapsed ? "w-16" : "w-60",
      )}
    >
      <SidebarNav collapsed={collapsed} />
    </aside>
  );
}
