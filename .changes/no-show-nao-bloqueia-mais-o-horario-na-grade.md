---
impacto: nada_mudou
secao: corrigido
titulo: Agendamento marcado como falta (no_show) podia deixar o horário inalcançável na grade
---

Cancelar um agendamento já devolvia o horário para a grade corretamente. Marcar
como falta (no_show) também devolve o horário — mas o card continuava por cima
do bloco vazio interceptando o clique, então quem tentasse marcar ali de novo
esperava sem nenhuma resposta visível. Numa agenda com faltas acumuladas ao
longo da semana, horários que deveriam estar livres iam ficando inalcançáveis
pela grade (davam para marcar por outros caminhos, como o botão "Novo
agendamento"). Você não precisa fazer nada — o comportamento agora é o mesmo
para os dois casos que liberam o horário.
