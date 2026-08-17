-- Migration 0146 — Catálogo (produtos/serviços) + Agendamento + sync Google Agenda
--
-- Spec: docs/specs/18-spec-agendamento-catalogo.md
--
-- 7 tabelas novas, todas RLS tenant-aware exceto crm_calendar_connections (admin-only,
-- guarda credencial). Extension nova: btree_gist (exclusion constraint anti-double-booking).
--
-- Reaproveita fn_encrypt_oauth/fn_decrypt_oauth (migration 0006) pra cifrar token do Google —
-- nenhuma cifra nova, nenhuma env var nova de chave (ver spec §4.4). crm_lead_links já reserva
-- 'appointment' em target_kind desde a migration 0003; nunca usado até aqui.

create extension if not exists btree_gist with schema public;

-- ============================================================================
-- 1. crm_products — catálogo de produtos/serviços
-- ============================================================================

create table if not exists public.crm_products (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,

  type                text not null,
  name                text not null,
  description         text,

  price_cents         bigint not null,
  currency            text default 'BRL',
  sku                 text,

  requires_scheduling boolean not null default false,
  duration_minutes    integer,

  custom_fields       jsonb not null default '{}'::jsonb,
  tags                text[] not null default '{}',

  rag_indexed_at      timestamptz,
  rag_chunk_count     integer not null default 0,

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

create index if not exists idx_crm_products_org_active on public.crm_products (organization_id, is_active) where is_active;
create index if not exists idx_crm_products_org_type   on public.crm_products (organization_id, type);
create index if not exists idx_crm_products_tags_gin   on public.crm_products using gin (tags);
create unique index if not exists uniq_crm_products_org_sku
  on public.crm_products (organization_id, sku) where sku is not null;

alter table public.crm_products enable row level security;

drop policy if exists tenant_isolation_crm_products_all on public.crm_products;
create policy tenant_isolation_crm_products_all on public.crm_products
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

drop trigger if exists trg_crm_products_updated_at on public.crm_products;
create trigger trg_crm_products_updated_at before update on public.crm_products
  for each row execute function fn_set_updated_at();

-- ============================================================================
-- 2. crm_resources — profissionais / salas / equipamentos agendáveis
-- ============================================================================

create table if not exists public.crm_resources (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,

  type              text not null,
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

create index if not exists idx_crm_resources_org_active on public.crm_resources (organization_id, is_active) where is_active;

alter table public.crm_resources enable row level security;

drop policy if exists tenant_isolation_crm_resources_all on public.crm_resources;
create policy tenant_isolation_crm_resources_all on public.crm_resources
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

drop trigger if exists trg_crm_resources_updated_at on public.crm_resources;
create trigger trg_crm_resources_updated_at before update on public.crm_resources
  for each row execute function fn_set_updated_at();

-- ============================================================================
-- 3. crm_resource_services — quais recursos fazem quais serviços
-- ============================================================================

create table if not exists public.crm_resource_services (
  id                          uuid primary key default gen_random_uuid(),
  organization_id             uuid not null references public.organizations(id) on delete cascade,
  resource_id                 uuid not null references public.crm_resources(id) on delete cascade,
  product_id                  uuid not null references public.crm_products(id) on delete cascade,

  duration_minutes_override   integer,
  price_cents_override        bigint,

  created_at                  timestamptz not null default now(),

  constraint crm_resource_services_duration_positive
    check (duration_minutes_override is null or duration_minutes_override > 0),
  constraint crm_resource_services_price_positive
    check (price_cents_override is null or price_cents_override >= 0)
);

create unique index if not exists uniq_crm_resource_services_resource_product
  on public.crm_resource_services (resource_id, product_id);

alter table public.crm_resource_services enable row level security;

drop policy if exists tenant_isolation_crm_resource_services_all on public.crm_resource_services;
create policy tenant_isolation_crm_resource_services_all on public.crm_resource_services
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

-- ============================================================================
-- 4. crm_resource_availability — grade semanal recorrente
-- ============================================================================

create table if not exists public.crm_resource_availability (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  resource_id       uuid not null references public.crm_resources(id) on delete cascade,

  weekday           smallint not null,
  start_time        time not null,
  end_time          time not null,

  created_at        timestamptz not null default now(),

  constraint crm_resource_availability_weekday_range check (weekday between 0 and 6),
  constraint crm_resource_availability_time_order check (start_time < end_time)
);

create index if not exists idx_crm_resource_availability_resource_weekday
  on public.crm_resource_availability (resource_id, weekday);

alter table public.crm_resource_availability enable row level security;

drop policy if exists tenant_isolation_crm_resource_availability_all on public.crm_resource_availability;
create policy tenant_isolation_crm_resource_availability_all on public.crm_resource_availability
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

-- ============================================================================
-- 5. crm_resource_time_off — bloqueios pontuais (férias, feriado, imprevisto)
-- ============================================================================

create table if not exists public.crm_resource_time_off (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  resource_id         uuid references public.crm_resources(id) on delete cascade,

  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  reason              text,

  created_at          timestamptz not null default now(),
  created_by_user_id  uuid,

  constraint crm_resource_time_off_range check (starts_at < ends_at)
);

create index if not exists idx_crm_resource_time_off_resource_range
  on public.crm_resource_time_off using gist (resource_id, tstzrange(starts_at, ends_at));

alter table public.crm_resource_time_off enable row level security;

drop policy if exists tenant_isolation_crm_resource_time_off_all on public.crm_resource_time_off;
create policy tenant_isolation_crm_resource_time_off_all on public.crm_resource_time_off
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

-- ============================================================================
-- 6. crm_calendar_connections — credencial de sync Google Agenda (admin-only)
-- ============================================================================

create table if not exists public.crm_calendar_connections (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade,
  resource_id           uuid references public.crm_resources(id) on delete cascade,

  provider              text not null default 'google',
  external_calendar_id  text not null,

  -- bytea cifrado por fn_encrypt_oauth/fn_decrypt_oauth (migration 0006) — mesmo mecanismo que
  -- tenant_integrations e channel_sessions já usam pra token OAuth. Sem cifra nova, sem env nova.
  oauth_access_token_encrypted   bytea not null,
  oauth_refresh_token_encrypted  bytea,
  token_expires_at               timestamptz,

  sync_token                     text,
  watch_channel_id               text,
  watch_channel_token_encrypted  bytea,
  watch_expires_at               timestamptz,

  status                 text not null default 'connected',
  last_synced_at         timestamptz,
  last_error             text,

  connected_by_user_id   uuid,
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),

  constraint crm_calendar_connections_provider_enum check (provider in ('google')),
  constraint crm_calendar_connections_status_enum check (status in ('connected','disconnected','error'))
);

create unique index if not exists uniq_crm_calendar_connections_resource
  on public.crm_calendar_connections (organization_id, resource_id) where resource_id is not null;
create unique index if not exists uniq_crm_calendar_connections_org_default
  on public.crm_calendar_connections (organization_id) where resource_id is null;

alter table public.crm_calendar_connections enable row level security;

drop policy if exists crm_calendar_connections_admin_only on public.crm_calendar_connections;
create policy crm_calendar_connections_admin_only on public.crm_calendar_connections
  using (fn_role_at_least(organization_id, 'admin') or fn_is_platform_admin())
  with check (fn_role_at_least(organization_id, 'admin') or fn_is_platform_admin());

drop trigger if exists trg_crm_calendar_connections_updated_at on public.crm_calendar_connections;
create trigger trg_crm_calendar_connections_updated_at before update on public.crm_calendar_connections
  for each row execute function fn_set_updated_at();

-- ============================================================================
-- 7. crm_appointments — o agendamento (1 serviço : 1 horário : 1 recurso)
-- ============================================================================

create table if not exists public.crm_appointments (
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

  source               text not null default 'manual',
  is_external_block    boolean not null default false,

  notes                text,
  custom_fields        jsonb not null default '{}'::jsonb,

  external_calendar_connection_id  uuid references public.crm_calendar_connections(id) on delete set null,
  external_calendar_event_id       text,
  external_calendar_sync_status    text,
  external_calendar_synced_at      timestamptz,
  external_calendar_sync_error     text,

  created_at           timestamptz not null default now(),
  updated_at            timestamptz not null default now(),
  created_by_user_id     uuid,

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

  exclude using gist (
    resource_id with =,
    tstzrange(starts_at, ends_at) with &&
  ) where (status not in ('cancelled','no_show'))
);

create index if not exists idx_crm_appointments_org_starts      on public.crm_appointments (organization_id, starts_at);
create index if not exists idx_crm_appointments_lead            on public.crm_appointments (lead_id) where lead_id is not null;
create index if not exists idx_crm_appointments_resource_starts on public.crm_appointments (resource_id, starts_at);
create unique index if not exists uniq_crm_appointments_external_event
  on public.crm_appointments (external_calendar_connection_id, external_calendar_event_id)
  where external_calendar_event_id is not null;

alter table public.crm_appointments enable row level security;

drop policy if exists tenant_isolation_crm_appointments_all on public.crm_appointments;
create policy tenant_isolation_crm_appointments_all on public.crm_appointments
  using (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin())
  with check (organization_id in (select fn_user_org_ids()) or fn_is_platform_admin());

drop trigger if exists trg_crm_appointments_updated_at on public.crm_appointments;
create trigger trg_crm_appointments_updated_at before update on public.crm_appointments
  for each row execute function fn_set_updated_at();

-- ============================================================================
-- 8. Efeitos colaterais: timeline do lead + push pro Google (event_log)
-- ============================================================================

-- Sempre roda, independente da origem da escrita (local ou pull do Google) — mudança vinda de
-- fora precisa aparecer na timeline (spec §3, Sistema Vivo DoD item 13).
create or replace function public.fn_crm_appointment_activity() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
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
    return new;
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

drop trigger if exists trg_crm_appointment_activity on public.crm_appointments;
create trigger trg_crm_appointment_activity after insert or update on public.crm_appointments
  for each row execute function fn_crm_appointment_activity();

-- Só emite quando a escrita NÃO veio do worker de pull (evita eco Google -> Fluxa -> Google).
-- O worker de pull grava com `set local fluxa.sync_origin = 'google_pull'` na mesma transação.
create or replace function public.fn_emit_appointment_calendar_event() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  if current_setting('fluxa.sync_origin', true) = 'google_pull' then
    return new;
  end if;

  if new.is_external_block then
    return new;
  end if;

  -- event_log só tem policy de SELECT (event_log_select) — insert direto de uma
  -- função não-definer, rodando como o papel authenticated do chamador, sempre
  -- bate 42501. emit_event() é security definer de propósito, é o único caminho
  -- de escrita que o resto do repo usa (ver fn_emit_event_on_lead_change etc.).
  perform public.emit_event(
    p_event_type := case when new.status = 'cancelled' then 'appointment.cancelled' else 'appointment.upserted' end,
    p_entity_kind := 'appointment',
    p_entity_id := new.id,
    p_payload := jsonb_build_object('appointment_id', new.id, 'resource_id', new.resource_id),
    p_organization_id := new.organization_id
  );
  return new;
end;
$$;

revoke execute on function public.fn_emit_appointment_calendar_event() from public, anon;

drop trigger if exists trg_emit_appointment_calendar_event on public.crm_appointments;
create trigger trg_emit_appointment_calendar_event after insert or update on public.crm_appointments
  for each row execute function fn_emit_appointment_calendar_event();

notify pgrst, 'reload schema';
