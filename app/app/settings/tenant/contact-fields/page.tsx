import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { traduzir } from "@/lib/i18n/dicionario";
import { camposDoContato } from "@/lib/contacts/campos-personalizados";
import { ContactFieldsClient } from "./_client";

export const dynamic = "force-dynamic";

/**
 * Os campos personalizados da FICHA DO CONTATO.
 *
 * ⚠️ NÃO É MAIS "Vocabulário e campos" do funil padrão — ver o cabeçalho de
 * `lib/schemas/settings.ts` (`contactFieldsConfigPatchSchema`) para o porquê
 * da separação. Mesmo papel de escrita de lá: admin+ (é decisão de estrutura
 * que todo contato herda, não operação do dia a dia).
 */
export default async function ContactFieldsSettingsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");
  if (!(user.is_platform_admin && !user.support) && ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }

  const supabase = await createClient();
  const { data } = await supabase
    .from("organizations")
    .select("settings")
    .eq("id", activeOrg.orgId)
    .maybeSingle();

  const fields = camposDoContato((data?.settings as Record<string, unknown> | null) ?? null);
  const idioma = user.idioma;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">
          {traduzir("Campos do contato", idioma)}
        </h1>
        <p className="text-sm text-muted-foreground">
          {traduzir(
            "Os campos que aparecem na ficha de qualquer contato, em qualquer funil.",
            idioma,
          )}
        </p>
      </header>
      <ContactFieldsClient camposIniciais={fields} />
    </div>
  );
}
