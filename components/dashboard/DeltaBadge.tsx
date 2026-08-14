import { CaretDown, CaretUp } from "@/lib/ui/icons";
import { cn } from "@/lib/utils";

/**
 * Variação de período — só usado nos 2 cards do Painel onde a comparação é
 * um AGREGADO DE PERÍODO de verdade (ver lib/dashboard/period.ts). `null`
 * (período anterior zero) renderiza "novo" em vez de tentar mostrar uma
 * porcentagem que não significa nada.
 */
export function DeltaBadge({ pct }: { pct: number | null }) {
  if (pct === null) {
    return <span className="text-xs text-muted-foreground">novo</span>;
  }

  const arredondado = Math.round(pct);
  if (arredondado === 0) {
    return <span className="text-xs text-muted-foreground">estável</span>;
  }

  const subiu = arredondado > 0;
  const Icon = subiu ? CaretUp : CaretDown;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-xs font-medium",
        subiu ? "text-emerald-600 dark:text-emerald-400" : "text-red-600 dark:text-red-400",
      )}
    >
      <Icon size={12} weight="bold" aria-hidden />
      {Math.abs(arredondado)}%
    </span>
  );
}
