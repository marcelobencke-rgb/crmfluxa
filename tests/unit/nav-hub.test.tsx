/**
 * O hub é a vitrine de um grupo: mostra TUDO que ele tem, com descrição,
 * organizado pela jornada de quem usa. É onde as sete telas que só existiam
 * atrás das abas de IA passam a ser descobertas.
 *
 * A permissão é do registro (`navegacao-registry.test.ts`); aqui é o desenho.
 */
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen, within } from "@testing-library/react";

import { NavHub } from "@/components/shell/NavHub";

afterEach(cleanup);

describe("NavHub", () => {
  it("apresenta a IA nas três etapas da jornada, na ordem", () => {
    render(<NavHub group="ia" isPlatformAdmin role={null} title="Agente de IA" subtitle="" />);
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).toEqual(["Montar o agente", "Ensinar o agente", "Acompanhar o agente"]);
  });

  it("desenterra Conhecimento, que só existia atrás das abas", () => {
    render(<NavHub group="ia" isPlatformAdmin role={null} title="Agente de IA" subtitle="" />);
    const link = screen.getByRole("link", { name: /Conhecimento/ });
    expect(link).toHaveAttribute("href", "/app/ai/knowledge/sources");
  });

  it("cada card explica para que serve — é o que o sidebar não cabe dizer", () => {
    render(<NavHub group="ia" isPlatformAdmin role={null} title="Agente de IA" subtitle="" />);
    const link = screen.getByRole("link", { name: /Conhecimento/ });
    expect(link.textContent).toMatch(/consulta antes de responder/i);
  });

  it("mostra também o que já está no sidebar — é inventário, não sobra", () => {
    render(<NavHub group="ia" isPlatformAdmin role={null} title="Agente de IA" subtitle="" />);
    expect(screen.getByRole("link", { name: /Agentes/ })).toBeTruthy();
  });

  it("some com a seção inteira quando a permissão esvazia", () => {
    render(
      <NavHub group="organizacao" isPlatformAdmin={false} role="viewer" title="Org" subtitle="" />,
    );
    const secoes = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent?.trim());
    expect(secoes).toContain("Sua conta");
    expect(secoes).not.toContain("Dados e acesso");
  });

  it("agrupa os cards sob a própria seção, não numa lista solta", () => {
    render(<NavHub group="ia" isPlatformAdmin role={null} title="Agente de IA" subtitle="" />);
    const ensinar = screen.getByRole("region", { name: "Ensinar o agente" });
    expect(within(ensinar).getByRole("link", { name: /Memória/ })).toBeTruthy();
    expect(within(ensinar).queryByRole("link", { name: /Credenciais/ })).toBeNull();
  });

  it("Canais e as duas telas de Análise voltaram pra Configurações em 23/08/2026", () => {
    render(<NavHub group="organizacao" isPlatformAdmin role="admin" title="Org" subtitle="" />);
    const canais = screen.getByRole("region", { name: "Canais" });
    expect(within(canais).getByRole("link", { name: /Conexões/ })).toBeTruthy();
    expect(within(canais).getByRole("link", { name: /Nuvemshop/ })).toBeTruthy();
    expect(within(canais).getByRole("link", { name: /Webhooks/ })).toBeTruthy();

    const dados = screen.getByRole("region", { name: "Dados e acesso" });
    expect(within(dados).getByRole("link", { name: /Evolução da IA/ })).toBeTruthy();
    expect(within(dados).getByRole("link", { name: /Audit Log/ })).toBeTruthy();
  });
});
