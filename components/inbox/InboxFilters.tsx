"use client";
import { useEffect, useState } from "react";
import { MagnifyingGlass, Funnel } from "@/lib/ui/icons";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { channelLabel, useChannelSessions } from "@/hooks/channels/useChannelSessions";
import { useAuth } from "@/hooks/auth/AuthProvider";
import { useConversationTagVocabulary } from "@/hooks/inbox/useConversationTags";
import { useConversationCounts } from "@/hooks/inbox/useConversationCounts";
import type { Role, VisibilityMode } from "@/lib/auth/types";
import { type InboxSidebarState } from "./InboxSidebar";

export type InboxAssigneeFilter = "all" | "mine" | "unassigned" | "ai";

const ASSIGNEE_TABS: { value: InboxAssigneeFilter; label: string }[] = [
  { value: "unassigned", label: "Fila" },
  { value: "mine", label: "Minhas" },
  { value: "all", label: "Todos" },
  { value: "ai", label: "IA" },
];

export function visibleAssigneeTabs(role: Role, mode: VisibilityMode | undefined): InboxAssigneeFilter[] {
  const hideAll = role === "agent" && mode !== "all";
  return ASSIGNEE_TABS.filter((t) => !(t.value === "all" && hideAll)).map((t) => t.value);
}

interface Props {
  value: InboxSidebarState;
  onChange: (next: InboxSidebarState) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function InboxFilters({ value, onChange, collapsed, onToggleCollapse }: Props) {
  const [searchInput, setSearchInput] = useState(value.search);
  const { data: channels } = useChannelSessions({ refetchInterval: 30_000 });
  const { activeOrg } = useAuth();
  const { data: tagVocabulary } = useConversationTagVocabulary(activeOrg?.orgId ?? null);
  const { data: counts } = useConversationCounts(activeOrg?.orgId ?? null);

  const tabs = activeOrg
    ? visibleAssigneeTabs(activeOrg.role, activeOrg.visibility_mode)
    : ASSIGNEE_TABS.map((t) => t.value);
    
  const countFor: Partial<Record<InboxAssigneeFilter, number>> = {
    unassigned: counts?.unassigned,
    mine: counts?.mine,
    all: counts?.all,
  };

  const filtroForaDaLista =
    value.channel_session_id != null &&
    channels != null &&
    !channels.some((c) => c.id === value.channel_session_id);
  const showChannelSwitch = (channels?.length ?? 0) >= 2 || filtroForaDaLista;

  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput !== value.search) {
        onChange({ ...value, search: searchInput });
      }
    }, 250);
    return () => clearTimeout(t);
  }, [searchInput, onChange, value]);

  return (
    <div className="space-y-3 border-b border-border bg-background px-3 py-3">
      <div className="flex gap-2">
        {collapsed && (
          <Button variant="outline" size="icon" onClick={onToggleCollapse} className="h-8 w-8 shrink-0">
            <Funnel className="h-4 w-4" />
          </Button>
        )}
        <div className="relative flex-1">
          <MagnifyingGlass
            size={14}
            weight="regular"
            className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Buscar mensagens…"
            className="h-8 pl-8 text-sm w-full"
            aria-label="Buscar conversas"
          />
        </div>
      </div>

      {showChannelSwitch && (
        <Select
          value={value.channel_session_id ?? "all"}
          onValueChange={(v) =>
            onChange({ ...value, channel_session_id: v === "all" ? undefined : v })
          }
        >
          <SelectTrigger className="h-8 text-sm" aria-label="Filtrar por número de WhatsApp">
            <SelectValue placeholder="Todos os números" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos os números</SelectItem>
            {filtroForaDaLista && value.channel_session_id != null && (
              <SelectItem value={value.channel_session_id}>Número removido</SelectItem>
            )}
            {channels?.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {channelLabel(c)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      {(tagVocabulary?.length ?? 0) > 0 && (
        <Select
          value={value.tag ?? "all"}
          onValueChange={(v) => onChange({ ...value, tag: v === "all" ? undefined : v })}
        >
          <SelectTrigger className="h-8 text-sm" aria-label="Filtrar por tag">
            <SelectValue placeholder="Todas as tags" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas as tags</SelectItem>
            {tagVocabulary?.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}

      <Tabs
        value={value.assignee}
        onValueChange={(v) => onChange({ ...value, assignee: v as InboxAssigneeFilter })}
      >
        <TabsList
          className="grid h-8 w-full"
          style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
        >
          {tabs.map((tab) => {
            const meta = ASSIGNEE_TABS.find((t) => t.value === tab)!;
            const count = countFor[tab];
            return (
              <TabsTrigger key={tab} value={tab} className="gap-1 text-[11px]">
                {meta.label}
                {typeof count === "number" && count > 0 && (
                  <span className="text-[10px] tabular-nums text-muted-foreground">
                    {count}
                  </span>
                )}
              </TabsTrigger>
            );
          })}
        </TabsList>
      </Tabs>

      <div className="flex items-center justify-between">
        <Label htmlFor="only-unread" className="text-xs text-muted-foreground">
          Apenas não lidos
        </Label>
        <Switch
          id="only-unread"
          checked={value.onlyUnread}
          onCheckedChange={(v) => onChange({ ...value, onlyUnread: v })}
        />
      </div>
    </div>
  );
}
