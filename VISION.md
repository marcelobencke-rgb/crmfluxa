# 🧭 Visão — Fluxa CRM

> **O sistema operacional de vendas com agentes de IA, nativo no WhatsApp.**
> Este documento é a fonte da verdade do posicionamento do projeto. Tudo que for público (site, materiais de vendas, docs) deriva daqui.

---

## O nome

**Fluxa CRM** é o nome comercial do produto (decisão de 2026-08-14 — ver nota de proveniência abaixo). *A etimologia do nome anterior ("Desk" + "comm" = "o comercial de mesa") não se aplica a "Fluxa"; este trecho está pendente de nova redação — ver nota de revisão no changelog do rename.*

O "CRM" no nome é a categoria de entrada, não o teto. O Fluxa CRM é **mais que um CRM**: é o sistema onde a venda acontece.

## De onde viemos, pra onde vamos

O projeto nasceu em 2026 como um CRM operacional para **e-commerce brasileiro** — WhatsApp via WAHA, integração Nuvemshop, LGPD nativa. A demanda real apontou pra outra direção: a maior parte dos primeiros clientes passou a operar o Fluxa em **clínicas, infoprodutos, imobiliárias, agências e prestadores de serviço** — qualquer negócio que vende conversando.

Esses casos de uso empurraram o produto na direção que hoje é a nossa identidade: **agentes de IA cada vez mais capazes, integrados ao sistema via MCP, operando o CRM de verdade**. O e-commerce continua sendo um caso de uso de primeira classe (foi nosso berço e a integração Nuvemshop prova isso) — mas ele é **um** vertical, não **o** produto.

**A transição, em uma frase:** de "CRM de e-commerce com IA" para **"sistema operacional de vendas com agentes de IA, para qualquer negócio que vende pelo WhatsApp"**.

> ⚠️ Nota de proveniência (interna, não pra material público): a base de código deste projeto tem origem numa distribuição MIT de terceiro (copyright original de Rafael Melgaço — ver `LICENSE`). A licença MIT permite uso comercial, modificação e venda sem exigir abertura do código das mudanças; a única obrigação é preservar o aviso de copyright e o texto da licença no software. Isso é diferente de trademark: antes de consolidar a marca "Fluxa CRM" publicamente num produto pago, confirmar que o nome/logo não pertence ao projeto original. Ver conversa de decisão de 2026-08-14.

## O que acreditamos sobre agentes de IA

1. **Agente que opera, não chatbot que enfeita.** Nosso agente lê contexto real (histórico, perfil, pedido), consulta a base de conhecimento do tenant (RAG por organização), responde, qualifica, move o lead no funil — e é **assignee de primeira classe** no sistema, com as mesmas regras de governança de um atendente humano.

2. **Agentes que se auto-aprimoram.** O sistema é desenhado como um flywheel: conversas resolvidas viram conhecimento novo na base RAG; handoffs pro humano marcam onde o agente ainda não alcança; métricas e budget por tenant fecham o loop. Cada dia de operação torna o agente melhor — com **gate humano** nas decisões que importam. Essa é a aposta central do roadmap.

3. **MCP como sistema nervoso.** O CRM inteiro é exposto como tools MCP — primeiro para os agentes internos, depois como contrato pra agências e integradores parceiros. Um negócio deve poder plugar o agente que quiser (Claude, o que vier) e ele **opera** o Fluxa: cria lead, responde cliente, agenda, consulta pedido. O CRM vira infraestrutura para agentes.

4. **Humano no comando.** Handoff auditado, escopo por papel (RBAC), fila com posição, budget de IA por organização. Autonomia do agente cresce na medida em que a governança prova que ele acerta.

## Os pilares do produto

| Pilar | O que significa na prática |
|---|---|
| **Agentes de IA nativos** | RAG por tenant, análise de sentimento, handoff IA→humano auditado, IA como assignee, budget por org |
| **CRM automatizado pela IA** | O agente move leads, aplica tags, dispara automações QUANDO/SE/ENTÃO — o funil anda sozinho |
| **Ferramentas de apoio ao comercial** | Inbox em tempo real, kanban com fractional indexing, customer 360, métricas por atendente, roteamento automático |
| **WhatsApp-native** | WAHA multi-número, anti-banimento, mídia, STOP detection — o canal onde o Brasil vende |
| **Multi-nicho por design** | `vocabulary` configurável por pipeline (lead = Cliente/Paciente/Comprador; won = Pago/Agendado/Fechado) — o mesmo core serve e-commerce, clínica, imobiliária, infoproduto |
| **SaaS gerenciado** | Infraestrutura, atualização, backup e monitoramento por nossa conta — o cliente usa o produto, não opera servidor |
| **Compliance nativo** | Multi-tenant com RLS testada em CI, LGPD by-design (redact, data_request, anonimização), audit append-only |

## Posicionamento

**Categoria de entrada (âncora):** a alternativa **com agentes de IA nativos** às plataformas fechadas de atendimento e vendas por WhatsApp (Kommo, Octadesk, Intercom, Zendesk) — sem bot decorativo acoplado a um plano caro, com a IA operando o CRM de verdade desde o plano de entrada.

**Categoria própria (bandeira):** **sistema operacional de vendas com agentes de IA** — *AI Sales OS*. É pra onde a âncora nos leva: os incumbentes vendem assinatura de chat com bot acoplado; nós entregamos um sistema onde o agente de IA é operador nativo do funil, não um add-on.

**Uma frase (pt-br):**
> Fluxa CRM é o sistema operacional de vendas com agentes de IA nativos e WhatsApp — SaaS multi-tenant, para qualquer negócio que vende conversando.

**One-liner (en):**
> AI sales OS: a managed CRM where AI agents natively operate sales and support over WhatsApp — the AI-native alternative to Kommo, Octadesk and Intercom.

**Público:** negócios brasileiros (e além) que vendem pelo WhatsApp — e-commerce, clínicas, imobiliárias, infoprodutores, agências, serviços — e agências/parceiros que atendem múltiplos clientes finais sob um plano de revenda.

## Modelo de negócio

- **SaaS pago, hospedado por nós.** Multi-tenant, o cliente assina um plano e usa — não instala, não gerencia servidor, não aplica update.
- **Segmentação em 4 planos**, combinando seats, números de WhatsApp e uso de IA (o eixo de custo real do produto é IA/LLM e licenciamento WAHA por número — os planos metrificam isso, não travam feature por feature):
  - **Starter** — autônomo/micro negócio testando CRM + IA no WhatsApp: 1 número, poucos seats, volume de IA baixo.
  - **Growth** — PME operando de verdade (e-commerce pequeno, clínica, imobiliária): múltiplos números, RAG por tenant, Nuvemshop, automações completas.
  - **Scale** — operação com múltiplos atendentes e funis: multi-pipeline, roteamento automático, métricas por atendente, MFA obrigatório, API.
  - **Agency** — agência/dev shop revendendo pra clientes finais: múltiplas organizações num painel, white-label, revenue share, acesso MCP.
- **Preço e limites exatos de cada plano ainda não são doutrina** — definir em doc de pricing dedicado antes de publicar (comparar contra custo real de infra/IA por tenant, não só contra concorrente).
- **Trial, não freemium perpétuo** — cada conta nova custa infra real (instância WAHA, banco). Trial com limite agressivo de conversas de IA, não plano grátis pra sempre.
- **Provedor de hospedagem/infra ainda não é doutrina** — a decisão de manter ou não a parceria HostGator (agora como fornecedor de infra nossa, não do cliente) está em aberto.

## Princípios de comunicação

1. **Capacidade primeiro, jargão depois.** Em todo título público: "IA nativa", "WhatsApp", "CRM" antes de qualquer nome interno de subsistema.
2. **Mostrar, não descrever.** Screenshot/GIF do produto no primeiro scroll de qualquer página.
3. **Âncora explícita.** "A alternativa com IA nativa a X" aparece no site e nos materiais de vendas — é assim que a demanda dos incumbentes nos encontra (busca e LLMs).
4. **E-commerce é exemplo, não definição.** Ao citar casos de uso, sempre em lista multi-nicho ("e-commerce, clínicas, imobiliárias...").
5. **Transparência de preço.** Planos, limites de uso de IA e política de dados declarados em linguagem clara no site, nunca escondidos atrás de "fale com vendas" pros planos de entrada.

## Norte de 3 anos

Ser a resposta padrão — do Google, do ChatGPT, do Reddit e do dono de negócio brasileiro — para a pergunta **"qual o melhor CRM com agentes de IA nativos pro WhatsApp?"**; com milhares de negócios pagantes operando vendas pelo Fluxa, um ecossistema de agentes plugados via MCP, e um flywheel de auto-aprimoramento que faça cada conta vender melhor a cada mês de operação.

---

*Última revisão: 2026-08-14 — pivô de open source/self-hosted pra SaaS pago multi-tenant, segmentado em planos (Starter/Growth/Scale/Agency).*
