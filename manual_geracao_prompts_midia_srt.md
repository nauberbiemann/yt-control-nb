# Manual de Referência: Geração de Prompts de Mídias (Imagens e Vídeos) a partir de SRT

Este documento é a referência técnica definitiva e detalhada de como legendas no formato **SRT** são processadas, analisadas e transformadas em prompts visuais de alta fidelidade para geração de **Imagens**, **Vídeos B-Roll**, **Textos Cinematográficos** e **HyperFrames / Motion Graphics**.

---

## 1. Visão Geral do Pipeline de Mídias por SRT

O objetivo do pipeline é converter a narrativa em texto e tempo (legenda SRT) em uma esteira de produção visual automatizada, garantindo **ritmo visual dinâmico**, **consistência estética**, **coerência temática** e **ausência de monotonia**.

```
┌──────────────┐     ┌───────────────────────┐     ┌────────────────────────┐
│  Upload do   │ ──► │ Parse & Split de      │ ──► │ Classificação          │
│ Arquivo SRT  │     │ Linhas Longas (SRT)   │     │ Inteligente de Ativos  │
└──────────────┘     └───────────────────────┘     └────────────────────────┘
                                                               │
                                                               ▼
┌──────────────┐     ┌───────────────────────┐     ┌────────────────────────┐
│ Exportação   │ ◄── │ Engenharia de Prompts │ ◄── │ Aplicação de Cooldown  │
│ (TXT/CSV/FCP)│     │ LLM / Regras Estéticas│     │ e Alinhamento por Ritmo│
└──────────────┘     └───────────────────────┘     └────────────────────────┘
```

---

## 2. Processamento e Normalização do Arquivo SRT

### 2.1 Estrutura do Bloco SRT
Cada bloco do arquivo `.srt` padrão é composto por três elementos:
1. **Índice Numérico**: `1`, `2`, `3`...
2. **Intervalo Temporal (Timestamps)**: `HH:MM:SS,ms --> HH:MM:SS,ms` (ex: `00:01:15,250 --> 00:01:21,800`).
3. **Texto falado/narrado**: Uma ou mais linhas de texto associadas àquele tempo.

### 2.2 Algoritmo de Divisão de Linhas Longas (`splitLongRows`)
Linhas de legenda muito longas (acima de `10.0 segundos`) prejudicam o dinamismo visual. O algoritmo divide blocos longos automaticamente:
* **Tempo Máximo por Bloco (`maxDurationMs`)**: `10.000 ms` (10 segundos).
* **Alvo de Duração do Segmento (`targetSegmentMs`)**: `6.500 ms` (6,5 segundos).
* **Distribuição Proporcional de Palavras**: As palavras da frase são divididas proporcionalmente ao número de segmentos calculados, garantindo que os novos timestamps acompanhem o tempo estimado de fala sem cortar frases de maneira não natural.

---

## 3. Formatos de Vídeo e Seus Impactos nas Mídias

A definição dos tipos de mídias depende diretamente do **Formato do Vídeo** (`videoFormat`):

| Formato | Descrição | Comportamento de Mídias |
| :--- | :--- | :--- |
| **`avatar` (Apresentador)** | Vídeo com apresentador virtual falante na tela. | O apresentador ocupa a base temporal. B-Rolls (vídeo/imagem) entram em intervalos estratégicos com respiro humanizado. |
| **`faceless` / `catalog` (Canal Escuro)** | Vídeo 100% coberto por imagens, vídeos B-Roll e gráficos. | **Proibição total de apresentador em câmera.** Cada segundo de timeline é preenchido obrigatoriamente por vídeo, imagem ou HyperFrame. |
| **`vlog`** | Apresentador em estilo VLOG dinâmico. | Intervalos de corte mais longos e confortáveis, permitindo alternância entre apresentador e mídias de apoio. |
| **`avatar_flow`** | Múltiplos ângulos de avatar estático/cinematográfico. | Alterna ângulos de câmera fixos (`3/4 esquerdo`, `perfil direito`, `over the shoulder`, `close-up frontal`) sem B-Rolls externos. |

---

## 4. Regras de Classificação e Alocação dos Tipos de Mídias (`SrtAssetType`)

Cada linha do SRT é classificada em um dos seguintes ativos:

```typescript
type SrtAssetType = 'texto' | 'vídeo' | 'imagem' | 'avatar' | 'hyperframe';
```

### 4.1 Regra de Texto Curto (`asset = 'texto'`)
* **Gatilho**: Linhas de legenda com **25 caracteres ou menos** (`TEXT_MAX_CHARS`).
* **Função**: Em vez de gerar uma imagem ou vídeo, o texto é exibido em tela como uma sobreposição de título cinematográfico animado.
* **Estilos Disponíveis**: `Neon`, `Clean`, `Impact`, `Frost`, `Gold`.
* **Cooldown de Texto**: Existe um cooldown de **35 segundos** entre exibições de sobreposição de texto em tela. Se múltiplos textos curtos ocorrerem em menos de 35s, apenas o primeiro se torna `texto`; os demais revertem para a base do projeto (`avatar` ou `vídeo`).

### 4.2 Trava Temporal Estrita entre Vídeo e Imagem (`MAX_IMAGE_DURATION_MS`)
Para evitar vídeos estáticos e monótonos (estilo "slideshow" congelado):
* **Duração $\ge$ 4.0 segundos (`4000 ms`)**: O ativo **DEVE SER OBRIGATORIAMENTE UM VÍDEO** (`asset = 'vídeo'`). É estritamente proibido usar imagem estática para cenas com 4 segundos ou mais.
* **Duração < 4.0 segundos**: A cena pode ser uma **Imagem Estática** (`asset = 'imagem'`) ou **Vídeo**, dependendo do modo de alocação selecionado.

### 4.3 HyperFrames e Motion Graphics (`asset = 'hyperframe'`)
* **Modo Avatar/Vlog**: Injeção de cards de dados, gráficos ou destaques de texto estilo Apple/Docu sobre o apresentador (ex: `hf_break`, `hf_face_top`, `hf_focus`, `hf_double`, `hf_floating`, `hf_vertical`, `hf_holo`, `hf_documentary`, `hf_bento`, `hf_code_terminal`, `hf_data_chart`, `hf_world_map`, `hf_x_post`, `hf_reddit`, `hf_spotify`, `hf_quote`).
* **Modo Faceless**: Animações gráficas cinéticas de vídeo (ex: barra de progresso Apple, mapa de conexões globais, dashboard futurista, zoom de código) antecedidas **obrigatoriamente** pela tag `📷HyperFrames by HeyGen`.

### 4.4 Modos de Alocação de Mídias (`AssetAllocationMode`)
1. **`hybrid_smart` (Padrão Inteligente)**:
   * Duração $< 4,0s$ $\rightarrow$ Imagem estática.
   * Duração $\ge 4,0s$ $\rightarrow$ Vídeo em movimento.
2. **`force_all_video`**: Força **100%** dos B-Rolls a serem gerados como Vídeo.
3. **`alternating`**: Alterna rigorosamente entre Vídeo e Imagem a cada cena (respeitando a trava de 4s para vídeos longos).
4. **`all_image`**: Força imagens estáticas para todas as cenas com duração $< 4,0s$.

---

## 5. Regras de Ritmo, Cadência e Alinhamento Temporal

### 5.1 Zona de Proteção do Hook Inicial (`Clean Zone`)
Nos primeiros segundos do vídeo, a retenção do espectador depende do engajamento humanizado. É proibido inserir B-Rolls ou cortes nesses segundos iniciais:
* **Modo Avatar**: Primeiros **12 segundos** sem B-Rolls/HyperFrames.
* **Modo Faceless**: Primeiros **4 segundos** com cortes rápidos de abertura.
* **Modo VLOG**: Primeiros **6 segundos** limpos.

### 5.2 Cooldown de Respiro do Avatar
Para evitar o encavalamento de mídias em sequência (um B-Roll colado no outro):
* **Modo Avatar**: Exige no mínimo **5 segundos** de avatar limpo entre dois B-Rolls.
* **Modo Faceless**: Exige no mínimo **3 segundos** de respiro visual.

### 5.3 Alinhamento de Cortes por Pontuação Natural (`Natural Cuts`)
O algoritmo calcula o momento ideal de inserção da mídia baseado na taxa de cortes do trecho (Hook: 8s–14s, Corpo: 22s–32s, CTA: 40s–55s). 
Em seguida, ele executa um **look-ahead com tolerância de $\pm 1,5$ segundos** procurando o fim de uma frase com pontuação (`.`, `!`, `?`, `,`, `;`). Se encontrar, o corte da mídia é ajustado para coincidir exatamente com a pausa da fala do locutor.

---

## 6. Engenharia de Prompts Visuais: Regras e Sintaxe

### 6.1 Estrutura Obrigatória de um Prompt de Vídeo (`asset = 'vídeo'`)
Cada prompt de vídeo gerado por LLM deve ter entre **80 e 150 palavras** e seguir uma estrutura em duas partes distintas:

#### Parte 1: Composição do Primeiro Quadro (First Frame Composition)
Descrição autônoma, rica e detalhada da cena estática em inglês.

#### Parte 2: Diretiva de Animação e Congelamento de Identidade (Motion and Lock Directive)
Fórmula padrão usada para instruir o modelo de geração de vídeo (Sora, Runway Gen-3, Luma Dream Machine, Kling, Pika):

> *"Use the supplied image as the exact first frame and visual authority. Preserve its identity, anatomy, wardrobe, props, lighting, texture, spatial layout and geometry. Keep the visible world coherent; animate only the planned motion. [Instrução específica de movimento de câmera ou sujeito]. No other changes."*

#### Operações de Câmera Permitidas:
* **`Camera locked`**: Câmera 100% estática. Usada para ações rápidas de sujeitos ou close-ups faciais (evita distorções faciais).
* **`Rack focus`**: Mudança de foco entre plano frontal e fundo.
* **`Pan / Tilt / Zoom`**: Rotação ou ajuste focal sem paralaxe de translação.
* **`Push / Pull / Track`**: Movimento físico da câmera no espaço criando paralaxe 3D real.

---

### 6.2 Categorias Escalares de Cena (Shot Scale Categories)

Para manter o controle sobre o que aparece na tela e impedir que rostos indesejados apareçam em cenas técnicas, cada prompt é classificado em uma de 5 categorias:

```
                      Categorias Escalares de Cena
                                   │
      ┌────────────────────────────┼────────────────────────────┐
      ▼                            ▼                            ▼
WIDE_ESTABLISHING            PROCESS_MACRO                  SCHEMATIC
(Sem personagens/rostos)     (Sem rostos / Apenas        (Gráficos 3D / Blueprints
                              mãos com luvas)             Sem humanos/mãos)
      │                            │                            │
      └────────────────────────────┼────────────────────────────┘
                                   ▼
                            NARRATIVE_CAST
                 (Apenas aqui entram personagens
                  nomeados entre colchetes [Nome])
```

#### 1. `WIDE_ESTABLISHING` (Paisagem e Estabelecimento)
* **Regra**: Grandiosas paisagens, exteriores, estruturas ou veículos.
* **Restrição**: **ESTRITAMENTE PROIBIDO** conter personagens nomeados em colchetes ou figuras humanas destacadas.
* **Sufixo Obrigatório**: `cinematic wide-angle photography, panoramic drone view, 24mm lens, deep depth of field, realistic atmospheric lighting, movie frame, masterpiece, ultra detailed, 8K`

#### 2. `PROCESS_MACRO` (Processos e Mecânicas)
* **Regra**: Close-up de componentes, reações ou engrenagens técnicas.
* **Restrição**: **SEM ROSTOS OU PERSONAGENS NOMEADOS**. Mãos humanas só são permitidas se estiverem vestindo luvas apropriadas ao tema (ex: luvas de laboratório ou luvas industriais de segurança).
* **Sufixo Obrigatório**: `extreme close-up macro photography, high-speed camera details, 100mm lens, razor-thin depth of field, sharp details, volumetric lighting, movie frame, masterpiece, ultra detailed, 8K`

#### 3. `SCHEMATIC` (Blueprints e Esquemas 3D)
* **Regra**: Animação técnica 3D, mapas, diagramas de banco de dados ou fluxogramas.
* **Restrição**: **PROIBIDO QUALQUER HUMANO, ROSTO OU MÃO**.
* **Sufixo Obrigatório**: `3D clean technical rendering, clean graphic UI layout, orthographic view, sharp lines, glowing neon accents, minimalist design, masterpiece, ultra detailed, 8K`

#### 4. `JUXTAPOSITION` (Comparação Visual)
* **Regra**: Comparação entre dois conceitos em tela dividida ou lado a lado.
* **Sufixo Obrigatório**: `cinematic photography, split-screen comparison composition, side-by-side contrast, movie frame, dramatic lighting, 35mm lens, masterpiece, ultra detailed, 8K`

#### 5. `NARRATIVE_CAST` (Elenco Narrativo da História)
* **Regra**: Cenas onde um personagem da narrativa realiza ações ou expressa emoção.
* **Sinalização**: **ÚNICA CATEGORIA** permitida para incluir a tag do personagem entre colchetes (ex: `[Fulgrim]`, `[The Emperor]`).
* **Sufixo Obrigatório**: `ultra realistic cinematic photography, movie frame, authentic costumes, natural skin texture, realistic lighting, volumetric light, dramatic atmosphere, cinematic composition, shallow depth of field, Sony Alpha 7R V, 85mm lens, masterpiece, ultra detailed, 8K`

---

### 6.3 Regra Crítica de Idioma do Texto em Tela (`On-Screen Written Text`)

Quando o prompt descreve qualquer texto escrito visível no vídeo/imagem (rótulo, tela, documento, gráfico):
1. **O prompt e o ambiente são descritos em INGLÊS.**
2. **O texto impresso na tela DEVE SER FORÇADO no idioma do roteiro (Português).**
3. **Jamais deixar o texto implícito.** (Prompts implícitos fazem o gerador criar palavras em inglês ou letras ilegíveis).

* **Exemplo ERRADO (Implícito)**:  
  *❌ "a centered card showing a summary of study results"*
* **Exemplo CORRETO (Explicito e Forçado em Português)**:  
  *✔ "a centered rounded card showing a polished chart with bold text reading 'RESULTADOS DO ESTUDO'"*

---

### 6.4 Regra Anti-Metáfora Literal (`Anti-Literal Metaphor Guard`)

Quando o roteiro usa metáforas abstratas ou corporativas (ex: *"a engrenagem do sistema"*, *"a máquina de vendas"*, *"a corrosão do processo"*):
* **PROIBIDO**: Desenhar engrenagens físicas de latão, robôs genéricos ou matrizes verdes estilo Hacker, a menos que o vídeo seja literalmente sobre relógios ou computadores.
* **OBRIGATÓRIO**: Traduzir a metáfora para o universo estético do canal. Por exemplo, em um canal Dark/Gótico (Grimdark), "sistema/máquina" vira uma colossal nave espacial gótica em ruínas ou uma catedral decaying sob luz volumétrica.

---

### 6.5 Sistema de Injeção de Elenco Consistente (`[Character Name]`)

Se o canal possui personagens consistentes configurados (Narrative Cast):
* O script de IA escaneia o texto da legenda e injeta a tag do personagem entre colchetes no prompt: `[Fulgrim] looking distraught...`.
* **Proibição de Apresentadores em B-Roll**: Apresentadores virtuais que falar com a câmera são proibidos no modo `faceless` e banidos das mídias B-Roll do modo `avatar`.
* **Compilação Posterior**: Durante o envio para o gerador de imagem, a tag `[Fulgrim]` é substituída automaticamente pelo compilador pelo bloco de **Style DNA + Character DNA** configurado no banco do canal.

---

## 7. Formatos e Arquivos de Saída (Exports)

Após o processamento e higienização dos prompts, o sistema gera os seguintes arquivos de entrega:

### 7.1 `video_prompts.txt`
Contém a lista de todos os prompts de vídeo B-Roll numerados e prontos para inserção em lote (batch) em geradores como Luma, Runway, Sora ou Kling:
```text
1: 📷HyperFrames by HeyGen. Create a 7-second Apple-style motion graphic...
4: Realistic cinematic video of colossal luxury cruise ship sailing open ocean... Use the supplied image as the exact first frame...
```

### 7.2 `image_prompts.txt`
Contém a lista de prompts de imagem estática numerados:
```text
3: Photorealistic still image of a close-up laboratory beaker with glowing liquid, text reading 'FÓRMULA ATIVA', cinematic lighting...
```

### 7.3 `prompts_hybrid.txt`
Linha do tempo mista sequencial para editores:
```text
[IV] 1-HF: 📷HyperFrames by HeyGen...
[I]  2: Photorealistic still image of...
[IV] 3: Realistic cinematic video of...
```

### 7.4 `timeline.csv`
Tabela completa contendo a matriz de montagem do projeto:
```csv
start time,end time,texto,asset,prompt,caminho,texto_adicional
00:00:00,000,00:00:04,500,"Bem-vindos ao futuro.","avatar","","",""
00:00:04,500,00:00:08,200,"Analisando os dados do mercado.","vídeo","Realistic cinematic video of...","",""
```

### 7.5 `timeline.fcpxml`
Arquivo XML de linha do tempo profissional para importação direta com cortes sincronizados no **Final Cut Pro**, **Adobe Premiere Pro** ou **DaVinci Resolve**.

### 7.6 `draft_content.json` & `draft_meta_info.json`
Estrutura de projeto nativo para o **CapCut Desktop**, montando automaticamente a faixa de narração em áudio, faixas de vídeo e faixas de imagem já cortadas nos tempos exatos da legenda SRT.

---

## 8. Resumo dos Parâmetros Globais do Pipeline

| Parâmetro | Valor Padrão | Descrição |
| :--- | :--- | :--- |
| `TEXT_MAX_CHARS` | `25` | Limite de caracteres para transformar legenda em texto na tela. |
| `MAX_IMAGE_DURATION_MS` | `4.000 ms` | Duração máxima permitida para imagem estática. Cenas maiores viram vídeo. |
| `VIDEO_MAX_DURATION_MS` | `8.000 ms` | Duração padrão estimada para clips de vídeo B-Roll. |
| `HOOK_CLEAN_ZONE_AVATAR_MS` | `12.000 ms` | Abertura sem B-Rolls no modo Avatar. |
| `HOOK_CLEAN_ZONE_FACELESS_MS` | `4.000 ms` | Abertura sem apresentador no modo Faceless. |
| `MIN_AVATAR_CLEAN_TIME_AVATAR_MS` | `5.000 ms` | Respiro de fala do avatar entre B-Rolls. |
| `TEXTO_COOLDOWN_MS` | `35.000 ms` | Respiro mínimo entre exibições de texto na tela. |
| `HF_BROLL_EXCLUSION_MS` | `5.000 ms` | Respiro mínimo entre Hyperframes e B-Rolls. |
