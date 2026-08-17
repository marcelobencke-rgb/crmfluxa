import { z } from "zod";

/**
 * Zod schemas for `/api/v1/products/*` (spec 18 — catálogo de produtos/serviços).
 * `custom_fields`, `tags` GIN, `rag_indexed_at`/`rag_chunk_count` são geridos pelo
 * servidor/worker de indexação — não entram no input do cliente.
 */
export const createProductSchema = z
  .object({
    type: z.enum(["product", "service"]),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable().optional(),
    price_cents: z.coerce.number().int().nonnegative(),
    currency: z.string().length(3).default("BRL"),
    sku: z.string().trim().max(100).nullable().optional(),
    requires_scheduling: z.boolean().default(false),
    duration_minutes: z.coerce.number().int().positive().nullable().optional(),
    is_active: z.boolean().default(true),
  })
  .refine((d) => !d.requires_scheduling || !!d.duration_minutes, {
    message: "Serviço com agendamento precisa de duração (duration_minutes).",
    path: ["duration_minutes"],
  });
export type CreateProductInput = z.infer<typeof createProductSchema>;

export const updateProductSchema = z
  .object({
    type: z.enum(["product", "service"]),
    name: z.string().trim().min(1).max(200),
    description: z.string().trim().max(2000).nullable(),
    price_cents: z.coerce.number().int().nonnegative(),
    currency: z.string().length(3),
    sku: z.string().trim().max(100).nullable(),
    requires_scheduling: z.boolean(),
    duration_minutes: z.coerce.number().int().positive().nullable(),
    is_active: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." })
  .refine((d) => d.requires_scheduling !== true || d.duration_minutes !== null, {
    message: "Serviço com agendamento precisa de duração (duration_minutes).",
    path: ["duration_minutes"],
  });
export type UpdateProductInput = z.infer<typeof updateProductSchema>;
