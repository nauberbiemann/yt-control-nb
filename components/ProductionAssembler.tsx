'use client';

import { useState, useEffect } from 'react';
import { useActiveProject } from '@/lib/store/projectStore';
import { fetchLastCompositions } from '@/lib/supabase-mutations';
import {
  ShieldCheck,
  Shuffle,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Sparkles,
  ChevronRight,
  RotateCcw,
  Zap,
  Target,
  Copy,
  ArrowRight,
  Info,
  BookOpen,
  Mic,
  TrendingUp,
} from 'lucide-react';

// ─── TYPES ───────────────────────────────────────────────────────────────────

interface GatekeeperResult {
  matchScore: number;
  isValid: boolean;
  pivotSuggestion: string;
  refactoredTheme: string;
  reasoning?: string;
  isFallback: boolean;
  fallbackReason?: 'no_key' | 'parse_error';
}

interface AssemblerBlock {
  id: string;
  name: string;
  missionNarrative: string;
  voiceStyle: 'Desafio Direto' | 'Vulnerabilidade' | 'Diagnóstico Técnico';
  assetId?: string;
  type: 'Hook' | 'Metaphor' | 'CTA';
  isNarrativeTwist?: boolean;
  // V14 Intelligence Sync
  blockChars?: number;         // estimated character count for this block
  bridgeInstruction?: string;  // transition hint to next block
  communityElement?: string;   // organic community phrase injected
  isMidCta?: boolean;          // marks the intermediate CTA slot
  tensionLevel?: 'Baixa' | 'Media' | 'Alta';
  narrativeRole?: 'Ruptura' | 'Espelho' | 'Diagnostico' | 'Virada' | 'Aplicacao' | 'Fechamento';
  transitionMode?: 'Contraste' | 'Aprofundamento' | 'Consequencia' | 'Alivio' | 'Convocacao';
}

interface ProductionBriefing {
  title: string;
  estimatedDuration: string;
  estimatedChars: number;
  hookChars?: number;
  ctaChars?: number;
  blockCount: number;
  dominantVoice: string;
  diagnostics?: {
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
      sourceBreakdown?: {
        session: number;
        registered: number;
      };
    };
  };
  openingHook: { id: string; name: string; pattern: string };
  selectedCta: { id: string; name: string; pattern: string };
  selectedTitleStructure?: { id: string; name: string; pattern: string };
  selectedNarrativeCurve?: { id: string; name: string; pattern: string; behaviorFlag?: string };
  selectedArgumentMode?: { id: string; name: string; pattern: string; behaviorFlag?: string };
  selectedRepetitionRules?: Array<{ id: string; name: string; pattern: string; behaviorFlag?: string }>;
  // V14: mid CTA positioned between central blocks
  midCta?: { id: string; name: string; pattern: string; position: number };
  blocks: AssemblerBlock[];
  compositionLogId: string;
  historySourceLabel?: string;
  historyChoiceReason?: string;
  // V14: asset traceability log
  assetLog?: Record<string, string>; // { assetType: assetId }
}

interface ProductionAssemblerProps {
  components: any[]; // from NarrativeLibrary
  componentsHydrated?: boolean;
  onApprove: (briefing: ProductionBriefing, theme: string) => void;
}

// ─── SHUFFLE ENGINE (CLIENT-SIDE) ────────────────────────────────────────────

const VOICE_STYLES: AssemblerBlock['voiceStyle'][] = [
  'Desafio Direto',
  'Vulnerabilidade',
  'Diagnóstico Técnico',
];

const VOICE_MISSION_MAP: Record<AssemblerBlock['voiceStyle'], string[]> = {
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

function shuffleArray<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

const componentSignature = (item: any) => [
  item?.type || '',
  item?.name || '',
  item?.description || '',
  item?.content_pattern || '',
  item?.category || '',
].join('|').toLowerCase().replace(/\s+/g, ' ').trim();

const dedupeNarrativeComponents = (items: any[]) => {
  const merged = new Map<string, any>();
  items.forEach((item) => {
    const key = componentSignature(item);
    if (!merged.has(key)) merged.set(key, item);
  });
  return Array.from(merged.values());
};


// ─── COMPONENTS ──────────────────────────────────────────────────────────────

const SCORE_COLOR = (score: number) => {
  if (score >= 70) return { text: 'text-green-400', bg: 'bg-green-400', border: 'border-green-400/30', badge: 'bg-green-400/10 text-green-400 border-green-400/30' };
  if (score >= 40) return { text: 'text-yellow-400', bg: 'bg-yellow-400', border: 'border-yellow-400/30', badge: 'bg-yellow-400/10 text-yellow-400 border-yellow-400/30' };
  return { text: 'text-red-400', bg: 'bg-red-400', border: 'border-red-400/30', badge: 'bg-red-400/10 text-red-400 border-red-400/30' };
};

const VOICE_ICON: Record<string, any> = {
  'Desafio Direto': Zap,
  'Vulnerabilidade': Mic,
  'Diagnóstico Técnico': TrendingUp,
};

const VOICE_COLOR: Record<string, string> = {
  'Desafio Direto': 'text-orange-400 border-orange-400/20 bg-orange-400/5',
  'Vulnerabilidade': 'text-purple-400 border-purple-400/20 bg-purple-400/5',
  'Diagnóstico Técnico': 'text-blue-400 border-blue-400/20 bg-blue-400/5',
};

const formatVoicePatternLabel = (patternId?: string) => {
  if (!patternId) return 'Padrao livre';
  return patternId
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
};

const formatDurationLabel = (minutes?: number) => {
  if (!minutes || minutes <= 0) return 'Nao definida';
  return `~${minutes} min`;
};

const getNarrativeTensionMap = (
  index: number,
  total: number,
  voiceStyle: AssemblerBlock['voiceStyle'],
  isNarrativeTwist?: boolean
): Pick<AssemblerBlock, 'tensionLevel' | 'narrativeRole' | 'transitionMode'> => {
  if (isNarrativeTwist) {
    return {
      tensionLevel: 'Alta',
      narrativeRole: 'Virada',
      transitionMode: 'Contraste',
    };
  }

  if (index === 0) {
    return {
      tensionLevel: 'Alta',
      narrativeRole: voiceStyle === 'Vulnerabilidade' ? 'Espelho' : 'Ruptura',
      transitionMode: 'Contraste',
    };
  }

  if (index === total - 1) {
    return {
      tensionLevel: 'Media',
      narrativeRole: 'Fechamento',
      transitionMode: 'Convocacao',
    };
  }

  if (index >= Math.max(total - 2, 1)) {
    return {
      tensionLevel: 'Media',
      narrativeRole: 'Aplicacao',
      transitionMode: 'Consequencia',
    };
  }

  if (voiceStyle === 'Vulnerabilidade') {
    return {
      tensionLevel: 'Media',
      narrativeRole: 'Espelho',
      transitionMode: 'Aprofundamento',
    };
  }

  if (voiceStyle === 'Diagnóstico Técnico') {
    return {
      tensionLevel: 'Media',
      narrativeRole: 'Diagnostico',
      transitionMode: 'Consequencia',
    };
  }

  return {
    tensionLevel: 'Alta',
    narrativeRole: 'Ruptura',
    transitionMode: 'Aprofundamento',
  };
};

const normalizeSignal = (value?: string) =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

const getAdvancedNarrativeTensionMap = ({
  index,
  total,
  voiceStyle,
  voicePatternId,
  themeText,
  blockName,
  missionNarrative,
  isNarrativeTwist,
}: {
  index: number;
  total: number;
  voiceStyle: AssemblerBlock['voiceStyle'];
  voicePatternId?: string;
  themeText?: string;
  blockName?: string;
  missionNarrative?: string;
  isNarrativeTwist?: boolean;
}): Pick<AssemblerBlock, 'tensionLevel' | 'narrativeRole' | 'transitionMode'> => {
  const baseMap = getNarrativeTensionMap(index, total, voiceStyle, isNarrativeTwist);
  const themeSignal = normalizeSignal(themeText);
  const blockSignal = normalizeSignal(`${blockName || ''} ${missionNarrative || ''}`);
  const patternSignal = normalizeSignal(voicePatternId);

  const isChallengeTheme = /(erro|falha|choque|crash|vicio|burnout|vazamento|leak|queda|perda|throttling|divida|ego|panic)/.test(themeSignal);
  const isTransformationTheme = /(refator|rebuild|reconstr|patch|plano|melhor|otimiz|implement|rotina|sistema|build|protocolo|firewall)/.test(themeSignal);
  const isDiagnosticBlock = /(diagnost|framework|analise|sintoma|evidenc|medida|mape|causa)/.test(blockSignal);
  const isMirrorBlock = /(vulnerab|historia|confiss|falha|espelho|cansa|dor|relato|depoimento)/.test(blockSignal);
  const isActionBlock = /(aplic|pratica|checklist|passo|implement|protocolo|acao|plano|execuc|deploy)/.test(blockSignal);
  const challengeFirst = patternSignal.includes('challenge-first');
  const vulnerabilityFirst = patternSignal.includes('vulnerability-first');
  const diagnosticFirst = patternSignal.includes('diagnostic-first');

  if (isNarrativeTwist) {
    return {
      tensionLevel: 'Alta',
      narrativeRole: 'Virada',
      transitionMode: isTransformationTheme ? 'Consequencia' : 'Contraste',
    };
  }

  if (index === 0) {
    if (vulnerabilityFirst || voiceStyle === 'Vulnerabilidade') {
      return {
        tensionLevel: 'Media',
        narrativeRole: 'Espelho',
        transitionMode: 'Aprofundamento',
      };
    }

    if (diagnosticFirst || isDiagnosticBlock) {
      return {
        tensionLevel: 'Media',
        narrativeRole: 'Diagnostico',
        transitionMode: 'Consequencia',
      };
    }

    return {
      tensionLevel: isChallengeTheme ? 'Alta' : baseMap.tensionLevel,
      narrativeRole: 'Ruptura',
      transitionMode: 'Contraste',
    };
  }

  if (index === total - 1) {
    return {
      tensionLevel: isTransformationTheme ? 'Media' : 'Baixa',
      narrativeRole: 'Fechamento',
      transitionMode: 'Convocacao',
    };
  }

  if (index >= Math.max(total - 2, 1) || isActionBlock) {
    return {
      tensionLevel: isTransformationTheme ? 'Media' : 'Baixa',
      narrativeRole: 'Aplicacao',
      transitionMode: 'Consequencia',
    };
  }

  if (isMirrorBlock || voiceStyle === 'Vulnerabilidade') {
    return {
      tensionLevel: isChallengeTheme ? 'Media' : 'Baixa',
      narrativeRole: 'Espelho',
      transitionMode: 'Aprofundamento',
    };
  }

  if (isDiagnosticBlock || voiceStyle === 'Diagnóstico Técnico') {
    return {
      tensionLevel: challengeFirst || isChallengeTheme ? 'Media' : 'Baixa',
      narrativeRole: 'Diagnostico',
      transitionMode: 'Consequencia',
    };
  }

  return {
    tensionLevel: challengeFirst ? 'Alta' : baseMap.tensionLevel,
    narrativeRole: isTransformationTheme ? 'Aplicacao' : baseMap.narrativeRole,
    transitionMode: isTransformationTheme ? 'Consequencia' : baseMap.transitionMode,
  };
};

const getNarrativeCharWeight = (block: Pick<AssemblerBlock, 'tensionLevel' | 'narrativeRole'>) => {
  const roleWeightMap: Record<string, number> = {
    Ruptura: 0.82,
    Espelho: 0.98,
    Diagnostico: 1.12,
    Virada: 0.94,
    Aplicacao: 1.28,
    Fechamento: 0.86,
  };

  const tensionWeightMap: Record<string, number> = {
    Alta: 0.9,
    Media: 1,
    Baixa: 1.08,
  };

  const roleWeight = roleWeightMap[block.narrativeRole || 'Diagnostico'] || 1;
  const tensionWeight = tensionWeightMap[block.tensionLevel || 'Media'] || 1;
  return roleWeight * tensionWeight;
};

const redistributeBlockCharsByNarrativeMap = (blocks: AssemblerBlock[], totalBodyChars: number) => {
  if (!blocks.length || totalBodyChars <= 0) return blocks;

  const minCharsPerBlock = 320;
  const safeTotal = Math.max(totalBodyChars, minCharsPerBlock * blocks.length);
  const weights = blocks.map((block) => getNarrativeCharWeight(block));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || blocks.length;

  const provisional = blocks.map((block, index) => {
    const exact = (safeTotal * weights[index]) / totalWeight;
    const floored = Math.max(minCharsPerBlock, Math.floor(exact));
    return {
      block,
      index,
      exact,
      chars: floored,
      remainder: exact - Math.floor(exact),
    };
  });

  let assigned = provisional.reduce((sum, item) => sum + item.chars, 0);

  if (assigned < safeTotal) {
    const sortedUp = [...provisional].sort((a, b) => b.remainder - a.remainder);
    let cursor = 0;
    while (assigned < safeTotal) {
      sortedUp[cursor % sortedUp.length].chars += 1;
      assigned += 1;
      cursor += 1;
    }
  } else if (assigned > safeTotal) {
    const sortedDown = [...provisional].sort((a, b) => a.remainder - b.remainder);
    let cursor = 0;
    while (assigned > safeTotal && sortedDown.length > 0) {
      const candidate = sortedDown[cursor % sortedDown.length];
      if (candidate.chars > minCharsPerBlock) {
        candidate.chars -= 1;
        assigned -= 1;
      }
      cursor += 1;
      if (cursor > safeTotal * 2) break;
    }
  }

  const finalByIndex = provisional.sort((a, b) => a.index - b.index);
  return finalByIndex.map(({ block, chars }) => ({
    ...block,
    blockChars: chars,
  }));
};

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ProductionAssembler({ components, componentsHydrated = true, onApprove }: ProductionAssemblerProps) {
  const activeProject = useActiveProject();

  const [theme, setTheme] = useState('');
  const [useRefactored, setUseRefactored] = useState(false);
  const [editingRefactored, setEditingRefactored] = useState(false);
  const [editedRefactoredTheme, setEditedRefactoredTheme] = useState('');
  const [phase, setPhase] = useState<'input' | 'gatekeeper' | 'shuffle' | 'briefing'>('input');
  const [gatekeeperResult, setGatekeeperResult] = useState<GatekeeperResult | null>(null);
  const [briefing, setBriefing] = useState<ProductionBriefing | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const uniqueComponents = dedupeNarrativeComponents(components);
  const hooks = uniqueComponents.filter(c => c.type === 'Hook');
  const ctas = uniqueComponents.filter(c => c.type === 'CTA');
  const titleStructures = uniqueComponents.filter(c => c.type === 'Title Structure');
  const communityItems  = uniqueComponents.filter(c => c.type === 'Community');
  const narrativeCurves = uniqueComponents.filter(c => c.type === 'Narrative Curve');
  const argumentModes = uniqueComponents.filter(c => c.type === 'Argument Mode');
  const repetitionRules = uniqueComponents.filter(c => c.type === 'Repetition Rule');
  const narrativeLibraryReady = componentsHydrated;
  const hasMinimumNarrativeAssets = hooks.length > 0 && ctas.length > 0;
  const libraryStatusMessage = !narrativeLibraryReady
    ? 'Carregando a Biblioteca Narrativa do projeto ativo. Aguarde um instante antes de montar a estrutura.'
    : !hasMinimumNarrativeAssets
      ? 'Biblioteca Narrativa sem ativos minimos. Adicione Hooks e CTAs antes de montar a estrutura.'
      : 'Biblioteca detectada. O Gatekeeper vai validar estrategicamente o seu tema antes do shuffle.';

  const projectMetaphors = (activeProject?.metaphor_library || '')
    .split(',').map((s: string) => s.trim()).filter(Boolean);

  const hasApiKey = !!(
    (activeProject?.ai_engine_rules?.engine === 'openai' && (activeProject?.ai_engine_rules?.openai_key || process.env.NEXT_PUBLIC_OPENAI_KEY)) ||
    (activeProject?.ai_engine_rules?.engine === 'gemini') // key is server-side
  );

  const runGatekeeper = async () => {
    if (!theme.trim()) return;
    setLoading(true);
    setError('');
    setPhase('gatekeeper');

    try {
      // Read engine/model from the same localStorage keys used by EngineSelector in the header
      const engine = (typeof window !== 'undefined' ? localStorage.getItem('yt_active_engine') : null) || 'openai';
      const model = (typeof window !== 'undefined' ? localStorage.getItem('yt_selected_model') : null) || 'gpt-4o-mini';
      const apiKey = engine === 'openai'
        ? (typeof window !== 'undefined' ? localStorage.getItem('yt_openai_key') || '' : '')
        : (typeof window !== 'undefined' ? localStorage.getItem('yt_gemini_key') || '' : '');

      const res = await fetch('/api/assembler/gatekeeper', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme,
          projectDNA: {
            puc: activeProject?.puc,
            persona: activeProject?.persona_matrix,
            niche: activeProject?.niche,
            pillars: activeProject?.editorial_pillars,
          },
          engine,
          model,
          apiKey,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Falha ao processar pelo modelo IA (Gatekeeper).');
      }
      setGatekeeperResult(data);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Erro ao conectar ao Gatekeeper.');
      setPhase('input');
    } finally {
      setLoading(false);
    }
  };

  const runShuffle = async () => {
    setLoading(true);
    setPhase('shuffle');
    setError('');

    try {
      const chosenTheme = (useRefactored && gatekeeperResult?.refactoredTheme)
        ? gatekeeperResult.refactoredTheme
        : theme;

      // Control log with timeout
      const previousComps = await Promise.race([
        fetchLastCompositions(activeProject?.id || '', 10),
        new Promise<any[]>(resolve => setTimeout(() => resolve([]), 4000))
      ]);
      const inMemoryComp = briefing ? [{
        selectedHookId: briefing.openingHook?.id,
        selectedCtaId: briefing.selectedCta?.id,
        selectedTitleStructureId: briefing.selectedTitleStructure?.id,
        selectedCurveId: briefing.selectedNarrativeCurve?.id,
        selectedArgumentModeId: briefing.selectedArgumentMode?.id,
        selectedRepetitionRuleIds: briefing.selectedRepetitionRules?.map((item) => item.id) || [],
        blockCount: briefing.blockCount,
        durationMinutes: Number((briefing.estimatedDuration || '').match(/\d+/)?.[0] || 0) || undefined,
        voicePattern: briefing.diagnostics?.locked?.voicePatternId,
        source: 'session' as const,
        created_at: new Date().toISOString(),
      }] : [];
      const controlHistory = [...inMemoryComp, ...previousComps];

      // Parse SOP ranges — handles formats: '4-7', '8-13', '12+', '18', '18-22'
      const sopRaw = activeProject?.editing_sop || {};
      const parseRange = (s: string | undefined, fa: number, fb: number): [number, number] => {
        if (!s) return [fa, fb];
        const str = String(s).trim();
        // Handle '12+' notation → [12, 12+4]
        if (str.endsWith('+')) {
          const n = parseInt(str, 10);
          return isNaN(n) ? [fa, fb] : [n, n + 4];
        }
        // Handle 'X-Y' range
        const parts = str.split('-').map(Number);
        if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
          return [parts[0], parts[1]];
        }
        // Handle plain number → [n, n]
        const single = parseInt(str, 10);
        if (!isNaN(single)) return [single, single];
        return [fa, fb];
      };
      // Project scope (authoritative): duration_min/max and blocks_min/max.
      // blocks_min/max represent BODY blocks only. Hook and CTA are handled as
      // separate strategic elements and do not reduce the body count.
      const totalBlocksMin = Number(sopRaw.blocks_min);
      const totalBlocksMax = Number(sopRaw.blocks_max);
      const totalDurationMin = Number(sopRaw.duration_min);
      const totalDurationMax = Number(sopRaw.duration_max);

      const hasNewRanges =
        Number.isFinite(totalBlocksMin) &&
        Number.isFinite(totalBlocksMax) &&
        totalBlocksMin > 0 &&
        totalBlocksMax >= totalBlocksMin &&
        Number.isFinite(totalDurationMin) &&
        Number.isFinite(totalDurationMax) &&
        totalDurationMin > 0 &&
        totalDurationMax >= totalDurationMin;

      let minBlocks: number;
      let maxBlocks: number;
      let minDuration: number;
      let maxDuration: number;

      if (hasNewRanges) {
        minDuration = totalDurationMin;
        maxDuration = totalDurationMax;
        minBlocks = Math.max(1, totalBlocksMin);
        maxBlocks = Math.max(minBlocks, totalBlocksMax);
      } else {
        // Backward compatibility: legacy single-field ranges
        [minBlocks, maxBlocks] = parseRange(sopRaw.blocks_variation, 4, 8);
        [minDuration, maxDuration] = parseRange(sopRaw.duration, 12, 22);
      }
      const lastBlockCount = controlHistory[0]?.blockCount;
      console.debug('[V15 Range]', {
        blocks_min: sopRaw.blocks_min,
        blocks_max: sopRaw.blocks_max,
        duration_min: sopRaw.duration_min,
        duration_max: sopRaw.duration_max,
        blocks_variation: sopRaw.blocks_variation,
        duration: sopRaw.duration,
        bodyMinBlocks: minBlocks,
        bodyMaxBlocks: maxBlocks,
        minDuration,
        maxDuration,
      });


      // Read engine settings from localStorage (set by EngineSelector)
      const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'gemini';
      const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gemini-2.0-flash';
      const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

      // Call V15 AI Shuffle Engine
      const midDuration = Math.round((minDuration + maxDuration) / 2);
      const res = await fetch('/api/assembler/shuffle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          theme: chosenTheme,
          projectConfig: {
            minBlocks, maxBlocks, minDuration, maxDuration, lastBlockCount,
            targetChars: midDuration * 1200, // use mid-range, not min
          },
          narrativeLibrary: {
            hooks,
            ctas: ctas.map(c => ({ ...c, is_soft: c.name?.toLowerCase().includes('soft') })),
            communityElements: communityItems, // already derived at component level
            narrativeCurves,
            argumentModes,
            repetitionRules,
          },
          metaphorLibrary: projectMetaphors,
          titleStructures,
          controlLog: controlHistory,
          engine,
          model,
          apiKey,
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Shuffle API error: ${res.status}`);
      }

      const data = await res.json();

      if (!data.blocks || data.blocks.length === 0) {
        throw new Error('O motor V14 não retornou blocos. Verifique se há Hooks e CTAs cadastrados na Biblioteca Narrativa.');
      }

      // Map API response → ProductionBriefing
      const selectedHook = hooks.find(h => h.id === data.selectedHookId) || hooks[0];
      const selectedCta  = ctas.find(c => c.id === data.selectedCtaId)   || ctas[0];
      const selectedTitleStructure = titleStructures.find(t => t.id === data.selectedTitleStructureId) || titleStructures[0];
      const selectedNarrativeCurve = narrativeCurves.find(c => c.id === data.selectedCurveId);
      const selectedArgumentMode = argumentModes.find(c => c.id === data.selectedArgumentModeId);
      const selectedRepetitionRules = (Array.isArray(data.selectedRepetitionRuleIds) ? data.selectedRepetitionRuleIds : [])
        .map((id: string) => repetitionRules.find(rule => rule.id === id))
        .filter(Boolean);
      const midCtaAsset  = data.midCta?.id ? ctas.find(c => c.id === data.midCta.id) : null;
      const sessionHistoryCount = Number(data?.diagnostics?.recentUsage?.sourceBreakdown?.session || 0);
      const registeredHistoryCount = Number(data?.diagnostics?.recentUsage?.sourceBreakdown?.registered || 0);
      const historySourceLabel =
        sessionHistoryCount > 0 && registeredHistoryCount > 0
          ? 'Sessao atual + historico registrado'
          : sessionHistoryCount > 0
            ? 'Sessao atual'
            : 'Historico registrado';
      const historyChoiceReason =
        sessionHistoryCount > 0 && registeredHistoryCount > 0
          ? 'O motor combinou o historico ja registrado com a sessao atual para evitar repetir hook, cta, estrutura, curva, argumento, duracao, contagem e voz.'
          : sessionHistoryCount > 0
            ? 'O motor usou a sessao atual como memoria temporaria para variar a nova composicao mesmo antes do DNA ser registrado.'
            : 'O motor usou apenas o historico registrado do projeto ativo para travar uma composicao menos repetitiva e menos previsivel.';

      // ── HARD ENFORCE: duration must be within [minDuration, maxDuration] ──────
      const aiMinutes  = data.estimatedDurationMinutes;
      const lockedMinutes = Number(data?.diagnostics?.locked?.durationMinutes || 0);
      const finalMinutes = (lockedMinutes && lockedMinutes >= minDuration && lockedMinutes <= maxDuration)
        ? lockedMinutes
        : (aiMinutes && aiMinutes >= minDuration && aiMinutes <= maxDuration)
          ? aiMinutes
          : Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
      if (!lockedMinutes && (!aiMinutes || aiMinutes < minDuration || aiMinutes > maxDuration)) {
        console.warn(`[V15 Enforce] AI duration ${aiMinutes} outside [${minDuration}, ${maxDuration}] → corrected to ${finalMinutes}`);
      }
      // estimatedChars ALWAYS derived from finalMinutes to keep duration/chars in sync
      const estimatedChars = finalMinutes * 1200;
      const hookCharsBudget = Number(data?.hookChars || 0) || Math.floor(estimatedChars * 0.08);
      const ctaCharsBudget = Number(data?.ctaChars || 0) || Math.floor(estimatedChars * 0.06);
      const bodyCharsBudget = Math.max(estimatedChars - hookCharsBudget - ctaCharsBudget, minBlocks * 320);

      const VALID_VOICES = ['Desafio Direto', 'Vulnerabilidade', 'Diagnóstico Técnico'] as const;
      let rawBlocks: AssemblerBlock[] = (data.blocks || []).map((b: any, i: number) => {
        const voiceStyle = (VALID_VOICES.includes(b.voiceStyle) ? b.voiceStyle : VALID_VOICES[i % 3]) as AssemblerBlock['voiceStyle'];
        const narrativeMap = getAdvancedNarrativeTensionMap({
          index: i,
          total: Math.max(data.blocks.length, 1),
          voiceStyle,
          voicePatternId: data?.diagnostics?.locked?.voicePatternId || data?.voicePattern,
          themeText: chosenTheme,
          blockName: b.name || `Bloco ${i + 1}`,
          missionNarrative: b.missionNarrative || '',
          isNarrativeTwist: !!b.isNarrativeTwist,
        });
        return {
          id: `ai-block-${i}`,
          name: b.name || `Bloco ${i + 1}`,
          missionNarrative: b.missionNarrative || '',
          voiceStyle,
          type: 'Metaphor' as const,
          isNarrativeTwist: !!b.isNarrativeTwist,
          blockChars: b.blockChars || Math.floor(bodyCharsBudget / Math.max(data.blocks.length, 1)),
          bridgeInstruction: b.bridgeInstruction || undefined,
          communityElement: b.communityElement || undefined,
          ...narrativeMap,
        };
      });

      // ── HARD ENFORCE: block count must be within [minBlocks, maxBlocks] ───────
      if (rawBlocks.length < minBlocks) {
        console.warn(`[V15 Enforce] AI returned ${rawBlocks.length} blocks but min is ${minBlocks} — padding`);
        const perBlock = Math.floor(bodyCharsBudget / Math.max(minBlocks, 1));
        while (rawBlocks.length < minBlocks) {
          const i = rawBlocks.length;
          const voiceStyle = VALID_VOICES[i % 3];
          const narrativeMap = getAdvancedNarrativeTensionMap({
            index: i,
            total: minBlocks,
            voiceStyle,
            voicePatternId: data?.diagnostics?.locked?.voicePatternId || data?.voicePattern,
            themeText: chosenTheme,
            blockName: `Bloco ${i + 1}`,
            missionNarrative: 'Desenvolva este segmento aprofundando o tema central com exemplos concretos e dados do nicho.',
            isNarrativeTwist: false,
          });
          rawBlocks.push({
            id: `pad-block-${i}`,
            name: `Bloco ${i + 1}`,
            missionNarrative: 'Desenvolva este segmento aprofundando o tema central com exemplos concretos e dados do nicho.',
            voiceStyle,
            type: 'Metaphor' as const,
            isNarrativeTwist: false,
            blockChars: perBlock,
            bridgeInstruction: undefined,
            communityElement: undefined,
            ...narrativeMap,
          });
        }
      }
      if (rawBlocks.length > maxBlocks) {
        console.warn(`[V15 Enforce] AI returned ${rawBlocks.length} blocks but max is ${maxBlocks} — truncating`);
        rawBlocks = rawBlocks.slice(0, maxBlocks);
      }
      const blocks = redistributeBlockCharsByNarrativeMap(rawBlocks, bodyCharsBudget);
      const blockCount = blocks.length;

      const hookCode = (selectedHook?.id || 'HOOK').slice(0, 4).toUpperCase();
      const ctaCode  = (selectedCta?.id  || 'CTA' ).slice(0, 4).toUpperCase();
      const compositionLogId = `V15-${hookCode}-${ctaCode}-${Date.now().toString(36).toUpperCase()}`;

      setBriefing({
        title: chosenTheme,
        estimatedDuration: `~${finalMinutes} minutos`,
        estimatedChars,
        hookChars: hookCharsBudget,
        ctaChars: ctaCharsBudget,
        blockCount,
        dominantVoice: data.dominantVoice || blocks[0]?.voiceStyle || 'Diagnóstico Técnico',
        diagnostics: data.diagnostics,
        openingHook: {
          id: selectedHook?.id || '',
          name: selectedHook?.name || '—',
          pattern: selectedHook?.content_pattern || selectedHook?.description || '',
        },
        selectedCta: {
          id: selectedCta?.id || '',
          name: selectedCta?.name || '—',
          pattern: selectedCta?.content_pattern || selectedCta?.description || '',
        },
        selectedTitleStructure: selectedTitleStructure ? {
          id: selectedTitleStructure.id,
          name: selectedTitleStructure.name || '—',
          pattern: selectedTitleStructure.content_pattern || selectedTitleStructure.description || '',
        } : undefined,
        selectedNarrativeCurve: selectedNarrativeCurve ? {
          id: selectedNarrativeCurve.id,
          name: selectedNarrativeCurve.name || '—',
          pattern: selectedNarrativeCurve.content_pattern || selectedNarrativeCurve.description || '',
          behaviorFlag: selectedNarrativeCurve.category || undefined,
        } : undefined,
        selectedArgumentMode: selectedArgumentMode ? {
          id: selectedArgumentMode.id,
          name: selectedArgumentMode.name || '—',
          pattern: selectedArgumentMode.content_pattern || selectedArgumentMode.description || '',
          behaviorFlag: selectedArgumentMode.category || undefined,
        } : undefined,
        selectedRepetitionRules: selectedRepetitionRules.map((rule: any) => ({
          id: rule.id,
          name: rule.name || '—',
          pattern: rule.content_pattern || rule.description || '',
          behaviorFlag: rule.category || undefined,
        })),
        midCta: midCtaAsset ? {
          id: midCtaAsset.id,
          name: midCtaAsset.name || '—',
          pattern: midCtaAsset.content_pattern || midCtaAsset.description || '',
          position: data.midCta?.position ?? Math.floor(blocks.length / 2),
        } : undefined,
        blocks,
        compositionLogId,
        historySourceLabel,
        historyChoiceReason,
        assetLog: {
          hook: selectedHook?.id || '',
          ctaFinal: selectedCta?.id || '',
          titleStructure: selectedTitleStructure?.id || '',
          narrativeCurve: selectedNarrativeCurve?.id || '',
          argumentMode: selectedArgumentMode?.id || '',
          repetitionRules: selectedRepetitionRules.map((rule: any) => rule.id).join(','),
          ctaMid: midCtaAsset?.id || '',
        },
      });

      setPhase('briefing');
    } catch (err: any) {
      console.error('[Shuffle V14 Error]', err);
      setError(err?.message || 'Erro interno ao montar a estrutura modular.');
      setPhase('gatekeeper');
    } finally {
      setLoading(false);
    }
  };


  const handleApprove = () => {
    if (!briefing) return;
    const finalTheme = (useRefactored && gatekeeperResult?.refactoredTheme) || theme;
    onApprove(briefing, finalTheme);
  };

  const reset = () => {
    setPhase('input');
    setGatekeeperResult(null);
    setBriefing(null);
    setError('');
    setUseRefactored(false);
    setEditingRefactored(false);
    setEditedRefactoredTheme('');
  };

  // ─── RENDER ───────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-6 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-sage/10 border border-sage/20 rounded-xl flex items-center justify-center">
            <ShieldCheck className="text-sage" size={18} />
          </div>
          <div>
            <h2 className="font-black text-white text-sm uppercase tracking-widest italic">Production Assembler V4</h2>
            <p className="text-[11px] text-white/30 uppercase tracking-[2px] font-black">Gatekeeper · Shuffle Engine · Briefing</p>
          </div>
        </div>
        {phase !== 'input' && (
          <button onClick={reset} className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-white/30 hover:text-white transition-all">
            <RotateCcw size={13} /> Recomeçar
          </button>
        )}
      </div>

      {/* Phase: INPUT */}
      {phase === 'input' && (
        <div className="glass-card p-8 space-y-6">
          <div>
            <label className="text-xs font-black uppercase tracking-[3px] text-white/40 block mb-2">Tema do Vídeo</label>
            <textarea
              value={theme}
              onChange={e => setTheme(e.target.value)}
              placeholder={`Ex: Por que 80% dos criadores falham em monetizar...`}
              rows={3}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm text-white placeholder-white/20 outline-none focus:border-sage/40 font-medium resize-none"
            />
          </div>

          {/* Library Status */}
          <div className="grid grid-cols-2 gap-3">
            {[
              { label: 'Hooks', count: hooks.length, icon: Zap, color: 'text-sage' },
              { label: 'CTAs', count: ctas.length, icon: Target, color: 'text-blue-400' },
              { label: 'Estruturas', count: titleStructures.length, icon: Sparkles, color: 'text-purple-400' },
              { label: 'Comunidade', count: communityItems.length, icon: BookOpen, color: 'text-cyan-400' },
              { label: 'Curvas', count: narrativeCurves.length, icon: Shuffle, color: 'text-pink-400' },
              { label: 'Argumentos', count: argumentModes.length, icon: Mic, color: 'text-amber-300' },
              { label: 'Regras', count: repetitionRules.length, icon: Info, color: 'text-red-300' },
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className="flex flex-col items-center p-3 bg-white/5 border border-white/10 rounded-xl">
                <Icon size={16} className={color} />
                <span className="text-lg font-black text-white mt-1">{narrativeLibraryReady ? count : '...'}</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-white/30">{label}</span>
              </div>
            ))}
          </div>

          {/* API Warning */}
          <div className="flex items-start gap-3 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <Info size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-300/70 font-bold leading-relaxed">
              {libraryStatusMessage}
            </p>
          </div>

          <button
            onClick={runGatekeeper}
            disabled={!theme.trim() || loading || !narrativeLibraryReady}
            className="w-full flex items-center justify-center gap-3 py-4 bg-sage text-midnight rounded-xl font-black text-sm uppercase tracking-[3px] hover:bg-sage/80 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <ShieldCheck size={16} /> Analisar com Gatekeeper
          </button>
        </div>
      )}

      {/* Phase: GATEKEEPER Running */}
      {phase === 'gatekeeper' && loading && (
        <div className="glass-card p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-sage/20 border-t-sage rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-white/40">Gatekeeper analisando o tema...</p>
        </div>
      )}

      {/* Phase: GATEKEEPER Result */}
      {phase === 'gatekeeper' && !loading && gatekeeperResult && (
        <div className="space-y-4 animate-in fade-in duration-500">
          {/* Fallback Warning */}
          {gatekeeperResult.isFallback && (
            <div className="flex items-start gap-3 p-4 bg-yellow-500/10 border border-yellow-500/30 rounded-xl">
              <AlertTriangle size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
              <div>
                <p className="text-xs font-black uppercase tracking-widest text-yellow-400 mb-1">
                  Análise Simplificada ({gatekeeperResult.fallbackReason === 'parse_error' ? 'Falha no Motor IA' : 'Sem Chave de API'})
                </p>
                <p className="text-xs text-yellow-300/60 leading-relaxed">
                  {gatekeeperResult.fallbackReason === 'parse_error'
                    ? 'A Inteligência Artificial retornou dados em um formato inválido. O Gatekeeper aplicou a análise algorítmica local como plano de segurança.'
                    : 'Nenhuma chave de API detectada. O Gatekeeper utilizou análise local baseada em palavras-chave. Configure sua chave em Configurações para validação com IA.'}
                </p>
              </div>
            </div>
          )}

          <div className={`glass-card p-6 border ${SCORE_COLOR(gatekeeperResult.matchScore).border}`}>
            {/* Score */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs font-black uppercase tracking-[3px] text-white/40">Match Score</span>
              <span className={`text-3xl font-black ${SCORE_COLOR(gatekeeperResult.matchScore).text}`}>
                {gatekeeperResult.matchScore}%
              </span>
            </div>
            <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-5">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${SCORE_COLOR(gatekeeperResult.matchScore).bg}`}
                style={{ width: `${gatekeeperResult.matchScore}%` }}
              />
            </div>

            {/* Status Badge */}
            <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-black uppercase tracking-widest mb-4 ${SCORE_COLOR(gatekeeperResult.matchScore).badge}`}>
              {gatekeeperResult.isValid ? <CheckCircle2 size={12} /> : <XCircle size={12} />}
              {gatekeeperResult.isValid ? 'Tema Aprovado' : 'Tema Crítico — Pivô Necessário'}
            </div>

            {/* Reasoning */}
            {gatekeeperResult.reasoning && (
              <p className="text-sm text-white/60 leading-relaxed mb-4 bg-white/5 px-4 py-3 rounded-xl border border-white/5 italic">
                "{gatekeeperResult.reasoning}"
              </p>
            )}

            {/* Pivot Suggestion */}
            {gatekeeperResult.pivotSuggestion && (
              <div className="space-y-2">
                <p className="text-xs font-black uppercase tracking-[3px] text-white/30">Sugestão de Pivot</p>
                <p className="text-sm text-white/70 leading-relaxed">{gatekeeperResult.pivotSuggestion}</p>
              </div>
            )}

            {/* Original Theme (fixed for comparison) */}
            <div className="p-3 bg-white/[0.03] border border-white/10 rounded-xl">
              <p className="text-xs font-black uppercase tracking-[3px] text-white/20 mb-1">Tema Original</p>
              <p className="text-sm text-white/50 italic">"{theme}"</p>
            </div>

            {/* Refactored Theme */}
            {gatekeeperResult.refactoredTheme && gatekeeperResult.refactoredTheme !== theme && (
              <div className="mt-2 p-4 bg-sage/5 border border-sage/20 rounded-xl">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-black uppercase tracking-[3px] text-sage">Tema Refatorado</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        if (editingRefactored) {
                          // Save edits back to gatekeeperResult state proxy
                          setGatekeeperResult(prev => prev ? { ...prev, refactoredTheme: editedRefactoredTheme } : prev);
                        } else {
                          setEditedRefactoredTheme(gatekeeperResult.refactoredTheme);
                        }
                        setEditingRefactored(v => !v);
                      }}
                      className="text-xs font-black uppercase tracking-widest px-2 py-1 rounded-full border border-white/20 text-white/40 hover:border-white/40 hover:text-white transition-all"
                    >
                      {editingRefactored ? '✓ Salvar' : '✎ Editar'}
                    </button>
                    <button
                      onClick={() => setUseRefactored(v => !v)}
                      className={`text-xs font-black uppercase tracking-widest px-3 py-1.5 rounded-full border transition-all ${useRefactored ? 'bg-sage/20 border-sage/40 text-sage' : 'border-white/20 text-white/40 hover:border-white/40'}`}
                    >
                      {useRefactored ? '✓ Usando' : 'Usar Este'}
                    </button>
                  </div>
                </div>
                {editingRefactored ? (
                  <input
                    autoFocus
                    value={editedRefactoredTheme}
                    onChange={e => setEditedRefactoredTheme(e.target.value)}
                    className="w-full bg-white/5 border border-sage/30 rounded-lg px-3 py-2 text-[12px] text-white font-bold italic outline-none focus:border-sage/60"
                  />
                ) : (
                  <p className="text-sm text-white font-bold italic">"{gatekeeperResult.refactoredTheme}"</p>
                )}
              </div>
            )}
          </div>

          <div className="flex gap-3">
            <button onClick={reset} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/40 hover:bg-white/10 transition-all">
              Tentar Outro Tema
            </button>
            <button
              onClick={runShuffle}
              className="flex-1 flex items-center justify-center gap-2 py-3 bg-sage text-midnight rounded-xl font-black text-sm uppercase tracking-widest hover:bg-sage/80 transition-all"
            >
              <Shuffle size={14} /> Gerar Estrutura Modular
            </button>
          </div>
        </div>
      )}

      {/* Phase: SHUFFLE Running */}
      {phase === 'shuffle' && loading && (
        <div className="glass-card p-12 flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-purple-400/20 border-t-purple-400 rounded-full animate-spin" />
          <p className="text-xs font-black uppercase tracking-widest text-white/40">Shuffle Engine montando blocos...</p>
          <p className="text-[11px] text-white/20 font-black uppercase tracking-widest">Motor V9 · Anti-repetição ativo</p>
        </div>
      )}

      {/* Phase: BRIEFING */}
      {phase === 'briefing' && !loading && briefing && (
        <div className="space-y-4 animate-in fade-in duration-500">
          {/* Main Briefing Card */}
          <div className="glass-card p-6 space-y-6 border-sage/20">
            {/* Title Row */}
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <p className="text-xs font-black uppercase tracking-[3px] text-sage mb-1">Título Criativo</p>
                <h3 className="text-xl font-black text-white italic leading-tight break-words">"{briefing.title}"</h3>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(briefing.title)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white transition-all flex-shrink-0"
              >
                <Copy size={14} />
              </button>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[ 
                { label: 'Duração',    value: briefing.estimatedDuration },
                { label: 'Blocos',     value: `${briefing.blockCount} blocos` },
                { label: 'Voz Dom.',   value: briefing.dominantVoice.split(' ')[0] },
                { label: 'Caracteres', value: `~${briefing.estimatedChars.toLocaleString('pt-BR')}` },
              ].map(({ label, value }) => (
                <div key={label} className="text-center p-3 bg-white/5 border border-white/10 rounded-xl">
                <span className="text-[11px] font-black uppercase tracking-widest text-white/30 block mb-1">{label}</span>
                  <span className="text-sm font-black text-white">{value}</span>
                </div>
              ))}
            </div>

            {/* Hook & CTA */}
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="p-4 bg-sage/5 border border-sage/20 rounded-xl min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Zap size={14} className="text-sage" />
                  <span className="text-xs font-black uppercase tracking-widest text-sage">Abertura Estratégica</span>
                </div>
                <p className="text-sm font-black text-white mb-1.5 break-words">{briefing.openingHook.name}</p>
                <p className="text-xs text-white/50 italic leading-relaxed line-clamp-3">{briefing.openingHook.pattern}</p>
              </div>
              <div className="p-4 bg-blue-500/5 border border-blue-500/20 rounded-xl min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Target size={14} className="text-blue-400" />
                  <span className="text-xs font-black uppercase tracking-widest text-blue-400">CTA Selecionado</span>
                </div>
                <p className="text-sm font-black text-white mb-1.5 break-words">{briefing.selectedCta.name}</p>
                <p className="text-xs text-white/50 italic leading-relaxed line-clamp-3">{briefing.selectedCta.pattern}</p>
              </div>
            </div>

            {briefing.selectedTitleStructure && (
              <div className="p-4 bg-purple-500/5 border border-purple-500/20 rounded-xl min-w-0">
                <div className="flex items-center gap-2 mb-2">
                  <Sparkles size={14} className="text-purple-400" />
                  <span className="text-xs font-black uppercase tracking-widest text-purple-400">Estrutura do Projeto</span>
                </div>
                <p className="text-sm font-black text-white mb-1.5 break-words">{briefing.selectedTitleStructure.name}</p>
                <p className="text-xs text-white/50 italic leading-relaxed line-clamp-3">{briefing.selectedTitleStructure.pattern}</p>
              </div>
            )}

            {(briefing.selectedNarrativeCurve || briefing.selectedArgumentMode) && (
              <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
                {briefing.selectedNarrativeCurve && (
                  <div className="p-4 bg-pink-500/5 border border-pink-500/20 rounded-xl min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Shuffle size={14} className="text-pink-300" />
                      <span className="text-xs font-black uppercase tracking-widest text-pink-300">Curva Narrativa</span>
                    </div>
                    <p className="text-sm font-black text-white mb-1.5 break-words">{briefing.selectedNarrativeCurve.name}</p>
                    <p className="text-xs text-white/50 italic leading-relaxed line-clamp-3">{briefing.selectedNarrativeCurve.pattern}</p>
                  </div>
                )}
                {briefing.selectedArgumentMode && (
                  <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl min-w-0">
                    <div className="flex items-center gap-2 mb-2">
                      <Mic size={14} className="text-amber-300" />
                      <span className="text-xs font-black uppercase tracking-widest text-amber-300">Modo de Argumentacao</span>
                    </div>
                    <p className="text-sm font-black text-white mb-1.5 break-words">{briefing.selectedArgumentMode.name}</p>
                    <p className="text-xs text-white/50 italic leading-relaxed line-clamp-3">{briefing.selectedArgumentMode.pattern}</p>
                  </div>
                )}
              </div>
            )}

            {!!briefing.selectedRepetitionRules?.length && (
              <div className="p-4 bg-red-500/5 border border-red-500/20 rounded-xl min-w-0">
                <div className="flex items-center gap-2 mb-3">
                  <AlertTriangle size={14} className="text-red-300" />
                  <span className="text-xs font-black uppercase tracking-widest text-red-300">Regras Anti-Repeticao Ativas</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {briefing.selectedRepetitionRules.map((rule) => (
                    <span key={rule.id} className="px-3 py-1.5 rounded-full border border-red-400/20 bg-red-400/5 text-[10px] font-black uppercase tracking-widest text-red-200">
                      {rule.name}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {briefing.diagnostics && (
              <div className="p-4 bg-amber-500/5 border border-amber-500/20 rounded-xl min-w-0 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Info size={14} className="text-amber-400" />
                    <span className="text-xs font-black uppercase tracking-widest text-amber-400">Painel Anti-Repeticao</span>
                  </div>
                  <span className="px-2.5 py-1 rounded-full border border-amber-400/30 bg-amber-400/10 text-[10px] font-black uppercase tracking-widest text-amber-300">
                    Score de novidade: {briefing.diagnostics.noveltyScore}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
                  {[
                    { label: 'Hook travado', value: briefing.openingHook.name },
                    { label: 'CTA travado', value: briefing.selectedCta.name },
                    { label: 'Estrutura travada', value: briefing.selectedTitleStructure?.name || 'Nao definida' },
                    { label: 'Curva travada', value: briefing.selectedNarrativeCurve?.name || 'Nao definida' },
                    { label: 'Argumento travado', value: briefing.selectedArgumentMode?.name || 'Nao definido' },
                    { label: 'Padrao de voz', value: formatVoicePatternLabel(briefing.diagnostics.locked.voicePatternId) },
                    { label: 'Duracao travada', value: formatDurationLabel(briefing.diagnostics.locked.durationMinutes) },
                    { label: 'Blocos travados', value: `${briefing.diagnostics.locked.blockCount} blocos` },
                  ].map((item) => (
                    <div key={item.label} className="p-3 rounded-xl border border-white/10 bg-white/[0.03]">
                      <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-1">{item.label}</p>
                      <p className="text-xs font-black text-white leading-snug break-words">{item.value}</p>
                    </div>
                  ))}
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Bloqueios ativos</p>
                    <div className="space-y-1 text-[11px] text-white/70">
                      <p>Estruturas bloqueadas: {briefing.diagnostics.blocked.titleStructureIds.length}</p>
                      <p>Curvas bloqueadas: {briefing.diagnostics.blocked.curveIds.length}</p>
                      <p>Argumentos bloqueados: {briefing.diagnostics.blocked.argumentModeIds.length}</p>
                      <p>Regras ativas: {briefing.diagnostics.blocked.repetitionRuleIds.length || 'Nenhuma'}</p>
                      <p>Combos bloqueados: {briefing.diagnostics.blocked.comboKeys.length}</p>
                      <p>Blocos bloqueados: {briefing.diagnostics.blocked.blockCounts.join(', ') || 'Nenhum'}</p>
                      <p>Duracoes bloqueadas: {briefing.diagnostics.blocked.durationMinutes.map((value) => `${value}m`).join(', ') || 'Nenhuma'}</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Historico recente</p>
                    <div className="space-y-1 text-[11px] text-white/70">
                      <p>Fonte da variacao: {briefing.historySourceLabel || 'Historico registrado'}</p>
                      <p>Sessao atual: {briefing.diagnostics.recentUsage.sourceBreakdown?.session || 0}</p>
                      <p>Historico registrado: {briefing.diagnostics.recentUsage.sourceBreakdown?.registered || 0}</p>
                      <p>Hooks recentes: {briefing.diagnostics.recentUsage.hookIds.length}</p>
                      <p>CTAs recentes: {briefing.diagnostics.recentUsage.ctaIds.length}</p>
                      <p>Estruturas recentes: {briefing.diagnostics.recentUsage.titleStructureIds.length}</p>
                      <p>Curvas recentes: {briefing.diagnostics.recentUsage.curveIds.length}</p>
                      <p>Argumentos recentes: {briefing.diagnostics.recentUsage.argumentModeIds.length}</p>
                      <p>Regras recentes: {briefing.diagnostics.recentUsage.repetitionRuleIds.length}</p>
                      <p>Blocos recentes: {briefing.diagnostics.recentUsage.blockCounts.map((value) => `${value}`).join(', ') || 'Nenhum'}</p>
                      <p>Duracoes recentes: {briefing.diagnostics.recentUsage.durationMinutes.map((value) => `${value}m`).join(', ') || 'Nenhuma'}</p>
                    </div>
                  </div>
                  <div className="p-3 rounded-xl border border-white/10 bg-white/[0.02]">
                    <p className="text-[10px] font-black uppercase tracking-widest text-white/30 mb-2">Motivo da escolha</p>
                    <p className="text-[11px] text-white/70 leading-relaxed">
                      {briefing.historyChoiceReason || 'O motor travou uma composicao menos usada no projeto ativo e evitou repetir a mesma combinacao recente de hook, cta, estrutura, duracao, contagem e voz.'}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Modular Structure */}
            <div>
              <div className="flex items-center gap-2 mb-3">
                <BookOpen size={16} className="text-white/40" />
                <span className="text-xs font-black uppercase tracking-[3px] text-white/40">Estrutura Modular (O Lego)</span>
              </div>
              <div className="space-y-2">
                {briefing.blocks.map((block, i) => {
                    const VoiceIcon = VOICE_ICON[block.voiceStyle] || Zap;
                    const isTwist = block.isNarrativeTwist;

                    // Mid-CTA slot: insert AFTER this block if position matches
                    const showMidCta = briefing.midCta && briefing.midCta.position === i;

                    return (
                      <div key={block.id}>
                        <div
                          className={`flex items-start gap-3 p-3.5 border rounded-xl group transition-all ${
                            isTwist
                              ? 'bg-amber-500/5 border-amber-500/30 ring-1 ring-amber-500/20'
                              : 'bg-white/[0.02] border-white/5 hover:border-white/10'
                          }`}
                        >
                          <span className={`text-xs font-black w-5 shrink-0 pt-0.5 ${isTwist ? 'text-amber-400/60' : 'text-white/30'}`}>{String(i + 1).padStart(2, '0')}</span>
                          <div className="flex-1 min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5 mb-1">
                              {isTwist && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-amber-400 border border-amber-400/30 bg-amber-400/5 px-1.5 py-0.5 rounded-full">
                                  ↻ Virada Narrativa
                                </span>
                              )}
                              {block.communityElement && (
                                <span className="inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-widest text-purple-400 border border-purple-400/30 bg-purple-400/5 px-1.5 py-0.5 rounded-full">
                                  ◈ Comunidade
                                </span>
                              )}
                              {block.blockChars && (
                                <span className="text-[9px] font-black text-white/20 ml-auto">~{block.blockChars.toLocaleString('pt-BR')} chars</span>
                              )}
                            </div>
                            {(block.tensionLevel || block.narrativeRole || block.transitionMode) && (
                              <div className="flex flex-wrap gap-1.5 mt-2">
                                {block.tensionLevel && (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-white/45 border border-white/10 bg-white/[0.03] px-2 py-1 rounded-full">
                                    Tensão: {block.tensionLevel}
                                  </span>
                                )}
                                {block.narrativeRole && (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-white/45 border border-white/10 bg-white/[0.03] px-2 py-1 rounded-full">
                                    Papel: {block.narrativeRole}
                                  </span>
                                )}
                                {block.transitionMode && (
                                  <span className="text-[9px] font-black uppercase tracking-widest text-white/45 border border-white/10 bg-white/[0.03] px-2 py-1 rounded-full">
                                    Transição: {block.transitionMode}
                                  </span>
                                )}
                              </div>
                            )}
                            <p className={`text-sm font-black leading-snug ${isTwist ? 'text-amber-50' : 'text-white'}`}>{block.name}</p>
                            <p className="text-xs text-white/40 italic mt-1 leading-relaxed">{block.missionNarrative}</p>
                            {block.communityElement && (
                              <p className="text-[10px] text-purple-400/70 italic mt-1.5 pl-2 border-l border-purple-400/20 leading-snug line-clamp-2">"{block.communityElement}"</p>
                            )}
                            {block.bridgeInstruction && (
                              <div className="flex items-start gap-1.5 mt-2 pt-2 border-t border-white/5">
                                <ChevronRight size={10} className="text-sage/50 shrink-0 mt-0.5" />
                                <p className="text-[10px] text-sage/50 italic leading-relaxed">{block.bridgeInstruction}</p>
                              </div>
                            )}
                          </div>
                          <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-black uppercase tracking-widest shrink-0 ${VOICE_COLOR[block.voiceStyle]}`}>
                            <VoiceIcon size={10} /> {block.voiceStyle.split(' ')[0]}
                          </span>
                        </div>

                        {/* Mid-CTA Slot */}
                        {showMidCta && briefing.midCta && (
                          <div className="my-2 p-3 bg-cyan-500/5 border border-cyan-500/20 rounded-xl flex items-start gap-3">
                            <span className="text-[9px] font-black uppercase tracking-widest text-cyan-400 border border-cyan-400/30 bg-cyan-400/5 px-1.5 py-1 rounded-full shrink-0 whitespace-nowrap">CTA Mid</span>
                            <div className="min-w-0">
                              <p className="text-xs font-black text-white">{briefing.midCta.name}</p>
                              <p className="text-[10px] text-white/40 italic line-clamp-2 mt-0.5">{briefing.midCta.pattern}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}

              </div>
            </div>


            {/* Composition Log ID */}
            <div className="flex items-center justify-between p-3 bg-midnight/40 border border-white/5 rounded-xl gap-4">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[3px] text-white/20 mb-0.5">Composition Log ID</p>
                <p className="text-xs font-black text-white/60 font-mono truncate">{briefing.compositionLogId}</p>
              </div>
              <button
                onClick={() => navigator.clipboard.writeText(briefing.compositionLogId)}
                className="p-2 bg-white/5 hover:bg-white/10 rounded-lg text-white/20 hover:text-white transition-all"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3">
            <button onClick={runShuffle} className="w-full sm:w-auto flex items-center justify-center gap-2 px-5 py-3.5 bg-white/5 border border-white/10 rounded-xl text-xs font-black uppercase tracking-widest text-white/50 hover:bg-white/10 hover:text-white transition-all">
              <Shuffle size={15} /> Novo Shuffle
            </button>
            <button
              onClick={handleApprove}
              className="w-full sm:flex-1 flex items-center justify-center gap-3 py-3.5 bg-sage text-midnight rounded-xl font-black text-sm uppercase tracking-[3px] hover:bg-sage/80 transition-all shadow-lg shadow-sage/20"
            >
              ✓ Aprovar e Gerar Roteiro <ArrowRight size={17} />
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-xl">
          <XCircle size={14} className="text-red-400 shrink-0" />
          <p className="text-[10px] text-red-300 font-bold">{error}</p>
        </div>
      )}
    </div>
  );
}
