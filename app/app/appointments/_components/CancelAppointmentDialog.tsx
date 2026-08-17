"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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

interface Props {
  appointment: Appointment | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCancelled: () => void;
}

export function CancelAppointmentDialog({ appointment, open, onOpenChange, onCancelled }: Props) {
  const [reason, setReason] = React.useState("");
  const qc = useQueryClient();

  React.useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const cancel = useMutation({
    mutationFn: async () =>
      apiClient.patch(`/api/v1/appointments/${appointment!.id}`, {
        status: "cancelled",
        cancel_reason: reason,
      }),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: APPOINTMENTS_KEY });
      onOpenChange(false);
      onCancelled();
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) return;
    cancel.mutate();
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Cancelar agendamento</DialogTitle>
          <DialogDescription>Essa ação não pode ser desfeita. Diga por que está cancelando.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cancel-reason">Motivo</Label>
            <Textarea
              id="cancel-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Cliente pediu para remarcar depois"
              minLength={1}
              maxLength={500}
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Voltar
            </Button>
            <Button type="submit" variant="destructive" disabled={cancel.isPending || !reason.trim()}>
              Cancelar agendamento
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
