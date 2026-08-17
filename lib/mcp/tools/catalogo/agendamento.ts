/**
 * Capacidades de AGENDAMENTO — marcar, ver, remarcar e cancelar horário com um
 * profissional, sala ou equipamento (spec 18).
 *
 * ESTE ARQUIVO FALA COM O HUMANO que configura o agente — `rotulo`, `explicacao`
 * e `oQueToca`. O texto que vai ao MODELO é a `description` do handler
 * (`lib/mcp/tools/agendamento.ts`).
 */
import { declararTools } from "./tipos";

export const TOOLS_AGENDAMENTO = declararTools([
  {
    name: "crm_search_catalog",
    category: "read",
    rotulo: "Consultar produtos e serviços",
    explicacao:
      "Busca no catálogo o preço e a duração de um produto ou serviço, pra responder quanto custa ou achar o que marcar.",
    oQueToca: "Catálogo",
    risco: "seguro",
    pacotes: ["atender", "vender"],
  },
  {
    name: "crm_list_available_slots",
    category: "read",
    rotulo: "Ver horários livres",
    explicacao:
      "Mostra quais horários estão livres pra marcar um serviço, com um profissional específico ou com qualquer um disponível.",
    oQueToca: "Agenda",
    risco: "seguro",
    pacotes: ["atender"],
  },
  {
    name: "crm_list_appointments",
    category: "read",
    rotulo: "Ver agendamentos marcados",
    explicacao:
      "Consulta os horários já marcados, pra responder quando é o compromisso do cliente ou conferir se ele já tem algo agendado.",
    oQueToca: "Agenda",
    risco: "seguro",
    pacotes: ["atender"],
  },
  {
    name: "crm_create_appointment",
    category: "write",
    rotulo: "Marcar horário",
    explicacao:
      "Marca um horário pro cliente num serviço e profissional/sala disponíveis, a partir de um horário livre já consultado.",
    oQueToca: "Agenda",
    risco: "atencao",
    pacotes: ["atender", "vender"],
  },
  {
    name: "crm_reschedule_appointment",
    category: "write",
    rotulo: "Remarcar horário",
    explicacao: "Muda um agendamento já marcado pra outro dia ou horário, mantendo a mesma duração.",
    oQueToca: "Agenda",
    risco: "atencao",
    pacotes: ["atender"],
  },
  {
    name: "crm_cancel_appointment",
    category: "write",
    rotulo: "Cancelar horário",
    explicacao: "Cancela um agendamento marcado, registrando o motivo pra quem for consultar depois.",
    oQueToca: "Agenda",
    risco: "atencao",
    pacotes: ["atender"],
  },
]);
