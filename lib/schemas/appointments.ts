import { z } from "zod";

/**
 * Zod schemas for `/api/v1/appointments/*` (spec 18 §5/§6).
 */
const isoInstant = z
  .string()
  .refine((s) => !Number.isNaN(Date.parse(s)), "Data/hora inválida (use ISO 8601).");

export const createAppointmentSchema = z.object({
  resource_id: z.string().uuid(),
  product_id: z.string().uuid(),
  starts_at: isoInstant,
  lead_id: z.string().uuid().nullable().optional(),
  contact_id: z.string().uuid().nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
});
export type CreateAppointmentInput = z.infer<typeof createAppointmentSchema>;

export const updateAppointmentSchema = z
  .object({
    starts_at: isoInstant,
    /** Redimensionar (mudar duração) manda só `ends_at` — sem `starts_at` junto. */
    ends_at: isoInstant,
    status: z.enum(["confirmed", "completed", "cancelled", "no_show"]),
    cancel_reason: z.string().trim().min(1).max(500),
    /**
     * Único campo de "conteúdo" editável no diálogo de edição — resource_id, product_id,
     * lead_id e contact_id são deliberadamente imutáveis por aqui. Ver comentário em
     * updateAppointmentHandler (_handler.ts) pro porquê.
     */
    notes: z.string().trim().max(2000).nullable(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." })
  .refine((d) => d.status !== "cancelled" || !!d.cancel_reason, {
    message: "Cancelamento exige motivo (cancel_reason).",
    path: ["cancel_reason"],
  })
  .refine((d) => !d.starts_at || !d.ends_at || Date.parse(d.ends_at) > Date.parse(d.starts_at), {
    message: "ends_at precisa ser depois de starts_at.",
    path: ["ends_at"],
  });
export type UpdateAppointmentInput = z.infer<typeof updateAppointmentSchema>;

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");

export const availableSlotsQuerySchema = z
  .object({
    resource_id: z.string().uuid().optional(),
    product_id: z.string().uuid(),
    date_from: dateOnly,
    date_to: dateOnly,
  })
  .refine((d) => d.date_from <= d.date_to, {
    message: "date_to precisa ser igual ou depois de date_from.",
    path: ["date_to"],
  });
export type AvailableSlotsQuery = z.infer<typeof availableSlotsQuerySchema>;
