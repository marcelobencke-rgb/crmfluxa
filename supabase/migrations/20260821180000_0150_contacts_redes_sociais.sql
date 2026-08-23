-- 0150 — site, Instagram e Facebook do contato.
--
-- POR QUE ESTES 3 CAMPOS, E POR QUE EM `contacts`
-- -------------------------------------------------
-- A Fluxa está subindo o próprio pipeline comercial (comercial-hub) para o
-- próprio CRM. O primeiro lote de 20 contatos reais trouxe um padrão: metade
-- deles não tem telefone algum, só Instagram — e o dossiê original também
-- guarda site institucional e, num caso, Facebook. Sem estes 3 campos essa
-- informação ficava presa em `source_metadata` (jsonb), ilegível na tela e
-- sem botão nenhum — voltando a cair no anti-pattern nº6 do CLAUDE.md
-- ("jsonb lock-in — UI lê path direto sem schema central").
--
-- Doutrina DIRC aplicada: os 3 são atributo ESTÁVEL da pessoa/empresa —
-- válidos em qualquer nicho e qualquer funil —, então viram coluna em
-- `contacts`, não `crm_leads.custom_fields` (que é por-pipeline, para o que
-- só faz sentido nalguns nichos).
--
-- FORMATO: GUARDA O IDENTIFICADOR, NÃO A URL
-- -------------------------------------------
-- `site` guarda o domínio como a pessoa digitou (`empresa.com.br`).
-- `instagram`/`facebook` guardam só o handle (`nomedaempresa`), sem `@` e sem
-- `https://instagram.com/`. A URL clicável é montada em `lib/contacts/
-- social-links.ts` na hora de EXIBIR, nunca gravada no banco — mesmo raciocínio
-- da 0099 (avatar): guardar a forma que pode mudar de regra (aqui, como se
-- monta a URL) separada da forma que é só dado, evita reescrever 20 linhas de
-- contato no dia em que a regra de montagem mudar.
--
-- `facebook` é o caso que mais foge de um handle único: página antiga sem
-- vanity name só tem `profile.php?id=<numero>`. Por isso o campo aceita tanto
-- um nome (`fluxaautomacao`) quanto um número puro — quem exibe decide qual
-- formato de URL montar olhando se o valor é só dígito.
--
-- Todos NULLABLE: contato sem essas redes é o estado normal, não um defeito.

alter table public.contacts
  add column if not exists site      text,
  add column if not exists instagram text,
  add column if not exists facebook  text;

comment on column public.contacts.site is
  'Domínio/site do contato, como digitado (ex.: empresa.com.br). NULL = sem site. URL clicável é montada em lib/contacts/social-links.ts, nunca gravada aqui.';
comment on column public.contacts.instagram is
  'Handle do Instagram, sem @ (ex.: nomedaempresa). NULL = sem Instagram. URL é https://instagram.com/<handle>, montada na exibição.';
comment on column public.contacts.facebook is
  'Identificador do Facebook: vanity name (ex.: fluxaautomacao) OU número puro de página sem vanity name (profile.php?id=). NULL = sem Facebook. URL montada na exibição conforme o valor for texto ou só dígitos.';

notify pgrst, 'reload schema';
