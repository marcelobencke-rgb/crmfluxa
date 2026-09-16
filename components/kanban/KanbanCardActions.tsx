"use client";
import { useState } from "react";
import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckCircle, PencilSimple, Trash, WhatsappLogo, X } from "@/lib/ui/icons";
import { useWinLead } from "@/hooks/kanban/useUpdateLead";
import { useBulkAction } from "@/hooks/kanban/useBulkAction";
import { useAbrirOuIniciarConversa } from "@/hooks/inbox/useAbrirOuIniciarConversa";
import { LoseLeadDialog } from "./LoseLeadDialog";
import type { Lead } from "@/lib/types/leads";

interface KanbanCardActionsProps {
  lead: Lead;
  pipelineId: string;
  /** Abrir o dossiê — o MESMO gesto do clique no título. Ver o comentário de "Editar". */
  onOpen?: (leadId: string) => void;
}

/**
 * As ações do card — ÍCONES visíveis no hover, não mais um "⋮" com opções
 * escondidas. O "Responsável" que morava aqui dentro saiu: agora é o próprio
 * selo do dono, no rodapé do card, que abre o mesmo menu (`OwnerPicker.tsx`) —
 * um segundo controle para a mesma coisa seria dois lugares discordando.
 *
 * "Editar" abre o DOSSIÊ (`onOpen`, o mesmo do clique no título) — não mais o
 * `EditLeadDialog`, que era o editor de ANTES do dossiê ganhar abas e virar
 * modal central. Ter os dois vivos ao mesmo tempo é o defeito que o card
 * relatou: "Editar" abrindo um formulário menor e mais velho que o que o
 * título já abre é EXATAMENTE dois lugares discordando sobre a mesma coisa —
 * a razão pela qual "Responsável" saiu de aqui dentro, duas linhas atrás.
 *
 * "Remover" é NOVO: antes só existia em lote (`BulkActionBar`), que obrigava
 * selecionar um card sozinho para apagar um card sozinho. Reusa `useBulkAction`
 * com um id só — a rota e a mutação já existem, testadas; não nasce rota nova.
 *
 * O ícone de conversa é o MESMO gesto de `ContactsTable.tsx` (extraído para
 * `useAbrirOuIniciarConversa`): tem `lead.conversa` → abre; não tem, mas o
 * contato tem telefone → cria uma e já abre; nenhum dos dois → o ícone nem
 * aparece, porque não há o que fazer com ele.
 *
 * Confirmação em DOIS TOQUES, não `window.confirm` (bloqueado em iframe, no
 * idioma do navegador, não do produto) — mesmo padrão de `ListaDeTarefas.tsx`.
 */
export function KanbanCardActions({ lead, pipelineId, onOpen }: KanbanCardActionsProps) {
  const t = useT();
  const [loseOpen, setLoseOpen] = useState(false);
  const [confirmandoRemover, setConfirmandoRemover] = useState(false);
  const winMutation = useWinLead(pipelineId);
  const bulk = useBulkAction(pipelineId);
  const conversa = useAbrirOuIniciarConversa();

  return (
    <>
      <div
        // `absolute`, não mais lado a lado com o título: até cinco ícones
        // (conversa, editar, ganho, perdido, remover) numa faixa em `flex`
        // reservavam largura o tempo todo, invisíveis ou não (opacidade zero
        // ainda ocupa espaço) — era o bastante para quebrar um título curto
        // em duas linhas. Flutuando por cima, some da CONTA de largura;
        // `bg-surface` + borda é o que evita ler como se o título vazasse
        // por baixo dos ícones quando eles aparecem.
        //
        // `pointer-events-none` até o hover/foco: sem isto, os botões
        // INVISÍVEIS continuariam clicáveis por cima do título, e tocar onde
        // "Nova Compra" deveria estar abriria "Marcar como ganho" por engano.
        //
        // `focus-within` além de `group-hover`: sem ele, clicar em "Remover"
        // troca para o botão "Confirmar" e o PRÓPRIO fade do hover (se o mouse
        // não estiver mais sobre o card) escondia o botão que acabou de
        // aparecer — a pessoa clicaria no vazio.
        className={cn(
          "absolute right-0 top-0 z-10 flex items-center gap-0.5 rounded-md border border-border bg-surface p-0.5 shadow-sm",
          "pointer-events-none opacity-0 transition-opacity",
          "focus-within:pointer-events-auto focus-within:opacity-100",
          "group-hover:pointer-events-auto group-hover:opacity-100",
        )}
      >
        {(lead.conversa || lead.contact?.phone_number) && (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={lead.conversa ? t("Abrir conversa no Inbox") : t("Iniciar conversa no Inbox")}
            title={lead.conversa ? t("Abrir conversa no Inbox") : t("Iniciar conversa no Inbox")}
            disabled={!lead.conversa && conversa.abrindoContatoId === lead.contact?.id}
            onClick={(e) => {
              e.stopPropagation();
              if (lead.conversa) {
                conversa.abrir(lead.conversa.id);
              } else if (lead.contact?.phone_number) {
                void conversa.iniciar(lead.contact.id, lead.contact.phone_number);
              }
            }}
          >
            <WhatsappLogo size={12} aria-hidden />
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={t("Editar")}
          title={t("Editar")}
          onClick={(e) => {
            e.stopPropagation();
            onOpen?.(lead.id);
          }}
        >
          <PencilSimple size={12} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={t("Marcar como ganho")}
          title={t("Marcar como ganho")}
          disabled={winMutation.isPending}
          onClick={(e) => {
            e.stopPropagation();
            winMutation.mutate({ leadId: lead.id });
          }}
        >
          <CheckCircle size={12} aria-hidden />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          aria-label={t("Marcar como perdido")}
          title={t("Marcar como perdido")}
          onClick={(e) => {
            e.stopPropagation();
            setLoseOpen(true);
          }}
        >
          <X size={12} aria-hidden />
        </Button>
        {confirmandoRemover ? (
          <Button
            variant="destructive"
            size="sm"
            className="h-6 px-1.5 text-[10px]"
            disabled={bulk.isPending}
            onClick={(e) => {
              e.stopPropagation();
              bulk.mutate(
                { action: "delete", lead_ids: [lead.id], params: {} },
                { onSuccess: () => setConfirmandoRemover(false) },
              );
            }}
          >
            {t("Confirmar")}
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            aria-label={t("Remover")}
            title={t("Remover")}
            onClick={(e) => {
              e.stopPropagation();
              setConfirmandoRemover(true);
            }}
            onBlur={() => setConfirmandoRemover(false)}
          >
            <Trash size={12} aria-hidden />
          </Button>
        )}
      </div>

      <LoseLeadDialog
        open={loseOpen}
        onOpenChange={setLoseOpen}
        leadId={lead.id}
        pipelineId={pipelineId}
      />
    </>
  );
}
