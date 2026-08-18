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
You are an elite YouTube strategist and creative packaging director for high-retention documentary and educational channels.

Generate a complete, production-ready Phase B post-script package adhering to professional broadcast standards.

Return ONLY valid JSON with this exact shape:
{
  "titles": [
    "Como o Piloto Automático Age Quando Tudo Dá Errado no Avião",
    "O Piloto Automático Não Controla Tudo: A Verdade dos Voos",
    "O Que o Piloto Automático Faz na Crise? A Resposta Choca",
    "Piloto Automático: Como Ele Reage Quando o Avião Vai Mal",
    "Por Que o Piloto Automático Se Desliga em Momentos de Crise",
    "O Segredo do Piloto Automático Que Nenhum Passageiro Conhece",
    "Como o Computador do Avião Agiu Errado e Jogou 110 Pessoas",
    "O Que Acontece no Avião Quando o Piloto Automático Falha",
    "Piloto Automático: A Investigação de Dois Voos Que Mudam Tudo",
    "QF72 e AF447: O Que as Caixas-Pretas Revelam Sobre o PA"
  ],
  "thumbnail_copies": [
    "O PILOTO AUTOMÁTICO NÃO CONTROLA TUDO!",
    "ELE MERGULHOU O AVIÃO SOZINHO",
    "MESMA FALHA 2 FINAIS DIFERENTES"
  ],
  "thumbnail_jsons": [
    {
      "thumbnail_option": "A",
      "canvas": { "width": 1280, "height": 720, "unit": "px", "aspect_ratio": "16:9" },
      "background_scene": {
        "description": "2D cartoon vector illustration of a commercial jet cockpit interior seen from jump seat perspective — wide-angle view showing instrument panels, PFD showing altitude and airspeed, ECAM center display showing a red warning alert box — dark navy blue ambient cockpit light — no human faces or bodies visible — clean bold black outlines and flat shading.",
        "style": "2D cartoon vector illustration, educational diagram, clean bold outlines, flat shading",
        "camera_angle": "centered cockpit interior, wide-angle from jump seat looking forward at panels and glareshield",
        "lighting": "dark navy ambient cockpit lighting, instrument panel self-illumination, warm amber alert glow from ECAM",
        "color_palette": ["dark navy blue", "impact red", "pure white", "yellow alert", "medium blue"]
      },
      "character": { "present": false, "note": "Canal sem mascote. O cockpit e o hero visual." },
      "text_layers": [
        { "id": "text_01", "content": "O PILOTO AUTOMÁTICO", "role": "primary_context", "font_family": "Anton", "font_size": 95, "color": "white", "stroke": { "color": "black", "width": 4 }, "position": { "x": "left", "y": "top", "zone": "left third, top, 60px safe zone" }, "transform": "uppercase" },
        { "id": "text_02", "content": "NÃO CONTROLA", "role": "primary_impact_line1", "font_family": "Anton", "font_size": 140, "color": "vivid red", "stroke": { "color": "black", "width": 5 }, "position": { "x": "left", "y": "center", "zone": "left third, vertically centered" }, "transform": "uppercase" },
        { "id": "text_03", "content": "TUDO!", "role": "primary_impact_line2", "font_family": "Anton", "font_size": 160, "color": "vivid red", "stroke": { "color": "black", "width": 5 }, "position": { "x": "left", "y": "center-bottom", "zone": "left third, largest element" }, "transform": "uppercase" }
      ],
      "indicators": [
        { "id": "indicator_01", "type": "circle", "color": "yellow", "stroke_color": "black", "stroke_width": 4, "glow": true, "position": "center-right, isolating the alert display", "size": "large", "points_to": "ECAM red warning alert box" },
        { "id": "indicator_02", "type": "arrow", "color": "yellow", "stroke_color": "black", "stroke_width": 3, "position": "right third, pointing toward button", "direction": "diagonal-down-left", "size": "medium", "points_to": "AP1 autopilot button glowing amber DISC" }
      ],
      "badges": [
        { "id": "badge_01", "present": true, "type": "pill", "background_color": "red", "text_color": "white", "content": "MODO CRISE", "font_family": "Anton", "font_size": 48, "position": "bottom-left, within safe zone" }
      ],
      "composition": {
        "layout": "Text stack left third; scene center-right two-thirds; yellow circle on center-right; yellow arrow far right",
        "focal_point": "ECAM red warning alert display with yellow glow circle",
        "eye_flow": "text_01 white → text_02+03 red → yellow circle → yellow arrow",
        "safe_zone_margin": "60px all sides",
        "background_base": "dark navy"
      },
      "mood": "technical revelation, aviation crisis tension, educational urgency",
      "generation_notes": "Dark navy background mandatory. High contrast 2D vectors. Clean Anton typography with solid strokes."
    },
    {
      "thumbnail_option": "B",
      "canvas": { "width": 1280, "height": 720, "unit": "px", "aspect_ratio": "16:9" },
      "background_scene": {
        "description": "Dramatic 2D vector composition depicting extreme crisis or critical moment from the script with vivid contrast and directional movement.",
        "style": "2D cartoon vector illustration, educational diagram, dramatic diagonal composition",
        "camera_angle": "wide dynamic angle",
        "lighting": "dark navy sky, emergency red alert glow at edge of frame",
        "color_palette": ["dark navy blue", "impact red", "pure white", "yellow alert", "medium blue"]
      },
      "character": { "present": false, "note": "Canal sem mascote." },
      "text_layers": [
        { "id": "text_01", "content": "ELE MERGULHOU", "role": "primary_impact_line1", "font_family": "Anton", "font_size": 130, "color": "vivid red", "stroke": { "color": "black", "width": 5 }, "position": { "x": "left", "y": "top-center", "zone": "left third, top area" }, "transform": "uppercase" },
        { "id": "text_02", "content": "O AVIÃO", "role": "primary_impact_line2", "font_family": "Anton", "font_size": 160, "color": "vivid red", "stroke": { "color": "black", "width": 5 }, "position": { "x": "left", "y": "center", "zone": "left third, center" }, "transform": "uppercase" },
        { "id": "text_03", "content": "SOZINHO", "role": "secondary_support", "font_family": "Anton", "font_size": 90, "color": "white", "stroke": { "color": "black", "width": 3 }, "position": { "x": "left", "y": "center-bottom", "zone": "left third, bottom" }, "transform": "uppercase" }
      ],
      "indicators": [
        { "id": "indicator_01", "type": "arrow", "color": "yellow", "stroke_color": "black", "stroke_width": 4, "position": "center of composition", "direction": "diagonal-down-right", "size": "large", "points_to": "focal point" }
      ],
      "badges": [
        { "id": "badge_01", "present": true, "type": "pill", "background_color": "red", "text_color": "white", "content": "DOCUMENTADO", "font_family": "Anton", "font_size": 44, "position": "bottom-left, within safe zone" }
      ],
      "composition": {
        "layout": "Text stack left third; dramatic focal scene center-right; indicator arrow center",
        "focal_point": "Critical action element with downward trajectory",
        "eye_flow": "text stack → yellow indicator arrow → badge bottom-left",
        "safe_zone_margin": "60px all sides",
        "background_base": "dark navy"
      },
      "mood": "imminent catastrophe, forensic revelation, high stakes",
      "generation_notes": "Clean high-energy vector layout."
    },
    {
      "thumbnail_option": "C",
      "canvas": { "width": 1280, "height": 720, "unit": "px", "aspect_ratio": "16:9" },
      "background_scene": {
        "description": "2D vector illustration split vertically down the center showing high contrast comparison between two scenarios, causes, or outcomes.",
        "style": "2D cartoon vector illustration, split comparison diagram, forensic educational",
        "camera_angle": "flat front-facing split diagram, both halves equal width",
        "lighting": "dark navy base with contrasting subtle green tint on left side, red tint on right side",
        "color_palette": ["dark navy blue", "impact red", "safe green", "pure white", "yellow alert"]
      },
      "character": { "present": false, "note": "Canal sem mascote." },
      "text_layers": [
        { "id": "text_01", "content": "MESMA", "role": "primary_context", "font_family": "Anton", "font_size": 120, "color": "white", "stroke": { "color": "black", "width": 4 }, "position": { "x": "center", "y": "top", "zone": "top center, straddling both halves" }, "transform": "uppercase" },
        { "id": "text_02", "content": "FALHA", "role": "primary_impact", "font_family": "Anton", "font_size": 160, "color": "vivid red", "stroke": { "color": "black", "width": 5 }, "position": { "x": "center", "y": "top-center", "zone": "center, largest element" }, "transform": "uppercase" },
        { "id": "text_03", "content": "2 FINAIS DIFERENTES", "role": "secondary_support", "font_family": "Anton", "font_size": 80, "color": "white", "stroke": { "color": "black", "width": 3 }, "position": { "x": "center", "y": "center", "zone": "center below text_02" }, "transform": "uppercase" }
      ],
      "indicators": [
        { "id": "indicator_01", "type": "circle", "color": "yellow", "stroke_color": "black", "stroke_width": 3, "glow": true, "position": "left half", "size": "medium", "points_to": "left outcome" },
        { "id": "indicator_02", "type": "arrow", "color": "yellow", "stroke_color": "black", "stroke_width": 3, "position": "right half", "direction": "diagonal-down-right", "size": "medium", "points_to": "right outcome" }
      ],
      "badges": [
        { "id": "badge_01", "present": true, "type": "pill", "background_color": "red", "text_color": "white", "content": "A CAIXA-PRETA REVELA", "font_family": "Anton", "font_size": 42, "position": "bottom-center, within safe zone" }
      ],
      "composition": {
        "layout": "Text trio centered straddling split line; left half scenario A with yellow circle; right half scenario B with yellow arrow; vertical split line center",
        "focal_point": "The bold vertical split and the contrast between outcomes",
        "eye_flow": "text center → yellow circle left → yellow arrow right → badge bottom center",
        "safe_zone_margin": "60px all sides",
        "background_base": "dark navy split"
      },
      "mood": "shocking comparison, two fates from one failure, forensic revelation",
      "generation_notes": "Split layout for A/B/C testing."
    }
  ],
  "seoDescription": "A trinta e sete mil pés de altitude, o piloto automático de um Airbus A330 recebeu um dado falso e mergulhou o nariz do avião com violência suficiente para arremessar mais de cem passageiros contra o teto da cabine. Ele não teve medo. Não hesitou. Agiu com a mesma convicção que teria se o dado fosse verdadeiro.\n\nNeste vídeo, o canal abre a investigação forense de como o piloto automático realmente se comporta quando tudo dá errado — camada por camada, até chegar ao minuto exato registrado em caixa-preta.\n\nVocê vai entender por que o piloto automático não é um piloto de metal, como funciona o sistema de consenso entre três computadores e por que a aviação moderna nunca tirou o ser humano da equação.\n\nSeja bem-vindo. O avião guarda muitos segredos e estamos aqui para revelar cada um deles.",
  "sources_section": [
    "Comportamento dos ADIRU no voo QF72 (Qantas A330, 7 out. 2008) — ATSB Final Report AO-2008-070, Australian Transport Safety Bureau, 2011",
    "Causas do acidente com o voo AF447 (Air France A330, 1 jun. 2009) — BEA Final Report, Bureau d'Enquêtes et d'Analyses pour la Sécurité de l'Aviation Civile, França, 2012",
    "Atualização de software pós-QF72 para frota A330/A340 — Airbus S.A.S., Service Bulletin / Airworthiness Directive 2009",
    "Definição do sistema ADIRU e redundância tripla em aeronaves de transporte — Airbus S.A.S., A330 Flight Crew Operating Manual (FCOM)",
    "Piloto automático como ferramenta de apoio, não substituto da tripulação — FAA Advisory Circular AC 120-71B; CENIPA, Brasil",
    "CRM — Crew Resource Management, origem e aplicação — ICAO Doc 9683-AN/950, 1ª ed. revisada"
  ],
  "pinned_comment": "Qual dessas situações você já presenciou na prática? Deixe seu relato nos comentários!",
  "seo_tags": ["piloto automático", "aviação", "investigação aérea", "caixa preta", "airbus a330", "segurança de voo", "desastre aéreo", "engenharia aeronáutica"],
  "sunoSuggestedTitle": "O Minuto da Decisão",
  "sunoPrompt": "Cinematic Orchestral, Tense Underscore, Dark Ambient Aviation, Subtle Electronic Pulse, Sparse Piano Melody, Low Brass Tension, Slow Build Riser, Atmospheric Tension, Documentary Score Aesthetic, 72 BPM, No Vocals, No Drums.",
  "hfContextTitles": [],
  "sfxTimelineTxt": ""
}

CRITICAL RULES:
1. "titles": Generate exactly 10 high-CTR title variations between 55 and 85 characters.
   - Clean, curiosity-inducing, forensic/investigative journalistic tone.
   - NO EMOJIS in titles. No random ALL CAPS words in the middle of sentences.
2. "thumbnail_copies": Generate exactly 3 punchy, contextual copies (2 to 4 words MAX, ALL CAPS).
   - Must be specifically tied to the dramatic core/twist of THIS script (e.g. 'O PILOTO AUTOMÁTICO NÃO CONTROLA TUDO!').
   - Never output generic phrases like 'NÃO FAÇA ISSO' or 'EVITE AGORA'.
3. "thumbnail_jsons": Generate exactly 3 distinct art direction JSONs (Options A, B, and C) matching the channel's visual identity.
   - Always follow the complete schema with canvas, background_scene, text_layers (Anton font, strokes, positions), indicators (yellow circles/arrows with glow), badges, composition, and generation_notes.
4. "sources_section": Generate 3 to 6 real, credible, verifiable official sources, investigation reports, manuals, or benchmark publications relevant to the video topic.
5. "seoDescription": Write a 3 to 4 paragraph documentary description (Hook + Investigation scope + Welcome message). Do NOT output timestamps or AI notices in this field (the application formats them automatically).
6. "sunoSuggestedTitle": Short, evocative soundtrack title in Portuguese or English.
7. "sunoPrompt": Strictly format as comma-separated tags tailored for Suno v3.5/v4 (Genre, Subgenre, Mood, Instruments, Tempo/BPM, Negative tags like No Vocals, No Drums). Max 350 chars.
8. Output pure JSON without markdown backticks.
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
  referenceChannels?: any[];
  channelDna?: any;
  forensicFormulas?: Array<{ name: string; skeleton: string; trigger: string; proof: string }>;
  forensicPowerWords?: string[];
  forensicTone?: string;
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
