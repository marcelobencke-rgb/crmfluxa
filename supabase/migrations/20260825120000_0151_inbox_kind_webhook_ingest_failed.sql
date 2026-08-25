-- 0151: agent_inbox_items.kind ganha 'webhook_ingest_failed'
--
-- O webhook do WAHA é por onde ENTRA tudo que o cliente manda. Quando o
-- despacho do evento falhava, o handler escrevia um `console.error` e devolvia
-- `200 accepted:true`. Para o WAHA aquilo era sucesso — ele não repete. A
-- mensagem não entrava no inbox, não virava `event_log`, não abria aviso e não
-- chegava ao Sentry.
--
-- O modo de falha é o pior de todos os três que este produto já corrigiu na
-- Central: `message_send_stuck` (0109) deixava um sinal errado na tela e
-- `midia_nao_lida` (0129) deixava o agente mudo, mas os dois deixavam ALGUMA
-- marca. Aqui não sobrava nada: do lado de cá o sistema parecia ocioso, e do
-- lado de lá havia uma pessoa que mandou mensagem e não foi respondida. O
-- sintoma que chega ao dono do negócio é o cliente dizendo "mandei e ninguém
-- respondeu", sem nada no sistema para confrontar.
--
-- Este kind é o que faz a perda APARECER. O handler passa a devolver 500 (o
-- WAHA Plus reentrega) e a registrar o aviso — as duas coisas, porque reentrega
-- resolve falha transitória e o aviso resolve o resto.
--
-- Idempotente: a lista de kinds só cresce, nenhuma linha existente viola a
-- constraint nova.

alter table public.agent_inbox_items
  drop constraint if exists agent_inbox_items_kind_check;

alter table public.agent_inbox_items
  add constraint agent_inbox_items_kind_check check (kind in (
    'qr_rescan',
    'job_dead',
    'event_dead',
    'budget_exceeded',
    'handoff',
    'promotion_review',
    'judge_unaligned',
    'followup_dead',
    'snooze_expired',
    'next_action_ambiguous',
    'risk_backlog_seeded',
    'reactivation_expired',
    'capabilities_missing',
    'message_send_stuck',
    'midia_nao_lida',
    'promise_unfulfilled',
    'contact_proposal_expired',
    'webhook_ingest_failed',
    'other'
  ));

notify pgrst, 'reload schema';
