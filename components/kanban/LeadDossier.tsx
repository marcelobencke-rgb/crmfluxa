"use client";
import { useRef } from "react";

import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useLeadTimeline } from "@/hooks/leads/useLeadTimeline";
import type { Lead } from "@/lib/types/leads";
import { LeadFieldsForm } from "./LeadFieldsForm";
import { ScoreSlot } from "./ScoreSlot";
import { LeadTimeline } from "./LeadTimeline";
import { OwnerBadge } from "./OwnerBadge";
import { OwnerSelector } from "./OwnerSelector";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useActiveConversation } from "@/hooks/contacts/useActiveConversation";
import { ChatCircle } from "@/lib/ui/icons";
import Link from "next/link";
import { toast } from "sonner";
import { NextActionBanner } from "./NextActionSlot";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
  stageName: string;
  ownerNames?: Map<string, string | null>;
}

function formatBRL(cents: number | null, currency: string | null): string {
  if (cents === null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency ?? "BRL",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(0)}`;
  }
}

/**
 * O dossiê do negócio: cabeçalho vivo → timeline → campos.
 *
 * A ORDEM É a mudança em relação ao diálogo de edição: quem abre um lead quer
 * primeiro saber O QUE ACONTECEU, e só depois mexer. O formulário íntegro fica
 * por último, e o cabeçalho tem um atalho para ele — ordem preservada, custo de
 * rolagem resolvido.
 *
 * SALVAR NÃO FECHA. Quem edita precisa ver a atividade que acabou de gerar
 * entrar na timeline; fechar esconderia o registro justamente de quem o
 * produziu, e a funcionalidade que prova "sua ação fica registrada" provaria
 * isso para todo mundo menos para o autor.
 */
export function LeadDossier({
  open,
  onOpenChange,
  lead,
  pipelineId,
  stageName,
  ownerNames,
}: Props) {
  const campos = useRef<HTMLDivElement | null>(null);
  const timeline = useLeadTimeline(open ? lead.id : null, lead.contact_id);
  const activeConversation = useActiveConversation(open ? lead.contact_id : null);
  const owner = resolveLeadOwner(lead, ownerNames);
  const score = lead.score ?? null;
  const edit = useEditLead(pipelineId);

  async function handleOwnerChange(kind: "user" | "ai" | null, id: string | null) {
    let owner_user_id = null;
    let owner_agent_id = null;

    if (kind === "user") owner_user_id = id;
    if (kind === "ai") owner_agent_id = id;

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: { owner_user_id, owner_agent_id },
      });
      toast.success("Responsável atualizado");
    } catch {
      // toast de erro vem do hook ou client
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-4xl"
        data-realtime-status={timeline.realtimeStatus.toLowerCase()}
        data-refetch-divergencias={timeline.seguranca.divergencias}
      >
        <div className="grid grid-cols-1 md:grid-cols-[1fr_350px] gap-6 flex-1">
          {/* COLUNA ESQUERDA: Dados Principais */}
          <div className="flex flex-col gap-0">
            <SheetHeader className="pb-3">
              <SheetTitle className="text-base leading-6">{lead.title}</SheetTitle>
            </SheetHeader>

            {/* ① cabeçalho vivo */}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border pb-3 text-xs">
              <span className="font-medium tabular-nums text-text">
                {formatBRL(lead.value_cents, lead.currency)}
              </span>
              <span className="text-text-muted">{stageName}</span>
              <OwnerSelector
                currentKind={owner.kind}
                currentName={owner.name}
                agentVersion={owner.agentVersion}
                onChange={handleOwnerChange}
                disabled={edit.isPending}
              />
              {score && (
                <ScoreSlot
                  probability={score.probability}
                  band={score.band}
                  reason={score.reason}
                  factors={score.factors.slice(0, 3)}
                />
              )}

              <div className="ml-auto flex items-center gap-4">
                {activeConversation.data && (
                  <Link
                    href={`/app/inbox?id=${activeConversation.data}`}
                    className="flex items-center gap-1.5 text-text-muted underline-offset-2 hover:text-text hover:underline"
                  >
                    <ChatCircle size={14} />
                    Ver conversa
                  </Link>
                )}
                <button
                  type="button"
                  onClick={() => campos.current?.scrollIntoView({ behavior: "smooth", block: "start" })}
                  className="text-text-muted underline-offset-2 hover:text-text hover:underline"
                >
                  Editar campos
                </button>
              </div>
            </div>

            {lead.next_action && (
              <div className="pt-3">
                <NextActionBanner
                  label={lead.next_action.label}
                  leadId={lead.id}
                  approvedSeq={lead.next_action.seq}
                  pipelineId={pipelineId}
                />
              </div>
            )}

            {score?.at && (
              <p className="pt-2 text-[11px] text-text-muted">
                Probabilidade recalculada automaticamente · {new Date(score.at).toLocaleString("pt-BR")}
              </p>
            )}

            {/* ③ campos, por último */}
            <div ref={campos} className="pt-6">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Dados do negócio
              </h3>
              <LeadFieldsForm lead={lead} pipelineId={pipelineId} />
            </div>
          </div>

          {/* COLUNA DIREITA: Timeline */}
          <div className="flex flex-col border-border md:border-l md:pl-6 pt-6 md:pt-0">
            <section className="flex-1">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                Linha do tempo
              </h3>
              <LeadTimeline
                itens={timeline.itens}
                chegouAoVivo={timeline.chegouAoVivo}
                isLoading={timeline.isLoading}
                isError={timeline.isError}
              />
            </section>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
