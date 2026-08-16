"use client";

import { Button } from "@/components/ui/button";
import { ChatCircle } from "@/lib/ui/icons";
import { supportWhatsappLink } from "@/lib/support";

/**
 * Link de suporte via WhatsApp — só aparece se `SUPPORT_WHATSAPP_NUMBER`
 * estiver configurado (ver lib/support.ts). `supportWhatsappLink()` resolve
 * `window.__PUBLIC_ENV__` no cliente e `process.env` no servidor (mesmo valor
 * dos dois lados, sem useEffect) — mesmo padrão de `branding()` em
 * components/shell/SidebarNav.tsx.
 */
export function SupportContactLink({ message }: { message?: string }) {
  const link = supportWhatsappLink();
  const href = link && message ? `${link}?text=${encodeURIComponent(message)}` : link;

  if (!href) return null;

  return (
    <Button variant="outline" className="w-full" asChild>
      <a href={href} target="_blank" rel="noopener noreferrer">
        <ChatCircle size={18} className="mr-2" />
        Precisa de ajuda? Fale com o suporte
      </a>
    </Button>
  );
}
