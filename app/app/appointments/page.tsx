import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { redirect } from "next/navigation";
import { AppointmentsClient } from "./_components/AppointmentsClient";

export default async function AppointmentsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/inbox");
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Agendamentos</h1>
        <p className="text-sm text-muted-foreground">
          Horários marcados por recurso e serviço — remarque ou cancele quando precisar.
        </p>
      </header>
      <AppointmentsClient canWrite={canWrite} />
    </div>
  );
}
