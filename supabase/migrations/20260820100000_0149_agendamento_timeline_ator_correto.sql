-- A timeline do lead mostrava "Atividade registrada, autor não registrado" pra
-- agendamento — dois defeitos, não um:
--
-- 1. `appointment_scheduled`/`appointment_cancelled`/`appointment_rescheduled` nunca
--    entraram no vocabulário fechado de `lib/leads/activity-vocabulary.ts` — o rótulo
--    caía no fallback genérico. Corrigido no TypeScript (não é migration).
-- 2. `fn_crm_appointment_activity` (migration 0146) grava a linha de dentro de um
--    trigger — e um trigger de Postgres não tem como saber QUEM, do lado da app,
--    disparou o INSERT/UPDATE que o acionou (mesma limitação que a migration 0147 já
--    documentou pro worker de pull: SET LOCAL não atravessa uma chamada via
--    PostgREST). Por isso `actor_kind`/`performed_by_user_id` nunca eram passados.
--
-- Correção de raiz: quem grava a atividade agora é `createAppointmentHandler`/
-- `updateAppointmentHandler` (app/api/v1/appointments/_handler.ts), que JÁ tem
-- `ctx.actor` (usuário, agente de IA ou webhook) em escopo — mesma fonte que já
-- alimenta o audit log. Esta migration por isso RESTRINGE o trigger a só continuar
-- gravando atividade pro único caminho que nunca passa pelos handlers TS: o worker de
-- pull do Google Agenda (fn_crm_pull_upsert_appointment, migration 0147), identificado
-- pelo mesmo GUC `fluxa.sync_origin` que aquela migration já usa pra evitar eco. Sem
-- esse gate, a app e o trigger gravariam a MESMA atividade duas vezes pro caminho
-- normal (REST/MCP). `crm_lead_links` continua gravado pelo trigger sempre — é só
-- associação de dados, não precisa de autor.
--
-- De carona: separa "remarcar" (starts_at mudou) de "duração mudou" (só ends_at) —
-- distinção que não existia quando o trigger foi escrito (spec 18 ainda não tinha
-- redimensionar pela borda do card), espelhando o mesmo split que o handler TS já faz.

create or replace function public.fn_crm_appointment_activity() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
declare
  v_activity_type text;
  v_reason text;
begin
  if tg_op = 'INSERT' then
    v_activity_type := case when new.is_external_block then null else 'appointment_scheduled' end;
  elsif old.status <> 'cancelled' and new.status = 'cancelled' then
    v_activity_type := 'appointment_cancelled';
  elsif old.starts_at <> new.starts_at then
    v_activity_type := 'appointment_rescheduled';
  elsif old.ends_at <> new.ends_at then
    v_activity_type := 'appointment_duration_changed';
  else
    return new;
  end if;

  if new.lead_id is not null and tg_op = 'INSERT' then
    insert into crm_lead_links (organization_id, lead_id, target_kind, target_id, link_kind)
    values (new.organization_id, new.lead_id, 'appointment', new.id, 'primary')
    on conflict do nothing;
  end if;

  if new.lead_id is not null and v_activity_type is not null
     and coalesce(current_setting('fluxa.sync_origin', true), '') = 'google_pull' then
    v_reason := case v_activity_type
      when 'appointment_scheduled' then
        'Agendamento marcado para ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      when 'appointment_cancelled' then
        'Agendamento de ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || ' cancelado'
      when 'appointment_rescheduled' then
        'Agendamento remarcado para ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI')
      else
        'Duração do agendamento de ' || to_char(new.starts_at at time zone 'America/Sao_Paulo', 'DD/MM/YYYY "às" HH24:MI') || ' alterada'
    end;

    insert into crm_lead_activities
      (organization_id, lead_id, contact_id, source_module, source_id, type, actor_kind, reason, payload)
    values (
      new.organization_id, new.lead_id, new.contact_id, 'agendamento', new.id, v_activity_type, 'system', v_reason,
      jsonb_build_object('starts_at', new.starts_at, 'ends_at', new.ends_at, 'resource_id', new.resource_id, 'sync_origin', 'google_pull')
    );
  end if;

  return new;
end;
$$;

revoke execute on function public.fn_crm_appointment_activity() from public, anon;
