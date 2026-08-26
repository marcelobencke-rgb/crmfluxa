// Flat config (ESLint 9 / eslint-config-next 16 — `next lint` foi removido no
// Next 16; o script `lint` chama o eslint CLI direto). Migração 1:1 do antigo
// .eslintrc.json.
import { defineConfig, globalIgnores } from "eslint/config";
import nextPlugin from "@next/eslint-plugin-next";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

export default defineConfig([
  // `.claude/worktrees/` são checkouts locais de outros agentes (com `.next/` e
  // `node_modules/` próprios) — nunca fonte deste repo; lintá-los explode o eslint
  // com dezenas de milhares de falsos positivos em JS gerado. (Na CI, checkout
  // limpo, o diretório nem existe.)
  globalIgnores([".next/", "node_modules/", "dist/", "supabase/", "next-env.d.ts", ".claude/worktrees/"]),
  nextPlugin.configs["core-web-vitals"],
  reactHooks.configs.flat.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": ["warn", { prefer: "type-imports" }],
      // Padrão permissivo: vale para `scripts/` e `tests/`, onde escrever em
      // stdout É o trabalho (sonda de CLI, seed, prova manual). O bloco no fim
      // deste arquivo endurece a regra só no código de produção.
      "no-console": ["warn", { allow: ["warn", "error", "info"] }],
      // react-hooks 7 introduziu esta regra como error; o padrão setState-em-
      // effect é pré-existente em 14 componentes — warn até o mutirão de refactor.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  {
    // Script CLI do gov-loop (roda via tsx, fora do bundle) — require() ok.
    files: ["loop/**/*.ts"],
    rules: { "@typescript-eslint/no-require-imports": "off" },
  },
  {
    // ─── CÓDIGO DE PRODUÇÃO: NENHUM `console`, E COMO ERRO ────────────────────
    //
    // A auditoria de julho comemorou "zero console.log" — verdade, havia
    // exatamente 1. A métrica contou a palavra errada: eram **178** chamadas de
    // `console.error`/`warn`/`info` fora de `lib/logger.ts`, concentradas na
    // ingestão, no RAG e nos workers. A regra as PERMITIA explicitamente
    // (`allow: ["warn","error","info"]`), então o número nunca aparecia.
    //
    // Num contêiner Docker isso vai para o stdout e evapora: sem `request_id`,
    // sem tenant, sem nível, sem retenção. Quando um cliente reclama, não existe
    // o que ler — e o Sentry, configurado, quase não era usado (6
    // `captureException` em ~100k linhas).
    //
    // `error` e não `warn`: aviso que não bloqueia merge é aviso que se acumula.
    // Este repo tem 330 warnings vivos justamente por isso; um a mais nunca
    // seria pago. Como erro, o CI reprova e a dívida não volta a crescer.
    //
    // `lib/logger.ts` fica de fora porque é ele quem chama `console` de verdade
    // — as três chamadas lá têm `eslint-disable-next-line` próprio.
    files: ["app/**/*.{ts,tsx}", "lib/**/*.{ts,tsx}", "components/**/*.{ts,tsx}", "workers/**/*.{ts,tsx}", "hooks/**/*.{ts,tsx}"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    //
    // ⚠️ O `{}` NÃO É DECORAÇÃO — é o que zera o `allow` herdado.
    //
    // No flat config, um bloco que reconfigura a regra passando SÓ a severidade
    // (`"no-console": "error"`) herda as OPÇÕES do bloco anterior. Escrito
    // assim, este bloco virava erro e continuava permitindo `warn`/`error`/
    // `info` — exatamente as três formas que representavam 177 das 178
    // chamadas. Uma catraca severa que não barrava nada.
    //
    // Medido com `eslint --print-config`: resolvia para
    // `[2, { allow: ["warn","error","info"] }]`. Passar um objeto de opções faz
    // ELES substituírem os anteriores, e sem `allow` nenhum método passa.
    //
    // `allow: []` seria o jeito óbvio de dizer isso e é INVÁLIDO: o schema da
    // regra exige `minItems: 1`, e o eslint aborta a execução inteira com
    // "Value [] should NOT have fewer than 1 items".
    rules: { "no-console": ["error", {}] },
  },
]);
