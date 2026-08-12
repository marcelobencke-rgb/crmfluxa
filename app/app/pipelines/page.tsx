import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { Kanban } from "@/lib/ui/icons";
import { EmptyPipeline } from "@/components/empty";
import { ROLE_RANK } from "@/lib/auth/types";
import { PipelinePageClient } from "./[id]/_client";

export default async function PipelinesIndexPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data: allPipelinesData } = await supabase
    .from("crm_pipelines")
    .select("id, name, slug, description, position, is_default, vocabulary")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  const funis = allPipelinesData ?? [];
  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  if (funis.length > 0) {
    const padrao = funis.find((f) => f.is_default) || funis[0];
    
    // Instead of redirecting, render the board directly to avoid the round-trip latency
    return (
      <PipelinePageClient 
        pipelineId={padrao.id} 
        initialName={padrao.name} 
        pipelines={funis}
        podeGerenciar={podeGerenciar}
      />
    );
  }

  // Se não tem nenhum funil
  return (
    <div className="flex h-full flex-col gap-4 p-6">
      <header className="flex items-center gap-3">
        <Kanban size={28} className="text-muted-foreground" weight="duotone" />
        <h1 className="text-2xl font-semibold tracking-tight">Pipelines</h1>
      </header>

      <div className="flex flex-1 flex-col items-center justify-center gap-4">
        <EmptyPipeline
          primary={
            podeGerenciar
              ? { label: "Criar meu primeiro funil", href: "/app/settings/tenant/pipelines" }
              : undefined
          }
        />
      </div>
    </div>
  );
}
