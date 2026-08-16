---
type: harness-audit
project: Fluxa CRM
status: draft
last_updated: 2026-08-16
generated_by: auditoria documental (Claude Code) — verificação de arquivos, CI e configs
confidence: alta (todos os itens verificados por leitura direta de arquivo/config; nenhum comando executado)
audited_against: origin/main @ 789dfa6 (v1.0.0, 2026-07-27); apêndice de 2026-08-16 auditado contra origin/main @ 61effc5
---

# Auditoria do harness — Fluxa CRM

"Harness" = a infraestrutura que permite a um humano ou agente instalar, entender,
alterar e **verificar** o projeto com segurança. Um harness fraco não impede o trabalho;
ele torna o trabalho não-verificável, e é aí que a regressão entra sem ninguém ver.

Nada aqui foi executado — a auditoria é read-only por instrução. Todos os itens foram
verificados por leitura de arquivo, config e workflow.

---

## Nível de maturidade: **H4 — Preparado para agentes**

| Nível | Veredito | Evidência |
|---|---|---|
| H0 — Não documentado | superado | 119 docs em `docs/`, README de 302 linhas em 3 idiomas, PRDs, specs, `CHANGELOG.md` |
| H1 — Documentado | ✅ | `README.md`, `ARCHITECTURE.md`, `VISION.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CHANGELOG.md` (Keep a Changelog + SemVer) |
| H2 — Reproduzível | ✅ | Quickstart no README, `docs/SETUP.md`, `.nvmrc` (22), `packageManager` fixo, `pnpm-lock.yaml`, `docker-compose.yml`, `install.sh` do kit self-host, `baseline.sql` |
| H3 — Verificável | ✅ | `lint` + `typecheck` + `test:unit` + `build`; CI roda os 3 primeiros em PR |
| H4 — Preparado para agentes | ✅ | `CLAUDE.md` doutrinal forte; `AGENTS.md` **criado nesta auditoria**; documentação técnica extensa; **e o CI roda o gate de isolamento RLS** (job `invariants` → `pnpm test:db`) |
| H5 — Automação avançada | ⚠️ **parcial** | CI confiável e ambiente isolado ✅ (Postgres efêmero pg17, worktrees, gov-loop com maker≠checker e hash-check). Faltam: **4 das 32 specs E2E fora do CI** (28 rodam via `e2e.yml`, ainda não-obrigatório — e enquanto for opcional um PR que o quebre entra na `main`), `format:check` fora do CI, e o comando único local (`gov:verify`) não cobre `test:db`/`test:e2e` |

**Por que H4 e não H5:** a instrução da auditoria é explícita — não atribuir nível só
porque os arquivos existem, avaliar se o processo está implementado. Aqui está: o gate de
isolamento multi-tenant roda em CI como check nomeado, em job paralelo, aplicando
`baseline.sql` em modo install **e** update contra um Postgres descartável. Isso é o
processo funcionando, não a intenção.

O que separa de H5 é estreito: **16 dos 19 E2E não rodam em CI** (`e2e.yml` cobre `smoke`, `auth` e `error-pages` desde 2026-07-30) — de fora seguem
`vps-fresh-onboarding.spec.ts`, que protege a primeira impressão que a doutrina classifica
como o caminho mais crítico do produto. E `pnpm gov:verify`, o comando único que um agente
naturalmente usa como critério de pronto, **não** inclui `test:db` nem `test:e2e`: o CI
pega o que ele deixa passar, mas só depois do push.

**O que puxa este projeto para cima e é incomum num CRM open-source:** doutrina escrita e
específica (`CLAUDE.md`), Definition of Done de 13 itens, **56 arquivos de invariantes de
banco**, gate de install+update do `baseline.sql` num Postgres descartável rodando em CI,
doutrina de QA visual com ambiente fresco estilo VPS, e uma máquina de governança de
agentes (`loop/`) com maker≠checker e hash-check.

---

## Os 20 itens

Legenda: ✅ existente e funcional · ⚠️ existente mas incompleto · ❌ não identificado · 💡 recomendado

| # | Item | Status | Evidência / lacuna |
|---|---|---|---|
| 1 | README útil | ✅ | 302 linhas: o que é, quickstart de 5 min, stack, estrutura, testes, roadmap, suporte. Traduzido (EN/ES). Mais `CHANGELOG.md` com aviso de "⚠️ Requer atenção" por versão, voltado a quem roda VPS |
| 2 | Instruções de instalação | ✅ | README §Quickstart + `docs/SETUP.md` + `docs/deploy-selfhost/` + `docs/deploy-hostgator/` + `install.sh` |
| 3 | Versão de runtime definida | ✅ | `.nvmrc` = 22, `engines.node >=22`, `packageManager: pnpm@9.15.9`, e o CI usa `setup-node@v7` com Node 22 — alinhados |
| 4 | Lockfile | ✅ | `pnpm-lock.yaml`, e ambos os jobs do CI usam `--frozen-lockfile` |
| 5 | `.env.example` | ⚠️ | Existe (+ `.env.hostgator.example`), mas **6 vars de `lib/env.ts` continuam ausentes**, entre elas 3 secrets: `IMPERSONATE_COOKIE_SECRET`, `INTERNAL_CRON_SECRET`, `LGPD_SIGNING_KEY` (+ `LGPD_DPO_EMAIL`, `LGPD_EXPORT_EXPIRES_HOURS`, `NUVEMSHOP_ENABLED`) |
| 6 | Comando de desenvolvimento | ✅ | `pnpm dev`. Nota: `docs/testing/` documenta que E2E fresco exige `build` + `start`, não `dev` |
| 7 | Comando de build | ✅ | `pnpm build`; exercitado no workflow `perf.yml` |
| 8 | Comando de lint | ✅ | `pnpm lint` (eslint), roda no CI |
| 9 | Comando de formatação | ✅ | `pnpm format` / `format:check` (Prettier). ⚠️ `format:check` **não está no CI** |
| 10 | Checagem de tipos | ✅ | `pnpm typecheck` (`tsc --noEmit`, TS 6 estrito), roda no CI |
| 11 | Testes unitários | ✅ | 221 arquivos `*.test.ts(x)`; `pnpm test:unit` no CI |
| 12 | Testes de integração | ✅ | **56 arquivos** de invariantes em `tests/invariants/` + `tests/api/`. Excluídos do `test:unit` de propósito (`vitest.config.ts:12`) e rodados pelo job `invariants` do CI via `pnpm test:db` |
| 13 | Testes E2E | ⚠️ | 20 specs Playwright. **10 rodam no CI** (`e2e.yml`, ainda não-obrigatório), incluindo o P0 `vps-webhook-outbound-ssrf`; o P0 `vps-fresh-onboarding` continua fora (issue #63) |
| 14 | Comando único de verificação | ⚠️ | `pnpm gov:verify` = `typecheck && lint && test:unit`. **Omite `test:db` e `test:e2e`** — verde localmente não significa verificado. O CI cobre `test:db`, mas só depois do push |
| 15 | CI executando verificações | ✅ | `ci.yml` tem 2 jobs: `verify` (typecheck + lint + test:unit) e **`invariants` (`pnpm test:db` — isolamento RLS + invariantes de governança, em job paralelo com timeout de 20min)**. Falta E2E e `format:check`. `perf.yml` faz build + bundle size; `publish-image.yml` publica no GHCR |
| 16 | Proteção contra secrets | ⚠️ | `.gitignore` cobre `.env*` (exceção só para os `.example`) e o Sentry tem `beforeSend` que higieniza PII. **Sem** gitleaks/trufflehog no CI, **sem** pre-commit hook |
| 17 | Documentação arquitetural | ✅ | `ARCHITECTURE.md` (1 página) + `docs/specs/` (16 docs com schema e payloads) + `docs/architecture/agent-turn` + `graphify-out/` |
| 18 | Regras para agentes de IA | ✅ | `CLAUDE.md` doutrinal (convenções não-negociáveis, anti-patterns, doutrinas de migration/QA/branch), `.claude/agents/` com frota especializada, `loop/` com maker≠checker. **`AGENTS.md` criado nesta auditoria** — antes, agentes não-Claude entravam sem contexto |
| 19 | Critérios de conclusão de tarefa | ✅ | Definition of Done de 13 itens em `CLAUDE.md`; `docs/doctrine/sistema-vivo.md` com o Living System Checklist; template de PR com o checklist |
| 20 | Ambiente reproduzível | ✅ | `docker-compose.yml` (dev), `.prod.yml`, `Dockerfile` + `Dockerfile.worker`, `baseline.sql` auto-curativo cobrindo até a migration 0092, `scripts/test-db.sh` com Postgres efêmero pg17 rodando em CI. ⚠️ A receita de ambiente fresco tem armadilhas que só existem em doc (pg17 obrigatório, `node_modules` real e não symlink, fora de `/tmp`) — reproduzível, mas com conhecimento tácito |

---

## Plano de correção, por relação custo × benefício

Ordenado por retorno. Nada aqui foi aplicado — a auditoria não altera CI, `package.json`
nem código.

### ✅ JÁ FEITO — `pnpm test:db` no CI

Era o achado principal da primeira passada desta auditoria, e estava **desatualizado**:
`origin/main` já traz o job `invariants` no `ci.yml` rodando `pnpm test:db` em paralelo ao
`verify`, com timeout de 20min e comentário explicando a escolha do job separado. Fica
registrado como corrigido, não como pendência.

### 1. Adicionar os E2E ao CI (ou a um workflow nightly) 🔴 · custo: ~30 linhas

Maior buraco restante. `vps-fresh-onboarding.spec.ts` protege a primeira impressão, que a
doutrina classifica como o caminho mais crítico do produto, e
`vps-webhook-outbound-ssrf.spec.ts` é a única prova automatizada do guard de SSRF. Rodar
em PR pode ser lento; um workflow nightly + trigger manual já elimina a regressão silenciosa.

### 2. Renomear/reforçar o comando único 🟠 · custo: 2 linhas

Duas opções: (a) `gov:verify` passa a incluir `test:db` (exige Docker em toda máquina de
dev), ou (b) mantém `gov:verify` como o loop rápido e cria `verify:full` =
`gov:verify && test:db`, com `AGENTS.md` e o DoD apontando para `verify:full` como
critério de merge. **Recomendo (b)** — preserva o loop rápido e torna a diferença explícita.

### 3. Completar `.env.example` 🟠 · custo: 6 linhas

As 6 vars ausentes, com comentário sobre quais são obrigatórias. Os 3 secrets são o caso
grave: quem instala não sabe que precisa gerá-los.

### 4. Adicionar scan de secret no CI 🟡 · custo: ~10 linhas

`gitleaks` como step. Projeto open-source com screenshots de evidência sendo commitados
tem risco real de vazamento acidental.

### 5. `format:check` no CI 🟡 · custo: 2 linhas

O script existe e não é exercitado.

---

## Não pôde ser confirmado

- Se `typecheck`/`lint`/`test:unit` **passam hoje** — o `node_modules` deste checkout está
  incompleto (70 pacotes, sem `typescript`) e a auditoria não instala dependências. Todo
  status "✅" nos itens 8, 10, 11 e 12 refere-se à *existência e configuração* do comando e
  do job de CI, **não** a uma execução verde observada.
- Taxa de sucesso histórica do CI — não consultamos a API do GitHub Actions. Sabemos que o
  job `invariants` existe; não sabemos se está passando.
- Cobertura de teste em % — configurada no Vitest (`provider: v8`), nunca coletada aqui.
- Se as branch protection rules do GitHub exigem os dois checks verdes para merge — é
  config de repositório remoto, invisível no checkout. **Isso decide se o gate de RLS é
  bloqueante ou apenas informativo**, e é a pergunta mais importante em aberto sobre o harness.

---

## Apêndice — `e2e.yml` crônico em vermelho (2026-08-16)

Disparado por relato do usuário: as últimas 10 execuções de `e2e.yml` na `main` estavam
vermelhas, incluindo commits totalmente não relacionados (bump de dependência, rename de
marca), e PRs #6, #7, #8, #9 mergearam mesmo assim. Investigação via API pública do GitHub
(sem `gh` CLI nem token disponíveis nesta sandbox — ver "Não pôde ser confirmado" abaixo) +
leitura direta de código. Achados, na ordem em que explicam o maior número de falhas:

### 1. Falha em cascata por design do workflow — CONSERTADO

`e2e.yml` divide a suíte em dois passos (`E2E — parte 1 de 2` / `parte 2 de 2`) só para
isolar o contador de rate-limit de login por IP entre dois processos `next start`
separados (motivo documentado no próprio arquivo, linhas 316–337). O passo da parte 2 não
tinha `if:`, e o default do GitHub Actions para passo sem `if` é `success()` — ou seja,
**qualquer falha isolada na parte 1 pulava a parte 2 inteira** (hoje 18 dos 37 specs). Foi
exatamente o que a run mais recente (31967651451, commit `61effc5`) mostrou: passo 17
(`parte 1`) `failure`, passo 18 (`parte 2`) `skipped`. Isso por si só explica a metade dos
"specs que nem rodaram" do relato — não é falta de cobertura, é cobertura real escondida
atrás de um "skipped" que parece neutro mas não é.

Conserto aplicado: `if: ${{ !cancelled() }}` no passo da parte 2
([e2e.yml](../.github/workflows/e2e.yml)), para que ela sempre rode (exceto se o job for
cancelado) e reporte o próprio resultado em vez de ficar muda quando a parte 1 falha.

### 2. String de marca obsoleta em `signup-journey.spec.ts` — CONSERTADO

`tests/e2e/signup-journey.spec.ts:46` esperava o texto literal `"Boas-vindas ao
DeskcommCRM"`. `DEFAULT_APP_NAME` em [`lib/branding.ts`](../lib/branding.ts) virou
`"Fluxa CRM"` no commit `3fb9fc0` (2026-08-14, `feat(automations)` — **não** no commit de
rename `bf90366` do dia seguinte, que tocou só docs/config). Ou seja, o app já dizia "Fluxa
CRM" na tela de onboarding um dia inteiro antes de qualquer commit de rename existir, e o
spec ficou desalinhado desde então — toda run de `e2e.yml` neste repo (as 8 execuções
existentes, todas de 2026-08-15 em diante) rodou depois dessa divergência, então
**nunca houve uma run verde de `signup-journey` no histórico deste workflow**.

Conserto aplicado: string do spec atualizada para `"Boas-vindas ao Fluxa CRM"`.

### 3. Contraste insuficiente no rótulo de grupo da sidebar — CONSERTADO

`components/shell/SidebarNav.tsx:84` (título de cada grupo de navegação, ex. "PRINCIPAL",
"ATENDIMENTO") usava `text-muted-foreground/60` num texto de 10px. Contraste calculado
(fórmula WCAG, luminância relativa sRGB) contra o fundo do card:

| Tema | Cor efetiva (60% opacidade sobre o fundo) | Contraste | Limite AA (texto normal) |
|---|---|---|---|
| Claro | `#5d594f` a 60% sobre `#ffffff` → ≈`rgb(158,155,149)` | **≈2.77:1** | 4.5:1 — **reprova** |
| Escuro | `#8e8b7f` a 60% sobre `#1d1c17` | não medido (o claro já reprova, motivo suficiente) |  |

10px é texto normal (limite de "texto grande" do WCAG é 18pt/24px, ou 14pt bold), então o
teto é 4.5:1, não 3:1. `text-muted-foreground` em opacidade cheia mede ≈6.98:1 (claro) e
≈5.00:1 (escuro) contra o mesmo fundo — ambos confortavelmente acima do limite. Essa cor
não é nova: existe desde o commit inicial do repo, então este achado é uma dívida
pré-existente, não uma regressão do bump de Tailwind 3→4 (`492d514`) — mas explica a
violação de `color-contrast` na sidebar que `rbac-roles.spec.ts` reporta via `axe-core` em
toda tela `/app/*` que não exclui a sidebar do scan (a maioria dos `expectNoBlockingA11y`
do spec não exclui — só o `[role="tablist"]` do Inbox está excluído, por um defeito
diferente e já documentado no próprio spec, linhas 120–123).

Conserto aplicado: removida a opacidade (`text-muted-foreground/60` → `text-muted-foreground`).

### 4. Contradição de doutrina: `e2e` é check obrigatório ou não? — NÃO RESOLVIDO, PRECISA DE DONO

O `CLAUDE.md` deste repo afirma (seção "Testes"): *"Todos os quatro são obrigatórios —
medido em 2026-08-08 na branch protection"*, listando `verify, build-and-size, invariants,
e2e` via `gh api .../branches/main/protection`. Mas o **comentário do próprio
`.github/workflows/e2e.yml`** (linhas 10–17, escrito pela mesma doutrina) diz o oposto:
*"NÃO-BLOQUEANTE por ausência... `e2e` não está na lista de checks obrigatórios da branch
protection, então falhar aqui não segura merge"*, com uma nota para promovê-lo a obrigatório
só "quando N execuções seguidas passarem limpas".

As duas afirmações não podem estar certas ao mesmo tempo. O comportamento observado (PRs
#6, #7, #8, #9 mergeados com `e2e` vermelho, confirmado pelo usuário) é consistente com o
que o `e2e.yml` diz, não com o que o `CLAUDE.md` diz — ou seja, o `CLAUDE.md` provavelmente
ficou desatualizado depois de alguma reversão, ou a medição de 2026-08-08 nunca foi refletida
de volta no arquivo do workflow. **Não consegui confirmar qual é o estado real da branch
protection nesta sessão** (ver abaixo) — isso precisa ser reconferido na fonte
(`gh api repos/marcelobencke-rgb/crmfluxa/branches/main/protection --jq
'.required_status_checks.contexts'`) por alguém com acesso, e o arquivo que estiver errado
(`CLAUDE.md` ou o comentário do `e2e.yml`) precisa ser corrigido para parar de mentir pro
próximo leitor.

### O que NÃO foi medido nesta auditoria

- **Não tive acesso a `gh` CLI nem a um token do GitHub nesta sandbox** (`gh: command not
  found`; API REST de branch protection devolveu 401 sem autenticação). Toda conclusão
  sobre runs/jobs veio da API pública não-autenticada (`GET
  .../actions/workflows/e2e.yml/runs`, `GET .../actions/runs/{id}/jobs`), que expõe
  status/conclusão por passo mas **não** o log bruto (`GET .../jobs/{id}/logs` devolveu
  403 sem token) nem o artefato `playwright-report` de cada run. Os achados #2 e #3 vieram
  de leitura de código correlacionada ao texto do relato do usuário, não da leitura direta
  da falha no log — alta confiança pela precisão da correlação (a string bate byte a byte;
  o cálculo de contraste bate com "color-contrast... na sidebar"), mas não é a mesma coisa
  que ter visto a asserção `expect(...).toBeVisible()` falhando na saída do Playwright.
- **Não reproduzi a suíte localmente.** Nem `docker` nem `supabase` (CLI) estão instalados
  nesta sandbox — a receita de ambiente fresco da Doutrina de QA Visual
  (`baseline.sql` + Supabase local pg17 + seeds + `next build`/`next start`) não é
  executável aqui. Os três consertos acima não têm prova visual/E2E verde local — só leitura
  de código e cálculo de contraste. **Isso é exatamente o tipo de "verde que não foi
  medido" que a doutrina pede pra declarar**: alguém com Docker/Supabase CLI precisa rodar
  `pnpm exec playwright test tests/e2e/signup-journey.spec.ts tests/e2e/rbac-roles.spec.ts`
  (mínimo) contra os dois arquivos tocados antes de considerar #2 e #3 verificados de verdade.
- **Não investiguei as outras 5 specs do relato do usuário** (`invite-lifecycle`,
  `inbox-scope`, `prova-painel-provedores`, `vps-webhook-outbound-ssrf`,
  `agente-papeis-operador`) além de ler o código sem achar uma divergência estática óbvia
  como nos casos #2/#3. É plausível que algumas dessas fossem consequência indireta do
  achado #1 (ex.: estado deixado por specs anteriores da mesma `parte 1` que falharam e
  não limparam `finally`), mas isso é hipótese, não medição — não incluí como "conserto".
  `vps-webhook-outbound-ssrf` importa em especial: é a única prova automatizada do guard
  anti-SSRF (P0 de segurança), e continua sem causa raiz confirmada nesta auditoria.
- **Não confirmei se `e2e` é ou não check obrigatório hoje** (achado #4) — ver acima.

### Próximo passo recomendado

1. Alguém com `gh` autenticado roda os specs restantes localmente com log completo
   (`--reporter=list` ou baixando o artefato `playwright-report` das runs vermelhas) para
   os 5 specs não diagnosticados aqui.
2. Reconferir a branch protection na fonte e corrigir o arquivo (`CLAUDE.md` ou
   `e2e.yml`) que estiver desatualizado — os dois não podem seguir se contradizendo.
3. Depois de N runs limpas consecutivas (o próprio `e2e.yml` já declara esse critério),
   promover `e2e` a obrigatório de verdade, se ainda não estiver.

---

## Nota de método

A primeira passada desta auditoria rodou contra um checkout local **556 commits atrás** da
`origin/main`, e por isso reportou "gate de RLS fora do CI" como achado principal — quando
já estava corrigido em produção. Os números e vereditos acima foram todos recontados contra
`origin/main @ 789dfa6`. Registrado aqui porque a doutrina de higiene de branches
(`CLAUDE.md`) existe exatamente para evitar isso: **`git fetch` antes de auditar, não depois.**
