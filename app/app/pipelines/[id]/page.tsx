import { notFound, redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { FunilDaResposta } from "@/hooks/pipelines/usePipelines";
import { PipelinePageClient } from "./_client";

export const dynamic = "force-dynamic";

export default async function PipelinePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const { id } = await params;
  const supabase = await createClient();
  // Mesma razão da Agenda: a RLS é piso, não escopo. Sem este filtro o funil de
  // OUTRA organização do mesmo usuário abre, e o quadro monta com as etapas de
  // um lugar e o cabeçalho de outro.
  const { data: pipeline } = await supabase
    .from("crm_pipelines")
    .select("id, name, vocabulary")
    .eq("organization_id", activeOrg.orgId)
    .eq("id", id)
    .maybeSingle();
  if (!pipeline) notFound();

  // Os IRMÃOS do funil atual — para o seletor que substitui o antigo `<h1>`.
  // Mesma leitura direta (não `GET /api/v1/pipelines`) que `/app/kanban` já
  // fazia: aquela rota exige `manager`, e este quadro abre para QUALQUER papel.
  const { data: funis } = await supabase
    .from("crm_pipelines")
    .select("id, name, slug, description, position, is_default")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  const podeImportar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.agent;

  return (
    <PipelinePageClient
      pipelineId={id}
      initialName={pipeline.name}
      funis={(funis ?? []) as FunilDaResposta[]}
      podeGerenciar={podeGerenciar}
      podeImportar={podeImportar}
    />
  );
}
