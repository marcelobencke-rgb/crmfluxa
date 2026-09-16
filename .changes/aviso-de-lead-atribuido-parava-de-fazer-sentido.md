---
impacto: nada_mudou
secao: corrigido
titulo: "Lead atribuído a você" parava de aparecer sozinho, sem reatribuição nenhuma
---

Editar qualquer campo de um negócio que já era seu — título, descrição, data — disparava o aviso "Lead atribuído a você" como se alguém tivesse acabado de te passar o negócio. A causa: o aviso comparava o dono novo com o dono antigo, mas o dono antigo nunca chegava no evento em tempo real (a tabela não guarda o "antes" de cada campo, só o identificador da linha) — e a ausência virava, por engano, "mudou de dono" toda vez. O mesmo valia, sem ainda ter sido notado, para "Lead ganho" e "Lead perdido" num negócio que já estava fechado. O aviso agora só dispara quando o valor realmente muda, comparado com o que a própria sessão já tinha visto antes — não com o que o evento finge ter visto.
