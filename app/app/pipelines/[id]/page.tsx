import { notFound, redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PipelinePageClient } from "./_client";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  
  // 1. Fetch current pipeline
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary")
    .eq("id", id)
    .maybeSingle();
    
  if (!pipeline) notFound();

  // 2. Fetch all pipelines to populate the selector
  const { data: allPipelinesData } = await supabase
    .from("crm_pipelines")
    .select("id, name, slug, description, position, is_default")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  const pipelines = allPipelinesData ?? [];
  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;

  return (
    <PipelinePageClient 
      pipelineId={id} 
      initialName={pipeline.name} 
      pipelines={pipelines}
      podeGerenciar={podeGerenciar}
    />
  );
}
