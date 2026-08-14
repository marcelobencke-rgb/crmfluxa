/**
 * A REGRA do cron scheduled-reports: quem recebe email, quando, e o que
 * cada propriedade evita quebrar de novo.
 *
 *   1. só organizações com scheduled_report.enabled=true e >=1 destinatário
 *      entram na contagem de "habilitadas" — settings ausente ou malformado
 *      não derruba o cron pras outras orgs;
 *   2. só dispara no dia certo pra frequência configurada (deveEnviarHoje);
 *   3. envio bem-sucedido vira uma entrada em enviosParaAuditar — a
 *      auditoria em si é responsabilidade de handle(), não desta função
 *      (mesma separação regra/efeito de recoverStuckMessages);
 *   4. erro de metrics ou de envio conta como falha e NÃO interrompe as
 *      demais organizações do loop.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/email/resend", () => ({
  sendEmail: vi.fn(),
}));

import { sendEmail } from "@/lib/email/resend";
import { runScheduledReports } from "./route";

const SEGUNDA = new Date("2026-08-10T09:00:00.000Z"); // segunda-feira

function orgRow(over: Partial<{ id: string; display_name: string; settings: unknown }> = {}) {
  return {
    id: "org-1",
    display_name: "Loja da Ana",
    settings: { scheduled_report: { enabled: true, frequency: "weekly", recipients: ["dono@loja.com"] } },
    ...over,
  };
}

/** Dublê: `.from("organizations").select()` resolve com `orgs`; `.rpc()` resolve com `metrics`. */
function adminDuble(orgs: unknown[], metrics: unknown = { funnel: [], attendants: [] }, metricsError: { message: string } | null = null) {
  const admin = {
    from(_tabela: string) {
      return {
        select() {
          return Promise.resolve({ data: orgs, error: null });
        },
      };
    },
    rpc(_fn: string, _args: unknown) {
      return Promise.resolve({ data: metrics, error: metricsError });
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any;
  return admin;
}

describe("runScheduledReports", () => {
  beforeEach(() => {
    vi.mocked(sendEmail).mockReset();
  });

  it("org sem scheduled_report configurado não conta como habilitada", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "email-1" });
    const admin = adminDuble([orgRow({ settings: {} })]);
    const r = await runScheduledReports(admin, SEGUNDA, "req-1");
    expect(r).toEqual({ orgsHabilitadas: 0, disparosHoje: 0, enviados: 0, falhas: 0, enviosParaAuditar: [] });
  });

  it("org habilitada mas sem destinatário não conta como habilitada", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e" });
    const admin = adminDuble([
      orgRow({ settings: { scheduled_report: { enabled: true, frequency: "weekly", recipients: [] } } }),
    ]);
    const r = await runScheduledReports(admin, SEGUNDA, "req-2");
    expect(r.orgsHabilitadas).toBe(0);
  });

  it("habilitada + dia certo (segunda p/ weekly) ⇒ envia e registra pra auditoria", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "email-2" });
    const admin = adminDuble([orgRow()], {
      funnel: [{ stage_name: "Novo", count: 3 }],
      attendants: [{ won: 1, lost: 0, conversations_handled: 5 }],
    });

    const r = await runScheduledReports(admin, SEGUNDA, "req-3");

    expect(r).toEqual({
      orgsHabilitadas: 1,
      disparosHoje: 1,
      enviados: 1,
      falhas: 0,
      enviosParaAuditar: [{ organizationId: "org-1", frequency: "weekly", recipientCount: 1 }],
    });
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({ to: ["dono@loja.com"] }),
    );
  });

  it("habilitada mas dia errado ⇒ conta como habilitada, não dispara nem envia", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "e" });
    const terca = new Date("2026-08-11T09:00:00.000Z");
    const admin = adminDuble([orgRow()]);

    const r = await runScheduledReports(admin, terca, "req-4");

    expect(r.orgsHabilitadas).toBe(1);
    expect(r.disparosHoje).toBe(0);
    expect(r.enviados).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("erro ao buscar métricas conta como falha, sem lançar", async () => {
    const admin = adminDuble([orgRow()], null, { message: "rpc indisponível" });
    const r = await runScheduledReports(admin, SEGUNDA, "req-5");
    expect(r.falhas).toBe(1);
    expect(r.enviados).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("envio recusado pelo Resend conta como falha, não derruba as outras orgs", async () => {
    vi.mocked(sendEmail)
      .mockResolvedValueOnce({ ok: false, error: "send_failed", details: "boom" })
      .mockResolvedValueOnce({ ok: true, id: "email-3" });
    const admin = adminDuble([orgRow({ id: "org-1" }), orgRow({ id: "org-2" })]);

    const r = await runScheduledReports(admin, SEGUNDA, "req-6");

    expect(r.falhas).toBe(1);
    expect(r.enviados).toBe(1);
    expect(r.enviosParaAuditar).toEqual([{ organizationId: "org-2", frequency: "weekly", recipientCount: 1 }]);
  });
});
