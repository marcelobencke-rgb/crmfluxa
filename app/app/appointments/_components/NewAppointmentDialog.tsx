"use client";
import * as React from "react";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { APPOINTMENTS_KEY, type Appointment } from "@/hooks/appointments/useAppointments";
import { useResources } from "@/hooks/resources/useResources";
import { useResourceServices } from "@/hooks/resources/useResourceServices";
import { useAvailableSlots } from "@/hooks/appointments/useAvailableSlots";
import { cn } from "@/lib/utils";
import { ContactSelector } from "@/components/contacts/ContactSelector";
import { LeadPicker } from "./LeadPicker";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function todayDateStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function NewAppointmentDialog({ open, onOpenChange }: Props) {
  const { data: resources } = useResources();
  const [resourceId, setResourceId] = React.useState<string | null>(null);
  const [productId, setProductId] = React.useState<string | null>(null);
  const [date, setDate] = React.useState(todayDateStr());
  const [selectedSlot, setSelectedSlot] = React.useState<string | null>(null);
  const [lead, setLead] = React.useState<{ id: string; title: string } | null>(null);
  const [contactId, setContactId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!open) return;
    setResourceId(null);
    setProductId(null);
    setDate(todayDateStr());
    setSelectedSlot(null);
    setLead(null);
    setContactId(null);
  }, [open]);

  const { data: resourceServices, isLoading: loadingServices } = useResourceServices(resourceId);
  const schedulableServices = (resourceServices ?? []).filter((s) => s.product?.duration_minutes != null);

  const { data: slots, isLoading: loadingSlots } = useAvailableSlots({
    resourceId,
    productId,
    dateFrom: date || null,
    dateTo: date || null,
  });

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async () =>
      apiClient.post<{ data: Appointment }>("/api/v1/appointments", {
        resource_id: resourceId,
        product_id: productId,
        starts_at: selectedSlot,
        lead_id: lead?.id,
        contact_id: !lead ? contactId : undefined,
      }),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      toast.success("Agendamento criado.");
      onOpenChange(false);
    },
  });

  const activeResources = (resources ?? []).filter((r) => r.is_active);
  const canConfirm = !!resourceId && !!productId && !!selectedSlot;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Novo agendamento</DialogTitle>
          <DialogDescription>Escolha o recurso, o serviço e um horário livre.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="appt-resource">Recurso</Label>
            <Select
              value={resourceId ?? undefined}
              onValueChange={(v) => {
                setResourceId(v);
                setProductId(null);
                setSelectedSlot(null);
              }}
            >
              <SelectTrigger id="appt-resource">
                <SelectValue placeholder="Selecione um recurso" />
              </SelectTrigger>
              <SelectContent>
                {activeResources.map((r) => (
                  <SelectItem key={r.id} value={r.id}>
                    {r.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {resourceId && (
            <div className="space-y-2">
              <Label htmlFor="appt-service">Serviço</Label>
              {loadingServices ? (
                <p className="text-sm text-muted-foreground">Carregando…</p>
              ) : !schedulableServices.length ? (
                <p className="text-sm text-muted-foreground">
                  Este recurso não executa nenhum serviço agendável ainda. Configure em Recursos.
                </p>
              ) : (
                <Select
                  value={productId ?? undefined}
                  onValueChange={(v) => {
                    setProductId(v);
                    setSelectedSlot(null);
                  }}
                >
                  <SelectTrigger id="appt-service">
                    <SelectValue placeholder="Selecione um serviço" />
                  </SelectTrigger>
                  <SelectContent>
                    {schedulableServices.map((s) => (
                      <SelectItem key={s.product_id} value={s.product_id}>
                        {s.product?.name} ({s.duration_minutes_override ?? s.product?.duration_minutes} min)
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          )}

          {productId && (
            <div className="space-y-2">
              <Label htmlFor="appt-date">Data</Label>
              <input
                id="appt-date"
                type="date"
                value={date}
                min={todayDateStr()}
                onChange={(e) => {
                  setDate(e.target.value);
                  setSelectedSlot(null);
                }}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm"
              />
            </div>
          )}

          {productId && date && (
            <div className="space-y-2">
              <Label>Horário</Label>
              {loadingSlots ? (
                <p className="text-sm text-muted-foreground">Buscando horários livres…</p>
              ) : !slots?.length ? (
                <p className="text-sm text-muted-foreground">Nenhum horário livre neste dia.</p>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {slots.map((s) => (
                    <button
                      key={s.slot_start}
                      type="button"
                      onClick={() => setSelectedSlot(s.slot_start)}
                      className={cn(
                        "rounded-md border px-3 py-1.5 text-sm",
                        selectedSlot === s.slot_start
                          ? "border-accent bg-accent-soft text-accent"
                          : "hover:bg-surface-elevated",
                      )}
                    >
                      {format(new Date(s.slot_start), "HH:mm", { locale: ptBR })}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="space-y-2">
            <Label>Negócio (lead)</Label>
            <LeadPicker
              value={lead}
              onChange={(l) => {
                setLead(l);
                if (l) setContactId(null);
              }}
            />
            <p className="text-xs text-muted-foreground">
              Vincular a um negócio faz o agendamento aparecer na timeline dele — o contato é
              preenchido sozinho a partir do negócio.
            </p>
          </div>

          {!lead && (
            <div className="space-y-2">
              <Label>Ou só o contato (sem negócio)</Label>
              <ContactSelector value={contactId} onChange={setContactId} />
              <p className="text-xs text-muted-foreground">
                Pra quando o agendamento não faz parte de um funil de vendas — ainda assim
                aparece no histórico do contato.
              </p>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" disabled={!canConfirm || create.isPending} onClick={() => create.mutate()}>
            Confirmar agendamento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
