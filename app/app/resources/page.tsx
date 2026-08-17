import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { redirect } from "next/navigation";
import { ResourcesClient } from "./_components/ResourcesClient";

export default async function ResourcesPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/inbox");
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;
  const isAdmin = ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Recursos</h1>
        <p className="text-sm text-muted-foreground">
          Profissionais, salas e equipamentos agendáveis — quais serviços cada um faz e em que horário.
        </p>
      </header>
      <ResourcesClient canWrite={canWrite} isAdmin={isAdmin} />
    </div>
  );
}
