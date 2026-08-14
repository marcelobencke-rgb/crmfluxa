"use client";
import type { ReactNode } from "react";
import { Sidebar } from "@/components/shell/Sidebar";
import { TopBar } from "@/components/shell/TopBar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  sidebarCollapsed: boolean;
  children: ReactNode;
}

export function AppShell({ sidebarCollapsed, children }: AppShellProps) {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar collapsed={sidebarCollapsed} />
      {/*
        `min-w-0` é o que permite a coluna de conteúdo ENCOLHER. Um flex item
        nasce com `min-width: auto`, ou seja, nunca fica menor que o conteúdo —
        então qualquer bloco largo (uma fila de abas, uma tabela) empurrava a
        PÁGINA INTEIRA para o lado em vez de rolar dentro da própria caixa, e o
        conteúdo sumia sem nada indicando que existia.

        Medido em 390x844 no detalhe do agente, que tem seis abas: a página
        estourava 476px na horizontal; com esta classe, 212px — o que sobra é o
        cabeçalho, presente também em telas que não têm abas (a lista de agentes
        estoura 236px). Isolado ancestral por ancestral: é este o que decide.
      */}
      <div
        className={cn(
          "flex h-full min-w-0 flex-1 flex-col transition-[margin] duration-200",
          // Sem margem em mobile: o Sidebar fixo fica `hidden` ali (MobileNav
          // assume a navegação numa drawer), então reservar 240px de margem
          // pra um elemento que não está desenhado era o que sobrava só 150px
          // de conteúdo numa tela de 390px.
          sidebarCollapsed ? "md:ml-16" : "md:ml-60",
        )}
      >
        <TopBar />
        <main className="flex flex-1 flex-col min-h-0 overflow-auto p-6">{children}</main>
      </div>
    </div>
  );
}
