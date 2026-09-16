"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useT } from "@/hooks/i18n/useT";
import { updateContactFieldsConfig } from "@/app/actions/settings/updateContactFieldsConfig";
import { customFieldSchema, type CustomFieldDef } from "@/lib/schemas/settings";
import { CustomFieldDefsEditor } from "@/components/settings/CustomFieldDefsEditor";

export function ContactFieldsClient({ camposIniciais }: { camposIniciais: CustomFieldDef[] }) {
  const t = useT();
  const [fields, setFields] = useState<CustomFieldDef[]>(camposIniciais);
  const [isPending, startTransition] = useTransition();

  function handleSave() {
    const ok: CustomFieldDef[] = [];
    for (const f of fields) {
      const parsed = customFieldSchema.safeParse(f);
      if (!parsed.success) {
        toast.error(parsed.error.issues[0]?.message ?? t("Campo inválido."));
        return;
      }
      ok.push(parsed.data);
    }
    startTransition(async () => {
      const r = await updateContactFieldsConfig({ fields: ok });
      if (r.ok) toast.success(t("Campos do contato atualizados."));
      else toast.error(`${t("Erro:")} ${r.error}`);
    });
  }

  return (
    <Card className="space-y-6 p-6">
      <CustomFieldDefsEditor
        fields={fields}
        onChange={setFields}
        label={t("Campos personalizados")}
        helperText={t(
          "Aparecem na ficha de qualquer contato — independente de qual funil o negócio dele está.",
        )}
      />
      <div className="flex sm:justify-end">
        <Button onClick={handleSave} disabled={isPending} className="w-full sm:w-auto">
          {isPending ? t("Salvando…") : t("Salvar campos do contato")}
        </Button>
      </div>
    </Card>
  );
}
