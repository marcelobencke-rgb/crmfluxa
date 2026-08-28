"use client";
import { useCallback, useState, useEffect } from "react";
import { cn } from "@/lib/utils";
import { MagnifyingGlass, Funnel, Inbox, User, Robot, CheckCircle, EnvelopeSimple, WarningCircle, Users, Clock } from "@/lib/ui/icons";
import type { Icon } from "@phosphor-icons/react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

export type InboxStatusFilter = "all" | "open" | "closed" | "snoozed";
export type InboxAssigneeFilter = "all" | "mine" | "unassigned" | "ai";

export interface InboxSidebarState {
  status: InboxStatusFilter;
  assignee: InboxAssigneeFilter;
  search: string;
  onlyUnread: boolean;
  channel_session_id?: string;
  tag?: string;
}

interface Props {
  value: InboxSidebarState;
  onChange: (next: InboxSidebarState) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function InboxSidebar({ value, onChange, collapsed, onToggleCollapse }: Props) {
  const [searchInput, setSearchInput] = useState(value.search);

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== value.search) {
        onChange({ ...value, search: searchInput });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, onChange, value]);

  if (collapsed) {
    return null;
  }

  const setStatus = (status: InboxStatusFilter) => onChange({ ...value, status });

  return (
    <div className="flex w-48 flex-col bg-background flex-1 min-h-0">
      <div className="flex items-center justify-between p-3">
        <span className="font-semibold text-sm">Status</span>
        {/* `aria-label` obrigatório: botão só-ícone não tem texto para o leitor
            de tela anunciar, e `button-name` do axe é impacto CRÍTICO — foi ele
            que reprovou rbac-roles. O ícone leva `aria-hidden` porque quem
            nomeia o botão é o label, não o desenho. */}
        <Button
          variant="ghost"
          size="icon"
          onClick={onToggleCollapse}
          className="h-8 w-8"
          aria-label="Recolher filtros de status"
        >
          <Funnel className="h-4 w-4 text-muted-foreground" aria-hidden />
        </Button>
      </div>

      <div className="flex-1 overflow-y-auto overflow-x-hidden [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none] px-2 py-3 space-y-6">
        {/* Status */}
        <div className="space-y-1">
          <SidebarItem
            icon={Inbox}
            label="Todas"
            active={value.status === "all"}
            onClick={() => setStatus("all")}
          />
          <SidebarItem
            icon={WarningCircle}
            label="Abertas"
            active={value.status === "open"}
            onClick={() => setStatus("open")}
          />
          <SidebarItem
            icon={CheckCircle}
            label="Fechadas"
            active={value.status === "closed"}
            onClick={() => setStatus("closed")}
          />
          <SidebarItem
            icon={Clock}
            label="Pausadas"
            active={value.status === "snoozed"}
            onClick={() => setStatus("snoozed")}
          />
        </div>
      </div>
    </div>
  );
}

function SidebarItem({
  icon: Icon,
  label,
  active,
  onClick,
}: {
  icon: Icon;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
        active
          ? "bg-primary text-primary-foreground font-medium"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground"
      )}
    >
      <Icon weight={active ? "fill" : "regular"} className={cn("h-4 w-4 shrink-0", active ? "text-primary-foreground" : "")} />
      <span className="truncate">{label}</span>
    </button>
  );
}
