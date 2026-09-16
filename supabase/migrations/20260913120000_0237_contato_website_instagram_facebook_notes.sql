-- ============================================================================
-- 0237 — SITE, INSTAGRAM, FACEBOOK E OBSERVAÇÕES NO CONTATO
--
-- Pedido direto do operador: cadastro e edição de contato precisavam de campo
-- pra site e redes sociais do lead/cliente, e um campo livre de observações —
-- o que hoje só existe via "campos personalizados" por pipeline, e um contato
-- manual sem pipeline associado nem chega a ver essa seção.
--
-- DIRC (CLAUDE.md): não duplica nenhuma tabela existente, não é FK, não é só
-- ponteiro, não é calculável — atributo próprio do contato. Coluna nova, e não
-- `custom_fields`: os quatro fazem sentido pra QUALQUER contato de QUALQUER
-- nicho, independente de pipeline — `custom_fields` é onde o operador declara
-- o que É específico do nicho dele.
--
-- `notes` carrega o mesmo risco que `custom_fields` (migration 0211) já
-- documentou: campo livre num registro de pessoa física recebe o que o
-- atendente quiser escrever, PII incluída. Mesma resposta: o gatilho que já
-- limpa `custom_fields` na transição is_anonymized false→true — pendurado no
-- ESTADO, não numa das rotas, por isso cobre `fn_lgpd_cascade_redact_contact`
-- E a rota direta de /api/v1/lgpd/anonymize com UMA mudança só — ganha as
-- quatro colunas novas no mesmo corpo.
--
-- Idempotente: `add column if not exists` + `create or replace function`.
-- ============================================================================

alter table public.contacts
  add column if not exists website text,
  add column if not exists instagram text,
  add column if not exists facebook text,
  add column if not exists notes text;

comment on column public.contacts.website is
  'Site do contato/empresa. Texto livre, sem validação de URL.';
comment on column public.contacts.instagram is
  'Perfil do Instagram (handle ou URL). Texto livre.';
comment on column public.contacts.facebook is
  'Perfil/página do Facebook (handle ou URL). Texto livre.';
comment on column public.contacts.notes is
  'Observações livres do atendente sobre o contato. PII possível — limpo pela anonimização (mesmo gatilho de custom_fields, migration 0211).';

create or replace function public.fn_contato_anonimizado_limpa_campos_personalizados()
  returns trigger
  language plpgsql
as $$
begin
  new.custom_fields := '{}'::jsonb;
  -- 0237: mesmo risco de PII que custom_fields (0211) — texto livre que o
  -- atendente digita sobre uma pessoa real.
  new.website := null;
  new.instagram := null;
  new.facebook := null;
  new.notes := null;
  return new;
end$$;

notify pgrst, 'reload schema';
