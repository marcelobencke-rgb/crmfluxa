"use client";
import * as React from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
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
import { parseReaisToCents, formatCentsBRL } from "@/lib/money";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { PRODUCTS_KEY, type Product } from "@/hooks/products/useProducts";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
}

export function ProductFormDialog({ open, onOpenChange, product }: Props) {
  const isEdit = !!product;
  const [type, setType] = React.useState<"product" | "service">("service");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [priceInput, setPriceInput] = React.useState("");
  const [requiresScheduling, setRequiresScheduling] = React.useState(false);
  const [durationMinutes, setDurationMinutes] = React.useState("");
  const [isActive, setIsActive] = React.useState(true);

  const qc = useQueryClient();
  const create = useMutation({
    mutationFn: async (input: Record<string, unknown>) =>
      apiClient.post<{ data: Product }>("/api/v1/products", input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
  const update = useMutation({
    mutationFn: async ({ id, ...input }: { id: string } & Record<string, unknown>) =>
      apiClient.patch<{ data: Product }>(`/api/v1/products/${id}`, input),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
  const pending = create.isPending || update.isPending;

  React.useEffect(() => {
    if (!open) return;
    setType(product?.type ?? "service");
    setName(product?.name ?? "");
    setDescription(product?.description ?? "");
    setPriceInput(product ? formatCentsBRL(product.price_cents).replace(/[^\d,]/g, "") : "");
    setRequiresScheduling(product?.requires_scheduling ?? false);
    setDurationMinutes(product?.duration_minutes ? String(product.duration_minutes) : "");
    setIsActive(product?.is_active ?? true);
  }, [open, product]);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const priceCents = parseReaisToCents(priceInput);
    if (priceCents === null) {
      toast.error("Preço inválido.");
      return;
    }
    if (requiresScheduling && !durationMinutes) {
      toast.error("Informe a duração para um serviço agendável.");
      return;
    }

    const payload = {
      type,
      name,
      description: description.trim() || null,
      price_cents: priceCents,
      requires_scheduling: requiresScheduling,
      duration_minutes: requiresScheduling ? Number(durationMinutes) : null,
      is_active: isActive,
    };

    try {
      if (isEdit) {
        await update.mutateAsync({ id: product.id, ...payload });
        toast.success("Item atualizado.");
      } else {
        await create.mutateAsync(payload);
        toast.success("Item criado.");
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
          <DialogTitle>{isEdit ? "Editar item" : "Novo item do catálogo"}</DialogTitle>
          <DialogDescription>Produtos e serviços que sua empresa vende.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="prod-type">Tipo</Label>
            <Select value={type} onValueChange={(v) => setType(v as "product" | "service")}>
              <SelectTrigger id="prod-type">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="product">Produto</SelectItem>
                <SelectItem value="service">Serviço</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-name">Nome</Label>
            <Input
              id="prod-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Corte de cabelo"
              minLength={1}
              maxLength={200}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-description">Descrição (opcional)</Label>
            <Textarea
              id="prod-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
              rows={3}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="prod-price">Preço</Label>
            <Input
              id="prod-price"
              value={priceInput}
              onChange={(e) => setPriceInput(e.target.value)}
              placeholder="49,90"
              inputMode="decimal"
              required
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="prod-scheduling" checked={requiresScheduling} onCheckedChange={setRequiresScheduling} />
            <Label htmlFor="prod-scheduling">Exige agendamento</Label>
          </div>
          {requiresScheduling && (
            <div className="space-y-2">
              <Label htmlFor="prod-duration">Duração (minutos)</Label>
              <Input
                id="prod-duration"
                type="number"
                min={1}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(e.target.value)}
                placeholder="30"
                required
              />
            </div>
          )}
          <div className="flex items-center gap-2">
            <Switch id="prod-active" checked={isActive} onCheckedChange={setIsActive} />
            <Label htmlFor="prod-active">Ativo</Label>
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {isEdit ? "Salvar" : "Criar item"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
