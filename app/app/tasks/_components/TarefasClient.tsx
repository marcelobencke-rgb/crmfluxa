"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useT } from "@/hooks/i18n/useT";
import { ArrowsClockwise, CalendarBlank, Kanban, ListChecks, Plus } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";
import { useTasks } from "@/hooks/tasks/useTasks";
import type { NovaTarefa, SituacaoDaTarefa, Tarefa } from "@/lib/tarefas/tipos";

import { CalendarioDeTarefas } from "./CalendarioDeTarefas";
import { FormularioDeTarefa } from "./FormularioDeTarefa";
import { IndicadoresDeTarefas } from "./IndicadoresDeTarefas";
import { KanbanDeTarefas } from "./KanbanDeTarefas";
import { ListaDeTarefas } from "./ListaDeTarefas";

/** "aberto" não é uma situação do banco: é o filtro que a tela abre por padrão. */
type FiltroDeSituacao = "aberto" | SituacaoDaTarefa;

export function TarefasClient({ podeEditar }: { podeEditar: boolean }) {
  const t = useT();
  // Kanban é o padrão — Lista e Calendário continuam como opções.
  const [modo, setModo] = useState<"quadro" | "lista" | "calendario">("quadro");
  const [situacao, setSituacao] = useState<FiltroDeSituacao>("aberto");
  const [emEdicao, setEmEdicao] = useState<Tarefa | null>(null);
  const [formAberto, setFormAberto] = useState(false);
  const [prazoSugerido, setPrazoSugerido] = useState<string | undefined>();
  const [situacaoSugerida, setSituacaoSugerida] = useState<SituacaoDaTarefa | undefined>();
  // A CHAVE DE REMONTAGEM do formulário. Ele lê o estado inicial das props
  // (nada de `useEffect` sincronizando), então abrir duas vezes seguidas o
  // "Nova tarefa" precisa de uma chave NOVA — senão a segunda abertura traz o
  // que ficou digitado na primeira.
  const [aberturas, setAberturas] = useState(0);

  // Busca SEMPRE o conjunto inteiro (sem filtro de status no servidor): os
  // indicadores e o Kanban precisam de TODAS as situações ao mesmo tempo — um
  // não existe sem o outro —, e a Lista/Calendário aplicam "situacao" aqui do
  // lado do cliente. Duas fontes (uma filtrada, uma não) discordariam entre
  // si; uma fonte só e dois recortes não.
  const {
    tarefas,
    carregando,
    falhou,
    recarregar,
    criarTarefa,
    editarTarefa,
    apagarTarefa,
    alternarConcluida,
  } = useTasks();

  // ─── Otimismo do arrastar-no-Kanban, ao nível da TELA — não só do board ────
  //
  // Bug medido: o card já pulava de coluna na hora (otimismo dentro do
  // Kanban), mas o OBJETO `tarefa` que ele carregava consigo continuava com o
  // `status` antigo — a mutação ainda não tinha voltado do servidor. Clicar
  // no card nesse intervalo abria o formulário com a situação de ONTEM, e só
  // corrigia depois que o refetch chegasse. `sobrepostas` sobe pra cá — e
  // `tarefasEfetivas` (definida abaixo) é a ÚNICA lista que Kanban,
  // indicadores, Lista e Calendário enxergam — pra ninguém ler dois relógios
  // diferentes do mesmo arraste.
  const [sobrepostas, setSobrepostas] = useState<Map<string, SituacaoDaTarefa>>(new Map());
  const [tarefasNoUltimoAjuste, setTarefasNoUltimoAjuste] = useState(tarefas);

  // Ajuste DURANTE o render (não em `useEffect`, que rodaria DEPOIS do
  // primeiro paint e reintroduziria o mesmo "pisca com o dado velho" que este
  // bloco existe para apagar): assim que `tarefas` muda de referência —
  // refetch confirmando o arraste, ou qualquer outra edição —, tira do mapa
  // toda sobreposição que já virou realidade.
  if (tarefas !== tarefasNoUltimoAjuste) {
    setTarefasNoUltimoAjuste(tarefas);
    const confirmadas = new Set(
      tarefas.filter((tf) => sobrepostas.get(tf.id) === tf.status).map((tf) => tf.id),
    );
    if (confirmadas.size > 0) {
      setSobrepostas((atual) => {
        const proximo = new Map(atual);
        for (const id of confirmadas) proximo.delete(id);
        return proximo;
      });
    }
  }

  const tarefasEfetivas = useMemo(() => {
    if (sobrepostas.size === 0) return tarefas;
    return tarefas.map((tf) => {
      const situacaoOtimista = sobrepostas.get(tf.id);
      return situacaoOtimista && situacaoOtimista !== tf.status
        ? { ...tf, status: situacaoOtimista }
        : tf;
    });
  }, [tarefas, sobrepostas]);

  async function moverNoKanban(tarefa: Tarefa, novaSituacao: SituacaoDaTarefa) {
    if (tarefa.status === novaSituacao) return;
    setSobrepostas((atual) => new Map(atual).set(tarefa.id, novaSituacao));
    try {
      await editarTarefa(tarefa.id, { status: novaSituacao });
    } catch {
      // Desfaz o otimismo: a coluna volta a refletir o `status` real.
      setSobrepostas((atual) => {
        const proximo = new Map(atual);
        proximo.delete(tarefa.id);
        return proximo;
      });
      toast.error(t("Não foi possível mover a tarefa."));
    }
  }

  const tarefasFiltradas = useMemo(() => {
    if (situacao === "aberto") {
      return tarefasEfetivas.filter((tf) => tf.status === "pending" || tf.status === "in_progress");
    }
    return tarefasEfetivas.filter((tf) => tf.status === situacao);
  }, [tarefasEfetivas, situacao]);

  function abrirNova(dia?: string, situacaoDaColuna?: SituacaoDaTarefa) {
    setEmEdicao(null);
    setPrazoSugerido(dia);
    setSituacaoSugerida(situacaoDaColuna);
    setAberturas((n) => n + 1);
    setFormAberto(true);
  }

  function abrirEdicao(tarefa: Tarefa) {
    setEmEdicao(tarefa);
    setPrazoSugerido(undefined);
    setSituacaoSugerida(undefined);
    setAberturas((n) => n + 1);
    setFormAberto(true);
  }

  async function salvar(entrada: NovaTarefa) {
    if (emEdicao) await editarTarefa(emEdicao.id, entrada);
    else await criarTarefa(entrada);
  }

  return (
    <div
      className={cn(
        "mx-auto flex w-full flex-col gap-6 p-4 sm:p-6",
        // O Kanban tem 4 colunas lado a lado — o mesmo teto de largura da
        // Lista/Calendário (pensado para texto) deixaria a maioria delas fora
        // da tela sem rolar. Mais espaço aqui, sem virar full-bleed.
        modo === "quadro" ? "max-w-7xl" : "max-w-5xl",
      )}
    >
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("Tarefas")}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {t(
              "O que ficou combinado, com prazo. Tarefa presa a um negócio aparece na linha do tempo dele.",
            )}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* No Kanban a coluna JÁ é o filtro de situação — mostrar os dois ao
              mesmo tempo deixaria a tela com dois controles competindo pela
              mesma pergunta. Lista e Calendário continuam precisando dele. */}
          {modo !== "quadro" && (
            <Select
              value={situacao}
              onValueChange={(v) => setSituacao(v as FiltroDeSituacao)}
            >
              <SelectTrigger className="h-9 w-[168px] text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="aberto">{t("Em aberto")}</SelectItem>
                <SelectItem value="pending">{t("Pendente")}</SelectItem>
                <SelectItem value="in_progress">{t("Em andamento")}</SelectItem>
                <SelectItem value="done">{t("Concluída")}</SelectItem>
                <SelectItem value="cancelled">{t("Cancelada")}</SelectItem>
              </SelectContent>
            </Select>
          )}

          <div className="flex items-center gap-0.5 rounded-md border bg-muted p-0.5">
            <button
              type="button"
              onClick={() => setModo("quadro")}
              aria-pressed={modo === "quadro"}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                modo === "quadro"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <Kanban size={14} aria-hidden />
              {t("Quadro")}
            </button>
            <button
              type="button"
              onClick={() => setModo("lista")}
              aria-pressed={modo === "lista"}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                modo === "lista"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <ListChecks size={14} aria-hidden />
              {t("Lista")}
            </button>
            <button
              type="button"
              onClick={() => setModo("calendario")}
              aria-pressed={modo === "calendario"}
              className={cn(
                "flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors",
                modo === "calendario"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              <CalendarBlank size={14} aria-hidden />
              {t("Calendário")}
            </button>
          </div>

          <Button
            variant="outline"
            size="sm"
            className="h-9 gap-1.5 text-xs"
            onClick={() => recarregar()}
            disabled={carregando}
          >
            <ArrowsClockwise size={14} className={cn(carregando && "animate-spin")} aria-hidden />
            {t("Atualizar")}
          </Button>

          {podeEditar && (
            <Button size="sm" className="h-9 gap-1.5 text-xs" onClick={() => abrirNova()}>
              <Plus size={14} aria-hidden />
              {t("Nova tarefa")}
            </Button>
          )}
        </div>
      </div>

      {falhou ? (
        <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-6 text-center">
          <p className="text-sm font-medium text-destructive">
            {t("Não foi possível carregar as tarefas.")}
          </p>
          <Button variant="outline" size="sm" className="mt-3 text-xs" onClick={() => recarregar()}>
            {t("Tentar novamente")}
          </Button>
        </div>
      ) : carregando ? (
        <div className="space-y-3" aria-busy>
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg border bg-card" />
          ))}
        </div>
      ) : (
        <>
          <IndicadoresDeTarefas tarefas={tarefasEfetivas} />

          {modo === "quadro" ? (
            <KanbanDeTarefas
              tarefas={tarefasEfetivas}
              podeEditar={podeEditar}
              aoEditar={abrirEdicao}
              aoNovaNaColuna={(situacaoDaColuna) => abrirNova(undefined, situacaoDaColuna)}
              aoMudarSituacao={moverNoKanban}
              aoApagar={(tarefa) => apagarTarefa(tarefa.id)}
            />
          ) : modo === "calendario" ? (
            <CalendarioDeTarefas
              tarefas={tarefasFiltradas}
              podeEditar={podeEditar}
              aoAbrirTarefa={abrirEdicao}
              aoClicarNoDia={abrirNova}
            />
          ) : (
            <ListaDeTarefas
              tarefas={tarefasFiltradas}
              podeEditar={podeEditar}
              aoAlternarConcluida={alternarConcluida}
              aoEditar={abrirEdicao}
              aoApagar={(tarefa) => apagarTarefa(tarefa.id)}
            />
          )}
        </>
      )}

      <FormularioDeTarefa
        key={aberturas}
        aberto={formAberto}
        aoMudarAbertura={setFormAberto}
        tarefa={emEdicao}
        prazoSugerido={prazoSugerido}
        situacaoSugerida={situacaoSugerida}
        aoSalvar={salvar}
      />
    </div>
  );
}
