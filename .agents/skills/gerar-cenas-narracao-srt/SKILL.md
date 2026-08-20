---
name: gerar-cenas-narracao-srt
description: Transformar SRT de narração falada em cenas cinematográficas prontas para geração no Flow, criando referências numéricas de consistência, um mapa_cenas.csv de planejamento e controle, e exatamente um prompt por bloco do SRT. Usar para documentários, histórias narradas, vídeos educativos, bíblicos, históricos, espirituais e ficcionais baseados em narração. Não usar para conteúdo musical.
---
# Gerar cenas de narração por SRT

## Objetivo
Transformar um SRT de narração em um pacote controlado de produção visual.
Entregar sempre:
1. `01_CONSISTENCY_REFERENCES.txt`;
2. `02_FLOW_PROMPTS.txt`;
3. `mapa_cenas.csv`;
4. resumo final de validação.

Construir primeiro o mapa de cenas. Usá-lo para decidir personagens, local, ação segura, estado final, câmera, risco de movimento e referências antes de escrever os prompts definitivos.

## Escopo fechado
Aceitar somente:
- narração falada;
- documentários;
- histórias narradas;
- vídeos históricos ou educativos;
- narrativas bíblicas ou espirituais;
- ficção narrada;
- vídeos explicativos construídos por cenas.

Não aplicar esta Skill a conteúdo musical. Se o material não for uma narração falada, informar que está fora do escopo e pedir um SRT de narração.

## Entradas
Receber:
1. SRT completo;
2. descrição do estilo visual ou imagens de referência;
3. indicação de época, país e formato, quando forem relevantes;
4. modo de geração, se o usuário tiver preferência.

Aplicar como padrões:
```text
GENERATION_MODE: DIRETO
ASPECT_RATIO: 16:9
PROMPT_LANGUAGE: English
CONVERSATION_LANGUAGE: idioma do usuário
REFERENCE_STYLE: NUMBER
GENERATED_CLIP_SECONDS_MAX: 8
AUDIO_MODE: DIEGETIC_ONLY
```

Usar `DIRETO` quando o usuário quiser um único prompt text-to-video por cena.
Usar `IV` somente quando o usuário pedir explicitamente primeiro frame e animação image-to-video.

## Fase 1 — Validar o SRT
Ler o SRT inteiro antes de produzir qualquer cena.
Confirmar:
- índices inteiros, crescentes e sem duplicação;
- timestamps válidos;
- `start < end`;
- texto não vazio;
- duração real de cada bloco;
- quantidade total de blocos;
- ausência de sobreposição;
- blocos acima do limite do gerador.

Não corrigir, juntar, dividir, pular ou renumerar blocos silenciosamente.
Aplicar a regra soberana:
```text
1 bloco do SRT = 1 linha do mapa = 1 prompt = 1 arquivo de cena
```
A contagem e a ordem final devem corresponder exatamente ao SRT.

## Fase 2 — Compreender a narrativa completa
Identificar antes do primeiro prompt:
- premissa;
- personagens;
- locais;
- época;
- progressão cronológica;
- conflitos;
- revelações;
- clímax;
- resolução;
- objetos recorrentes;
- mudanças de figurino;
- mudanças de luz e clima;
- continuidade entre blocos.

Usar contexto futuro apenas para compreender a história. Nunca mostrar em uma cena uma revelação que pertence a um bloco posterior.
Quando uma frase estiver dividida entre dois ou mais blocos:
- manter o mesmo personagem, local e momento;
- representar em cada cena somente a informação acrescentada pelo bloco atual;
- variar enquadramento, foco ou detalhe;
- não criar uma situação desconectada;
- não repetir exatamente a mesma cena.

## Fase 3 — Criar as referências de consistência
Ativar consistência para personagens, grupos, locais, cenários, objetos, veículos ou animais que reaparecem.
Usar referências numéricas sequenciais:
```text
[01] [02] [03]
```
Tipos permitidos:
```text
CHARACTER
GROUP
LOCATION
SET
PROP
VEHICLE
ANIMAL
```
Criar apenas referências realmente necessárias. Não criar uma referência diferente para cada cena.
Limitar cada prompt a no máximo três referências.
Exigir em cada prompt pelo menos uma referência `LOCATION` ou `SET`.

Usar o seguinte cabeçalho:
```text
CONSISTENCY_MODE: ON
REFERENCE_STYLE: NUMBER
ASPECT_RATIO: 16:9
TOTAL_REFERENCES: N
```

Usar este formato para cada referência:
```text
[01] CANONICAL_NAME: nome_canonico TYPE: CHARACTER IMAGE_PROMPT_EN: descrição visual completa para gerar uma imagem estática de referência.
```

Manter cada referência em uma única linha física. Inserir exatamente uma linha vazia entre referências.
Não colocar nos prompts de referência:
- movimento de câmera;
- sequência de ações;
- montagem;
- vários momentos;
- marcadores de outras referências;
- texto ou logotipo;
- aparência contraditória.

### Referências de personagens
Definir:
- idade aproximada;
- traços faciais;
- cabelo;
- tom natural de pele;
- estrutura corporal;
- figurino;
- calçados;
- acessórios permanentes;
- expressão neutra;
- mãos visíveis;
- corpo inteiro;
- fundo simples;
- aparência historicamente compatível.

### Referências de locais
Definir:
- arquitetura;
- materiais;
- disposição espacial;
- época;
- iluminação;
- clima;
- profundidade;
- entradas e saídas;
- objetos fixos;
- ausência de pessoas.

## Fase 4 — Construir `mapa_cenas.csv`
Criar o CSV antes dos prompts finais.
Usar exatamente este cabeçalho:
```csv
scene_index,start,end,duration,srt_context_summary,expected_refs,active_character,passive_characters,location_ref,safe_visual_state,primary_action,final_state,motion_risk,camera_complexity,prompt,video_path,generation_status,review_status,retry_action,review_reason
```

Preencher:
- `scene_index`: número correspondente ao SRT;
- `start`: início original;
- `end`: fim original;
- `duration`: duração exata em segundos;
- `srt_context_summary`: resumo semântico curto, sem copiar longos trechos;
- `expected_refs`: referências que devem aparecer no prompt;
- `active_character`: no máximo um personagem ativo;
- `passive_characters`: personagens presentes sem ação principal;
- `location_ref`: exatamente uma referência `LOCATION` ou `SET`;
- `safe_visual_state`: situação inicial estável;
- `primary_action`: uma única ação principal simples;
- `final_state`: estado visual sustentável até o corte;
- `motion_risk`: `LOW`, `MEDIUM` ou `HIGH`;
- `camera_complexity`: `LOCKED`, `SIMPLE` ou `MODERATE`;
- `prompt`: prompt final completo;
- `video_path`: caminho do vídeo depois da geração;
- `generation_status`: estado da geração;
- `review_status`: estado da revisão;
- `retry_action`: decisão de correção;
- `review_reason`: justificativa curta.

Na primeira entrega, inicializar:
```text
video_path:
generation_status: PENDING_VIDEO
review_status: NOT_REVIEWED
retry_action: NONE
review_reason:
```
O campo `prompt` do CSV deve ser idêntico ao prompt correspondente em `02_FLOW_PROMPTS.txt`.

## Fase 5 — Planejar cenas seguras para o Flow
Transformar a narração em uma prova visual clara e gerável.
Preferir mostrar o estado ou o resultado emocional da ação.
Exemplo inadequado:
```text
O homem corre pelo corredor, abre a porta, atravessa o cômodo e fecha a porta.
```
Exemplo seguro:
```text
O homem permanece no corredor diante da porta já aberta, com expressão tensa.
```

Aplicar por cena:
- um personagem ativo;
- uma ação principal;
- no máximo uma interação simples com objeto;
- um estado inicial legível;
- um estado final estável;
- uma operação de câmera;
- personagens fisicamente separados quando houver risco de duplicação;
- contato corporal já estabelecido quando a mecânica do contato for difícil.

Evitar:
- abrir, atravessar e fechar na mesma cena;
- correr e manipular objetos simultaneamente;
- entregar objetos de mão em mão;
- levantar ou carregar pessoas;
- multidões com personagens recorrentes;
- várias ações consecutivas;
- mudanças completas de cenário dentro do mesmo take;
- mãos ocultas durante interação importante;
- ações que dependem de anatomia precisa e complexa.

Quando `motion_risk: HIGH`, reescrever a cena antes de gerar o prompt. Mostrar o antes ou o depois, não a mecânica completa.

## Fase 6 — Garantir aderência narrativa
Para cada bloco, registrar uma evidência visual específica.
Perguntar internamente:
1. O que este bloco acrescenta à história?
2. Qual detalhe visível prova essa informação?
3. O personagem correto está presente?
4. O local é coerente?
5. A cena antecipa algo?
6. A cena poderia servir sem alteração para muitos outros blocos?
Se a resposta da última pergunta for sim, considerar a cena genérica e reescrevê-la.
Não ilustrar apenas o tema geral. O prompt `N` deve representar o bloco `N`.

## Fase 7 — Controlar continuidade
Manter entre cenas consecutivas:
- rosto;
- idade;
- cabelo;
- figurino;
- objetos;
- direção do olhar;
- lado do quadro;
- posição relativa;
- iluminação;
- clima;
- horário;
- condição do cenário.

Usar o `final_state` da cena anterior como base para o `safe_visual_state` da próxima quando o momento continuar.
Se houver mudança de época, local ou personagem, torná-la semanticamente justificada pelo bloco atual.

## Fase 8 — Impedir repetição
Comparar cada nova cena com todas as anteriores.
Não repetir:
- mesma descrição;
- mesma pose;
- mesma ação;
- mesmo objeto em igual posição;
- mesma escala e câmera em sequência;
- mesmo som;
- mesmo estado inicial e final;
- mesmo cenário sem progressão.

Permitir retorno ao mesmo local somente quando a história exigir. Nesse caso, mudar estado, luz, ação, enquadramento ou significado narrativo.

## Fase 9 — Direcionar a câmera
Usar exatamente um movimento por take.
Catálogo permitido:
```text
Static
Pan Left
Pan Right
Tilt Up
Tilt Down
Zoom In
Zoom Out
Roll Clockwise
Roll Counterclockwise
Tracking Left
Tracking Right
Arc Clockwise
Arc Counterclockwise
Boom Up
Boom Down
Pedestal Up
Pedestal Down
Push In / Dolly
Pull Out / Dolly
Dolly Zoom
```

Escolher a câmera de acordo com narrativa, geometria e risco. Não escolher por rotação automática.
Usar `Static` para:
- duração abaixo de 1,25 segundo;
- contato corporal;
- mãos importantes;
- grupos;
- identidade facial prioritária;
- ação física sensível;
- momento contemplativo.

Evitar movimentos de viagem abaixo de 2,5 segundos.
Usar movimento ativo apenas quando o cenário sustentar profundidade e paralaxe.

Para câmera ativa, escrever:
```text
Camera movement: NOME_CANÔNICO. mecanismo, direção, âncora e trajetória; Speed: slow. Stabilization: descrição. Intensity: N%. Begin within 0.3s, reach the endpoint by X.XXs, then hold without drift through the cut.
```
Calcular `X.XX` antes do fim da cena e reservar de 0,25 a 0,65 segundo para o enquadramento final.

Para câmera estática, escrever:
```text
Camera movement: Static. Keep the camera completely locked with invariant position, focal length, framing and horizon; Speed: none. Stabilization: locked-off precision. Intensity: 0%. Hold without drift through the cut.
```

## Fase 10 — Controlar o áudio
Gerar somente som ambiente físico e foley.
Não gerar:
- música;
- trilha;
- diálogo;
- narração;
- palavras faladas;
- canto;
- som de câmera;
- efeitos artificiais de transição.

Usar em todos os prompts:
```text
Audio mode: DIEGETIC-ONLY SOURCE LOCK. Generate exactly the listed physical source sounds and nothing else.
```
Depois escrever:
```text
Ambient sound: fontes físicas visíveis ou estabelecidas na cena.
```
Finalizar com:
```text
No music, no background score, no dialogue, no narration, no spoken words, no singing, no chanting, only natural diegetic environmental sounds and synchronized sound effects.
```
Relacionar cada som a uma fonte real: passos na superfície, vento na vegetação, chuva no vidro, madeira cedendo, tecido, ferramentas ou máquinas visíveis.

## Fase 11 — Compilar os prompts

### Modo DIRETO
Usar uma única linha física por cena:
```text
N [01] [02] Visual scene: descrição específica da situação, personagem, local, estado seguro e uma ação principal. Visual style: contrato visual fixo. Camera movement: movimento canônico com física completa. Duration: D.DDDs. Audio mode: DIEGETIC-ONLY SOURCE LOCK. Generate exactly the listed physical source sounds and nothing else. Ambient sound: sons físicos da cena. No music, no background score, no dialogue, no narration, no spoken words, no singing, no chanting, only natural diegetic environmental sounds and synchronized sound effects. NEGATIVE_DNA.
```
Exigir:
- número igual ao bloco;
- uma a três referências;
- pelo menos um `LOCATION` ou `SET`;
- `Visual scene:` entre 25 e 70 palavras;
- estilo visual invariável;
- duração exata;
- câmera completa;
- áudio fechado;
- restrições negativas;
- uma linha vazia entre prompts.

### Modo IV
Usar:
```text
N [i] [01] [02] Visual scene: primeiro frame estático e completo. [v] Preserve the source image exactly. ação simples, microdinâmicas, câmera, duração, endpoint, estado final e áudio.
```
Não colocar sequência temporal no primeiro frame.
Não redescrever aparência, figurino ou cenário em `[v]`.

## Fase 12 — Revisar vídeos gerados
Executar esta fase somente quando os vídeos estiverem disponíveis.
Extrair frames do:
- começo;
- meio;
- final.

Verificar:
- personagem esperado presente;
- personagem errado;
- personagem duplicado;
- identidade e idade;
- deformação grave;
- arquivo corrompido;
- correspondência com a cena;
- ação principal;
- continuidade;
- estado final.

Classificar:
```text
APPROVED
SUSPECT
REJECTED
```
Escolher:
```text
KEEP
REMAKE_VIDEO
REMAKE_PROMPT
MANUAL_REVIEW
```
Usar `REMAKE_VIDEO` quando o prompt estiver correto e a geração tiver falhado.
Usar `REMAKE_PROMPT` quando o próprio prompt permitir ambiguidade, excesso de ação ou referência incorreta.
Usar `MANUAL_REVIEW` para problemas estéticos leves ou subjetivos.

Reprovar automaticamente somente por falhas importantes:
- personagem ausente ou errado;
- duplicação;
- deformação grave;
- vídeo corrompido ou incompleto;
- cena claramente incompatível.

Não reprovar automaticamente por expressão apenas mediana, enquadramento genérico ou pequenas imperfeições estéticas.
Atualizar `video_path`, `generation_status`, `review_status`, `retry_action` e `review_reason` no CSV.
Processar primeiro cenas sem vídeo. Processar cenas marcadas para refazer depois das faltantes.

## Validação final
Antes da entrega, confirmar:
- três arquivos presentes;
- referências sequenciais;
- referências em uma única linha física;
- uma linha vazia entre referências;
- total de referências correto;
- total de linhas do CSV igual ao total de blocos;
- total de prompts igual ao total de blocos;
- ordem 1:1 preservada;
- timestamps idênticos ao SRT;
- duração exata;
- prompt do CSV idêntico ao arquivo de prompts;
- uma a três referências por prompt;
- uma referência de local por prompt;
- no máximo um personagem ativo;
- nenhuma cadeia de ações complexas;
- nenhum placeholder;
- nenhuma repetição injustificada;
- câmera compatível com a duração;
- endpoint dentro do take;
- áudio somente diegético;
- nenhum elemento moderno em cenas históricas;
- nenhum conteúdo musical.

Se qualquer item falhar, corrigir antes de entregar.

## Resumo de QA
Informar ao usuário:
```text
TOTAL_SRT_BLOCKS
TOTAL_SCENES
TOTAL_PROMPTS
TOTAL_SCENE_MAP_ROWS
TOTAL_REFERENCES
COUNT_MISMATCH
TIMING_ERRORS
REFERENCE_ERRORS
FLOW_MOTION_RISK_WARNINGS
FINAL_STATUS
```
Usar `FINAL_STATUS: APPROVED` somente quando não houver erros estruturais ou semânticos.
