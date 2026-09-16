import { describe, expect, it } from "vitest";

import { camposDoContato } from "./campos-personalizados";

describe("camposDoContato", () => {
  it("lê `contact_fields`, não `fields` — não é o mesmo leitor do funil", () => {
    expect(
      camposDoContato({
        contact_fields: [{ key: "endereco", label: "Endereço", type: "text" }],
        fields: [{ key: "outro_funil", label: "Não é isto", type: "text" }],
      }),
    ).toEqual([{ key: "endereco", label: "Endereço", type: "text" }]);
  });

  it("ignora entradas que não passam no schema", () => {
    expect(
      camposDoContato({
        contact_fields: [{ key: "endereco", label: "Endereço", type: "text" }, { key: "??" }],
      }),
    ).toEqual([{ key: "endereco", label: "Endereço", type: "text" }]);
  });

  it("settings nulo, vazio ou sem `contact_fields` vira lista vazia, não explode", () => {
    expect(camposDoContato(null)).toEqual([]);
    expect(camposDoContato(undefined)).toEqual([]);
    expect(camposDoContato({})).toEqual([]);
    expect(camposDoContato({ contact_fields: "lixo" })).toEqual([]);
  });
});
