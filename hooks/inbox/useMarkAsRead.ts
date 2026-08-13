"use client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";
import { useEffect, useRef } from "react";

export function useMarkAsRead(conversationId: string | null) {
  const qc = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (id: string) => {
      return apiClient.post<{ success: boolean }>(`/api/v1/conversations/${id}/mark-read`, {});
    },
    onMutate: async (id) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey: ["conversations"] });
      
      // Since useConversationsRealtime uses infinite query, we can't easily mutate the exact page data
      // but we can invalidate the query to let it refetch if needed.
      // However, we can also just wait for the realtime event to trigger the update on the conversations list.
    },
  });

  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    
    if (conversationId) {
      // Debounce: marks as read after looking at the conversation for 1.5s
      timerRef.current = setTimeout(() => {
        mutation.mutate(conversationId);
      }, 1500);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [conversationId]); // We only want this to run when the ID changes.
}
