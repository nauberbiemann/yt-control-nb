import { NextRequest, NextResponse } from 'next/server';
import { resolveModel, isReasoningModel } from '@/lib/ai-config';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    narrativeCurves?: Array<{ id: string; name: string; content_pattern?: string; description?: string; category?: string }>;
    argumentModes?: Array<{ id: string; name: string; content_pattern?: string; description?: string; category?: string }>;
    repetitionRules?: Array<{ id: string; name: string; content_pattern?: string; description?: string; category?: string }>;
  };
  metaphorLibrary: string[];
  titleStructures: Array<{ id: string; name: string; content_pattern?: string }>;
  controlLog: Array<{
    selectedHookId?: string;
    selectedCtaId?: string;
    selectedTitleStructureId?: string;
    selectedCurveId?: string;
    selectedArgumentModeId?: string;
    selectedRepetitionRuleIds?: string[];
    blockCount?: number;
    durationMinutes?: number;
    voicePattern?: string;
    source?: 'session' | 'registered';
    created_at?: string;
    narrative_asset_ids?: string[];
  }>;
  engine?: string;
  model?: string;
  apiKey?: string;
}

interface VoicePatternOption {
  id: string;
  sequence: string[];
}

interface SelectionPlan {
  hookId: string;
  ctaId: string;
  titleStructureId: string;
  curveId?: string;
  argumentModeId?: string;
  repetitionRuleIds: string[];
  blockCount: number;
  durationMinutes: number;
  voicePatternId: string;
  voiceSequence: string[];
  noveltyScore: number;
}

interface SelectionDiagnostics {
  noveltyScore: number;
  locked: {
    hookId: string;
    ctaId: string;
    titleStructureId: string;
    curveId?: string;
    argumentModeId?: string;
    repetitionRuleIds: string[];
    blockCount: number;
    durationMinutes: number;
    voicePatternId: string;
  };
  blocked: {
      titleStructureIds: string[];
      curveIds: string[];
      argumentModeIds: string[];
      repetitionRuleIds: string[];
      comboKeys: string[];
    blockCounts: number[];
    durationMinutes: number[];
    voicePatternIds: string[];
  };
  recentUsage: {
      hookIds: string[];
      ctaIds: string[];
      titleStructureIds: string[];
      curveIds: string[];
      argumentModeIds: string[];
      repetitionRuleIds: string[];
      blockCounts: number[];
      durationMinutes: number[];
      voicePatternIds: string[];
    sourceBreakdown: {
      session: number;
      registered: number;
    };
  };
}

const VOICE_PATTERNS: VoicePatternOption[] = [
  { id: 'challenge-first', sequence: ['Desafio Direto', 'Vulnerabilidade', 'Diagnóstico Técnico'] },
  { id: 'vulnerability-first', sequence: ['Vulnerabilidade', 'Diagnóstico Técnico', 'Desafio Direto'] },
  { id: 'diagnostic-first', sequence: ['Diagnóstico Técnico', 'Desafio Direto', 'Vulnerabilidade'] },
];

const countUsage = (items: Array<string | undefined>, target: string) =>
  items.filter((item) => item === target).length;

const getBehaviorFlag = (item?: { category?: string }) => (item?.category || '').toLowerCase();
const isFixed = (item?: { category?: string }) => getBehaviorFlag(item) === 'fixed';
const isRotative = (item?: { category?: string }) => getBehaviorFlag(item) === 'rotative';
const isExperimental = (item?: { category?: string }) => getBehaviorFlag(item) === 'experimental';

const pickLeastUsedDifferent = <T extends { id: string }>(
  items: T[],
  recentIds: string[],
  excludedId?: string
) => {
  const candidates = items.filter((item) => item.id && item.id !== excludedId);
  if (candidates.length === 0) return null;

  const scored = candidates
    .map((item) => ({
      item,
      usage: countUsage(recentIds, item.id),
    }))
    .sort((a, b) => a.usage - b.usage);

  return scored[0]?.item || candidates[0];
};

const pickDirectiveItem = <T extends { id: string; category?: string }>(
  items: T[],
  recentIds: string[]
) => {
  if (!items.length) return null;

  const fixedItem = items.find((item) => isFixed(item));
  if (fixedItem) return fixedItem;

  const rotativeItems = items.filter((item) => isRotative(item));
  if (rotativeItems.length > 0) {
    return pickLeastUsedDifferent(rotativeItems, recentIds) || rotativeItems[0];
  }

  const experimentalItems = items.filter((item) => isExperimental(item));
  if (experimentalItems.length > 0) {
    return pickLeastUsedDifferent(experimentalItems, recentIds) || experimentalItems[0];
  }

  return pickLeastUsedDifferent(items, recentIds) || items[0];
};

const pickRepetitionRules = <T extends { id: string; category?: string }>(
  items: T[],
  recentIds: string[]
) => {
  if (!items.length) return [];

  const fixedItems = items.filter((item) => isFixed(item));
  const rotativeItems = items.filter((item) => isRotative(item));
  const experimentalItems = items.filter((item) => isExperimental(item));

  const selected: T[] = [...fixedItems];
  const optionalPool = rotativeItems.length > 0 ? rotativeItems : experimentalItems;
  const extra = pickLeastUsedDifferent(optionalPool, recentIds);
  if (extra && !selected.some((item) => item.id === extra.id)) {
    selected.push(extra);
  }

  if (selected.length === 0 && items[0]) {
    selected.push(items[0]);
  }

  return selected;
};

function buildSelectionPlan(req: ShuffleRequest): SelectionPlan | null {
  const hooks = req.narrativeLibrary.hooks.filter((item) => item?.id);
  const ctas = req.narrativeLibrary.ctas.filter((item) => item?.id);
  const structures = req.titleStructures.filter((item) => item?.id);
  const narrativeCurves = (req.narrativeLibrary.narrativeCurves || []).filter((item) => item?.id);
  const argumentModes = (req.narrativeLibrary.argumentModes || []).filter((item) => item?.id);
  const repetitionRules = (req.narrativeLibrary.repetitionRules || []).filter((item) => item?.id);
  const blockCounts = Array.from(
    { length: Math.max(0, req.projectConfig.maxBlocks - req.projectConfig.minBlocks + 1) },
    (_, index) => req.projectConfig.minBlocks + index
  );
  const durations = Array.from(
    { length: Math.max(0, req.projectConfig.maxDuration - req.projectConfig.minDuration + 1) },
    (_, index) => req.projectConfig.minDuration + index
  );

  if (hooks.length === 0 || ctas.length === 0 || structures.length === 0 || blockCounts.length === 0 || durations.length === 0) {
    return null;
  }

  const recent = (req.controlLog || []).filter(Boolean);
  const recent2 = recent.slice(0, 2);
  const recent3 = recent.slice(0, 3);
  const recent5 = recent.slice(0, 5);
  const recent10 = recent.slice(0, 10);

  const recentHookIds = recent10.map((entry) => entry.selectedHookId).filter(Boolean) as string[];
  const recentCtaIds = recent10.map((entry) => entry.selectedCtaId).filter(Boolean) as string[];
  const recentStructureIds = recent10.map((entry) => entry.selectedTitleStructureId).filter(Boolean) as string[];
  const recentCurveIds = recent10.map((entry) => entry.selectedCurveId).filter(Boolean) as string[];
  const recentArgumentModeIds = recent10.map((entry) => entry.selectedArgumentModeId).filter(Boolean) as string[];
  const recentRepetitionRuleIds = recent10.flatMap((entry) => entry.selectedRepetitionRuleIds || []).filter(Boolean) as string[];
  const recentVoicePatterns = recent10.map((entry) => entry.voicePattern).filter(Boolean) as string[];
  const recentBlockCounts = recent10
    .map((entry) => Number(entry.blockCount || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  const recentDurations = recent10
    .map((entry) => Number(entry.durationMinutes || 0))
    .filter((value) => Number.isFinite(value) && value > 0);

  const blockedStructureIds = new Set(
    structures.length > 1
      ? recent3.map((entry) => entry.selectedTitleStructureId).filter(Boolean)
      : []
  );
  const blockedBlockCounts = new Set(
    blockCounts.length > 1
      ? recent2.map((entry) => Number(entry.blockCount || 0)).filter((value) => Number.isFinite(value) && value > 0)
      : []
  );
  const blockedDurations = new Set(
    durations.length > 1
      ? recent2.map((entry) => Number(entry.durationMinutes || 0)).filter((value) => Number.isFinite(value) && value > 0)
      : []
  );
  const blockedCombos = new Set(
    recent5
      .map((entry) => `${entry.selectedHookId || ''}|${entry.selectedCtaId || ''}|${entry.selectedTitleStructureId || ''}`)
      .filter((value) => value !== '||')
  );
  const blockedVoicePatterns = new Set(
    VOICE_PATTERNS.length > 1
      ? recent2.map((entry) => entry.voicePattern).filter(Boolean)
      : []
  );

  const selectedCurve = pickDirectiveItem(narrativeCurves, recentCurveIds);
  const selectedArgumentMode = pickDirectiveItem(argumentModes, recentArgumentModeIds);
  const selectedRepetitionRules = pickRepetitionRules(repetitionRules, recentRepetitionRuleIds);

  const candidates: SelectionPlan[] = [];

  hooks.forEach((hook) => {
    ctas.forEach((cta) => {
      structures.forEach((structure) => {
        blockCounts.forEach((blockCount) => {
          durations.forEach((durationMinutes) => {
            VOICE_PATTERNS.forEach((voicePattern) => {
              const comboKey = `${hook.id}|${cta.id}|${structure.id}`;

              if (blockedStructureIds.has(structure.id)) return;
              if (blockedCombos.has(comboKey)) return;
              if (blockedBlockCounts.has(blockCount)) return;
              if (blockedDurations.has(durationMinutes)) return;
              if (blockedVoicePatterns.has(voicePattern.id)) return;

              const noveltyScore =
                100
                - countUsage(recentHookIds, hook.id) * 12
                - countUsage(recentCtaIds, cta.id) * 12
                - countUsage(recentStructureIds, structure.id) * 20
                - countUsage(recentBlockCounts.map(String), String(blockCount)) * 10
                - countUsage(recentDurations.map(String), String(durationMinutes)) * 10
                - countUsage(recentVoicePatterns, voicePattern.id) * 8
                + (recent5.some((entry) => entry.selectedHookId === hook.id) ? 0 : 8)
                + (recent5.some((entry) => entry.selectedCtaId === cta.id) ? 0 : 8)
                + (recent5.some((entry) => entry.selectedTitleStructureId === structure.id) ? 0 : 12)
                + (recent5.some((entry) => Number(entry.blockCount) === blockCount) ? 0 : 10)
                + (recent5.some((entry) => Number(entry.durationMinutes) === durationMinutes) ? 0 : 10)
                + (recent5.some((entry) => entry.voicePattern === voicePattern.id) ? 0 : 6);

              candidates.push({
                hookId: hook.id,
                ctaId: cta.id,
                titleStructureId: structure.id,
                curveId: selectedCurve?.id,
                argumentModeId: selectedArgumentMode?.id,
                repetitionRuleIds: selectedRepetitionRules.map((item) => item.id),
                blockCount,
                durationMinutes,
                voicePatternId: voicePattern.id,
                voiceSequence: voicePattern.sequence,
                noveltyScore,
              });
            });
          });
        });
      });
    });
  });

  const ranked = (candidates.length > 0 ? candidates : hooks.flatMap((hook) =>
    ctas.flatMap((cta) =>
        structures.flatMap((structure) =>
          blockCounts.flatMap((blockCount) =>
          durations.flatMap((durationMinutes) =>
            VOICE_PATTERNS.map((voicePattern) => ({
              hookId: hook.id,
              ctaId: cta.id,
              titleStructureId: structure.id,
              curveId: selectedCurve?.id,
              argumentModeId: selectedArgumentMode?.id,
              repetitionRuleIds: selectedRepetitionRules.map((item) => item.id),
              blockCount,
              durationMinutes,
              voicePatternId: voicePattern.id,
              voiceSequence: voicePattern.sequence,
              noveltyScore: 0,
            }))
          )
        )
      )
    )
    ))
    .sort((a, b) => b.noveltyScore - a.noveltyScore);

  if (ranked.length === 0) return null;

  const bestScore = ranked[0].noveltyScore;
  const competitivePool = ranked.filter((candidate) => candidate.noveltyScore >= bestScore - 4);
  const differentFromLast = competitivePool.filter((candidate) => candidate.blockCount !== req.projectConfig.lastBlockCount);
  const selectionPool = differentFromLast.length > 0 ? differentFromLast : competitivePool;
  const pickedIndex = Math.floor(Math.random() * selectionPool.length);

  return selectionPool[pickedIndex] || ranked[0] || null;
}

function buildSelectionDiagnostics(req: ShuffleRequest, plan: SelectionPlan): SelectionDiagnostics {
  const recent = (req.controlLog || []).filter(Boolean);
  const recent2 = recent.slice(0, 2);
  const recent3 = recent.slice(0, 3);
  const recent5 = recent.slice(0, 5);
  const recent10 = recent.slice(0, 10);
  const sessionCount = recent10.filter((entry) => entry.source === 'session').length;
  const registeredCount = recent10.filter((entry) => entry.source !== 'session').length;

  return {
    noveltyScore: plan.noveltyScore,
    locked: {
      hookId: plan.hookId,
      ctaId: plan.ctaId,
      titleStructureId: plan.titleStructureId,
      curveId: plan.curveId,
      argumentModeId: plan.argumentModeId,
      repetitionRuleIds: plan.repetitionRuleIds,
      blockCount: plan.blockCount,
      durationMinutes: plan.durationMinutes,
      voicePatternId: plan.voicePatternId,
    },
    blocked: {
      titleStructureIds: req.titleStructures.length > 1
        ? recent3.map((entry) => entry.selectedTitleStructureId).filter(Boolean) as string[]
        : [],
      curveIds: (req.narrativeLibrary.narrativeCurves || []).length > 1
        ? recent3.map((entry) => entry.selectedCurveId).filter(Boolean) as string[]
        : [],
      argumentModeIds: (req.narrativeLibrary.argumentModes || []).length > 1
        ? recent3.map((entry) => entry.selectedArgumentModeId).filter(Boolean) as string[]
        : [],
      repetitionRuleIds: recent5.flatMap((entry) => entry.selectedRepetitionRuleIds || []).filter(Boolean) as string[],
      comboKeys: recent5
        .map((entry) => `${entry.selectedHookId || ''}|${entry.selectedCtaId || ''}|${entry.selectedTitleStructureId || ''}`)
        .filter((value) => value !== '||'),
      blockCounts: req.projectConfig.maxBlocks > req.projectConfig.minBlocks
        ? recent2.map((entry) => Number(entry.blockCount || 0)).filter((value) => Number.isFinite(value) && value > 0)
        : [],
      durationMinutes: req.projectConfig.maxDuration > req.projectConfig.minDuration
        ? recent2.map((entry) => Number(entry.durationMinutes || 0)).filter((value) => Number.isFinite(value) && value > 0)
        : [],
      voicePatternIds: VOICE_PATTERNS.length > 1
        ? recent2.map((entry) => entry.voicePattern).filter(Boolean) as string[]
        : [],
    },
    recentUsage: {
      hookIds: recent10.map((entry) => entry.selectedHookId).filter(Boolean) as string[],
      ctaIds: recent10.map((entry) => entry.selectedCtaId).filter(Boolean) as string[],
      titleStructureIds: recent10.map((entry) => entry.selectedTitleStructureId).filter(Boolean) as string[],
      curveIds: recent10.map((entry) => entry.selectedCurveId).filter(Boolean) as string[],
      argumentModeIds: recent10.map((entry) => entry.selectedArgumentModeId).filter(Boolean) as string[],
      repetitionRuleIds: recent10.flatMap((entry) => entry.selectedRepetitionRuleIds || []).filter(Boolean) as string[],
      blockCounts: recent10
        .map((entry) => Number(entry.blockCount || 0))
        .filter((value) => Number.isFinite(value) && value > 0),
      durationMinutes: recent10
        .map((entry) => Number(entry.durationMinutes || 0))
        .filter((value) => Number.isFinite(value) && value > 0),
      voicePatternIds: recent10.map((entry) => entry.voicePattern).filter(Boolean) as string[],
      sourceBreakdown: {
        session: sessionCount,
        registered: registeredCount,
      },
    },
  };
}

function enforceShufflePlan(
  responseData: Record<string, unknown>,
  req: ShuffleRequest,
  plan: SelectionPlan
) {
  const diagnostics = buildSelectionDiagnostics(req, plan);
  const blocksInput = Array.isArray(responseData.blocks) ? responseData.blocks : [];
  const totalChars = Number(responseData.estimatedChars || 0) || (plan.durationMinutes * 1200);
  const hookChars = Math.floor(totalChars * 0.08);
  const ctaChars = Math.floor(totalChars * 0.06);
  const bodyChars = totalChars - hookChars - ctaChars;
  const charsPerBlock = Math.max(400, Math.floor(bodyChars / Math.max(plan.blockCount, 1)));
  const communityElements = req.narrativeLibrary.communityElements || [];
  const metaphorPool = req.metaphorLibrary.length > 0
    ? req.metaphorLibrary
    : req.titleStructures.map((item) => item.name);

  const blocks = [...blocksInput]
    .slice(0, plan.blockCount)
    .map((block: Record<string, unknown>, index: number) => ({
      ...block,
      name: block?.name || metaphorPool[index % Math.max(metaphorPool.length, 1)] || `Bloco ${index + 1}`,
      missionNarrative: block?.missionNarrative || `Desenvolva o tema "${req.theme}" a partir do repertorio do projeto.`,
      voiceStyle: plan.voiceSequence[index % plan.voiceSequence.length],
      blockChars: Number(block?.blockChars || 0) > 0 ? Number(block.blockChars) : charsPerBlock,
      isNarrativeTwist: index === Math.floor(plan.blockCount / 2),
      bridgeInstruction: index < plan.blockCount - 1 ? (block?.bridgeInstruction || 'Conecte este bloco ao proximo com uma tensao clara.') : undefined,
      communityElement: block?.communityElement || (
        communityElements.length > 0 && index % 2 === 1
          ? communityElements[index % communityElements.length]?.content_pattern || communityElements[index % communityElements.length]?.name
          : undefined
      ),
    }));

  while (blocks.length < plan.blockCount) {
    const index = blocks.length;
    blocks.push({
      name: metaphorPool[index % Math.max(metaphorPool.length, 1)] || `Bloco ${index + 1}`,
      missionNarrative: `Aprofunde o tema "${req.theme}" com um avanço narrativo coerente com a estrutura escolhida.`,
      voiceStyle: plan.voiceSequence[index % plan.voiceSequence.length],
      blockChars: charsPerBlock,
      isNarrativeTwist: index === Math.floor(plan.blockCount / 2),
      bridgeInstruction: index < plan.blockCount - 1 ? 'Conecte este bloco ao proximo com uma tensao clara.' : undefined,
      communityElement: communityElements.length > 0 && index % 2 === 1
        ? communityElements[index % communityElements.length]?.content_pattern || communityElements[index % communityElements.length]?.name
        : undefined,
    });
  }

  return {
    ...responseData,
    selectedHookId: plan.hookId,
    selectedCtaId: plan.ctaId,
    selectedTitleStructureId: plan.titleStructureId,
    selectedCurveId: plan.curveId,
    selectedArgumentModeId: plan.argumentModeId,
    selectedRepetitionRuleIds: plan.repetitionRuleIds,
    blockCount: plan.blockCount,
    estimatedDurationMinutes: plan.durationMinutes,
    dominantVoice: plan.voiceSequence[0],
    blocks,
    voicePattern: plan.voicePatternId,
    diagnostics,
  };
}


// â”€â”€â”€ Local Fallback (algorithmic) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function localShuffleFallback(req: ShuffleRequest) {
  const { theme, projectConfig, narrativeLibrary, metaphorLibrary, titleStructures, controlLog } = req;
  const ctas  = narrativeLibrary.ctas;
  const structures = titleStructures || [];
  const plan = buildSelectionPlan(req);

  if (!plan) {
    throw new Error('Nao foi possivel montar um plano estrutural valido para o projeto ativo.');
  }

  const totalMinutes = plan.durationMinutes;
  const diagnostics = buildSelectionDiagnostics(req, plan);

  const totalChars    = totalMinutes * 1200;
  const hookChars     = Math.floor(totalChars * 0.08);   // ~8%
  const ctaFinalChars = Math.floor(totalChars * 0.06);   // ~6%
  const bodyTotal     = totalChars - hookChars - ctaFinalChars;
  const charsPerBlock = Math.floor(bodyTotal / Math.max(plan.blockCount, 1));
  const midCtaPosition = Math.floor(plan.blockCount / 2);

  const missionMap: Record<string, string[]> = {
    'Desafio Direto': [
      'Provocar aÃ§Ã£o imediata â€” confrontar a crenÃ§a limitante do espectador.',
      'Challenger Frame â€” expor o que o espectador estÃ¡ fazendo errado.',
      'Autoridade agressiva â€” posicionar a autoridade do criador com desafio direto.',
    ],
    'Vulnerabilidade': [
      'Storytelling pessoal â€” compartilhar falha ou aprendizado do criador.',
      'Espelho emocional â€” fazer o espectador se sentir visto e compreendido.',
      'Jornada de herÃ³i â€” como o criador passou pelo mesmo problema.',
    ],
    'DiagnÃ³stico TÃ©cnico': [
      'AnÃ¡lise de dados â€” apresentar evidÃªncias e nÃºmeros para validar o ponto.',
      'Framework sistÃªmico â€” decompor o problema em componentes tÃ©cnicos.',
      'DiagnÃ³stico de mercado â€” o que a maioria faz errado e por quÃª.',
    ],
  };

  const metaphorPool = metaphorLibrary.length > 0 ? metaphorLibrary : structures.map(t => t.name);
  const shuffled = [...metaphorPool].sort(() => Math.random() - 0.5);

  const communityElements = req.narrativeLibrary.communityElements || [];
  const twistIndex = Math.floor(plan.blockCount / 2);
  const bridges = [
    'Prepare-se, pois o prÃ³ximo bloco vai inverter tudo o que vocÃª acabou de ver.',
    'E essa Ã© apenas a metade da equaÃ§Ã£o â€” o que vem a seguir Ã© onde a maioria erra.',
    'Mas o problema real vai alÃ©m disso â€” e vou te mostrar exatamente onde.',
    'Isso muda tudo quando vocÃª entende o que vem na prÃ³xima parte.',
    'A virada real comeÃ§a agora â€” presta atenÃ§Ã£o no que vem a seguir.',
  ];

  const dominantVoice = plan.voiceSequence[0] as string;

  const blocks = Array.from({ length: plan.blockCount }, (_, i) => {
    const voiceKey = plan.voiceSequence[i % plan.voiceSequence.length] as keyof typeof missionMap;
    const missions    = missionMap[voiceKey];
    const metaphorName = shuffled.length > 0 ? shuffled[i % shuffled.length] : `Bloco ${i + 1}`;
    const communityEl  = communityElements.length > 0 && i % 2 === 1
      ? communityElements[i % communityElements.length]?.content_pattern || undefined
      : undefined;
    return {
      name: metaphorName,
      missionNarrative: missions[Math.floor(Math.random() * missions.length)],
      voiceStyle: voiceKey,
      isNarrativeTwist: i === twistIndex,
      blockChars: charsPerBlock,
      bridgeInstruction: i < plan.blockCount - 1 ? bridges[i % bridges.length] : undefined,
      communityElement: communityEl,
    };
  });

  // Mid-CTA: pick a different CTA than the final one
  const recentCtaIds = controlLog.map((entry) => entry.selectedCtaId).filter(Boolean) as string[];
  const midCtaEl = pickLeastUsedDifferent(ctas, recentCtaIds, plan.ctaId);

  return {
    title: theme,
    selectedHookId: plan.hookId,
    selectedCtaId:  plan.ctaId,
    selectedTitleStructureId: plan.titleStructureId,
    selectedCurveId: plan.curveId,
    selectedArgumentModeId: plan.argumentModeId,
    selectedRepetitionRuleIds: plan.repetitionRuleIds,
    midCta: midCtaEl ? { id: midCtaEl.id, position: midCtaPosition } : undefined,
    blockCount: plan.blockCount,
    estimatedDurationMinutes: totalMinutes,
    estimatedChars: totalChars,
    hookChars,
    ctaChars: ctaFinalChars,
    dominantVoice,
    blocks,
    voicePattern: plan.voicePatternId,
    noveltyScore: plan.noveltyScore,
    diagnostics,
    isFallback: true,
    fallbackReason: 'no_key' as const,
  };
}

// â”€â”€â”€ AI Prompt Builder (V15 â€” Total Intelligence) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function buildShufflePrompt(req: ShuffleRequest, plan: SelectionPlan): string {
  const { theme, projectConfig, narrativeLibrary, metaphorLibrary, titleStructures, controlLog } = req;
  const { minDuration, maxDuration, targetChars } = projectConfig;

  // Use center of duration range for char budget calculation
  const midDuration        = Math.round((minDuration + maxDuration) / 2);
  const computedTargetChars = targetChars || (midDuration * 1200);
  const hookChars           = Math.floor(computedTargetChars * 0.08);
  const ctaChars            = Math.floor(computedTargetChars * 0.06);
  const bodyCharsTotal      = computedTargetChars - hookChars - ctaChars;

  const hooksStr     = narrativeLibrary.hooks.map(h => `- [${h.id}] ${h.name}: "${h.content_pattern || ''}"`).join('\n');
  const allCtas      = narrativeLibrary.ctas;
  const ctasStr      = allCtas.map(c => `- [${c.id}] ${c.name}${c.is_soft ? ' [SOFT/INTERMEDIÃRIA]' : ' [HARD/FINAL]'}: "${c.content_pattern || ''}"`).join('\n');
  const communityStr = (narrativeLibrary.communityElements || []).map(e => `- [${e.id}] "${e.content_pattern || e.name}"`).join('\n') || 'Nenhum cadastrado ainda.';
  const narrativeCurvesStr = (narrativeLibrary.narrativeCurves || []).map(item => `- [${item.id}] ${item.name}${item.category ? ` [${item.category}]` : ''}: "${item.content_pattern || item.description || ''}"`).join('\n') || 'Nenhuma curva cadastrada ainda.';
  const argumentModesStr = (narrativeLibrary.argumentModes || []).map(item => `- [${item.id}] ${item.name}${item.category ? ` [${item.category}]` : ''}: "${item.content_pattern || item.description || ''}"`).join('\n') || 'Nenhum modo cadastrado ainda.';
  const repetitionRulesStr = (narrativeLibrary.repetitionRules || []).map(item => `- [${item.id}] ${item.name}${item.category ? ` [${item.category}]` : ''}: "${item.content_pattern || item.description || ''}"`).join('\n') || 'Nenhuma regra cadastrada ainda.';
  const titleStructuresStr = titleStructures.map(t => '- [' + t.id + '] ' + t.name + ': "' + (t.content_pattern || '') + '"').join('\n') || 'Nenhuma estrutura cadastrada ainda.';
  const pureMetaphorsStr = metaphorLibrary.join(', ') || 'Não há metáforas cadastradas.';
  const metaphorsStr = pureMetaphorsStr;

  const lastHookId = controlLog[0]?.selectedHookId || 'none';
  const lastCtaId  = controlLog[0]?.selectedCtaId  || 'none';
  const lastTitleStructureId = controlLog[0]?.selectedTitleStructureId || 'none';
  const lastCount  = controlLog[0]?.blockCount     || 0;

  return `You are the STRATEGIC NARRATIVE ARCHITECT V15 â€” TOTAL INTELLIGENCE. Produce a modular video briefing with mathematical precision, traceable brand identity, and absolute narrative flow.

THEME: "${theme}"

PROJECT_CONFIG (âš ï¸ ALL values are MANDATORY â€” ignoring them makes the output invalid):
- Body block count: MUST be exactly ${plan.blockCount}. The "blocks" array in your JSON MUST contain exactly ${plan.blockCount} items.
- Duration: MUST be an integer between ${minDuration} and ${maxDuration} minutes. DO NOT output a value outside this range.
- Target total characters: ${computedTargetChars} chars
  â€¢ Hook: ~${hookChars} chars (dense, short)
  â€¢ CTA Final: ~${ctaChars} chars (concise conversion)
  â€¢ Body blocks budget: ${bodyCharsTotal} chars total (distribute proportionally, central blocks heavier)
  â€¢ VALIDATION: sum of all blockChars + hookChars + ctaChars must equal ${computedTargetChars}

NARRATIVE_LIBRARY â€” HOOKS (avoid last used: ${lastHookId}):
${hooksStr}

NARRATIVE_LIBRARY â€” CTAs (pick 1 SOFT/INTERMEDIÃRIA for mid + 1 HARD/FINAL for closing; avoid last: ${lastCtaId}):
${ctasStr}

ELEMENTOS DE COMUNIDADE (inject 2â€“3 organically into development blocks; display their ID for traceability):
${communityStr}

ASSET_LIBRARY â€” Metaphors & Concepts (use as ATOMIC block titles, max 8 words each):
${metaphorsStr}

TITLE_STRUCTURES â€” Use these only to frame the title pattern for the current project:
${titleStructuresStr}

WRITING_LIBRARY â€” Narrative Curves:
${narrativeCurvesStr}

WRITING_LIBRARY â€” Argument Modes:
${argumentModesStr}

WRITING_LIBRARY â€” Repetition Rules:
${repetitionRulesStr}

LOCKED_SELECTION (non-negotiable):
- Hook ID: ${plan.hookId}
- CTA Final ID: ${plan.ctaId}
- Title Structure ID: ${plan.titleStructureId}
- Narrative Curve ID: ${plan.curveId || 'none'}
- Argument Mode ID: ${plan.argumentModeId || 'none'}
- Repetition Rule IDs: ${plan.repetitionRuleIds.join(', ') || 'none'}
- Voice Pattern ID: ${plan.voicePatternId}
- Voice rotation for body blocks: ${plan.voiceSequence.join(' -> ')}
- Novelty score target: ${plan.noveltyScore}

COMPOSITION PROTOCOL (V15 â€” TOTAL INTELLIGENCE):
1. MATHEMATICAL SYNC: Total chars across all blocks (hook + body + ctaFinal) = ${computedTargetChars}. No exceptions.
2. WEIGHT DISTRIBUTION: Hook & CTA Final = short/dense. Central body blocks carry more theoretical weight.
3. ATOMICITY: Block names = metaphor/concept ONLY (no theme prefix). Max 8 words.
4. VOICE ALTERNATION: Strict cycle â€” 'Desafio Direto' (2nd person), 'Vulnerabilidade' (1st person), 'DiagnÃ³stico TÃ©cnico' (3rd person). Never repeat consecutively.
5. NARRATIVE TWIST: Exactly 1 central block marked isNarrativeTwist:true â€” must reveal a counter-intuitive truth.
6. THE BRIDGE: Each block (except the last) MUST have a bridgeInstruction â€” a 1-sentence transition that plants a mental hook for the next block.
7. COMMUNITY IDENTITY: Inject 2â€“3 community elements into development blocks as communityElement (include their ID).
8. MULTI-CTA FLOW: 1 SOFT mid-CTA (engagement) + 1 HARD final-CTA (conversion).
9. EXCLUSIVITY: Asset sequence must differ from previous composition logs.
10. MACRO ORCHESTRATION: if a Narrative Curve is locked, use it as the macro progression of the body blocks.
11. ARGUMENT POSTURE: if an Argument Mode is locked, adopt it as the dominant persuasion posture without flattening the text.
12. REPETITION LIMITS: if Repetition Rules are locked, treat them as hard constraints and avoid recurring formulations.

PREVIOUS_LOGS:
- Last hook: ${lastHookId} | Last CTA: ${lastCtaId} | Last title structure: ${lastTitleStructureId} | Last block count: ${lastCount}

Respond ONLY with raw JSON (no markdown fences):
{
  "title": "<theme unchanged>",
  "selectedHookId": "${plan.hookId}",
  "selectedHookChars": ${hookChars},
  "selectedCtaId": "${plan.ctaId}",
  "selectedTitleStructureId": "${plan.titleStructureId}",
  "selectedCurveId": "${plan.curveId || ''}",
  "selectedArgumentModeId": "${plan.argumentModeId || ''}",
  "selectedRepetitionRuleIds": ${JSON.stringify(plan.repetitionRuleIds)},
  "ctaFinalChars": ${ctaChars},
  "midCta": {
    "id": "<SOFT CTA id>",
    "position": <insert after this body block index (0-based)>
  },
  "blockCount": ${plan.blockCount},
  "estimatedDurationMinutes": <integer STRICTLY between ${minDuration} and ${maxDuration} inclusive â€” MANDATORY>,
  "estimatedChars": ${computedTargetChars},
  "dominantVoice": "${plan.voiceSequence[0]}",
  "voicePattern": "${plan.voicePatternId}",
  "blocks": [
    {
      "name": "<atomic metaphor title, max 8 words>",
      "missionNarrative": "<active direction command for scriptwriter, 1â€“2 sentences>",
      "voiceStyle": "<'Desafio Direto' | 'Vulnerabilidade' | 'DiagnÃ³stico TÃ©cnico'>",
      "isNarrativeTwist": <true|false>,
      "blockChars": <integer â€” proportional to body budget>,
      "bridgeInstruction": "<transition sentence (omit for last block)>",
      "communityElement": "<community phrase string or null>",
      "communityElementId": "<community element id or null>"
    }
  ]
}`;
}

// â”€â”€â”€ Route Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function POST(req: NextRequest) {
  try {
    const body: ShuffleRequest = await req.json();
    const { engine, model, apiKey } = body;
    const selectionPlan = buildSelectionPlan(body);

    if (!body.theme || !body.narrativeLibrary) {
      return NextResponse.json({ error: 'theme and narrativeLibrary are required' }, { status: 400 });
    }

    if (!selectionPlan) {
      return NextResponse.json({ error: 'Nao foi possivel selecionar uma composicao valida para o projeto ativo.' }, { status: 400 });
    }

    // Resolve API key
    let resolvedKey = '';
    if (engine === 'openai') resolvedKey = apiKey || process.env.OPENAI_API_KEY || '';
    else if (engine === 'gemini') resolvedKey = apiKey || process.env.GEMINI_API_KEY || '';

    // No key â†’ local fallback
    if (!resolvedKey || resolvedKey === 'sua_chave_aqui') {
      const fallback = localShuffleFallback(body);
      return NextResponse.json({ ...fallback, isFallback: true, fallbackReason: 'no_key' }, { status: 200 });
    }

    const prompt   = buildShufflePrompt(body, selectionPlan);
    const apiModel = resolveModel(model || 'gemini-2.0-flash');

    let responseData: Record<string, unknown>;

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
      const requestBody: Record<string, unknown> = {
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

    // Enrich with estimatedChars â€” use AI value, or calculate from returned minutes, or random within range
  const { minDuration, maxDuration } = body.projectConfig;
  const aiMinutes = responseData.estimatedDurationMinutes;
  const plannedMinutes = selectionPlan.durationMinutes;
  const finalMinutes = plannedMinutes;
    const estimatedChars = responseData.estimatedChars || (finalMinutes * 1200);

    const enforcedResponse = enforceShufflePlan(responseData, body, selectionPlan);

    return NextResponse.json({
      ...enforcedResponse,
      estimatedDurationMinutes: finalMinutes,
      estimatedChars,
      isFallback: false,
    });
  } catch (error: unknown) {
    console.error('[Shuffle V15 API Error]', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}


