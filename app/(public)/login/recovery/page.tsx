import Link from "next/link";

import { RecoveryForm } from "@/components/auth/RecoveryForm";
import { SupportContactLink } from "@/components/auth/SupportContactLink";

export const metadata = { title: "Recuperar acesso" };

export default async function RecoveryPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="space-y-1.5 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">Recuperar acesso</h1>
        <p className="text-sm text-muted-foreground">
          Use um código de recuperação para reconfigurar sua autenticação em duas etapas.
        </p>
      </div>
      <RecoveryForm next={next} />
      <div className="space-y-3">
        <p className="text-center text-xs text-muted-foreground">
          Perdeu o autenticador e não tem nenhum código salvo? Um administrador do seu time
          pode resetar sua verificação em duas etapas.
        </p>
        <SupportContactLink message="Olá! Perdi acesso ao autenticador do Fluxa CRM e não tenho os códigos de recuperação. Podem me ajudar?" />
      </div>
      <div className="text-center text-sm">
        <Link
          href={next ? `/login?next=${encodeURIComponent(next)}` : "/login"}
          className="text-muted-foreground underline-offset-4 hover:underline"
        >
          Voltar ao login
        </Link>
      </div>
    </div>
  );
}
