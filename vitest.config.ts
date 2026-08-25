import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  // JSX automático já é o default do transform esbuild no Vite 7+ (vitest 4);
  // a opção `esbuild.jsx` saiu do tipo — provado pelos testes de componente.
  test: {
    // NODE POR PADRÃO; jsdom SÓ ONDE PRECISA — e são poucos.
    //
    // O padrão era `jsdom` para a suíte inteira. Medido em 2026-08-25: dos 352
    // arquivos de teste, **39** tocam DOM (Testing Library, `document`,
    // `localStorage`, `ResizeObserver`); os outros 313 montavam e derrubavam um
    // DOM completo para testar função pura, parser e regra de negócio.
    //
    // O preço aparecia no próprio relatório do vitest, e era o maior item dele:
    //
    //     Duration 343.62s (transform 49s, setup 510s, import 818s,
    //                       environment 1.722s, tests 203s)
    //
    // 1.722s montando ambiente contra 203s executando teste de fato — oito vezes
    // mais tempo no cenário do que na cena. E o efeito colateral está logo
    // abaixo: o `testTimeout` precisou ir a 15s porque testes SAUDÁVEIS estouravam
    // numa máquina afogada por 352 jsdoms. Um gate lento é ignorado, e um gate
    // que reprova sem defeito ensina a ignorar.
    //
    // Quem precisa de DOM declara na primeira linha do arquivo:
    //
    //     // @vitest-environment jsdom
    //
    // Por arquivo, e não por glob, porque o `environmentMatchGlobs` saiu no
    // vitest 4 (este projeto está no 4.1.10) e porque a declaração fica onde
    // quem lê o teste a vê. Arquivo novo de componente que esquecer a linha
    // falha alto e óbvio (`document is not defined`), não em silêncio.
    environment: "node",
    // O padrão do vitest é 5s por teste. Numa suíte jsdom + Testing Library
    // isso é apertado: em máquina carregada (CI concorrido, dev rodando outras
    // coisas) testes SAUDÁVEIS estouram e a suíte fica vermelha por lentidão.
    // Aconteceu três vezes aqui, em testes diferentes a cada vez — inclusive
    // derrubando a main num PR que só mexia em documentação. Um gate que
    // reprova sem defeito ensina o time a ignorar o gate.
    // 15s não mascara travamento (quem trava continua reprovando, dez segundos
    // depois); só para de cronometrar a lentidão da máquina como se fosse
    // asserção. Caso que precisa de mais (abrir processo filho) declara o seu.
    testTimeout: 15_000,
    setupFiles: ["./tests/setup/vitest.setup.ts"],
    globals: true,
    coverage: { provider: "v8", reporter: ["text", "html"] },
    // tests/journeys/** roda no Playwright (jornada de baseline dos canais), igual
    // a tests/e2e/**: sem excluir, o include default do vitest o pegaria e o
    // import de @playwright/test derrubaria a suíte unitária.
    exclude: [
      "**/node_modules/**",
      ".next",
      "dist",
      ".claude/**",
      "tests/e2e/**",
      "tests/invariants/**",
      "tests/journeys/**",
    ],
  },
  resolve: { alias: { "@": path.resolve(__dirname, ".") } },
});
