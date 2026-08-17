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
export const maxDuration = 300;

const getLanguageDirectives = (lang?: string) => {
  const l = (lang || 'Português').trim();
  if (l === 'English') {
    return { 
      name: 'English', 
      code: 'English', 
      units: 'US Imperial system (e.g. Fahrenheit °F, miles, feet, inches, pounds, ounces, gallons)' 
    };
  }
  if (l === 'Español' || l === 'Spanish') {
    return { 
      name: 'Spanish', 
      code: 'Spanish', 
      units: 'Metric system (e.g. Celsius °C, kilometers, meters, grams, kilograms, liters)' 
    };
  }
  if (l === 'Português' || l === 'Portuguese') {
    return { 
      name: 'Brazilian Portuguese', 
      code: 'PT-BR', 
      units: 'Metric system (e.g. Celsius °C, quilômetros, metros, gramas, quilogramas, litros)' 
    };
  }
  return { 
    name: l, 
    code: l, 
    units: 'Metric system (e.g. Celsius °C, kilometers, meters, grams, kilograms, liters)' 
  };
};

const SYSTEM_INSTRUCTIONS = `
You generate a complete Phase B post-script production and packaging package for a YouTube video.

Return only valid JSON with this exact shape:
{
  "titles": ["...", "...", "...", "...", "...", "...", "...", "...", "...", "..."],
  "thumbnail_copies": [
    "NÃO FAÇA ISSO",
    "O ERRO GRAVE",
    "EVITE AGORA"
  ],
  "thumbnail_jsons": [
    {
      "canvas": { "width": 1280, "height": 720, "aspect_ratio": "16:9" },
      "background": { "style": "photorealistic", "prompt": "Cinematic photo of workshop or dramatic context environment, shallow depth of field, dramatic rim lighting, 8k resolution" },
      "character": { "style": "2D comic illustration", "action": "Pointing directly at the critical flaw with wide shocked eyes", "expression": "Shocked / Warning", "clothing": "Signature channel character outfit" },
      "text_layers": [
        { "text": "NÃO FAÇA", "font": "Anton", "style": "ALL CAPS", "color": "#FFFFFF", "stroke": "4px #000000", "size": "140px", "position": "top-left" },
        { "text": "ISSO HOJE", "font": "Anton", "style": "ALL CAPS", "color": "#FF0000", "stroke": "4px #000000", "size": "140px", "position": "below-first" }
      ],
      "indicators": [
        { "type": "arrow", "color": "#FFD700", "target": "Critical component or focal point" },
        { "type": "circle", "color": "#FFD700", "target": "Warning area" }
      ],
      "badges": [
        { "text": "CUIDADO!", "bg_color": "#FF0000", "text_color": "#FFFFFF" }
      ],
      "composition": "Character on right side reacting, bold high-contrast Anton text on left, yellow arrow pointing from text to focal element",
      "negative_dna": "speech, talking, mouth open speaking, blurry, low resolution, 3D character, distorted text"
    }
  ],
  "seoDescription": "...",
  "sources_section": [
    "Relatórios técnicos oficiais e manuais do setor",
    "Estudos empíricos e dados de performance publicados"
  ],
  "pinned_comment": "Qual dessas situações você já presenciou na prática? Deixe seu relato nos comentários!",
  "seo_tags": ["termo 1", "termo 2", "termo 3", "termo 4", "termo 5", "termo 6", "termo 7", "termo 8", "termo 9", "termo 10"],
  "sunoPrompt": "...",
  "sunoSuggestedTitle": "...",
  "hfContextTitles": [
    {
      "timestamp": "[02:15]",
      "headline": "Custo Invisível",
      "subtitle": "Como pequenas perdas acumulam sem que você perceba.",
      "metrics": "—",
      "bgPrompt": "Dimly lit office desk with scattered papers and glowing monitor, shallow depth of field, cinematic teal tones."
    }
  ],
  "sfxTimelineTxt": "..."
}

Rules:
- "titles": Generate 10 high-CTR title variations (between 55 and 85 characters).
  * If narrative library title structures or forensic formulas are provided, strictly apply them and distribute the titles across the formulas.
  * Maximum 12 words per title. Emotional, curious, and intense language only.
- "thumbnail_copies": Generate exactly 3 short punchy options (2 to 4 words MAX in Portuguese/channel language, ALL CAPS).
  * Must be an IMPERATIVE command or SHOCK trigger (e.g. 'NÃO FAÇA ISSO', 'O ERRO GRAVE', 'NUNCA COMPRE', 'FAÇA ISTO HOJE').
  * NEVER repeat the full video title. The thumbnail copy provides emotional punch; the title provides context.
- "thumbnail_jsons": Generate exactly 3 complete art direction JSONs (Options A, B, and C) matching the channel's visual identity:
  * Typography: Anton font, ALL CAPS, 3-5px black stroke outline.
  * Colors: Arrows/Circles in bright yellow (#FFD700), Badges/Alerts in red (#FF0000) with white text (#FFFFFF).
  * Character layer: 2D comic illustration / cartoon mascot.
  * Background layer: Photorealistic, cinematic scene.
- "sources_section": List 2 to 4 authoritative sources or verifiable benchmarks relevant to the topic.
- "pinned_comment": An engaging, open-ended question designed to maximize comment velocity in the first 2 hours.
- "seo_tags": 10 to 15 relevant, high-search-intent tags.
- "seoDescription": One short human opening paragraph (2 to 4 sentences) introducing the core transformation. Do not include timestamps or AI notices; the app formats them.
- "sunoPrompt": Layered prompt in English describing soundtrack mood, instruments, dynamic evolution, and thematic atmosphere. Max 800 chars.
- "sunoSuggestedTitle": Short title for the soundtrack.
- "sfxTimelineTxt": Plain-text SFX timeline with minimum 25s spacing. Use format: [MM:SS] \n EFEITO: [English CapCut SFX name] \n FUNCAO: ... \n TRECHO: ... \n OBS: ...
- "hfContextTitles": Contextual hyperframe entries for each supplied hyperframe anchor. Include visual 'bgPrompt' in English describing environment only.
- Do not output markdown code blocks. Output pure JSON.
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
  srtRows?: Array<{ startTime?: string; endTime?: string; texto?: string; asset?: string }> | null;
  projectContext?: {
    projectName?: string;
    puc?: string;
    persona?: string;
    soundtrack?: string;
    channelLanguage?: string;
  } | null;
  titleCountHint?: number;
  titleStructures?: Array<{ id: string; name: string; content_pattern?: string }>;
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
  hfAnchors,
  timelineSource,
  projectContext,
  sfxPlan,
  titleCountHint,
  titleStructures,
}: {
  approvedTheme: string;
  approvedBriefing: RouteBody['approvedBriefing'];
  scriptBlocks: PostScriptScriptBlock[];
  chapterAnchors: PostScriptChapterAnchor[];
  hfAnchors: Array<{ timestamp: string; texto: string }>;
  timelineSource: 'srt' | 'estimated';
  projectContext?: RouteBody['projectContext'];
  sfxPlan: ReturnType<typeof buildSfxAnchorPlan>;
  titleCountHint?: number;
  titleStructures?: RouteBody['titleStructures'];
}) => {
  const transcript = buildScriptTranscript(scriptBlocks);
  const titleStructuresStr = Array.isArray(titleStructures) && titleStructures.length > 0
    ? titleStructures.map(t => `- [${t.name}]: "${t.content_pattern}"`).join('\n')
    : '';

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
    titleStructuresStr ? 'ESTRUTURAS DE TITULO DA BIBLIOTECA NARRATIVA (MANDATORIO SE DISPONIVEIS):' : '',
    titleStructuresStr ? `${titleStructuresStr}\n` : '',
    `CAPITULOS EDITORIAIS DISPONIVEIS PARA A DESCRICAO SEO (use somente estes, em ordem crescente, com no maximo ${chapterAnchors.length} linhas):`,
    JSON.stringify(chapterAnchors, null, 2),
    '',
    'HYPERFRAME ANCHORS (Gere um hfContextTitles para CADA um destes timestamps exatos):',
    '-- Para cada anchor abaixo, o campo "bgPrompt" DEVE retratar visualmente o que esta sendo falado no campo "texto".',
    '-- O bgPrompt e um prompt cinematic em ingles para gerador de imagem/video (Midjourney, Kling, etc.).',
    '-- Descreva o CENARIO, AMBIENTE, LUZ e TEXTURA — nunca a pessoa ou avatar.',
    '-- IMPORTANTE: use o timestamp exatamente como aparece abaixo (formato [MM:SS]) — nao converta nem abrevie.',
    hfAnchors.length > 0 ? JSON.stringify(hfAnchors, null, 2) : 'Nenhum hyperframe detectado neste roteiro.',
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
    `- Generate exactly ${titleCountHint ?? 5} title options.`,
    titleStructuresStr
      ? (() => {
          const channelLanguage = projectContext?.channelLanguage || 'Português';
          const { code: langCode } = getLanguageDirectives(channelLanguage);
          return `- CRITICAL: Each generated title MUST strictly follow one of the patterns listed in the ESTRUTURAS DE TITULO DA BIBLIOTECA NARRATIVA. Do not use generic patterns. Replace all bracketed placeholders (like [TEMA], [METAFORA], [TARGET], [Elemento Pequeno/Frágil], [Objeto], etc.) with specific, contextual details from the script and theme. RE-THEMING RULE: If a pattern is a concrete sentence/example (e.g. references "Magnésio-Quelato" or "alimento fit"), you MUST adapt and replace these subjects/nouns with the current video topic (e.g. "Creatina"). The output titles must be fully written in ${langCode} and must NOT contain any bracketed placeholders or unrelated subjects.`;
        })()
      : `- Each title must organically combine these 5 structural components: hook tension + emotional promise + contrast + transformation + reward. Mix formats: questions, paradoxical affirmations, comparative phrases. Vary tones: provocative, philosophical, inspirational, narrative.`,
    '- Maximum 12 words per title. No technical jargon. Emotional, curious and intense language only.',
    '- SEO description should be only the opening paragraph, written in a human editorial voice.',
    '- Do not output timestamps or the AI notice; the app will add them after generation.',
    '- Make the opening paragraph sound like a real YouTube description, not like a system summary.',
    '- Suno prompt MUST be rich, specific, and thematic — directly referencing the emotional journey, subject matter, and atmosphere of this video.',
    '- Describe genre, mood, instruments, dynamics/evolution, and thematic references. Write multiple layers of description, not just one phrase.',
    '- The Suno prompt must not exceed 800 characters. Use as much of that space as needed to be evocative and specific.',
    '- AVOID generic openers like "Epic cinematic orchestral" unless grounded in the specific theme of this video.',
    '- SFX timeline should feel editorially useful for a human video editor.',
    '- In every EFEITO line, write only an English SFX name that is easy to search in CapCut PC.',
    '- In every TRECHO line, you MUST copy the exact text snippet provided in the "excerpt" field of the SFX plan. DO NOT summarize, paraphrase, or invent new text.',
    '- Use the three decision layers: structural anchors, semantic anchors and rhythmic anchors.',
    '- Do not create SFX events closer than 25 seconds from each other.',
    '- IMPORTANT: You MUST generate SFX events spanning the ENTIRE video duration, from the first anchor to the very last anchor. Do not stop early. Process all proposed anchors.',
    '- CRITICAL: Every hfContextTitles entry MUST include a non-empty "bgPrompt" field. This field must visually translate the "texto" excerpt of that anchor into a cinematic scene description in English. It must describe only environment, setting, light, and texture — never the person or avatar. Length: 1-2 sentences, max 200 chars.',
  ].join('\n');
};

const requestWithOpenAI = async ({
  apiKey,
  model,
  prompt,
  channelLanguage,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  channelLanguage?: string;
}) => {
  const { name: langName, code: langCode, units: langUnits } = getLanguageDirectives(channelLanguage);
  const dynamicInstructions = `${SYSTEM_INSTRUCTIONS}\n\nCRITICAL UNIT OF MEASUREMENT RULE:\nAll units of measurement in titles, subtitle overlays, list points, charts, or any text visible in video/image assets MUST strictly use the: ${langUnits}. If the subtitle text mentions standard metric units (like Celsius or meters) but the target system is Imperial, you MUST dynamically convert them to the equivalent values (e.g. convert 25-40°C to 77-104°F, or 2 meters to 6 feet/yards) inside the 'text reading "..."' visual prompt directive.`
    .replaceAll('Brazilian Portuguese', langName)
    .replaceAll('PT-BR', langCode);

  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: isReasoningModel(model) ? 'developer' : 'system', content: dynamicInstructions },
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
  channelLanguage,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  channelLanguage?: string;
}) => {
  const { name: langName, code: langCode, units: langUnits } = getLanguageDirectives(channelLanguage);
  const dynamicInstructions = `${SYSTEM_INSTRUCTIONS}\n\nCRITICAL UNIT OF MEASUREMENT RULE:\nAll units of measurement in titles, subtitle overlays, list points, charts, or any text visible in video/image assets MUST strictly use the: ${langUnits}. If the subtitle text mentions standard metric units (like Celsius or meters) but the target system is Imperial, you MUST dynamically convert them to the equivalent values (e.g. convert 25-40°C to 77-104°F, or 2 meters to 6 feet/yards) inside the 'text reading "..."' visual prompt directive.`
    .replaceAll('Brazilian Portuguese', langName)
    .replaceAll('PT-BR', langCode);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [dynamicInstructions, prompt].join('\n\n'),
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
      titleCountHint,
      titleStructures,
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
      srtRows,
    });
    const sfxPlan = buildSfxAnchorPlan({
      scriptBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
      minSpacingSeconds: 25,
      srtRows,
    });

    // Formata timestamp SRT ("00:03:29,852") → "[03:29]" para que a IA
    // devolva exatamente o mesmo formato que tsToSec() já sabe parsear.
    const srtToMinSec = (t: string): string => {
      if (!t) return '';
      const parts = t.replace(',', '.').trim().split(':');
      if (parts.length === 3) {
        const h = parseInt(parts[0], 10);
        const m = parseInt(parts[1], 10) + h * 60;
        const s = Math.floor(parseFloat(parts[2]));
        return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
      }
      return t;
    };

    const hfAnchors = (srtRows || [])
      .filter((row) => (row as any).asset === 'hyperframe')
      .map((row) => ({
        timestamp: srtToMinSec((row as any).startTime || ''),
        texto: (row as any).texto || '',
      }));

        const prompt = buildUserPrompt({
      approvedTheme,
      approvedBriefing,
      scriptBlocks,
      chapterAnchors: seoChapterPlan.anchors,
      hfAnchors,
      timelineSource: timelineContext.source,
      projectContext,
      sfxPlan,
      titleCountHint,
      titleStructures,
    });

    const channelLanguage = projectContext?.channelLanguage || 'Português';

    const rawPackage = engine === 'gemini'
      ? await requestWithGemini({ apiKey, model: apiModel, prompt, channelLanguage })
      : await requestWithOpenAI({ apiKey, model: apiModel, prompt, channelLanguage });

    const payload = sanitizePostScriptPackage(rawPackage, seoChapterPlan.anchors, timelineContext.source, channelLanguage);
    if (payload.titles.length < 1) {
      return NextResponse.json({ error: 'A IA nao retornou nenhum titulo viral.' }, { status: 502 });
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
