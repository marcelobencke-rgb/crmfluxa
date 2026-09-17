/**
 * A REFERÊNCIA DE `tarefas` ENQUANTO A QUERY CARREGA.
 *
 * ─── O defeito que esta cerca prende ────────────────────────────────────────
 *
 * Medido em produção em 2026-09-16: abrir `/app/tasks` derrubava a tela com
 * "Too many re-renders. React limits the number of renders to prevent an
 * infinite loop." `TarefasClient` compara `tarefas` por referência (o
 * otimismo local do arraste no Kanban precisa saber quando o refetch
 * confirmou um card) — e `tarefas: query.data?.tasks ?? []` alocava um array
 * NOVO em TODO render enquanto `query.data` ainda era `undefined`. Cada
 * render via "tarefas mudou", disparava `setState`, e o próximo render via a
 * MESMA coisa de novo — nunca convergindo.
 *
 * O conserto foi trocar o `?? []` por uma constante de módulo (`SEM_TAREFAS`)
 * — mesma referência sempre que não há dado ainda. Este arquivo prende os
 * DOIS lados: a referência não pode mudar sozinha enquanto carrega, e TEM que
 * mudar quando o dado de verdade chega (senão a tela nunca sairia do
 * skeleton).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { createElement, type ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useTasks } from "@/hooks/tasks/useTasks";

function novoWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return function Wrapper({ children }: { children: ReactNode }) {
    return createElement(QueryClientProvider, { client: qc }, children);
  };
}

const fetcher = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", fetcher);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useTasks — referência de `tarefas`", () => {
  it("não muda sozinha em renders sucessivos antes do primeiro dado chegar", () => {
    // A query nunca assenta neste teste, de propósito: é a JANELA DE CARGA que
    // expôs o defeito — um fetch que nunca resolve mantém `query.data`
    // `undefined` por vários renders, a mesma condição de produção.
    fetcher.mockReturnValue(new Promise(() => {}));

    const { result, rerender } = renderHook(() => useTasks(), { wrapper: novoWrapper() });
    const referencias = new Set<unknown>();
    referencias.add(result.current.tarefas);
    for (let i = 0; i < 5; i++) {
      rerender();
      referencias.add(result.current.tarefas);
    }

    expect(
      referencias.size,
      "cada rerender enquanto carrega produziu uma referência NOVA de `tarefas` " +
        "— é exatamente o que faz `TarefasClient` (que compara `tarefas` por " +
        "referência para saber quando o arraste do Kanban foi confirmado) nunca " +
        "convergir e travar em 'Too many re-renders'",
    ).toBe(1);
  });

  it("troca de referência quando o dado real chega — a tela tem que sair do skeleton", async () => {
    fetcher.mockResolvedValue({
      ok: true,
      json: async () => ({ data: { tasks: [] } }),
    });

    const { result } = renderHook(() => useTasks(), { wrapper: novoWrapper() });
    const antesDeCarregar = result.current.tarefas;

    await waitFor(() =>
      expect(result.current.carregando, "a query nunca assentou").toBe(false),
    );

    expect(
      result.current.tarefas,
      "travar a MESMA referência para sempre resolveria o loop trocando por um " +
        "bug pior: a tela nunca refletiria o dado que chegou do servidor",
    ).not.toBe(antesDeCarregar);
    expect(result.current.tarefas).toEqual([]);
  });
});
