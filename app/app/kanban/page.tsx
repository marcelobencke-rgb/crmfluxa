import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import { KanbanVazio } from "./_empty";

export const dynamic = "force-dynamic";

/**
 * O MENU "Funis" NÃO ABRE MAIS UMA LISTA — abre direto o quadro do funil
 * padrão. Esta rota só existe para: (1) decidir QUAL funil é esse e
 * redirecionar, e (2) o estado em que a organização não tem nenhum funil
 * ainda, que não tem para onde redirecionar.
 *
 * A gestão que morava aqui — trocar, criar, renomear, reordenar, tornar
 * padrão, arquivar — passou para o seletor no cabeçalho do quadro
 * (`components/kanban/PipelineSwitcher.tsx`), aberto onde antes havia um
 * `<h1>` estático em `/app/pipelines/[id]`. "Etapas do funil"
 * (`/app/settings/tenant/pipelines`) segue a tela de configuração mais
 * profunda (colunas, vocabulário, motivos de perda) — o item "Gerenciar
 * funis" do seletor leva para lá, e é por isso que esta tela deixou de
 * precisar de um item de menu próprio.
 *
 * ⚠️ O FILTRO DE `organization_id` NÃO É REDUNDANTE COM A RLS — mesma razão
 * que o comentário original desta página já media: a policy libera todas as
 * organizações do usuário, e quem participa de duas com um funil padrão
 * homônimo em cada precisa que ESTA tela responda "qual das duas é a ativa
 * agora", não só "pode ver".
 */
export default async function KanbanRedirectPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app");

  const supabase = await createClient();
  const { data } = await supabase
    .from("crm_pipelines")
    .select("id, is_default, position")
    .eq("organization_id", activeOrg.orgId)
    .eq("is_archived", false)
    .order("position");

  const funis = data ?? [];
  if (funis.length === 0) {
    const podeGerenciar = ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
    return <KanbanVazio podeGerenciar={podeGerenciar} />;
  }

  // O gatilho `trg_seed_default_pipeline_for_org` garante um `is_default` em
  // toda organização nova; o `?? funis[0]` é só a rede de segurança para um
  // banco que chegou a este estado por fora do gatilho.
  const escolhido = funis.find((f) => f.is_default) ?? funis[0]!;
  redirect(`/app/pipelines/${escolhido.id}`);
}
