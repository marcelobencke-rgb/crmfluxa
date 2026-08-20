-- Deriva crm_appointments.contact_id a partir do lead vinculado, e faz o backfill do que
-- já existe. Motivo: a coluna sempre existiu mas nunca era preenchida pelo fluxo de
-- criação (só lead_id) — sem ela, um agendamento não sobrevive, como referência estável,
-- a um negócio que depois é fechado/perdido, e não dá pra montar "histórico de
-- agendamentos deste contato" sem passar por join de lead a cada consulta.
--
-- Por que trigger e não código de app: `crm_lead_activities`/`crm_lead_links` (migration
-- 0146, fn_crm_appointment_activity) exigem lead_id NOT NULL — um agendamento só-contato
-- nunca ganha timeline por ali. A tela de contato passa a consultar crm_appointments
-- direto por contact_id, e por isso essa coluna precisa estar populada em TODO caminho de
-- escrita (REST, tools MCP, worker de pull do Google) — não só na rota que a sessão atual
-- mexeu. Trigger no banco é o único jeito de garantir isso pros escritores futuros também,
-- sem duplicar a regra em cada chamador (mesmo raciocínio do `resolveOwnerPatch`/
-- `emitLeadActivity` já documentado em lib/leads/activity-emitter.ts).
--
-- Não sobrescreve contact_id explícito: só entra quando NULL e há lead_id pra derivar.

create or replace function public.fn_crm_appointment_derive_contact() returns trigger
    language plpgsql
    set search_path to 'public', 'pg_temp'
    as $$
begin
  if new.contact_id is null and new.lead_id is not null then
    select contact_id into new.contact_id from crm_leads where id = new.lead_id;
  end if;
  return new;
end;
$$;

revoke execute on function public.fn_crm_appointment_derive_contact() from public, anon;

drop trigger if exists trg_crm_appointment_derive_contact on public.crm_appointments;
create trigger trg_crm_appointment_derive_contact
  before insert or update of lead_id, contact_id on public.crm_appointments
  for each row execute function fn_crm_appointment_derive_contact();

-- Backfill: agendamentos já existentes cujo lead tem contato, mas o agendamento não.
update crm_appointments a
set contact_id = l.contact_id
from crm_leads l
where a.lead_id = l.id
  and a.contact_id is null
  and l.contact_id is not null;
