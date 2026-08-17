---
title: "Spec Técnica 18 — Catálogo (Produtos/Serviços) + Agendamento + Sync Google Agenda"
parent: 00-prd-master.md
type: spec
status: draft (pre-implementation)
version: 0.1
owner: Rafael Melgaço
date: 2026-08-16
depends_on: 01-spec-platform-base.md, 02-spec-customer-360.md, 03-spec-whatsapp-waha.md, 07-spec-events-workers.md, 11-spec-mcp-server-internal.md
related:
  - 04-spec-pipeline-attendance.md
  - 06-spec-nuvemshop-lgpd.md
---

# Spec 18 — Catálogo + Agendamento + Sync Google Agenda

> Módulo pra nichos onde o agendamento é o produto (barbearia, clínica de estética, consultório):
> catálogo de produtos/serviços, disponibilidade por profissional/sala, agendamento com trava
> anti-double-booking no banco, e sincronização bilateral com Google Agenda. Desenhado em sessão de
> brainstorm em 2026-08-16 (ver histórico de conversa — não há doc de brainstorm separado).

---

## 1. Visão geral

`VISION.md` já mira multi-nicho (e-commerce, clínicas, imobiliárias, infoprodutos, serviços).
Clínicas e barbearias têm uma necessidade que o pipeline genérico não cobre: **o próprio agente de
IA precisa marcar, remarcar e cancelar horário durante a conversa de WhatsApp**, sem fricção humana.
Isso exige três coisas que não existem hoje:

1. Um catálogo nativo de produtos/serviços com preço e duração (`nuvemshop_products` existe mas é
   específico do provider Nuvemshop — não serve pra quem não usa Nuvemshop).
2. Um modelo de agendamento com trava de conflito real (dois profissionais não podem ocupar o mesmo
   horário — e isso precisa ser garantido pelo banco, não só pela aplicação, porque o agente de IA e
   um humano podem tentar marcar ao mesmo tempo).
3. Sync bilateral com Google Agenda — a maioria desses negócios já usa Google Agenda no dia a dia;
   pedir que o profissional passe a olhar duas agendas é fricção que mata adoção.

**Decisão de escopo**: 1 agendamento = 1 serviço (`crm_appointments.product_id` é `1:1`, não
lista). Pacote de serviços no mesmo horário fica pra depois (ver §9).

---

## 2. Modelo de dados

Ordem de criação (respeita FK): `crm_products` → `crm_resources` → `crm_resource_services` →
`crm_resource_availability` → `crm_resource_time_off` → `crm_calendar_connections` →
`crm_appointments`.

Extensão nova exigida: `btree_gist` (pra exclusion constraint de disponibilidade — ver §2.6). Entra
no baseline junto com as tabelas, com `create extension if not exists`.

Todas as tabelas abaixo levam RLS `tenant_isolation_<tabela>_all` via `fn_user_org_ids()` (padrão do
resto do schema — ver `crm_leads` em `baseline.sql:3519`), exceto `crm_calendar_connections`, que
guarda credencial e por isso é admin-only (ver §2.7).

### 2.1 `crm_products` — catálogo

```sql
create table public.crm_products (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  type                text not null,                    -- 'product' | 'service'
  name                text not null,
  description         text,

  price_cents         bigint not null,
  currency            text default 'BRL',
  sku                 text,

  requires_scheduling boolean not null default false,    -- só relevante quando type='service'
  duration_minutes    integer,

  custom_fields       jsonb not null default '{}'::jsonb,
  tags                text[] not null default '{}',

  rag_indexed_at      timestamptz,                       -- mesmo mecanismo do nuvemshop_products:
  rag_chunk_count     integer not null default 0,        -- agente responde "quanto custa X" via RAG

  is_active           boolean not null default true,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by_user_id  uuid,

  constraint crm_products_type_enum
    check (type in ('product','service')),
  constraint crm_products_price_cents_check
    check (price_cents >= 0),
  constraint crm_products_currency_iso
    check (currency is null or currency ~ '^[A-Z]{3}$'),
  constraint crm_products_duration_requires_scheduling
    check (not requires_scheduling or duration_minutes is not null),
  constraint crm_products_duration_positive
    check (duration_minutes is null or duration_minutes > 0)
);

create index idx_crm_products_org_active on public.crm_products (organization_id, is_active) where is_active;
create index idx_crm_products_org_type   on public.crm_products (organization_id, type);
create index idx_crm_products_tags_gin   on public.crm_products using gin (tags);
create unique index uniq_crm_products_org_sku
  on public.crm_products (organization_id, sku) where sku is not null;

alter table public.crm_products enable row level security;
create policy tenant_isolation_crm_products_all on public.crm_products
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

create trigger trg_crm_products_updated_at before update on public.crm_products
  for each row execute function fn_set_updated_at();
```

DIRC: não duplica `nuvemshop_products` — fonte diferente (cadastro manual vs. sync de provider
externo). Unificação num catálogo só faz sentido se um tenant usar as duas fontes ao mesmo tempo;
ninguém pediu isso ainda (§9).

### 2.2 `crm_resources` — quem/o que é agendável

```sql
create table public.crm_resources (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  type              text not null,                  -- 'professional' | 'room' | 'equipment'
  name              text not null,
  user_id           uuid references auth.users(id) on delete set null,
  color             text,
  is_active         boolean not null default true,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  constraint crm_resources_type_enum
    check (type in ('professional','room','equipment')),
  constraint crm_resources_color_format
    check (color is null or color ~ '^#[0-9a-fA-F]{6}$')
);

create index idx_crm_resources_org_active on public.crm_resources (organization_id, is_active) where is_active;

alter table public.crm_resources enable row level security;
create policy tenant_isolation_crm_resources_all on public.crm_resources
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

create trigger trg_crm_resources_updated_at before update on public.crm_resources
  for each row execute function fn_set_updated_at();
```

### 2.3 `crm_resource_services` — quais recursos fazem quais serviços

```sql
create table public.crm_resource_services (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  resource_id                 uuid not null references public.crm_resources(id) on delete cascade,
  product_id                  uuid not null references public.crm_products(id) on delete cascade,

  duration_minutes_override   integer,   -- profissional sênior pode ser mais rápido/lento
  price_cents_override        bigint,    -- ou cobrar diferente

  created_at                  timestamptz not null default now(),

  constraint crm_resource_services_duration_positive
    check (duration_minutes_override is null or duration_minutes_override > 0),
  constraint crm_resource_services_price_positive
    check (price_cents_override is null or price_cents_override >= 0)
);

create unique index uniq_crm_resource_services_resource_product
  on public.crm_resource_services (resource_id, product_id);

alter table public.crm_resource_services enable row level security;
create policy tenant_isolation_crm_resource_services_all on public.crm_resource_services
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());
```

### 2.4 `crm_resource_availability` — grade semanal recorrente

```sql
create table public.crm_resource_availability (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  resource_id       uuid not null references public.crm_resources(id) on delete cascade,

  weekday           smallint not null,     -- 0=domingo .. 6=sábado (ISO seria 1-7; usamos 0-6 estilo JS Date#getDay, documentar na UI)
  start_time        time not null,
  end_time          time not null,

  created_at        timestamptz not null default now(),

  constraint crm_resource_availability_weekday_range check (weekday between 0 and 6),
  constraint crm_resource_availability_time_order check (start_time < end_time)
);

create index idx_crm_resource_availability_resource_weekday
  on public.crm_resource_availability (resource_id, weekday);

alter table public.crm_resource_availability enable row level security;
create policy tenant_isolation_crm_resource_availability_all on public.crm_resource_availability
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());
```

### 2.5 `crm_resource_time_off` — bloqueios pontuais

```sql
create table public.crm_resource_time_off (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  resource_id         uuid references public.crm_resources(id) on delete cascade, -- null = feriado da org inteira

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  reason              text,

  created_at          timestamptz not null default now(),
  created_by_user_id  uuid,

  constraint crm_resource_time_off_range check (starts_at < ends_at)
);

create index idx_crm_resource_time_off_resource_range
  on public.crm_resource_time_off using gist (resource_id, tstzrange(starts_at, ends_at));

alter table public.crm_resource_time_off enable row level security;
create policy tenant_isolation_crm_resource_time_off_all on public.crm_resource_time_off
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());
```

### 2.6 `crm_appointments` — o agendamento

```sql
create table public.crm_appointments (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  lead_id             uuid references public.crm_leads(id) on delete set null,
  contact_id          uuid references public.contacts(id) on delete set null,
  resource_id         uuid not null references public.crm_resources(id) on delete restrict,
  product_id          uuid references public.crm_products(id) on delete restrict,

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,

  status              text not null default 'scheduled',
  cancel_reason       text,

  source              text not null default 'manual',
  is_external_block   boolean not null default false,   -- evento importado do Google sem sentido de negócio (§4)

  notes               text,
  custom_fields       jsonb not null default '{}'::jsonb,

  external_calendar_connection_id  uuid references public.crm_calendar_connections(id) on delete set null,
  external_calendar_event_id       text,
  external_calendar_sync_status    text,
  external_calendar_synced_at      timestamptz,
  external_calendar_sync_error     text,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by_user_id  uuid,

  constraint crm_appointments_range check (starts_at < ends_at),
  constraint crm_appointments_status_enum
    check (status in ('scheduled','confirmed','completed','cancelled','no_show')),
  constraint crm_appointments_cancel_reason_required
    check (status <> 'cancelled' or cancel_reason is not null),
  constraint crm_appointments_source_enum
    check (source in ('manual','agent','public_link','google_import')),
  constraint crm_appointments_block_or_product
    check (is_external_block or product_id is not null),
  constraint crm_appointments_sync_status_enum
    check (external_calendar_sync_status is null or external_calendar_sync_status in ('pending','synced','error')),

  -- invariante central: mesmo recurso não pode ter dois agendamentos ativos que se sobrepõem no tempo.
  -- travado no banco, não só na aplicação, porque agente de IA + humano podem escrever ao mesmo tempo.
  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelled','no_show'))
);

create index idx_crm_appointments_org_starts     on public.crm_appointments (organization_id, starts_at);
create index idx_crm_appointments_lead           on public.crm_appointments (lead_id) where lead_id is not null;
create index idx_crm_appointments_resource_starts on public.crm_appointments (resource_id, starts_at);
create unique index uniq_crm_appointments_external_event
  on public.crm_appointments (external_calendar_connection_id, external_calendar_event_id)
  where external_calendar_event_id is not null;

alter table public.crm_appointments enable row level security;
create policy tenant_isolation_crm_appointments_all on public.crm_appointments
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

create trigger trg_crm_appointments_updated_at before update on public.crm_appointments
  for each row execute function fn_set_updated_at();
```

### 2.7 `crm_calendar_connections` — credencial de sync (§4)

```sql
create table public.crm_calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  resource_id           uuid references public.crm_resources(id) on delete cascade, -- null = agenda única da org

  provider              text not null default 'google',   -- vocabulário aberto (texto+check, não enum) — mesmo padrão do resto do schema
  external_calendar_id  text not null,

  -- bytea cifrado por fn_encrypt_oauth/fn_decrypt_oauth (mesma RPC que tenant_integrations,
  -- channel_sessions e webhook_sources já usam — ver §4.4). Mesmo naming de tenant_integrations
  -- de propósito: é o mesmo mecanismo, não um paralelo.
  oauth_access_token_encrypted   bytea not null,
  oauth_refresh_token_encrypted  bytea,
  token_expires_at               timestamptz,

  sync_token             text,            -- nextSyncToken do Google, pra pull incremental
  watch_channel_id       text,
  watch_channel_token_encrypted bytea,     -- segredo que a gente gera; valida o webhook do Google (§4.3) — mesma RPC de cifra
  watch_expires_at       timestamptz,      -- canal expira em até 30 dias, precisa renovar

  status                text not null default 'connected',
  last_synced_at        timestamptz,
  last_error            text,

  connected_by_user_id  uuid,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now(),

  constraint crm_calendar_connections_provider_enum check (provider in ('google')),
  constraint crm_calendar_connections_status_enum check (status in ('connected','disconnected','error'))
);

create unique index uniq_crm_calendar_connections_resource
  on public.crm_calendar_connections (organization_id, resource_id) where resource_id is not null;
create unique index uniq_crm_calendar_connections_org_default
  on public.crm_calendar_connections (organization_id) where resource_id is null;

alter table public.crm_calendar_connections enable row level security;

-- admin-only, não tenant_isolation_all: guarda credencial (mesmo padrão de api_tokens_admin_only)
create policy crm_calendar_connections_admin_only on public.crm_calendar_connections
  using (fn_role_at_least(organization_id, 'admin') or fn_is_platform_admin())
  with check (fn_role_at_least(organization_id, 'admin') or fn_is_platform_admin());

create trigger trg_crm_calendar_connections_updated_at before update on public.crm_calendar_connections
  for each row execute function fn_set_updated_at();
```

`oauth_access_token_encrypted`/`oauth_refresh_token_encrypted` **nunca** aparecem em resposta de
API, nem pra `admin` — a rota de status de conexão devolve só `{ status, external_calendar_id,
last_synced_at, last_error }`. Detalhe de criptografia em §4.4.

---

## 3. Integração com o que já existe

- `crm_lead_links.target_kind` **já reserva `'appointment'`** no CHECK (`baseline.sql:1459`, nunca
  usado até hoje). Todo `crm_appointments` com `lead_id` não nulo ganha 1 linha em `crm_lead_links`
  (`target_kind='appointment'`, `link_kind='primary'`).
- Toda mudança relevante (`criado` / `remarcado` / `cancelado`) gera 1 linha em
  `crm_lead_activities` (`source_module='agendamento'`) — é o requisito de timeline visível do
  Sistema Vivo (DoD item 13), e cobre tanto mudança feita no Fluxa quanto mudança importada do
  Google (§4.2) — a origem não pode ser invisível.
- Lembrete de agendamento segue o padrão de `event_log` já estabelecido pela Spec 07: trigger emite
  `appointment.reminder_due` (nunca HTTP no trigger), um worker cron no mesmo padrão de
  `recover-stuck-messages`/`followup-flow-worker` consome e dispara envio via WAHA.

```sql
create or replace function public.fn_crm_appointment_activity() returns trigger
language plpgsql as $$
declare
  v_activity_type text;
begin
  if tg_op = 'INSERT' then
    v_activity_type := case when new.is_external_block then null else 'appointment_scheduled' end;
  elsif old.status <> 'cancelled' and new.status = 'cancelled' then
    v_activity_type := 'appointment_cancelled';
  elsif old.starts_at <> new.starts_at or old.ends_at <> new.ends_at then
    v_activity_type := 'appointment_rescheduled';
  else
    return new;  -- mudança irrelevante pra timeline (ex.: só sync_status)
  end if;

  if new.lead_id is not null then
    if tg_op = 'INSERT' then
      insert into crm_lead_links (organization_id, lead_id, target_kind, target_id, link_kind)
      values (new.organization_id, new.lead_id, 'appointment', new.id, 'primary')
      on conflict do nothing;
    end if;

    if v_activity_type is not null then
      insert into crm_lead_activities
        (organization_id, lead_id, contact_id, source_module, source_id, type, payload)
      values (
        new.organization_id, new.lead_id, new.contact_id, 'agendamento', new.id, v_activity_type,
        jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at, 'resource_id', new.resource_id)
      );
    end if;
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_crm_appointment_activity() from public, anon;
-- sem grant explícito: só chamada via trigger, nunca via RPC direto

create trigger trg_crm_appointment_activity after insert or update on public.crm_appointments
  for each row execute function fn_crm_appointment_activity();
```

Emissão de evento pro worker de push (Google) é uma função **separada** da de atividade — ver §4.1,
porque essa precisa checar a variável de sessão que evita eco (§4.3).

---

## 4. Sync bilateral com Google Agenda

### 4.1 Push (local → Google)

Trigger emite em `event_log`, nunca chama a API do Google direto (doutrina: trigger não faz HTTP).

```sql
create or replace function public.fn_emit_appointment_calendar_event() returns trigger
language plpgsql as $$
begin
  -- pulney a emissão quando a escrita veio do próprio worker de pull — evita ping-pong infinito (§4.3)
  if current_setting('fluxa.sync_origin', true) = 'google_pull' then
    return new;
  end if;

  if new.is_external_block then
    return new;  -- bloqueio importado nunca é reenviado
  end if;

  insert into event_log (organization_id, event_type, entity_kind, entity_id, payload)
  values (
    new.organization_id,
    case when new.status = 'cancelled' then 'appointment.cancelled' else 'appointment.upserted' end,
    'appointment', new.id,
    jsonb_build_object('appointment_id', new.id, 'resource_id', new.resource_id)
  );
  return new;
end;
$$;

revoke execute on function public.fn_emit_appointment_calendar_event() from public, anon;

create trigger trg_emit_appointment_calendar_event after insert or update on public.crm_appointments
  for each row execute function fn_emit_appointment_calendar_event();
```

Worker (`calendar-sync-push`, mesma família dos workers da Spec 07) consome `appointment.upserted` /
`appointment.cancelled`: busca a `crm_calendar_connections` do `resource_id`; se não houver conexão
ativa, marca o evento como consumido sem fazer nada (recurso sem Google Agenda conectada); se
houver, chama `events.insert` (1ª vez) ou `events.patch`/`events.delete` (já tem
`external_calendar_event_id`), e grava `external_calendar_event_id` / `external_calendar_sync_status`
de volta.

### 4.2 Pull (Google → local)

Dois mecanismos — o segundo cobre o primeiro, porque cron em VPS self-host é conhecido por ficar
adormecido às vezes (`docs/current-state.md` já documenta isso pros outros workers; este módulo
herda o mesmo risco operacional, não inventa um novo):

1. **Webhook** (`events.watch`) — Google faz POST em
   `/api/v1/integrations/google-calendar/webhook` quando algo muda. O corpo **não** traz o que
   mudou (design do Google, anti-spoofing) — só avisa "algo mudou". O handler valida o header
   `X-Goog-Channel-Token` contra `crm_calendar_connections.watch_channel_token` (equivalente ao HMAC
   do WAHA, adaptado — Google não assina o corpo) e emite `event_log`
   (`calendar_connection.sync_requested`).
2. **Poll de segurança** — cron a cada ~15min varre conexões `status='connected'` e força sync
   mesmo sem webhook (cobre VPS sem domínio público, ou canal expirado sem renovar).

O worker de pull sempre usa `sync_token` (incremental); se o Google responder `410 Gone` (token
inválido/expirado), faz full resync de uma janela (próximos 90 dias) e reconcilia. Pra cada evento
do Google:

- **Não tem `crm_appointments` correspondente** (evento pessoal do profissional, ex. "dentista") →
  insere com `lead_id=null`, `product_id=null`, `is_external_block=true`, `source='google_import'`.
  Ocupa o horário pro cálculo de disponibilidade sem aparecer como agendamento de negócio — na UI,
  mostra cinza "Ocupado (Google Agenda)".
- **Já tem correspondente** (`external_calendar_event_id` bate) e o Google mostra `status:
  cancelled` → local vira `status='cancelled', cancel_reason='synced_from_google'`.
- **Já tem correspondente** e horário mudou → atualiza `starts_at`/`ends_at` local.

Toda escrita do worker de pull entra dentro de `SET LOCAL fluxa.sync_origin = 'google_pull'` na
mesma transação (§4.3) — e ainda assim passa por `fn_crm_appointment_activity` normalmente, porque
mudança vinda de fora **precisa** aparecer na timeline (§3); só a reemissão pro Google é que é
pulada.

Se a inserção/update do worker de pull violar a exclusion constraint (double-booking real, alguém
marcou os dois lados no mesmo horário) — não silenciar: a linha falha, o worker grava
`crm_calendar_connections.last_error` e o evento fica pendente de reconciliação manual. Overbooking
detectado é sinal, não bug a esconder.

### 4.3 Loop de eco

Variável de sessão Postgres evita recursão: pull faz `SET LOCAL fluxa.sync_origin = 'google_pull'`
antes de escrever; o trigger de push (§4.1) checa essa config e não reemite quando a escrita veio do
pull. Técnica padrão pra evitar trigger disparando o próprio disparador.

### 4.4 Segurança de token

Bearer token de API do Fluxa vira hash SHA256 porque só precisa ser *comparado* (doutrina
existente). Token OAuth do Google precisa ser *reutilizado* — não dá pra fazer hash.

**Não inventa cifra nova.** O repo já tem `fn_encrypt_oauth(text) returns bytea` /
`fn_decrypt_oauth(bytea) returns text` (`baseline.sql`, migration `0006_nuvemshop_lgpd`,
retrofit de chave em `pgp_sym_encrypt`/AES-256 via `pgcrypto`, GRANT só pra `service_role`) — é o
mesmo mecanismo que `tenant_integrations` (Nuvemshop) e `channel_sessions` (canal oficial Meta) já
usam pra token OAuth, e `webhook_sources`/regras `call_webhook` usam pra secret de webhook.
DIRC: **integrar**, não duplicar — um segundo esquema de cripto seria um segundo lugar pra chave
vazar. `crm_calendar_connections.oauth_access_token_encrypted` (e os outros campos `bytea`) são
gravados chamando essa RPC a partir do backend (`lib/webhooks/secrets.ts` já expõe
`encryptWebhookSecret`/`decryptWebhookSecret` como wrapper fino sobre ela — a integração do Google
Agenda reusa essas funções ou adiciona alias com nome mais claro pro contexto, sem duplicar lógica).

Consequência prática: **nenhuma env var nova de criptografia**. A chave já existe
(`NUVEMSHOP_OAUTH_ENCRYPTION_KEY` / GUC `app.nuvemshop_oauth_key`, nome legado mas já é o segredo
compartilhado de todo esse mecanismo no repo, não algo exclusivo do Nuvemshop). Só entram env vars
novas pro OAuth em si: `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET`. **Toda a integração
é opcional por padrão** (eixo self-host, regra nº1): sem essas duas envs, o botão "Conectar Google
Agenda" não aparece, e instalação fresca continua funcionando. Entram em `.env.example` como
comentadas/opcionais e em `lib/env.ts` como `.optional()`.

### 4.5 Abstração de provider

Isolado atrás de uma interface (`lib/integrations/calendar/provider.ts`:
`createEvent/updateEvent/deleteEvent/listChanges/watch/stopWatch`), Google como única implementação
hoje. Mesmo espírito do isolamento de canal em `lib/channels/` pro WhatsApp — mas sem o lint
dedicado (`lint:channels` é específico de canal de comunicação, não se estende aqui).

---

## 5. API REST (`/api/v1/`)

Contrato no nível da Spec 01 (`ok()`/`fail()`, paginação cursor, `Idempotency-Key` em POST,
auth dual cookie/bearer):

| Rota | Método | Nota |
|---|---|---|
| `/api/v1/products` | GET, POST | catálogo |
| `/api/v1/products/:id` | GET, PATCH, DELETE | |
| `/api/v1/resources` | GET, POST | profissionais/salas |
| `/api/v1/resources/:id/services` | GET, POST, DELETE | vínculo com catálogo |
| `/api/v1/resources/:id/availability` | GET, PUT | grade semanal (substitui tudo, idempotente) |
| `/api/v1/resources/:id/time-off` | GET, POST, DELETE | |
| `/api/v1/appointments` | GET, POST | filtros: `resource_id`, `lead_id`, `starts_at` range |
| `/api/v1/appointments/:id` | GET, PATCH | PATCH cobre remarcar e cancelar (`status`) |
| `/api/v1/appointments/available-slots` | GET | `resource_id` + `product_id` + range de data → slots livres |
| `/api/v1/integrations/google-calendar/connect` | GET | inicia OAuth (`admin` only — `Changing account settings`) |
| `/api/v1/integrations/google-calendar/callback` | GET | troca code por token |
| `/api/v1/integrations/google-calendar/webhook` | POST | recebe notificação do Google (§4.2) |
| `/api/v1/integrations/google-calendar/:connectionId` | GET, DELETE | status / desconectar |

`available-slots` e `webhook` são as rotas críticas de novo comportamento — ambas precisam de rate
limit (a primeira é pública o bastante pra ser chamada pelo agente com frequência; a segunda recebe
tráfego externo do Google).

---

## 6. MCP tools pro agente (Spec 11)

- `list_available_slots(resource_id?, product_id, date_from, date_to)` — se `resource_id` omitido,
  retorna o primeiro profissional livre que faz o serviço.
- `create_appointment(lead_id, resource_id, product_id, starts_at)` — `source='agent'`.
- `reschedule_appointment(appointment_id, starts_at)`.
- `cancel_appointment(appointment_id, reason)`.

Todas passam pela mesma exclusion constraint do banco — o agente não tem via especial que ignore a
trava.

---

## 7. LGPD

`fn_...anonymize_contact` (baseline.sql, cascata atual: contact → conversations → messages →
crm_lead_activities → crm_leads) precisa ganhar um passo 6: `crm_appointments` com `contact_id =
p_contact_id` tem `notes` e `custom_fields` limpos, mas **preserva** `starts_at`/`ends_at`/`status`
(mesmo princípio de `crm_leads`: histórico operacional sobrevive, dado pessoal não). Isso é mudança
na função existente, não tabela nova — sai como forward-fix quando o módulo for implementado, não
faz parte desta spec de schema novo.

---

## 8. Regra de negócio nova (candidata a `docs/business-rules/`)

Anti-double-booking: um recurso não pode ter dois agendamentos ativos (`status not in ('cancelled',
'no_show')`) que se sobrepõem no tempo — garantido por exclusion constraint, não só validação de
app. Cancelamento requer motivo (`cancel_reason`). Evento importado do Google sem serviço associado
é só bloqueio de agenda, não conta como venda.

---

## 9. Fica pra depois (fora desta spec)

- `crm_lead_items` (linha de pedido com snapshot de preço) — só necessário quando um agendamento
  vende mais de um serviço junto. `crm_leads.value_cents` manual resolve o MVP.
- Agendamento com mais de um `product_id` (pacote de serviços num horário só) — decisão explícita
  do usuário em 2026-08-16: começar 1:1.
- Vocabulário de "agendamento" customizável por nicho (tipo `crm_pipelines.vocabulary`) — cosmético.
- Unificar `crm_products` com `nuvemshop_products` num catálogo único.
- Sync com Outlook/Apple Calendar — a interface em `lib/integrations/calendar/` já deixa a porta
  aberta, mas não implementa.
- Renovação automática de `watch_channel_id` antes de expirar — cron simples, mecânica, não decisão
  de design; entra junto da implementação do worker de pull.

---

## 10. Definition of Done (herda o geral do `CLAUDE.md`, mais o específico daqui)

1. `create extension if not exists btree_gist` aplicado antes das tabelas que dependem dele.
2. Exclusion constraint provada com teste que tenta inserir dois agendamentos sobrepostos no mesmo
   `resource_id` e espera erro — não só teste do caminho feliz.
3. RLS testada nas 7 tabelas (isolamento entre 2 orgs) + a política admin-only de
   `crm_calendar_connections` testada separadamente (viewer/agent não deve conseguir ler nem
   escrever).
4. Todas as `create function` novas (`fn_crm_appointment_activity`,
   `fn_emit_appointment_calendar_event`, e as que vierem no worker) passam por
   `tests/invariants/hardening-definer-varredura.test.ts` sem aparecer expostas.
5. Sync testado nos dois sentidos com credencial de teste real (doutrina de QA Visual — curl não
   prova, precisa ser pela tela: conectar conta Google de teste, criar agendamento no Fluxa, ver
   aparecer no Google; criar evento no Google, ver aparecer no Fluxa).
6. Teste de loop de eco: editar um agendamento importado do Google e confirmar que **não** dispara
   um push de volta pro Google.
7. `GOOGLE_OAUTH_CLIENT_ID` / `GOOGLE_OAUTH_CLIENT_SECRET` ausentes → app sobe normalmente, botão de
   conectar não aparece (prova de instalação fresca sem essas envs). Sem chave de criptografia nova
   pra testar — reusa a que já existe.
8. Migration versionada + apêndice idempotente no `baseline.sql` + linha no `MANIFEST.md` (doutrina
   de migrations do `CLAUDE.md`) — validado com `install` e `update` num Postgres descartável.
