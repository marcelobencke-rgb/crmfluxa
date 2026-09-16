import type { ComponentType, ReactNode } from "react";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

interface IconProps {
  size?: number;
  className?: string;
}

interface Props {
  id: string;
  label: ReactNode;
  icon: ComponentType<IconProps>;
  required?: boolean;
  hint?: ReactNode;
  /** Ícone alinhado ao topo em vez de centralizado — para textarea. */
  multiline?: boolean;
  className?: string;
  children: ReactNode;
}

/**
 * Rótulo + ícone à esquerda do controle + dica opcional. Usado nos modais de
 * contato e de lead pra não repetir o wrapper relative/ícone em cada campo.
 */
export function FieldShell({
  id,
  label,
  icon: Icon,
  required,
  hint,
  multiline,
  className,
  children,
}: Props) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <Label htmlFor={id} className="flex items-center gap-1 text-xs font-medium text-text-subtle">
        {label}
        {required && <span className="text-error-fg">*</span>}
      </Label>
      <div className="relative">
        <Icon
          size={16}
          className={cn(
            "pointer-events-none absolute left-3 text-text-subtle",
            multiline ? "top-3" : "top-1/2 -translate-y-1/2",
          )}
        />
        {children}
      </div>
      {/* `div`, não `p`: um chamador pode passar outro elemento de bloco
          como hint (ex.: uma mensagem de erro em <p>), e <p> dentro de
          <p> é HTML inválido. */}
      {hint && <div className="text-xs text-text-subtle">{hint}</div>}
    </div>
  );
}

/** Título de seção dentro do formulário — separa "Informações básicas" de "Redes" etc. */
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 pt-1 first:pt-0">
      <h3 className="shrink-0 text-xs font-semibold uppercase tracking-wide text-text-subtle">
        {children}
      </h3>
      <div className="h-px flex-1 bg-border" />
    </div>
  );
}
