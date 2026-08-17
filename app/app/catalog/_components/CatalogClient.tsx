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
import { Plus, PencilSimple, Trash } from "@/lib/ui/icons";
import { apiClient } from "@/lib/api/client";
import { formatCentsBRL } from "@/lib/money";
import { showApiError } from "@/components/feedback/ApiErrorToast";
import { useProducts, PRODUCTS_KEY, type Product } from "@/hooks/products/useProducts";
import { ProductFormDialog } from "./ProductFormDialog";

interface Props {
  canWrite: boolean;
}

export function CatalogClient({ canWrite }: Props) {
  const { data: products, isLoading } = useProducts();
  const qc = useQueryClient();
  const del = useMutation({
    mutationFn: async (id: string) => apiClient.delete(`/api/v1/products/${id}`),
    onError: showApiError,
    onSuccess: () => qc.invalidateQueries({ queryKey: PRODUCTS_KEY }),
  });
  const [formOpen, setFormOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<Product | null>(null);

  const openNew = () => {
    setEditing(null);
    setFormOpen(true);
  };
  const openEdit = (product: Product) => {
    setEditing(product);
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
            <Plus /> Novo item
          </Button>
        </div>
      )}
      {!products?.length ? (
        <p className="text-sm text-muted-foreground">Nenhum produto ou serviço cadastrado ainda.</p>
      ) : (
        <ul className="space-y-2">
          {products.map((product) => (
            <li
              key={product.id}
              className="flex items-start justify-between gap-4 rounded-md border bg-card p-4"
            >
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{product.name}</span>
                  <Badge variant={product.type === "service" ? "default" : "neutral"}>
                    {product.type === "service" ? "Serviço" : "Produto"}
                  </Badge>
                  {product.requires_scheduling && (
                    <Badge variant="neutral">Agendável · {product.duration_minutes} min</Badge>
                  )}
                  {!product.is_active && <Badge variant="destructive">Inativo</Badge>}
                </div>
                {product.description && (
                  <p className="line-clamp-2 text-sm text-muted-foreground">{product.description}</p>
                )}
                <p className="text-sm font-medium">{formatCentsBRL(product.price_cents)}</p>
              </div>
              {canWrite && (
                <div className="flex shrink-0 gap-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Editar item"
                    onClick={() => openEdit(product)}
                  >
                    <PencilSimple />
                  </Button>
                  <AlertDialog>
                    <AlertDialogTrigger asChild>
                      <Button type="button" variant="ghost" size="icon" aria-label="Excluir item">
                        <Trash />
                      </Button>
                    </AlertDialogTrigger>
                    <AlertDialogContent>
                      <AlertDialogHeader>
                        <AlertDialogTitle>Excluir este item do catálogo?</AlertDialogTitle>
                        <AlertDialogDescription>
                          Essa ação não pode ser desfeita. Se este item já tiver agendamentos, marque-o
                          como inativo em vez de excluir.
                        </AlertDialogDescription>
                      </AlertDialogHeader>
                      <AlertDialogFooter>
                        <AlertDialogCancel>Cancelar</AlertDialogCancel>
                        <AlertDialogAction
                          onClick={() =>
                            del.mutate(product.id, {
                              onSuccess: () => toast.success("Item excluído."),
                            })
                          }
                        >
                          Excluir
                        </AlertDialogAction>
                      </AlertDialogFooter>
                    </AlertDialogContent>
                  </AlertDialog>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
      <ProductFormDialog open={formOpen} onOpenChange={setFormOpen} product={editing} />
    </div>
  );
}
