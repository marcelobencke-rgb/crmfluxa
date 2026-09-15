"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { useT } from "@/hooks/i18n/useT";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { ApiError } from "@/lib/api/types";
import { Archive, CaretDown, CaretUp, Check, Funnel, PencilSimple, Plus } from "@/lib/ui/icons";
import {
  useArquivarFunil,
  useCriarFunil,
  useEditarFunil,
  type FunilDaResposta,
} from "@/hooks/pipelines/usePipelines";

/**
 * O SELETOR ONDE ANTES HAVIA UM `<h1>` ESTÁTICO — e onde a lista de
 * `/app/kanban` foi parar quando o menu deixou de abrir a listagem.
 *
 * ⚠️ POR QUE ISTO SUBSTITUI A TELA INTEIRA DE `/app/kanban`. O menu "Funis"
 * agora entra DIRETO no quadro do funil padrão (`/app/kanban/page.tsx` só
 * redireciona). A gestão que antes vivia numa página própria — trocar,
 * criar, renomear, reordenar, tornar padrão, arquivar — mora aqui, porque é
 * daqui que ela continua com porta: sem isto, "renomear um funil" e
 * "reordenar" ficariam sem nenhum lugar alcançável pela tela, e uma
 * capacidade sem porta é o oposto do que a doutrina do Sistema Vivo pede.
 *
 * "Gerenciar funis" fecha o menu para "Etapas do funil"
 * (`/app/settings/tenant/pipelines`), que já era a tela de configuração mais
 * profunda (colunas, vocabulário, motivos de perda) — por isso ela some do
 * grupo separado que tinha antes.
 */

/**
 * O vizinho DE CIMA depois de mover o funil uma casa (`null` = primeiro da lista).
 *
 * É o que o PATCH espera: quem clica na seta sabe onde o funil vai parar, não
 * qual fração de `position` isso vira. Subir uma casa é "passar a ficar depois de
 * quem estava DUAS casas acima" — daí o `i - 2`.
 */
export function vizinhoAoMover(
  funis: FunilDaResposta[],
  i: number,
  direcao: "subir" | "descer",
): string | null {
  if (direcao === "subir") return funis[i - 2]?.id ?? null;
  return funis[i + 1]?.id ?? null;
}

/**
 * A mensagem que a rota escreveu, ou uma frase honesta quando não há nenhuma.
 *
 * ⚠️ NUNCA INVENTAR TEXTO NO LUGAR DA RECUSA — mesma razão do antigo
 * `app/app/kanban/_client.tsx`: as mensagens de `lib/pipelines/pipeline-editing.ts`
 * são a única coisa que explica por que o funil não pode ser arquivado.
 */
function textoDoErro(e: unknown, t: (texto: string) => string): string {
  if (e instanceof ApiError) return t(e.message);
  if (e instanceof Error && e.message) return e.message;
  return t("Não consegui completar essa ação. Tente de novo.");
}

/**
 * Um ícone de ação de linha, com o "o que isto faz" visível ao passar o
 * mouse — só o ícone (sem rótulo) não diz nada sozinho a quem não decorou a
 * ordem dos botões. `tooltip` é o verbo curto ("Renomear"); `srLabel` continua
 * mais verboso (leva o nome do funil) porque é ele que desambigua a linha para
 * quem usa leitor de tela, onde só o texto de fato importa.
 */
function AcaoDaLinha({
  tooltip,
  srLabel,
  testId,
  disabled,
  onClick,
  icon,
}: {
  tooltip: string;
  srLabel: string;
  testId: string;
  disabled?: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          aria-label={srLabel}
          data-testid={testId}
          disabled={disabled}
          onClick={onClick}
        >
          {icon}
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top">{tooltip}</TooltipContent>
    </Tooltip>
  );
}

export function PipelineSwitcher({
  pipelineId,
  pipelineName,
  funisIniciais,
  podeGerenciar,
}: {
  pipelineId: string;
  /** Nome do funil atual — cai aqui só se `funisIniciais` ainda não trouxer a linha. */
  pipelineName: string;
  /** Todos os funis não arquivados da organização, na ordem de exibição. */
  funisIniciais: FunilDaResposta[];
  /** Espelha o `requireRole("manager")` das rotas de escrita — ver `usePipelines.ts`. */
  podeGerenciar: boolean;
}) {
  const t = useT();
  const router = useRouter();

  // Mesmo padrão de `app/app/kanban/_client.tsx`: a lista vem do SERVIDOR (via
  // page.tsx) e é atualizada pelo CORPO da resposta de cada mutação — nunca
  // por um `router.refresh()` que corre contra os prefetches da barra lateral.
  const [funis, setFunis] = useState<FunilDaResposta[]>(funisIniciais);
  const [ultimoDoServidor, setUltimoDoServidor] = useState<FunilDaResposta[]>(funisIniciais);
  if (funisIniciais !== ultimoDoServidor) {
    setUltimoDoServidor(funisIniciais);
    setFunis(funisIniciais);
  }

  const [open, setOpen] = useState(false);
  const [novo, setNovo] = useState<string | null>(null);
  const [renomeando, setRenomeando] = useState<{ id: string; nome: string } | null>(null);
  const [arquivando, setArquivando] = useState<{ id: string; erro: string | null } | null>(null);
  const [erro, setErro] = useState<{ id: string | null; texto: string } | null>(null);

  const criar = useCriarFunil();
  const editar = useEditarFunil();
  const arquivar = useArquivarFunil();
  const ocupado = criar.isPending || editar.isPending || arquivar.isPending;

  const nomeAtual = funis.find((f) => f.id === pipelineId)?.name ?? pipelineName;
  const funilArquivando = arquivando ? funis.find((f) => f.id === arquivando.id) : null;

  function criarFunil() {
    const nome = (novo ?? "").trim();
    if (!nome) return;
    setErro(null);
    const idsAntes = new Set(funis.map((f) => f.id));
    criar.mutate(nome, {
      onSuccess: (r) => {
        setFunis(r.data.pipelines);
        setNovo(null);
        // O funil novo é o único id que não estava na lista de antes — a
        // resposta não marca "este é o que você acabou de criar".
        const criado = r.data.pipelines.find((f) => !idsAntes.has(f.id));
        setOpen(false);
        if (criado) router.push(`/app/pipelines/${criado.id}`);
      },
      onError: (e) => setErro({ id: null, texto: textoDoErro(e, t) }),
    });
  }

  function aplicar(id: string, patch: Parameters<typeof editar.mutate>[0]["patch"]) {
    setErro(null);
    editar.mutate(
      { id, patch },
      {
        onSuccess: (r) => {
          setFunis(r.data.pipelines);
          setRenomeando(null);
        },
        onError: (e) => setErro({ id, texto: textoDoErro(e, t) }),
      },
    );
  }

  function pedirArquivamento(id: string, definitivo: boolean) {
    arquivar.mutate(
      { id, definitivo },
      {
        onSuccess: (r) => {
          setFunis(r.data.pipelines);
          setArquivando(null);
          // Arquivou o funil que você está OLHANDO: este quadro deixou de
          // existir para você. `/app/kanban` redireciona para o novo padrão —
          // e a recusa de arquivar padrão/único garante que sempre sobra um.
          if (id === pipelineId) router.push("/app/kanban");
        },
        // A recusa fica NO DIÁLOGO, não num toast: ela é a resposta à
        // pergunta que o usuário acabou de fazer.
        onError: (e) => setArquivando({ id, erro: textoDoErro(e, t) }),
      },
    );
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="lg"
            className="group h-auto min-w-0 max-w-full gap-1.5 rounded-md px-2 py-1 text-2xl font-semibold tracking-tight hover:bg-accent-soft hover:text-accent"
            data-testid="seletor-de-funil"
            aria-label={`${t("Trocar de funil")}: ${nomeAtual}`}
          >
            <span className="min-w-0 truncate">{nomeAtual}</span>
            <CaretDown
              size={18}
              className="shrink-0 text-muted-foreground transition-transform group-data-[state=open]:rotate-180"
              aria-hidden
            />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="start" className="w-[22rem] max-w-[calc(100vw-2rem)]">
          <DropdownMenuLabel>{t("Funis")}</DropdownMenuLabel>

          {erro?.id === null && (
            <p className="px-2 pb-1.5 text-xs leading-relaxed text-destructive" data-testid="erro-geral">
              {erro.texto}
            </p>
          )}

          <TooltipProvider delayDuration={200}>
          <ul className="flex max-h-72 flex-col gap-0.5 overflow-y-auto px-1 pb-1">
            {funis.map((funil, i) => {
              const atual = funil.id === pipelineId;
              const renomeandoAqui = renomeando?.id === funil.id ? renomeando : null;
              const erroDaLinha = erro?.id === funil.id ? erro.texto : null;

              return (
                <li key={funil.id} data-testid={`funil-${funil.id}`} className="flex flex-col">
                  <div className="flex items-center gap-1">
                    {renomeandoAqui ? (
                      <div className="flex min-w-0 flex-1 items-center gap-1 py-0.5">
                        <Input
                          autoFocus
                          value={renomeandoAqui.nome}
                          onChange={(e) => setRenomeando({ id: funil.id, nome: e.target.value })}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") aplicar(funil.id, { name: renomeandoAqui.nome });
                            if (e.key === "Escape") setRenomeando(null);
                          }}
                          aria-label={`${t("Novo nome de")} «${funil.name}»`}
                          data-testid={`nome-${funil.id}`}
                          disabled={ocupado}
                          className="h-8"
                        />
                        <Button
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs"
                          onClick={() => aplicar(funil.id, { name: renomeandoAqui.nome })}
                          disabled={ocupado || !renomeandoAqui.nome.trim()}
                          data-testid={`salvar-nome-${funil.id}`}
                        >
                          {t("Salvar")}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-8 shrink-0 px-2 text-xs"
                          onClick={() => setRenomeando(null)}
                          disabled={ocupado}
                        >
                          {t("Cancelar")}
                        </Button>
                      </div>
                    ) : (
                      <DropdownMenuItem
                        asChild
                        className="min-w-0 flex-1 cursor-pointer flex-col items-start gap-0 py-1.5"
                        data-testid={`abrir-${funil.id}`}
                      >
                        <Link href={`/app/pipelines/${funil.id}`}>
                          <span className="flex w-full items-center gap-1.5">
                            <span className={cn("truncate text-sm", atual && "font-semibold")}>
                              {funil.name}
                            </span>
                            {funil.is_default && (
                              <Badge variant="secondary" className="shrink-0 text-[10px]">
                                {t("Padrão")}
                              </Badge>
                            )}
                            {atual && <Check size={12} className="shrink-0 text-muted-foreground" aria-hidden />}
                          </span>
                          <span className="text-[11px] text-muted-foreground">/{funil.slug}</span>
                        </Link>
                      </DropdownMenuItem>
                    )}

                    {podeGerenciar && !renomeandoAqui && (
                      <div className="flex shrink-0 items-center gap-0.5">
                        <AcaoDaLinha
                          tooltip={t("Subir")}
                          srLabel={`${t("Subir")} «${funil.name}» ${t("na lista")}`}
                          testId={`subir-${funil.id}`}
                          disabled={ocupado || i === 0}
                          onClick={() => aplicar(funil.id, { depois_de: vizinhoAoMover(funis, i, "subir") })}
                          icon={<CaretUp size={14} aria-hidden />}
                        />
                        <AcaoDaLinha
                          tooltip={t("Descer")}
                          srLabel={`${t("Descer")} «${funil.name}» ${t("na lista")}`}
                          testId={`descer-${funil.id}`}
                          disabled={ocupado || i === funis.length - 1}
                          onClick={() => aplicar(funil.id, { depois_de: vizinhoAoMover(funis, i, "descer") })}
                          icon={<CaretDown size={14} aria-hidden />}
                        />
                        <AcaoDaLinha
                          tooltip={t("Renomear")}
                          srLabel={`${t("Renomear")} «${funil.name}»`}
                          testId={`renomear-${funil.id}`}
                          disabled={ocupado}
                          onClick={() => setRenomeando({ id: funil.id, nome: funil.name })}
                          icon={<PencilSimple size={14} aria-hidden />}
                        />
                        {!funil.is_default && (
                          <AcaoDaLinha
                            tooltip={t("Tornar padrão")}
                            srLabel={`${t("Tornar padrão")} «${funil.name}»`}
                            testId={`padrao-${funil.id}`}
                            disabled={ocupado}
                            onClick={() => aplicar(funil.id, { is_default: true })}
                            icon={<Check size={14} aria-hidden />}
                          />
                        )}
                        <AcaoDaLinha
                          tooltip={t("Arquivar")}
                          srLabel={`${t("Arquivar")} «${funil.name}»`}
                          testId={`arquivar-${funil.id}`}
                          disabled={ocupado}
                          onClick={() => {
                            setErro(null);
                            setArquivando({ id: funil.id, erro: null });
                            setOpen(false);
                          }}
                          icon={<Archive size={14} aria-hidden />}
                        />
                      </div>
                    )}
                  </div>

                  {erroDaLinha && (
                    <p className="px-2 pb-1 text-xs leading-relaxed text-destructive" data-testid={`erro-${funil.id}`}>
                      {erroDaLinha}
                    </p>
                  )}
                </li>
              );
            })}
          </ul>
          </TooltipProvider>

          {podeGerenciar && (
            <>
              <DropdownMenuSeparator />
              {novo !== null ? (
                <div className="flex flex-col gap-2 p-2" data-testid="form-novo-funil">
                  <Input
                    autoFocus
                    value={novo}
                    onChange={(e) => setNovo(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") criarFunil();
                      if (e.key === "Escape") setNovo(null);
                    }}
                    placeholder={t("Nome do funil — ex.: Consultas, Obras, Matrículas")}
                    aria-label={t("Nome do novo funil")}
                    data-testid="nome-do-novo-funil"
                    disabled={ocupado}
                    className="h-8"
                  />
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      className="h-8 flex-1 text-xs"
                      onClick={criarFunil}
                      disabled={ocupado || !novo.trim()}
                      data-testid="confirmar-novo-funil"
                    >
                      {t("Criar funil")}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-8 text-xs"
                      onClick={() => setNovo(null)}
                      disabled={ocupado}
                    >
                      {t("Cancelar")}
                    </Button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-hidden transition-colors hover:bg-accent hover:text-accent-foreground disabled:pointer-events-none disabled:opacity-50"
                  onClick={() => setNovo("")}
                  disabled={ocupado}
                  data-testid="novo-funil"
                >
                  <Plus size={16} aria-hidden /> {t("Novo funil")}
                </button>
              )}
            </>
          )}

          {podeGerenciar && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem asChild className="cursor-pointer gap-2">
                <Link href="/app/settings/tenant/pipelines" data-testid="gerenciar-funis">
                  <Funnel size={16} aria-hidden /> {t("Gerenciar funis")}
                </Link>
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={arquivando !== null} onOpenChange={(v) => !v && setArquivando(null)}>
        <DialogContent
          className="sm:max-w-md"
          data-testid={arquivando ? `arquivar-painel-${arquivando.id}` : undefined}
        >
          <DialogHeader>
            <DialogTitle>
              {t("Arquivar")} «{funilArquivando?.name ?? ""}»?
            </DialogTitle>
          </DialogHeader>
          {arquivando?.erro ? (
            <p className="text-sm leading-relaxed" data-testid={`arquivar-erro-${arquivando.id}`}>
              {arquivando.erro}
            </p>
          ) : (
            <p className="text-sm leading-relaxed text-muted-foreground">
              {t(
                "Ele sai desta lista e para de receber negócio novo. O histórico continua guardado, e nada é apagado.",
              )}
            </p>
          )}
          <div className="flex flex-wrap justify-end gap-2 pt-2">
            <Button variant="ghost" size="sm" onClick={() => setArquivando(null)} disabled={ocupado}>
              {t("Cancelar")}
            </Button>
            {/* Excluir de vez só passa no funil que NUNCA recebeu negócio. A tela
                não sabe disso antes de perguntar — a rota recusa explicando, e a
                explicação aparece aqui mesmo. */}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => arquivando && pedirArquivamento(arquivando.id, true)}
              disabled={ocupado}
              data-testid={arquivando ? `excluir-${arquivando.id}` : undefined}
            >
              {t("Excluir de vez")}
            </Button>
            <Button
              size="sm"
              onClick={() => arquivando && pedirArquivamento(arquivando.id, false)}
              disabled={ocupado}
              data-testid={arquivando ? `arquivar-confirmar-${arquivando.id}` : undefined}
            >
              {t("Arquivar")}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
