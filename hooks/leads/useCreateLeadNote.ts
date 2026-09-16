"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

interface Args {
  leadId: string;
  body: string;
}

/**
 * A nota manual na timeline do negócio — ver a rota `/leads/[id]/notes`.
 *
 * Invalida a MESMA queryKey de `useLeadTimeline` (`["timeline", leadId]`): o
 * realtime também chegaria sozinho (a rota grava em `crm_lead_activities`,
 * que o canal do dossiê já escuta), mas esperar o round-trip do Postgres para
 * ver a própria nota aparecer é o atraso que a invalidação aqui evita.
 */
export function useCreateLeadNote() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ leadId, body }: Args) =>
      apiClient.post(`/api/v1/leads/${leadId}/notes`, { body }),
    onSuccess: (_res, args) => {
      qc.invalidateQueries({ queryKey: ["timeline", args.leadId] });
    },
    onError: showApiError,
  });
}
