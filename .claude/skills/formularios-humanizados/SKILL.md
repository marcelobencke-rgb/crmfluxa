---
name: formularios-humanizados
description: Como desenhar um Dialog/modal de formulário deste repositório — ícone por campo (FieldShell), agrupamento em seções, ícone opcional no título. USE SEMPRE ao criar um Dialog novo com campos, ou ao editar um formulário existente que ainda usa Label puro sem ícone. Não é sobre lógica de formulário (validação, submit) — é sobre como o campo se APRESENTA.
---

# Formulários humanizados — ícone por campo, não decoração solta

> Nasceu em 2026-09-16 ao humanizar `FormularioDeTarefa.tsx` (o modal de
> criar/editar tarefa). O padrão já existia — `NewLeadDialog.tsx`,
> `NewContactDialog.tsx` — só não estava escrito em lugar nenhum, e por isso
> metade dos formulários do produto tinha e a outra metade não.

## A regra em uma frase

**Todo campo relevante de um Dialog leva `FieldShell` com um ícone do barrel
central (`@/lib/ui/icons`) — nunca `Label` sozinho, nunca ícone importado
direto de `@phosphor-icons/react`.**

## O componente

`components/ui/field-shell.tsx` exporta dois pedaços:

- **`FieldShell`** — `Label` + ícone posicionado à esquerda do controle +
  dica opcional embaixo. O controle (`Input`/`Textarea`/`Select`/qualquer
  outro) precisa de `className="pl-9"` pra abrir espaço pro ícone — sem
  isso o texto digitado passa por baixo dele.
- **`SectionHeading`** — título de seção (`"INFORMAÇÕES BÁSICAS"`) + linha
  horizontal, pra separar blocos de campo num formulário com mais de ~4
  campos. Opcional em formulário curto.

```tsx
import { FieldShell, SectionHeading } from "@/components/ui/field-shell";
import { FileText, Note } from "@/lib/ui/icons";

<SectionHeading>{t("Informações básicas")}</SectionHeading>

<FieldShell id="titulo" label={t("Título")} icon={FileText} required>
  <Input id="titulo" className="pl-9" {...form.register("title")} />
</FieldShell>

<FieldShell id="descricao" label={t("Descrição")} icon={Note} multiline>
  <Textarea id="descricao" className="pl-9" {...form.register("description")} />
</FieldShell>
```

`multiline` muda o ícone de centralizado (`top-1/2`) pra alinhado ao topo
(`top-3`) — usa em todo `Textarea`.

## Escolhendo o ícone

Sempre de `@/lib/ui/icons` (o barrel — ver o cabeçalho do próprio arquivo:
"toda feature importa daqui, não direto de `@phosphor-icons/react`", ADR-05).
Se o ícone que faz sentido ainda não está exportado lá, adiciona ao barrel
primeiro — não importa direto do pacote pra "resolver rápido".

Vocabulário já validado em produção (reaproveita em vez de inventar):

| campo | ícone |
|---|---|
| título / nome | `FileText` |
| descrição / notas / detalhes | `Note` |
| data | `CalendarBlank` |
| horário | `Clock` — **mas só se o próprio controle não já desenhar um**: `TimePickerField` já tem `Clock` embutido no botão, então esse campo NÃO leva `FieldShell` (ver "Quando NÃO usar" abaixo) |
| prioridade | `Flag` |
| situação / status | `Gauge` |
| e-mail | `EnvelopeSimple` |
| telefone | `Phone` |
| pessoa / responsável | `UserCircle` |
| etapa do funil | `Kanban` |
| valor em dinheiro | `Money` |
| vínculo com outro registro (lead, contato) | `LinkSimple` |
| tag | `Tag` |

## Quando NÃO usar (ou usar sem ícone)

Antes de embrulhar um campo, olhe o componente que vai DENTRO — se ele já
desenha o próprio ícone (caso do `TimePickerField`, que já tem `Clock` +
texto dentro do botão), **não** empilhe outro por cima com `FieldShell`.
Isso duplica o ícone em vez de humanizar. Nesse caso, campo normal:

```tsx
<div className="space-y-1.5">
  <Label htmlFor="hora">{t("Horário")}</Label>
  <TimePickerField id="hora" value={hora} onChange={setHora} />
</div>
```

`DatePickerField`, `Input`, `Textarea`, `Select`/`SelectTrigger` e qualquer
picker novo que você construir do zero (ver `SeletorDeLead.tsx` em
`app/app/tasks/_components/` como referência de um combobox de busca feito à
mão, sem `cmdk`) **não** têm ícone próprio — esses sempre levam `FieldShell`.

## Ícone no título do Dialog (opcional, use com moderação)

Ainda é raro no produto — o único precedente hoje é
`app/app/lgpd/requests/[id]/PreviewPanel.tsx`. Quando fizer sentido (o
título sozinho não deixa claro que TIPO de coisa é), o padrão é:

```tsx
<DialogTitle className="flex items-center gap-2">
  <ListChecks size={18} className="text-text-subtle" aria-hidden />
  {t("Nova tarefa")}
</DialogTitle>
```

`size={18}`, cor `text-text-subtle`, `aria-hidden` (decorativo — o texto já
diz o que é).

## i18n — todo texto novo passa por `t()`

Rótulo, placeholder e `hint` de `FieldShell` são texto de tela: `t("...")`
sempre, e toda chave nova precisa de entrada em espanhol em
`lib/i18n/dicionario.ts` (a chave É o texto em português — ver o cabeçalho
do próprio arquivo). `tests/unit/i18n-espanhol-cobre-a-tela.test.ts` reprova
sem isso. Reaproveite chave existente sempre que o texto for igual em outro
formulário (ex.: `"Baixa"`/`"Média"`/`"Alta"`/`"Urgente"` já existem —
prioridade é vocabulário compartilhado entre lead e tarefa).

## Referências completas pra copiar

- `components/kanban/NewLeadDialog.tsx` — o mais rico: `FieldShell` +
  `SectionHeading` + `Select` com ícone + botão de submit com ícone.
- `components/contacts/NewContactDialog.tsx` / `EditContactDialog.tsx` —
  maior variedade de ícones (`UserCircle`, `EnvelopeSimple`, `Phone`,
  `InstagramLogo`, `FacebookLogo`...).
- `app/app/tasks/_components/FormularioDeTarefa.tsx` — o exemplo mais novo,
  com as duas seções, o ícone no título, e o caso do `TimePickerField` sem
  `FieldShell` documentado inline.
- `app/app/tasks/_components/SeletorDeLead.tsx` — combobox de busca feito à
  mão (Popover + Input + lista, sem `cmdk`) pra quando o campo não é um
  `Select` de opções fixas, e sim uma busca contra a API.

## Fora de escopo desta skill

Direção de paleta/tipografia/densidade ainda em exploração vive em
`app/design/` (a vitrine do design system, CSS isolado em `--ds-*`,
propositalmente FORA do tema real do app — ver `app/design/README.md`).
Esta skill é sobre o padrão que já está em PRODUÇÃO; não mexe na vitrine, e
a vitrine não documenta este padrão (são objetivos diferentes: ela explora
direção não decidida, esta skill fixa convenção já decidida).
