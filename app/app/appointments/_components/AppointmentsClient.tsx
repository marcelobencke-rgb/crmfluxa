"use client";
import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, X } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useAppointments, APPOINTMENTS_KEY, type Appointment } from "@/hooks/appointments/useAppointments";
import { useResources } from "@/hooks/resources/useResources";
import { useProducts } from "@/hooks/products/useProducts";
import { NewAppointmentDialog } from "./NewAppointmentDialog";
import { CancelAppointmentDialog } from "./CancelAppointmentDialog";
import { CalendarView } from "./CalendarView";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/appointments/status";

interface Props {
  canWrite: boolean;
}

export function AppointmentsClient({ canWrite }: Props) {
  const [newOpen, setNewOpen] = React.useState(false);

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button type="button" onClick={() => setNewOpen(true)}>
            <Plus /> Novo agendamento
          </Button>
        </div>
      )}
      <Tabs defaultValue="agenda">
        <TabsList>
          <TabsTrigger value="agenda">Agenda</TabsTrigger>
          <TabsTrigger value="list">Lista</TabsTrigger>
        </TabsList>
        <TabsContent value="agenda" className="mt-4">
          <CalendarView canWrite={canWrite} />
        </TabsContent>
        <TabsContent value="list" className="mt-4">
          <ListView canWrite={canWrite} />
        </TabsContent>
      </Tabs>
      <NewAppointmentDialog open={newOpen} onOpenChange={setNewOpen} />
    </div>
  );
}

function ListView({ canWrite }: { canWrite: boolean }) {
  const { data: appointments, isLoading } = useAppointments();
  const { data: resources } = useResources();
  const { data: products } = useProducts();
  const qc = useQueryClient();

  const resourceName = React.useMemo(
    () => new Map((resources ?? []).map((r) => [r.id, r.name])),
    [resources],
  );
  const productName = React.useMemo(
    () => new Map((products ?? []).map((p) => [p.id, p.name])),
    [products],
  );

  const confirm = useMutation({
    mutationFn: async (id: string) => apiClient.patch(`/api/v1/appointments/${id}`, { status: "confirmed" }),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: APPOINTMENTS_KEY }),
  });

  const [cancelling, setCancelling] = React.useState<Appointment | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  const upcoming = (appointments ?? []).filter((a) => a.status !== "cancelled");

  return (
    <div className="space-y-2">
      {!upcoming.length ? (
        <p className="text-sm text-muted-foreground">Nenhum agendamento ainda.</p>
      ) : (
        <ul className="space-y-2">
          {upcoming.map((a) => (
            <li key={a.id} className="flex items-start justify-between gap-4 rounded-md border bg-card p-4">
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">
                    {format(new Date(a.starts_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                  </span>
                  <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
                </div>
                <p className="text-sm text-muted-foreground">
                  {a.contact_name && <span className="text-foreground">{a.contact_name} · </span>}
                  {productName.get(a.product_id) ?? "Serviço"} · {resourceName.get(a.resource_id) ?? "Recurso"}
                </p>
                {a.notes && <p className="text-sm">{a.notes}</p>}
              </div>
              {canWrite && a.status !== "completed" && a.status !== "no_show" && (
                <div className="flex shrink-0 gap-1">
                  {a.status === "scheduled" && (
                    <Button type="button" variant="ghost" size="sm" onClick={() => confirm.mutate(a.id)}>
                      Confirmar
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Cancelar agendamento"
                    onClick={() => setCancelling(a)}
                  >
                    <X />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <CancelAppointmentDialog
        appointment={cancelling}
        open={!!cancelling}
        onOpenChange={(open) => {
          if (!open) setCancelling(null);
        }}
        onCancelled={() => toast.success("Agendamento cancelado.")}
      />
    </div>
  );
}
