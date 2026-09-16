"use client";
import { useQuery } from "@tanstack/react-query";

import { apiClient } from "@/lib/api/client";
import type { CustomFieldDef } from "@/lib/schemas/settings";

/**
 * As definições de campo personalizado da FICHA DO CONTATO
 * (`organizations.settings.contact_fields`) — independentes de qual funil é
 * o padrão. Ver `lib/contacts/campos-personalizados.ts` para o porquê da
 * separação.
 */
export function useContactFieldDefs(enabled = true) {
  return useQuery({
    queryKey: ["contact-field-defs"],
    enabled,
    staleTime: 60_000,
    queryFn: async (): Promise<CustomFieldDef[]> => {
      const res = await apiClient.get<{ data: { fields: CustomFieldDef[] } }>(
        "/api/v1/settings/contact-fields",
      );
      return res.data.fields;
    },
  });
}
