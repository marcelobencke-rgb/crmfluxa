import Link from "next/link";
import { redirect } from "next/navigation";
import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { createClient } from "@/lib/supabase/server";
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
  Target,
  WarningOctagon,
} from "@/lib/ui/icons";
import { DeltaBadge } from "@/components/dashboard/DeltaBadge";
import {
  demandasDeHoje,
  metaMensal,
  movimentacoesDaSemana,
  previsaoDoMes,
} from "@/lib/dashboard/queries";
import {
  janelaDiaCheio,
  janelaHoje,
  janelaMesAnteriorEquivalente,
  janelaMesAtual,
  janelaMesCheio,
  janelaOntemEquivalente,
  janelaSemanaAtual,
  variacaoPct,
} from "@/lib/dashboard/period";

export const metadata = {
  title: "Painel — Fluxa CRM",
};

export default async function DashboardPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg) redirect("/app/settings/profile");

  const supabase = await createClient();
  const orgId = activeOrg.orgId;
  const agora = new Date();

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

  // 4. Contatos Novos (hoje), comparado com o MESMO horário ontem — não com o
  // dia inteiro de ontem, que sempre perderia de manhã.
  const hoje = janelaHoje(agora);
  const ontemEquivalente = janelaOntemEquivalente(agora);
  const [{ count: newContacts }, { count: newContactsOntem }] = await Promise.all([
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", hoje.from.toISOString()),
    supabase
      .from("contacts")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", orgId)
      .gte("created_at", ontemEquivalente.from.toISOString())
      .lt("created_at", ontemEquivalente.to.toISOString()),
  ]);
  const deltaContatos = variacaoPct(newContacts ?? 0, newContactsOntem ?? 0);

  // 5. Valor Ganho (mês até aqui), comparado com o MESMO corte de dia no mês
  // anterior — não o mês anterior inteiro, que sempre perderia no início do mês.
  // BUG CORRIGIDO: a coluna é `value_cents`, não `value` — a query antiga
  // (`.select("value")`) era recusada pelo PostgREST em silêncio (o `error` era
  // descartado), `wonLeads` vinha sempre `null`, e o card mostrava R$ 0,00 pra
  // sempre, com dinheiro de verdade ganho no mês.
  const mesAtual = janelaMesAtual(agora);
  const mesAnteriorEquivalente = janelaMesAnteriorEquivalente(agora);
  const [{ data: wonLeads }, { data: wonLeadsMesAnterior }, metaCents] = await Promise.all([
    supabase
      .from("crm_leads")
      .select("value_cents")
      .eq("organization_id", orgId)
      .eq("status", "won")
      .gte("won_at", mesAtual.from.toISOString()),
    supabase
      .from("crm_leads")
      .select("value_cents")
      .eq("organization_id", orgId)
      .eq("status", "won")
      .gte("won_at", mesAnteriorEquivalente.from.toISOString())
      .lt("won_at", mesAnteriorEquivalente.to.toISOString()),
    metaMensal(supabase, orgId),
  ]);

  const totalValue = (wonLeads ?? []).reduce((acc, lead) => acc + (lead.value_cents ?? 0), 0);
  const totalValueMesAnterior = (wonLeadsMesAnterior ?? []).reduce(
    (acc, lead) => acc + (lead.value_cents ?? 0),
    0,
  );
  const deltaValor = variacaoPct(totalValue, totalValueMesAnterior);
  const formattedValue = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(totalValue / 100);

  // Meta de vendas (Configurações › Organização). Sem meta definida = estado
  // normal de quem não configurou ainda — não mostra barra nenhuma, só um
  // convite pra definir uma. `pctReal` pode passar de 100 (vale comemorar);
  // `pctBarra` satura em 100 porque não dá pra desenhar largura maior que a caixa.
  const metaProgresso =
    metaCents && metaCents > 0
      ? { pctReal: Math.round((totalValue / metaCents) * 100), pctBarra: Math.min(100, Math.round((totalValue / metaCents) * 100)) }
      : null;
  const formattedMeta =
    metaCents !== null
      ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
          metaCents / 100,
        )
      : null;

  // 6. Canais de Atendimento.
  // BUG CORRIGIDO: o CHECK de `channel_sessions.status` só aceita STARTING |
  // SCAN_QR_CODE | WORKING | STOPPED | FAILED — 'connected' nunca foi um
  // valor válido, então este card também sempre mostrou 0. Mesma classe de
  // bug corrigida hoje mais cedo em ConnectionsClient.tsx.
  const { count: activeChannels } = await supabase
    .from("channel_sessions")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId)
    .eq("status", "WORKING");

  // 7. Atividades de hoje e movimentação de funil da semana — os 2 cards que
  // eram mock fixo, agora com dado real.
  const [atividadesHoje, movimentacoes] = await Promise.all([
    demandasDeHoje(supabase, orgId, janelaDiaCheio(agora)),
    movimentacoesDaSemana(supabase, orgId, janelaSemanaAtual(agora)),
  ]);

  // 8. Previsão do mês — soma dos negócios abertos com fechamento previsto
  // dentro do mês inteiro (não só até hoje: um fechamento previsto pro dia 25
  // conta mesmo se hoje é dia 5). Sem ponderar por placar de risco — ver o
  // porquê em lib/dashboard/queries.ts.
  const previsao = await previsaoDoMes(supabase, orgId, janelaMesCheio(agora));
  const formattedPrevisao = new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
  }).format(previsao.totalCents / 100);

  const userName = user.full_name?.split(" ")[0] || "usuário";

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
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{newContacts || 0}</div>
              <DeltaBadge pct={deltaContatos} />
            </div>
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
            <div className="flex items-baseline gap-2">
              <div className="text-2xl font-bold">{formattedValue}</div>
              <DeltaBadge pct={deltaValor} />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {(wonLeads || []).length} negócios
            </p>
            {metaProgresso ? (
              <div className="mt-2 space-y-1">
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className={`h-full transition-all ${metaProgresso.pctReal >= 100 ? "bg-emerald-500" : "bg-primary"}`}
                    style={{ width: `${metaProgresso.pctBarra}%` }}
                    role="progressbar"
                    aria-valuenow={metaProgresso.pctBarra}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {metaProgresso.pctReal}% da meta de {formattedMeta}
                </p>
              </div>
            ) : (
              <Link
                href="/app/settings/tenant"
                className="mt-1 block text-[11px] text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Definir meta mensal
              </Link>
            )}
          </CardContent>
        </Card>

        <Card className="flex flex-col justify-between">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              Previsão do mês
            </CardTitle>
            <Target className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formattedPrevisao}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {previsao.quantidade === 0
                ? "Nenhum negócio com fechamento previsto"
                : `${previsao.quantidade} ${previsao.quantidade === 1 ? "negócio aberto" : "negócios abertos"} com fechamento previsto`}
            </p>
          </CardContent>
        </Card>

      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <Clock className="w-4 h-4" /> Atividades
            </CardTitle>
            <CardDescription>Suas tarefas agendadas para hoje</CardDescription>
          </CardHeader>
          <CardContent>
            {atividadesHoje.length === 0 ? (
              <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Nada agendado pra hoje
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {atividadesHoje.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {a.proximo_passo ?? a.assunto ?? "Sem título"}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {a.contact_name ?? "Contato sem nome"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(a.proximo_passo_em).toLocaleTimeString("pt-BR", {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold flex items-center gap-2">
              <ChartLineUp className="w-4 h-4" /> Pipeline Comercial
            </CardTitle>
            <CardDescription>Negócios movimentados nesta semana</CardDescription>
          </CardHeader>
          <CardContent>
            {movimentacoes.length === 0 ? (
              <p className="flex h-48 items-center justify-center text-sm text-muted-foreground">
                Nenhuma movimentação esta semana
              </p>
            ) : (
              <ul className="flex flex-col gap-3">
                {movimentacoes.map((m) => (
                  <li
                    key={m.id}
                    className="flex items-start justify-between gap-3 border-b border-border pb-3 last:border-0 last:pb-0"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{m.lead_title ?? "Negócio"}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {m.reason ?? "Etapa alterada"}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {new Date(m.performed_at).toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}
