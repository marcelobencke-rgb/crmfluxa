# scripts/

CLI utilities pra operação local e de produção.

## Lista

- `seed-tenant.ts` — Cria um tenant manualmente (modo BPO). Placeholder; implementação na Spec 01.
- `reset-homolog-keep-org.ts` — Zera dado de teste em homologação mantendo 1 organization + usuário(s). Dry-run por padrão; `--confirm --keep-org=<id-ou-slug>` executa via REST, tabela por tabela, em ordem verificada contra as FKs reais (sem transação única — a conexão direta ao Postgres é IPv6-only e pode não resolver local).

## Convenções

- Todos em TypeScript (executar via `npx tsx scripts/<nome>.ts`)
- Sempre validar input com Zod
- Logar via `console.error` (stderr) pra mensagens operacionais; `console.log` (stdout) só pra output estruturado consumível por pipe
- Operações destrutivas exigem flag `--confirm` ou prompt interativo
- Toda mutação relevante gera entrada em `api_audit_log` com `actor=script:<nome>`
