import { NextRequest, NextResponse } from 'next/server';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 300;

const SYSTEM_INSTRUCTIONS = `
You are an expert script analyzer and visual designer.
Analyze the provided script and extract the visual setting and the top 3 most relevant characters, strictly adhering to the channel's visual identity and art medium (e.g. 2D cartoon illustration, comic book flat shading with bold outlines, anime, oil painting, or 3D CGI).

Return strictly a valid JSON object matching this exact shape:
{
  "setting": "Detailed description of the era/setting, lighting, art style/medium, color palette, and general visual atmosphere in Portuguese. Keep it under 50 words.",
  "characters": [
    {
      "name": "Descriptive Role or Name (e.g. Mecânico de oficina de bairro)",
      "tag": "Concise 1-2 word bracket tag without brackets (e.g. Velan)",
      "description": "A highly detailed, professional, and consistent physical appearance and art medium in English. If the channel uses 2D cartoon / comic book illustration, explicitly include that art medium (e.g. '2D comic book illustration flat shading with hard shadows, elderly mechanic cartoon character...'). Keep between 25 and 50 words.",
      "selected": true
    }
  ]
}

Instructions:
- The "setting" field must be written in Portuguese. Describe the visual identity and aesthetic style.
- The "characters" array must contain between 1 and 3 main characters.
- If the project has a designated protagonist DNA (CHARACTER_DNA), preserve its core physical traits and art medium (such as 2D cartoon vector illustration).
- For each character, the "description" must be written in English.
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
    const characterDescription = String(body?.characterDescription || '').trim();
    const visualIdentity = String(body?.visualIdentity || projectConfig?.editing_sop?.visual_identity || '').trim();

    if (characterDescription) {
      dynamicSystemInstructions += `\n\nCHANNEL VISUAL IDENTITY & CHARACTER DNA:\n${characterDescription}\nCRITICAL: Ensure all character descriptions and art styles strictly match this art medium (e.g. 2D cartoon illustration, comic book flat shading, anime, or 3D CGI) and maintain full stylistic consistency with the channel.`;
    } else if (visualIdentity) {
      dynamicSystemInstructions += `\n\nCHANNEL VISUAL IDENTITY:\n${visualIdentity}\nCRITICAL: Ensure all character descriptions match this art medium and aesthetic.`;
    }

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
