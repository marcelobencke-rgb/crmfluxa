import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { redirect } from "next/navigation";
import { CatalogClient } from "./_components/CatalogClient";

export default async function CatalogPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/inbox");
  const canWrite = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Catálogo</h1>
        <p className="text-sm text-muted-foreground">
          Produtos e serviços que sua empresa vende — preço, e se o item exige agendamento.
        </p>
      </header>
      <CatalogClient canWrite={canWrite} />
    </div>
  );
}
