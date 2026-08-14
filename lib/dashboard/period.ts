/**
 * Janelas de data pro Painel — Date puro, sem lib de timezone, hora do
 * servidor (mesmo estilo já usado em app/app/dashboard/page.tsx). Sempre
 * [from, to) meio-aberto.
 */

export interface Janela {
  from: Date;
  to: Date;
}

function inicioDoDia(d: Date): Date {
  const r = new Date(d);
  r.setHours(0, 0, 0, 0);
  return r;
}

/** Desde a meia-noite de hoje até agora. */
export function janelaHoje(agora: Date): Janela {
  return { from: inicioDoDia(agora), to: agora };
}

/**
 * O dia inteiro de hoje — meia-noite a meia-noite. Diferente de `janelaHoje`
 * (que para em "agora"): serve pra achar o que está AGENDADO pra hoje,
 * inclusive nas próximas horas — `janelaHoje` excluiria a demanda das 18h se
 * agora fossem 10h da manhã.
 */
export function janelaDiaCheio(agora: Date): Janela {
  const from = inicioDoDia(agora);
  const to = new Date(from);
  to.setDate(to.getDate() + 1);
  return { from, to };
}

/** Da segunda-feira desta semana (meia-noite) até agora. */
export function janelaSemanaAtual(agora: Date): Janela {
  const diaDaSemana = agora.getDay(); // 0=domingo .. 6=sábado
  const diasDesdeSegunda = (diaDaSemana + 6) % 7;
  const from = inicioDoDia(agora);
  from.setDate(from.getDate() - diasDesdeSegunda);
  return { from, to: agora };
}

/**
 * Mesmo intervalo relativo, um dia antes — compara "novos contatos hoje" com
 * quantos já tinham entrado no MESMO horário ontem. Sem isso, 9h da manhã
 * hoje sempre perderia pro dia inteiro de ontem.
 */
export function janelaOntemEquivalente(agora: Date): Janela {
  const inicioHoje = inicioDoDia(agora);
  const inicioOntem = new Date(inicioHoje);
  inicioOntem.setDate(inicioOntem.getDate() - 1);
  const decorrido = agora.getTime() - inicioHoje.getTime();
  return { from: inicioOntem, to: new Date(inicioOntem.getTime() + decorrido) };
}

/** Desde o dia 1 do mês corrente, meia-noite, até agora ("mês até aqui"). */
export function janelaMesAtual(agora: Date): Janela {
  return { from: new Date(agora.getFullYear(), agora.getMonth(), 1), to: agora };
}

/**
 * O mês corrente INTEIRO — dia 1 ao dia 1 do mês seguinte. Diferente de
 * `janelaMesAtual` (que para em "agora"): serve pra achar compromisso
 * FUTURO dentro do mês — a previsão de receita não pode excluir um
 * fechamento previsto pro dia 25 só porque hoje é dia 5.
 */
export function janelaMesCheio(agora: Date): Janela {
  const from = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const to = new Date(agora.getFullYear(), agora.getMonth() + 1, 1);
  return { from, to };
}

/**
 * Mesmo corte de dia do mês, um mês antes — comparar "quanto ganhamos até o
 * dia 12" com o mês ANTERIOR INTEIRO sempre pareceria pior no começo do mês.
 * Quando o mês anterior é mais curto que o dia de hoje (hoje é 31, fevereiro
 * só tem 28), o corte não ultrapassa — vira o mês anterior inteiro, que é o
 * teto real dele.
 */
export function janelaMesAnteriorEquivalente(agora: Date): Janela {
  const from = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);
  const ultimoDiaMesAnterior = new Date(agora.getFullYear(), agora.getMonth(), 0).getDate();
  const dia = Math.min(agora.getDate(), ultimoDiaMesAnterior);
  const to = new Date(
    agora.getFullYear(),
    agora.getMonth() - 1,
    dia,
    agora.getHours(),
    agora.getMinutes(),
    agora.getSeconds(),
  );
  return { from, to };
}

/**
 * `null` quando o período anterior é zero — a tela mostra "novo" em vez de
 * Infinity%/NaN%, que não dizem nada pro dono do negócio.
 */
export function variacaoPct(atual: number, anterior: number): number | null {
  if (anterior === 0) return null;
  return ((atual - anterior) / anterior) * 100;
}
