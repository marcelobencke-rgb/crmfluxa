"use client";
import { useState } from "react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAssignableMembers } from "@/hooks/inbox/useAssignableMembers";
import { useAssignableAgents } from "@/hooks/kanban/useAssignableAgents";
import { OwnerBadge } from "./OwnerBadge";
import type { OwnerKind } from "@/lib/types/leads";
import { ScrollArea } from "@/components/ui/scroll-area";

interface Props {
  currentKind: OwnerKind;
  currentName: string | null;
  agentVersion?: number | null;
  onChange: (kind: "user" | "ai" | null, id: string | null) => void;
  disabled?: boolean;
}

export function OwnerSelector({
  currentKind,
  currentName,
  agentVersion,
  onChange,
  disabled,
}: Props) {
  const [open, setOpen] = useState(false);
  const members = useAssignableMembers(open);
  const agents = useAssignableAgents(open);

  const team = members.data ?? [];
  const aiAgents = agents.data ?? [];

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          className="rounded-full outline-none ring-offset-bg hover:ring-2 hover:ring-border hover:ring-offset-2 focus:ring-2 focus:ring-accent focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <OwnerBadge
            ownerKind={currentKind}
            ownerName={currentName}
            agentVersion={agentVersion}
          />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <ScrollArea className="h-auto max-h-[300px]">
          <DropdownMenuItem onClick={() => onChange(null, null)}>
            <div className="flex flex-col">
              <span className="text-sm font-medium">Sem responsável</span>
            </div>
          </DropdownMenuItem>

          {team.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-semibold text-text-muted">Equipe</div>
              {team.map((m) => (
                <DropdownMenuItem
                  key={m.user_id}
                  onClick={() => onChange("user", m.user_id)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{m.full_name ?? "Usuário"}</span>
                    <span className="text-xs text-text-muted">{m.role}</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}

          {aiAgents.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <div className="px-2 py-1.5 text-xs font-semibold text-text-muted">Automação</div>
              {aiAgents.map((a) => (
                <DropdownMenuItem
                  key={a.agent_id}
                  onClick={() => onChange("ai", a.agent_id)}
                >
                  <div className="flex flex-col">
                    <span className="text-sm">{a.name}</span>
                    <span className="text-xs text-text-muted">Agente de IA</span>
                  </div>
                </DropdownMenuItem>
              ))}
            </>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
