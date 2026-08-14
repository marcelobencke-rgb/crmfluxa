/**
 * A REGRA do consumidor de `channel_session.status_changed` (issue: evento sem
 * consumidor, anti-pattern nº9 do CLAUDE.md). Guarda o que importa:
 *
 *   1. só alerta transição WORKING → FAILED/STOPPED — trânsito normal de
 *      conexão (STARTING/SCAN_QR_CODE) não deve virar aviso;
 *   2. dedup: aviso já ABERTO pro mesmo canal não gera um segundo;
 *   3. o aviso reusa o kind `qr_rescan` que já existia no vocabulário.
 */
import { describe, expect, it } from "vitest";

import { handleChannelStatusChanged, type AgentInboxWriter } from "./qr-rescan-alert.handler";
import type { EventRow } from "@/lib/event-log/dispatcher";

function eventoDe(fromStatus: string, toStatus: string): EventRow {
  return {
    id: "evt-1",
    organization_id: "org-1",
    event_type: "channel_session.status_changed",
    entity_kind: "channel_session",
    entity_id: "sess-1",
    payload: {
      channel_session_id: "sess-1",
      from_status: fromStatus,
      to_status: toStatus,
      phone_number: "+5511999990000",
    },
    metadata: {},
    consumed_by: [],
    attempts: 0,
  };
}

/** Dublê mínimo: registra inserts, devolve o aviso "já aberto" configurado. */
function clientDuble(existente: { id: string } | null) {
  const inserts: Record<string, unknown>[] = [];
  const admin: AgentInboxWriter = {
    from() {
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    eq() {
                      return {
                        eq() {
                          return {
                            limit() {
                              return {
                                maybeSingle: () => Promise.resolve({ data: existente, error: null }),
                              };
                            },
                          };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        insert(row: Record<string, unknown>) {
          inserts.push(row);
          return Promise.resolve({ error: null });
        },
      };
    },
  };
  return { admin, inserts };
}

describe("handleChannelStatusChanged", () => {
  it("ignora trânsito normal de conexão (STARTING → SCAN_QR_CODE)", async () => {
    const { admin, inserts } = clientDuble(null);
    const result = await handleChannelStatusChanged(admin, eventoDe("STARTING", "SCAN_QR_CODE"));
    expect(result.status).toBe("skipped");
    expect(inserts).toHaveLength(0);
  });

  it("ignora quando nunca esteve WORKING (SCAN_QR_CODE → FAILED)", async () => {
    const { admin, inserts } = clientDuble(null);
    const result = await handleChannelStatusChanged(admin, eventoDe("SCAN_QR_CODE", "FAILED"));
    expect(result.status).toBe("skipped");
    expect(inserts).toHaveLength(0);
  });

  it("abre aviso qr_rescan quando um canal WORKING cai", async () => {
    const { admin, inserts } = clientDuble(null);
    const result = await handleChannelStatusChanged(admin, eventoDe("WORKING", "FAILED"));
    expect(result.status).toBe("ok");
    expect(inserts).toHaveLength(1);
    expect(inserts[0]).toMatchObject({
      organization_id: "org-1",
      kind: "qr_rescan",
      ref_kind: "channel_session",
      ref_id: "sess-1",
    });
  });

  it("não empilha um segundo aviso se já existe um aberto pro mesmo canal", async () => {
    const { admin, inserts } = clientDuble({ id: "aviso-existente" });
    const result = await handleChannelStatusChanged(admin, eventoDe("WORKING", "STOPPED"));
    expect(result.status).toBe("ok");
    expect(inserts).toHaveLength(0);
  });
});
