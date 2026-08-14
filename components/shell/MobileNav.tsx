"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { List } from "@/lib/ui/icons";
import { SidebarNav } from "./SidebarNav";

/**
 * A porta que faltava em telas estreitas (< md): `Sidebar` fica `hidden` ali
 * (é `fixed` com 240px — sem overflow, mas tomando 61% de uma tela de 390px).
 * Reusa `SidebarNav` — mesmo conteúdo do sidebar desktop, sem duplicar a
 * lista de grupos/itens — dentro de uma `Sheet` (mesmo primitivo do dossiê do
 * lead), sempre expandida: "colapsar para ícones" não existe aqui, a ação de
 * fechar é a própria drawer.
 */
export function MobileNav() {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  // Rede de segurança além do onClick de cada link: cobre navegação por
  // botão voltar/avançar do navegador, que não passa pelo onNavigate. Ajuste
  // durante o render (não em efeito) — o padrão que o React recomenda pra
  // "resetar estado quando uma prop muda", sem o cascading render de um
  // setState síncrono dentro de useEffect.
  const [lastPathname, setLastPathname] = useState(pathname);
  if (pathname !== lastPathname) {
    setLastPathname(pathname);
    setOpen(false);
  }

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="md:hidden"
        onClick={() => setOpen(true)}
        aria-label="Abrir menu de navegação"
      >
        <List size={20} aria-hidden />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="left"
          className="flex w-60 max-w-[80vw] flex-col gap-0 p-0 sm:max-w-xs"
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SidebarNav collapsed={false} showCollapseToggle={false} onNavigate={() => setOpen(false)} />
        </SheetContent>
      </Sheet>
    </>
  );
}
