"use client";
import { useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { toast } from "sonner";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Message } from "@/lib/types/messaging";

interface SendArgs {
  conversation_id: string;
  body?: string;
  media_url?: string;
  media_mime?: string;
  media_storage_path?: string;
  media_size_bytes?: number;
  type?: string;
}

interface MessagesPage {
  data: Message[];
  meta?: { cursor?: string | null; has_more?: boolean };
}

export function useSendMessage() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendArgs) =>
      apiClient.post<{ data: Message }>("/api/v1/messages", input),
    onMutate: async (args) => {
      if (args.media_storage_path || args.media_url) return {};

      const queryKey = ["messages", args.conversation_id];
      await qc.cancelQueries({ queryKey });

      const tempId = `temp-${Date.now()}`;
      const tempMsg: Message = {
        id: tempId,
        organization_id: "",
        conversation_id: args.conversation_id,
        channel_session_id: "",
        contact_id: "",
        external_id: null,
        type: args.type ?? "text",
        direction: "outbound",
        status: "queued",
        ack: null,
        error_code: null,
        error_message: null,
        body: args.body ?? null,
        media_url: args.media_url ?? null,
        media_mime: args.media_mime ?? null,
        media_size_bytes: null,
        media_storage_path: null,
        sent_via: "user",
        sent_by_user_id: null,
        sent_at: new Date().toISOString(),
        delivered_at: null,
        read_at: null,
        metadata: { _optimistic: true },
        created_at: new Date().toISOString(),
      };

      qc.setQueryData<InfiniteData<MessagesPage>>(queryKey, (old) => {
        if (!old) return old;
        const pages = [...old.pages];
        if (pages.length > 0) {
          const lastIdx = pages.length - 1;
          const lastPage = pages[lastIdx]!;
          pages[lastIdx] = {
            ...lastPage,
            data: [...lastPage.data, tempMsg],
          };
        }
        return { ...old, pages };
      });

      return { tempId };
    },
    onError: (err, args) => {
      qc.invalidateQueries({ queryKey: ["messages", args.conversation_id] });
      showApiError(err);
    },
    onSuccess: (res, args, ctx) => {
      /**
       * A LINHA REAL ENTRA AQUI, vinda da própria resposta do POST.
       *
       * Antes, quem trocava a bolha otimista pela mensagem de verdade era o
       * `invalidateQueries` do `onSettled` — um refetch inteiro para buscar o
       * que a resposta já trazia. Com aquele invalidate removido, deixar a
       * troca por conta do realtime seria apostar a corretude da tela num
       * canal que sabidamente morre calado (é o bug que a Fase 1 consertou):
       * se o evento não chegasse, a bolha ficaria "enviando" com id `temp-`
       * até a rede de segurança rodar.
       *
       * Usar a resposta não depende de nada: ela já está na mão, é a mesma
       * linha que o servidor gravou, e o realtime que chegar depois casa por
       * `id` e só substitui (ver `aplicarEvento` em useMessagesRealtime).
       */
      const tempId = (ctx as { tempId?: string } | undefined)?.tempId;
      qc.setQueryData<InfiniteData<MessagesPage>>(
        ["messages", args.conversation_id],
        (old) => {
          if (!old) return old;
          let jaExiste = false;
          const pages = old.pages.map((p) => ({
            ...p,
            data: p.data
              .filter((m) => m.id !== tempId)
              .map((m) => {
                if (m.id !== res.data.id) return m;
                jaExiste = true;
                return res.data;
              }),
          }));
          if (!jaExiste && pages[0]) {
            pages[0] = { ...pages[0], data: [...pages[0].data, res.data] };
          }
          return { ...old, pages };
        },
      );

      // O handler NUNCA derruba um envio com o canal fora — ele segura a
      // mensagem como "queued" e reagenda. Sem este aviso o atendente via a
      // bolha "enviando" e só descobria que o WhatsApp caiu quando o cliente
      // reclamasse.
      if (res.data.status === "queued") {
        toast.warning("O WhatsApp deste número está desconectado — a mensagem vai sair quando ele reconectar.");
      }
    },
    onSettled: () => {
      // A THREAD NÃO É MAIS INVALIDADA NO SUCESSO.
      //
      // Era um refetch garantido logo depois de cada envio — e, sendo infinite
      // query, refazia TODAS as páginas já carregadas — para buscar um estado
      // que o cache já tinha: a bolha otimista de `onMutate` e, desde o
      // conserto do realtime, o merge do próprio evento do canal (que troca o
      // gêmeo otimista pela linha real e aplica o `sent`).
      //
      // O `onError` acima continua invalidando: aí o cache está mesmo errado
      // (a bolha otimista descreve um envio que não aconteceu) e reler o
      // servidor é o certo.
      //
      // `["conversations"]` continua: é outra query (a lista da esquerda, com
      // prévia e ordenação por última mensagem), que nenhum dos dois caminhos
      // acima atualiza.
      qc.invalidateQueries({ queryKey: ["conversations"] });
    },
  });
}
