/**
 * GET/POST /api/v1/cron/scheduled-reports — relatório de Desempenho por email.
 *
 * Roda TODO DIA (mesma resolução dos demais crons deste repo) e decide POR
 * ORGANIZAÇÃO se hoje é o dia de disparo (`lib/reports/schedule.ts`) — mais
 * simples que um crontab por frequência, e cada org decide a própria
 * frequência independente das outras.
 *
 * Service role sem sessão de usuário: toda leitura filtra `organization_id`
 * explicitamente (a própria linha da organização sendo processada), nunca do
 * body — não há body, é cron.
 *
 * NOTA DE DEPLOY: sem `vercel.json` neste repo (self-host). O agendamento
 * vive no serviço `scheduler` do `docker-compose.prod.yml`.
 */
import { randomUUID } from "node:crypto";
import type { NextRequest } from "next/server";

import { ok, fail } from "@/lib/api/wrappers";
import { audit } from "@/lib/audit";
import { env } from "@/lib/env";
import { logger } from "@/lib/logger";
import { createAdminClient } from "@/lib/supabase/admin";
import { sendEmail } from "@/lib/email/resend";
import { deveEnviarHoje, janelaDoRelatorio } from "@/lib/reports/schedule";
import { renderReportEmail } from "@/lib/reports/render-email";
import { scheduledReportSchema, type ScheduledReportInput } from "@/lib/schemas/settings";
import { comBatimento } from "@/lib/cron/com-batimento";

export const dynamic = "force-dynamic";

interface OrgRow {
  id: string;
  display_name: string | null;
  settings: Record<string, unknown> | null;
}

export interface ScheduledReportsResult {
  orgsHabilitadas: number;
  disparosHoje: number;
  enviados: number;
  falhas: number;
  /** Um envio bem-sucedido por entrada — `handle()` audita cada um daqui, não
   *  esta função: mesma separação de `recoverStuckMessages` (regra pura vs.
   *  efeito de auditoria), só que aqui o efeito é por-org, não agregado. */
  enviosParaAuditar: { organizationId: string; frequency: ScheduledReportInput["frequency"]; recipientCount: number }[];
}

/**
 * Separado do handler HTTP pro teste poder exercitar a REGRA sem montar
 * request/auth — mesmo padrão de `recoverStuckMessages`.
 */
export async function runScheduledReports(
  admin: ReturnType<typeof createAdminClient>,
  now: Date,
  requestId: string,
): Promise<ScheduledReportsResult> {
  const { data, error } = await admin.from("organizations").select("id, display_name, settings");
  if (error) throw new Error(`query_failed: ${error.message}`);

  let orgsHabilitadas = 0;
  let disparosHoje = 0;
  let enviados = 0;
  let falhas = 0;
  const enviosParaAuditar: ScheduledReportsResult["enviosParaAuditar"] = [];

  for (const org of (data ?? []) as OrgRow[]) {
    const raw = (org.settings as { scheduled_report?: unknown } | null)?.scheduled_report;
    const parsed = scheduledReportSchema.safeParse(raw);
    if (!parsed.success || !parsed.data.enabled || parsed.data.recipients.length === 0) continue;
    const cfg: ScheduledReportInput = parsed.data;
    orgsHabilitadas++;

    if (!deveEnviarHoje(cfg.frequency, now)) continue;
    disparosHoje++;

    const janela = janelaDoRelatorio(cfg.frequency, now);
    const { data: metricsRaw, error: metricsErr } = await admin.rpc("fn_attendant_metrics", {
      p_org: org.id,
      p_from: janela.from.toISOString(),
      p_to: janela.to.toISOString(),
      p_owner: null,
    });
    if (metricsErr) {
      falhas++;
      logger.error("[scheduled-reports] fn_attendant_metrics falhou", {
        organization_id: org.id,
        error: metricsErr.message,
        requestId,
      });
      continue;
    }
    const metrics = (metricsRaw ?? { funnel: [], attendants: [] }) as {
      funnel: { stage_name: string; count: number }[];
      attendants: { won: number; lost: number; conversations_handled: number }[];
    };

    const email = renderReportEmail({
      orgName: org.display_name ?? "seu CRM",
      frequency: cfg.frequency,
      funnel: metrics.funnel,
      attendants: metrics.attendants,
      janela,
    });

    const result = await sendEmail({
      to: cfg.recipients,
      subject: email.subject,
      html: email.html,
      text: email.text,
      tags: [{ name: "kind", value: "scheduled_report" }],
    });

    if (!result.ok) {
      falhas++;
      logger.error("[scheduled-reports] envio falhou", {
        organization_id: org.id,
        error: result.error,
        requestId,
      });
      continue;
    }

    enviados++;
    enviosParaAuditar.push({
      organizationId: org.id,
      frequency: cfg.frequency,
      recipientCount: cfg.recipients.length,
    });
  }

  return { orgsHabilitadas, disparosHoje, enviados, falhas, enviosParaAuditar };
}

async function handle(req: NextRequest): Promise<Response> {
  const requestId = randomUUID();

  const auth = req.headers.get("authorization") ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice("Bearer ".length).trim() : "";
  const accepted = [env.INTERNAL_CRON_SECRET, env.INTERNAL_SECRET].filter(Boolean);
  if (accepted.length === 0 || !provided || !accepted.includes(provided)) {
    return fail("forbidden", "Cron secret missing or invalid.", 403, { requestId });
  }

  let result: ScheduledReportsResult;
  try {
    result = await runScheduledReports(createAdminClient(), new Date(), requestId);
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    logger.error("[scheduled-reports] falhou", { error: detail, requestId });
    return fail("internal_error", "Failed to run scheduled reports.", 500, { requestId });
  }

  await Promise.all(
    result.enviosParaAuditar.map((envio) =>
      audit({
        action: "metrics.scheduled_report_sent",
        organizationId: envio.organizationId,
        bypassedRls: true,
        metadata: { frequency: envio.frequency, recipient_count: envio.recipientCount },
        requestId,
      }),
    ),
  );

  return ok(result, { requestId });
}

async function getInterno(req: NextRequest): Promise<Response> {
  return handle(req);
}

async function postInterno(req: NextRequest): Promise<Response> {
  return handle(req);
}

// Batimento de cron — ver lib/cron/com-batimento.ts. O nome vem do segmento
// da rota, que é o mesmo que o crontab do docker-compose.prod.yml escreve.
export const GET = comBatimento("scheduled-reports", getInterno);
export const POST = comBatimento("scheduled-reports", postInterno);
