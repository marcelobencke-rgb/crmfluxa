"use client";
import * as React from "react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import { dateStrOf, minutesOfDay, minutesToIso } from "@/lib/scheduling/day-grid";
import { useResources } from "@/hooks/resources/useResources";
import { useProducts } from "@/hooks/products/useProducts";
import { useConfirmAppointment, useUpdateAppointmentDetails } from "@/hooks/appointments/useRescheduleAppointment";
import type { Appointment } from "@/hooks/appointments/useAppointments";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/appointments/status";

interface Props {
  appointment: Appointment | null;
  open: boolean;
  canWrite: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fecha este diálogo e abre o de cancelamento — mesmo padrão do botão "Cancelar" da lista. */
  onRequestCancel: (appointment: Appointment) => void;
}

function minutesToTimeInput(min: number): string {
  return `${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function timeInputToMinutes(value: string): number {
  const [h, m] = value.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

/**
 * Edição de um agendamento já criado. Recurso, serviço e contato aparecem só como
 * leitura — decisão deliberada, não falta de UI: ver o comentário grande em
 * updateAppointmentHandler (app/api/v1/appointments/_handler.ts) sobre por que trocar
 * esses campos depois de criado quebra a referência que a IA guarda por ID e a timeline
 * do lead. O que dá pra editar aqui é o mesmo que o arrastar/redimensionar da agenda já
 * fazem (horário e duração) mais a nota — só que num formulário, pra quem não for
 * arrastar o card.
 */
export function EditAppointmentDialog({ appointment, open, canWrite, onOpenChange, onRequestCancel }: Props) {
  const { data: resources } = useResources();
  const { data: products } = useProducts();
  const confirm = useConfirmAppointment();
  const update = useUpdateAppointmentDetails();

  const [dateStr, setDateStr] = React.useState("");
  const [timeStr, setTimeStr] = React.useState("");
  // Texto livre, não número — um <input type="number"> controlado que já chega
  // "corrigido" (ex.: Math.max num onChange) briga com a digitação: ao teclar o "4" de
  // "45", o valor intermediário (4) fica menor que o piso e é reescrito pra "15" antes do
  // "5" ser digitado. Guardando o texto puro e só interpretando pra number no uso (save,
  // comparação de mudança), a digitação nunca é interrompida.
  const [durationText, setDurationText] = React.useState("30");
  const [notes, setNotes] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!appointment) return;
    const durationMs = new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime();
    setDateStr(dateStrOf(appointment.starts_at));
    setTimeStr(minutesToTimeInput(minutesOfDay(appointment.starts_at)));
    setDurationText(String(Math.max(1, Math.round(durationMs / 60_000))));
    setNotes(appointment.notes ?? "");
  }, [appointment]);

  if (!appointment) return null;

  const resourceName = (resources ?? []).find((r) => r.id === appointment.resource_id)?.name ?? "Recurso";
  const productName = (products ?? []).find((p) => p.id === appointment.product_id)?.name ?? "Serviço";

  const originalStart = minutesToTimeInput(minutesOfDay(appointment.starts_at));
  const originalDate = dateStrOf(appointment.starts_at);
  const originalDuration = Math.round(
    (new Date(appointment.ends_at).getTime() - new Date(appointment.starts_at).getTime()) / 60_000,
  );
  const durationMin = Math.round(Number(durationText));
  const durationValid = Number.isFinite(durationMin) && durationMin > 0;
  const hasChanges =
    dateStr !== originalDate ||
    timeStr !== originalStart ||
    (durationValid && durationMin !== originalDuration) ||
    notes !== (appointment.notes ?? "");

  async function handleSave() {
    if (!appointment || !durationValid) return;
    setSaving(true);
    try {
      const body: { starts_at?: string; ends_at?: string; notes?: string | null } = {};
      const startsAtChanged = dateStr !== originalDate || timeStr !== originalStart;
      const newStartsAt = startsAtChanged ? minutesToIso(dateStr, timeInputToMinutes(timeStr)) : appointment.starts_at;
      if (startsAtChanged) body.starts_at = newStartsAt;
      if (startsAtChanged || durationMin !== originalDuration) {
        const baseMinutes = timeInputToMinutes(timeStr);
        body.ends_at = minutesToIso(dateStr, baseMinutes + durationMin);
      }
      if (notes !== (appointment.notes ?? "")) body.notes = notes.trim() || null;
      if (Object.keys(body).length === 0) return;
      await update(appointment, body);
      onOpenChange(false);
    } catch {
      // toast já mostrado pelo hook
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {productName}
            <Badge variant={STATUS_VARIANT[appointment.status]}>{STATUS_LABEL[appointment.status]}</Badge>
          </DialogTitle>
          <DialogDescription>
            {appointment.contact_name ? `${appointment.contact_name} · ` : ""}
            {resourceName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Serviço, recurso e contato não dão pra trocar por aqui — evita desalinhar o histórico do contato e
            automações que se referem a este agendamento. Pra mudar isso, cancele e crie um novo.
          </p>

          <div className="grid grid-cols-3 gap-2">
            <div className="space-y-2">
              <Label htmlFor="edit-appt-date">Data</Label>
              <input
                id="edit-appt-date"
                type="date"
                value={dateStr}
                disabled={!canWrite}
                onChange={(e) => setDateStr(e.target.value)}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-appt-time">Início</Label>
              <input
                id="edit-appt-time"
                type="time"
                step={900}
                value={timeStr}
                disabled={!canWrite}
                onChange={(e) => setTimeStr(e.target.value)}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-60"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-appt-duration">Duração (min)</Label>
              <input
                id="edit-appt-duration"
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={durationText}
                disabled={!canWrite}
                onChange={(e) => setDurationText(e.target.value)}
                aria-invalid={!durationValid}
                className="w-full rounded-md border bg-transparent px-3 py-2 text-sm disabled:opacity-60 aria-invalid:border-destructive"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="edit-appt-notes">Notas</Label>
            <Textarea
              id="edit-appt-notes"
              value={notes}
              disabled={!canWrite}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              maxLength={2000}
            />
          </div>
        </div>

        <DialogFooter className="flex-wrap gap-2 sm:justify-between">
          <div className="flex gap-2">
            {canWrite && appointment.status !== "completed" && appointment.status !== "no_show" && appointment.status !== "cancelled" && (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:text-destructive"
                onClick={() => onRequestCancel(appointment)}
              >
                Cancelar agendamento
              </Button>
            )}
            {canWrite && appointment.status === "scheduled" && (
              <Button type="button" variant="outline" onClick={() => confirm(appointment).catch(() => {})}>
                Confirmar
              </Button>
            )}
          </div>
          <div className="flex gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Fechar
            </Button>
            {canWrite && (
              <Button type="button" disabled={!hasChanges || !durationValid || saving} onClick={() => void handleSave()}>
                Salvar
              </Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
