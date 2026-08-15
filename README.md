<div align="center">

🇧🇷 Português · [🇺🇸 English](README.en.md) · [🇪🇸 Español](README.es.md)

# 🛠️ DeskcommCRM — o Sistema Operacional de Vendas com IA, pro WhatsApp

**Agentes de IA que atendem, qualificam e vendem no WhatsApp — dentro de um CRM com IA nativa operando o funil de verdade.**
**A alternativa com IA nativa a Kommo, Octadesk e Intercom.**

[![Next.js 16](https://img.shields.io/badge/Next.js-16-black?logo=next.js)](https://nextjs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178c6?logo=typescript)](https://www.typescriptlang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Postgres%2BAuth%2BStorage-3ecf8e?logo=supabase)](https://supabase.com)
[![CI](https://github.com/melgarafael/DeskcommCRM/actions/workflows/ci.yml/badge.svg)](https://github.com/melgarafael/DeskcommCRM/actions/workflows/ci.yml)

[**🧭 Visão**](VISION.md) · [**📘 Setup Guide**](docs/SETUP.md) · [**🏗️ Arquitetura**](ARCHITECTURE.md) · [**🤝 Contribuir**](CONTRIBUTING.md) · [**📋 PRDs**](docs/prd/) · [**🗺️ Roadmap**](#%EF%B8%8F-roadmap)

</div>

---

> ⚠️ **Repositório privado / produto comercial.** O DeskcommCRM deixou de ser distribuído
> como projeto self-host de código aberto — hoje é um **SaaS pago, hospedado por nós**,
> multi-tenant, segmentado em planos (Starter/Growth/Scale/Agency). Detalhe completo do
> modelo de negócio em [`VISION.md`](VISION.md). Este README passa a servir o **time interno**
> (setup de ambiente de dev, arquitetura, convenções), não mais clientes instalando a própria
> instância — as seções abaixo estão em processo de atualização pra refletir isso; onde ainda
> houver instrução de "instale na sua VPS", trate como resquício em revisão, não como caminho
> válido pro cliente.

## ✨ O que é

**Deskcomm** vem de **Desk** (mesa) + **comm** (comércio): **o comercial de mesa** — toda a operação de vendas do seu negócio numa mesa só, operada por pessoas e agentes de IA juntos.

O projeto nasceu como CRM de e-commerce e a demanda real o levou muito além: hoje roda em **clínicas, imobiliárias, infoprodutos, agências, lojas e prestadores de serviço** — qualquer negócio que vende pelo WhatsApp. O produto acompanhou essa virada e virou um **sistema operacional de vendas**: agentes de IA com RAG por tenant atendem, qualificam, movem leads no funil, disparam automações e sabem a hora de passar pra um humano — com o CRM inteiro exposto via **MCP** pros agentes operarem de verdade. A história completa está em [`VISION.md`](VISION.md).

### Diferenciais

- 🤖 **Agentes de IA que operam o CRM** — RAG por tenant, análise de sentimento, handoff IA→humano auditado, IA como assignee de primeira classe e controle de budget por organização. Não é chatbot decorativo: o agente atende, qualifica e move o funil.
- 🔁 **Agentes que se auto-aprimoram** — conversas resolvidas viram conhecimento novo na base RAG; handoffs marcam onde o agente ainda não alcança; métricas fecham o loop. Cada mês de operação torna o agente melhor, com gate humano no que importa.
- 🧩 **Multi-nicho por design** — vocabulário configurável por pipeline: lead vira *Cliente*, *Paciente* ou *Comprador*; won vira *Pago*, *Agendado* ou *Fechado*. O mesmo core serve e-commerce (nosso berço, com integração Nuvemshop), clínica, imobiliária ou infoproduto.
- 🔌 **MCP-ready** — MCP server interno pros agentes; contrato pra agências e integradores parceiros em construção. O CRM como infraestrutura pra qualquer agente de IA.
- 💬 **WhatsApp-native via WAHA** — multi-número, anti-banimento (throttle + jitter + janela de horário), mídia via Storage, STOP detection.
- 👥 **Governança de atendimento** — RBAC server-side de verdade, atribuição/transferência auditada, fila com posição, roteamento automático e escopo de visualização por papel.
- 🏢 **Multi-tenant + LGPD by-design** — RLS em toda tabela tenant-aware com teste de isolamento como gate de CI; anonimização preferida sobre delete; audit append-only com retenção 5 anos.
- ☁️ **SaaS gerenciado** — infraestrutura, atualização, backup e monitoramento por nossa conta. O cliente assina e usa; não instala, não opera servidor.

### 🔌 Webhooks & Automações

Todo tenant pode criar **fontes de captação**: um endereço público (`/api/v1/webhooks/in/<token>`) que recebe leads de landing pages, formulários próprios ou ferramentas como Zapier/n8n via POST (JSON ou `application/x-www-form-urlencoded`) e já entra direto no funil/estágio escolhido — sem código, sem integração customizada por tenant. Em cima dessas fontes (e dos outros eventos do CRM — lead mudou de etapa, ganhou tag, chegou mensagem no WhatsApp), o tenant monta **automações**: regras no formato QUANDO/SE/ENTÃO que disparam ações como adicionar tag, mover o lead no funil, atribuir a um atendente, mandar uma mensagem de WhatsApp ou avisar outro sistema via webhook de saída.

Na UI, tudo mora em **Webhooks** na sidebar (visível só pra quem tem papel `manager`/`admin` — `agent`/`viewer` não veem o item nem acessam a rota, redirecionados pro inbox). A tela tem três abas: **Receber dados** (criar fonte, copiar o endereço/formulário pronto, disparar um lead de teste, ver os últimos recebimentos), **Automações** (montar a regra, que sempre nasce pausada até o tenant revisar e ligar) e **Atividade** (timeline de cada execução, com o resultado de cada ação e reenvio manual quando uma chamada de webhook externo falha).

Por baixo, cada evento (lead criado, tag adicionada, etc.) vira uma linha em `event_log` — nenhum trigger de banco faz chamada HTTP diretamente. Quem drena essa fila e realmente dispara as automações é a rota `/api/v1/cron/event-log-drain`, chamada a cada minuto por um cron na nossa infraestrutura de produção — sem esse cron ativo, fontes e automações continuam sendo criadas normalmente, mas os eventos ficam empilhados em `event_log` e nenhuma automação chega a rodar de verdade.

---

## 🚀 Quickstart de desenvolvimento (5 minutos pra ver rodando)

Ambiente local pra quem vai **trabalhar no código** — não é o caminho de produção (produção é gerenciada por nós, ver nota no topo).

```bash
# 1. Clone
git clone https://github.com/melgarafael/DeskcommCRM.git
cd DeskcommCRM

# 2. Node 22 + pnpm
nvm use                    # ou instale Node 22+
npm install -g pnpm
pnpm install

# 3. Env vars
cp .env.example .env.local
# Edite .env.local — guia completo em docs/SETUP.md

# 4. WAHA local (opcional em dev sem WhatsApp)
docker compose up -d

# 5. Schema do banco — aplique o baseline, NÃO as migrations
#    As migrations 0001-0009 e 0013 são stubs `SELECT 1;`: a cadeia não sobe do
#    zero. O schema real vive no baseline.sql.
#    `supabase db push` "passa" e deixa o banco vazio.
supabase link --project-ref <seu-ref>
psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f supabase/baseline.sql

# 6. Sobe o app
pnpm dev
```

App: <http://localhost:3000> · Health check: <http://localhost:3000/api/v1/health>

> 🆕 **Primeira vez? Não pula etapa.** [`docs/SETUP.md`](docs/SETUP.md) é o tutorial completo passo a passo de **todas as integrações** (Supabase, WAHA, Anthropic, Upstash, Sentry, Resend, Nuvemshop). ~60–90 min do zero ao app rodando.

---

## 🧱 Stack

| Camada | Escolha | Por quê |
|---|---|---|
| **Frontend** | Next.js 16 App Router (Turbopack) + React 19 + TypeScript 6 estrito | Server Components + Route Handlers no mesmo repo |
| **Estilo** | Tailwind + shadcn/ui (`new-york`, neutral) | Customizável sem lock-in |
| **DB** | Supabase (Postgres + RLS + `vector`) | Multi-tenant nativo, embedding pra RAG |
| **Auth** | Supabase Auth via `@supabase/ssr` | Cookie SameSite=Strict, HttpOnly |
| **Realtime** | Supabase Realtime | postgres_changes + broadcast |
| **Storage** | Supabase Storage (URLs assinadas) | Bucket privado `whatsapp-media` |
| **WhatsApp** | WAHA Plus (engine NOWEB) | Multi-tenant, retry, S3 |
| **Filas** | `event_log` table + workers (cron) | Sem Inngest/Trigger no MVP |
| **Rate limit** | Upstash Redis (sliding window) | Serverless, free tier suficiente |
| **AI** | Vercel AI SDK v7 (providers Anthropic/Google/OpenAI v4) via AI Gateway | Fallback automático, ZDR |
| **Validação** | Zod | Input externo, env, payloads |
| **Observability** | Sentry (scrub em erro, transação, span e breadcrumb) | Telemetria da nossa operação |
| **Hospedagem** | Vercel (app) + VPS própria (WAHA) — deploy hoje é manual, disparado por quem administra a infra; automação do trigger é trabalho futuro | Edge + dedicado pra WhatsApp |

Detalhes: [`ARCHITECTURE.md`](ARCHITECTURE.md).

---

## 📁 Estrutura

```
DeskcommCRM/
├── app/                    # Next.js App Router
│   ├── (admin)/            # Rotas super-admin (impersonate, tenants)
│   ├── (public)/           # Login, recovery
│   ├── app/                # Rotas autenticadas: inbox, kanban, contacts,
│   │                       #   connections, ai (agentes), integrations,
│   │                       #   metrics, lgpd, audit, team, settings
│   └── api/v1/             # API REST canônica
├── components/             # React (ui/, inbox/, kanban/, shell/, ...)
├── lib/                    # supabase/, waha/, ai/, api/, routing/, env.ts
├── hooks/
├── supabase/migrations/    # SQL versionado (+ baseline.sql da nossa infra)
├── workers/                # consumers de event_log (IA, RAG, LGPD, rotinas)
├── tests/{e2e,unit,invariants}/
├── scripts/                # seeds, qa-waves, manutenção
├── docs/                   # PRDs, specs, stories, SETUP.md
└── hostgator-setup-kit/    # kit de deploy da nossa própria infra (uso interno — ver nota no topo do README)
```

---

## 🧪 Testes

```bash
pnpm typecheck     # tsc --noEmit (estrito)
pnpm lint          # eslint next/core-web-vitals
pnpm test:unit     # Vitest (NÃO inclui tests/invariants/**)
pnpm test:db       # Postgres efêmero + baseline install/update + invariantes
pnpm test:e2e      # Playwright (requer dev server)
```

O job **`verify`** roda `typecheck`, `lint`, `lint:channels`, `test:unit` e `test:shell` em todo PR. Um segundo job — **`invariants`** — sobe um Postgres limpo, aplica o `supabase/baseline.sql` em modo install (`ON_ERROR_STOP=1`) e depois em modo update (provando idempotência), e roda **364 testes de invariante** distribuídos em 56 arquivos, cobrindo RBAC, atribuição, escopo de visualização, roteamento, follow-up, webhooks e automações.

Entre eles está o **teste de isolamento RLS**: cria 2 organizações, simula os claims JWT pelo mesmo caminho `auth.uid()` / `fn_user_org_ids()` que as policies de produção usam, e prova que um usuário da org A enxerga **zero linhas** da org B em `conversations`, `messages`, `contacts` e `crm_leads`. Antes disso, um caso de controle prova que as linhas da org B realmente existem no banco — sem ele, o teste passaria mesmo com a tabela vazia.

---

## 📚 Documentação

| Doc | O que tem |
|---|---|
| [`VISION.md`](VISION.md) | **Visão e posicionamento** — o que o projeto é, no que acredita, modelo de negócio e planos |
| [`docs/SETUP.md`](docs/SETUP.md) | **Setup completo passo a passo** de todas as integrações (ambiente de dev) |
| [`docs/white-label.md`](docs/white-label.md) | Multi-tenant / white-label — trocar a marca por conta do plano Agency |
| [`CLAUDE.md`](CLAUDE.md) | Convenções não-negociáveis (leitura obrigatória pra contribuir) |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | Visão de 1 página da arquitetura |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | Fluxo PR + epic-executor |
| [`docs/prd/`](docs/prd/) | PRDs (master, platform, customer 360, WhatsApp, pipeline, IA-RAG, Nuvemshop) |
| [`docs/specs/`](docs/specs/) | Specs técnicas 01–13 (schema SQL, payloads, MCP, governança) |
| [`docs/business-rules/`](docs/business-rules/) | Regras de negócio fora do código |
| [`docs/DEPLOY-CHECKLIST.md`](docs/DEPLOY-CHECKLIST.md) | Preflight pré-go-live |
| [`docs/runbooks/waha-hostgator.md`](docs/runbooks/waha-hostgator.md) | Runbook de WAHA em produção (nossa infra) |
| [`docs/ATUALIZANDO.md`](docs/ATUALIZANDO.md) | Como atualizar a instância de produção (operação interna) |

---

## 🤝 Contribuindo (time interno)

Repositório privado — fluxo de PR pro time e colaboradores diretos, não contribuição pública externa.

**Antes de abrir PR:**

1. Leia [`CLAUDE.md`](CLAUDE.md) (~5 min) — convenções não-negociáveis (multi-tenancy, RLS, audit, LGPD).
2. Leia [`CONTRIBUTING.md`](CONTRIBUTING.md) — fluxo de branches, commits, epic-executor.

**Fluxo curto:**

```bash
git checkout -b feat/short-slug
# implementa + testes
pnpm typecheck && pnpm lint && pnpm lint:channels && pnpm test:unit && pnpm test:shell && pnpm build
pnpm test:db   # precisa de Docker — é o job `invariants`, obrigatório no merge
git commit -m "feat(escopo): descrição"
# abre PR — o template já traz o checklist de Definition of Done
```

Essa linha é a lista **completa** dos gates obrigatórios, de propósito: rodar só metade e descobrir o
resto como surpresa vermelha depois de horas de espera é a pior primeira experiência que este
repositório sabe entregar.

**Definition of Done:** typecheck zero, lint zero, testes relevantes verdes, RLS testada se toca tabela tenant-aware, audit log emitido em mutações, migration versionada se muda schema. Detalhes em [`CLAUDE.md`](CLAUDE.md#definition-of-done).

---

## 🐛 Reportando bugs

Abra uma [issue](https://github.com/melgarafael/DeskcommCRM/issues/new/choose) — o template pede o que precisamos (ambiente, `/api/v1/health`, steps).

Pra **vulnerabilidades de segurança**, **NÃO abra issue pública** — use o [relato privado de vulnerabilidades](https://github.com/melgarafael/DeskcommCRM/security/advisories/new). Detalhes em [`SECURITY.md`](SECURITY.md).

---

## 🗺️ Roadmap

### ✅ Entregue

- **Fundação & plataforma** — auth (MFA pra admin), multi-tenancy com RLS + teste de isolamento, RBAC 4 papéis, audit log append-only, onboarding de tenant.
- **Atendimento WhatsApp** — inbox 3 painéis em tempo real, conexões WAHA multi-número, mídia via Storage, anti-banimento (throttle + jitter + janela de horário), STOP detection.
- **CRM & pedidos** — kanban com vocabulário configurável por nicho (fractional indexing), customer 360, contatos, tags, integração Nuvemshop pra e-commerce.
- **IA nativa** — agentes com RAG por tenant (pgvector), análise de sentimento, handoff IA→humano, controle de budget por org, MCP server interno.
- **LGPD** — export e redact via workers, anonimização em cascata, consentimento auditado. *(papéis de controlador/operador em revisão por conta do modelo SaaS — ver nota abaixo)*
- **Infraestrutura de produção** — deploy em VPS própria (app + WAHA + banco), `baseline.sql` auto-curativo, runbook de produção. Trigger de deploy ainda manual; automação é próximo passo.
- **Webhooks & automação** — fontes de captação + regras QUANDO/SE/ENTÃO + gatilhos pra sistemas externos.
- **Governança de atendimento** — RBAC server-side em toda a API, atribuição e transferência auditadas (IA como assignee de 1ª classe), visualização por papel (RLS) + métricas por atendente, roteamento automático com fila e painel de gestão, e contrato de governança pra agentes de IA externos ([`docs/specs/14`](docs/specs/14-contrato-governanca-agentes-externos.md)). Épico guiado por 100+ invariantes (G1–G6).
- **Operação visível** — telas pro operador entender o agente: motivo da retenção anti-ban traduzido na conversa, central de avisos com severidade, controle de proteção de envio (janela/ritmo/teto) e propostas do flywheel aplicáveis como versão nova (com gate humano).

### 🔮 Próximo

- **Automação do deploy** — hoje o "clicar pra implantar" é manual; automatizar o gatilho (push/merge → deploy) é a próxima frente de infra.
- **Definição formal de papéis LGPD (controlador/operador) sob o modelo SaaS** — o texto antigo assumia cada cliente controlando a própria instância; agora que hospedamos, os termos de tratamento de dados precisam ser redesenhados.
- **MCP público** — capabilities do CRM expostas pro ecossistema de agentes: plugue o agente que quiser e ele opera o Deskcomm.
- **Flywheel de auto-aprimoramento** — o loop conversa resolvida → conhecimento → agente melhor, medido e com gate humano.
- **Templates por nicho** — pipelines e vocabulários prontos pra clínica, imobiliária, infoproduto e serviços (e-commerce já entregue).
- **Integrações** — VTEX e Shopify via adapter pattern (Nuvemshop já entregue).
- **Identity probabilística** — unificação de contatos entre canais.

---

## 📜 Licença do código-fonte

O código-base tem origem numa distribuição sob licença **MIT** (ver [`LICENSE`](LICENSE)) —
o aviso de copyright original é preservado no arquivo por obrigação da própria licença.
O repositório é privado e o produto é comercializado como SaaS pago; isso não altera a
obrigação de manter o aviso de copyright no software. Questões de marca/trademark do nome
do projeto original, se houver, seguem em avaliação separada da licença de código.

---

## 🙏 Agradecimentos

- **WAHA** ([devlikeapro](https://waha.devlikeapro.com/)) — engine WhatsApp.
- **Supabase** — Postgres + Auth + Storage + Realtime numa stack só.
- **Vercel** — hosting + AI Gateway.
- **Anthropic** (Claude) — IA conversacional.
- **shadcn/ui** — base de componentes.
- Os primeiros clientes que nos levaram do e-commerce pra clínicas, imobiliárias, infoprodutos e além — vocês definiram o que este projeto é.

---

<div align="center">

**Built with ☕ in Brasil**

</div>
