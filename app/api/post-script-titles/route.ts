import { NextRequest, NextResponse } from 'next/server';
import { resolveModel, isReasoningModel } from '@/lib/ai-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export type TitleCriterionResult = true | 'parcial' | false;

export interface TitleValidationResult {
  title: string;
  score: number;
  verdict: 'Aprovado' | 'Ajustes' | 'Fraco';
  breakdown: {
    tensao: TitleCriterionResult;
    relevancia: TitleCriterionResult;
    curiosidade: TitleCriterionResult;
    valor: TitleCriterionResult;
    saturacao: TitleCriterionResult;
    singularidade: TitleCriterionResult;
  };
}

interface TitleValidationResponse {
  results: TitleValidationResult[];
}

interface RouteBody {
  engine: 'openai' | 'gemini';
  model: string;
  apiKeyOverwrite?: string;
  approvedTheme: string;
  titles: string[];
}

const SYSTEM_INSTRUCTIONS = `
You are a strict editorial validator for YouTube video titles in Brazilian Portuguese.

For each title provided, evaluate it against 6 structural criteria. Return only valid JSON with this exact shape:
{
  "results": [
    {
      "title": "...",
      "score": 5.5,
      "verdict": "Aprovado",
      "breakdown": {
        "tensao": true,
        "relevancia": true,
        "curiosidade": true,
        "valor": true,
        "saturacao": "parcial",
        "singularidade": true
      }
    }
  ]
}

Evaluation criteria:
- "tensao": Is there an implicit conflict, paradox or imbalance that creates immediate curiosity? (true / "parcial" / false)
- "relevancia": Does the audience feel directly affected by the topic (emotionally, socially or existentially)? (true / "parcial" / false)
- "curiosidade": Is there a non-obvious promise or knowledge gap that invites the click? (true / "parcial" / false)
- "valor": Does the title indicate there will be learning, a solution or a useful revelation? (true / "parcial" / false)
- "saturacao": Is the topic NOT excessively explored or generic? (true = not saturated, "parcial" = moderately saturated, false = very saturated)
- "singularidade": Is the angle unique, bold or does it offer a new perspective on the topic? (true / "parcial" / false)

Scoring:
- true = 1 point
- "parcial" = 0.5 points
- false = 0 points
- Maximum score: 6

Verdict thresholds:
- score >= 4.5 → "Aprovado"
- score >= 3.0 → "Ajustes"
- score < 3.0  → "Fraco"

Rules:
- Return ONLY valid JSON. No markdown fences. No explanations.
- Evaluate every title provided. The results array must have the same length as the input titles array.
- Be honest and critical — do not inflate scores because you generated the titles.
`.trim();

const buildUserPrompt = (approvedTheme: string, titles: string[]): string => {
  return [
    `Evaluate the following ${titles.length} YouTube title(s) for a video about: "${approvedTheme}"`,
    '',
    'Titles to evaluate:',
    ...titles.map((title, index) => `${index + 1}. ${title}`),
    '',
    'Apply the 6-criterion structural checklist to each title and return the complete results JSON.',
  ].join('\n');
};

const parseJsonResponse = (rawContent: string): TitleValidationResponse => {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fencedMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      throw new Error('A IA nao retornou JSON valido para a validacao dos titulos.');
    }
    return JSON.parse(fencedMatch[0]);
  }
};

const requestWithOpenAI = async ({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<TitleValidationResponse> => {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: isReasoningModel(model) ? 'developer' : 'system', content: SYSTEM_INSTRUCTIONS },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  };

  if (!isReasoningModel(model)) {
    requestBody.temperature = 0.3;
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
    throw new Error(data?.error?.message || 'Falha ao validar titulos com OpenAI.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu sem conteudo para a validacao dos titulos.');
  return parseJsonResponse(content);
};

const requestWithGemini = async ({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}): Promise<TitleValidationResponse> => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [SYSTEM_INSTRUCTIONS, prompt].join('\n\n'),
          }],
        }],
        generationConfig: {
          temperature: 0.3,
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao validar titulos com Gemini.');
  }

  const content =
    data?.candidates?.[0]?.content?.parts
      ?.map((part: { text?: string }) => part.text || '')
      .join('\n') || '';
  if (!content) throw new Error('O Gemini respondeu sem conteudo para a validacao dos titulos.');
  return parseJsonResponse(content);
};

const sanitizeVerdict = (raw: unknown): TitleValidationResult['verdict'] => {
  if (raw === 'Aprovado' || raw === 'Ajustes' || raw === 'Fraco') return raw;
  return 'Ajustes';
};

const sanitizeCriterion = (raw: unknown): TitleCriterionResult => {
  if (raw === true || raw === 'parcial' || raw === false) return raw;
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  return 'parcial';
};

const sanitizeResult = (raw: any, fallbackTitle: string): TitleValidationResult => {
  const breakdown = {
    tensao: sanitizeCriterion(raw?.breakdown?.tensao),
    relevancia: sanitizeCriterion(raw?.breakdown?.relevancia),
    curiosidade: sanitizeCriterion(raw?.breakdown?.curiosidade),
    valor: sanitizeCriterion(raw?.breakdown?.valor),
    saturacao: sanitizeCriterion(raw?.breakdown?.saturacao),
    singularidade: sanitizeCriterion(raw?.breakdown?.singularidade),
  };

  const computedScore = Object.values(breakdown).reduce<number>((acc, v) => {
    if (v === true) return acc + 1;
    if (v === 'parcial') return acc + 0.5;
    return acc;
  }, 0);

  const score = typeof raw?.score === 'number' ? raw.score : computedScore;

  const computedVerdict: TitleValidationResult['verdict'] =
    score >= 4.5 ? 'Aprovado' : score >= 3.0 ? 'Ajustes' : 'Fraco';

  return {
    title: typeof raw?.title === 'string' ? raw.title : fallbackTitle,
    score: Math.round(score * 10) / 10,
    verdict: sanitizeVerdict(raw?.verdict) ?? computedVerdict,
    breakdown,
  };
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RouteBody;
    const { engine, model, apiKeyOverwrite, approvedTheme, titles } = body;

    if (!approvedTheme?.trim()) {
      return NextResponse.json({ error: 'O tema aprovado e obrigatorio.' }, { status: 400 });
    }

    if (!Array.isArray(titles) || titles.length === 0) {
      return NextResponse.json({ error: 'A lista de titulos e obrigatoria.' }, { status: 400 });
    }

    let apiKey = '';
    if (engine === 'openai') {
      apiKey = apiKeyOverwrite || process.env.OPENAI_API_KEY || '';
    } else if (engine === 'gemini') {
      apiKey = apiKeyOverwrite || process.env.GEMINI_API_KEY || '';
    }

    if (!apiKey || apiKey === 'sua_chave_aqui') {
      return NextResponse.json(
        { error: `API Key para ${engine} nao configurada. Defina em Ajustes Globais ou .env.local.` },
        { status: 401 }
      );
    }

    const apiModel = resolveModel(model);
    const prompt = buildUserPrompt(approvedTheme, titles);

    const raw =
      engine === 'gemini'
        ? await requestWithGemini({ apiKey, model: apiModel, prompt })
        : await requestWithOpenAI({ apiKey, model: apiModel, prompt });

    if (!Array.isArray(raw?.results)) {
      return NextResponse.json(
        { error: 'A IA nao retornou um array de resultados valido.' },
        { status: 502 }
      );
    }

    const results = titles.map((title, index) =>
      sanitizeResult(raw.results[index] ?? {}, title)
    );

    return NextResponse.json({ results });
  } catch (error: any) {
    console.error('[post-script-titles]', error);
    return NextResponse.json(
      { error: error?.message || 'Falha ao validar os titulos virais.' },
      { status: 500 }
    );
  }
}
