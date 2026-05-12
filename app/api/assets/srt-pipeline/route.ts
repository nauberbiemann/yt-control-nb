import { NextRequest, NextResponse } from 'next/server';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';
import {
  applyAssetRules,
  buildPipelineResult,
  normalizeAssetType,
  parseSrtTimeToMs,
  parseSrtToRows,
  sanitizePrompt,
  type SrtAssetRow,
} from '@/lib/srt-asset-pipeline';

const BATCH_SIZE_DEFAULT = 4;
const BATCH_SIZE_REASONING = 2; // Reasoning models handle smaller batches more reliably
const SUPPORTED_PROMPT_ASSETS = new Set(['vídeo', 'imagem', 'texto', 'hyperframe']);

export const maxDuration = 60;

const SYSTEM_INSTRUCTIONS = `
You generate production-ready visual prompts for subtitle-driven videos.

Return only valid JSON.
Write every prompt in English (except for text styles which should match the provided list).
Do not include markdown, subtitles, on-screen text, logos, watermarks, or UI overlays.
Keep prompts concise, vivid, and generator-friendly.
Use one sentence per prompt, usually between 18 and 40 words.

` + `CRITICAL RULE: The subtitle text is the PRIMARY source of meaning. Every prompt MUST directly visualize what is being said at that specific moment. Generic scenes are not acceptable.

Rules for asset types:
- asset == "video":
  - First, identify what is being described in the subtitle text: a concept, feeling, process, place, or personal moment.
  - CRITICAL: The recurring character is OPTIONAL. Only include the character if the subtitle text explicitly references a PERSONAL, SUBJECTIVE, or FIRST-PERSON experience (memory, personal decision, emotional moment, first-person narrative using "I", "my", "me", or clearly describing the narrator's own experience).
  - If the text describes a TECHNICAL, SCIENTIFIC, or ABSTRACT concept (brain chemistry, code architecture, attention mechanisms, cognitive load, data structures, invisible processes, team dynamics as metaphor): ALWAYS use 3D technical animation WITHOUT the character. The prompt must begin with "3D technical animation of". CRITICAL: do NOT mention any person, human, man, woman, or character of any kind in these prompts — not even generically (e.g. NEVER write "a person in their forties" or "a human figure"). The scene must be purely conceptual, mechanical, or abstract.
  - If the text describes an ENVIRONMENT or SITUATION (workplace, meeting, nature, specific place) WITHOUT personal reference: visualize that specific environment WITHOUT the character. Do NOT mention any generic person or human in these prompts.
  - If the text is narrative/conceptual ("the team starts to...", "when a system...", "engineers know..."): do NOT include the character — use abstract or environmental visuals instead.
  - Only use the character for clear first-person moments ("I believed...", "I had a process...", "When I collapsed...", "I arrived home...").
  - For live-action prompts WITH character: begin with "Realistic cinematic video of" and include the recurring character. CRITICAL: when including the character, copy the exact character description provided under 'Recurring character reference' word for word — do NOT paraphrase, summarize, or substitute with generic terms like "a person", "a woman", or "someone". Always add ambient sound only, no dialogue, no voice-over.
  - For 3D/abstract prompts WITHOUT character: begin with "3D technical animation of" and visualize the concept directly. Add ambient sound only, no dialogue, no voice-over.
  - NEVER force the character into a technical or conceptual scene. NEVER default to a generic scene of "person at desk" when the content is conceptual. NEVER leak any part of the character description (age, gender, profession) into prompts where the character is absent.
- asset == "image":
  - Always create a realistic still image prompt.
  - The image must directly illustrate the SPECIFIC concept, object, emotion, or situation described in the subtitle text.
  - Choose a concrete, specific angle: if the text mentions cortisol, show cortisol effects; if it mentions notification overload, show a phone screen with hundreds of alerts; if it mentions deep focus, show a single desk lamp in a dark room with one focused person.
  - Be indirect and metaphorical when helpful, but always grounded in the specific content.
  - The prompt must begin with "Photorealistic still image of".
- asset == "text":
  - Read the current subtitle text provided as context.
  - Determine the emotion, urgency, and tone of what is being said.
  - Based on your analysis, choose exactly ONE visual style from the 'Available Text Styles' list provided below that best matches the tone.
  - Your prompt MUST ONLY be the EXACT name of the chosen style as written in the list. Do not add any other words.
  - Vary your choices across the sequence to create visual diversity. Do not use the same style for every text entry.
  - Style guidance: Neon = tech/hacker/matrix energy. Clean = calm/reflective/minimal. Impact = urgency/alarm/strong statements. Frost = futuristic/analytical/cool. Gold = elegant/important/prestigious.
- asset == "hyperframe":
  - The template_name specifies the layout schema required.
  - Do NOT generate a visual prompt. Instead, extract the key message from the subtitle text and return structured JSON.
  - Return the JSON inside the 'texto_adicional' property. The 'prompt' property must echo just the template_name.
  - CRITICAL: The HTML templates read the fields 'title', 'subtitle', and 'metrics' from the JSON. Use exactly these keys.
  - ALL schemas must also include a 'background_prompt' field: a 1-sentence English image generation prompt for the background behind the overlay. This prompt MUST be aligned with the 'Channel Visual Identity' if provided, otherwise use a dark cinematic default. The background must be dark, have no readable text, and leave the overlay legible.
  - Schemas (use exact field names shown):
    - hf_break:       {"title": "2-3 word idea", "subtitle": "—", "metrics": "—", "background_prompt": "..."}
    - hf_face_top:    {"title": "Impactful phrase max 6 words", "subtitle": "Brief context", "metrics": "KPI or —", "background_prompt": "..."}
    - hf_focus:       {"title": "Focus keyword", "subtitle": "Supporting sentence", "metrics": "— or KPI", "background_prompt": "..."}
    - hf_double:      {"title": "Main concept", "subtitle": "Analytical detail", "metrics": "— or data", "background_prompt": "..."}
    - hf_floating:    {"title": "Central keyword", "subtitle": "Side point", "metrics": "Side impact or —", "background_prompt": "..."}
    - hf_vertical:    {"title": "2-3 word insight", "subtitle": "Context", "metrics": "— or data", "background_prompt": "..."}
    - hf_holo:        {"title": "Insight headline", "subtitle": "Analysis phrase", "metrics": "Numeric data or —", "background_prompt": "..."}
    - hf_documentary: {"title": "Investigation theme", "subtitle": "Context phrase", "metrics": "Verified fact or —", "background_prompt": "..."}
    - hf_dynamic:     {"title": "Punchy headline", "subtitle": "— or short support", "metrics": "—", "background_prompt": "..."}
    - hf_face_bottom: {"title": "Analytical headline", "subtitle": "Detail phrase", "metrics": "Measurable result or —", "background_prompt": "..."}
  - Write all title/subtitle/metrics text in the exact language of the subtitle (usually Portuguese). Write background_prompt in English only.

Context rules:
- Use the current subtitle text as the main source of meaning.
- Use previous and next subtitle lines only to disambiguate.
- Avoid repeating the line literally.
- Prefer concrete subjects, environments, actions, materials, and mood.
- If 'Channel Visual Identity' is provided, align the visual style, atmosphere, and shot types with it.
- If 'Video Context' is provided, use it to inform the specific theme and visual direction of ALL prompts in this batch.
`.trim();

interface PromptBatchItem {
  row_number: number;
  asset: 'video' | 'image' | 'text' | 'hyperframe';
  template_name?: string;
  text: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  previous_text: string;
  next_text: string;
}

interface PromptResponseShape {
  prompts?: Array<{
    row_number?: number;
    prompt?: string;
    texto_adicional?: any;
  }>;
}

interface CharacterProfileInput {
  mode?: 'male' | 'female' | 'custom';
  customDescription?: string;
}

const resolveCharacterProfile = (input?: CharacterProfileInput | null) => {
  const mode = input?.mode === 'female' || input?.mode === 'custom' ? input.mode : 'male';
  const customDescription = String(input?.customDescription || '').replace(/\s+/g, ' ').trim();

  if (mode === 'custom' && customDescription) {
    return customDescription;
  }

  if (mode === 'female') {
    return 'same recurring Brazilian female senior software architect in her early 40s, focused expression, subtle signs of fatigue, modern dark home office, premium casual techwear';
  }

  return 'same recurring Brazilian male senior software architect in his early 40s, focused expression, subtle signs of fatigue, modern dark home office, premium casual techwear';
};

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const buildPromptItems = (rows: SrtAssetRow[]) =>
  rows.flatMap((row, index) => {
    if (!SUPPORTED_PROMPT_ASSETS.has(normalizeAssetType(row.asset))) return [];

    const previousText = rows[index - 1]?.texto?.trim() || '';
    const nextText = rows[index + 1]?.texto?.trim() || '';
    const durationSeconds = Number(((parseSrtTimeToMs(row.endTime) - parseSrtTimeToMs(row.startTime)) / 1000).toFixed(3));

    return [{
      row_number: row.rowNumber,
      asset: normalizeAssetType(row.asset) === 'texto' ? ('text' as const) : (normalizeAssetType(row.asset) === 'hyperframe' ? ('hyperframe' as const) : (normalizeAssetType(row.asset) === 'vídeo' ? ('video' as const) : ('image' as const))),
      template_name: normalizeAssetType(row.asset) === 'hyperframe' ? row.prompt.replace('hf:', '') : undefined,
      text: row.texto.trim(),
      start_time: row.startTime,
      end_time: row.endTime,
      duration_seconds: durationSeconds,
      previous_text: previousText,
      next_text: nextText,
    }];
  });

const parseJsonResponse = (rawContent: string): PromptResponseShape => {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fencedMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      throw new Error('A IA nao retornou JSON valido para os prompts do SRT.');
    }
    return JSON.parse(fencedMatch[0]);
  }
};

// Map also tracks which rows used a fallback so the UI can offer regeneration
const fallbackRows = new Set<number>();

const validatePromptBatch = (items: PromptBatchItem[], payload: PromptResponseShape) => {
  const expectedRows = new Set(items.map((item) => item.row_number));
  const promptMap = new Map<number, { prompt: string; texto_adicional?: any }>();

  for (const promptItem of payload.prompts || []) {
    const rowNumber = Number(promptItem?.row_number);
    const prompt = sanitizePrompt(promptItem?.prompt || '');
    if (!expectedRows.has(rowNumber) || (!prompt && promptItem.texto_adicional === undefined)) continue;
    promptMap.set(rowNumber, { prompt, texto_adicional: promptItem.texto_adicional });
  }

  // If the AI returned fewer prompts than expected, fill missing ones with a safe fallback
  // instead of crashing the entire pipeline for a partial failure
  if (promptMap.size !== expectedRows.size) {
    console.warn(
      `[SRT Pipeline] ⚠️ AI returned ${promptMap.size}/${expectedRows.size} prompts. Filling missing with fallback.`
    );
    for (const item of items) {
      if (!promptMap.has(item.row_number)) {
        const fallback =
          item.asset === 'text'
            ? 'Clean'
            : item.asset === 'hyperframe'
            ? item.template_name || 'hf_break'
            : item.asset === 'image'
            ? `Photorealistic still image of ${item.text.slice(0, 60).trim()}.`
            : `3D technical animation of ${item.text.slice(0, 60).trim()}. Ambient sound only, no dialogue, no voice-over.`;
        promptMap.set(item.row_number, { prompt: fallback });
        fallbackRows.add(item.row_number); // 🏷️ Track for UI feedback
      }
    }
  }

  return promptMap;
};

const enforceVideoPromptGuards = (prompt: string, _characterDescription: string) => {
  // The character is NEVER force-injected here.
  // The AI decides contextually whether the character belongs in the scene.
  // This function only ensures the mandatory audio cue is present.
  const normalized = sanitizePrompt(prompt);
  const hasAmbientCue = /ambient sound only|no dialogue|no voice-over|no voiceover/i.test(normalized);
  const audioClause = hasAmbientCue ? '' : ' Ambient sound only, no dialogue, no voice-over.';
  return sanitizePrompt(`${normalized}${audioClause}`);
};

const generateBatchWithOpenAI = async ({
  apiKey,
  model,
  batchItems,
  characterDescription,
  textStyles,
  visualIdentity,
  videoContext,
  facelessHint,
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
  textStyles: string;
  visualIdentity: string;
  videoContext: string;
  facelessHint: string;
}) => {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTIONS },
      {
        role: 'user',
        content: [
          'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"...", "texto_adicional":{}}]}.',
          'Include exactly one prompt per row_number.',
          `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment): ${characterDescription}`,
          `Available Text Styles: ${textStyles}`,
          visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
          videoContext ? `Video Context for this batch: ${videoContext}` : '',
          facelessHint || 'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
          'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
          JSON.stringify({ character_reference_optional: characterDescription, items: batchItems }, null, 2),
        ].filter(Boolean).join('\n\n'),
      },
    ],
    response_format: { type: 'json_object' },
  };

  if (!isReasoningModel(model)) {
    requestBody.temperature = 0.7;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao gerar prompts com OpenAI.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu sem conteudo para o lote de prompts.');
  return parseJsonResponse(content);
};

const generateBatchWithGemini = async ({
  apiKey,
  model,
  batchItems,
  characterDescription,
  textStyles,
  visualIdentity,
  videoContext,
  facelessHint,
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
  textStyles: string;
  visualIdentity: string;
  videoContext: string;
  facelessHint: string;
}) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [
              SYSTEM_INSTRUCTIONS,
              'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"...", "texto_adicional":{}}]}.',
              'Include exactly one prompt per row_number.',
              `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment): ${characterDescription}`,
              `Available Text Styles: ${textStyles}`,
              visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
              videoContext ? `Video Context for this batch: ${videoContext}` : '',
              facelessHint || 'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
              'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
              JSON.stringify({ character_reference_optional: characterDescription, items: batchItems }, null, 2),
            ].filter(Boolean).join('\n\n'),
          }],
        }],
        generationConfig: {
          temperature: 0.7,
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao gerar prompts com Gemini.');
  }

  const content = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '';
  if (!content) throw new Error('O Gemini respondeu sem conteudo para o lote de prompts.');
  return parseJsonResponse(content);
};

const generatePromptMap = async ({
  engine,
  model,
  apiKey,
  projectConfig,
  items,
  characterDescription,
  videoContext,
  videoFormat,
}: {
  engine: 'openai' | 'gemini';
  model: string;
  apiKey: string;
  projectConfig?: Record<string, any>;
  items: PromptBatchItem[];
  characterDescription: string;
  videoContext?: string;
  videoFormat?: 'avatar' | 'faceless';
}) => {
  const resolvedModel = engine === 'gemini'
    ? projectConfig?.gemini_api_model || resolveModel(model)
    : projectConfig?.openai_api_model || resolveModel(model);

  // Reasoning models handle smaller batches more reliably
  const batchSize = isReasoningModel(resolvedModel) ? BATCH_SIZE_REASONING : BATCH_SIZE_DEFAULT;

  const builtInStyles = 'Neon, Clean, Impact, Frost, Gold';
  const projectStyles = projectConfig?.editing_sop?.text_styles || projectConfig?.text_styles || '';
  const textStyles = projectStyles ? `${projectStyles}, ${builtInStyles}` : builtInStyles;

  const visualIdentity = projectConfig?.editing_sop?.visual_identity || '';
  const promptMap = new Map<number, string>();
  const textoAdicionalMap = new Map<number, any>();

  // Faceless mode: suppress character entirely and request full-screen compositions
  const facelessHint = videoFormat === 'faceless'
    ? 'FACELESS VIDEO MODE: Do NOT include any presenter, character, or person in video or image prompts. Every prompt must be a full-screen cinematic composition (cinematic B-roll, 3D animation, macro photography, abstract visual) that fills the entire frame. The subtitle text is your only reference for subject matter.'
    : '';

  for (const batch of chunk(items, batchSize)) {
    const payload = engine === 'gemini'
      ? await generateBatchWithGemini({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '', facelessHint })
      : await generateBatchWithOpenAI({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '', facelessHint });

    const validatedBatch = validatePromptBatch(batch, payload);
    validatedBatch.forEach((val, rowNumber) => {
      promptMap.set(rowNumber, val.prompt);
      if (val.texto_adicional) {
        textoAdicionalMap.set(rowNumber, val.texto_adicional);
      }
    });
  }

  return { promptMap, textoAdicionalMap };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const engine = body?.engine === 'gemini' ? 'gemini' : 'openai';
    const model = String(body?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1'));
    const projectConfig = body?.projectConfig || {};
    const characterDescription = resolveCharacterProfile(body?.characterProfile);
    const videoContext = String(body?.videoContext || '').trim();
    const videoFormat: 'avatar' | 'faceless' = body?.videoFormat === 'faceless' ? 'faceless' : 'avatar';
    
    // Batch Mode Branch
    if (Array.isArray(body?.batchItems) && body.batchItems.length > 0) {
      const apiKey = String(
        body?.apiKeyOverwrite || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || ''
      ).trim();

      if (!apiKey) {
        return NextResponse.json({ error: `API Key para ${engine} nao configurada.` }, { status: 401 });
      }

      const promptItems = body.batchItems as PromptBatchItem[];
      const { promptMap, textoAdicionalMap } = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        videoContext,
        videoFormat,
      });

      const prompts = promptItems.map((item) => ({
        rowNumber: item.row_number,
        prompt: item.asset === 'video'
          ? enforceVideoPromptGuards(promptMap.get(item.row_number) || '', characterDescription)
          : promptMap.get(item.row_number) || '',
        texto_adicional: textoAdicionalMap.get(item.row_number),
        isFallback: fallbackRows.has(item.row_number), // 🏷️ Let UI know which rows need regeneration
      }));

      return NextResponse.json({ prompts, hasFallbacks: fallbackRows.size > 0 });
    }

    // Legacy / Full-File Mode Branch
    const srtText = String(body?.srtText || '').trim();
    if (!srtText) {
      return NextResponse.json({ error: 'O conteudo do .srt ou o array batchItems e obrigatorio.' }, { status: 400 });
    }

    const parsedRows = parseSrtToRows(srtText);
    if (!parsedRows.length) {
      return NextResponse.json({ error: 'Nao foi possivel extrair blocos validos do .srt enviado.' }, { status: 400 });
    }

    const markedRows = applyAssetRules(parsedRows);
    const promptItems = buildPromptItems(markedRows);

    let rowsWithPrompts = markedRows;
    if (promptItems.length > 0) {
      const apiKey = String(
        body?.apiKeyOverwrite
        || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)
        || ''
      ).trim();

      if (!apiKey) {
        return NextResponse.json(
          { error: `API Key para ${engine} nao configurada. Defina em Ajustes Globais ou no ambiente.` },
          { status: 401 }
        );
      }

      const { promptMap, textoAdicionalMap } = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        videoContext,
      });

      rowsWithPrompts = markedRows.map((row) => ({
        ...row,
        prompt: normalizeAssetType(row.asset) === 'vídeo'
          ? enforceVideoPromptGuards(promptMap.get(row.rowNumber) || row.prompt, characterDescription)
          : promptMap.get(row.rowNumber) || row.prompt,
        texto_adicional: textoAdicionalMap.get(row.rowNumber),
      }));
    }

    return NextResponse.json(buildPipelineResult(rowsWithPrompts));
  } catch (error) {
    console.error('[SRT Pipeline] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao processar o SRT anexado.' },
      { status: 500 }
    );
  }
}
