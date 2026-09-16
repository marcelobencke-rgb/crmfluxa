"use client";

import { useQuery } from "@tanstack/react-query";

import { showApiError } from "@/components/feedback/ApiErrorToast";
import { apiClient } from "@/lib/api/client";

import type { Agendamento } from "@/components/agenda/tipos";

/** Mesma forma que `useAgendamentos` lê — ver o comentário lá para o porquê. */
interface AgendamentoListado {
  revision?: number;
  id: string;
  titulo: string;
  iniciaEm: string;
  terminaEm: string;
  fuso: string;
  situacao: string;
  donoId: string | null;
  contatoId: string | null;
  contatoNome: string | null;
}

/**
 * Os agendamentos de UM contato — para o dossiê do negócio, não a grade.
 *
 * ⚠️ POR QUE `contact_id` E NÃO `lead_id`. `calendar_appointments` não tem
 * coluna de negócio — o vínculo do schema é com o CONTATO
 * (`lib/agenda/consulta.ts`). Um contato com mais de um negócio ativo veria os
 * agendamentos dos dois aqui; é a aproximação aceita enquanto não existir
 * `lead_id` na tabela. `contact_id` sozinho já é "alvo" válido para a rota —
 * sem `de`/`ate` ela não recusa com 422, só usa "agora" como piso (não traz
 * histórico anterior a hoje).
 */
export function useAgendamentosDoContato(contactId: string | null) {
  return useQuery({
    queryKey: ["agenda", "agendamentos", "contato", contactId],
    enabled: contactId !== null,
    queryFn: async (): Promise<Agendamento[]> => {
      const qs = new URLSearchParams({ contact_id: contactId! });
      try {
        const r = await apiClient.get<{ data: AgendamentoListado[] }>(
          `/api/v1/agenda/agendamentos?${qs.toString()}`,
        );
        const lista =
          (r as unknown as { data?: AgendamentoListado[] }).data ??
          (r as unknown as AgendamentoListado[]);
        return (lista ?? []).map((a) => ({
          id: a.id,
          revision: a.revision,
          titulo: a.titulo,
          responsavelId: a.donoId ?? "",
          comeca: a.iniciaEm,
          termina: a.terminaEm,
          origem: (a as { origem?: Agendamento["origem"] }).origem ?? "ui",
          situacao: a.situacao as Agendamento["situacao"],
          quemSeraAtendido: a.contatoNome ?? undefined,
        }));
      } catch (err) {
        showApiError(err);
        throw err;
      }
    },
  });
}
