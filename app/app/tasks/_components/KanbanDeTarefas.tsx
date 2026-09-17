"use client";

import { useMemo, useState } from "react";
import { DragDropContext, Draggable, Droppable, type DropResult } from "@hello-pangea/dnd";

import { Button } from "@/components/ui/button";
import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useT } from "@/hooks/i18n/useT";
import {
  estaAtrasada,
  estaEncerrada,
  SITUACOES_DA_TAREFA,
  type SituacaoDaTarefa,
  type Tarefa,
} from "@/lib/tarefas/tipos";
import { Check, Plus, Trash } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

import { COR_DA_PRIORIDADE, rotuloDaPrioridade } from "./prioridade";

interface Props {
  /** Já com o otimismo do arraste aplicado por `TarefasClient` — ver o
   * cabeçalho de `moverNoKanban` lá. Este componente só agrupa por
   * `tarefa.status`, sem manter estado otimista próprio. */
  tarefas: Tarefa[];
  podeEditar: boolean;
  aoEditar: (tarefa: Tarefa) => void;
  /** "+" de uma coluna — abre o formulário com a situação da coluna pré-marcada. */
  aoNovaNaColuna: (situacao: SituacaoDaTarefa) => void;
  aoMudarSituacao: (tarefa: Tarefa, situacao: SituacaoDaTarefa) => Promise<unknown>;
  aoApagar: (tarefa: Tarefa) => Promise<unknown>;
}

const COR_DA_COLUNA: Record<SituacaoDaTarefa, string> = {
  pending: "bg-slate-400",
  in_progress: "bg-primary",
  done: "bg-emerald-500",
  cancelled: "bg-muted-foreground/40",
};

function agrupaPorSituacao(tarefas: Tarefa[]): Map<SituacaoDaTarefa, Tarefa[]> {
  const mapa = new Map<SituacaoDaTarefa, Tarefa[]>();
  for (const situacao of SITUACOES_DA_TAREFA) mapa.set(situacao, []);
  for (const tarefa of tarefas) mapa.get(tarefa.status)?.push(tarefa);
  return mapa;
}

interface CartaoProps {
  tarefa: Tarefa;
  podeEditar: boolean;
  atrasada: boolean;
  rotuloDaPrioridade: string;
  tag: string;
  dragHandleProps: React.HTMLAttributes<HTMLElement> | null | undefined;
  draggableProps: React.HTMLAttributes<HTMLElement>;
  innerRef: (el: HTMLElement | null) => void;
  isDragging: boolean;
  onEditar: () => void;
  onAlternarConcluida: () => Promise<unknown>;
  onApagar: () => Promise<unknown>;
}

/**
 * O cartão — extraído do `.map` porque agora tem ESTADO PRÓPRIO (a bolinha de
 * concluir e a confirmação de apagar em dois toques, igual `Linha` em
 * `ListaDeTarefas.tsx`). Sem a extração, esse estado teria de virar um Map
 * indexado por id lá em cima, um por card — a mesma armadilha que o otimismo
 * do arraste já pagou uma vez (ver `TarefasClient.moverNoKanban`).
 *
 * A bolinha chama `onAlternarConcluida` → `aoMudarSituacao` (o MESMO caminho
 * otimista do arraste, não `alternarConcluida` de `useTasks` direto): clicar
 * nela precisa mover o card pra coluna "Concluída" na hora, do jeito que
 * soltar o card já move — dois gestos pro mesmo resultado não podem ter UX
 * diferente.
 */
function CartaoDaTarefa({
  tarefa,
  podeEditar,
  atrasada,
  rotuloDaPrioridade,
  tag,
  dragHandleProps,
  draggableProps,
  innerRef,
  isDragging,
  onEditar,
  onAlternarConcluida,
  onApagar,
}: CartaoProps) {
  const t = useT();
  const [ocupada, setOcupada] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const encerrada = estaEncerrada(tarefa);

  async function comBloqueio(acao: () => Promise<unknown>) {
    setOcupada(true);
    try {
      await acao();
    } finally {
      setOcupada(false);
    }
  }

  return (
    <div
      ref={innerRef}
      {...draggableProps}
      {...dragHandleProps}
      role={podeEditar ? "button" : undefined}
      tabIndex={podeEditar ? 0 : undefined}
      onClick={podeEditar ? onEditar : undefined}
      onKeyDown={
        podeEditar
          ? (e) => {
              if (e.key === "Enter") onEditar();
            }
          : undefined
      }
      className={cn(
        "group/cartao flex items-start gap-2 rounded-lg border bg-card p-2.5 text-left shadow-sm transition-shadow",
        podeEditar && "cursor-pointer hover:shadow-md",
        isDragging && "shadow-lg ring-2 ring-primary/40",
      )}
    >
      {/* A bolinha — redonda de propósito, pra diferenciar de relance da
          caixinha quadrada da Lista: aqui ela é o gesto RÁPIDO de concluir
          sem abrir o cartão. */}
      <button
        type="button"
        role="checkbox"
        aria-checked={encerrada}
        aria-label={encerrada ? t("Reabrir a tarefa") : t("Marcar como concluída")}
        disabled={ocupada || !podeEditar}
        onClick={(e) => {
          e.stopPropagation();
          void comBloqueio(onAlternarConcluida);
        }}
        className={cn(
          "mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border transition-colors",
          encerrada
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
      >
        {encerrada ? <Check size={10} weight="bold" aria-hidden /> : null}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "text-sm font-medium leading-snug",
            encerrada && "text-muted-foreground line-through",
          )}
        >
          {tarefa.title}
        </p>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
          <span
            className={cn(
              "rounded-full px-1.5 py-0.5 font-medium",
              COR_DA_PRIORIDADE[tarefa.priority],
            )}
          >
            {rotuloDaPrioridade}
          </span>
          {tarefa.due_date ? (
            <span
              className={cn(
                "text-muted-foreground",
                atrasada && "font-semibold text-destructive",
              )}
            >
              {new Date(tarefa.due_date).toLocaleDateString(tag, {
                day: "2-digit",
                month: "2-digit",
              })}
            </span>
          ) : null}
        </div>
      </div>

      {podeEditar ? (
        <div
          className={cn(
            "shrink-0 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cartao:opacity-100",
            confirmando && "opacity-100",
          )}
        >
          {confirmando ? (
            <Button
              variant="destructive"
              size="sm"
              className="h-6 px-1.5 text-[10px]"
              disabled={ocupada}
              onClick={(e) => {
                e.stopPropagation();
                void comBloqueio(onApagar);
              }}
              onBlur={() => setConfirmando(false)}
            >
              {t("Confirmar")}
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="icon"
              className="h-6 w-6"
              aria-label={t("Apagar a tarefa")}
              onClick={(e) => {
                e.stopPropagation();
                setConfirmando(true);
              }}
            >
              <Trash size={13} aria-hidden />
            </Button>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * O quadro por situação — a visão padrão da tela.
 *
 * Arrastar entre colunas chama a MESMA mutação `PATCH /api/v1/tasks/:id` que
 * o formulário usa (`aoMudarSituacao`, que em `TarefasClient` é
 * `moverNoKanban`) — nenhum caminho novo de escrita, e o audit log e o
 * registro na timeline do negócio (que a rota já faz quando a situação vira
 * "done") continuam valendo sem precisar duplicar nada aqui.
 *
 * O otimismo do arraste (card pula de coluna na hora, sem esperar o
 * servidor) mora em `TarefasClient`, não aqui — de propósito: ele também
 * alimenta os indicadores e a Lista/Calendário com a MESMA `tarefas`
 * ajustada, então um clique no card logo após soltá-lo já abre com a
 * situação nova (era o bug: o card pulava de coluna, mas o objeto que ele
 * carregava consigo ainda tinha o `status` de antes do arraste).
 */
export function KanbanDeTarefas({
  tarefas,
  podeEditar,
  aoEditar,
  aoNovaNaColuna,
  aoMudarSituacao,
  aoApagar,
}: Props) {
  const t = useT();
  const tag = useTagDeIdioma();
  const rotulos = rotuloDaPrioridade(t);

  const rotuloDaSituacao: Record<SituacaoDaTarefa, string> = {
    pending: t("Pendente"),
    in_progress: t("Em andamento"),
    done: t("Concluída"),
    cancelled: t("Cancelada"),
  };

  const agrupadas = useMemo(() => agrupaPorSituacao(tarefas), [tarefas]);

  function aoSoltar(resultado: DropResult) {
    const { source, destination, draggableId } = resultado;
    if (!destination || source.droppableId === destination.droppableId) return;

    const novaSituacao = destination.droppableId as SituacaoDaTarefa;
    const tarefa = tarefas.find((tf) => tf.id === draggableId);
    if (!tarefa) return;

    void aoMudarSituacao(tarefa, novaSituacao);
  }

  return (
    <DragDropContext onDragEnd={aoSoltar}>
      <div className="flex gap-3 overflow-x-auto pb-2">
        {SITUACOES_DA_TAREFA.map((situacao) => {
          const linhas = agrupadas.get(situacao) ?? [];
          return (
            <div key={situacao} className="flex w-72 shrink-0 flex-col rounded-xl border bg-muted/30">
              <div className="flex items-center gap-2 border-b px-3 py-2.5">
                <span className={cn("h-2 w-2 shrink-0 rounded-full", COR_DA_COLUNA[situacao])} aria-hidden />
                <h2 className="flex-1 truncate text-sm font-semibold">{rotuloDaSituacao[situacao]}</h2>
                <span className="rounded-full bg-card px-2 py-0.5 text-[11px] font-medium tabular-nums text-muted-foreground">
                  {linhas.length}
                </span>
                {podeEditar && (
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    aria-label={`${t("Adicionar")} — ${rotuloDaSituacao[situacao]}`}
                    onClick={() => aoNovaNaColuna(situacao)}
                  >
                    <Plus size={14} aria-hidden />
                  </Button>
                )}
              </div>

              <Droppable droppableId={situacao}>
                {(provided, snapshot) => (
                  <div
                    ref={provided.innerRef}
                    {...provided.droppableProps}
                    className={cn(
                      "flex min-h-[80px] flex-1 flex-col gap-2 p-2 transition-colors",
                      snapshot.isDraggingOver && "bg-primary/5",
                    )}
                  >
                    {linhas.map((tarefa, index) => {
                      const atrasada = estaAtrasada(tarefa);
                      return (
                        <Draggable
                          key={tarefa.id}
                          draggableId={tarefa.id}
                          index={index}
                          isDragDisabled={!podeEditar}
                        >
                          {(providedCard, snapshotCard) => (
                            <CartaoDaTarefa
                              tarefa={tarefa}
                              podeEditar={podeEditar}
                              atrasada={atrasada}
                              rotuloDaPrioridade={rotulos[tarefa.priority]}
                              tag={tag}
                              innerRef={providedCard.innerRef}
                              draggableProps={providedCard.draggableProps}
                              dragHandleProps={providedCard.dragHandleProps}
                              isDragging={snapshotCard.isDragging}
                              onEditar={() => aoEditar(tarefa)}
                              onAlternarConcluida={() =>
                                aoMudarSituacao(tarefa, tarefa.status === "done" ? "pending" : "done")
                              }
                              onApagar={() => aoApagar(tarefa)}
                            />
                          )}
                        </Draggable>
                      );
                    })}
                    {provided.placeholder}
                    {linhas.length === 0 && !snapshot.isDraggingOver && (
                      <p className="px-1 py-4 text-center text-[11px] text-muted-foreground">
                        {t("Nenhuma tarefa")}
                      </p>
                    )}
                  </div>
                )}
              </Droppable>

              {podeEditar && (
                <button
                  type="button"
                  onClick={() => aoNovaNaColuna(situacao)}
                  className="flex items-center gap-1.5 border-t px-3 py-2 text-xs text-muted-foreground transition-colors hover:bg-muted/50 hover:text-foreground"
                >
                  <Plus size={12} aria-hidden />
                  {t("Adicionar")}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </DragDropContext>
  );
}
