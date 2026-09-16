"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { ArrowRight, Plus, Kanban, CaretLeft } from "@/lib/ui/icons";
import { NewLeadDialog } from "@/components/kanban/NewLeadDialog";
import {
  usePipelinesSelecionaveis,
  type PipelineSelecionavel,
} from "@/hooks/pipelines/usePipelinesSelecionaveis";

export interface LeadOption {
  id: string;
  title?: string | null;
  pipeline_id: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  contactId: string | null;
  contactLabel: string;
}

type Etapa = "lista" | "escolher-funil" | "formulario";

/**
 * "Abrir negócio" — lista os cards de `crm_leads` do contato pra escolher
 * qual abrir, e SEMPRE oferece criar um novo (não só quando a lista vem
 * vazia). Criar sempre passa por ESCOLHER O FUNIL — mesmo quando só existe
 * um — porque a organização pode ter mais de um a qualquer momento e a
 * escolha errada move o negócio pro quadro errado sem aviso.
 *
 * O `pipeline_id` de cada lead já vem no resumo (`crm-summary`), e o funil
 * escolhido pra criar já é conhecido no clique — os dois casos navegam DIRETO
 * pra `/app/pipelines/[id]?lead=`, sem passar por `/app/leads/[id]` (que
 * existe pra link ESTÁVEL/antigo, cujo funil pode ter mudado; aqui o dado é
 * fresco da mesma resposta que está na tela).
 */
export function AbrirLeadDialog({ open, onOpenChange, contactId, contactLabel }: Props) {
  const t = useT();
  const router = useRouter();
  const [etapa, setEtapa] = useState<Etapa>("lista");
  const [funilEscolhido, setFunilEscolhido] = useState<PipelineSelecionavel | null>(null);

  const leadsQuery = useQuery({
    queryKey: ["contact-leads", contactId],
    enabled: open && etapa === "lista" && !!contactId,
    queryFn: async (): Promise<LeadOption[]> => {
      const res = await fetch(`/api/v1/contacts/${contactId}/crm-summary`);
      const json = (await res.json()) as {
        data?: { leads?: LeadOption[] };
        error?: { message?: string };
      };
      if (!res.ok) throw new Error(json.error?.message ?? t("Não foi possível carregar os negócios."));
      return json.data?.leads ?? [];
    },
  });
  const leads = leadsQuery.data ?? [];

  const pipelinesQuery = usePipelinesSelecionaveis(open);
  const pipelines = pipelinesQuery.data ?? [];

  function abrirLeadExistente(lead: LeadOption) {
    onOpenChange(false);
    router.push(`/app/pipelines/${lead.pipeline_id}?lead=${lead.id}`);
  }

  return (
    <>
      <Dialog open={open && etapa === "lista"} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Negócios de")} {contactLabel}</DialogTitle>
            <DialogDescription>
              {t("Escolha um negócio pra abrir, ou crie um novo.")}
            </DialogDescription>
          </DialogHeader>

          {leadsQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : leadsQuery.isError ? (
            <p className="text-sm text-error-fg">
              {leadsQuery.error instanceof Error
                ? leadsQuery.error.message
                : t("Não foi possível carregar os negócios.")}
            </p>
          ) : leads.length === 0 ? (
            <p className="text-sm text-text-subtle">
              {t("Este contato ainda não tem negócio no funil.")}
            </p>
          ) : (
            <div className="space-y-1">
              {leads.map((lead) => (
                <button
                  key={lead.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft"
                  onClick={() => abrirLeadExistente(lead)}
                >
                  <span className="flex items-center gap-2 truncate">
                    <Kanban size={14} className="shrink-0 text-text-subtle" aria-hidden />
                    {lead.title?.trim() || t("Sem título")}
                  </span>
                  <ArrowRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
          )}

          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="outline" onClick={() => setEtapa("escolher-funil")}>
              <Plus size={16} weight="bold" aria-hidden />
              {t("Criar negócio")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={open && etapa === "escolher-funil"}
        onOpenChange={(v) => {
          if (!v) setEtapa("lista");
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t("Em qual funil?")}</DialogTitle>
            <DialogDescription>
              {t("O negócio novo entra na primeira etapa do funil escolhido.")}
            </DialogDescription>
          </DialogHeader>

          {pipelinesQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : pipelinesQuery.isError ? (
            <p className="text-sm text-error-fg">{t("Não foi possível carregar os funis.")}</p>
          ) : pipelines.length === 0 ? (
            <p className="text-sm text-text-subtle">{t("Nenhum funil configurado nesta organização.")}</p>
          ) : (
            <div className="space-y-1">
              {pipelines.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  className="flex w-full items-center justify-between gap-2 rounded-md border border-border px-3 py-2 text-left text-sm transition-colors hover:border-accent hover:bg-accent-soft"
                  onClick={() => {
                    setFunilEscolhido(p);
                    setEtapa("formulario");
                  }}
                >
                  <span className="truncate">{p.name}</span>
                  <ArrowRight size={14} className="shrink-0 text-muted-foreground" aria-hidden />
                </button>
              ))}
            </div>
          )}

          <DialogFooter className="sm:justify-start">
            <Button type="button" variant="ghost" onClick={() => setEtapa("lista")}>
              <CaretLeft size={14} aria-hidden />
              {t("Voltar")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {funilEscolhido && contactId && (
        <NewLeadDialog
          open={open && etapa === "formulario"}
          onOpenChange={(v) => {
            if (!v) setEtapa("lista");
          }}
          pipelineId={funilEscolhido.id}
          stages={funilEscolhido.stages}
          contactId={contactId}
          onCreated={(lead) => {
            onOpenChange(false);
            toast.success(t("Negócio criado"));
            router.push(`/app/pipelines/${funilEscolhido.id}?lead=${lead.id}`);
          }}
        />
      )}
    </>
  );
}
