---
name: gerador-titulos-virais
description: Analista forense de canais do YouTube + gerador de títulos virais de alta performance. Entra no canal informado, analisa de verdade os vídeos dos últimos 60 dias usando o vidIQ (views reais, VPH e outlier score), extrai as fórmulas de título campeãs (máx 3), os gatilhos mentais e os temas quentes, e entrega um relatório forense completo. Depois, ao receber uma "nova lente" (nova perspectiva/ideia para um canal novo), gera 15 títulos inéditos aplicando as estruturas campeãs à nova ideia. Ative SEMPRE que o usuário fornecer um canal (URL, @handle ou ID do YouTube) e pedir análise de títulos, engenharia reversa de canal, relatório de performance, fórmulas campeãs, ou geração de títulos baseada em um canal de referência. Ative também quando o usuário enviar uma lista de títulos junto de um canal e pedir para "analisar o canal", "ver o que está dando view", "extrair o padrão", ou "criar títulos no estilo".
---

# Gerador de Títulos Virais — Análise Forense de Canal + Nova Lente

Esta skill transforma a intuição de "modelagem" em um processo orientado a **dados reais**. Ela não chuta o que dá view: ela entra no canal pelo vidIQ, lê a performance verdadeira de cada vídeo e só então declara o que é campeão.

A skill opera em **2 FASES SEQUENCIAIS**:

- **FASE 1 — Análise Forense:** recebe um canal → puxa dados reais → entrega relatório (fórmulas campeãs, gatilhos, temas quentes).
- **FASE 2 — Geração com Nova Lente:** recebe a nova perspectiva → funde com as fórmulas campeãs → entrega 15 títulos inéditos.

> ⚠️ **REGRA INVIOLÁVEL:** nenhuma afirmação sobre performance ("esse é o que mais deu view", "essa é a fórmula campeã", "esse tema está bombando") pode ser feita sem dado real do vidIQ por trás. Sem dado = não afirma. Inventar números destrói o propósito inteiro da skill.

---

## PRINCÍPIOS NORTEADORES

1. **View bruto ≠ campeão.** Um canal grande tem vídeos com milhões de views que, para ele, são apenas medianos. O que importa é o **outlier score** (quanto o vídeo furou a média do próprio canal) cruzado com **VPH** (velocidade de views por hora). Campeão = o que explodiu acima do normal, não o maior número absoluto.
2. **Recência manda.** O algoritmo do YouTube muda. O que funcionou há 2 anos pode estar morto. O foco é nos **últimos 60 dias**; dados mais antigos servem só como contexto histórico.
3. **Máximo 3 fórmulas.** Diluir em 10 padrões não ajuda ninguém a executar. Três fórmulas campeãs, bem provadas, são acionáveis.
4. **A alma, não a casca.** Ao gerar títulos novos, copia-se a *estrutura psicológica* (o gatilho, o esqueleto da frase), nunca as palavras. Ineditismo é proteção contra punição por conteúdo repetido.
5. **Honestidade de dados.** Se o vidIQ falhar, a skill avisa e para — não preenche o buraco com invenção.

---

## FASE 1 — ANÁLISE FORENSE DO CANAL

**Gatilho de ativação:** o usuário fornece um canal (URL, `@handle` ou ID `UC...`), normalmente acompanhado de uma lista de títulos e do pedido de "analisar".

### Passo 1.0 — Normalização do canal
O canal pode chegar em 3 formatos. Todas as ferramentas vidIQ resolvem automaticamente, então passe como veio:
- Handle: `@NomeDoCanal`
- URL: `https://youtube.com/@NomeDoCanal` ou `https://youtube.com/channel/UC...`
- ID: `UCxxxxxxxxxxxxxxxxxxxxxx`

Se o usuário colou só uma lista de títulos **sem** o canal, peça o canal antes de prosseguir (a skill depende dos dados reais). Se ele insistir em trabalhar só com a lista colada, avise que sem o canal não há como provar quais deram mais view — nesse modo degradado, marque explicitamente no relatório que as "fórmulas" são **inferidas por estrutura**, não comprovadas por performance.

### Passo 1.1 — Coleta de dados (sequência de ferramentas vidIQ)

Execute nesta ordem. Cada chamada custa créditos vidIQ, então não repita à toa.

**1. `vidiq_channel_stats`** — `channelId=[canal]`
Retorna identidade e tamanho: inscritos, total de views, nº de vídeos, país, idioma, data de criação, tópicos. Define o "porte" do canal — essencial para julgar o que é outlier (um vídeo de 50k views é enorme para um canal de 10k inscritos e irrelevante para um de 5M).

**2. `vidiq_channel_videos`** — `channelId=[canal]`, `popular=true`, `videoFormat="long"`
Os vídeos MAIS populares de todos os tempos do canal. Mostra os campeões históricos e a "veia" que sempre funcionou.

**3. `vidiq_channel_videos`** — `channelId=[canal]`, `popular=false`, `videoFormat="long"`
Os uploads RECENTES. Cruze esta lista com a janela de 60 dias para ver o que o canal está apostando agora e como está performando.

**4. `vidiq_outliers`** — `channelIds=[canal]`, `publishedWithin="thisMonth"`, `sort="breakoutScore"`, `contentType="long"`
**A chamada mais importante.** Retorna os vídeos que mais furaram a média do canal recentemente, com breakout score. São os candidatos a "fórmula campeã real".
- Se vier pouco resultado (canal posta pouco), refaça com `publishedWithin="threeMonths"` e filtre mentalmente os que caem dentro dos ~60 dias.
- Use `minOutlierScore` se quiser cortar ruído em canais que postam muito.

**5. (Condicional) Aprofundamento dos campeões** — `vidiq_video_stats` com `granularity="daily"` nos 2–3 vídeos de maior breakout
Só se precisar confirmar a **velocidade** (VPH) — distinguir um vídeo que cresceu rápido e estável de um que teve um pico isolado. Opcional, mas eleva muito a qualidade da análise de "o que está dando certo AGORA".

**6. (Condicional) Formato Shorts** — repita os passos 2–4 com `videoFormat="short"` / `contentType="short"`
Só se o canal tiver volume relevante de Shorts. Shorts e long-form têm fórmulas de título diferentes; não misture na mesma análise — separe em duas seções se ambos forem fortes.

**7. (Opcional) Sentimento da audiência** — `vidiq_video_comments` no vídeo de maior breakout
Útil para captar o *vocabulário real* do público (palavras que eles próprios usam) e validar quais gatilhos emocionais ressoam. Alimenta a escolha de power words na Fase 2.

> **Tratamento de falha:** se qualquer chamada retornar erro de autenticação/conexão, informe o usuário: *"O conector vidIQ precisa ser reconectado nas configurações de conectores."* e **não prossiga inventando dados.** Se for erro de canal não encontrado, peça para confirmar o handle/URL.

### Passo 1.2 — Identificação das Fórmulas Campeãs (MÁXIMO 3)

Com os outliers + populares dos últimos ~60 dias em mãos, destile no **máximo 3 fórmulas** de título. Critério de seleção, em ordem:
1. Maior **outlier/breakout score** (furou mais a média).
2. Em empate, maior **VPH** (cresceu mais rápido).
3. Em empate, maior **view absoluto**.

Para CADA fórmula campeã, documente:

| Campo | O que preencher |
| :--- | :--- |
| **Nome da fórmula** | Rótulo memorável. Ex: "Pergunta de Afastamento", "Revelação Proibida", "Número + Promessa Temporal" |
| **Esqueleto** | A estrutura com lacunas. Ex: `Por que [pessoa] [ação inesperada] depois de [evento]` |
| **Gatilho-motor** | O gatilho mental que faz ela funcionar (ver biblioteca abaixo) |
| **Prova real** | Título(s) original(is) que usam a fórmula + **views reais e/ou breakout score** que justificam |

Sempre exatamente até 3. Nunca 4+. Se o canal só tiver 1 fórmula clara que domina, entregue 1 e diga que é uma estrutura única dominante.

### Passo 1.3 — Gatilhos, Temas Quentes e Tom

- **Gatilhos mentais dominantes:** quais aparecem nos vídeos que realmente performaram (não nos que floparam). Mapeie contra a biblioteca de gatilhos.
- **Temas quentes (últimos 60 dias):** os assuntos recorrentes nos outliers recentes. Quando der, contraste com o histórico ("antes era X, agora migrou para Y").
- **Tom de voz:** acolhedor / alarmista / íntimo / professoral / misterioso / indignado — descreva em 1–2 frases com exemplo.
- **Power words:** liste as palavras de poder que se repetem nos títulos campeões (ex: "verdade", "ninguém te conta", "silencioso", "agora", "definitivo").

### Passo 1.4 — Entrega do Relatório (Fase 1)

Entregue em PT-BR, nesta estrutura:

```
📊 RELATÓRIO FORENSE — [nome / @handle]
─────────────────────────────────────
Inscritos: X • Vídeos: Y • País/Idioma: Z • No ar desde: ANO
Janela analisada: últimos 60 dias (+ histórico de contexto)

🏆 FÓRMULAS CAMPEÃS (máx 3 — ordenadas por performance real)
1. [Nome] — Gatilho: [gatilho]
   Esqueleto: "[estrutura com lacunas]"
   Prova: "[título original]" → [views reais / breakout score / VPH]
2. ...
3. ...

🧠 GATILHOS QUE ESTÃO FUNCIONANDO
- [gatilho]: [por que funciona neste canal]

🔥 TEMAS QUENTES (últimos 60 dias)
- [tema]: [evidência — qual vídeo provou]
(quando aplicável) 📉 O que esfriou: [tema antigo que não performa mais]

🎙️ TOM DE VOZ
[descrição + exemplo]

🔑 POWER WORDS RECORRENTES
[palavra, palavra, palavra...]
─────────────────────────────────────
```

Encerre SEMPRE com:
> "Pronto ✅ Esse é o raio-X do canal. Agora me mande a **NOVA LENTE** — a nova perspectiva/ideia para o canal que você quer criar — que eu gero 15 títulos inéditos aplicando essas fórmulas campeãs ao seu novo tema."

**PARE AQUI. Não gere os 15 títulos ainda.** Espere a nova lente do usuário.

---

## FASE 2 — GERAÇÃO COM A NOVA LENTE (15 TÍTULOS)

**Gatilho de ativação:** depois do relatório, o usuário envia a "nova lente" — uma nova perspectiva, ângulo, nicho ou ideia para um canal novo.

### Passo 2.1 — Entendimento da Lente
A **nova lente é a IDEIA/TEMA**. As **fórmulas campeãs são a ESTRUTURA**. A Fase 2 funde os dois: aplica a engenharia que comprovadamente funciona a um assunto novo.

Se a lente vier vaga (ex: só "finanças"), use o que dá para inferir e siga; não trave o fluxo com muitas perguntas. Se vier rica (ex: "finanças pessoais para mães solo endividadas, tom de acolhimento"), aproveite cada detalhe.

### Passo 2.2 — Geração dos 15 Títulos (Regras de Ouro)

- **Exatamente 15 títulos.** Lista numerada de 1 a 15.
- **Distribuição entre as fórmulas:** espalhe os 15 pelas 3 fórmulas campeãs (≈5 por fórmula). Se houver só 1–2 fórmulas, distribua entre elas.
- **Ineditismo absoluto:** proibido copiar ou só trocar uma palavra dos títulos originais do canal analisado. Mantém-se a alma do padrão, nunca a casca.
- **Tema = nova lente:** todos os 15 vivem no universo da nova perspectiva. Nunca voltar ao nicho do canal de origem.
- **Herança de tom e gatilhos:** use o tom e os gatilhos identificados na Fase 1.
- **Otimização de CTR:** mantenha o tamanho médio dos títulos campeões; injete as power words; sem clickbait enganoso (promete o que o conteúdo pode entregar).
- **Idioma:** PT-BR nativo, salvo se a lente pedir outro idioma.

### Passo 2.3 — Entrega (Fase 2)

```
🎬 15 TÍTULOS — Nova Lente: [tema da lente]
Fórmulas aplicadas: (F1) [nome] • (F2) [nome] • (F3) [nome]
─────────────────────────────────────
1.  [título]  (F2)
2.  [título]  (F1)
3.  [título]  (F3)
...
15. [título]  (F1)
─────────────────────────────────────
```

Marcar a fórmula entre parênteses deixa visível a engenharia — o usuário vê de onde cada título nasceu. Ao final, ofereça: gerar mais 15 em outro ângulo, ou refinar os que ele marcar como favoritos.

---

## BIBLIOTECA DE REFERÊNCIA

### Gatilhos mentais (catálogo para mapeamento)
- **Curiosidade / Loop aberto:** promete uma resposta que só o clique entrega.
- **Urgência / Escassez:** "agora", "antes que", "últimos dias".
- **Medo de Perder (FOMO):** "o que ninguém te conta", "o erro que está te custando".
- **Exclusividade / Identidade:** "se você é do tipo que...", "os escolhidos".
- **Prova social:** números, "milhões", "todo mundo está".
- **Indignação / Injustiça:** denúncia, "a verdade que escondem".
- **Autoridade:** "o método", "o que os especialistas".
- **Transformação / Antes-e-depois:** "de X para Y".
- **Especificidade falsa:** números exatos e detalhes que soam reais ("às 3h47").
- **Contraste / Quebra de expectativa:** "ele parecia X, mas era Y".

### Esqueletos estruturais comuns
- Pergunta indireta: `Por que [sujeito] [ação] [contexto]`
- Revelação: `A verdade [oculta] sobre [tema]`
- Número + promessa: `[N] [coisas] que [resultado] em [tempo]`
- Comando/alerta: `Pare de [ação] antes de [consequência]`
- Identidade: `Se você [traço], então [revelação]`
- Reversão de status: `Eu [ação humilde] e agora [reviravolta]`
- Negação-gancho: `Ninguém [faz X], mas [resultado]`

### Tabela de mapeamento (use na análise)
| Fórmula | Esqueleto | Gatilho-motor | Prova (título + dado real) |
| :--- | :--- | :--- | :--- |
| [preencher] | [preencher] | [preencher] | [preencher com views/breakout] |

---

## REGRAS GERAIS E GUARDRAILS

- **Nunca invente** views, VPH, breakout score ou "campeãs". Dado vem do vidIQ ou não existe.
- **Sempre máximo 3** fórmulas campeãs; **sempre exatamente 15** títulos na Fase 2.
- **Respeite a ordem das fases.** Mesmo que o usuário mande canal + lente de uma vez, entregue PRIMEIRO o relatório (Fase 1), depois os 15 títulos (Fase 2), em blocos separados.
- **Long-form e Shorts não se misturam** na mesma análise de fórmula — separe se ambos forem relevantes.
- **Economia de créditos:** não repita chamadas vidIQ idênticas; reaproveite os dados já puxados na mesma sessão.
- **Modo degradado** (sem acesso a dados / só lista colada): permitido, mas rotule claramente que as fórmulas são inferidas por estrutura, não comprovadas por performance.
- **Ética de CTR:** clickbait que entrega o prometido, sim; engano puro, não.

---

## EXEMPLO COMPLETO (ilustrativo)

**Usuário (Fase 1):** "Analisa o canal @MensagensDoAlto, aqui estão alguns títulos: [lista]."

→ Skill puxa `channel_stats`, `channel_videos` (popular + recente), `outliers (thisMonth)`. Descobre que os 3 maiores breakouts dos últimos 60 dias seguem o padrão de carta divina em 2ª pessoa.

**Relatório (resumo):**
- 🏆 F1 "Mensagem Direta de Deus" — `Deus tem uma mensagem para você [hoje/agora]` — Gatilho: Exclusividade/Identidade — Prova: título X → 412k views, breakout 6.2×.
- 🏆 F2 "Alerta Espiritual" — `Pare de [ação] antes que [consequência espiritual]` — Gatilho: Medo/Urgência — Prova: título Y → 280k, breakout 4.1×.
- 🏆 F3 "Revelação do Escolhido" — `Se você [sinal], você foi escolhido para [missão]` — Gatilho: Identidade — Prova: título Z → 350k, breakout 5.0×.
- Temas quentes: provação financeira, sinais de propósito. Tom: mensageiro íntimo. Power words: "agora", "escolhido", "sinal", "não ignore".

→ Skill PARA e pede a nova lente.

**Usuário (Fase 2):** "Nova lente: finanças pessoais com pegada de fé, para o público que quer prosperar sem culpa."

→ Skill gera 15 títulos fundindo F1/F2/F3 ao tema dinheiro+fé. Ex:
1. Deus quer te ver próspero — e isso começa hoje (F1)
2. Pare de pedir dinheiro emprestado antes que a dívida roube sua paz (F2)
3. Se você sente vergonha de querer dinheiro, foi escolhido para quebrar esse ciclo (F3)
... até 15, cada um marcado com a fórmula.

---

## CHECKLIST FINAL (rode mentalmente antes de entregar)

**Fase 1:**
- [ ] Puxei dados reais do vidIQ (stats + videos + outliers)?
- [ ] As fórmulas campeãs têm prova de view/breakout real ao lado?
- [ ] São no máximo 3?
- [ ] Mapeei gatilhos, temas quentes (60 dias) e tom?
- [ ] Parei e pedi a nova lente?

**Fase 2:**
- [ ] Usei as fórmulas da Fase 1 (estrutura) + a nova lente (tema)?
- [ ] São exatamente 15 títulos, numerados, com a fórmula marcada?
- [ ] Todos no universo da nova lente, nenhum copiando os originais?
- [ ] Tom e power words herdados da análise?
