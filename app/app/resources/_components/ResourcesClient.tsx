"use client";
import * as React from "react";
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
import { Plus, PencilSimple, Trash, Gear } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useResources, RESOURCES_KEY, type Resource } from "@/hooks/resources/useResources";
import { ResourceFormDialog } from "./ResourceFormDialog";
import { ResourceConfigSheet } from "./ResourceConfigSheet";

const TYPE_LABEL: Record<Resource["type"], string> = {
  professional: "Profissional",
  room: "Sala",
  equipment: "Equipamento",
};

interface Props {
  canWrite: boolean;
  isAdmin: boolean;
}

export function ResourcesClient({ canWrite, isAdmin }: Props) {
  const { data: resources, isLoading } = useResources();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/resources/${id}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: RESOURCES_KEY }),
  });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Resource | null>(null);
  const [configuring, setConfiguring] = React.useState<Resource | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (resource: Resource) => {
    setEditing(resource);
    setFormOpen(true);
  };

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {canWrite && (
        <div className="flex justify-end">
          <Button type="button" onClick={openNew}>
            <Plus /> Novo recurso
          </Button>
        </div>
      )}
      {!resources?.length ? (
        <p className="text-sm text-muted-foreground">Nenhum recurso cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {resources.map((resource) => (
            <li
              key={resource.id}
              className="flex items-start justify-between gap-4 rounded-md border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  {resource.color && (
                    <span
                      className="inline-block h-3 w-3 shrink-0 rounded-full border"
                      style={{ backgroundColor: resource.color }}
                      aria-hidden
                    />
                  )}
                  <span className="font-medium">{resource.name}</span>
                  <Badge variant="neutral">{TYPE_LABEL[resource.type]}</Badge>
                  {!resource.is_active && <Badge variant="destructive">Inativo</Badge>}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label="Configurar serviços e disponibilidade"
                  onClick={() => setConfiguring(resource)}
                >
                  <Gear />
                </Button>
                {canWrite && (
                  <>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label="Editar recurso"
                      onClick={() => openEdit(resource)}
                    >
                      <PencilSimple />
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button type="button" variant="ghost" size="icon" aria-label="Excluir recurso">
                          <Trash />
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Excluir este recurso?</AlertDialogTitle>
                          <AlertDialogDescription>
                            Essa ação não pode ser desfeita. Se este recurso já tiver agendamentos, marque-o
                            como inativo em vez de excluir.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancelar</AlertDialogCancel>
                          <AlertDialogAction
                            onClick={() =>
                              del.mutate(resource.id, {
                                onSuccess: () => toast.success("Recurso excluído."),
                              })
                            }
                          >
                            Excluir
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
      <ResourceFormDialog open={formOpen} onOpenChange={setFormOpen} resource={editing} />
      <ResourceConfigSheet
        resource={configuring}
        open={!!configuring}
        onOpenChange={(open) => !open && setConfiguring(null)}
        canWrite={canWrite}
        isAdmin={isAdmin}
      />
    </div>
  );
}
