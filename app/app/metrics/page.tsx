import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { createClient } from "@/lib/supabase/server";
import type { ScheduledReportInput } from "@/lib/schemas/settings";

import { MetricsClient } from "./_components/MetricsClient";
import { ScheduledReportCard } from "./_components/ScheduledReportCard";

const DEFAULT_SCHEDULED_REPORT: ScheduledReportInput = {
  enabled: false,
  frequency: "weekly",
  recipients: [],
};

export default async function MetricsPage() {
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  // spec 13 §6.1: agent vê as próprias (RLS); a comparação por atendente é manager+.
  const canCompare = !!activeOrg && ROLE_RANK[activeOrg.role] >= ROLE_RANK.manager;
  // Relatório por email sai do sistema pra endereços fora do CRM — mesmo piso
  // de admin que API Tokens e LGPD, não o de manager que já vê a comparação.
  const isAdmin =
    !!activeOrg && (user.is_platform_admin || ROLE_RANK[activeOrg.role] >= ROLE_RANK.admin);

  let scheduledReport = DEFAULT_SCHEDULED_REPORT;
  if (isAdmin && activeOrg) {
    const supabase = await createClient();
    const { data } = await supabase
      .from("organizations")
      .select("settings")
      .eq("id", activeOrg.orgId)
      .maybeSingle();
    const raw = (data?.settings as { scheduled_report?: unknown } | null)?.scheduled_report;
    if (raw && typeof raw === "object") {
      scheduledReport = { ...DEFAULT_SCHEDULED_REPORT, ...(raw as Partial<ScheduledReportInput>) };
    }
  }

  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Desempenho</h1>
        <p className="text-sm text-muted-foreground">
          {canCompare
            ? "Atrito, funil e performance por atendente nos últimos 30 dias."
            : "Atrito, seu funil e sua performance nos últimos 30 dias."}
        </p>
      </header>

      <MetricsClient canCompare={canCompare} currentUserId={user.id} />

      {isAdmin && <ScheduledReportCard initial={scheduledReport} />}
    </div>
  );
}
