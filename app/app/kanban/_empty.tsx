"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { EmptyPipeline } from "@/components/empty";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { ApiError } from "@/lib/api/types";
import { useCriarFunil } from "@/hooks/pipelines/usePipelines";

function textoDoErro(e: unknown, t: (texto: string) => string): string {
  if (e instanceof ApiError) return t(e.message);
  if (e instanceof Error && e.message) return e.message;
  return t("Não consegui completar essa ação. Tente de novo.");
}

/**
 * O ÚNICO ESTADO EM QUE `/app/kanban` AINDA MOSTRA ALGO SEU: organização sem
 * nenhum funil, e portanto sem para onde redirecionar (ver `page.tsx`).
 *
 * O botão cria aqui mesmo e navega direto para o quadro novo — não manda para
 * outro lugar procurar um botão que não existiria lá.
 */
export function KanbanVazio({ podeGerenciar }: { podeGerenciar: boolean }) {
  const t = useT();
  const router = useRouter();
  const criar = useCriarFunil();
  const [novo, setNovo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  function criarFunil() {
    const nome = (novo ?? "").trim();
    if (!nome) return;
    setErro(null);
    criar.mutate(nome, {
      onSuccess: (r) => {
        // Partimos de ZERO funis: a resposta desta primeira criação só pode
        // ter a própria linha nova.
        const criado = r.data.pipelines[0];
        if (criado) router.push(`/app/pipelines/${criado.id}`);
      },
      onError: (e) => setErro(textoDoErro(e, t)),
    });
  }

  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 p-6">
      {novo !== null && (
        <Card className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center" data-testid="form-novo-funil">
          <Input
            autoFocus
            value={novo}
            onChange={(e) => setNovo(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") criarFunil();
              if (e.key === "Escape") setNovo(null);
            }}
            placeholder={t("Nome do funil — ex.: Consultas, Obras, Matrículas")}
            aria-label={t("Nome do novo funil")}
            data-testid="nome-do-novo-funil"
            disabled={criar.isPending}
          />
          <div className="flex gap-2">
            <Button
              onClick={criarFunil}
              disabled={criar.isPending || !novo.trim()}
              data-testid="confirmar-novo-funil"
            >
              {t("Criar funil")}
            </Button>
            <Button variant="ghost" onClick={() => setNovo(null)} disabled={criar.isPending}>
              {t("Cancelar")}
            </Button>
          </div>
        </Card>
      )}
      {novo === null && (
        <EmptyPipeline
          primary={
            podeGerenciar
              ? { label: t("Criar meu primeiro funil"), onClick: () => setNovo("") }
              : undefined
          }
        />
      )}
      {erro && (
        <p className="text-sm text-destructive" data-testid="erro-geral">
          {erro}
        </p>
      )}
    </div>
  );
}
