"use client";
import { useState } from "react";
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
import { contactCreateSchema, type ContactCreate } from "@/lib/schemas/contacts";
import { useCreateContact } from "@/hooks/contacts/useCreateContact";
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
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}

export function NewContactDialog({ open, onOpenChange }: Props) {
  const t = useT();
  const create = useCreateContact();
  const [serverError, setServerError] = useState<string | null>(null);

  const form = useForm<FormShape>({
    defaultValues: {
      name: "",
      email: "",
      phone_number: "",
      cpf: "",
      website: "",
      instagram: "",
      facebook: "",
      notes: "",
      tagsRaw: "",
    },
  });

  const nameValue = useWatch({ control: form.control, name: "name" });
  const isNameEmpty = !nameValue?.trim();

  async function onSubmit(values: FormShape) {
    setServerError(null);
    if (!values.name?.trim()) {
      setServerError(t("Nome é obrigatório."));
      return;
    }
    const tags = (values.tagsRaw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

    const payload: Record<string, unknown> = { source: "manual" };
    payload.name = values.name.trim();
    if (values.email?.trim()) payload.email = values.email.trim();
    if (values.phone_number?.trim()) payload.phone_number = phoneBRLocalToE164(values.phone_number);
    if (values.cpf?.trim()) payload.cpf = normalizeCpfDigits(values.cpf);
    if (values.website?.trim()) payload.website = values.website.trim();
    if (values.instagram?.trim()) payload.instagram = values.instagram.trim();
    if (values.facebook?.trim()) payload.facebook = values.facebook.trim();
    if (values.notes?.trim()) payload.notes = values.notes.trim();
    if (tags.length) payload.tags = tags;

    const parsed = contactCreateSchema.safeParse(payload);
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
      await create.mutateAsync(parsed.data as ContactCreate);
      toast.success(t("Contato criado"));
      form.reset();
      onOpenChange(false);
    } catch {
      // error toast already handled by hook
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col overflow-hidden p-0 sm:max-w-xl">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-5">
          <DialogTitle>{t("Novo contato")}</DialogTitle>
          <DialogDescription>
            {t("Preencha pelo menos um identificador (email ou telefone).")}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-1 flex-col overflow-hidden">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="space-y-4">
              <SectionHeading>{t("Informações básicas")}</SectionHeading>
              <FieldShell id="name" label={t("Nome")} icon={UserCircle} required>
                <Input id="name" required className="pl-9 placeholder:text-text-subtle" {...form.register("name")} />
              </FieldShell>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell id="email" label="Email" icon={EnvelopeSimple}>
                  <Input id="email" type="email" className="pl-9 placeholder:text-text-subtle" {...form.register("email")} />
                </FieldShell>
                <FieldShell id="phone_number" label={t("Telefone")} icon={Phone}>
                  <Input
                    id="phone_number"
                    type="tel"
                    inputMode="numeric"
                    placeholder="(11) 99999-8888"
                    className="pl-9 placeholder:text-text-subtle"
                    {...form.register("phone_number")}
                    onChange={(e) => {
                      e.target.value = maskPhoneBR(e.target.value);
                      form.setValue("phone_number", e.target.value);
                    }}
                  />
                </FieldShell>
              </div>
              <FieldShell id="cpf" label={t("CPF (opcional)")} icon={IdentificationCard}>
                <Input
                  id="cpf"
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  className="pl-9 placeholder:text-text-subtle"
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
              <FieldShell id="website" label={t("Site")} icon={Globe}>
                <Input id="website" placeholder="https://exemplo.com.br" className="pl-9 placeholder:text-text-subtle" {...form.register("website")} />
              </FieldShell>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <FieldShell id="instagram" label="Instagram" icon={InstagramLogo}>
                  <Input id="instagram" placeholder="@exemplo" className="pl-9 placeholder:text-text-subtle" {...form.register("instagram")} />
                </FieldShell>
                <FieldShell id="facebook" label="Facebook" icon={FacebookLogo}>
                  <Input id="facebook" placeholder="facebook.com/exemplo" className="pl-9 placeholder:text-text-subtle" {...form.register("facebook")} />
                </FieldShell>
              </div>
            </div>

            <div className="space-y-4">
              <SectionHeading>{t("Organização")}</SectionHeading>
              <FieldShell id="tagsRaw" label={t("Tags (separadas por vírgula)")} icon={Tag}>
                <Input id="tagsRaw" placeholder="vip, recompra" className="pl-9 placeholder:text-text-subtle" {...form.register("tagsRaw")} />
              </FieldShell>
              <FieldShell id="notes" label={t("Observações")} icon={Note} multiline>
                <Textarea id="notes" rows={3} className="pl-9 placeholder:text-text-subtle" {...form.register("notes")} />
              </FieldShell>
            </div>

            {serverError && <p className="text-sm text-error-fg">{serverError}</p>}
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
            <Button type="submit" disabled={create.isPending || isNameEmpty}>
              <Check size={16} weight="bold" aria-hidden />
              {create.isPending ? t("Criando…") : t("Criar contato")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
