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

const BATCH_SIZE = 4;
const SUPPORTED_PROMPT_ASSETS = new Set(['vídeo', 'imagem', 'texto']);

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
  - If the text describes a TECHNICAL, SCIENTIFIC, or ABSTRACT concept (brain chemistry, code architecture, attention mechanisms, cognitive load, data structures, invisible processes, team dynamics as metaphor): ALWAYS use 3D technical animation WITHOUT the character. The prompt must begin with "3D technical animation of".
  - If the text describes an ENVIRONMENT or SITUATION (workplace, meeting, nature, specific place) WITHOUT personal reference: visualize that specific environment WITHOUT the character.
  - If the text is narrative/conceptual ("the team starts to...", "when a system...", "engineers know..."): do NOT include the character — use abstract or environmental visuals instead.
  - Only use the character for clear first-person moments ("I believed...", "I had a process...", "When I collapsed...", "I arrived home...").
  - For live-action prompts WITH character: begin with "Realistic cinematic video of" and include the recurring character. Always add ambient sound only, no dialogue, no voice-over.
  - For 3D/abstract prompts WITHOUT character: begin with "3D technical animation of" and visualize the concept directly. Add ambient sound only, no dialogue, no voice-over.
  - NEVER force the character into a technical or conceptual scene. NEVER default to a generic scene of "person at desk" when the content is conceptual.
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
  asset: 'video' | 'image' | 'text';
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
      asset: normalizeAssetType(row.asset) === 'texto' ? ('text' as const) : (normalizeAssetType(row.asset) === 'vídeo' ? ('video' as const) : ('image' as const)),
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

const validatePromptBatch = (items: PromptBatchItem[], payload: PromptResponseShape) => {
  const expectedRows = new Set(items.map((item) => item.row_number));
  const promptMap = new Map<number, string>();

  for (const promptItem of payload.prompts || []) {
    const rowNumber = Number(promptItem?.row_number);
    const prompt = sanitizePrompt(promptItem?.prompt || '');
    if (!expectedRows.has(rowNumber) || !prompt) continue;
    promptMap.set(rowNumber, prompt);
  }

  if (promptMap.size !== expectedRows.size) {
    throw new Error('A IA retornou uma quantidade incompleta de prompts para o lote atual do SRT.');
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
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
  textStyles: string;
  visualIdentity: string;
  videoContext: string;
}) => {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTIONS },
      {
        role: 'user',
        content: [
          'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"..."}]}.',
          'Include exactly one prompt per row_number.',
          `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment): ${characterDescription}`,
          `Available Text Styles: ${textStyles}`,
          visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
          videoContext ? `Video Context for this batch: ${videoContext}` : '',
          'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
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
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
  textStyles: string;
  visualIdentity: string;
  videoContext: string;
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
              'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"..."}]}.',
              'Include exactly one prompt per row_number.',
              `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment): ${characterDescription}`,
              `Available Text Styles: ${textStyles}`,
              visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
              videoContext ? `Video Context for this batch: ${videoContext}` : '',
              'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
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
}: {
  engine: 'openai' | 'gemini';
  model: string;
  apiKey: string;
  projectConfig?: Record<string, any>;
  items: PromptBatchItem[];
  characterDescription: string;
  videoContext?: string;
}) => {
  const resolvedModel = engine === 'gemini'
    ? projectConfig?.gemini_api_model || resolveModel(model)
    : projectConfig?.openai_api_model || resolveModel(model);

  const builtInStyles = 'Neon, Clean, Impact, Frost, Gold';
  const projectStyles = projectConfig?.editing_sop?.text_styles || projectConfig?.text_styles || '';
  const textStyles = projectStyles ? `${projectStyles}, ${builtInStyles}` : builtInStyles;

  const visualIdentity = projectConfig?.editing_sop?.visual_identity || '';
  const promptMap = new Map<number, string>();

  for (const batch of chunk(items, BATCH_SIZE)) {
    const payload = engine === 'gemini'
      ? await generateBatchWithGemini({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '' })
      : await generateBatchWithOpenAI({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '' });

    const validatedBatch = validatePromptBatch(batch, payload);
    validatedBatch.forEach((prompt, rowNumber) => {
      promptMap.set(rowNumber, prompt);
    });
  }

  return promptMap;
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const engine = body?.engine === 'gemini' ? 'gemini' : 'openai';
    const model = String(body?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1'));
    const projectConfig = body?.projectConfig || {};
    const characterDescription = resolveCharacterProfile(body?.characterProfile);
    const videoContext = String(body?.videoContext || '').trim();
    
    // Batch Mode Branch
    if (Array.isArray(body?.batchItems) && body.batchItems.length > 0) {
      const apiKey = String(
        body?.apiKeyOverwrite || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || ''
      ).trim();

      if (!apiKey) {
        return NextResponse.json({ error: `API Key para ${engine} nao configurada.` }, { status: 401 });
      }

      const promptItems = body.batchItems as PromptBatchItem[];
      const promptMap = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        videoContext,
      });

      const prompts = promptItems.map((item) => ({
        rowNumber: item.row_number,
        prompt: item.asset === 'video'
          ? enforceVideoPromptGuards(promptMap.get(item.row_number) || '', characterDescription)
          : promptMap.get(item.row_number) || '',
      }));

      return NextResponse.json({ prompts });
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

      const promptMap = await generatePromptMap({
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
