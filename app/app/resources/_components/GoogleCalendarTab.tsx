"use client";
import * as React from "react";
import { formatDistanceToNowStrict } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { connectGoogleCalendarFormAction } from "@/app/actions/integrations/connectGoogleCalendar";
import { useGoogleCalendarStatus, googleCalendarStatusKey } from "@/hooks/integrations/useGoogleCalendarStatus";

const STATUS_LABEL: Record<string, string> = {
  connected: "Conectado",
  disconnected: "Desconectado",
  error: "Erro",
};

interface Props {
  resourceId: string;
}

export function GoogleCalendarTab({ resourceId }: Props) {
  const { data, isLoading } = useGoogleCalendarStatus(resourceId);
  const qc = useQueryClient();

  const disconnect = useMutation({
    mutationFn: async (connectionId: string) =>
      apiClient.delete(`/api/v1/integrations/google-calendar/${connectionId}`),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: googleCalendarStatusKey(resourceId) });
      toast.success("Google Agenda desconectada.");
    },
  });

  if (isLoading) return <Skeleton className="h-16 w-full" />;

  if (!data?.configured) {
    return (
      <p className="text-sm text-muted-foreground">
        Integração com Google Agenda não configurada nesta instalação. Peça pra quem administra o
        servidor definir <code className="text-xs">GOOGLE_OAUTH_CLIENT_ID</code> e{" "}
        <code className="text-xs">GOOGLE_OAUTH_CLIENT_SECRET</code>.
      </p>
    );
  }

  const conn = data.connection;

  if (!conn) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Sem conexão. Ao conectar, agendamentos deste recurso são enviados pra sua Google Agenda, e o
          que você marcar lá aparece aqui.
        </p>
        <form action={connectGoogleCalendarFormAction.bind(null, resourceId)}>
          <Button type="submit">Conectar Google Agenda</Button>
        </form>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Badge variant={conn.status === "connected" ? "success" : "destructive"}>
          {STATUS_LABEL[conn.status] ?? conn.status}
        </Badge>
        <span className="text-sm text-muted-foreground">{conn.external_calendar_id}</span>
      </div>
      <p className="text-sm text-muted-foreground">
        {conn.last_synced_at
          ? `Última sincronização ${formatDistanceToNowStrict(new Date(conn.last_synced_at), { addSuffix: true, locale: ptBR })}`
          : "Ainda não sincronizou."}
      </p>
      {conn.last_error && <p className="text-sm text-destructive">{conn.last_error}</p>}
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button type="button" variant="ghost">
            Desconectar
          </Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar Google Agenda?</AlertDialogTitle>
            <AlertDialogDescription>
              Agendamentos já sincronizados continuam na sua Google Agenda, mas deixam de ser
              atualizados automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => disconnect.mutate(conn.id)}>Desconectar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
