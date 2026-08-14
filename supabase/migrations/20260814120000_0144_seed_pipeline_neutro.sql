-- 0144: fn_seed_default_pipeline_for_org deixa de semear vocabulário e-commerce
--
-- O funil que toda organização nova ganha automaticamente (trigger em
-- organizations) nascia sempre com "Pedidos" e as 8 etapas de e-commerce
-- ("Carrinho abandonado", "Aguardando pagamento", "Pago"...). Numa clínica ou
-- imobiliária o primeiro lead literalmente nasce em "Carrinho abandonado" —
-- achado em produção ao provar a jornada "conversa vira lead" (spec 17,
-- docs/testing/user-journey-map.md J4.25). O produto se vende multi-nicho, mas
-- a primeira experiência de quem não é loja contradizia isso.
--
-- Troca pelo MESMO padrão neutro de 4 etapas que a tela "criar funil" já usa
-- desde a gestão de funis (lib/pipelines/pipeline-editing.ts DEFAULT_STAGES:
-- Novo · Em andamento · Ganho · Perdido) — não inventa vocabulário novo, alinha
-- com o que já é o "funil em branco" do produto em todo outro lugar.
--
-- Sem CHECK novo, sem coluna nova: só troca o corpo da função (CREATE OR
-- REPLACE, idempotente) e os dados que ela grava dali em diante. Organizações
-- já existentes não são tocadas — renomear o funil de quem já configurou o
-- próprio vocabulário seria pior que deixar como está.

CREATE OR REPLACE FUNCTION "public"."fn_seed_default_pipeline_for_org"() RETURNS "trigger"
    LANGUAGE "plpgsql"
    SET "search_path" TO 'public', 'pg_temp'
    AS $$
declare
  v_pipeline_id uuid;
  v_position numeric := 1000;
  r record;
begin
  insert into public.crm_pipelines (organization_id, name, slug, is_default, position)
  values (new.id, 'Funil de vendas', 'funil-de-vendas', true, 1000)
  returning id into v_pipeline_id;

  for r in
    select * from (values
      ('Novo',           'novo',           false, false),
      ('Em andamento',   'em_andamento',   false, false),
      ('Ganho',          'ganho',          true,  false),
      ('Perdido',        'perdido',        false, true)
    ) as t(stage_name, stage_slug, won, lost)
  loop
    insert into public.crm_stages (organization_id, pipeline_id, name, slug, position, is_won, is_lost)
    values (new.id, v_pipeline_id, r.stage_name, r.stage_slug, v_position, r.won, r.lost);
    v_position := v_position + 1000;
  end loop;

  return new;
end$$;

notify pgrst, 'reload schema';
