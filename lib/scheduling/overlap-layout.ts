/**
 * Empacotamento de eventos sobrepostos em "raias" (lanes) pra grade de horário —
 * usado pela visualização semanal (spec 18), onde uma coluna de dia mistura vários
 * recursos e pode ter horários simultâneos (o que não acontece dentro de um único
 * recurso — a exclusion constraint do banco impede). Algoritmo de "column packing":
 * ordena por início, encaixa cada evento na primeira raia livre, e fecha o cluster
 * (fixando o laneCount de todo mundo nele) sempre que um evento começa depois do fim
 * de tudo que veio antes — assim um evento isolado no fim do dia não herda o
 * laneCount de um cluster lotado no início.
 */

export interface OverlapInput {
  id: string;
  starts_at: string;
  ends_at: string;
}

export interface OverlapLayout {
  id: string;
  lane: number;
  laneCount: number;
}

export function layoutOverlaps(items: OverlapInput[]): OverlapLayout[] {
  const sorted = [...items].sort((a, b) => {
    const byStart = new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    if (byStart !== 0) return byStart;
    return new Date(a.ends_at).getTime() - new Date(b.ends_at).getTime();
  });

  const results: OverlapLayout[] = [];
  let laneEnds: number[] = [];
  let clusterIds: string[] = [];
  let clusterLane = new Map<string, number>();
  let clusterMaxEnd = -Infinity;

  function flush() {
    const laneCount = laneEnds.length;
    for (const id of clusterIds) {
      results.push({ id, lane: clusterLane.get(id) ?? 0, laneCount });
    }
    laneEnds = [];
    clusterIds = [];
    clusterLane = new Map();
    clusterMaxEnd = -Infinity;
  }

  for (const item of sorted) {
    const start = new Date(item.starts_at).getTime();
    const end = new Date(item.ends_at).getTime();

    if (clusterIds.length > 0 && start >= clusterMaxEnd) flush();

    let lane = laneEnds.findIndex((laneEnd) => laneEnd <= start);
    if (lane === -1) {
      lane = laneEnds.length;
      laneEnds.push(end);
    } else {
      laneEnds[lane] = end;
    }
    clusterLane.set(item.id, lane);
    clusterIds.push(item.id);
    clusterMaxEnd = Math.max(clusterMaxEnd, end);
  }
  if (clusterIds.length > 0) flush();

  return results;
}
