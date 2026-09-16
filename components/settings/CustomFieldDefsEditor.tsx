"use client";

import { useT } from "@/hooks/i18n/useT";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";
import { Plus, Trash } from "@/lib/ui/icons";

/**
 * O editor de DEFINIÇÕES de campo personalizado — chave, rótulo, tipo, opções.
 *
 * Extraído de `app/app/settings/tenant/pipelines/_client.tsx` (`PipelineEditor`)
 * para servir dois donos: os campos do NEGÓCIO (por funil, continuam lá) e os
 * campos do CONTATO (`app/app/settings/tenant/contact-fields`, que passaram a
 * ter sua própria fonte — `organizations.settings.contact_fields` — em vez de
 * pegar carona no funil padrão). A UI de definir um campo é a MESMA nos dois
 * casos; o que muda é onde a lista é lida e salva, e isso fica de fora daqui.
 *
 * Não confundir com `components/contacts/CustomFieldsEditor.tsx`: aquele
 * desenha o INPUT de cada campo pra preencher o VALOR num negócio/contato;
 * este daqui desenha o formulário que DEFINE quais campos existem.
 */

/**
 * Os tipos de campo que esta tela oferece — DERIVADOS do schema, nunca
 * reescritos à mão.
 *
 * Quando a lista era digitada aqui, ela encolheu sem ninguém ver: `multiselect`
 * existia em `customFieldSchema`, era gravado pela API e aparecia no dossiê
 * (`components/contacts/CustomFieldsEditor.tsx`), mas faltava nesta lista. O
 * efeito para quem abria a tela era um campo que parecia corrompido — o
 * `<Select>` recebia `value="multiselect"`, nenhum `SelectItem` casava, e o
 * seletor ficava EM BRANCO. Pior: as opções do campo só apareciam para
 * `select`, então um multiselect ficava sem como ser editado, e a saída óbvia
 * (escolher um tipo para "consertar" o branco) transformava a escolha múltipla
 * em escolha única.
 *
 * Derivar do schema faz a divergência deixar de ser possível: tipo novo lá
 * nasce oferecido aqui.
 */
export const TIPOS_DE_CAMPO = customFieldSchema.shape.type.options;

/** Tipos cujo valor sai de uma lista fechada — são os que mostram o campo de opções. */
export function tipoTemOpcoes(tipo: CustomFieldDef["type"]): boolean {
  return tipo === "select" || tipo === "multiselect";
}

export function CustomFieldDefsEditor({
  fields,
  onChange,
  label,
  helperText,
}: {
  fields: CustomFieldDef[];
  onChange: (next: CustomFieldDef[]) => void;
  label: string;
  helperText?: string;
}) {
  const t = useT();
  return (
    <div className="space-y-2">
      <Label className="text-xs">{label}</Label>
      {helperText && <p className="text-xs text-muted-foreground">{helperText}</p>}
      {fields.map((f, i) => (
        <div
          key={`${f.key}-${i}`}
          className="grid gap-2 rounded-md border border-border p-2 md:grid-cols-[1fr_1fr_8rem_auto]"
        >
          <Input
            aria-label={`${t("Chave do campo")} ${i + 1}`}
            placeholder={t("chave (endereco)")}
            value={f.key}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...f, key: e.target.value };
              onChange(next);
            }}
          />
          <Input
            aria-label={`${t("Rótulo do campo")} ${i + 1}`}
            placeholder={t("Rótulo (Endereço)")}
            value={f.label}
            onChange={(e) => {
              const next = [...fields];
              next[i] = { ...f, label: e.target.value };
              onChange(next);
            }}
          />
          <Select
            value={f.type}
            onValueChange={(type) => {
              const next = [...fields];
              next[i] = { ...f, type: type as CustomFieldDef["type"] };
              onChange(next);
            }}
          >
            <SelectTrigger aria-label={`${t("Tipo do campo")} ${i + 1}`}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TIPOS_DE_CAMPO.map((tipo) => (
                <SelectItem key={tipo} value={tipo}>
                  {tipo}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            aria-label={`${t("Remover campo")} ${f.label || i + 1}`}
            onClick={() => onChange(fields.filter((_, j) => j !== i))}
          >
            <Trash size={14} aria-hidden />
          </Button>
          {tipoTemOpcoes(f.type) && (
            <Input
              className="md:col-span-3"
              aria-label={`${t("Opções do campo")} ${i + 1}`}
              placeholder={t("Opções, separadas por vírgula")}
              value={(f.options ?? []).map((o) => o.label).join(", ")}
              onChange={(e) => {
                const options = e.target.value
                  .split(",")
                  .map((s) => s.trim())
                  .filter(Boolean)
                  .map((label) => ({ value: label, label }));
                const next = [...fields];
                next[i] = { ...f, options };
                onChange(next);
              }}
            />
          )}
        </div>
      ))}
      {fields.length < 50 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([...fields, { key: `campo_${fields.length + 1}`, label: t("Novo campo"), type: "text" }])
          }
        >
          <Plus size={14} aria-hidden className="mr-1" /> {t("Adicionar campo")}
        </Button>
      )}
    </div>
  );
}
