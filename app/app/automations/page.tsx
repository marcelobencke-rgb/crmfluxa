import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { AutomationsClient } from "./_components/AutomationsClient";

export default async function AutomationsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  
  // Apenas gestores e admins podem ver/editar automações
  const canManage = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  if (!canManage) redirect("/app/inbox");

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Automações</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Crie regras para automatizar seu funil, aplicar tags e disparar mensagens de forma automática.
        </p>
        <p className="text-sm text-muted-foreground mt-1">
          Procurando o rodízio automático entre atendentes?{" "}
          <Link href="/app/settings/atendimento" className="underline underline-offset-2 hover:text-foreground">
            Veja Distribuição de atendimento
          </Link>
          .
        </p>
      </header>
      <AutomationsClient />
    </div>
  );
}
