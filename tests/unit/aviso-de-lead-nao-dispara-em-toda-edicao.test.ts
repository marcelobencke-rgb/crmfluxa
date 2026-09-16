import { describe, expect, it } from "vitest";

import { avisosDeAtualizacaoDeLead } from "@/hooks/notifications/useCrmAlerts";

/**
 * "LEAD ATRIBUÍDO A VOCÊ" DUPLICADO EM TODA EDIÇÃO — não só numa reatribuição.
 *
 * `crm_leads` não tem `replica identity full` (migration 0183): o `old` de um
 * UPDATE só carrega o `id`. `useCrmAlerts.onLead` lia `antigo?.owner_user_id`
 * como se fosse o dono de ANTES — sempre `undefined` — e `owner !== undefined`
 * é verdadeiro sempre que o lead já é meu, então editar título, descrição ou
 * data de um lead MEU disparava "Lead atribuído a você" (e o mesmo defeito
 * valia para "ganho"/"perdido" contra `status`).
 *
 * O conserto separou a DECISÃO (esta função, pura) do canal: ela nunca recebe
 * o `old` do payload, só o que o CLIENTE já observou antes para aquele lead
 * (`vistoAntes`, `undefined` = nunca visto nesta sessão).
 */
const MEU = "11111111-1111-1111-1111-111111111111";
const OUTRO = "22222222-2222-2222-2222-222222222222";

const BASE = { leadId: "lead-1", title: "Nova Compra", href: "/app/pipelines/p1", meuUserId: MEU };

describe("avisosDeAtualizacaoDeLead", () => {
  it("editar um campo qualquer de um lead JÁ meu não dispara nada — o defeito medido", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: MEU,
      status: "open",
      vistoAntes: { owner: MEU, status: "open" }, // nada mudou, só o título/descrição
    });
    expect(avisos).toEqual([]);
  });

  it("primeira vez que este lead aparece na sessão não dispara nada — não há 'antes' para comparar", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: MEU,
      status: "open",
      vistoAntes: undefined,
    });
    expect(avisos).toEqual([]);
  });

  it("reatribuído a mim de verdade dispara 'Lead atribuído a você', uma vez só", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: MEU,
      status: "open",
      vistoAntes: { owner: OUTRO, status: "open" },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ category: "lead_assigned", title: "Lead atribuído a você" });
  });

  it("reatribuído a OUTRA pessoa não me notifica", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: OUTRO,
      status: "open",
      vistoAntes: { owner: MEU, status: "open" },
    });
    expect(avisos).toEqual([]);
  });

  it("fechar como ganho um lead meu dispara 'Lead ganho'", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: MEU,
      status: "won",
      vistoAntes: { owner: MEU, status: "open" },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ category: "lead_won", title: "Lead ganho" });
  });

  it("editar um lead que já estava ganho não repete o aviso de ganho", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: MEU,
      status: "won",
      vistoAntes: { owner: MEU, status: "won" },
    });
    expect(avisos).toEqual([]);
  });

  it("fechar como perdido um lead meu dispara 'Lead perdido'", () => {
    const avisos = avisosDeAtualizacaoDeLead({
      ...BASE,
      owner: MEU,
      status: "lost",
      vistoAntes: { owner: MEU, status: "open" },
    });
    expect(avisos).toHaveLength(1);
    expect(avisos[0]).toMatchObject({ category: "lead_lost", title: "Lead perdido" });
  });
});
