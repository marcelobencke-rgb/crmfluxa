import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
import { ROLE_RANK } from "@/lib/auth/types";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChatsCircle,
  Robot,
  Users,
  Receipt,
  PlugsConnected,
  ChartLineUp,
  Clock,
  WarningOctagon,
} from "@/lib/ui/icons";

export const metadata = {
  title: "Painel — Fluxa CRM",
};

export default async function DashboardPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/settings/profile");

  const supabase = await createClient();
  const orgId = activeOrg.id;

  // 1. Conversas em aberto
  const { count: openConversations } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "open");

  // 2. Aguardando Atribuição
  const { count: unassignedConversations } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "open")
    .is("assigned_to_user_id", null)
    .neq("assignee_kind", "ai");

  // 3. Atendimento por IA
  const { count: aiConversations } = await supabase
    .from("conversations")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "open")
    .eq("assignee_kind", "ai");

  // 4. Contatos Novos (criados hoje)
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const { count: newContacts } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .gte("created_at", today.toISOString());

  // 5. Valor Ganho (Leads ganhos neste mês)
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const { data: wonLeads } = await supabase
    .from("crm_leads")
    .select("value")
    .eq("organization_id", orgId)
    .eq("status", "won")
    .gte("won_at", firstDayOfMonth.toISOString());
  
  const totalValue = (wonLeads || []).reduce((acc, lead) => acc + (lead.value || 0), 0);
  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(totalValue / 100);

  // 6. Canais de Atendimento
  const { count: activeChannels } = await supabase
    .from("channel_sessions")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "connected");

  const userName = user.user_metadata?.full_name?.split(" ")[0] || "usuário";

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Bem-vindo, {userName}</h1>
        <p className="text-sm text-muted-foreground">
          Aqui está o resumo da sua operação neste momento.
        </p>
      </header>

      {/* Grid de Métricas Principais */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        
        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Canais Online
            </CardTitle>
            <PlugsConnected className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{activeChannels || 0}</div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Conversas em aberto
            </CardTitle>
            <ChatsCircle className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openConversations || 0}</div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Aguardando atribuição
            </CardTitle>
            <WarningOctagon className="h-4 w-4 text-orange-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{unassignedConversations || 0}</div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Atendimento por IA
            </CardTitle>
            <Robot className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{aiConversations || 0}</div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Contatos Novos (Hoje)
            </CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{newContacts || 0}</div>
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Valor Ganho (Mês)
            </CardTitle>
            <Receipt className="h-4 w-4 text-emerald-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formattedValue}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {(wonLeads || []).length} negócios
            </p>
          </CardContent>
        </Card>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Atividades e Eventos (Mock por enquanto) */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" /> Atividades
            </CardTitle>
            <CardDescription>Suas tarefas agendadas para hoje</CardDescription>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Nenhuma atividade para hoje
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ChartLineUp className="w-4 h-4" /> Pipeline Comercial
            </CardTitle>
            <CardDescription>Negócios movimentados nesta semana</CardDescription>
          </CardHeader>
          <CardContent className="h-48 flex items-center justify-center text-muted-foreground text-sm">
            Nenhum negócio movimentado
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
