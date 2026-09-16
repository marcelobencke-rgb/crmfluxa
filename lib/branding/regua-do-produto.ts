/**
 * A régua do design system, congelada em módulo — a fonte da derivação em RUNTIME.
 *
 * POR QUE ESTE ARQUIVO EXISTE, e não um `readFileSync("app/globals.css")`:
 *
 * A imagem de produção é `output: "standalone"` (next.config.ts) e o Dockerfile
 * copia para o runner apenas `.next/standalone`, `.next/static` e `public/`. O
 * `app/globals.css` NÃO existe no contêiner que o self-hoster roda. Um
 * `readFileSync` no caminho de render do `app/layout.tsx` daria ENOENT — 500 em
 * todas as telas, na VPS de quem a feature existe para servir, e verde em dev,
 * em teste e na Vercel. É o mesmo modo de falha que `lib/branding.ts` documenta
 * para o `NEXT_PUBLIC_*`.
 *
 * A separação também é a certa conceitualmente: a RÉGUA é do produto e nasce
 * congelada no build; a COR é da instalação e só existe em runtime. Só a segunda
 * precisa ser lida do ambiente.
 *
 * ESTE ARQUIVO É GERADO. Não edite à mão: ele é o `extrairRegua()` aplicado ao
 * `app/globals.css`. `tests/unit/branding-regua-do-produto.test.ts` compara os
 * dois a cada run e imprime o literal novo na mensagem de falha — mexeu na
 * paleta, o teste reprova e entrega o texto para colar aqui.
 */

import type { Regua } from "./contraste";

export const REGUA_DO_PRODUTO: Regua = {
  rampaDoProduto: [
    "#eff6ff",
    "#d7e6fd",
    "#adcaf4",
    "#77a3e3",
    "#447ed2",
    "#1d5eb6",
    "#003e8a",
    "#0b366f",
    "#102f5c",
    "#132b4e",
    "#0e1c32"
  ],
  claro: {
    nome: "claro",
    base: [
      {
        chave: "--color-bg",
        hex: "#f7f5ef"
      },
      {
        chave: "--color-surface",
        hex: "#ffffff"
      },
      {
        chave: "--color-surface-elevated",
        hex: "#edeee9"
      }
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "grau",
          indice: 1,
          alfa: 1
        }
      }
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 6,
          alfa: 1
        },
        contra: null
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 6,
            alfa: 1
          }
        },
        contra: [
          {
            tipo: "grau",
            indice: 6,
            alfa: 1
          }
        ]
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 7,
          alfa: 1
        },
        contra: null
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1
        },
        contra: null
      },
      {
        token: "::selection/color",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 10,
          alfa: 1
        },
        contra: [
          {
            tipo: "grau",
            indice: 2,
            alfa: 1
          }
        ]
      },
      {
        token: ":focus-visible/outline",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 5,
          alfa: 1
        },
        contra: null
      }
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#278067"
      },
      {
        nome: "warning",
        hex: "#b07a2b"
      },
      {
        nome: "error",
        hex: "#a94a3c"
      },
      {
        nome: "info",
        hex: "#6d4ba0"
      }
    ],
    neutros: [
      "#f4f5f5",
      "#e0e3e3",
      "#bbc2c1",
      "#8c9696",
      "#626f6f",
      "#404d4d",
      "#202b2b",
      "#1f2727",
      "#1e2424",
      "#1d2222",
      "#1a1d1d"
    ],
    indices: {
      accent: 6,
      hover: 7,
      soft: 1
    },
    alfaDoSoft: 1
  },
  escuro: {
    nome: "escuro",
    base: [
      {
        chave: "--color-bg",
        hex: "#0d1111"
      },
      {
        chave: "--color-surface",
        hex: "#121818"
      },
      {
        chave: "--color-surface-elevated",
        hex: "#1d2121"
      }
    ],
    tingidas: [
      {
        chave: "--color-accent-soft",
        fonte: {
          tipo: "literal",
          hex: "#447ed2",
          alfa: 0.16
        }
      }
    ],
    papeis: [
      {
        token: "--color-accent",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1
        },
        contra: null
      },
      {
        token: "--color-accent-fg",
        tipo: "texto",
        fonte: {
          tipo: "frenteCalculada",
          sobre: {
            tipo: "grau",
            indice: 4,
            alfa: 1
          }
        },
        contra: [
          {
            tipo: "grau",
            indice: 4,
            alfa: 1
          }
        ]
      },
      {
        token: "--color-accent-hover",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 3,
          alfa: 1
        },
        contra: null
      },
      {
        token: "--ring",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1
        },
        contra: null
      },
      {
        token: "[data-theme=\"dark\"] ::selection/color",
        tipo: "texto",
        fonte: {
          tipo: "grau",
          indice: 0,
          alfa: 1
        },
        contra: [
          {
            tipo: "grau",
            indice: 7,
            alfa: 1
          }
        ]
      },
      {
        token: "[data-theme=\"dark\"] :focus-visible/outline-color",
        tipo: "componente",
        fonte: {
          tipo: "grau",
          indice: 4,
          alfa: 1
        },
        contra: null
      }
    ],
    semanticas: [
      {
        nome: "success",
        hex: "#5ab095"
      },
      {
        nome: "warning",
        hex: "#d09455"
      },
      {
        nome: "error",
        hex: "#c87263"
      },
      {
        nome: "info",
        hex: "#ab8ae5"
      }
    ],
    neutros: [
      "#eef2f2",
      "#d2dada",
      "#a0aaaa",
      "#757e7e",
      "#4f5757",
      "#353a3a",
      "#272c2c",
      "#1d2121",
      "#121818",
      "#0d1111",
      "#070808"
    ],
    indices: {
      accent: 4,
      hover: 3,
      soft: null
    },
    alfaDoSoft: 0.16
  }
} as const;
