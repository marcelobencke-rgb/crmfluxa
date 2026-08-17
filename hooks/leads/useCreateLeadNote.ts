"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

/** Cria uma nota (POST /api/v1/leads/[id]/notes) e refresca a aba de notas + a timeline. */
export function useCreateLeadNote(leadId: string) {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (body: string) =>
      apiClient.post<{ data: { lead_id: string } }>(`/api/v1/leads/${leadId}/notes`, { body }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["lead-notes", leadId] });
      qc.invalidateQueries({ queryKey: ["timeline", leadId] });
    },
    onError: showApiError,
  });
}
