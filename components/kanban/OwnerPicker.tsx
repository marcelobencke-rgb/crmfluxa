"use client";
import { useT } from "@/hooks/i18n/useT";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useAssignableAgents } from "@/hooks/kanban/useAssignableAgents";
import { usePermission } from "@/hooks/auth/AuthProvider";
import { Users } from "@/lib/ui/icons";
import type { Lead } from "@/lib/types/leads";
import type { OwnerDisplay } from "@/lib/kanban/owner";
import { OwnerBadge } from "./OwnerBadge";

interface Props {
  lead: Lead;
  pipelineId: string;
  owner: OwnerDisplay;
  /** Variante de 16px do próprio `OwnerBadge` — para o card, que já vive no menor espaço. */
  compacto?: boolean;
  align?: "start" | "end";
}

/**
 * O SELO É o gatilho — extraído para o card e o dossiê pararem de duplicar a
 * mesma lista de membros/agentes e o mesmo trio de mutações (limpar/reatribuir
 * a pessoa/reatribuir a agente). Nasceu no dossiê (`LeadDossier.tsx`); o card
 * o reusa em vez de repetir, porque as duas telas fazem a MESMA pergunta
 * ("quem é o responsável, e dá para trocar clicando nele").
 *
 * `e.stopPropagation()` incondicional: no card, o wrapper inteiro tem
 * `onClick` (abre o dossiê) — sem isto, clicar no selo abriria o dossiê POR
 * BAIXO do menu. No dossiê não há wrapper com onClick, então o stop é inócuo.
 */
export function OwnerPicker({ lead, pipelineId, owner, compacto, align = "start" }: Props) {
  const t = useT();
  const editar = useEditLead(pipelineId);
  // spec 13 §4: escrita no funil é agent+ — viewer não reatribui (a rota
  // PATCH também recusa; aqui é só não oferecer o que seria negado).
  const podeAtribuir = usePermission("pipeline.move_card");
  const { data: members } = useAssignableMembers(podeAtribuir);
  const { data: agents } = useAssignableAgents(podeAtribuir);

  if (!podeAtribuir) {
    return (
      <OwnerBadge
        ownerKind={owner.kind}
        ownerName={owner.name}
        agentVersion={owner.agentVersion}
        compacto={compacto}
      />
    );
  }

  function paraPessoa(ownerUserId: string | null) {
    if (ownerUserId === lead.owner_user_id) return;
    editar.mutate({ leadId: lead.id, patch: { owner_user_id: ownerUserId } });
  }
  function paraAgente(agentId: string) {
    if (agentId === lead.owner_agent_id) return;
    editar.mutate({ leadId: lead.id, patch: { owner_agent_id: agentId } });
  }
  function limpar() {
    if (lead.owner_user_id === null && lead.owner_agent_id === null) return;
    editar.mutate({
      leadId: lead.id,
      patch: lead.owner_agent_id ? { owner_agent_id: null } : { owner_user_id: null },
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="rounded-sm outline-hidden focus-visible:ring-2 focus-visible:ring-accent-soft"
          disabled={editar.isPending}
          onClick={(e) => e.stopPropagation()}
        >
          <OwnerBadge
            ownerKind={owner.kind}
            ownerName={owner.name}
            agentVersion={owner.agentVersion}
            compacto={compacto}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>{t("Responsável")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          disabled={editar.isPending || (lead.owner_user_id === null && lead.owner_agent_id === null)}
          onSelect={limpar}
        >
          {t("Sem responsável")}
        </DropdownMenuItem>
        {(members ?? []).length > 0 && <DropdownMenuSeparator />}
        {(members ?? []).map((m) => (
          <DropdownMenuItem
            key={m.user_id}
            disabled={editar.isPending || m.user_id === lead.owner_user_id}
            onSelect={() => paraPessoa(m.user_id)}
          >
            <Users size={14} className="mr-2" aria-hidden />
            {m.full_name ?? t("Sem nome")}
          </DropdownMenuItem>
        ))}
        {(agents ?? []).length > 0 && <DropdownMenuSeparator />}
        {(agents ?? []).map((a) => (
          <DropdownMenuItem
            key={a.agent_id}
            disabled={editar.isPending || a.agent_id === lead.owner_agent_id}
            onSelect={() => paraAgente(a.agent_id)}
          >
            {a.name}
            {a.version_number != null && (
              <span className="ml-1.5 font-mono text-[10px] text-text-muted">v{a.version_number}</span>
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
