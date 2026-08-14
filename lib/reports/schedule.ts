import type { ReportFrequency } from "@/lib/schemas/settings";

export interface Janela {
  from: Date;
  to: Date;
}

/**
 * O cron roda todo dia (mesma resolução dos demais crons deste repo) e decide
 * POR ORGANIZAÇÃO se hoje é o dia de disparo — mais simples que registrar
 * schedules diferentes no crontab pra cada frequência, e o disparo de cada
 * org já depende da própria config dela, não de UM crontab por frequência.
 */
export function deveEnviarHoje(frequency: ReportFrequency, hoje: Date): boolean {
  if (frequency === "weekly") return hoje.getDay() === 1; // segunda-feira
  return hoje.getDate() === 1;
}

/**
 * 'weekly' → últimos 7 dias (não "desde a segunda passada": o relatório de
 * segunda de manhã cobre a semana INTEIRA anterior, sem depender de que
 * "semana" comece em que dia).
 * 'monthly' → o mês calendário anterior inteiro (disparado no dia 1, então
 * "este mês" ainda não tem dado nenhum).
 */
export function janelaDoRelatorio(frequency: ReportFrequency, hoje: Date): Janela {
  if (frequency === "weekly") {
    const to = hoje;
    const from = new Date(hoje);
    from.setDate(from.getDate() - 7);
    return { from, to };
  }
  const from = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
  const to = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  return { from, to };
}
