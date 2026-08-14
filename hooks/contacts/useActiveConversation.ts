"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export function useActiveConversation(contactId: string | null) {
  return useQuery({
    queryKey: ["activeConversation", contactId],
    queryFn: async () => {
      if (!contactId) return null;
      const res = await apiClient.get<{ conversationId: string | null }>(
        `/api/v1/contacts/${contactId}/active-conversation`
      );
      return res.conversationId;
    },
    enabled: !!contactId,
  });
}
