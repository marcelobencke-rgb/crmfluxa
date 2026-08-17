"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface LeadSearchResult {
  id: string;
  title: string;
  status: "open" | "won" | "lost";
}

/** Busca leads por título — usado pelo LeadPicker (spec 18 §5). */
export function useSearchLeads(search: string) {
  return useQuery({
    queryKey: ["crm-leads-search", search],
    queryFn: async () =>
      apiClient.get<{ data: LeadSearchResult[] }>(
        `/api/v1/leads?search=${encodeURIComponent(search)}&limit=10`,
      ),
    enabled: search.trim().length >= 2,
    staleTime: 15_000,
    select: (res) => res.data,
  });
}
