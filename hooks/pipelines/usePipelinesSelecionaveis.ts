"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { Pipeline, Stage } from "@/lib/kanban/types";

export interface PipelineSelecionavel extends Pipeline {
  stages: Stage[];
}

/**
 * Todos os funis não arquivados da org ativa, com estágios — role `agent`
 * (`GET /api/v1/pipelines/selecionaveis`, não a listagem `manager`-only).
 * Usado onde quem cria o negócio precisa ESCOLHER o funil, não só "algum".
 */
export function usePipelinesSelecionaveis(enabled: boolean) {
  return useQuery({
    queryKey: ["pipelines-selecionaveis"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<PipelineSelecionavel[]> => {
      const res = await apiClient.get<{ data: { pipelines: PipelineSelecionavel[] } }>(
        "/api/v1/pipelines/selecionaveis",
      );
      return res.data.pipelines;
    },
  });
}
