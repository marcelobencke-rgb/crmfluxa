"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

interface UnblockResponse {
  data: { contact_id: string; unblocked?: boolean; already_unblocked?: boolean };
}

export function useUnblockContact() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (contactId: string) =>
      apiClient.post<UnblockResponse>(`/api/v1/contacts/${contactId}/unblock`, {}),
    onError: showApiError,
    onSuccess: (_data, contactId) => {
      qc.invalidateQueries({ queryKey: ["contact", contactId] });
      qc.invalidateQueries({ queryKey: ["contacts"] });
    },
  });
}
