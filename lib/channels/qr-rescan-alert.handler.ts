/**
 * Consumidor de `channel_session.status_changed` — o evento que o trigger
 * `trg_channel_sessions_status_audit` emite desde sempre e que nenhum código
 * lia (anti-pattern nº9 do CLAUDE.md: evento sem consumidor). A linha ficava
 * `pending` em `event_log` para sempre.
 *
 * `qr_rescan` já existia no vocabulário de `agent_inbox_items.kind` — e no
 * comentário de `channel_session_health.escalated_status` em
 * supabase/baseline.sql, que descreve a mesma ideia — mas nenhum código
 * gravava esse kind. Este handler é quem finalmente escreve nele, em vez de
 * inventar um kind novo.
 */
import { createAdminClient } from "@/lib/supabase/admin";
import type { EventHandler, EventRow, HandlerResult } from "@/lib/event-log/dispatcher";

export const QR_RESCAN_ALERT_CONSUMER_KEY = "channel-health.qr-rescan-alert";

/** Estados que significam "não está mais atendendo". */
const DOWN_STATUSES = new Set(["FAILED", "STOPPED"]);

/** Fatia mínima do client que a regra usa — mesmo molde de admin.from(...). */
export interface AgentInboxWriter {
  from(table: "agent_inbox_items"): {
    select(cols: string): {
      eq(col: string, val: unknown): {
        eq(col: string, val: unknown): {
          eq(col: string, val: unknown): {
            eq(col: string, val: unknown): {
              limit(n: number): {
                maybeSingle(): Promise<{ data: { id: string } | null; error: { message: string } | null }>;
              };
            };
          };
        };
      };
    };
    insert(row: Record<string, unknown>): Promise<{ error: { message: string } | null }>;
  };
}

/**
 * Separado do wrapper `EventHandler` para o teste poder exercitar a REGRA sem
 * um dublê do Supabase inteiro — mesmo padrão de
 * `recoverStuckMessages`/`runAutomationForEvent`.
 */
export async function handleChannelStatusChanged(
  admin: AgentInboxWriter,
  row: EventRow,
): Promise<HandlerResult> {
  const payload = row.payload as {
    channel_session_id?: string;
    from_status?: string;
    to_status?: string;
    phone_number?: string | null;
  };
  const fromStatus = payload.from_status ?? "";
  const toStatus = payload.to_status ?? "";
  const channelSessionId = payload.channel_session_id ?? null;

  // Só alerta quem ESTAVA respondendo e parou. Trânsito normal de conexão
  // (STARTING → SCAN_QR_CODE → WORKING) não é incidente — é o fluxo de
  // conectar um número pela primeira vez.
  if (fromStatus !== "WORKING" || !DOWN_STATUSES.has(toStatus) || !channelSessionId) {
    return { consumer_key: QR_RESCAN_ALERT_CONSUMER_KEY, status: "skipped" };
  }

  // Dedup: se já existe aviso ABERTO pra este canal, não empilha um novo a
  // cada flap de rede — quem resolveu o primeiro (kind='qr_rescan', status
  // vira 'ack'/'resolved' pela tela) volta a poder ser alertado.
  const { data: existing, error: selectErr } = await admin
    .from("agent_inbox_items")
    .select("id")
    .eq("organization_id", row.organization_id)
    .eq("kind", "qr_rescan")
    .eq("ref_id", channelSessionId)
    .eq("status", "open")
    .limit(1)
    .maybeSingle();

  if (selectErr) {
    return { consumer_key: QR_RESCAN_ALERT_CONSUMER_KEY, status: "error", detail: selectErr.message };
  }
  if (existing) {
    return { consumer_key: QR_RESCAN_ALERT_CONSUMER_KEY, status: "ok" };
  }

  const numero = payload.phone_number ? ` (${payload.phone_number})` : "";
  const { error } = await admin.from("agent_inbox_items").insert({
    organization_id: row.organization_id,
    kind: "qr_rescan",
    severity: "critical",
    title: `Um WhatsApp caiu${numero}`,
    body: "Este número parou de responder e precisa ser reconectado — escaneie o QR de novo na tela de Conexões.",
    ref_kind: "channel_session",
    ref_id: channelSessionId,
  });

  if (error) {
    return { consumer_key: QR_RESCAN_ALERT_CONSUMER_KEY, status: "error", detail: error.message };
  }
  return { consumer_key: QR_RESCAN_ALERT_CONSUMER_KEY, status: "ok" };
}

export const qrRescanAlertHandler: EventHandler = {
  key: QR_RESCAN_ALERT_CONSUMER_KEY,
  events: ["channel_session.status_changed"],
  handle: (row: EventRow) => handleChannelStatusChanged(createAdminClient() as unknown as AgentInboxWriter, row),
};
