import { describe, expect, it } from "vitest";
import { renderReportEmail } from "./render-email";

const janela = { from: new Date(2026, 7, 3), to: new Date(2026, 7, 10) };

describe("renderReportEmail", () => {
  it("soma ganhos/perdidos/conversas de todos os atendentes", () => {
    const email = renderReportEmail({
      orgName: "Loja da Ana",
      frequency: "weekly",
      funnel: [{ stage_name: "Novo", count: 5 }],
      attendants: [
        { won: 2, lost: 1, conversations_handled: 10 },
        { won: 3, lost: 0, conversations_handled: 8 },
      ],
      janela,
    });

    expect(email.subject).toBe("Relatório semanal — Loja da Ana");
    expect(email.text).toContain("Ganhos: 5");
    expect(email.text).toContain("Perdidos: 1");
    expect(email.text).toContain("Conversas atendidas: 18");
    expect(email.html).toContain(">5<");
  });

  it("funil vazio não quebra a renderização", () => {
    const email = renderReportEmail({
      orgName: "Org Nova",
      frequency: "monthly",
      funnel: [],
      attendants: [],
      janela,
    });
    expect(email.text).toContain("nenhuma etapa configurada");
    expect(email.html).toContain("Nenhuma etapa configurada");
  });

  it("assunto muda pra 'mensal' na frequência monthly", () => {
    const email = renderReportEmail({
      orgName: "X",
      frequency: "monthly",
      funnel: [],
      attendants: [],
      janela,
    });
    expect(email.subject).toBe("Relatório mensal — X");
  });
});
