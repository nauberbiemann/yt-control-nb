import { NextRequest, NextResponse } from 'next/server';

// ─── System prompt ─────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `
You are a visual prompt engineer for AI image and video generators (Midjourney, Kling, RunwayML, Sora).

Your task: Given a Portuguese video excerpt and the visual template type being used at that moment,
write a cinematic English scene description to use as a background image/video behind an avatar presenter.

Rules:
- Output in English only.
- Do NOT describe people, faces, bodies, or the avatar itself.
- Describe only: setting, environment, objects, lighting, texture, color palette, atmosphere.
- The scene must visually reflect the THEME and EMOTION of the excerpt, not just repeat its words.
- Each prompt must be 1-2 sentences. Maximum 200 characters.
- Style: photorealistic, cinematic, high production value.
- Use rich visual language: "shallow depth of field", "soft window light", "high contrast shadows", etc.
- The prompt must be generator-ready — paste directly into Midjourney or Kling.
`.trim();

// ─── Types ─────────────────────────────────────────────────────────────────────

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

// ─── Response parser ───────────────────────────────────────────────────────────

const parseJsonResponse = (raw: string): { prompts: Array<{ rowNumber: number; prompt: string }> } => {
  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('IA não retornou JSON válido para os prompts de fundo HF.');
    return JSON.parse(match[0]);
  }
};

// ─── Route handler ─────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RouteBody;
    const { engine, model, apiKeyOverwrite, theme, hfRows } = body;

    if (!hfRows?.length) {
      return NextResponse.json({ error: 'Nenhum HyperFrame fornecido.' }, { status: 400 });
    }

    let apiKey = '';
    if (engine === 'openai') {
      apiKey = apiKeyOverwrite || process.env.OPENAI_API_KEY || '';
    } else {
      apiKey = apiKeyOverwrite || process.env.GEMINI_API_KEY || '';
    }

    if (!apiKey || apiKey === 'sua_chave_aqui') {
      return NextResponse.json({ error: `API Key para ${engine} não configurada.` }, { status: 401 });
    }

    // Build focused user prompt
    const rowLines = hfRows.map((r) =>
      `[HF${r.rowNumber}] ${r.startTime} | template: ${r.visualState}\nExcerpt: "${r.texto}"`
    ).join('\n\n');

    const userPrompt = [
      `Video theme: "${theme}"`,
      '',
      'For each HyperFrame below, generate a cinematic English background scene description.',
      'The scene must visually interpret the theme and emotion of the excerpt — not just describe its words.',
      '',
      rowLines,
      '',
      'Return ONLY valid JSON in this exact shape:',
      '{',
      '  "prompts": [',
      '    { "rowNumber": <number>, "prompt": "<English scene description>" },',
      '    ...',
      '  ]',
      '}',
      'Do not include markdown fences. Do not explain.',
    ].join('\n');

    let rawContent = '';

    if (engine === 'openai') {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: userPrompt },
          ],
          response_format: { type: 'json_object' },
          temperature: 0.85,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Falha na chamada OpenAI.');
      rawContent = data?.choices?.[0]?.message?.content || '';
    } else {
      const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: [SYSTEM_PROMPT, userPrompt].join('\n\n') }] }],
            generationConfig: { temperature: 0.85, response_mime_type: 'application/json' },
          }),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error?.message || 'Falha na chamada Gemini.');
      rawContent = data?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text || '').join('') || '';
    }

    if (!rawContent) throw new Error('IA respondeu sem conteúdo.');
    const parsed = parseJsonResponse(rawContent);

    if (!parsed?.prompts?.length) {
      throw new Error('IA não retornou prompts válidos para os HyperFrames.');
    }

    return NextResponse.json({ prompts: parsed.prompts });
  } catch (err: any) {
    console.error('[hf-bg-prompts]', err);
    return NextResponse.json({ error: err?.message || 'Falha ao gerar prompts de fundo HF.' }, { status: 500 });
  }
}
