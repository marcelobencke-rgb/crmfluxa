"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { apiClient } from "@/lib/api/client";
import { formatCentsBRL } from "@/lib/money";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import type { Resource } from "@/hooks/resources/useResources";
import { useProducts } from "@/hooks/products/useProducts";
import { useResourceServices, resourceServicesKey } from "@/hooks/resources/useResourceServices";
import {
  useResourceAvailability,
  resourceAvailabilityKey,
  type AvailabilitySlot,
} from "@/hooks/resources/useResourceAvailability";
import { GoogleCalendarTab } from "./GoogleCalendarTab";

interface Props {
  resource: Resource | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canWrite: boolean;
  /** Conexão com Google Agenda é admin-only (RLS crm_calendar_connections_admin_only). */
  isAdmin: boolean;
}

export function ResourceConfigSheet({ resource, open, onOpenChange, canWrite, isAdmin }: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full overflow-y-auto sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>{resource?.name ?? "Recurso"}</SheetTitle>
          <SheetDescription>Serviços que executa e horários em que atende.</SheetDescription>
        </SheetHeader>
        {resource && (
          <Tabs defaultValue="services" className="mt-4">
            <TabsList>
              <TabsTrigger value="services">Serviços</TabsTrigger>
              <TabsTrigger value="availability">Disponibilidade</TabsTrigger>
              {isAdmin && <TabsTrigger value="google">Google Agenda</TabsTrigger>}
            </TabsList>
            <TabsContent value="services" className="mt-4">
              <ServicesTab resourceId={resource.id} canWrite={canWrite} />
            </TabsContent>
            <TabsContent value="availability" className="mt-4">
              <AvailabilityTab resourceId={resource.id} canWrite={canWrite} />
            </TabsContent>
            {isAdmin && (
              <TabsContent value="google" className="mt-4">
                <GoogleCalendarTab resourceId={resource.id} />
              </TabsContent>
            )}
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ---------------------------------------------------------------------------
// Serviços — quais itens do catálogo (type='service') este recurso executa.
// ---------------------------------------------------------------------------

function ServicesTab({ resourceId, canWrite }: { resourceId: string; canWrite: boolean }) {
  const { data: products, isLoading: loadingProducts } = useProducts();
  const { data: links, isLoading: loadingLinks } = useResourceServices(resourceId);
  const qc = useQueryClient();

  const link = useMutation({
    mutationFn: async (productId: string) =>
      apiClient.post(`/api/v1/resources/${resourceId}/services`, { product_id: productId }),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceServicesKey(resourceId) }),
  });
  const unlink = useMutation({
    mutationFn: async (productId: string) =>
      apiClient.delete(`/api/v1/resources/${resourceId}/services/${productId}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: resourceServicesKey(resourceId) }),
  });

  if (loadingProducts || loadingLinks) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const services = (products ?? []).filter((p) => p.type === "service");
  const linkedProductIds = new Set((links ?? []).map((l) => l.product_id));

  if (!services.length) {
    return (
      <p className="text-sm text-muted-foreground">
        Nenhum serviço no catálogo ainda. Cadastre em Catálogo primeiro.
      </p>
    );
  }

  return (
    <ul className="space-y-2">
      {services.map((service) => {
        const linked = linkedProductIds.has(service.id);
        const pending = link.isPending || unlink.isPending;
        return (
          <li
            key={service.id}
            className="flex items-center justify-between gap-3 rounded-md border bg-card p-3"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{service.name}</p>
              <p className="text-xs text-muted-foreground">
                {formatCentsBRL(service.price_cents)}
                {service.duration_minutes ? ` · ${service.duration_minutes} min` : ""}
              </p>
            </div>
            <Switch
              checked={linked}
              disabled={!canWrite || pending}
              onCheckedChange={(checked) =>
                checked ? link.mutate(service.id) : unlink.mutate(service.id)
              }
              aria-label={`${service.name} — este recurso executa`}
            />
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Disponibilidade — grade semanal recorrente.
// ---------------------------------------------------------------------------

const WEEKDAY_LABELS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface DayState {
  enabled: boolean;
  start: string;
  end: string;
}

function initialDayState(slots: AvailabilitySlot[] | undefined): DayState[] {
  return WEEKDAY_LABELS.map((_, weekday) => {
    const slot = slots?.find((s) => s.weekday === weekday);
    return slot
      ? { enabled: true, start: slot.start_time.slice(0, 5), end: slot.end_time.slice(0, 5) }
      : { enabled: false, start: "09:00", end: "18:00" };
  });
}

function AvailabilityTab({ resourceId, canWrite }: { resourceId: string; canWrite: boolean }) {
  const { data: slots, isLoading } = useResourceAvailability(resourceId);
  const qc = useQueryClient();
  const [days, setDays] = React.useState<DayState[]>(() => initialDayState(undefined));

  React.useEffect(() => {
    if (slots) setDays(initialDayState(slots));
  }, [slots]);

  const replace = useMutation({
    mutationFn: async (body: { slots: Array<{ weekday: number; start_time: string; end_time: string }> }) =>
      apiClient.put(`/api/v1/resources/${resourceId}/availability`, body),
    onError: showApiError,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: resourceAvailabilityKey(resourceId) });
      toast.success("Disponibilidade atualizada.");
    },
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-10 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    );
  }

  const updateDay = (weekday: number, patch: Partial<DayState>) => {
    setDays((prev) => prev.map((d, i) => (i === weekday ? { ...d, ...patch } : d)));
  };

  const onSave = () => {
    const invalid = days.some((d) => d.enabled && d.start >= d.end);
    if (invalid) {
      toast.error("Horário de início precisa ser antes do de término.");
      return;
    }
    replace.mutate({
      slots: days
        .map((d, weekday) => ({ ...d, weekday }))
        .filter((d) => d.enabled)
        .map((d) => ({ weekday: d.weekday, start_time: d.start, end_time: d.end })),
    });
  };

  return (
    <div className="space-y-4">
      <ul className="space-y-2">
        {WEEKDAY_LABELS.map((label, weekday) => {
          const day = days[weekday] ?? { enabled: false, start: "09:00", end: "18:00" };
          return (
            <li key={label} className="flex items-center gap-3 rounded-md border bg-card p-3">
              <Switch
                checked={day.enabled}
                disabled={!canWrite}
                onCheckedChange={(checked) => updateDay(weekday, { enabled: checked })}
                aria-label={`Atende ${label}`}
              />
              <span className="w-24 shrink-0 text-sm font-medium">{label}</span>
              {day.enabled && (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={day.start}
                    disabled={!canWrite}
                    onChange={(e) => updateDay(weekday, { start: e.target.value })}
                    className="rounded-md border bg-transparent px-2 py-1 text-sm"
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="time"
                    value={day.end}
                    disabled={!canWrite}
                    onChange={(e) => updateDay(weekday, { end: e.target.value })}
                    className="rounded-md border bg-transparent px-2 py-1 text-sm"
                  />
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {canWrite && (
        <Button type="button" onClick={onSave} disabled={replace.isPending}>
          Salvar disponibilidade
        </Button>
      )}
    </div>
  );
}
