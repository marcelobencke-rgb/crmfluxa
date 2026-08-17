"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
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
import { RESOURCES_KEY, type Resource } from "@/hooks/resources/useResources";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  resource?: Resource | null;
}

const DEFAULT_COLOR = "#6366f1";

export function ResourceFormDialog({ open, onOpenChange, resource }: Props) {
  const isEdit = !!resource;
  const [type, setType] = React.useState<Resource["type"]>("professional");
  const [name, setName] = React.useState("");
  const [color, setColor] = React.useState(DEFAULT_COLOR);
  const [isActive, setIsActive] = React.useState(true);

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      apiClient.post<{ data: Resource }>("/api/v1/resources", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: RESOURCES_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      apiClient.patch<{ data: Resource }>(`/api/v1/resources/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: RESOURCES_KEY }),
  });
  const pending = create.isPending || update.isPending;

  React.useEffect(() => {
    if (!open) return;
    setType(resource?.type ?? "professional");
    setName(resource?.name ?? "");
    setColor(resource?.color ?? DEFAULT_COLOR);
    setIsActive(resource?.is_active ?? true);
  }, [open, resource]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload = { type, name, color, is_active: isActive };
    try {
      if (isEdit) {
        await update.mutateAsync({ id: resource.id, ...payload });
        toast.success("Recurso atualizado.");
      } else {
        await create.mutateAsync(payload);
        toast.success("Recurso criado.");
      }
      onOpenChange(false);
    } catch {
      /* erro já mostrado pelo showApiError */
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar recurso" : "Novo recurso"}</DialogTitle>
          <DialogDescription>Profissional, sala ou equipamento agendável.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="res-type">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as Resource["type"])}>
              <SelectTrigger id="res-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="professional">Profissional</SelectItem>
                <SelectItem value="room">Sala</SelectItem>
                <SelectItem value="equipment">Equipamento</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-name">Nome</Label>
            <Input
              id="res-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ana (cabeleireira)"
              minLength={1}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="res-color">Cor na agenda</Label>
            <div className="flex items-center gap-2">
              <input
                id="res-color"
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="h-9 w-14 cursor-pointer rounded-md border bg-transparent p-1"
              />
              <span className="text-sm text-muted-foreground">{color}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id="res-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="res-active">Ativo</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? "Salvar" : "Criar recurso"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
