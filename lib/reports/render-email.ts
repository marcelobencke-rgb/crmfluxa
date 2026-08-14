import type { ReportFrequency } from "@/lib/schemas/settings";
import type { Janela } from "./schedule";

export interface ReportFunnelStage {
  stage_name: string;
  count: number;
}

export interface ReportAttendantRow {
  won: number;
  lost: number;
  conversations_handled: number;
}

export interface RenderReportEmailArgs {
  orgName: string;
  frequency: ReportFrequency;
  funnel: ReportFunnelStage[];
  attendants: ReportAttendantRow[];
  janela: Janela;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

function fmtData(d: Date): string {
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

/**
 * Resumo agregado, não linha-a-linha por atendente: quem quer o detalhe usa
 * "Exportar CSV" na tela. O email responde a pergunta de reunião — "como foi
 * o período" — sem precisar resolver nome de cada atendente (evita N
 * chamadas à API de auth por envio, e o cron roda pra toda org habilitada).
 */
export function renderReportEmail(args: RenderReportEmailArgs): RenderedEmail {
  const { orgName, frequency, funnel, attendants, janela } = args;
  const periodoLabel =
    frequency === "weekly"
      ? `${fmtData(janela.from)} a ${fmtData(janela.to)}`
      : janela.from.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

  const totalWon = attendants.reduce((acc, a) => acc + a.won, 0);
  const totalLost = attendants.reduce((acc, a) => acc + a.lost, 0);
  const totalConversas = attendants.reduce((acc, a) => acc + a.conversations_handled, 0);
  const funilTotal = funnel.reduce((acc, s) => acc + s.count, 0);

  const subject = `Relatório ${frequency === "weekly" ? "semanal" : "mensal"} — ${orgName}`;

  const funilRows = funnel
    .map((s) => `<tr><td style="padding:4px 8px;">${s.stage_name}</td><td style="padding:4px 8px;text-align:right;">${s.count}</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html lang="pt-BR">
<body style="font-family:-apple-system,Helvetica,Arial,sans-serif;color:#111827;line-height:1.5;max-width:560px;margin:0 auto;padding:24px;">
  <h2 style="margin:0 0 4px;font-size:18px;">${subject}</h2>
  <p style="margin:0 0 20px;color:#6b7280;font-size:13px;">Período: ${periodoLabel}</p>

  <table style="width:100%;border-collapse:collapse;margin-bottom:20px;">
    <tr>
      <td style="padding:8px;background:#f3f4f6;border-radius:6px 0 0 6px;"><strong>${totalWon}</strong><br><span style="font-size:12px;color:#6b7280;">Ganhos</span></td>
      <td style="padding:8px;background:#f3f4f6;"><strong>${totalLost}</strong><br><span style="font-size:12px;color:#6b7280;">Perdidos</span></td>
      <td style="padding:8px;background:#f3f4f6;border-radius:0 6px 6px 0;"><strong>${totalConversas}</strong><br><span style="font-size:12px;color:#6b7280;">Conversas atendidas</span></td>
    </tr>
  </table>

  <h3 style="font-size:14px;margin:0 0 8px;">Funil aberto agora (${funilTotal} negócios)</h3>
  <table style="width:100%;border-collapse:collapse;font-size:13px;">${funilRows || '<tr><td style="padding:4px 8px;color:#6b7280;">Nenhuma etapa configurada.</td></tr>'}</table>

  <p style="margin-top:24px;font-size:12px;color:#6b7280;">
    Quer o detalhe por atendente? Abra Desempenho no CRM e exporte o CSV.
  </p>
</body>
</html>`;

  const text = `${subject}
Período: ${periodoLabel}

Ganhos: ${totalWon}
Perdidos: ${totalLost}
Conversas atendidas: ${totalConversas}

Funil aberto agora (${funilTotal} negócios):
${funnel.map((s) => `- ${s.stage_name}: ${s.count}`).join("\n") || "(nenhuma etapa configurada)"}

Quer o detalhe por atendente? Abra Desempenho no CRM e exporte o CSV.`;

  return { subject, html, text };
}
