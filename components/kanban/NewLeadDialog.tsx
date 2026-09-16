"use client";

import { useT } from "@/hooks/i18n/useT";
import { useEffect, useMemo } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FieldShell, SectionHeading } from "@/components/ui/field-shell";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FileText, Note, Kanban, Money, CalendarBlank, Tag, Check } from "@/lib/ui/icons";
import { useCreateLead } from "@/hooks/kanban/useCreateLead";
import type { Stage } from "@/lib/kanban/types";
import type { Lead } from "@/lib/types/leads";
import { createLeadSchema, type CreateLeadInput } from "@/lib/schemas/leads";
import { maskMoneyBRL, moneyBRLMaskedToCents } from "@/lib/money";

interface FormShape {
  title: string;
  description: string;
  stage_id: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  pipelineId: string;
  stages: Stage[];
  /** Vincula o lead criado a este contato de origem (ex.: painel do Inbox). */
  contactId?: string | null;
  /** Depois do INSERT — o inbox relê o resumo para o lead novo aparecer no formulário. */
  onCreated?: (lead: Lead) => void;
}

function defaultStageId(stages: Stage[]): string {
  const open = stages.find((s) => !s.is_won && !s.is_lost && !s.is_archived);
  return open?.id ?? stages[0]?.id ?? "";
}

export function NewLeadDialog({
  open,
  onOpenChange,
  pipelineId,
  stages,
  contactId,
  onCreated,
}: Props) {
  const t = useT();
  const create = useCreateLead(pipelineId);
  const initialStage = useMemo(() => defaultStageId(stages), [stages]);

  const form = useForm<FormShape>({
    defaultValues: {
      title: "",
      description: "",
      stage_id: initialStage,
      valueReais: "",
      tagsRaw: "",
      expected_close_date: "",
    },
  });

  // Reset stage_id default if stages change while dialog mounted.
  useEffect(() => {
    if (!form.getValues("stage_id") && initialStage) {
      form.setValue("stage_id", initialStage);
    }
  }, [initialStage, form]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // A máscara garante que só dígito chega aqui — não há "valor inválido"
    // possível de digitar, então não há o que validar antes de converter.
    const valueCents = values.valueReais.trim() ? moneyBRLMaskedToCents(values.valueReais) : null;

    const payload: Record<string, unknown> = {
      pipeline_id: pipelineId,
      stage_id: values.stage_id,
      title: values.title.trim(),
      currency: "BRL",
      source: "manual",
      tags,
    };
    if (contactId) payload.contact_id = contactId;
    if (values.description.trim()) payload.description = values.description.trim();
    if (valueCents !== null) payload.value_cents = valueCents;
    if (values.expected_close_date) payload.expected_close_date = values.expected_close_date;

    const parsed = createLeadSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? "Dados inválidos");
      return;
    }

    try {
      const created = await create.mutateAsync(parsed.data as CreateLeadInput);
      toast.success(t("Lead criado"));
      onCreated?.(created.data);
      form.reset({
        title: "",
        description: "",
        stage_id: initialStage,
        valueReais: "",
        tagsRaw: "",
        expected_close_date: "",
      });
      onOpenChange(false);
    } catch {
      // toast already shown
    }
  }

  const stageId = form.watch("stage_id");
  const expectedCloseDate = useWatch({ control: form.control, name: "expected_close_date" });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>{t("Novo Lead")}</DialogTitle>
          <DialogDescription>
            {t("Crie um lead manualmente neste pipeline.")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <SectionHeading>{t("Informações básicas")}</SectionHeading>
              <FieldShell id="title" label={t("Título")} icon={FileText} required>
                <Input
                  id="title"
                  placeholder="Ex: Pedido Maria — combo presente"
                  className="pl-9 placeholder:text-text-subtle"
                  {...form.register("title", { required: true, minLength: 2 })}
                />
              </FieldShell>
              <FieldShell id="description" label={t("Descrição")} icon={Note} multiline>
                <Textarea
                  id="description"
                  rows={3}
                  placeholder={t("Contexto, observações, links…")}
                  className="pl-9 placeholder:text-text-subtle"
                  {...form.register("description")}
                />
              </FieldShell>
            </div>

            <div className="space-y-4">
              <SectionHeading>{t("Funil")}</SectionHeading>
              <FieldShell id="stage_id" label={t("Etapa")} icon={Kanban}>
                <Select value={stageId} onValueChange={(v) => form.setValue("stage_id", v)}>
                  <SelectTrigger id="stage_id" className="pl-9">
                    <SelectValue placeholder={t("Selecione a etapa")} />
                  </SelectTrigger>
                  <SelectContent>
                    {stages
                      .filter((s) => !s.is_archived)
                      .map((s) => (
                        <SelectItem key={s.id} value={s.id}>
                          {s.name}
                        </SelectItem>
                      ))}
                  </SelectContent>
                </Select>
              </FieldShell>
            </div>

            <div className="space-y-4">
              <SectionHeading>{t("Detalhes")}</SectionHeading>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell id="valueReais" label="Valor (R$)" icon={Money}>
                  <Input
                    id="valueReais"
                    inputMode="numeric"
                    placeholder="0,00"
                    className="pl-9 placeholder:text-text-subtle"
                    {...form.register("valueReais")}
                    onChange={(e) => {
                      e.target.value = maskMoneyBRL(e.target.value);
                      form.setValue("valueReais", e.target.value);
                    }}
                  />
                </FieldShell>
                <FieldShell
                  id="expected_close_date"
                  label={t("Fechamento previsto")}
                  icon={CalendarBlank}
                >
                  <DatePickerField
                    id="expected_close_date"
                    className="pl-9"
                    value={expectedCloseDate}
                    onChange={(v) => form.setValue("expected_close_date", v)}
                  />
                </FieldShell>
              </div>
            </div>

            <div className="space-y-4">
              <SectionHeading>{t("Organização")}</SectionHeading>
              <FieldShell id="tagsRaw" label={t("Tags (separadas por vírgula)")} icon={Tag}>
                <Input
                  id="tagsRaw"
                  placeholder="vip, recompra"
                  className="pl-9 placeholder:text-text-subtle"
                  {...form.register("tagsRaw")}
                />
              </FieldShell>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-surface-elevated px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={create.isPending || !stageId}>
              <Check size={16} weight="bold" aria-hidden />
              {create.isPending ? t("Criando…") : t("Criar lead")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
