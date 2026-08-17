"use client";
import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { useRealtimeChannel } from "@/hooks/realtime/useRealtimeChannel";
import type { TimelineItemView } from "@/lib/types/contacts";

async function fetchNotes(leadId: string): Promise<TimelineItemView[]> {
  const res = await apiClient.get<{ data: TimelineItemView[] }>(
    `/api/v1/leads/${leadId}/timeline?type=note&limit=100`,
  );
  if (res && typeof res === "object" && "data" in res) {
    return (res as { data: TimelineItemView[] }).data;
  }
  return res as unknown as TimelineItemView[];
}

/**
 * As notas do negócio: a mesma fonte da timeline (`crm_lead_activities`,
 * `type='note'`), pedida À PARTE — um lead com muita atividade (turno de IA,
 * mudança de estágio) empurraria a nota pra fora da janela de 50 itens da
 * timeline principal, e a aba de notas existe justamente para não depender
 * disso.
 */
export function useLeadNotes(leadId: string | null): {
  notes: TimelineItemView[];
  isLoading: boolean;
  isError: boolean;
} {
  const qc = useQueryClient();
  const queryKey = ["lead-notes", leadId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => fetchNotes(leadId as string),
    enabled: !!leadId,
  });

  const onChange = useCallback(() => {
    if (leadId) qc.invalidateQueries({ queryKey: ["lead-notes", leadId] });
  }, [qc, leadId]);

  useRealtimeChannel({
    name: leadId ? `lead-notes-${leadId}` : "lead-notes-disabled",
    postgresChanges: leadId
      ? {
          event: "INSERT",
          schema: "public",
          table: "crm_lead_activities",
          filter: `lead_id=eq.${leadId}`,
        }
      : undefined,
    onChange,
    enabled: !!leadId,
  });

  return {
    notes: query.data ?? [],
    isLoading: query.isLoading,
    isError: query.isError,
  };
}
