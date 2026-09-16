"use client";
import { useEffect, useState } from "react";
import { useForm, useWatch } from "react-hook-form";
import { toast } from "sonner";
import { useT } from "@/hooks/i18n/useT";
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
import { FieldShell, SectionHeading } from "@/components/ui/field-shell";
import {
  UserCircle,
  EnvelopeSimple,
  Phone,
  IdentificationCard,
  Globe,
  InstagramLogo,
  FacebookLogo,
  Tag,
  Note,
  Check,
} from "@/lib/ui/icons";
import { contactPatchSchema, type ContactPatch } from "@/lib/schemas/contacts";
import { useUpdateContact } from "@/hooks/contacts/useUpdateContact";
import { CustomFieldsEditor, type CustomFieldDef } from "@/components/contacts/CustomFieldsEditor";
import type { Contact } from "@/lib/types/contacts";
import { maskPhoneBR, phoneBRLocalToE164 } from "@/lib/channels/phone-variants";
import { maskCpf, normalizeCpfDigits } from "@/lib/contacts/cpf-format";

interface FormShape {
  name?: string;
  email?: string;
  phone_number?: string;
  cpf?: string;
  website?: string;
  instagram?: string;
  facebook?: string;
  notes?: string;
  tagsRaw?: string;
  custom_fields?: Record<string, unknown>;
}

interface Props {
  contact: Contact;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  /** Definições vindas de `organizations.settings.contact_fields`. Vazio = a seção some. */
  customFieldDefs?: CustomFieldDef[];
}

export function EditContactDialog({ contact, open, onOpenChange, customFieldDefs = [] }: Props) {
  const t = useT();
  const update = useUpdateContact(contact.id);
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormShape>({
    defaultValues: {
      name: contact.name ?? "",
      email: contact.email ?? "",
      phone_number: contact.phone_number ? maskPhoneBR(contact.phone_number) : "",
      cpf: "",
      website: contact.website ?? "",
      instagram: contact.instagram ?? "",
      facebook: contact.facebook ?? "",
      notes: contact.notes ?? "",
      tagsRaw: contact.tags.join(", "),
      custom_fields: contact.custom_fields ?? {},
    },
  });

  const customFields = useWatch({ control: form.control, name: "custom_fields" });

  useEffect(() => {
    if (open) {
      form.reset({
        name: contact.name ?? "",
        email: contact.email ?? "",
        phone_number: contact.phone_number ? maskPhoneBR(contact.phone_number) : "",
        cpf: "",
        website: contact.website ?? "",
        instagram: contact.instagram ?? "",
        facebook: contact.facebook ?? "",
        notes: contact.notes ?? "",
        tagsRaw: contact.tags.join(", "),
        custom_fields: contact.custom_fields ?? {},
      });
    }
  }, [open, contact, form]);

  async function onSubmit(values: FormShape) {
    setServerError(null);
    const tags = (values.tagsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = {};
    if (values.name?.trim()) payload.name = values.name.trim();
    if (values.email?.trim()) payload.email = values.email.trim();
    if (values.phone_number?.trim()) payload.phone_number = phoneBRLocalToE164(values.phone_number);
    // CPF em branco = manter o que já está gravado — não há como pré-preencher
    // o valor atual (só o hash é lido de volta), então "vazio" nunca pode
    // significar "apagar" aqui.
    if (values.cpf?.trim()) payload.cpf = normalizeCpfDigits(values.cpf);
    if (values.website?.trim()) payload.website = values.website.trim();
    if (values.instagram?.trim()) payload.instagram = values.instagram.trim();
    if (values.facebook?.trim()) payload.facebook = values.facebook.trim();
    if (values.notes?.trim()) payload.notes = values.notes.trim();
    payload.tags = tags;
    // Sempre no payload, mesmo vazio: o PATCH SUBSTITUI, e é assim que apagar um
    // campo pela tela chega ao banco.
    payload.custom_fields = values.custom_fields ?? {};

    const parsed = contactPatchSchema.safeParse(payload);
    if (!parsed.success) {
      const first = parsed.error.issues[0];
      const friendly =
        first?.path[0] === "phone_number"
          ? t("Telefone inválido. Confira o DDD e o número.")
          : (first?.message ?? t("Dados inválidos"));
      setServerError(friendly);
      return;
    }
    try {
      await update.mutateAsync(parsed.data as ContactPatch);
      toast.success(t("Contato atualizado"));
      onOpenChange(false);
    } catch {
      // hook handles toast
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>{t("Editar contato")}</DialogTitle>
          <DialogDescription>{t("Atualize os dados deste contato.")}</DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <SectionHeading>{t("Informações básicas")}</SectionHeading>
              <FieldShell id="ec-name" label={t("Nome")} icon={UserCircle}>
                <Input id="ec-name" className="pl-9" {...form.register("name")} />
              </FieldShell>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell id="ec-email" label="Email" icon={EnvelopeSimple}>
                  <Input id="ec-email" type="email" className="pl-9" {...form.register("email")} />
                </FieldShell>
                <FieldShell id="ec-phone" label={t("Telefone")} icon={Phone}>
                  <Input
                    id="ec-phone"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(11) 99999-8888"
                    className="pl-9"
                    {...form.register("phone_number")}
                    onChange={(e) => {
                      e.target.value = maskPhoneBR(e.target.value);
                      form.setValue("phone_number", e.target.value);
                    }}
                  />
                </FieldShell>
              </div>
              <FieldShell
                id="ec-cpf"
                label={t("CPF (opcional)")}
                icon={IdentificationCard}
                hint={
                  contact.cpf_hash
                    ? t("Já tem CPF cadastrado — deixe em branco pra manter, ou digite um novo pra substituir.")
                    : undefined
                }
              >
                <Input
                  id="ec-cpf"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="pl-9"
                  {...form.register("cpf")}
                  onChange={(e) => {
                    e.target.value = maskCpf(e.target.value);
                    form.setValue("cpf", e.target.value);
                  }}
                />
              </FieldShell>
            </div>

            <div className="space-y-4">
              <SectionHeading>{t("Presença online")}</SectionHeading>
              <FieldShell id="ec-website" label={t("Site")} icon={Globe}>
                <Input id="ec-website" placeholder="https://exemplo.com.br" className="pl-9" {...form.register("website")} />
              </FieldShell>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell id="ec-instagram" label="Instagram" icon={InstagramLogo}>
                  <Input id="ec-instagram" placeholder="@exemplo" className="pl-9" {...form.register("instagram")} />
                </FieldShell>
                <FieldShell id="ec-facebook" label="Facebook" icon={FacebookLogo}>
                  <Input id="ec-facebook" placeholder="facebook.com/exemplo" className="pl-9" {...form.register("facebook")} />
                </FieldShell>
              </div>
            </div>

            <div className="space-y-4">
              <SectionHeading>{t("Organização")}</SectionHeading>
              <FieldShell id="ec-tags" label="Tags" icon={Tag}>
                <Input id="ec-tags" className="pl-9" {...form.register("tagsRaw")} />
              </FieldShell>
              <FieldShell id="ec-notes" label={t("Observações")} icon={Note} multiline>
                <Textarea id="ec-notes" rows={3} className="pl-9" {...form.register("notes")} />
              </FieldShell>
            </div>

            {customFieldDefs.length > 0 && (
              <div className="space-y-4">
                <SectionHeading>{t("Campos personalizados")}</SectionHeading>
                <div className="space-y-3 rounded-md border border-border p-3">
                  <p className="text-xs text-text-subtle">
                    {t("Campos definidos em Configurações › Campos do contato.")}
                  </p>
                  <CustomFieldsEditor
                    fields={customFieldDefs}
                    mode="contact"
                    value={customFields ?? {}}
                    onChange={(next) => form.setValue("custom_fields", next, { shouldDirty: true })}
                  />
                </div>
              </div>
            )}

            {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-surface-elevated px-6 py-4">
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={update.isPending}
            >
              {t("Cancelar")}
            </Button>
            <Button type="submit" disabled={update.isPending}>
              <Check size={16} weight="bold" aria-hidden />
              {update.isPending ? t("Salvando…") : t("Salvar")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
