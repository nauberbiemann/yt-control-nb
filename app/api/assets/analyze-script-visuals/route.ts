import { NextRequest, NextResponse } from 'next/server';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_INSTRUCTIONS = `
You are an expert script analyzer and visual designer.
Analyze the provided script and extract the visual setting and the top 3 most relevant characters.

Return strictly a valid JSON object matching this exact shape:
{
  "setting": "Detailed description of the era/setting, lighting, art style/medium, color palette, and general visual atmosphere in Portuguese. Keep it under 50 words.",
  "characters": [
    {
      "name": "Exact Character Name",
      "description": "A highly detailed, professional, and consistent physical appearance in English. Describe their facial features, eyes, hair color/style, clothing details suited for the setting, and key accessories. Make it optimized as a reference for image generators like Midjourney. Keep it between 25 and 45 words."
    }
  ]
}

Instructions:
- The "setting" field must be written in Portuguese. Describe the visual identity and aesthetic style (e.g., 'Estilo pintura a óleo, gótico gélido de ficção científica, iluminação volumétrica azul e cobre, cinzas caindo...').
- The "characters" array must contain between 1 and 3 main characters.
- For each character, the "description" must be written in English. This ensures it is ready for Midjourney/Stable Diffusion prompts which understand English best.
- Never include markdown ticks (\`\`\`json) or explanations in the response. Return ONLY the JSON object.
`.trim();

async function callOpenAI(apiKey: string, model: string, scriptText: string, systemInstructions: string) {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: isReasoningModel(model) ? 'developer' : 'system', content: systemInstructions },
      { role: 'user', content: `Script: \n\n${scriptText}` }
    ],
    response_format: { type: 'json_object' }
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
    throw new Error(data?.error?.message || 'Falha ao analisar com OpenAI.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu sem conteúdo.');
  return parseJsonResponse(content);
}

async function callGemini(apiKey: string, model: string, scriptText: string, systemInstructions: string) {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: `${systemInstructions}\n\nScript: \n\n${scriptText}`
          }]
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
    throw new Error(data?.error?.message || 'Falha ao analisar com Gemini.');
  }

  const content = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '';
  if (!content) throw new Error('O Gemini respondeu sem conteúdo.');
  return parseJsonResponse(content);
}

function parseJsonResponse(rawContent: string): any {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fencedMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      throw new Error('A IA não retornou um JSON válido.');
    }
    return JSON.parse(fencedMatch[0]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const scriptText = String(body?.scriptText || '').trim();
    if (!scriptText) {
      return NextResponse.json({ error: 'O texto do roteiro é obrigatório.' }, { status: 400 });
    }

    const engine = body?.engine === 'gemini' ? 'gemini' : 'openai';
    const model = String(body?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1'));
    const projectConfig = body?.projectConfig || {};
    const videoFormat = String(body?.videoFormat || '').trim();

    const resolvedModel = engine === 'gemini'
      ? projectConfig?.gemini_api_model || resolveModel(model)
      : projectConfig?.openai_api_model || resolveModel(model);

    const apiKey = String(
      body?.apiKeyOverwrite || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || ''
    ).trim();

    if (!apiKey) {
      return NextResponse.json({ error: `API Key para ${engine} não configurada.` }, { status: 401 });
    }

    // Limit character count of script to avoid token overflow
    const sanitizedScript = scriptText.substring(0, 15000);

    let dynamicSystemInstructions = SYSTEM_INSTRUCTIONS;
    if (videoFormat === 'faceless') {
      dynamicSystemInstructions += '\n\nCRITICAL FACELESS RULE: Since the video format is FACELESS, the narrator/presenter is not shown on screen. Therefore, you MUST NOT include the narrator/presenter (e.g. "Narrador", "Apresentador", "Narrador Analista dos Registros", etc.) in the characters list under any circumstance. Focus only on narrative, story, or setting characters that are described or act in the script (e.g. space-marines, inquisitors, tech-priests, soldiers).';
    }

    const result = engine === 'gemini'
      ? await callGemini(apiKey, resolvedModel, sanitizedScript, dynamicSystemInstructions)
      : await callOpenAI(apiKey, resolvedModel, sanitizedScript, dynamicSystemInstructions);

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Analyze Script Visuals] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao processar o roteiro enviado.' },
      { status: 500 }
    );
  }
}
