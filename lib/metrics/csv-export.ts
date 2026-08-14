import type { AttendantMetric } from "@/hooks/metrics/useAttendantMetrics";

export interface FunnelStageMetric {
  stage_id: string;
  stage_name: string;
  position: number;
  count: number;
}

/** Escapa aspas e embrulha em aspas quando o valor tem vírgula, aspas ou quebra de linha. */
function csvCell(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(cells: (string | number)[]): string {
  return cells.map(csvCell).join(",");
}

/**
 * Gera o CSV do Desempenho — mesmos dados que a tela já carregou
 * (`useAttendantMetrics`), sem chamada nova ao servidor. Duas tabelas no
 * mesmo arquivo (funil, depois performance), separadas por linha em branco:
 * abre bem tanto no Excel quanto no Google Sheets sem importação especial.
 */
export function metricsToCsv(
  funnel: FunnelStageMetric[],
  attendants: AttendantMetric[],
  geradoEm: Date,
): string {
  const linhas: string[] = [];

  linhas.push(csvLine(["Funil", "", ""]));
  linhas.push(csvLine(["Etapa", "Negócios abertos"]));
  for (const s of funnel) {
    linhas.push(csvLine([s.stage_name, s.count]));
  }

  linhas.push("");
  linhas.push(csvLine(["Performance por atendente"]));
  linhas.push(
    csvLine(["Atendente", "Ganhos", "Perdidos", "Conversas", "1ª resposta média (segundos)"]),
  );
  for (const a of attendants) {
    linhas.push(
      csvLine([
        a.name ?? a.email ?? a.user_id,
        a.won,
        a.lost,
        a.conversations_handled,
        a.avg_first_response_seconds ?? "",
      ]),
    );
  }

  linhas.push("");
  linhas.push(csvLine(["Gerado em", geradoEm.toLocaleString("pt-BR")]));

  // BOM (﻿): sem ele o Excel abre acento errado em CSV UTF-8 no Windows.
  return "﻿" + linhas.join("\n");
}
