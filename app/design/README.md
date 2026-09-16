# `/design` — Design System Showcase

> **Nota sobre o nome da pasta:** o briefing pediu `app/_design/`, mas Next.js
> trata folders prefixados com `_` como privados (não geram rota). Para que a
> URL `/design` seja navegável, a pasta foi nomeada `app/design/` (sem
> underscore). Se preferir o prefixo, renomeia e adicione um redirect
> em `next.config.ts`.

Painel navegável e isolado para iterar a direção visual do DeskcommCRM antes de
aplicar ao app real. Não toca em `app/layout.tsx` global; tem o seu próprio
`layout.tsx` com `<VariantProvider>` e CSS escopado em `showcase.css`.

## Como rodar

```bash
pnpm dev
# acesse http://127.0.0.1:3000/design  (ou :3001 se a 3000 estiver ocupada)
```

A rota é pública (sem auth) e tem `robots: noindex`.

## Como ler

1. **Sidebar** — navegação entre 8 seções: Tokens, Paletas, Tipografia,
   Densidade, Componentes, Padrões, Motion, Iconografia.
2. **Top bar** — switcher para trocar **paleta + tipografia + densidade + tema**
   em runtime via CSS Custom Properties. Tudo persiste em
   `localStorage` sob a key `deskcomm.designshowcase.v1`.
3. **Canvas central** — seção ativa, com botões "Aplicar X" embutidos em cada
   variante para trocar diretamente do conteúdo (não só do switcher).

## Direção visual

> Soft-tech / calmo — neutros desaturados (greige/warm-gray, **não** slate/zinc),
> 1 accent forte mas não saturado, motion fluido, whitespace generoso, hierarquia
> tipográfica > decoração.

### Paletas (6)
`Fluxa` (marca, **em produção desde 2026-09-13** — ver "Decisões notáveis") ·
`Sage` · `Clay` · `Mist` · `Plum` · `Olive` — cada uma com 11 stops do accent,
11 stops de neutro greige, 4 estados (success/warning/error/info), versões
**light e dark definidas separadamente** (não invertidas).

### Pareamentos tipográficos (4)
1. Bricolage Grotesque + Plus Jakarta Sans (default)
2. Fraunces + Manrope
3. Atkinson Hyperlegible (mono-stack a11y-first)
4. Source Serif 4 + IBM Plex Sans

Inter / Geist / Space Grotesk **proibidos** por saturação em training data.

### Densidades (3)
- `Aerada` · row 56 / gap 24 (Notion-like)
- `Equilibrada` · row 44 / gap 16 (Things-like, default)
- `Compacta` · row 32 / gap 8 (Linear-like)

## Arquitetura

- `lib/tokens.ts` — única source-of-truth para cores, fontes, densidade, motion.
- `lib/fonts.ts` — todas as fontes carregadas via `next/font/google` no boot do
  `_design/layout.tsx` (escopo isolado). Variáveis CSS expostas globalmente.
- `lib/variant-context.tsx` — Context React + `setProperty` em `:root` para
  injetar tokens. Hidrata de `localStorage`.
- `showcase.css` — todos os estilos do showcase prefixados `.ds-*`. Não interfere
  no resto do app.
- `sections/Section*.tsx` — uma por aba.
- `components/Switcher.tsx` — controle topo direito.

## Decisões notáveis

- **Default**: `Fluxa + Bricolage/Jakarta + Equilibrada + Light` (era Sage até
  2026-09-12). Bricolage tem width axis útil pra hierarquia em headers de inbox
  — isso não mudou.
- **Iconografia recomendada**: Phosphor (duotone). Justificativa na seção Iconografia.
- **CSS variables, não Tailwind classes**: o showcase intencionalmente fica fora
  do tema do app para não poluí-lo antes da decisão final. Quando a variante for
  escolhida, migra-se para o `@theme inline` de `app/globals.css` com
  `var(--accent-N)` e os tokens viram parte do build. (Até o Tailwind 4 o alvo
  era `theme.extend.colors` do `tailwind.config.ts`, que não existe mais.)

### A paleta Fluxa — o que está em produção e por quê

Decidido com o Marcelo em 2026-09-12/13, a partir de um swatch de marca (Azul
Profundo `#0B2140` / Verde Sálvia `#6F9F8E` / Mint `#B8DED0` / Creme `#F7F5EF`
/ Cinza `#D9E0DF` / Grafite `#202B2B`). **A explicação completa, com cada
número medido, mora no cabeçalho de `app/globals.css`** (é a fonte da verdade
— isto aqui é o resumo). Três decisões que não são óbvias olhando só o hex:

1. **O accent em produção não é o hex literal do swatch.** Nem o Azul Profundo
   nem o Verde Sálvia, no tom exato que o Marcelo mandou, funcionam como
   `--color-accent-600` (o stop que vira botão/menu ativo) sem ajuste — um
   falha o piso de contraste do WCAG contra o fundo, o outro comprime o resto
   da rampa e satura o croma cedo no sRGB. Os dois foram recalibrados em OKLCH
   (mesmo matiz, L/C ajustados) até se comportarem. Ver `lib/branding/rampa.ts`
   (`rampaDeSemente`) — é o mesmo motor que deriva a cor de um cliente
   white-label, não um script à parte.
2. **Accent líder = Azul Profundo** (menus, botões primários, links). Verde
   Sálvia calibrado virou `--color-success` — "crescimento" combina mais com
   sucesso do que com botão genérico, e evita as duas cores mais fortes da
   marca competindo pelo mesmo papel.
3. **Botão é pílula (`rounded-full`), não canto arredondado** — referência
   direta ao heroui.com, olhado ao vivo (não só descrito). O raio de
   card/input também subiu (`--radius-*` em `globals.css`), mas ficou
   moderado — pílula é só o botão.

Todo ajuste foi verificado contra contraste WCAG real (`lib/branding/contraste.ts`)
e contra confusão de cor sob daltonismo (protanopia/deuteranopia simulados) —
não é "pareceu bom". Os 71 testes de `tests/unit/branding-*.test.ts` travam
esses números: mudar a paleta de novo SEM rodar `pnpm vitest run
tests/unit/branding-*` reprova o CI.
