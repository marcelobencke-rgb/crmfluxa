import { redirect } from "next/navigation";

import { requireAuth, resolveActiveOrg } from "@/lib/auth/server";
import { ROLE_RANK } from "@/lib/auth/types";
import { Card } from "@/components/ui/card";
import { supportEmail } from "@/lib/support";

/**
 * FORA DO MENU enquanto for promessa — ver o bloco em lib/navigation/registry.ts.
 * A rota fica de pé com o gate de papel porque os e2e de RBAC provam o 403 do
 * `agent` entrando por URL.
 *
 * O endereço de suporte vem do `.env` (lib/support.ts). Era `suporte@deskcomm.app`
 * fixo no código: marca anterior do produto, caixa que não recebe.
 */
export default async function BillingPage() {
  // spec 13 §4: billing é admin-only (viewer/agent/manager = none).
  const user = await requireAuth();
  const activeOrg = await resolveActiveOrg(user);
  if (!activeOrg || ROLE_RANK[activeOrg.role] < ROLE_RANK.admin) {
    redirect("/403");
  }
  const email = supportEmail();
  return (
    <div className="flex h-full flex-col gap-6 p-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Billing</h1>
        <p className="text-sm text-muted-foreground">Planos, faturas e cobrança.</p>
      </header>
      <Card className="max-w-xl p-6">
        <h2 className="text-sm font-semibold">Em breve — Fase 2</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Billing entra na Fase 2 do roadmap.
          {email ? (
            <>
              {" "}
              Para questões de pagamento, contate{" "}
              <a className="underline" href={`mailto:${email}`}>
                {email}
              </a>
              .
            </>
          ) : (
            <> Para questões de pagamento, fale com quem administra esta instalação.</>
          )}
        </p>
      </Card>
    </div>
  );
}
