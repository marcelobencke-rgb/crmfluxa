"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FieldShell, SectionHeading } from "@/components/ui/field-shell";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePickerField } from "@/components/ui/time-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/hooks/i18n/useT";
import type {
  NovaTarefa,
  PrioridadeDaTarefa,
  SituacaoDaTarefa,
  Tarefa,
} from "@/lib/tarefas/tipos";
import { CalendarBlank, FileText, Flag, Gauge, LinkSimple, ListChecks, Note } from "@/lib/ui/icons";

import { SeletorDeLead } from "./SeletorDeLead";

interface Props {
  aberto: boolean;
  aoMudarAbertura: (aberto: boolean) => void;
  /** `null` = criar. */
  tarefa?: Tarefa | null;
  /** `YYYY-MM-DD` vindo do clique numa célula do calendário. */
  prazoSugerido?: string;
  /** Vinda do "+" de uma coluna do Kanban — a tarefa nasce naquela coluna. */
  situacaoSugerida?: SituacaoDaTarefa;
  aoSalvar: (entrada: NovaTarefa) => Promise<unknown>;
  leadId?: string | null;
  contactId?: string | null;
}

/**
 * ISO → os dois campos que a pessoa preenche, no fuso DELA.
 *
 * ⚠️ `toISOString().slice(0,10)` para a data era o do original, e ele lê o dia
 * em UTC: 31/12 às 21h em Brasília voltava como 01/01. A pessoa abriria para
 * editar e veria outro dia.
 */
function separaPrazo(iso: string | null | undefined): { dia: string; hora: string } {
  if (!iso) return { dia: "", hora: "09:00" };
  const d = new Date(iso);
  const dois = (n: number) => String(n).padStart(2, "0");
  return {
    dia: `${d.getFullYear()}-${dois(d.getMonth() + 1)}-${dois(d.getDate())}`,
    hora: `${dois(d.getHours())}:${dois(d.getMinutes())}`,
  };
}

export function FormularioDeTarefa({
  aberto,
  aoMudarAbertura,
  tarefa,
  prazoSugerido,
  situacaoSugerida,
  aoSalvar,
  leadId,
  contactId,
}: Props) {
  const t = useT();
  const editando = Boolean(tarefa);

  // ⚠️ O ESTADO NASCE DAS PROPS, e não de um `useEffect` que dá setState no
  // corpo — que era o do original e o que o `react-hooks/set-state-in-effect`
  // acusa. Quem garante que o formulário reflete a tarefa certa é a `key` que o
  // pai passa: ela muda a cada abertura, então o componente REMONTA e o
  // inicializador roda de novo. Efeito para sincronizar props com estado é
  // render em cascata e uma janela em que a tela mostra a tarefa anterior.
  const prazo = separaPrazo(tarefa?.due_date);
  const [titulo, setTitulo] = useState(tarefa?.title ?? "");
  const [descricao, setDescricao] = useState(tarefa?.description ?? "");
  const [dia, setDia] = useState(tarefa?.due_date ? prazo.dia : (prazoSugerido ?? ""));
  const [hora, setHora] = useState(tarefa?.due_date ? prazo.hora : "09:00");
  const [prioridade, setPrioridade] = useState<PrioridadeDaTarefa>(tarefa?.priority ?? "medium");
  const [situacao, setSituacao] = useState<SituacaoDaTarefa>(
    tarefa?.status ?? situacaoSugerida ?? "pending",
  );
  // A mesma regra do resto do formulário: nasce da prop uma vez (tarefa
  // existente, ou o `leadId` de quem abriu a partir do dossiê de um negócio),
  // e dali em diante é a PESSOA quem decide — pelo `SeletorDeLead` abaixo.
  const [leadIdEscolhido, setLeadIdEscolhido] = useState<string | null>(
    tarefa?.lead_id ?? leadId ?? null,
  );
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (!titulo.trim()) {
      setErro(t("Escreva um título para a tarefa."));
      return;
    }
    // Prazo é OPCIONAL — a coluna é nullable de propósito (migration 0210).
    // Sem dia não há hora que valha, e uma hora solta viraria "hoje às 9h" sem
    // ninguém ter pedido.
    const prazo = dia ? new Date(`${dia}T${hora || "00:00"}:00`).toISOString() : null;

    setSalvando(true);
    setErro(null);
    try {
      await aoSalvar({
        title: titulo.trim(),
        description: descricao.trim() || null,
        due_date: prazo,
        priority: prioridade,
        status: situacao,
        lead_id: leadIdEscolhido,
        contact_id: tarefa?.contact_id ?? contactId ?? null,
      });
      aoMudarAbertura(false);
    } catch (falha) {
      // A mensagem do servidor quando ela existe: ela nomeia o campo recusado.
      setErro(falha instanceof Error ? falha.message : t("Não foi possível salvar a tarefa."));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Dialog open={aberto} onOpenChange={aoMudarAbertura}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ListChecks size={18} className="text-text-subtle" aria-hidden />
            {editando ? t("Editar tarefa") : t("Nova tarefa")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={enviar} className="space-y-4">
          <SectionHeading>{t("O que e quando")}</SectionHeading>

          <FieldShell id="tarefa-titulo" label={t("O que precisa ser feito")} icon={FileText} required>
            <Input
              id="tarefa-titulo"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
              placeholder={t("Ex.: ligar de volta para fechar a proposta")}
              className="pl-9"
              autoFocus
            />
          </FieldShell>

          <FieldShell id="tarefa-descricao" label={t("Detalhes")} icon={Note} multiline>
            <Textarea
              id="tarefa-descricao"
              rows={2}
              className="resize-none pl-9"
              value={descricao}
              onChange={(e) => setDescricao(e.target.value)}
              placeholder={t("O que você vai querer lembrar quando chegar a hora")}
            />
          </FieldShell>

          <div className="grid grid-cols-2 gap-3">
            <FieldShell id="tarefa-dia" label={t("Prazo")} icon={CalendarBlank}>
              <DatePickerField id="tarefa-dia" value={dia} onChange={setDia} className="pl-9" />
            </FieldShell>
            <div className="space-y-1.5">
              {/* Sem `FieldShell`/ícone extra aqui de propósito: o
                  `TimePickerField` já desenha o próprio relógio dentro do
                  botão — empilhar outro por cima duplicaria o ícone em vez de
                  humanizar o campo. */}
              <Label htmlFor="tarefa-hora">{t("Horário")}</Label>
              <TimePickerField id="tarefa-hora" value={hora} disabled={!dia} onChange={setHora} />
            </div>
          </div>

          <SectionHeading>{t("Prioridade e organização")}</SectionHeading>

          <div className="grid grid-cols-2 gap-3">
            <FieldShell id="tarefa-prioridade" label={t("Prioridade")} icon={Flag}>
              <Select
                value={prioridade}
                onValueChange={(v) => setPrioridade(v as PrioridadeDaTarefa)}
              >
                <SelectTrigger id="tarefa-prioridade" className="pl-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">{t("Baixa")}</SelectItem>
                  <SelectItem value="medium">{t("Média")}</SelectItem>
                  <SelectItem value="high">{t("Alta")}</SelectItem>
                  <SelectItem value="urgent">{t("Urgente")}</SelectItem>
                </SelectContent>
              </Select>
            </FieldShell>

            <FieldShell id="tarefa-situacao" label={t("Situação")} icon={Gauge}>
              <Select value={situacao} onValueChange={(v) => setSituacao(v as SituacaoDaTarefa)}>
                <SelectTrigger id="tarefa-situacao" className="pl-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">{t("Pendente")}</SelectItem>
                  <SelectItem value="in_progress">{t("Em andamento")}</SelectItem>
                  <SelectItem value="done">{t("Concluída")}</SelectItem>
                  <SelectItem value="cancelled">{t("Cancelada")}</SelectItem>
                </SelectContent>
              </Select>
            </FieldShell>
          </div>

          <FieldShell
            id="tarefa-lead"
            label={t("Negócio vinculado")}
            icon={LinkSimple}
            hint={t("A tarefa aparece na linha do tempo deste negócio.")}
          >
            <SeletorDeLead id="tarefa-lead" leadId={leadIdEscolhido} onChange={setLeadIdEscolhido} className="pl-9" />
          </FieldShell>

          {erro ? (
            <p role="alert" className="rounded-md bg-error-bg p-2 text-xs font-medium text-error-fg">
              {erro}
            </p>
          ) : null}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              disabled={salvando}
              onClick={() => aoMudarAbertura(false)}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
