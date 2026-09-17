"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Lead } from "@/lib/types/leads";

interface ListResponse {
  data: Lead[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

export interface LeadListFilters {
  search?: string;
  limit?: number;
}

/**
 * Busca de leads pelo título, para o picker de "lead" do formulário de
 * tarefa. Nasceu a par de `GET /api/v1/leads` (ver o cabeçalho de
 * `route.ts`) — mesmo padrão de `hooks/contacts/useContactList.ts`, mas sem
 * paginação: um picker dentro de um campo mostra os primeiros resultados e
 * pede pra refinar a busca, não rola infinito.
 *
 * `enabled: (filters.search?.length ?? 0) > 0` — sem isto a query dispara
 * vazia assim que o campo abre e lista os leads mais recentes da org inteira
 * antes de a pessoa digitar qualquer coisa; melhor abrir vazio e pedir "digite
 * para buscar" do que gastar uma consulta que ninguém pediu.
 */
export function useLeadList(filters: LeadListFilters) {
  const search = filters.search?.trim();

  return useQuery({
    queryKey: ["leads-search", search, filters.limit],
    enabled: (search?.length ?? 0) > 0,
    queryFn: async () => {
      const qs = new URLSearchParams();
      if (search) qs.set("search", search);
      qs.set("limit", String(filters.limit ?? 20));
      try {
        return await apiClient.get<ListResponse>(`/api/v1/leads?${qs.toString()}`);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    staleTime: 10_000,
  });
}

/**
 * Um lead pelo id — só pra MOSTRAR o título de quem já está vinculado (ex.:
 * abrir pra editar uma tarefa que já tem `lead_id`). `useLeadList` não serve
 * pra isso: ela busca por TEXTO, não por id, e o texto de busca começa vazio.
 */
export function useLead(leadId: string | null | undefined) {
  return useQuery({
    queryKey: ["lead", leadId],
    enabled: Boolean(leadId),
    queryFn: async () => {
      try {
        return await apiClient.get<{ data: Lead }>(`/api/v1/leads/${leadId}`);
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
    staleTime: 30_000,
  });
}
