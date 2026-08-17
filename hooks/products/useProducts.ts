"use client";
import { useQuery } from "@tanstack/react-query";
import { apiClient } from "@/lib/api/client";

export interface Product {
  id: string;
  organization_id: string;
  type: "product" | "service";
  name: string;
  description: string | null;
  price_cents: number;
  currency: string | null;
  sku: string | null;
  requires_scheduling: boolean;
  duration_minutes: number | null;
  tags: string[];
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export const PRODUCTS_KEY = ["crm-products"];

/** Spec 18 — catálogo de produtos/serviços. */
export function useProducts() {
  return useQuery({
    queryKey: PRODUCTS_KEY,
    queryFn: async () => apiClient.get<{ data: Product[] }>("/api/v1/products"),
    staleTime: 30_000,
    select: (res) => res.data,
  });
}
