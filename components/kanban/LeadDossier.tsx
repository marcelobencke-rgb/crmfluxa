"use client";

import { useTagDeIdioma } from "@/hooks/i18n/useLocaleDeData";
import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import Link from "next/link";

import { useT } from "@/hooks/i18n/useT";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadTimeline } from "@/hooks/leads/useLeadTimeline";
import { useCreateLeadNote } from "@/hooks/leads/useCreateLeadNote";
import { useTasks } from "@/hooks/tasks/useTasks";
import { useAgendamentosDoContato } from "@/hooks/agenda/useAgendamentosDoContato";
import { useContact } from "@/hooks/contacts/useContact";
import { useContactList } from "@/hooks/contacts/useContactList";
import { useContactFieldDefs } from "@/hooks/contacts/useContactFieldDefs";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import { useMoveCard } from "@/hooks/kanban/useMoveCard";
import { midpoint } from "@/lib/kanban/fractional-indexing";
import { ChatThread } from "@/components/inbox/ChatThread";
import { HistoricoDaAgenda } from "@/components/agenda/HistoricoDaAgenda";
import { EditContactDialog } from "@/components/contacts/EditContactDialog";
import { ListaDeTarefas } from "@/app/app/tasks/_components/ListaDeTarefas";
import { FormularioDeTarefa } from "@/app/app/tasks/_components/FormularioDeTarefa";
import type { Tarefa } from "@/lib/tarefas/tipos";
import type { Lead } from "@/lib/types/leads";
import type { Contact } from "@/lib/types/contacts";
import type { Stage } from "@/lib/kanban/types";
import { rotuloDoContato } from "@/lib/contacts/rotulo-do-contato";
import { phoneForDisplay } from "@/lib/channels/phone-variants";
import { LeadFieldsForm } from "./LeadFieldsForm";
import { ScoreSlot } from "./ScoreSlot";
import { LeadTimeline } from "./LeadTimeline";
import { OwnerPicker } from "./OwnerPicker";
import { resolveLeadOwner } from "@/lib/kanban/owner";
import {
  ArrowSquareOut,
  CalendarBlank,
  CaretDown,
  ChatCircle,
  Eye,
  LinkSimple,
  ListChecks,
  Paperclip,
  PaperPlaneTilt,
  PencilSimple,
  Plus,
  Storefront,
} from "@/lib/ui/icons";
import type { CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  stageName: string;
  /** As etapas do funil — pra trocar de etapa direto no cabeçalho. */
  stages: Stage[];
  /**
   * Os outros negócios do funil — só pra achar o ÚLTIMO da etapa de destino
   * e calcular a posição (mesma conta do arraste, `midpoint`). Não precisa
   * estar 100% em dia: o pior caso de uma posição levemente desatualizada é
   * o card nascer um lugar atrás do que nasceria com o dado fresco, nunca um
   * erro visível.
   */
  leads: Lead[];
  ownerNames?: Map<string, string | null>;
}

function formatBRL(cents: number | null, currency: string | null): string {
  if (cents === null) return "—";
  try {
    return new Intl.NumberFormat("pt-BR", {
      style: "currency",
      currency: currency ?? "BRL",
      maximumFractionDigits: 0,
    }).format(cents / 100);
  } catch {
    return `R$ ${(cents / 100).toFixed(0)}`;
  }
}

/** As duas abas que ainda não têm dado nenhum guardado — ver o porquê no PR. */
function AbaEmBreve({ texto }: { texto: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-md border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {texto}
    </div>
  );
}

/**
 * As tarefas DESTE negócio.
 *
 * `useTasks({ lead_id })` já existia (a rota e o hook eram usados só pela tela
 * cheia de Tarefas) — aqui é só o mesmo hook com outro filtro.
 */
function AbaTarefas({ leadId, contactId }: { leadId: string; contactId: string | null }) {
  const t = useT();
  const { tarefas, carregando, criarTarefa, editarTarefa, apagarTarefa, alternarConcluida } =
    useTasks({ lead_id: leadId });
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<Tarefa | null>(null);

  function abrirNova() {
    setEditando(null);
    setFormAberto(true);
  }
  function abrirEdicao(tarefa: Tarefa) {
    setEditando(tarefa);
    setFormAberto(true);
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={abrirNova}>
          <Plus size={14} className="mr-1.5" aria-hidden />
          {t("Nova tarefa")}
        </Button>
      </div>
      {carregando ? (
        <div className="space-y-2">
          <Skeleton className="h-14 w-full" />
          <Skeleton className="h-14 w-full" />
        </div>
      ) : (
        <ListaDeTarefas
          tarefas={tarefas}
          podeEditar
          aoAlternarConcluida={alternarConcluida}
          aoEditar={abrirEdicao}
          aoApagar={(tarefa) => apagarTarefa(tarefa.id)}
        />
      )}
      <FormularioDeTarefa
        key={editando?.id ?? "nova"}
        aberto={formAberto}
        aoMudarAbertura={setFormAberto}
        tarefa={editando}
        aoSalvar={(entrada) =>
          editando ? editarTarefa(editando.id, entrada) : criarTarefa(entrada)
        }
        leadId={leadId}
        contactId={contactId}
      />
    </div>
  );
}

/**
 * Os agendamentos do CONTATO deste negócio — não há coluna de negócio em
 * `calendar_appointments` ainda. Ver o comentário de `useAgendamentosDoContato`.
 */
function AbaAgendamentos({ contactId }: { contactId: string | null }) {
  const t = useT();
  const q = useAgendamentosDoContato(contactId);

  if (!contactId) {
    return <AbaEmBreve texto={t("Este negócio não tem contato vinculado — sem contato não há agendamento para mostrar.")} />;
  }
  if (q.isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }
  if (q.isError) {
    return <p className="text-sm text-destructive">{t("Não consegui carregar os agendamentos.")}</p>;
  }
  return (
    <HistoricoDaAgenda
      agendamentos={q.data ?? []}
      pessoas={[]}
      agora={new Date()}
      className="min-h-[320px]"
    />
  );
}

/** O histórico de mensagens embutido — mesma peça que o Inbox usa, sem o composer. */
function AbaConversas({ conversationId }: { conversationId: string | null }) {
  const t = useT();
  if (!conversationId) {
    return <AbaEmBreve texto={t("Ainda não há conversa de WhatsApp com este contato.")} />;
  }
  return (
    <div className="flex h-full min-h-[420px] flex-col gap-2">
      <div className="flex shrink-0 justify-end">
        <Button variant="ghost" size="sm" asChild>
          <Link href={`/app/inbox?id=${conversationId}`} className="gap-1.5">
            {t("Abrir no Inbox")}
            <ArrowSquareOut size={14} aria-hidden />
          </Link>
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden rounded-md border border-border">
        <ChatThread conversationId={conversationId} />
      </div>
    </div>
  );
}

/**
 * A busca de contato existente, pra vincular a um negócio que ainda não tem
 * um (`lead.contact_id === null` — negócio criado à mão ou por webhook sem
 * contato reconhecido).
 *
 * Não existia nenhum combobox de busca de contato no produto (não há `cmdk`
 * nem `components/ui/command.tsx`) — este é feito à mão com `Popover` + lista,
 * sobre a MESMA busca que `/app/contacts` já usa (`useContactList`).
 */
function BuscaDeContato({
  onEscolher,
  ocupado,
}: {
  onEscolher: (contato: Contact) => void;
  ocupado: boolean;
}) {
  const t = useT();
  const [busca, setBusca] = useState("");
  const [buscaComDebounce, setBuscaComDebounce] = useState("");
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounce simples: 300ms sem digitar antes de consultar o servidor — sem
  // isto, cada tecla vira uma requisição. `useRef`, não uma propriedade na
  // função: a função é recriada a cada render, e uma propriedade nela some
  // antes do próximo timeout disparar.
  function aoDigitar(v: string) {
    setBusca(v);
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = setTimeout(() => setBuscaComDebounce(v), 300);
  }

  useEffect(() => {
    return () => {
      if (temporizador.current) clearTimeout(temporizador.current);
    };
  }, []);

  const lista = useContactList({ search: buscaComDebounce || undefined, limit: 8 });
  const contatos = lista.data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="space-y-2">
      <Input
        autoFocus
        placeholder={t("Buscar por nome ou telefone…")}
        value={busca}
        onChange={(e) => aoDigitar(e.target.value)}
        disabled={ocupado}
      />
      <div className="max-h-56 overflow-y-auto rounded-md border border-border">
        {lista.isLoading ? (
          <div className="space-y-1 p-2">
            <Skeleton className="h-8 w-full" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : contatos.length === 0 ? (
          <p className="p-3 text-center text-xs text-text-muted">
            {buscaComDebounce ? t("Nenhum contato encontrado.") : t("Digite para buscar.")}
          </p>
        ) : (
          <ul>
            {contatos.map((c) => (
              <li key={c.id}>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() => onEscolher(c)}
                  className="flex w-full flex-col items-start gap-0 px-3 py-2 text-left text-sm hover:bg-accent disabled:opacity-50"
                >
                  <span className="font-medium">{rotuloDoContato(c, t)}</span>
                  {c.phone_number && (
                    <span className="text-xs text-text-muted">{phoneForDisplay(c.phone_number)}</span>
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

/**
 * O contato deste negócio, no cabeçalho — vincular quando não há nenhum,
 * editar os dados dele quando já há.
 *
 * ⚠️ POR QUE AQUI E NÃO SÓ NA FICHA DO CONTATO. Quem está fechando um negócio
 * percebe um dado errado do cliente NO MEIO da conversa sobre o negócio — abrir
 * a ficha do contato numa aba/tela separada e voltar é o mesmo custo que fez
 * "Editar campos" existir no cabeçalho da versão anterior deste componente.
 */
function ContatoDoLead({
  lead,
  pipelineId,
}: {
  lead: Lead;
  pipelineId: string;
}) {
  const t = useT();
  const contatoQuery = useContact(lead.contact_id ?? "");
  const fieldDefsQuery = useContactFieldDefs(Boolean(lead.contact_id));
  const editar = useEditLead(pipelineId);
  const [editarAberto, setEditarAberto] = useState(false);
  const [vincularAberto, setVincularAberto] = useState(false);

  function vincular(contato: Contact) {
    editar.mutate(
      { leadId: lead.id, patch: { contact_id: contato.id } },
      { onSuccess: () => setVincularAberto(false) },
    );
  }

  if (!lead.contact_id) {
    return (
      <Popover open={vincularAberto} onOpenChange={setVincularAberto}>
        <PopoverTrigger asChild>
          <Button variant="ghost" size="sm" className="h-6 gap-1.5 px-2 text-xs">
            <LinkSimple size={12} aria-hidden />
            {t("Vincular contato")}
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-80">
          <BuscaDeContato onEscolher={vincular} ocupado={editar.isPending} />
        </PopoverContent>
      </Popover>
    );
  }

  const contato = contatoQuery.data?.data;

  return (
    <div className="flex items-center gap-1">
      <span className="text-text-muted">{contato ? rotuloDoContato(contato, t) : t("Carregando…")}</span>
      <Button
        variant="ghost"
        size="icon"
        className="h-5 w-5"
        aria-label={t("Editar contato")}
        disabled={!contato}
        onClick={() => setEditarAberto(true)}
      >
        <PencilSimple size={11} aria-hidden />
      </Button>
      {contato && (
        <EditContactDialog
          contact={contato}
          open={editarAberto}
          onOpenChange={setEditarAberto}
          customFieldDefs={fieldDefsQuery.data ?? []}
        />
      )}
    </div>
  );
}

/**
 * A etapa, no cabeçalho — trocar sem precisar arrastar o card no quadro.
 *
 * Etapa NÃO é campo do PATCH genérico (`updateLeadSchema` recusa `stage_id` —
 * ver o comentário do schema): troca de etapa vai por `/move`, que precisa de
 * `position_in_stage` e `expected_updated_at` (concorrência otimista). Por
 * clique, sem arraste, o destino natural é o FIM da etapa — mesma conta
 * (`midpoint`) que o `KanbanBoard` já faz ao soltar um card na última posição.
 */
function EtapaDoLead({
  lead,
  pipelineId,
  stages,
  leads,
  stageName,
}: {
  lead: Lead;
  pipelineId: string;
  stages: Stage[];
  leads: Lead[];
  stageName: string;
}) {
  const t = useT();
  const mover = useMoveCard(pipelineId);

  function irPara(novaEtapaId: string) {
    if (novaEtapaId === lead.stage_id || mover.isPending) return;
    const daEtapaDestino = leads
      .filter((l) => l.stage_id === novaEtapaId && l.id !== lead.id)
      .sort((a, b) => a.position_in_stage - b.position_in_stage);
    const ultimo = daEtapaDestino[daEtapaDestino.length - 1] ?? null;
    const novaPosicao = midpoint(ultimo?.position_in_stage ?? null, null);
    // Colisão de fração — o board trata isso com rebalanceamento global; aqui
    // só recusa em silêncio, como o próprio arraste já faz.
    if (Number.isNaN(novaPosicao)) return;
    mover.mutate({
      leadId: lead.id,
      stageId: novaEtapaId,
      positionInStage: novaPosicao,
      expectedUpdatedAt: lead.updated_at,
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-xs text-text-muted hover:text-text"
          disabled={mover.isPending}
        >
          {stageName}
          <CaretDown size={10} aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start">
        <DropdownMenuLabel>{t("Etapa")}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {stages
          .filter((s) => !s.is_archived)
          .map((s) => (
            <DropdownMenuItem key={s.id} disabled={s.id === lead.stage_id} onSelect={() => irPara(s.id)}>
              {s.name}
            </DropdownMenuItem>
          ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}


/**
 * O compositor de nota, no rodapé da linha do tempo — "Escrever nota…" com
 * Enter para enviar e Shift+Enter para quebrar linha, o MESMO atalho do
 * composer do inbox (`Composer.tsx`), reaproveitado aqui em vez de reinventado.
 *
 * A nota é a única escrita da timeline que é DECLARADA por quem escreve, e não
 * derivada de outra ação — por isso o campo some no envio e SÓ VOLTA se a
 * gravação falhar (`onError`), do mesmo jeito que o composer do inbox trata
 * uma mensagem que não saiu: perder o texto de um parágrafo por causa de uma
 * falha de rede seria pior do que a falha em si.
 */
function EscreverNota({ leadId }: { leadId: string }) {
  const t = useT();
  const [texto, setTexto] = useState("");
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const criar = useCreateLeadNote();
  // `criar.isPending` NÃO chega a tempo de travar um segundo Enter que dispara
  // ANTES do React re-renderizar com o mutate() em voo — os dois keydown
  // ainda leem `isPending: false` do mesmo snapshot, e a nota duplicava (foi
  // exatamente o que aconteceu: repetição do Enter, sem soltar a tecla a
  // tempo, gravou "Teste" duas vezes). Um `ref` muda na hora, sem esperar
  // render nenhum — é o único jeito de travar dentro do MESMO tick.
  const enviando = useRef(false);

  function autoresize() {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 120)}px`;
  }

  function enviar() {
    const corpo = texto.trim();
    if (!corpo || enviando.current) return;
    enviando.current = true;
    setTexto("");
    requestAnimationFrame(autoresize);
    criar.mutate(
      { leadId, body: corpo },
      {
        onSuccess: () => {
          enviando.current = false;
        },
        onError: () => {
          enviando.current = false;
          setTexto(corpo);
          requestAnimationFrame(autoresize);
        },
      },
    );
  }

  function aoTeclar(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      enviar();
    }
  }

  return (
    <div className="mt-3 shrink-0 border-t border-border pt-3">
      <div className="flex items-end gap-2">
        <Textarea
          ref={taRef}
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            autoresize();
          }}
          onKeyDown={aoTeclar}
          rows={1}
          placeholder={t("Escrever nota…")}
          disabled={criar.isPending}
          className="max-h-28 min-h-9 resize-none px-3 py-2 text-sm"
        />
        <Button
          type="button"
          size="icon"
          className="h-9 w-9 shrink-0"
          onClick={enviar}
          disabled={criar.isPending || !texto.trim()}
          aria-label={t("Enviar")}
        >
          <PaperPlaneTilt size={16} weight="fill" aria-hidden />
        </Button>
      </div>
      <p className="mt-1 text-[11px] text-text-muted">
        {t("Enter para enviar, Shift+Enter para nova linha")}
      </p>
    </div>
  );
}

/**
 * O dossiê do negócio — diálogo centralizado, como o resto do produto
 * (`EditContactDialog`, `NewContactDialog`), não mais painel lateral.
 *
 * ⚠️ POR QUE VIROU MODAL COM ABAS. O painel lateral (`Sheet`) era a ÚNICA tela
 * de detalhe do produto que não seguia o padrão — a ficha do contato
 * (`app/app/contacts/[id]/_client.tsx`) já usa abas num modal. Cabeçalho
 * (dados vivos) e linha do tempo ficam FORA das abas, sempre visíveis — são a
 * pergunta "o que é isto e o que aconteceu", que não depende de qual aba está
 * aberta. O resto (campos, tarefas, agendamentos, conversas) é POR NATUREZA
 * do dado, uma aba cada, porque misturar tudo numa rolagem só foi o que
 * motivou a mudança.
 *
 * Produtos e Anexos entram como aba "em breve": não existe vínculo
 * produto↔negócio nem anexo↔negócio no banco ainda — mostrar a aba vazia é
 * honesto; escondê-la teria feito parecer que a ideia nunca existiu.
 *
 * SALVAR FECHA o diálogo (pedido explícito — a versão anterior deixava aberto
 * de propósito, para quem editasse ver a atividade entrar na timeline; na
 * prática incomodava mais do que ajudava).
 */
export function LeadDossier({
  open,
  onOpenChange,
  lead,
  pipelineId,
  fieldDefs = [],
  stageName,
  stages,
  leads,
  ownerNames,
}: Props) {
  const tagDoIdioma = useTagDeIdioma();
  const t = useT();
  const timeline = useLeadTimeline(open ? lead.id : null, lead.contact_id);
  const owner = resolveLeadOwner(lead, ownerNames);
  const score = lead.score ?? null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        // `h-[85vh]`, não `max-h`: o modal precisa do MESMO tamanho em toda
        // aba — uma aba vazia (Tarefas sem nenhuma) não pode encolher o
        // diálogo, senão a mão de quem clica "Salvar" numa aba alta erra o
        // lugar quando a aba anterior era baixa.
        className="flex h-[85vh] w-full flex-col overflow-hidden p-0 sm:max-w-3xl lg:max-w-5xl"
        // Observáveis pelo mesmo motivo do board: "a assinatura morreu" e
        // "nada aconteceu" têm a mesma aparência, que é silêncio.
        data-realtime-status={timeline.realtimeStatus.toLowerCase()}
        data-refetch-divergencias={timeline.seguranca.divergencias}
      >
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-base leading-6">{lead.title}</DialogTitle>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-1 text-xs">
            <span className="font-medium tabular-nums text-text">
              {formatBRL(lead.value_cents, lead.currency)}
            </span>
            <EtapaDoLead lead={lead} pipelineId={pipelineId} stages={stages} leads={leads} stageName={stageName} />
            <OwnerPicker lead={lead} pipelineId={pipelineId} owner={owner} />
            <ContatoDoLead lead={lead} pipelineId={pipelineId} />
            {score && (
              // O MESMO componente do card — ver o motivo no comentário original.
              <ScoreSlot
                probability={score.probability}
                band={score.band}
                reason={score.reason}
                factors={score.factors.slice(0, 3)}
              />
            )}
          </div>
          {score?.at && (
            <p className="pt-0.5 text-left text-[11px] text-text-muted">
              {t("Probabilidade recalculada automaticamente")} ·{" "}
              {new Date(score.at).toLocaleString(tagDoIdioma)}
            </p>
          )}
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:flex-row lg:overflow-hidden">
          {/* Abas — o que muda com a natureza do dado. */}
          <div className="flex min-w-0 flex-1 flex-col p-6 lg:overflow-hidden">
            <Tabs defaultValue="geral" className="flex min-h-0 flex-1 flex-col">
              <TabsList className="shrink-0">
                <TabsTrigger value="geral" className="gap-1.5">
                  <Eye size={14} aria-hidden />
                  {t("Visão geral")}
                </TabsTrigger>
                <TabsTrigger value="tarefas" className="gap-1.5">
                  <ListChecks size={14} aria-hidden />
                  {t("Tarefas")}
                </TabsTrigger>
                <TabsTrigger value="agendamentos" className="gap-1.5">
                  <CalendarBlank size={14} aria-hidden />
                  {t("Agendamentos")}
                </TabsTrigger>
                <TabsTrigger value="conversas" className="gap-1.5">
                  <ChatCircle size={14} aria-hidden />
                  {t("Conversas")}
                </TabsTrigger>
                <TabsTrigger value="produtos" className="gap-1.5">
                  <Storefront size={14} aria-hidden />
                  {t("Produtos")}
                </TabsTrigger>
                <TabsTrigger value="anexos" className="gap-1.5">
                  <Paperclip size={14} aria-hidden />
                  {t("Anexos")}
                </TabsTrigger>
              </TabsList>

              <TabsContent value="geral" className="min-h-0 flex-1 lg:overflow-y-auto">
                <LeadFieldsForm
                  lead={lead}
                  pipelineId={pipelineId}
                  fieldDefs={fieldDefs}
                  onSaved={() => onOpenChange(false)}
                />
              </TabsContent>

              <TabsContent value="tarefas" className="min-h-0 flex-1 lg:overflow-y-auto">
                <AbaTarefas leadId={lead.id} contactId={lead.contact_id} />
              </TabsContent>

              <TabsContent value="agendamentos" className="min-h-0 flex-1 lg:overflow-y-auto">
                <AbaAgendamentos contactId={lead.contact_id} />
              </TabsContent>

              <TabsContent value="conversas" className="flex min-h-0 flex-1 flex-col">
                <AbaConversas conversationId={lead.conversa?.id ?? null} />
              </TabsContent>

              <TabsContent value="produtos" className="flex min-h-0 flex-1 flex-col">
                <AbaEmBreve
                  texto={t(
                    "Em breve: adicione os produtos deste negócio, com quantidade e preço.",
                  )}
                />
              </TabsContent>

              <TabsContent value="anexos" className="flex min-h-0 flex-1 flex-col">
                <AbaEmBreve texto={t("Em breve: envie arquivos e imagens ligados a este negócio.")} />
              </TabsContent>
            </Tabs>
          </div>

          {/*
            Linha do tempo — fixa, não depende de qual aba está aberta. O
            compositor de nota fica FORA da área que rola: como no print de
            referência, a caixa "Escrever nota…" tem de continuar visível
            mesmo com a timeline cheia, senão quem quer anotar precisa
            primeiro rolar até o fim para achar onde escrever.
          */}
          <div className="flex w-full shrink-0 flex-col border-t border-border p-4 lg:w-72 lg:border-l lg:border-t-0 lg:overflow-hidden">
            <div className="min-h-0 flex-1 lg:overflow-y-auto">
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-text-muted">
                {t("Linha do tempo")}
              </h3>
              <LeadTimeline
                itens={timeline.itens}
                chegouAoVivo={timeline.chegouAoVivo}
                isLoading={timeline.isLoading}
                isError={timeline.isError}
              />
            </div>
            <EscreverNota leadId={lead.id} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
