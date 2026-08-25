import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { SupportContactLink } from "@/components/auth/SupportContactLink";
import { supportEmail } from "@/lib/support";

export const metadata = {
  title: "Conta suspensa",
};

/**
 * O endereço de suporte vem do `.env`, não do código — ver `lib/support.ts`.
 *
 * Esta tela trazia `support@deskcomm.com.br` fixo: marca anterior do produto,
 * caixa que não recebe. A única tela em que o usuário não tem outro caminho
 * (não entra para procurar ajuda em outro lugar) era a que o mandava escrever
 * para o vazio.
 *
 * Sem `SUPPORT_EMAIL` configurado não aparece contato nenhum — some a frase
 * inteira em vez de sobrar um "entre em contato com" sem destinatário.
 */
export default function AccountSuspendedPage() {
  const email = supportEmail();

  return (
    <main className="flex min-h-screen items-center justify-center p-8">
      <Card className="w-full max-w-md p-8 text-center space-y-4">
        <h1 className="text-2xl font-semibold">Conta suspensa</h1>
        <p className="text-sm text-muted-foreground">
          Sua conta está suspensa.
          {email ? (
            <>
              {" "}
              Entre em contato com{" "}
              <a
                href={`mailto:${email}`}
                className="underline underline-offset-4 hover:text-foreground transition-colors"
              >
                {email}
              </a>{" "}
              para mais informações.
            </>
          ) : (
            <> Fale com quem administra esta instalação para mais informações.</>
          )}
        </p>
        <SupportContactLink message="Minha conta está suspensa." />
        <div className="pt-2">
          <Button asChild variant="outline">
            <Link href="/login">Sair</Link>
          </Button>
        </div>
      </Card>
    </main>
  );
}
