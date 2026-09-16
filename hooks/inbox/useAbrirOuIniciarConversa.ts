"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { useT } from "@/hooks/i18n/useT";

/**
 * O clique de "acesso rápido à conversa" — no card do Kanban e em qualquer
 * outro lugar que precise da mesma pergunta: "abre a que já existe, ou cria
 * uma nova?". Extraído do que `ContactsTable.tsx` já fazia inline (`POST
 * /api/v1/conversations/open-with-contact` + navegar para o Inbox) — o card
 * precisava do MESMO fluxo, e copiar a chamada de novo seria a terceira cópia
 * da mesma regra de negócio que este produto já corrigiu outras vezes.
 *
 * `ContactsTable.tsx` continua com a própria cópia por ora — extrair sem
 * migrar quem já funciona custa risco sem necessidade; só o consumidor NOVO
 * usa o hook.
 */
export function useAbrirOuIniciarConversa() {
  const t = useT();
  const router = useRouter();
  const [abrindoContatoId, setAbrindoContatoId] = useState<string | null>(null);

  function abrir(conversationId: string) {
    router.push(`/app/inbox?id=${conversationId}`);
  }

  async function iniciar(contactId: string, phoneNumber: string) {
    if (abrindoContatoId) return;
    setAbrindoContatoId(contactId);
    try {
      const res = await fetch("/api/v1/conversations/open-with-contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contact_id: contactId, phone_number: phoneNumber }),
      });
      const json = (await res.json()) as {
        data?: { conversation_id: string };
        error?: { message?: string };
      };
      if (!res.ok || !json.data?.conversation_id) {
        throw new Error(json.error?.message ?? t("Não foi possível abrir a conversa."));
      }
      router.push(`/app/inbox?id=${json.data.conversation_id}`);
    } catch (err) {
      toast.error(err instanceof Error ? t(err.message) : t("Não foi possível abrir a conversa."));
    } finally {
      setAbrindoContatoId(null);
    }
  }

  return { abrir, iniciar, abrindoContatoId };
}
