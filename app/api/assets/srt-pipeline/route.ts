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

const BATCH_SIZE = 12;
const SUPPORTED_PROMPT_ASSETS = new Set(['vídeo', 'imagem']);

export const maxDuration = 60;

const SYSTEM_INSTRUCTIONS = `
You generate production-ready visual prompts for subtitle-driven videos.

Return only valid JSON.
Write every prompt in English.
Do not include markdown, subtitles, on-screen text, logos, watermarks, or UI overlays.
Keep prompts concise, vivid, and generator-friendly.
Use one sentence per prompt, usually between 18 and 40 words.

Rules for asset types:
- asset == "video":
  - Choose a realistic live-action video prompt by default.
  - The prompt must specify ambient sound only.
  - Never include dialogue, voice-over, narration, talking, lip-sync, interview audio, subtitles, captions, logos, watermarks, or on-screen text.
  - Include the provided recurring character description briefly in every live-action video prompt, so the person remains visually consistent across the sequence.
  - Use 3D technical animation only when the line explains an abstract concept, internal mechanism, hidden process, engineering detail, physics, chemistry, or something invisible that benefits from a technical visualization.
  - If using 3D, the prompt must begin with "3D technical animation of".
  - If not using 3D, the prompt must begin with "Realistic cinematic video of".
  - If using 3D, still include "ambient sound only, no dialogue, no voice-over" at the end of the prompt.
- asset == "image":
  - Always create a realistic still image prompt.
  - Emphasize the opening idea of the sentence more than the ending.
  - Illustrate the line in a slightly indirect, non-obvious way while staying relevant.
  - The prompt must begin with "Photorealistic still image of".

Context rules:
- Use the current subtitle text as the main source of meaning.
- Use previous and next subtitle lines only to disambiguate.
- Avoid repeating the line literally.
- Prefer concrete subjects, environments, actions, materials, and mood.
`.trim();

interface PromptBatchItem {
  row_number: number;
  asset: 'video' | 'image';
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
      asset: normalizeAssetType(row.asset) === 'vídeo' ? 'video' as const : 'image' as const,
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

const enforceVideoPromptGuards = (prompt: string, characterDescription: string) => {
  const normalized = sanitizePrompt(prompt);
  const hasCharacterCue = /same recurring|senior software architect|character|professional/i.test(normalized);
  const hasAmbientCue = /ambient sound only|no dialogue|no voice-over|no voiceover/i.test(normalized);
  const characterClause = hasCharacterCue ? '' : ` Featuring ${characterDescription}.`;
  const audioClause = hasAmbientCue ? '' : ' Ambient sound only, no dialogue, no voice-over.';
  return sanitizePrompt(`${normalized}${characterClause}${audioClause}`);
};

const generateBatchWithOpenAI = async ({
  apiKey,
  model,
  batchItems,
  characterDescription,
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
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
          `Recurring character for live-action video prompts: ${characterDescription}`,
          'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
          JSON.stringify({ character_profile: characterDescription, items: batchItems }, null, 2),
        ].join('\n\n'),
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
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
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
              `Recurring character for live-action video prompts: ${characterDescription}`,
              'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
              JSON.stringify({ character_profile: characterDescription, items: batchItems }, null, 2),
            ].join('\n\n'),
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
}: {
  engine: 'openai' | 'gemini';
  model: string;
  apiKey: string;
  projectConfig?: Record<string, string>;
  items: PromptBatchItem[];
  characterDescription: string;
}) => {
  const resolvedModel = engine === 'gemini'
    ? projectConfig?.gemini_api_model || resolveModel(model)
    : projectConfig?.openai_api_model || resolveModel(model);

  const promptMap = new Map<number, string>();

  for (const batch of chunk(items, BATCH_SIZE)) {
    const payload = engine === 'gemini'
      ? await generateBatchWithGemini({ apiKey, model: resolvedModel, batchItems: batch, characterDescription })
      : await generateBatchWithOpenAI({ apiKey, model: resolvedModel, batchItems: batch, characterDescription });

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

