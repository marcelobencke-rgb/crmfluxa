-- 0152: cron_heartbeat — o sistema passa a saber que parou de rodar
--
-- Os 16 crons do produto são disparados por um `crond` de Alpine batendo `curl`,
-- e cada linha do crontab termina em `>/dev/null 2>&1`. Não existia tabela de
-- batimento, alerta de atraso, nem qualquer registro de que uma rodada
-- aconteceu. Se o contêiner `scheduler` morre — ou se alguém sobe o compose sem
-- ele —, TUDO que depende de agendamento para em silêncio: envio de follow-up,
-- drenagem do `event_log`, roteamento, recuperação de mensagem travada.
--
-- O sintoma nunca é um erro. A fila só não anda e a tela só fica velha. Num
-- produto que a pessoa instala sozinha numa VPS não há ninguém olhando painel de
-- infra: ela conclui que o produto é devagar, não que está morto.
--
-- ## Por que uma tabela e não uma métrica
--
-- A pergunta que precisa de resposta é "QUANDO foi a última vez que este job
-- rodou", e ela exige o instante do último batimento ao lado do intervalo que se
-- esperava dele. Métrica agregada perde exatamente essa distância — que é o
-- número que vira ação.
--
-- ## Platform-level, não tenant-aware — de propósito
--
-- Um cron atrasado não é problema de uma organização, é do servidor inteiro.
-- Sem `organization_id`, portanto, e sem policy: RLS LIGADA sem policy nenhuma
-- significa que só o service role enxerga (ele bypassa), que é precisamente o
-- alcance certo. Mesmo desenho de `watchdog_cursors`.
--
-- O `revoke` cobre `anon` E `authenticated` porque o
-- `ALTER DEFAULT PRIVILEGES ... GRANT ALL ON TABLES TO anon, authenticated` do
-- baseline alcança toda tabela criada depois dele. A RLS sem policy já bastaria
-- para `authenticated` não ler linha nenhuma, mas esta tabela não tem leitor
-- legítimo no browser: negar nos dois lugares deixa a intenção explícita em vez
-- de depender de um raciocínio de duas etapas.
--
-- Idempotente: `create table if not exists`, `revoke` repetível.

create table if not exists public.cron_heartbeat (
  -- O nome do segmento da rota (`app/api/v1/cron/<job_name>`), não um id: é o
  -- que o crontab escreve e o que o operador procura no log.
  job_name text primary key,

  last_run_at timestamptz not null default now(),
  last_status text not null default 'ok' check (last_status in ('ok', 'error')),
  last_duration_ms integer,
  last_error text,

  -- Separa "parou de rodar" de "roda e falha" — são dois problemas com duas
  -- ações diferentes, e sem este contador os dois chegam como o mesmo silêncio.
  consecutive_errors integer not null default 0,
  run_count bigint not null default 0,

  updated_at timestamptz not null default now()
);

alter table public.cron_heartbeat enable row level security;

revoke all on public.cron_heartbeat from anon;
revoke all on public.cron_heartbeat from authenticated;

notify pgrst, 'reload schema';
