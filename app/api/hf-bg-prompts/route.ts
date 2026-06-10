import { NextRequest, NextResponse } from 'next/server';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';

export const maxDuration = 300;

// ─── Reuses the same battle-tested functions from srt-pipeline ─────────────────
// We send HF rows as 'image' batchItems with a special videoContext that instructs
// the AI to generate cinematic backgrounds instead of generic b-roll.

const SYSTEM_INSTRUCTIONS = `
You generate production-ready visual prompts for AI image and video generators (Midjourney, Kling, RunwayML).
Return only valid JSON.
Write every prompt in English.
Do not include markdown, subtitles, on-screen text, logos, watermarks, or UI overlays.
Keep prompts concise, vivid, and generator-friendly.
`.trim();

interface HfBgRow {
  rowNumber: number;
  startTime: string;
  texto: string;
  visualState: string;
}

interface RouteBody {
  engine: 'openai' | 'gemini';
  model: string;
  apiKeyOverwrite?: string;
  theme: string;
  hfRows: HfBgRow[];
}

const parseJsonResponse = (raw: string): { prompts: Array<{ row_number?: number; rowNumber?: number; prompt: string }> } => {
  try { return JSON.parse(raw); }
  catch {
    const m = raw.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('IA não retornou JSON válido.');
    return JSON.parse(m[0]);
  }
};

const generateWithOpenAI = async (apiKey: string, model: string, userPrompt: string): Promise<string> => {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: isReasoningModel(model) ? 'developer' : 'system', content: SYSTEM_INSTRUCTIONS },
      { role: 'user', content: userPrompt },
    ],
    response_format: { type: 'json_object' },
  };
  if (!isReasoningModel(model)) {
    requestBody.temperature = 0.7;
  }
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(requestBody),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Falha OpenAI.');
  return data?.choices?.[0]?.message?.content || '';
};

const generateWithGemini = async (apiKey: string, model: string, userPrompt: string): Promise<string> => {
  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: [SYSTEM_INSTRUCTIONS, userPrompt].join('\n\n') }] }],
        generationConfig: { temperature: 0.7, response_mime_type: 'application/json' },
      }),
    }
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message || 'Falha Gemini.');
  return data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RouteBody;
    const { engine, model: rawModel, apiKeyOverwrite, theme, hfRows } = body;

    if (!hfRows?.length) {
      return NextResponse.json({ error: 'Nenhum HyperFrame fornecido.' }, { status: 400 });
    }

    const apiKey = (apiKeyOverwrite || (engine === 'openai' ? process.env.OPENAI_API_KEY : process.env.GEMINI_API_KEY) || '').trim();
    if (!apiKey) return NextResponse.json({ error: `API Key para ${engine} não configurada.` }, { status: 401 });

    const model = resolveModel(rawModel);

    const rowLines = hfRows.map((r) =>
      `{"row_number": ${r.rowNumber}, "asset": "image", "template": "${r.visualState}", "excerpt": "${r.texto.replace(/"/g, "'")}"}`
    ).join(',\n');

    const userPrompt = [
      `Video theme: "${theme}"`,
      '',
      'For each HyperFrame below, generate a cinematic English BACKGROUND scene description.',
      'The background will appear BEHIND an avatar presenter in the video — so:',
      '- Do NOT describe people, faces, or the avatar.',
      '- Describe ONLY: setting, environment, objects, lighting, texture, atmosphere.',
      '- The scene must visually interpret the THEME and EMOTION of the excerpt.',
      '- Start every prompt with "Photorealistic still image of".',
      '- 1-2 sentences, max 180 characters each.',
      '',
      `Items: [${rowLines}]`,
      '',
      'Return ONLY valid JSON: {"prompts":[{"row_number": <number>, "prompt": "<scene>"}]}',
    ].join('\n');

    const rawContent = engine === 'openai'
      ? await generateWithOpenAI(apiKey, model, userPrompt)
      : await generateWithGemini(apiKey, model, userPrompt);

    if (!rawContent) throw new Error('IA respondeu sem conteúdo.');
    const parsed = parseJsonResponse(rawContent);

    // Normalize row_number → rowNumber
    const prompts = (parsed.prompts || []).map(p => ({
      rowNumber: Number(p.row_number ?? p.rowNumber),
      prompt: String(p.prompt || '').trim(),
    })).filter(p => p.rowNumber > 0 && p.prompt);

    if (!prompts.length) throw new Error('IA não retornou prompts válidos para os HyperFrames.');

    return NextResponse.json({ prompts });
  } catch (err: any) {
    console.error('[hf-bg-prompts]', err);
    return NextResponse.json({ error: err?.message || 'Falha ao gerar prompts de fundo HF.' }, { status: 500 });
  }
}
