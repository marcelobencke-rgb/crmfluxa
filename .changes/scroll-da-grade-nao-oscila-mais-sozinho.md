---
impacto: nada_mudou
secao: corrigido
titulo: Rolagem da grade da Agenda podia ficar instável, dificultando clicar num horário
---

Em certas condições, a área rolável da grade semanal da Agenda entrava num
ciclo em que o navegador ajustava sozinho a posição de rolagem repetidamente
("scroll anchoring") — o comportamento normalmente serve para não deixar o
conteúdo "pular" quando algo acima muda de tamanho, mas aqui virava um
cabo de guerra que nunca se estabilizava. O efeito prático era um horário que
parecia clicável mas não respondia ao clique. A grade agora controla sua
própria rolagem sem depender desse ajuste automático do navegador.
