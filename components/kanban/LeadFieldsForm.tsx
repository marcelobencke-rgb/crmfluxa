"use client";

import { useT } from "@/hooks/i18n/useT";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { FieldShell, SectionHeading } from "@/components/ui/field-shell";
import { useEditLead } from "@/hooks/kanban/useUpdateLead";
import type { Lead } from "@/lib/types/leads";
import { updateLeadSchema, type UpdateLeadInput } from "@/lib/schemas/leads";
import { maskMoneyBRL, moneyBRLMaskedToCents, centsToMoneyBRLMasked } from "@/lib/money";
import { CustomFieldsEditor, type CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import { CalendarBlank, FileText, Money, Note, Tag } from "@/lib/ui/icons";

interface FormShape {
  title: string;
  description: string;
  valueReais: string;
  tagsRaw: string;
  expected_close_date: string;
}

interface Props {
  lead: Lead;
  pipelineId: string;
  fieldDefs?: CustomFieldDef[];
  /** Quando o salvamento dá certo. Quem chama decide o que fazer — o dossiê fecha o diálogo aqui. */
  onSaved?: () => void;
  /** O dossiê não tem "cancelar"; o diálogo tem. */
  onCancel?: () => void;
}

/**
 * Os campos do lead — extraídos do `EditLeadDialog` para o dossiê usar os
 * MESMOS, em vez de uma cópia que diverge no mês.
 *
 * `FieldShell`/`SectionHeading`/`DatePickerField` são os mesmos de
 * `NewLeadDialog.tsx` e `EditContactDialog.tsx` — mesmos ícones, mesmo
 * calendário próprio no lugar do `<input type="date">` nativo (o do
 * navegador saía fora do estilo do produto, visto num print).
 *
 * `onSaved` é quem decide o que acontece depois de salvar — o dossiê usa para
 * fechar o diálogo (pedido explícito; a versão anterior deixava aberto de
 * propósito, para mostrar a atividade entrando na timeline, mas incomodava
 * mais do que ajudava na prática).
 */
export function LeadFieldsForm({ lead, pipelineId, fieldDefs = [], onSaved, onCancel }: Props) {
  const t = useT();
  const edit = useEditLead(pipelineId);
  const [customFields, setCustomFields] = useState<Record<string, unknown>>(lead.custom_fields ?? {});

  const form = useForm<FormShape>({
    defaultValues: {
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsToMoneyBRLMasked(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
    },
  });
  const expectedCloseDate = useWatch({ control: form.control, name: "expected_close_date" });

  useEffect(() => {
    form.reset({
      title: lead.title,
      description: lead.description ?? "",
      valueReais: centsToMoneyBRLMasked(lead.value_cents),
      tagsRaw: (lead.tags ?? []).join(", "),
      expected_close_date: lead.expected_close_date ?? "",
    });
    setCustomFields(lead.custom_fields ?? {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lead.id]);

  async function onSubmit(values: FormShape) {
    const tags = values.tagsRaw
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    // A máscara garante que só dígito chega aqui — não há "valor inválido"
    // possível de digitar.
    const valueCents = values.valueReais.trim() ? moneyBRLMaskedToCents(values.valueReais) : null;

    const patch: Record<string, unknown> = {
      title: values.title.trim(),
      description: values.description.trim() ? values.description.trim() : null,
      value_cents: valueCents,
      tags,
      expected_close_date: values.expected_close_date || null,
      ...(fieldDefs.length > 0 ? { custom_fields: customFields } : {}),
    };

    const parsed = updateLeadSchema.safeParse(patch);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      toast.error(first?.message ?? t("Dados inválidos"));
      return;
    }

    try {
      await edit.mutateAsync({
        leadId: lead.id,
        patch: parsed.data as UpdateLeadInput,
      });
      toast.success(t("Lead atualizado"));
      onSaved?.();
    } catch {
      // toast already shown
    }
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-4">
        <SectionHeading>{t("Dados do negócio")}</SectionHeading>
        <FieldShell id="title" label={t("Título")} icon={FileText} required>
          <Input id="title" className="pl-9" {...form.register("title", { required: true, minLength: 2 })} />
        </FieldShell>

        <FieldShell id="description" label={t("Descrição")} icon={Note} multiline>
          <Textarea id="description" rows={3} className="pl-9" {...form.register("description")} />
        </FieldShell>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <FieldShell id="valueReais" label={t("Valor (R$)")} icon={Money}>
            <Input
              id="valueReais"
              inputMode="numeric"
              placeholder="0,00"
              className="pl-9"
              {...form.register("valueReais")}
              onChange={(e) => {
                e.target.value = maskMoneyBRL(e.target.value);
                form.setValue("valueReais", e.target.value);
              }}
            />
          </FieldShell>
          <FieldShell id="expected_close_date" label={t("Fechamento previsto")} icon={CalendarBlank}>
            <DatePickerField
              id="expected_close_date"
              className="pl-9"
              value={expectedCloseDate}
              onChange={(v) => form.setValue("expected_close_date", v)}
            />
          </FieldShell>
        </div>

        <FieldShell id="tagsRaw" label={t("Tags (separadas por vírgula)")} icon={Tag}>
          <Input id="tagsRaw" placeholder="vip, recompra" className="pl-9" {...form.register("tagsRaw")} />
        </FieldShell>
      </div>

      {fieldDefs.length > 0 && (
        <div className="space-y-4 border-t border-border pt-4">
          <SectionHeading>{t("Campos do funil")}</SectionHeading>
          <CustomFieldsEditor
            fields={fieldDefs}
            value={customFields}
            onChange={setCustomFields}
            mode="lead"
          />
        </div>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel} disabled={edit.isPending}>
            {t("Cancelar")}
          </Button>
        )}
        <Button type="submit" disabled={edit.isPending}>
          {edit.isPending ? t("Salvando…") : t("Salvar")}
        </Button>
      </div>
    </form>
  );
}
