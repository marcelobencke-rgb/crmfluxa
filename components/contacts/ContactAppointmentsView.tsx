"use client";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAppointmentsByContact } from "@/hooks/appointments/useAppointmentsByContact";
import { useResources } from "@/hooks/resources/useResources";
import { useProducts } from "@/hooks/products/useProducts";
import { STATUS_LABEL, STATUS_VARIANT } from "@/lib/appointments/status";

interface Props {
  contactId: string;
}

/**
 * Histórico de agendamentos do contato — independente de negócio (lead). Existe porque
 * `crm_lead_activities`/timeline (migration 0146) exige `lead_id NOT NULL`: um
 * agendamento vinculado só ao contato (sem negócio ativo, o caso comum em clínica/
 * salão) nunca aparece na aba Timeline. Consulta `crm_appointments` direto por
 * `contact_id` (migration 0148 mantém a coluna sempre populada), sem depender daquela
 * infraestrutura.
 */
export function ContactAppointmentsView({ contactId }: Props) {
  const { data: appointments, isLoading } = useAppointmentsByContact(contactId);
  const { data: resources } = useResources();
  const { data: products } = useProducts();

  const resourceName = new Map((resources ?? []).map((r) => [r.id, r.name]));
  const productName = new Map((products ?? []).map((p) => [p.id, p.name]));

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!appointments?.length) {
    return (
      <Card className="p-6 text-center text-sm text-muted-foreground">
        Nenhum agendamento para este contato ainda.
      </Card>
    );
  }

  return (
    <ul className="space-y-2">
      {appointments.map((a) => (
        <li key={a.id} className="rounded-md border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium">
              {format(new Date(a.starts_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
            </span>
            <Badge variant={STATUS_VARIANT[a.status]}>{STATUS_LABEL[a.status]}</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {productName.get(a.product_id) ?? "Serviço"} · {resourceName.get(a.resource_id) ?? "Recurso"}
          </p>
          {a.notes && <p className="mt-1 text-sm">{a.notes}</p>}
        </li>
      ))}
    </ul>
  );
}
