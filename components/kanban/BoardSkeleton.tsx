import { Skeleton } from "@/components/ui/skeleton";

/**
 * Esqueleto do quadro de funil — usado em `/app/kanban` (que só redireciona)
 * e em `/app/pipelines/[id]` (o quadro de verdade, onde a pessoa fica). Sem
 * `loading.tsx` nesta segunda rota, trocar de funil ficava com a tela em
 * branco até as duas queries do server component voltarem.
 */
export function BoardSkeleton() {
  return (
    <div className="p-6">
      <Skeleton className="h-8 w-64 mb-6" />
      <div className="flex gap-4 overflow-x-auto">
        {Array.from({ length: 5 }).map((_, col) => (
          <div key={col} className="w-72 shrink-0 space-y-3">
            <Skeleton className="h-6 w-32" />
            {Array.from({ length: 3 }).map((_, card) => (
              <Skeleton key={card} className="h-24 w-full" />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
