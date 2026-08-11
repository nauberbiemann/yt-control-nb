---
name: analista-estrategico-
description: "Realiza uma análise cirúrgica e estratégica de um canal do YouTube e de um vídeo viral de referência. Extraia o DNA do canal, engenharia de títulos, persona psicológica, anatomia do roteiro, SEO, análise de thumbnails, 10 ideias de vídeos de alta performance e 3 estratégias de Oceano Azul dentro do mesmo nicho. Ative esta skill SEMPRE que o usuário fornecer a URL de um canal do YouTube e/ou a URL de um vídeo viral e solicitar análise, pesquisa, estudo, desconstrução, engenharia reversa, ou criação de um novo canal baseado em referência. Também ative quando o usuário mencionar \"analisar canal\", \"DNA do canal\", \"pesquisa de nicho\", \"estudo de mercado YouTube\", \"engenharia de conteúdo\", \"oceano azul\", \"ideias de vídeo\", \"análise de thumbnail\", \"SEO YouTube\", \"engenharia reversa de canal\", \"modelar canal\", \"desconstruir canal\" ou \"relatório estratégico\"."
---

# Analista Estratégico de Canais e Conteúdo Viral

Esta skill transforma a URL de um canal do YouTube e a URL de um vídeo viral em um **relatório estratégico ultra-completo** que permite ao usuário criar um novo canal de sucesso no mesmo nicho **sem copiar ninguém**. A análise deve ser profunda, técnica, baseada em dados reais e acionável — NUNCA superficial ou genérica.

---

## REGRA DE OURO

> **Profundidade máxima. Dados reais. Nada genérico. Nada inventado.**
> Cada módulo deve entregar insights que o usuário NÃO conseguiria obter apenas assistindo ao conteúdo casualmente. A análise deve revelar os mecanismos ocultos por trás do sucesso: padrões psicológicos, estruturas narrativas, gatilhos emocionais e oportunidades de mercado invisíveis a olho nu. TODO dado apresentado deve vir de evidência real coletada do canal — se não for possível acessar, declare explicitamente.

---

## ENTRADAS OBRIGATÓRIAS

| Variável | Descrição | Exemplo |
|----------|-----------|---------|
| `URL_DO_CANAL` | Link do canal do YouTube a ser analisado | `https://www.youtube.com/@exemplo` |
| `URL_DO_VIDEO_VIRAL` | Link de um vídeo viral específico desse canal para análise profunda | `https://www.youtube.com/watch?v=xxxxx` |

**Entrada opcional (altamente recomendada):**

| Variável | Descrição |
|----------|-----------|
| `COMENTÁRIOS` | Lista de comentários do vídeo viral (colados pelo usuário). Quanto mais comentários, melhor a análise de persona. Mínimo ideal: 50-100 comentários. |

---

## PROTOCOLO DE COLETA DE DADOS (CRÍTICO)

Antes de escrever QUALQUER análise, execute esta fase de coleta. Sem dados reais, o relatório não tem valor.

### Etapa 1: Coleta do Canal
Use `web_fetch` na URL do canal para extrair:
- Nome do canal, número de inscritos, descrição, links externos
- Lista de vídeos visíveis com: título, número de views, data de publicação, duração (quando visível)
- Se a página do canal não retornar dados suficientes, use `web_search` com queries como: `site:youtube.com/@nomecanal`, `"nome do canal" youtube stats`, `"nome do canal" socialblade`

### Etapa 2: Coleta do Vídeo Viral
Use `web_fetch` na URL do vídeo viral para extrair:
- Título completo, views, likes, data de publicação, duração
- Descrição completa do vídeo (contém tags, links, timestamps)
- Primeiros comentários visíveis (se disponíveis na página)

### Etapa 3: Enriquecimento (se necessário)
Se os dados da Etapa 1 forem insuficientes:
- Use `web_search` para buscar estatísticas do canal (socialblade, noxinfluencer, etc.)
- Use `web_search` para encontrar informações adicionais sobre o nicho e concorrentes
- Busque vídeos específicos do canal para analisar padrões de thumbnails e títulos

### Regra de Integridade
- **NUNCA** invente views, inscritos, datas ou qualquer métrica. Se não encontrou, escreva: "Dado não disponível — não foi possível extrair via web_fetch/web_search."
- **SEMPRE** que apresentar um número, título ou comentário, ele deve ter vindo da coleta real.
- **NUNCA** preencha campos com chutes genéricos. Melhor deixar vazio com justificativa do que inventar.

---

## PROCESSO DE EXECUÇÃO

Ao receber as URLs (e opcionalmente os comentários), execute:
1. **Protocolo de Coleta de Dados** (acima)
2. **Módulos 1-9** na ordem apresentada (cada módulo alimenta o próximo)
3. **Resumo Executivo + Próximos Passos**

O resultado final deve ser um **único relatório em Markdown** com todos os módulos integrados.

---

## MÓDULO 1: O CÓDIGO VIRAL DO NICHO (Análise Comparativa)

### Objetivo
Identificar os **padrões convergentes de sucesso** do canal — o DNA viral que sustenta seu crescimento. Esta é uma análise de alto nível que funciona como "mapa do território" antes de aprofundar nos módulos seguintes.

### 1.1 DNA Viral: Padrões Convergentes de Sucesso

Analise o canal e preencha esta tabela com dados reais observados:

| Elemento Analisado | Padrão Identificado | Nível de Consistência |
|---|---|---|
| **Fórmula de Título Dominante** | Descreva os 2-3 padrões de título mais usados com exemplos reais | Alta/Média/Baixa |
| **Tipo de Gancho (Hook)** | Qual é a promessa/abertura padrão dos vídeos? O que o gancho oferece ao espectador? | Alta/Média/Baixa |
| **Estrutura Narrativa Padrão** | Mapeie o fluxo: Ex: Gancho → Explicação → Revelação → CTA. Seja específico ao nicho. | Alta/Média/Baixa |
| **Tom/Linguagem** | Autoritário, empático, técnico, casual? Que termos/expressões recorrentes o canal usa? | Alta/Média/Baixa |
| **Duração Ideal** | Faixa de duração dos vídeos que mais performam (extraída dos dados reais) | Alta/Média/Baixa |
| **Frequência de Upload** | Ritmo real de publicação observado (X vídeos por semana/mês) | Alta/Média/Baixa |
| **Tipo de Thumbnail** | Descreva o padrão visual REAL das thumbnails (cores, texto, elementos, estilo) | Alta/Média/Baixa |

### 1.2 Identidade e Posicionamento

- **Nicho exato**: Não diga apenas "finanças" ou "pets" — especifique o sub-nicho (ex: "finanças pessoais para jovens CLT que querem sair do aluguel", "comportamento felino para donas de gatos que humanizam o pet").
- **Proposta de valor implícita**: Qual é a promessa que o canal faz ao espectador, mesmo sem dizê-la explicitamente?
- **Nível de consciência do público**: O público já conhece o problema? Já tentou resolver? Está no estágio de "nem sabe que tem o problema"?
- **Posicionamento/Arquétipo**: É o "professor", o "amigo que manja", o "especialista distante", o "provocador", o "tradutor/decodificador", o "narrador"? Qual persona o canal assume? Descreva como essa persona constrói autoridade E conexão emocional ao mesmo tempo.
- **Com quem o canal se comunica**: Descreva o perfil demográfico inferido (idade, gênero, situação de vida) com base no tom, nos temas e na linguagem.

### 1.3 Tom de Voz e Linguagem

- **Registro linguístico**: Formal, informal, coloquial, técnico, humorístico, provocativo?
- **Vocabulário recorrente**: Liste as 15-20 palavras/expressões que o canal mais usa nos títulos, descrições e conteúdo (ex: "olha só", "a real é que", "isso aqui é brutal", "every believer", "hidden signs").
- **Frases de transição favoritas**: Como ele conecta ideias? (ex: "Mas calma, tem mais", "And here's where it gets interesting").
- **Nível de energia**: Fala acelerada e intensa? Calma e didática? Varia conforme o tema?
- **Uso de gírias/regionalismos/jargões do nicho**: Identifique termos específicos que revelam o público-alvo.

### 1.4 Estratégia de Publicação

- **Frequência real de postagem**: Quantos vídeos por semana/mês? (conte pelos dados coletados)
- **Duração média dos vídeos**: Calcule a média real a partir dos dados coletados.
- **Padrões de horário**: Há dias/horários preferidos? (se identificável)
- **Evolução temporal**: O canal mudou de estratégia ao longo do tempo? Compare vídeos antigos com recentes (temas, títulos, duração, formato).

### 1.5 Métricas de Sucesso Visíveis

- **Inscritos**: Número real.
- **Views médias**: Calcule a partir dos dados coletados.
- **Vídeos com performance acima da média**: Quais temas/formatos performam melhor? Liste os top 5-10 com views reais.
- **Vídeos com performance abaixo da média**: Quais temas o público ignora? Liste os piores 5.
- **Taxa de engajamento aparente**: Proporção de likes/comentários em relação às views (quando visível).

---

## MÓDULO 2: ENGENHARIA DE TÍTULOS E ATRAÇÃO

### Objetivo
Decodificar os **padrões psicológicos e estruturais** por trás dos títulos que geram mais cliques. O resultado deve ser um conjunto de **fórmulas nomeadas com taxa de viralização calculada**.

### 2.1 Coleta e Classificação

A partir dos dados coletados, liste os títulos do canal (mínimo 20, ideal 50+). Para cada título registre: título completo, views, duração do vídeo.

### 2.2 Fórmulas de Título com Taxa de Viralização

Este é o entregável mais importante deste módulo. Agrupe os títulos por padrão estrutural e calcule estatísticas reais:

**Formato obrigatório:**
- **Fórmula #1**: "[PADRÃO ESTRUTURAL]..." → XK+ views médias (Y% dos vídeos do canal)
  - Exemplos reais: [2-3 títulos que seguem este padrão]
- **Fórmula #2**: "[PADRÃO ESTRUTURAL]..." → XK+ views médias (Y% dos vídeos do canal)
  - Exemplos reais: [2-3 títulos]
- (Continue para todas as fórmulas identificadas, mínimo 3, ideal 4-6)

Explique por que isso é crítico: mostra qual fórmula de título funciona MELHOR naquele canal/nicho.

### 2.3 Palavras Magnéticas

Liste as palavras/expressões que aparecem consistentemente nos títulos de sucesso vs. os que falham. Separe em:
- **Palavras de alta conversão**: Aparecem nos vídeos com mais views
- **Palavras neutras**: Não impactam significativamente
- **Palavras a evitar**: Aparecem nos vídeos com menos views

### 2.4 Padrões de Formatação

- **Comprimento ideal**: Títulos curtos ou longos performam melhor? (calcule média de caracteres dos top 10 vs. bottom 10)
- **Uso de números**: Listas numeradas performam melhor? Com dados reais.
- **Uso de CAPS LOCK**: Há padrão de palavras em caixa alta?
- **Pontuação emocional**: Uso de "!", "...", "?" — qual performa melhor?
- **Idioma e localização**: Títulos em qual idioma? Mistura idiomas? (relevante para canais multilíngue)

### 2.5 Engenharia Reversa dos Top 5

Para os 5 títulos de MELHOR performance, decomponha:

| Título | Views | Promessa Implícita | Lacuna de Curiosidade | Emoção Ativada | Sinergia c/ Thumbnail |
|--------|-------|--------------------|-----------------------|----------------|-----------------------|
| [real] | [real] | [análise] | [análise] | [análise] | [análise] |

### 2.6 O que NÃO Funciona

Liste padrões/temas que performam abaixo da média com evidências.

---

## MÓDULO 3: ENGENHARIA DE METADADOS E SEO

### Objetivo
Mapear a estratégia de SEO do canal para entender como ele é descoberto no YouTube. Isso inclui tags, descrições, palavras-chave e associações com canais maiores.

### 3.1 Palavras-Chave Estratégicas (Tags Extraídas)

Analise as descrições dos vídeos, títulos, e use `web_search` para identificar:

- **Termos de Alta Intenção**: Palavras-chave que indicam busca ativa do público (ex: "bedtime prayer", "como investir", "cat behavior explained"). Liste 5-10.
- **Associação de Autoridade**: O canal usa tags ou menções a canais maiores do nicho para aparecer nas recomendações laterais? Quais? Isso é uma estratégia deliberada de "draft" (pegar carona no tráfego de canais maiores).
- **Foco em Benefício**: Palavras-chave focadas no resultado que o espectador quer (ex: "bible verses for protection", "como ganhar dinheiro dormindo"). Liste 5-10.
- **Cauda Longa vs. Cauda Curta**: O canal usa estratégia de SEO de cauda longa (frases específicas) ou cauda curta (termos genéricos)?

### 3.2 Estrutura das Descrições

- As descrições seguem um padrão? (ex: resumo + timestamps + links + tags)
- Há uso de timestamps/capítulos? Isso impacta retenção e SEO.
- Links para redes sociais, produtos, afiliados?
- Hashtags na descrição? Quais padrões?

### 3.3 Estratégia de Sugestão de Algoritmo

- O canal otimiza para **busca** (search) ou para **recomendação** (suggested/browse)?
- Há evidência de que o canal tenta aparecer como "vídeo sugerido" ao lado de canais maiores?
- Usa playlists estratégicas para aumentar session time?

---

## MÓDULO 4: A VOZ DO PÚBLICO (Análise de Persona)

### Objetivo
Construir um perfil psicológico profundo do público-alvo. Se o usuário forneceu comentários, esta seção deve ser construída PRIMARIAMENTE a partir deles. Se não forneceu, construa a partir da análise do conteúdo, títulos e padrões do canal.

### 4.1 Perfil da Persona

Dê um nome descritivo à persona (ex: "O Explorador Empático", "A Guerreira Espiritual", "O Investidor Ansioso") e descreva:

- **Perfil Demográfico Inferido**: Faixa etária, gênero predominante, interesses, contexto de vida provável (estudantes, profissionais, aposentados, etc.). Base a inferência em evidências concretas do tom, linguagem e temas.
- **Dores e Frustrações**: O que incomoda, o que machuca, o que frustra. Não liste genérico — conecte diretamente ao conteúdo do canal. Se há comentários disponíveis, use frases literais entre aspas.
- **Desejos e Aspirações**: O que querem alcançar, sentir, experimentar. Vá além do óbvio.
- **Job-to-be-Done**: Complete a frase na perspectiva do espectador: "Me faça sentir/aprender/entender [X] de uma forma que [Y] para que eu possa [Z]." Essa frase sintetiza POR QUE a pessoa clica no vídeo.

### 4.2 Mapeamento Psicológico Profundo

Este é o framework condensado que revela os mecanismos emocionais do público:

- **A Dor Oculta**: Qual é a dor que o público sente mas raramente verbaliza? (ex: "Sente que a vida moderna é um campo de batalha constante", "Tem medo de que seu gato não o ame de verdade"). Vá ALÉM da dor superficial.
- **O Desejo Profundo**: O que realmente querem, por trás do desejo aparente? (ex: "Não é apenas conhecer a Bíblia — é ter poder prático", "Não é apenas entender gatos — é validação emocional de que são especiais"). Identifique o desejo emocional subjacente.
- **O Medo**: O que temem? Qual medo o canal endereça ou alivia? (ex: "Medo de falhar com a família", "Medo de estar fazendo algo errado com seu pet").

### 4.3 Insights dos Comentários

Se o usuário forneceu comentários, analise-os e extraia:

**DORES (O que incomoda / O que machuca)**
- Queixas diretas que os comentadores fazem (com frases literais entre aspas)
- Frustrações mencionadas explicitamente
- Problemas que relatam estar enfrentando
- Medos que expressam

**DESEJOS (O que querem / O que sonham)**
- Resultados que gostariam de alcançar
- Perguntas que fazem (revelam o que não sabem e querem saber)
- Elogios ao criador (revelam o que valorizam)
- Pedidos de conteúdo futuro (revelam necessidades não atendidas)

**LINGUAGEM (Como se expressam)**
- Frases exatas que os comentadores usam (copie literalmente entre aspas)
- Gírias, jargões e expressões emocionais
- Tom predominante (raiva, gratidão, desespero, esperança, humor)

**OBJEÇÕES E CRENÇAS LIMITANTES**
- Dúvidas que expressam
- Crenças de "isso não funciona pra mim porque..."
- Comparações que fazem com outros criadores/soluções

### 4.4 Insights-Chave dos Comentários

Sintetize os padrões mais importantes em insights numerados:

- **Insight 1**: [título do insight]. [Explicação com evidência de comentários reais].
- **Insight 2**: [título do insight]. [Explicação com evidência].
- (Continue para 3-5 insights)

### 4.5 Frase que Define a Persona

> "[Uma frase que essa persona diria, sintetizando sua maior dor e desejo — como se fosse um comentário real]"

---

## MÓDULO 5: ANÁLISE DE THUMBNAILS (Padrão Visual)

### Objetivo
Desconstruir o padrão visual das thumbnails do canal para gerar um checklist replicável. A thumbnail é responsável por até 80% da decisão de clique — esta análise precisa ser visual e específica.

### 5.1 Elementos Visuais Recorrentes

Analise as thumbnails dos vídeos mais vistos do canal e liste os elementos que se repetem. Apresente como **checklist pronto para usar**:

- [ ] Elemento 1 (ex: "Rosto com expressão exagerada — surpresa/choque/medo")
- [ ] Elemento 2 (ex: "Números grandes em cores vibrantes — contraste alto")
- [ ] Elemento 3 (ex: "Seta vermelha apontando para elemento de destaque")
- [ ] Elemento 4 (ex: "Texto curto — máximo 3-4 palavras em CAPS")
- [ ] Elemento 5 (ex: "Cores quentes dominam — vermelho, laranja, amarelo")
- [ ] (Continue para TODOS os elementos identificados)

### 5.2 Paleta de Cores Dominante

- Quais cores predominam nas thumbnails de sucesso?
- Há contraste intencional? (ex: fundo escuro + texto claro, ou vice-versa)
- As cores mudam conforme o tema ou são consistentes?

### 5.3 Tipografia e Texto

- Quanto texto aparece na thumbnail? (nenhum, pouco, médio, muito)
- Qual estilo de fonte? (bold, serif, sans-serif, handwritten, impacto)
- Posição do texto na imagem? (topo, centro, canto)
- O texto complementa ou repete o título?

### 5.4 Estilo de Imagem

- Fotografias reais, ilustrações, imagens geradas por IA, colagens, screenshots?
- Se tem pessoas: rostos em close-up? Expressões exageradas? Pose específica?
- Se não tem pessoas: o que substitui? (objetos, cenários, texto grande, ícones)

### 5.5 Sinergia Título ↔ Thumbnail

- A thumbnail conta uma "história diferente" do título (complementar) ou repete a mesma informação (redundante)?
- A combinação cria uma lacuna de curiosidade adicional?
- Exemplifique com 2-3 casos reais do canal.

### 5.6 Template de Thumbnail Replicável

Com base na análise, descreva um template que resuma o padrão de thumbnail do canal:

> **Template**: [Descrição completa do layout — ex: "Fundo escuro com gradiente, rosto de pessoa em close-up no lado direito com expressão de choque, texto de 2-3 palavras em amarelo bold no lado esquerdo, seta vermelha apontando para elemento surpresa"]

---

## MÓDULO 6: ANÁLISE DE DURAÇÃO vs. VIRALIDADE

### Objetivo
Cruzar a duração dos vídeos com o número de views para identificar a faixa de duração ideal para viralização neste canal/nicho. Isso revela se o público prefere conteúdo curto (viraliza rápido) ou longo (gera mais monetização e session time).

### 6.1 Tabela de Duração vs. Views Médias

Agrupe os vídeos por faixa de duração e calcule views médias para cada faixa:

| Faixa de Duração | Views Médias | Nº de Vídeos | Observação |
|---|---|---|---|
| Shorts (< 1 min) | [real] | [real] | [viraliza mais rápido? menor monetização?] |
| 1-3 minutos | [real] | [real] | |
| 3-5 minutos | [real] | [real] | |
| 5-7 minutos | [real] | [real] | |
| 7-8 minutos | [real] | [real] | |
| 8-9 minutos | [real] | [real] | |
| 9-10 minutos | [real] | [real] | |
| 10+ minutos | [real] | [real] | |

(Adapte as faixas ao que fizer sentido para o canal. Se todos os vídeos são longos, use faixas maiores.)

### 6.2 Análise Estratégica

- **Duração que viraliza mais rápido**: Qual faixa tem views médias mais altas?
- **Duração que gera mais views totais**: Qual faixa tem o maior volume total?
- **Sweet spot recomendado**: Qual duração equilibra viralização + monetização para este nicho?
- **Tendência temporal**: A duração dos vídeos está aumentando ou diminuindo ao longo do tempo? Isso indica mudança de estratégia?

---

## MÓDULO 7: TEMAS RECORRENTES E ANATOMIA DO ROTEIRO

### Objetivo
Identificar os temas mais explorados pelo canal (ranking por frequência) e dissecar a estrutura completa do vídeo viral para extrair templates de roteiro replicáveis.

### 7.1 Temas Recorrentes (Ranking)

Categorize TODOS os vídeos do canal por tema/categoria e apresente o ranking:

- **Tema 1**: [nome] — X vídeos (Y% do canal) — Views médias: Z
- **Tema 2**: [nome] — X vídeos (Y% do canal) — Views médias: Z
- **Tema 3**: [nome] — X vídeos (Y% do canal) — Views médias: Z
- (Continue para todos os temas identificados)

Isso mostra qual tipo de conteúdo o canal prioriza E qual tem melhor performance.

### 7.2 DNA do Gancho (Primeiros 30 segundos do Vídeo Viral)

Esta é a parte MAIS importante do vídeo. Analise com precisão cirúrgica:

- **Primeira frase literal**: Transcreva ou descreva a primeira frase/cena do vídeo.
- **Tipo de abertura**: Qual técnica foi usada? (Pergunta provocativa, afirmação chocante, história in medias res, estatística impactante, promessa direta, contradição, demonstração visual, cenário "what if")
- **Loop aberto**: Qual pergunta ou curiosidade fica "pendurada" na mente do espectador?
- **Velocidade de entrega**: Quantas informações são entregues nos primeiros 30s?
- **Tom emocional da abertura**: Urgente? Íntimo? Autoritário? Divertido? Misterioso?
- **Elementos visuais do gancho**: O que aparece na tela durante o hook? (texto, imagens, cortes rápidos, zoom, B-roll)

### 7.3 Padrão Exato de Estrutura de Vídeo (Timings)

Mapeie a estrutura do vídeo viral em blocos com timestamps reais:

| Timestamp | Bloco | O que acontece | Função |
|---|---|---|---|
| 0:00-0:XX | GANCHO | [descrição] | Capturar atenção |
| 0:XX-X:XX | CONTEXTUALIZAÇÃO/VALIDAÇÃO | [descrição] | Estabelecer relevância |
| X:XX-X:XX | CONTEÚDO PRINCIPAL | [descrição] | Entregar valor central |
| X:XX-Final | FECHAMENTO + CTA | [descrição] | Converter ação |

Isso é um **template pronto para usar** em novos vídeos.

### 7.4 Técnicas de Retenção Identificadas

Liste TODAS as técnicas usadas para manter o espectador assistindo:
- **Pattern interrupts**: Mudanças visuais, sonoras ou de ritmo (quantas? a cada quantos segundos?)
- **Open loops internos**: Momentos de "mas antes disso..." ou "e o que aconteceu depois vai te chocar"
- **Storytelling**: Há narrativa com arco (conflito → clímax → resolução)?
- **Prova social**: Uso de dados, depoimentos, exemplos reais
- **Pacing (ritmo)**: A velocidade aumenta, diminui ou se mantém?
- **Edição**: Cortes rápidos? Jump cuts? B-roll? Texto na tela? Música emocional?

### 7.5 Templates de Roteiro (Estruturas Vencedoras)

Gere no mínimo 2 templates de roteiro replicáveis:

**Template 1: [Nome Descritivo] — Estrutura Dominante no Nicho**
*Baseada na estrutura mais usada pelos vídeos virais analisados*

```
[00:00-00:XX] GANCHO — [Descrição da técnica de abertura]
[00:XX-XX:XX] CONTEXTUALIZAÇÃO — [O que estabelecer neste bloco]
[XX:XX-XX:XX] CONTEÚDO PRINCIPAL — [Como entregar o valor central]
[XX:XX-Final] FECHAMENTO + CTA — [Como fechar e converter]
```

**Template 2: [Nome Descritivo] — Estrutura de Oportunidade (Oceano Azul)**
*Estrutura diferenciada que nenhum concorrente usa amplamente — oportunidade de se destacar*

```
[00:00-00:XX] GANCHO — [Técnica alternativa]
[00:XX-XX:XX] [BLOCO DIFERENCIADO] — [Descrição]
[XX:XX-XX:XX] [BLOCO DIFERENCIADO] — [Descrição]
[XX:XX-Final] FECHAMENTO + CTA — [Como fechar]
```

### 7.6 Fórmula Completa do Roteiro

> GANCHO ([técnica]) → CONTEXTO ([método]) → BLOCO 1 ([abordagem]) → ... → CTA ([tipo])
> Essa fórmula pode ser replicada em vídeos sobre [temas compatíveis].

---

## MÓDULO 8: 10 IDEIAS DE VÍDEOS DE ALTA PERFORMANCE (Plug-and-Play)

### Objetivo
Gerar **10 ideias de vídeo** que teriam alta probabilidade de viralizar no mesmo nicho, baseadas nos padrões de sucesso identificados nos módulos anteriores. Cada ideia deve ser **completa e acionável** — o usuário deve poder pegar a ideia e produzir o vídeo imediatamente.

### Formato OBRIGATÓRIO para cada ideia

Cada ideia DEVE incluir TODOS os campos abaixo:

```
### Ideia #N: [TÍTULO PROPOSTO]

- **Por que vai funcionar**: [Justificativa técnica baseada nos dados dos módulos anteriores. Ex: "Já viralizou no canal original" ou "Títulos com Fórmula #1 tiveram 450K+ views médias" ou "Atinge a Dor Oculta #1 da persona"]
- **Formato**: [Tipo de conteúdo — análise técnica, storytelling, lista, tutorial, comparação, etc.]
- **Dor/Desejo atacado**: [Referência cruzada com o Módulo 4]
- **Gatilho psicológico**: [Curiosidade, medo, validação, controvérsia, urgência, exclusividade]
- **Gancho sugerido**: "[Primeira frase/cena sugerida para abrir o vídeo — pronta para usar]"
- **Duração estimada**: [X-Y minutos, baseado na análise de duração vs. viralidade do Módulo 6]
- **Potencial de viralização**: [X/10] — [justificativa em 1 linha]
```

### Critérios de qualidade das ideias

1. Pelo menos 3 ideias devem usar a **Fórmula de Título #1** (a de maior performance).
2. Pelo menos 2 ideias devem atacar a **Dor Oculta** identificada no Módulo 4.
3. Pelo menos 1 ideia deve ser um **Oceano Azul** — formato ou ângulo que ninguém no nicho está explorando.
4. Os títulos devem usar as **palavras magnéticas** identificadas no Módulo 2.
5. Os ganchos devem seguir o **padrão de abertura** decodificado no Módulo 7.

### Ranking Final por Potencial

| # | Título | Potencial | Gatilho Principal | Fórmula Usada |
|---|--------|-----------|-------------------|---------------|
| 1 | ... | 10/10 | ... | Fórmula #X |
| 2 | ... | 9/10 | ... | Fórmula #X |
| ... | ... | ... | ... | ... |

---

## MÓDULO 9: ESTRATÉGIA DE OCEANO AZUL (MESMO NICHO)

### Objetivo
Propor **3 conceitos de novos canais** que atuem no **mesmo nicho/universo temático** do canal analisado, porém com um ângulo de diferenciação único. Não é para mudar de nicho — é para encontrar **sub-nichos inexplorados ou abordagens originais** dentro do mesmo mercado.

### REGRA CRÍTICA
> As ideias DEVEM permanecer no mesmo universo temático. Se o canal analisado é sobre gatos, as ideias devem ser sobre gatos (ou pets extremamente relacionados). Se é sobre finanças pessoais, as ideias devem ser sobre finanças pessoais. Se é sobre conteúdo bíblico, as ideias devem ser sobre conteúdo bíblico/espiritual. **NUNCA** sugira nichos completamente diferentes.

### Framework de Diferenciação

Para encontrar o Oceano Azul, aplique pelo menos um destes eixos:

| Eixo | Pergunta-chave | Exemplo |
|------|----------------|---------|
| **Audiência** | E se eu falasse com um SEGMENTO ESPECÍFICO desse público? | Canal de gatos → Canal só para donos de primeira viagem |
| **Formato** | E se eu entregasse o MESMO conteúdo em um FORMATO nunca usado no nicho? | Canal educativo → Formato de "reality show" ou "desafio" |
| **Ângulo** | E se eu abordasse o tema por uma PERSPECTIVA inédita? | Canal de culinária → Culinária explicada pela ciência |
| **Profundidade** | E se eu fosse MUITO mais profundo ou MUITO mais simples? | Canal genérico → Canal ultra-especializado |
| **Personalidade** | E se eu tivesse um PERSONA totalmente diferente? | Especialista sério → Personagem cômico que ensina |
| **Intersecção** | E se eu cruzasse esse nicho com OUTRO universo? | Fitness + RPG/Gamificação |

### Formato OBRIGATÓRIO para cada conceito

```
### Canal [N]: [NOME SUGERIDO]

- **Sub-nicho**: [Onde exatamente se posiciona dentro do universo temático]
- **Diferencial estratégico**: [O que faz DIFERENTE do canal analisado e dos concorrentes]
- **Público-alvo refinado**: [É o MESMO público ou uma fatia específica dele?]
- **Tom de voz proposto**: [Como se comunicaria de forma distinta]
- **Formato de conteúdo**: [Shorts? Longos? Séries? Documentários curtos? Podcasts visuais?]
- **3 títulos de exemplo**:
  1. "[título]"
  2. "[título]"
  3. "[título]"
- **Vantagem competitiva**: [Por que esse posicionamento tem espaço no mercado]
- **Dores/desejos da persona que esse canal atenderia MELHOR**: [Referência cruzada com Módulo 4]
- **Risco principal**: [Qual é o maior desafio ou obstáculo desse posicionamento]
```

### Comparação Estratégica Final

| Aspecto | Canal Original | Canal 1 | Canal 2 | Canal 3 |
|---------|---------------|---------|---------|---------|
| Sub-nicho | ... | ... | ... | ... |
| Diferencial | — | ... | ... | ... |
| Público | ... | ... | ... | ... |
| Formato | ... | ... | ... | ... |
| Risco | — | ... | ... | ... |

---

## FORMATO DO RELATÓRIO FINAL

O relatório final deve ser um **único documento Markdown** com esta estrutura:

```markdown
# RELATÓRIO ESTRATÉGICO: [NOME DO CANAL]
> Análise realizada em [data] | Canal: [URL] | Vídeo viral: [URL]

---

## PARTE 1: O CÓDIGO VIRAL DO NICHO (Análise Comparativa)
[Módulo 1 completo — tabela de DNA viral, identidade, voz, publicação, métricas]

---

## PARTE 2: ENGENHARIA DE TÍTULOS E ATRAÇÃO
[Módulo 2 completo — fórmulas nomeadas com taxa de viralização, palavras magnéticas, decomposição top 5]

---

## PARTE 3: ENGENHARIA DE METADADOS E SEO
[Módulo 3 completo — tags, palavras-chave, estratégia de algoritmo]

---

## PARTE 4: A VOZ DO PÚBLICO (Análise de Persona)
[Módulo 4 completo — persona, mapeamento psicológico, dor oculta/desejo profundo/medo, insights de comentários]

---

## PARTE 5: ANÁLISE DE THUMBNAILS (Padrão Visual)
[Módulo 5 completo — checklist de elementos, paleta, tipografia, template replicável]

---

## PARTE 6: ANÁLISE DE DURAÇÃO vs. VIRALIDADE
[Módulo 6 completo — tabela de faixas, sweet spot, tendência]

---

## PARTE 7: TEMAS RECORRENTES E ANATOMIA DO ROTEIRO
[Módulo 7 completo — ranking de temas, DNA do gancho, timings, templates de roteiro]

---

## PARTE 8: 10 IDEIAS DE VÍDEOS DE ALTA PERFORMANCE (Plug-and-Play)
[Módulo 8 completo — 10 ideias com todos os campos obrigatórios + ranking]

---

## PARTE 9: ESTRATÉGIA DE OCEANO AZUL
[Módulo 9 completo — 3 conceitos de canal + comparação estratégica]

---

## RESUMO EXECUTIVO
[5-10 bullet points com os insights MAIS importantes de todo o relatório — as descobertas que realmente importam e que o usuário não encontraria sozinho]

## PRÓXIMOS PASSOS RECOMENDADOS
[3-5 ações concretas e ordenadas que o usuário deve tomar com base neste relatório para criar seu canal]

## INFORMAÇÕES IMPORTANTES QUE FALTARAM
[Se houve dados que não foi possível coletar, liste aqui com explicação do que teria agregado e como o usuário pode obter essa informação por conta própria. Transparência total.]
```

---

## REGRAS FINAIS DE QUALIDADE

1. **NUNCA** entregue análises genéricas que poderiam se aplicar a qualquer canal. Cada insight deve ser ESPECÍFICO para o canal analisado.
2. **SEMPRE** use dados reais (títulos reais, comentários reais, métricas visíveis reais). Colete antes de analisar.
3. **SEMPRE** cruze informações entre módulos (ex: "A Dor Oculta da persona se conecta com a Fórmula de Título #1, que representa 44% dos vídeos e tem views médias 2x maiores").
4. **NUNCA** invente dados. Se não foi possível acessar alguma informação, declare explicitamente na seção "Informações que Faltaram".
5. **SEMPRE** justifique conclusões com evidências coletadas durante a análise.
6. **O relatório deve ser tão completo que o usuário consiga criar um canal novo e competitivo apenas com as informações contidas nele.**
7. **SEMPRE** escreva o relatório em Português Brasileiro (pt-BR), independente do idioma do canal analisado.
8. **NUNCA** use linguagem acadêmica excessiva. Seja técnico mas acessível.
9. **SEMPRE** inclua frases literais dos comentários entre aspas quando disponíveis.
10. **O Oceano Azul SEMPRE deve permanecer no mesmo nicho/universo temático do canal analisado.**
11. **SEMPRE** calcule porcentagens e médias reais quando apresentar fórmulas de título, duração vs. views, ou rankings de temas.
12. **SEMPRE** gere templates de roteiro com timings específicos, não apenas descrições vagas.
13. **SEMPRE** apresente a análise de thumbnails como checklist visual acionável, não como parágrafo descritivo.
14. **SEMPRE** inclua o módulo de SEO com tags/palavras-chave reais extraídas.
15. **SEMPRE** que a coleta retornar dados parciais, faça múltiplas buscas (web_search + web_fetch) para enriquecer antes de desistir.
