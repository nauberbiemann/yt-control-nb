import { NextRequest, NextResponse } from 'next/server';
import { resolveModel, isReasoningModel } from '@/lib/ai-config';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ShuffleRequest {
  theme: string;
  projectConfig: {
    minBlocks: number;
    maxBlocks: number;
    minDuration: number;
    maxDuration: number;
    lastBlockCount?: number;
    targetChars?: number; // total char target (duration * 1200)
  };
  narrativeLibrary: {
    hooks: Array<{ id: string; name: string; content_pattern?: string }>;
    ctas: Array<{ id: string; name: string; content_pattern?: string; is_soft?: boolean }>;
    communityElements?: Array<{ id: string; name: string; content_pattern?: string }>;
  };
  metaphorLibrary: string[];
  titleStructures: Array<{ id: string; name: string; content_pattern?: string }>;
  controlLog: Array<{
    selectedHookId?: string;
    selectedCtaId?: string;
    blockCount?: number;
    narrative_asset_ids?: string[];
  }>;
  engine?: string;
  model?: string;
  apiKey?: string;
}


// ─── Local Fallback (algorithmic) ─────────────────────────────────────────────

function localShuffleFallback(req: ShuffleRequest) {
  const { theme, projectConfig, narrativeLibrary, metaphorLibrary, titleStructures, controlLog } = req;
  const { minBlocks, maxBlocks, minDuration, maxDuration } = projectConfig;
  const hooks = narrativeLibrary.hooks;
  const ctas  = narrativeLibrary.ctas;

  // ① Declare totalMinutes FIRST so it can be used for char calculations
  const totalMinutes = Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;

  // Anti-repetition: avoid last used hook/cta/blockCount
  const lastUsedHookId = controlLog[0]?.selectedHookId;
  const lastUsedCtaId  = controlLog[0]?.selectedCtaId;
  const lastCount      = controlLog[0]?.blockCount || 0;

  const availableHooks = hooks.filter(h => h.id !== lastUsedHookId);
  const selectedHook   = (availableHooks.length > 0 ? availableHooks : hooks)[
    Math.floor(Math.random() * Math.max(1, availableHooks.length || hooks.length))
  ];

  const availableCtas = ctas.filter(c => c.id !== lastUsedCtaId);
  const selectedCta   = (availableCtas.length > 0 ? availableCtas : ctas)[
    Math.floor(Math.random() * Math.max(1, availableCtas.length || ctas.length))
  ];

  // ② Pick block count different from last
  let bodyCount = Math.floor(Math.random() * (maxBlocks - minBlocks + 1)) + minBlocks;
  if (bodyCount === lastCount && maxBlocks > minBlocks) {
    bodyCount = bodyCount === maxBlocks ? minBlocks : bodyCount + 1;
  }

  // ③ Char budget — computed AFTER totalMinutes is known
  const totalChars    = totalMinutes * 1200;
  const hookChars     = Math.floor(totalChars * 0.08);   // ~8%
  const ctaFinalChars = Math.floor(totalChars * 0.06);   // ~6%
  const bodyTotal     = totalChars - hookChars - ctaFinalChars;
  const charsPerBlock = Math.floor(bodyTotal / Math.max(bodyCount, 1));
  const midCtaPosition = Math.floor(bodyCount / 2);

  const voices = ['Desafio Direto', 'Vulnerabilidade', 'Diagnóstico Técnico'];
  const missionMap: Record<string, string[]> = {
    'Desafio Direto': [
      'Provocar ação imediata — confrontar a crença limitante do espectador.',
      'Challenger Frame — expor o que o espectador está fazendo errado.',
      'Autoridade agressiva — posicionar a autoridade do criador com desafio direto.',
    ],
    'Vulnerabilidade': [
      'Storytelling pessoal — compartilhar falha ou aprendizado do criador.',
      'Espelho emocional — fazer o espectador se sentir visto e compreendido.',
      'Jornada de herói — como o criador passou pelo mesmo problema.',
    ],
    'Diagnóstico Técnico': [
      'Análise de dados — apresentar evidências e números para validar o ponto.',
      'Framework sistêmico — decompor o problema em componentes técnicos.',
      'Diagnóstico de mercado — o que a maioria faz errado e por quê.',
    ],
  };

  const allPool = [...titleStructures.map(t => t.name), ...metaphorLibrary];
  const shuffled = [...allPool].sort(() => Math.random() - 0.5);

  const communityElements = req.narrativeLibrary.communityElements || [];
  const twistIndex = Math.floor(bodyCount / 2);
  const bridges = [
    'Prepare-se, pois o próximo bloco vai inverter tudo o que você acabou de ver.',
    'E essa é apenas a metade da equação — o que vem a seguir é onde a maioria erra.',
    'Mas o problema real vai além disso — e vou te mostrar exatamente onde.',
    'Isso muda tudo quando você entende o que vem na próxima parte.',
    'A virada real começa agora — presta atenção no que vem a seguir.',
  ];

  const dominantVoice = voices[Math.floor(voices.length * Math.random())];

  const blocks = Array.from({ length: bodyCount }, (_, i) => {
    const voiceKey    = voices[i % voices.length] as keyof typeof missionMap;
    const missions    = missionMap[voiceKey];
    const metaphorName = allPool.length > 0 ? shuffled[i % shuffled.length] : `Bloco ${i + 1}`;
    const communityEl  = communityElements.length > 0 && i % 2 === 1
      ? communityElements[i % communityElements.length]?.content_pattern || undefined
      : undefined;
    return {
      name: metaphorName,
      missionNarrative: missions[Math.floor(Math.random() * missions.length)],
      voiceStyle: voiceKey,
      isNarrativeTwist: i === twistIndex,
      blockChars: charsPerBlock,
      bridgeInstruction: i < bodyCount - 1 ? bridges[i % bridges.length] : undefined,
      communityElement: communityEl,
    };
  });

  // Mid-CTA: pick a different CTA than the final one
  const midCtaEl = availableCtas.length > 1
    ? availableCtas.find(c => c.id !== selectedCta?.id) || availableCtas[0]
    : null;

  return {
    title: theme,
    selectedHookId: selectedHook?.id || '',
    selectedCtaId:  selectedCta?.id  || '',
    midCta: midCtaEl ? { id: midCtaEl.id, position: midCtaPosition } : undefined,
    blockCount: bodyCount + 2,
    estimatedDurationMinutes: totalMinutes,
    estimatedChars: totalChars,
    hookChars,
    ctaChars: ctaFinalChars,
    dominantVoice,
    blocks,
    isFallback: true,
    fallbackReason: 'no_key' as const,
  };
}

// ─── AI Prompt Builder (V15 — Total Intelligence) ─────────────────────────────

function buildShufflePrompt(req: ShuffleRequest): string {
  const { theme, projectConfig, narrativeLibrary, metaphorLibrary, titleStructures, controlLog } = req;
  const { minBlocks, maxBlocks, minDuration, maxDuration, targetChars } = projectConfig;

  // Use center of duration range for char budget calculation
  const midDuration        = Math.round((minDuration + maxDuration) / 2);
  const computedTargetChars = targetChars || (midDuration * 1200);
  const hookChars           = Math.floor(computedTargetChars * 0.08);
  const ctaChars            = Math.floor(computedTargetChars * 0.06);
  const bodyCharsTotal      = computedTargetChars - hookChars - ctaChars;

  const hooksStr     = narrativeLibrary.hooks.map(h => `- [${h.id}] ${h.name}: "${h.content_pattern || ''}"`).join('\n');
  const allCtas      = narrativeLibrary.ctas;
  const ctasStr      = allCtas.map(c => `- [${c.id}] ${c.name}${c.is_soft ? ' [SOFT/INTERMEDIÁRIA]' : ' [HARD/FINAL]'}: "${c.content_pattern || ''}"`).join('\n');
  const communityStr = (narrativeLibrary.communityElements || []).map(e => `- [${e.id}] "${e.content_pattern || e.name}"`).join('\n') || 'Nenhum cadastrado ainda.';
  const metaphorsStr = [...metaphorLibrary, ...titleStructures.map(t => t.name)].join(', ') || 'Não há metáforas cadastradas.';

  const lastHookId = controlLog[0]?.selectedHookId || 'none';
  const lastCtaId  = controlLog[0]?.selectedCtaId  || 'none';
  const lastCount  = controlLog[0]?.blockCount     || 0;

  return `You are the STRATEGIC NARRATIVE ARCHITECT V15 — TOTAL INTELLIGENCE. Produce a modular video briefing with mathematical precision, traceable brand identity, and absolute narrative flow.

THEME: "${theme}"

PROJECT_CONFIG (⚠️ ALL values are MANDATORY — ignoring them makes the output invalid):
- Body block count: MUST be between ${minBlocks} and ${maxBlocks}. The "blocks" array in your JSON MUST contain between ${minBlocks} and ${maxBlocks} items. NO EXCEPTIONS.
- Duration: MUST be an integer between ${minDuration} and ${maxDuration} minutes. DO NOT output a value outside this range.
- Target total characters: ${computedTargetChars} chars
  • Hook: ~${hookChars} chars (dense, short)
  • CTA Final: ~${ctaChars} chars (concise conversion)
  • Body blocks budget: ${bodyCharsTotal} chars total (distribute proportionally, central blocks heavier)
  • VALIDATION: sum of all blockChars + hookChars + ctaChars must equal ${computedTargetChars}

NARRATIVE_LIBRARY — HOOKS (avoid last used: ${lastHookId}):
${hooksStr}

NARRATIVE_LIBRARY — CTAs (pick 1 SOFT/INTERMEDIÁRIA for mid + 1 HARD/FINAL for closing; avoid last: ${lastCtaId}):
${ctasStr}

ELEMENTOS DE COMUNIDADE (inject 2–3 organically into development blocks; display their ID for traceability):
${communityStr}

ASSET_LIBRARY — Metaphors & Concepts (use as ATOMIC block titles, max 8 words each):
${metaphorsStr}

COMPOSITION PROTOCOL (V15 — TOTAL INTELLIGENCE):
1. MATHEMATICAL SYNC: Total chars across all blocks (hook + body + ctaFinal) = ${computedTargetChars}. No exceptions.
2. WEIGHT DISTRIBUTION: Hook & CTA Final = short/dense. Central body blocks carry more theoretical weight.
3. ATOMICITY: Block names = metaphor/concept ONLY (no theme prefix). Max 8 words.
4. VOICE ALTERNATION: Strict cycle — 'Desafio Direto' (2nd person), 'Vulnerabilidade' (1st person), 'Diagnóstico Técnico' (3rd person). Never repeat consecutively.
5. NARRATIVE TWIST: Exactly 1 central block marked isNarrativeTwist:true — must reveal a counter-intuitive truth.
6. THE BRIDGE: Each block (except the last) MUST have a bridgeInstruction — a 1-sentence transition that plants a mental hook for the next block.
7. COMMUNITY IDENTITY: Inject 2–3 community elements into development blocks as communityElement (include their ID).
8. MULTI-CTA FLOW: 1 SOFT mid-CTA (engagement) + 1 HARD final-CTA (conversion).
9. EXCLUSIVITY: Asset sequence must differ from previous composition logs.

PREVIOUS_LOGS:
- Last hook: ${lastHookId} | Last CTA: ${lastCtaId} | Last block count: ${lastCount}

Respond ONLY with raw JSON (no markdown fences):
{
  "title": "<theme unchanged>",
  "selectedHookId": "<hook id>",
  "selectedHookChars": ${hookChars},
  "selectedCtaId": "<HARD CTA id for closing>",
  "ctaFinalChars": ${ctaChars},
  "midCta": {
    "id": "<SOFT CTA id>",
    "position": <insert after this body block index (0-based)>
  },
  "blockCount": <body blocks COUNT + 2 (hook + CTA). blocks array length + 2. MUST be between ${minBlocks + 2} and ${maxBlocks + 2}>,
  "estimatedDurationMinutes": <integer STRICTLY between ${minDuration} and ${maxDuration} inclusive — MANDATORY>,
  "estimatedChars": ${computedTargetChars},
  "dominantVoice": "<most frequent voiceStyle>",
  "blocks": [
    {
      "name": "<atomic metaphor title, max 8 words>",
      "missionNarrative": "<active direction command for scriptwriter, 1–2 sentences>",
      "voiceStyle": "<'Desafio Direto' | 'Vulnerabilidade' | 'Diagnóstico Técnico'>",
      "isNarrativeTwist": <true|false>,
      "blockChars": <integer — proportional to body budget>,
      "bridgeInstruction": "<transition sentence (omit for last block)>",
      "communityElement": "<community phrase string or null>",
      "communityElementId": "<community element id or null>"
    }
  ]
}`;
}

// ─── Route Handler ────────────────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body: ShuffleRequest = await req.json();
    const { engine, model, apiKey } = body;

    if (!body.theme || !body.narrativeLibrary) {
      return NextResponse.json({ error: 'theme and narrativeLibrary are required' }, { status: 400 });
    }

    // Resolve API key
    let resolvedKey = '';
    if (engine === 'openai') resolvedKey = apiKey || process.env.OPENAI_API_KEY || '';
    else if (engine === 'gemini') resolvedKey = apiKey || process.env.GEMINI_API_KEY || '';

    // No key → local fallback
    if (!resolvedKey || resolvedKey === 'sua_chave_aqui') {
      const fallback = localShuffleFallback(body);
      return NextResponse.json({ ...fallback, isFallback: true, fallbackReason: 'no_key' }, { status: 200 });
    }

    const prompt   = buildShufflePrompt(body);
    const apiModel = resolveModel(model || 'gemini-2.0-flash');

    let responseData: any;

    if (engine === 'gemini') {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${resolvedKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: {
              temperature: 0.85,
              maxOutputTokens: 3000,
              response_mime_type: 'application/json',
            },
          }),
        }
      );
      const raw = await response.json();
      if (!response.ok) return NextResponse.json(raw, { status: response.status });
      const text = raw?.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
      const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
      try {
        responseData = JSON.parse(cleanText);
      } catch {
        console.warn('[Shuffle V15 Gemini] Invalid JSON, using fallback.', { cleanText });
        const fallback = localShuffleFallback(body);
        return NextResponse.json({ ...fallback, isFallback: true, fallbackReason: 'parse_error' }, { status: 200 });
      }
    } else {
      const supportsTemp = !isReasoningModel(model || '');
      const requestBody: any = {
        model: apiModel,
        messages: [{ role: 'user', content: prompt }],
        response_format: { type: 'json_object' },
      };
      if (supportsTemp) requestBody.temperature = 0.85;

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${resolvedKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });
      const raw = await response.json();
      if (!response.ok) return NextResponse.json(raw, { status: response.status });
      const text = raw?.choices?.[0]?.message?.content || '{}';
      try {
        responseData = JSON.parse(text);
      } catch {
        console.warn('[Shuffle V15 OpenAI] Invalid JSON, using fallback.', { text });
        const fallback = localShuffleFallback(body);
        return NextResponse.json({ ...fallback, isFallback: true, fallbackReason: 'parse_error' }, { status: 200 });
      }
    }

    // Enrich with estimatedChars — use AI value, or calculate from returned minutes, or random within range
    const { minDuration, maxDuration } = body.projectConfig;
    const aiMinutes = responseData.estimatedDurationMinutes;
    const finalMinutes = (aiMinutes && aiMinutes >= minDuration && aiMinutes <= maxDuration)
      ? aiMinutes
      : Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
    const estimatedChars = responseData.estimatedChars || (finalMinutes * 1200);

    return NextResponse.json({
      ...responseData,
      estimatedDurationMinutes: finalMinutes,
      estimatedChars,
      isFallback: false,
    });
  } catch (error: any) {
    console.error('[Shuffle V15 API Error]', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}

