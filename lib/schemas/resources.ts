import { z } from "zod";

/**
 * Zod schemas for `/api/v1/resources/*` (spec 18 — recursos agendáveis:
 * profissionais, salas, equipamentos).
 */
export const createResourceSchema = z.object({
  type: z.enum(["professional", "room", "equipment"]),
  name: z.string().trim().min(1).max(200),
  user_id: z.string().uuid().nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .nullable()
    .optional(),
  is_active: z.boolean().default(true),
});
export type CreateResourceInput = z.infer<typeof createResourceSchema>;

export const updateResourceSchema = z
  .object({
    type: z.enum(["professional", "room", "equipment"]),
    name: z.string().trim().min(1).max(200),
    user_id: z.string().uuid().nullable(),
    color: z.string().regex(/^#[0-9a-fA-F]{6}$/).nullable(),
    is_active: z.boolean(),
  })
  .partial()
  .refine((d) => Object.keys(d).length > 0, { message: "Informe ao menos um campo." });
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;

/** POST /api/v1/resources/[id]/services — vincula um serviço do catálogo ao recurso. */
export const linkResourceServiceSchema = z.object({
  product_id: z.string().uuid(),
  duration_minutes_override: z.coerce.number().int().positive().nullable().optional(),
  price_cents_override: z.coerce.number().int().nonnegative().nullable().optional(),
});
export type LinkResourceServiceInput = z.infer<typeof linkResourceServiceSchema>;

/**
 * PUT /api/v1/resources/[id]/availability — substitui a grade semanal inteira
 * (idempotente: manda o conjunto completo, o servidor faz delete+insert).
 */
const availabilitySlotSchema = z
  .object({
    weekday: z.number().int().min(0).max(6),
    start_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato HH:MM"),
    end_time: z.string().regex(/^\d{2}:\d{2}(:\d{2})?$/, "Formato HH:MM"),
  })
  .refine((s) => s.start_time < s.end_time, {
    message: "Horário de início precisa ser antes do de término.",
    path: ["end_time"],
  });

export const replaceAvailabilitySchema = z.object({
  slots: z.array(availabilitySlotSchema).max(50),
});
export type ReplaceAvailabilityInput = z.infer<typeof replaceAvailabilitySchema>;
