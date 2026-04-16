import { NextRequest, NextResponse } from 'next/server';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';
import {
  buildPostScriptTimelineContext,
  buildSeoChapterPlan,
  buildScriptTranscript,
  buildSfxAnchorPlan,
  sanitizePostScriptPackage,
  type PostScriptChapterAnchor,
  type PostScriptPackage,
  type PostScriptScriptBlock,
} from '@/lib/post-script-package';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SYSTEM_INSTRUCTIONS = `
You generate a post-script production package for a Brazilian Portuguese YouTube video.

Return only valid JSON with this exact shape:
{
  "titles": ["...", "...", "...", "...", "..."],
  "seoDescription": "...",
  "sunoPrompt": "...",
  "sunoSuggestedTitle": "...",
  "sfxTimelineTxt": "..."
}

Rules:
- "titles" must contain exactly 5 distinct viral title options in PT-BR.
- Titles must feel clickable, human, and niche-aware for experienced tech professionals.
- "seoDescription" must be in PT-BR and should focus on writing only the human opening paragraph of the YouTube description.
- Use correct Brazilian Portuguese spelling and accentuation in every PT-BR field.
- The SEO description must follow this formatting:
  1. One short opening paragraph with 2 to 4 sentences introducing the promise of the video.
  2. Do not write timestamp lines yourself.
  3. Do not write the AVISO DE IA yourself.
- The app will normalize timestamps and the AI notice after your response.
- Keep the opening paragraph natural, human and useful, not robotic.
- Avoid quotation marks around technical metaphors unless absolutely necessary.
- "sunoPrompt" must be written in English and should describe a Suno-ready music direction in one compact sentence.
- The Suno prompt should be simple, direct, and usable as-is, similar to: "Dark cinematic industrial synthwave with deep rhythmic bass pulses..."
- Prefer comma-separated descriptors over long technical explanations.
- Avoid BPM, key, stems, section-by-section arrangements, or production notes unless absolutely necessary.
- "sunoSuggestedTitle" should be short and in English.
- "sfxTimelineTxt" must be in PT-BR and formatted as a clean plain-text timeline, not JSON.
- In "sfxTimelineTxt", keep labels EFEITO/FUNCAO/TRECHO/OBS in PT-BR, but the value after EFEITO must be an English searchable sound effect name for CapCut PC.
- Prefer simple English SFX names such as "Digital Glitch", "Low Rumble", "Cinematic Whoosh", "Keyboard Clicks", "Sub Bass Hit", "Notification Ping", "Metallic Impact", "Tension Riser", "Ambient Room Tone".
- The SFX timeline must respect a minimum interval of 25 seconds between events.
- Use the suggested SFX anchors as the primary map, but you may skip weak points if they would feel artificial.
- In SFX timeline, use this format repeatedly:
  [MM:SS]
  EFEITO: ...
  FUNCAO: ...
  TRECHO: ...
  OBS: ...
- Do not include markdown fences.
- Do not explain the process.
`.trim();

interface RouteBody {
  engine: 'openai' | 'gemini';
  model: string;
  apiKeyOverwrite?: string;
  projectConfig?: Record<string, unknown>;
  approvedTheme?: string;
  approvedBriefing?: {
    title?: string;
    estimatedDuration?: string;
    dominantVoice?: string;
  } | null;
  scriptBlocks?: PostScriptScriptBlock[];
  srtRows?: Array<{ startTime?: string; endTime?: string }> | null;
  projectContext?: {
    projectName?: string;
    puc?: string;
    persona?: string;
    soundtrack?: string;
  } | null;
}

const parseJsonResponse = (rawContent: string): Partial<PostScriptPackage> => {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fencedMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      throw new Error('A IA nao retornou JSON valido para o pacote pos-roteiro.');
    }
    return JSON.parse(fencedMatch[0]);
  }
};

const buildUserPrompt = ({
  approvedTheme,
  approvedBriefing,
  scriptBlocks,
  chapterAnchors,
  timelineSource,
  projectContext,
  sfxPlan,
}: {
  approvedTheme: string;
  approvedBriefing: RouteBody['approvedBriefing'];
  scriptBlocks: PostScriptScriptBlock[];
  chapterAnchors: PostScriptChapterAnchor[];
  timelineSource: 'srt' | 'estimated';
  projectContext?: RouteBody['projectContext'];
  sfxPlan: ReturnType<typeof buildSfxAnchorPlan>;
}) => {
  const transcript = buildScriptTranscript(scriptBlocks);

  return [
    'Build the complete post-script package for this approved video.',
    '',
    `TEMA: ${approvedTheme}`,
    `TITULO APROVADO: ${approvedBriefing?.title || approvedTheme}`,
    `VOZ DOMINANTE: ${approvedBriefing?.dominantVoice || 'Nao definida'}`,
    `FONTE DOS TIMESTAMPS: ${timelineSource === 'srt' ? 'timestamps derivados do SRT anexado' : 'timestamps estimados pelo roteiro aprovado'}`,
    '',
    'CONTEXTO DO PROJETO:',
    JSON.stringify(projectContext || {}, null, 2),
    '',
    `CAPITULOS EDITORIAIS DISPONIVEIS PARA A DESCRICAO SEO (use somente estes, em ordem crescente, com no maximo ${chapterAnchors.length} linhas):`,
    JSON.stringify(chapterAnchors, null, 2),
    '',
    'PLANO DE SFX (obrigatorio seguir a logica abaixo):',
    JSON.stringify({
      targetCount: sfxPlan.targetCount,
      minSpacingSeconds: sfxPlan.minSpacingSeconds,
      anchors: sfxPlan.anchors.map((anchor) => ({
        timestamp: anchor.timestamp,
        layer: anchor.layer,
        rationale: anchor.rationale,
        excerpt: anchor.excerpt,
      })),
    }, null, 2),
    '',
    'ROTEIRO FINAL:',
    transcript,
    '',
    'Important output expectations:',
    '- Titles must target curiosity, tension, and relevance for senior developers.',
    '- SEO description should be only the opening paragraph, written in a human editorial voice.',
    '- Do not output timestamps or the AI notice; the app will add them after generation.',
    '- Make the opening paragraph sound like a real YouTube description, not like a system summary.',
    '- Suno prompt should match the emotional journey of the script, but stay concise and direct.',
    '- Write the Suno prompt as a single practical line, not as a long production brief.',
    '- SFX timeline should feel editorially useful for a human video editor.',
    '- In every EFEITO line, write only an English SFX name that is easy to search in CapCut PC.',
    '- Use the three decision layers: structural anchors, semantic anchors and rhythmic anchors.',
    '- Do not create SFX events closer than 25 seconds from each other.',
    '- Avoid sounding automated: prefer fewer, better-placed events over mechanically filling every anchor.',
  ].join('\n');
};

const requestWithOpenAI = async ({
  apiKey,
  model,
  prompt,
}: {
  apiKey: string;
  model: string;
  prompt: string;
}) => {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTIONS },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  };

  if (!isReasoningModel(model)) {
    requestBody.temperature = 0.8;
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
    throw new Error(data?.error?.message || 'Falha ao gerar pacote pos-roteiro com OpenAI.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu sem conteudo para o pacote pos-roteiro.');
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
}) => {
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
          temperature: 0.8,
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao gerar pacote pos-roteiro com Gemini.');
  }

  const content = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '';
  if (!content) throw new Error('O Gemini respondeu sem conteudo para o pacote pos-roteiro.');
  return parseJsonResponse(content);
};

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as RouteBody;
    const {
      engine,
      model,
      apiKeyOverwrite,
      projectConfig,
      approvedTheme,
      approvedBriefing,
      scriptBlocks = [],
      srtRows,
      projectContext,
    } = body;

    if (!approvedTheme?.trim()) {
      return NextResponse.json({ error: 'O tema aprovado e obrigatorio.' }, { status: 400 });
    }

    if (!Array.isArray(scriptBlocks) || scriptBlocks.length === 0) {
      return NextResponse.json({ error: 'Os blocos finais do roteiro sao obrigatorios.' }, { status: 400 });
    }

    let apiKey = '';
    if (engine === 'openai') {
      apiKey = apiKeyOverwrite || process.env.OPENAI_API_KEY || '';
    } else if (engine === 'gemini') {
      apiKey = apiKeyOverwrite || process.env.GEMINI_API_KEY || '';
    }

    if (!apiKey || apiKey === 'sua_chave_aqui') {
      return NextResponse.json({
        error: `API Key para ${engine} nao configurada. Defina em Ajustes Globais ou .env.local.`,
      }, { status: 401 });
    }

    const apiModel = engine === 'gemini'
      ? String(projectConfig?.gemini_api_model || resolveModel(model))
      : String(projectConfig?.openai_api_model || resolveModel(model));

    const timelineContext = buildPostScriptTimelineContext({
      scriptBlocks,
      estimatedDuration: approvedBriefing?.estimatedDuration,
      srtRows,
    });

    const seoChapterPlan = buildSeoChapterPlan({
      scriptBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
    });
    const sfxPlan = buildSfxAnchorPlan({
      scriptBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
      minSpacingSeconds: 25,
    });

    const prompt = buildUserPrompt({
      approvedTheme,
      approvedBriefing,
      scriptBlocks,
      chapterAnchors: seoChapterPlan.anchors,
      timelineSource: timelineContext.source,
      projectContext,
      sfxPlan,
    });

    const rawPackage = engine === 'gemini'
      ? await requestWithGemini({ apiKey, model: apiModel, prompt })
      : await requestWithOpenAI({ apiKey, model: apiModel, prompt });

    const payload = sanitizePostScriptPackage(rawPackage, seoChapterPlan.anchors, timelineContext.source);
    if (payload.titles.length < 5) {
      return NextResponse.json({ error: 'A IA retornou menos de 5 titulos virais.' }, { status: 502 });
    }

    if (!payload.seoDescription || !payload.sunoPrompt || !payload.sfxTimelineTxt) {
      return NextResponse.json({ error: 'A IA retornou um pacote pos-roteiro incompleto.' }, { status: 502 });
    }

    return NextResponse.json(payload);
  } catch (error: any) {
    console.error('[post-script-package]', error);
    return NextResponse.json({ error: error?.message || 'Falha ao gerar o pacote pos-roteiro.' }, { status: 500 });
  }
}
