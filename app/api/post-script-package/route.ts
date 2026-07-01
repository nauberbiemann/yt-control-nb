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
You generate a post-script production package for a Brazilian Portuguese YouTube video.

Return only valid JSON with this exact shape:
{
  "titles": ["...", "...", "...", "...", "..."],
  "seoDescription": "...",
  "sunoPrompt": "...",
  "sunoSuggestedTitle": "...",
  "hfContextTitles": [
    {
      "timestamp": "[02:15]",
      "headline": "Custo Invisível",
      "subtitle": "Como pequenas perdas acumulam sem que você perceba.",
      "metrics": "—",
      "bgPrompt": "Dimly lit office desk with scattered papers and glowing monitor, shallow depth of field, cinematic teal tones."
    },
    {
      "timestamp": "[07:30]",
      "headline": "Esgotamento Silencioso",
      "subtitle": "O que seu corpo tenta te dizer antes do colapso.",
      "metrics": "—",
      "bgPrompt": "Warm amber light in an empty living room at dusk, soft bokeh, emotional and intimate atmosphere."
    },
    {
      "timestamp": "[13:05]",
      "headline": "Virada de Chave",
      "subtitle": "O momento que separa quem avança de quem estagna.",
      "metrics": "3x",
      "bgPrompt": "Abstract dark corridor with a single beam of light breaking through, dramatic contrast, cinematic wide angle."
    }
  ],
  "sfxTimelineTxt": "..."
}

Rules:
- "titles" must contain distinct title options in PT-BR, matching the exact number of titles requested in the user prompt (defaulting to 5 if not specified).
- If specific "ESTRUTURAS DE TITULO DA BIBLIOTECA NARRATIVA" (Narrative Library Title Structures) are provided in the user prompt:
  * Every generated title option MUST strictly follow one of those patterns.
  * Replace all bracketed placeholders (e.g. [TEMA], [METAFORA], [TARGET], [Elemento Pequeno/Frágil], [Objeto], etc.) with specific, contextual details related to the video topic and script.
  * CRITICAL RE-THEMING RULE: If any Title Structure pattern is a concrete sentence/example (e.g., it contains specific subjects/nouns like "Magnésio-Quelato" or "alimento fit" instead of bracketed placeholders), you MUST identify these concrete subjects/nouns and adapt/replace them with the current video topic (e.g. "Creatina") and script context. Under no circumstances should you copy the original subjects/nouns of the pattern if they do not match the current video's topic.
  * The final output titles must NOT contain any bracketed placeholders and must be written fully in PT-BR.
  * Distribute the titles across the provided structures (e.g., if there are 5 structures, generate at least one variation matching each structure).
- If NO narrative library title structures are provided:
  * Each title must organically combine these 5 structural components:
    1. Tensão inicial (hook): cria desequilíbrio ou lacuna mental.
    2. Promessa emocional: mostra o que o público vai descobrir, resolver ou entender.
    3. Contraste: opõe duas ideias, criando tensão semântica.
    4. Transformação: revela uma virada de entendimento.
    5. Fechamento de recompensa: entrega o valor final ou insight.
- Use emotional, curious and intense language. Avoid technical jargon.
- Mix formats: questions ("Por que..."), paradoxical statements ("A verdade brutal sobre..."), comparative phrases ("O lado oculto de...").
- Maximum 12 words per title.
- Vary tones across titles: provocative, philosophical, inspirational, narrative.
- Titles must feel clickable and relevant to the specific video topic.
- "seoDescription" must be in PT-BR and should focus on writing only the human opening paragraph of the YouTube description.
- Use correct Brazilian Portuguese spelling and accentuation in every PT-BR field.
- The SEO description must follow this formatting:
  1. One short opening paragraph with 2 to 4 sentences introducing the promise of the video.
  2. Do not write timestamp lines yourself.
  3. Do not write the AVISO DE IA yourself.
- The app will normalize timestamps and the AI notice after your response.
- Keep the opening paragraph natural, human and useful, not robotic.
- Avoid quotation marks around technical metaphors unless absolutely necessary.
- "sunoPrompt" must be written in English and must be rich, thematic, and detailed — reflecting the specific emotional arc, subject matter, and atmosphere of this video.
- The Suno prompt MUST reference the theme of the video (e.g. if the video is about developer burnout, the prompt should evoke that feeling through musical language).
- Structure the prompt as a layered description covering: genre/subgenre, mood and atmosphere, key instruments, dynamic evolution (how the music builds or shifts), and any thematic or textural references.
- Use comma-separated descriptors, but write multiple layers — not just one line. Think of it as a production brief that a composer would use to score a short film.
- Maximum length: 800 characters. Stay under this limit but use as much of it as needed to be specific and evocative.
- Do NOT use generic phrases like "epic cinematic orchestral" without grounding them in the specific theme.
- Avoid BPM numbers, key signatures, stem breakdowns, or technical production jargon.
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
- For "hfContextTitles", generate a contextual title array based on the provided hyperframe anchors.
  DO NOT include a "visualState" field — the template is assigned automatically by the app.
  For each anchor generate ONLY:
  1. "timestamp": The anchor timestamp in [MM:SS] format.
  2. "headline": Short impact title (3-6 words, e.g. "Presença Fragmentada", "O Custo Oculto").
  3. "subtitle": Contextual phrase (max 15 words) that reflects what is being said at that moment.
  4. "metrics": Optional support metric (e.g. "10x", "+85%"). Use an em dash "—" if not applicable.
  5. "bgPrompt": A cinematic image/video generation prompt in English for the background behind the avatar.
     - Must be visually descriptive, environment-based, and match the emotional tone of that specific narrative moment.
     - Do NOT describe the person or avatar. Describe only the scene, setting, textures, and atmosphere.
     - Examples: "Soft morning light filtering through kitchen window, organic produce on marble counter, shallow depth of field", "Dark laboratory with glowing chemical flasks, blue neon reflections on glass surfaces, cinematic wide shot"
     - Write 1-2 sentences. Maximum 200 characters.
     - This prompt will be used with AI image/video generators (Midjourney, Kling, RunwayML). Make it generator-ready.
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
