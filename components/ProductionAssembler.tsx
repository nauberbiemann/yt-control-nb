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
}

interface ProductionBriefing {
  title: string;
  estimatedDuration: string;
  estimatedChars: number;
  blockCount: number;
  dominantVoice: string;
  openingHook: { id: string; name: string; pattern: string };
  selectedCta: { id: string; name: string; pattern: string };
  // V14: mid CTA positioned between central blocks
  midCta?: { id: string; name: string; pattern: string; position: number };
  blocks: AssemblerBlock[];
  compositionLogId: string;
  // V14: asset traceability log
  assetLog?: Record<string, string>; // { assetType: assetId }
}

interface ProductionAssemblerProps {
  components: any[]; // from NarrativeLibrary
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

function runShuffleEngine(
  hooks: any[],
  ctas: any[],
  metaphors: any[], // "Title Structure" type from library
  projectMetaphors: string[], // from project.metaphor_library
  previousCompositions: any[],
  activeProject: any
): ProductionBriefing | null {
  // Guard: need at least one Hook OR one CTA
  if (hooks.length === 0 || ctas.length === 0) return null;

  // 1. Pick random Hook
  const selectedHook = hooks.length > 0
    ? hooks[Math.floor(Math.random() * hooks.length)]
    : { id: 'default-hook', name: 'Hook Estratégico', content_pattern: 'Abertura baseada na PUC do projeto.' };

  // 2. Pick random CTA
  const selectedCta = ctas.length > 0
    ? ctas[Math.floor(Math.random() * ctas.length)]
    : { id: 'default-cta', name: 'Conversão PUC', content_pattern: 'Transição para a promessa do canal.' };

  // 3. Build metaphor pool from library + project free-text metaphors
  const libraryMetaphors = metaphors.map(m => ({
    id: m.id,
    name: m.name,
    pattern: m.content_pattern,
    isLibrary: true,
  }));

  const projectTextMetaphors = projectMetaphors.map((m, i) => ({
    id: `pm-${i}`,
    name: m,
    pattern: `Aplicar a metáfora "${m}" para ilustrar o conceito central.`,
    isLibrary: false,
  }));

  const allMetaphors = [...libraryMetaphors, ...projectTextMetaphors];

  // 4. Get previously used asset IDs to enforce different order
  const usedIds = new Set(
    previousCompositions.flatMap(c => c.narrative_asset_ids || [])
  );

  // Prefer assets NOT recently used
  const unusedMetaphors = allMetaphors.filter(m => !usedIds.has(m.id));
  const metaphorPool = unusedMetaphors.length >= 3 ? unusedMetaphors : allMetaphors;

  // 4. Guard: if no metaphors are available, let the engine error out gracefully
  if (metaphorPool.length === 0) return null;

  // 4b. Use block_variation and duration from project SOP settings directly
  const minBlocks = Number(activeProject?.editing_sop?.blocks_min);
  const maxBlocks = Number(activeProject?.editing_sop?.blocks_max);
  const minDurMin = Number(activeProject?.editing_sop?.duration_min);
  const maxDurMin = Number(activeProject?.editing_sop?.duration_max);

  // 4c. Guard: Bloquear geração se o SOP não estiver configurado
  if (!minBlocks || !maxBlocks || !minDurMin || !maxDurMin) return null;

  // 4d. Randomize body block count within user-configured range
  const bodyCount = Math.floor(Math.random() * (maxBlocks - minBlocks + 1)) + minBlocks;
  const blockCount = bodyCount + 2; // +1 hook +1 CTA (Total final: min+2 a max+2)

  // 8. Estimate duration and calibrate block density
  const totalMinutes = Math.floor(Math.random() * (maxDurMin - minDurMin + 1)) + minDurMin;
  const estimatedDuration = `~${totalMinutes} minutos`;
  const estimatedChars = totalMinutes * 1200; // ~1200 chars per minute
  const charsPerBlock = Math.floor(estimatedChars / blockCount);

  // 4d. Cycle metaphors if bodyCount > available pool (with shuffle for variety)
  const shuffledPool = shuffleArray(metaphorPool);
  const selectedMetaphors: typeof allMetaphors = [];
  for (let i = 0; i < bodyCount; i++) {
    selectedMetaphors.push(shuffledPool[i % shuffledPool.length]);
  }
  
  const finalSelectedMetaphors = shuffleArray(selectedMetaphors);

  // 5. Build voice rotation (ensure no two consecutive same voice)
  const shuffledVoices = shuffleArray([...VOICE_STYLES, ...VOICE_STYLES, ...VOICE_STYLES, ...VOICE_STYLES, ...VOICE_STYLES]);

  // 6. Assemble blocks with Calibration and Bridges
  const bodyBlocks: AssemblerBlock[] = finalSelectedMetaphors.map((m, i) => {
    const voice = shuffledVoices[i % shuffledVoices.length];
    const missions = VOICE_MISSION_MAP[voice];
    return {
      id: `${m.id}-slot-${i}`,
      name: m.name,
      missionNarrative: missions[Math.floor(Math.random() * missions.length)],
      voiceStyle: voice,
      assetId: m.isLibrary ? m.id : undefined,
      type: 'Metaphor' as const,
      blockChars: charsPerBlock,
      bridgeInstruction: i === bodyCount - 1 
        ? "Transição final para a chamada de ação (CTA)." 
        : `Elo de ligação para o próximo bloco: ${finalSelectedMetaphors[i+1].name}.`,
      communityElement: activeProject?.community_elements?.[Math.floor(Math.random() * (activeProject?.community_elements?.length || 1))]
    };
  });

  // 9. Determine dominant voice
  const voiceCounts = bodyBlocks.reduce((acc, b) => {
    acc[b.voiceStyle] = (acc[b.voiceStyle] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  const dominantVoice = Object.entries(voiceCounts).sort(([, a], [, b]) => b - a)[0]?.[0] || 'Diagnóstico Técnico';

  // 10. Creative title from PUC + first metaphor
  const mainMetaphor = selectedMetaphors[0]?.name || 'Conceito Central';
  const pucText = activeProject?.puc ? activeProject.puc.split(' ').slice(0, 5).join(' ') : 'A Estratégia que Muda Tudo';
  const title = `${mainMetaphor}: ${pucText}`;

  return {
    title,
    estimatedDuration,
    estimatedChars,
    blockCount,
    dominantVoice,
    openingHook: {
      id: selectedHook.id,
      name: selectedHook.name,
      pattern: selectedHook.content_pattern || selectedHook.description || '',
    },
    selectedCta: {
      id: selectedCta.id,
      name: selectedCta.name,
      pattern: selectedCta.content_pattern || selectedCta.description || '',
    },
    blocks: bodyBlocks,
    compositionLogId,
  };
}

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

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────

export default function ProductionAssembler({ components, onApprove }: ProductionAssemblerProps) {
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

  const hooks = components.filter(c => c.type === 'Hook');
  const ctas = components.filter(c => c.type === 'CTA');
  const titleStructures = components.filter(c => c.type === 'Title Structure');
  const communityItems  = components.filter(c => c.type === 'Community');

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
        fetchLastCompositions(activeProject?.id || '', 3),
        new Promise<any[]>(resolve => setTimeout(() => resolve([]), 4000))
      ]);

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
      // blocks_min/max are TOTAL blocks shown in the UI (Hook + Body + CTA).
      // The shuffle API expects BODY blocks only, so we convert total → body by subtracting 2.
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
        const bodyMin = Math.max(1, totalBlocksMin - 2);
        const bodyMax = Math.max(bodyMin, totalBlocksMax - 2);
        minBlocks = bodyMin;
        maxBlocks = bodyMax;
      } else {
        // Backward compatibility: legacy single-field ranges
        [minBlocks, maxBlocks] = parseRange(sopRaw.blocks_variation, 4, 8);
        [minDuration, maxDuration] = parseRange(sopRaw.duration, 12, 22);
      }
      const lastBlockCount = previousComps[0]?.blockCount;
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
          },
          metaphorLibrary: projectMetaphors,
          titleStructures,
          controlLog: previousComps,
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
      const midCtaAsset  = data.midCta?.id ? ctas.find(c => c.id === data.midCta.id) : null;

      // ── HARD ENFORCE: duration must be within [minDuration, maxDuration] ──────
      const aiMinutes  = data.estimatedDurationMinutes;
      const finalMinutes = (aiMinutes && aiMinutes >= minDuration && aiMinutes <= maxDuration)
        ? aiMinutes
        : Math.floor(Math.random() * (maxDuration - minDuration + 1)) + minDuration;
      if (!aiMinutes || aiMinutes < minDuration || aiMinutes > maxDuration) {
        console.warn(`[V15 Enforce] AI duration ${aiMinutes} outside [${minDuration}, ${maxDuration}] → corrected to ${finalMinutes}`);
      }
      // estimatedChars ALWAYS derived from finalMinutes to keep duration/chars in sync
      const estimatedChars = finalMinutes * 1200;

      const VALID_VOICES = ['Desafio Direto', 'Vulnerabilidade', 'Diagnóstico Técnico'] as const;
      let rawBlocks: AssemblerBlock[] = (data.blocks || []).map((b: any, i: number) => ({
        id: `ai-block-${i}`,
        name: b.name || `Bloco ${i + 1}`,
        missionNarrative: b.missionNarrative || '',
        voiceStyle: (VALID_VOICES.includes(b.voiceStyle) ? b.voiceStyle : VALID_VOICES[i % 3]) as AssemblerBlock['voiceStyle'],
        type: 'Metaphor' as const,
        isNarrativeTwist: !!b.isNarrativeTwist,
        blockChars: b.blockChars || Math.floor(estimatedChars / Math.max(data.blocks.length + 2, 1)),
        bridgeInstruction: b.bridgeInstruction || undefined,
        communityElement: b.communityElement || undefined,
      }));

      // ── HARD ENFORCE: block count must be within [minBlocks, maxBlocks] ───────
      if (rawBlocks.length < minBlocks) {
        console.warn(`[V15 Enforce] AI returned ${rawBlocks.length} blocks but min is ${minBlocks} — padding`);
        const perBlock = Math.floor(estimatedChars / (minBlocks + 2));
        while (rawBlocks.length < minBlocks) {
          const i = rawBlocks.length;
          rawBlocks.push({
            id: `pad-block-${i}`,
            name: `Bloco ${i + 1}`,
            missionNarrative: 'Desenvolva este segmento aprofundando o tema central com exemplos concretos e dados do nicho.',
            voiceStyle: VALID_VOICES[i % 3],
            type: 'Metaphor' as const,
            isNarrativeTwist: false,
            blockChars: perBlock,
            bridgeInstruction: undefined,
            communityElement: undefined,
          });
        }
      }
      if (rawBlocks.length > maxBlocks) {
        console.warn(`[V15 Enforce] AI returned ${rawBlocks.length} blocks but max is ${maxBlocks} — truncating`);
        rawBlocks = rawBlocks.slice(0, maxBlocks);
      }
      const blocks = rawBlocks;
      const blockCount = blocks.length + 2; // +1 hook +1 CTA final

      const hookCode = (selectedHook?.id || 'HOOK').slice(0, 4).toUpperCase();
      const ctaCode  = (selectedCta?.id  || 'CTA' ).slice(0, 4).toUpperCase();
      const compositionLogId = `V15-${hookCode}-${ctaCode}-${Date.now().toString(36).toUpperCase()}`;

      setBriefing({
        title: chosenTheme,
        estimatedDuration: `~${finalMinutes} minutos`,
        estimatedChars,
        blockCount,
        dominantVoice: data.dominantVoice || blocks[0]?.voiceStyle || 'Diagnóstico Técnico',
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
        midCta: midCtaAsset ? {
          id: midCtaAsset.id,
          name: midCtaAsset.name || '—',
          pattern: midCtaAsset.content_pattern || midCtaAsset.description || '',
          position: data.midCta?.position ?? Math.floor(blocks.length / 2),
        } : undefined,
        blocks,
        compositionLogId,
        assetLog: {
          hook: selectedHook?.id || '',
          ctaFinal: selectedCta?.id || '',
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
            ].map(({ label, count, icon: Icon, color }) => (
              <div key={label} className="flex flex-col items-center p-3 bg-white/5 border border-white/10 rounded-xl">
                <Icon size={16} className={color} />
                <span className="text-lg font-black text-white mt-1">{count}</span>
                <span className="text-[11px] font-black uppercase tracking-widest text-white/30">{label}</span>
              </div>
            ))}
          </div>

          {/* API Warning */}
          <div className="flex items-start gap-3 p-3 bg-yellow-500/5 border border-yellow-500/20 rounded-xl">
            <Info size={14} className="text-yellow-400 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-yellow-300/70 font-bold leading-relaxed">
              {hooks.length === 0 || ctas.length === 0
                ? '⚠️ Biblioteca Narrativa sem ativos. Adicione Hooks e CTAs na Biblioteca Narrativa antes de montar a estrutura.'
                : '✓ Biblioteca detectada. O Gatekeeper irá validar estrategicamente o seu tema antes do shuffle.'}
            </p>
          </div>

          <button
            onClick={runGatekeeper}
            disabled={!theme.trim() || loading}
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
                { label: 'Blocos',     value: `${briefing.blocks.length} blocos` },
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
