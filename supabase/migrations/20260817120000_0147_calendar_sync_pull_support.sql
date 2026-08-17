-- Migration 0147 — forward-fix: suporte que faltava pro worker de pull do Google Agenda
--
-- Spec: docs/specs/18-spec-agendamento-catalogo.md §4.2/§4.3
--
-- Dois furos achados construindo o worker de pull (0146 só previu o de push):
--
-- 1. `crm_calendar_connections` não guardava o `resourceId` que o Google atribui
--    ao canal de watch — só o `id` que NÓS geramos. `channels.stop` exige os
--    DOIS pra parar um canal; sem a coluna, disconnect não consegue encerrar o
--    canal no Google (ele expira sozinho em até 30 dias, mas isso não é
--    disconnect, é vazamento até o timeout).
--
-- 2. O "SET LOCAL fluxa.sync_origin = 'google_pull' na mesma transação" que a
--    spec §4.3 promete pra evitar eco Google->Fluxa->Google **não é alcançável**
--    a partir do cliente Supabase JS: cada chamada .update()/.insert() via
--    PostgREST é a própria transação implícita, e não existe canal do cliente
--    pra rodar SET LOCAL antes do INSERT/UPDATE na MESMA transação. A correção
--    de raiz é mover a escrita pra dentro de uma RPC — 1 chamada de RPC = 1
--    transação, então `set_config(..., true)` dentro da função persiste até o
--    fim daquela mesma execução, exatamente na janela em que o trigger
--    `fn_emit_appointment_calendar_event` (migration 0146) precisa ver o GUC.

alter table public.crm_calendar_connections
  add column if not exists watch_resource_id text;

create or replace function public.fn_crm_pull_upsert_appointment(
  p_appointment_id uuid,               -- null = insere bloqueio externo novo
  p_organization_id uuid,
  p_resource_id uuid,
  p_starts_at timestamptz,
  p_ends_at timestamptz,
  p_status text,
  p_cancel_reason text,
  p_external_calendar_connection_id uuid,
  p_external_calendar_event_id text
) returns uuid
    language plpgsql security definer
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_id uuid;
begin
  -- 'true' = SET LOCAL (escopo da transação desta chamada de RPC, não da sessão
  -- inteira) — é o que fn_emit_appointment_calendar_event lê pra não reemitir
  -- push do que acabou de chegar do próprio Google.
  perform set_config('fluxa.sync_origin', 'google_pull', true);

  if p_appointment_id is not null then
    update public.crm_appointments set
      starts_at = coalesce(p_starts_at, starts_at),
      ends_at = coalesce(p_ends_at, ends_at),
      status = coalesce(p_status, status),
      cancel_reason = coalesce(p_cancel_reason, cancel_reason),
      external_calendar_sync_status = 'synced',
      external_calendar_synced_at = now(),
      external_calendar_sync_error = null
    where id = p_appointment_id
      and organization_id = p_organization_id
    returning id into v_id;
  else
    insert into public.crm_appointments (
      organization_id, resource_id, product_id, starts_at, ends_at, status,
      is_external_block, source,
      external_calendar_connection_id, external_calendar_event_id,
      external_calendar_sync_status, external_calendar_synced_at
    ) values (
      p_organization_id, p_resource_id, null, p_starts_at, p_ends_at,
      coalesce(p_status, 'scheduled'),
      true, 'google_import',
      p_external_calendar_connection_id, p_external_calendar_event_id,
      'synced', now()
    )
    returning id into v_id;
  end if;

  return v_id;
end;
$$;

-- Só o worker de pull chama isto (admin client) — nunca via RPC do browser.
revoke execute on function public.fn_crm_pull_upsert_appointment(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid, text
) from public, anon, authenticated;
grant execute on function public.fn_crm_pull_upsert_appointment(
  uuid, uuid, uuid, timestamptz, timestamptz, text, text, uuid, text
) to service_role;

notify pgrst, 'reload schema';
