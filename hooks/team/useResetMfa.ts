"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";

export function useResetMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) =>
      apiClient.post<{ data: { user_id: string; factors_removed: number } }>(
        `/api/v1/team/${userId}/reset-mfa`,
        {},
      ),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["team"] });
    },
  });
}
