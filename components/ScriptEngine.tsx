'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject, useProjectStore } from '@/lib/store/projectStore';
import { immutableInsert } from '@/lib/supabase-mutations';
import { Play, Save, Copy, Layout, Settings, MessageSquare, Sparkles, ChevronDown, Trash2, Plus, Database, PenTool, History, Zap, RotateCcw, ArrowLeft, Octagon, FileText } from 'lucide-react';
import {
  applyAssetRules,
  buildAssetStats,
  parseSrtToRows,
  sanitizeDownloadFileStem,
  buildPipelineResult,
  normalizeAssetType,
  parseSrtTimeToMs,
  type SrtAssetPipelineResult,
} from '@/lib/srt-asset-pipeline';
import {
  buildPostScriptTimelineContext,
  buildSeoChapterPlan,
  sanitizePostScriptPackage,
  type PostScriptPackage,
} from '@/lib/post-script-package';
import ProductionAssembler from './ProductionAssembler';
import ScrollToTopButton from './ScrollToTopButton';

interface ScriptBlock {
  id: string;
  type: 'Hook' | 'Context' | 'Development' | 'CTA' | 'SOP';
  title: string;
  content: string;
  sop?: string; // New field for production guidelines
}

type ExecutionMode = 'internal' | 'external';
type ScriptStage = 'blueprint' | 'final';
type SrtPipelineStepStatus = 'pending' | 'running' | 'done' | 'error';
type VideoCharacterMode = 'male' | 'female' | 'custom';

interface SrtPipelineObserverStep {
  key: 'upload' | 'csv' | 'assets' | 'prompts' | 'render' | 'persist';
  label: string;
  status: SrtPipelineStepStatus;
  detail: string;
}

interface ExecutionSnapshot {
  approvedTheme: string;
  approvedBriefing: any;
  scriptBlocks: ScriptBlock[];
  scriptStage: ScriptStage;
  assemblerActive: boolean;
  thumbnailDirective: {
    visualConcept: string;
    viralTitle: string;
    thumbnailPromptNoText: string;
    thumbnailPromptWithPtBrText: string;
    thumbnailTextPtBr: string;
    tags: string[];
  } | null;
  showThumbnailPanel: boolean;
  thumbnailUrl: string;
  executionMode: ExecutionMode;
  externalScriptText: string;
  externalScriptFileName: string;
  externalSourceLabel: string;
  externalSrtText: string;
  externalSrtFileName: string;
  videoCharacterMode: VideoCharacterMode;
  videoCharacterCustom: string;
  manualPublishDate: string;
  externalSrtPipeline: SrtAssetPipelineResult | null;
  externalSrtObserver: SrtPipelineObserverStep[];
  postScriptPackage: PostScriptPackage | null;
}

interface ScriptEngineProps {
  activeProject?: any;
  pendingData?: any;
  onClearPending?: () => void;
}

const mergeNarrativeComponents = (localItems: any[], remoteItems: any[]) => {
  const merged = new Map<string, any>();
  localItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  remoteItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  return Array.from(merged.values());
};

const componentSignature = (item: any) => {
  return [
    item?.type || '',
    item?.name || '',
    item?.description || '',
    item?.content_pattern || '',
    item?.category || '',
  ]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const dedupeNarrativeComponents = (items: any[]) => {
  const merged = new Map<string, any>();
  items.forEach((item) => {
    const key = componentSignature(item);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  });
  return Array.from(merged.values());
};

const describeNarrativeAssetReference = (
  label: string,
  asset?: { name?: string; description?: string; pattern?: string } | null
) => {
  if (!asset?.name && !asset?.description && !asset?.pattern) return '';

  const supportText = asset?.description || '';
  const assetName = asset?.name || label;

  return `${label}: preserve a funcao estrategica do ativo "${assetName}" e reinterprete com formulacao propria. Nao reutilize frases, slogans, exemplos ou estruturas literais da biblioteca.${supportText ? ` Intencao-base: ${supportText}` : ''}`;
};

const buildCommunityReferenceCatalog = (items: any[]) => {
  return items
    .map((item) => {
      const name = item?.name?.trim();
      const description = item?.description?.trim();
      if (name && description) return `${name}: ${description}`;
      return name || description || '';
    })
    .filter(Boolean)
    .join(' | ');
};

const describeNarrativeReference = (label: string, text?: string) => {
  if (!text) return '';
  return `${label}: use apenas como referencia funcional. Nao repita a formulacao literal do texto-base.`;
};

const buildInitialSrtObserver = (): SrtPipelineObserverStep[] => [
  { key: 'upload', label: 'SRT anexado', status: 'pending', detail: 'Aguardando upload do arquivo de legendas.' },
  { key: 'csv', label: 'CSV base', status: 'pending', detail: 'A timeline CSV ainda nao foi derivada do .srt.' },
  { key: 'assets', label: 'Marcacao de assets', status: 'pending', detail: 'As linhas ainda nao foram classificadas em texto, avatar, video ou imagem.' },
  { key: 'prompts', label: 'Prompts visuais', status: 'pending', detail: 'Os prompts para imagem e video ainda nao foram gerados.' },
  { key: 'render', label: 'Render de texto', status: 'pending', detail: 'A etapa 5 ainda nao renderizou os assets marcados como texto.' },
  { key: 'persist', label: 'Persistencia', status: 'pending', detail: 'Nada salvo ainda no snapshot desta execucao.' },
];

const inferScriptStageFromSnapshot = (snapshot: any): ScriptStage => {
  if (snapshot?.scriptStage === 'final' || snapshot?.scriptStage === 'blueprint') {
    return snapshot.scriptStage;
  }

  if (typeof snapshot?.externalScriptText === 'string' && snapshot.externalScriptText.trim()) {
    return 'final';
  }

  const joined = Array.isArray(snapshot?.scriptBlocks)
    ? snapshot.scriptBlocks.map((block: { content?: string }) => String(block?.content || '')).join('\n')
    : '';

  if (!joined) return 'blueprint';

  const blueprintMarkers = /funcao narrativa|postura obrigatoria|diretriz estrutural|camada de abertura de referencia|transicao obrigatoria/i;
  return blueprintMarkers.test(joined) ? 'blueprint' : 'final';
};

export default function ScriptEngine({ activeProject: propProject, pendingData, onClearPending }: ScriptEngineProps) {
  // Zustand store takes priority for data isolation
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;
  const activeAIConfig = (useProjectStore.getState() as any)?.activeAIConfig;

  const [selectedProject] = useState(activeProject?.name || 'Selecione um Projeto');
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [scriptStage, setScriptStage] = useState<ScriptStage>('blueprint');
  const [thumbnailDirective, setThumbnailDirective] = useState<ExecutionSnapshot['thumbnailDirective']>(null);
  const [approvedTheme, setApprovedTheme] = useState('');
  const [approvedBriefing, setApprovedBriefing] = useState<any | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    currentIndex: number;
    completedCount: number;
    total: number;
    currentTitle: string;
    status: string;
  } | null>(null);
  const [mobileTab, setMobileTab] = useState<'context' | 'main'>('main');
  const [executionHydrated, setExecutionHydrated] = useState(false);
  const [assemblerActive, setAssemblerActive] = useState(true);
  const [showThumbnailPanel, setShowThumbnailPanel] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(activeProject?.default_execution_mode === 'external' ? 'external' : 'internal');
  const [externalScriptText, setExternalScriptText] = useState('');
  const [externalScriptFileName, setExternalScriptFileName] = useState('');
  const [externalSourceLabel, setExternalSourceLabel] = useState('');
  const [externalSrtText, setExternalSrtText] = useState('');
  const [externalSrtFileName, setExternalSrtFileName] = useState('');
  const [videoCharacterMode, setVideoCharacterMode] = useState<VideoCharacterMode>('male');
  const [videoCharacterCustom, setVideoCharacterCustom] = useState('');
  const [textStyleMode, setTextStyleMode] = useState('auto');
  const [customTextStyle, setCustomTextStyle] = useState('');
  const [manualPublishDate, setManualPublishDate] = useState('');
  const [manualPublishDraftDate, setManualPublishDraftDate] = useState('');
  const [manualPublishDraftTime, setManualPublishDraftTime] = useState('');
  const [externalSrtPipeline, setExternalSrtPipeline] = useState<SrtAssetPipelineResult | null>(null);
  const [externalSrtObserver, setExternalSrtObserver] = useState<SrtPipelineObserverStep[]>(buildInitialSrtObserver);
  const [postScriptPackage, setPostScriptPackage] = useState<PostScriptPackage | null>(null);
  const [isProcessingSrtPipeline, setIsProcessingSrtPipeline] = useState(false);
  const [isRenderingTextAssets, setIsRenderingTextAssets] = useState(false);
  const [isGeneratingPostScriptPackage, setIsGeneratingPostScriptPackage] = useState(false);
  const [srtPipelineStatus, setSrtPipelineStatus] = useState('');
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isPostPackageExpanded, setIsPostPackageExpanded] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbnailPanelRef = useRef<HTMLDivElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationStoppedRef = useRef(false);
  
  // BI Traceability States
  const [components, setComponents] = useState<any[]>([]);
  const [componentsHydrated, setComponentsHydrated] = useState(false);
  const [selectedHookId, setSelectedHookId] = useState<string>('h_S1');
  const [selectedCtaId, setSelectedCtaId] = useState<string>('cta_default');
  const executionStorageKey = activeProject?.id ? `ws_script_execution_${activeProject.id}` : null;
  const defaultExecutionMode: ExecutionMode = activeProject?.default_execution_mode === 'external' ? 'external' : 'internal';

  const resolveThemeStatusFromPublishDate = (dateValue: string, fallbackStatus = 'scripted') => {
    if (!dateValue) return fallbackStatus;

    const selected = new Date(dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`);
    if (Number.isNaN(selected.getTime())) return fallbackStatus;

    const today = new Date();

    if (dateValue.includes('T')) {
      return selected.getTime() <= today.getTime() ? 'published' : 'scheduled';
    }

    const selectedDay = new Date(selected);
    selectedDay.setHours(0, 0, 0, 0);

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    if (selectedDay.getTime() < todayStart.getTime()) return 'published';
    if (selectedDay.getTime() > todayStart.getTime()) return 'scheduled';
    return 'scripted';
  };

  const getManualPublishDateParts = (dateValue: string) => {
    if (!dateValue) {
      return {
        date: '',
        time: '',
      };
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateValue)) {
      return {
        date: dateValue.slice(0, 10),
        time: dateValue.slice(11, 16),
      };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return {
        date: dateValue,
        time: '',
      };
    }

    return {
      date: '',
      time: '',
    };
  };

  const updateManualPublishDate = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      setManualPublishDate('');
      return;
    }

    if (nextTime) {
      setManualPublishDate(`${nextDate}T${nextTime}`);
      return;
    }

    setManualPublishDate(nextDate);
  };

  const composeManualPublishDate = (nextDate: string, nextTime: string) => {
    if (!nextDate) return '';
    if (nextTime) return `${nextDate}T${nextTime}`;
    return nextDate;
  };

  const formatManualPublishTrace = (dateValue: string) => {
    if (!dateValue) return 'Sem agendamento manual definido.';

    const parsed = new Date(dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;

    if (dateValue.includes('T')) {
      return parsed.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    }

    return parsed.toLocaleDateString('pt-BR');
  };

  useEffect(() => {
    void fetchComponents();
  }, [activeProject?.id]);

  useEffect(() => {
    const parts = getManualPublishDateParts(manualPublishDate);
    setManualPublishDraftDate(parts.date);
    setManualPublishDraftTime(parts.time);
  }, [manualPublishDate]);

  const readLocalNarrativeCache = (projectId?: string) => {
    if (!projectId) return [];

    const localData = localStorage.getItem(`ws_narrative_${projectId}`);
    if (!localData) return [];

    try {
      const parsed = JSON.parse(localData);
      return dedupeNarrativeComponents(Array.isArray(parsed) ? parsed : []);
    } catch (parseErr) {
      console.warn('[ScriptEngine] Local narrative cache invalid, ignoring cache.', parseErr);
      return [];
    }
  };

  const fetchComponents = async () => {
    if (!activeProject?.id) {
      setComponents([]);
      setComponentsHydrated(false);
      return;
    }

    const projectId = activeProject.id;
    const localItems = readLocalNarrativeCache(projectId);

    setComponents(localItems);
    setComponentsHydrated(true);

    try {
      if (supabase) {
        const THEME_CLOUD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!THEME_CLOUD_ID_PATTERN.test(projectId)) {
             console.warn('⚠️ O ID deste projeto não é compatível com a Nuvem (não é um UUID). O Sincronizador Backend está desativado para esta instância.', projectId);
             return;
        }

        const fetchPromise = supabase.from('narrative_components').select('*').eq('project_id', projectId);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase Timeout')), 8000));
        
        const response: any = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (response.error) throw response.error;
        
        const cloudData = response.data || [];
        const merged = dedupeNarrativeComponents(mergeNarrativeComponents(localItems, cloudData));
        
        // ⬆️ AUTO-PUSH UNSYNCED ITEMS TO CLOUD
        const cloudIds = new Set(cloudData.map((c: any) => c.id));
        const unsyncedItems = localItems.filter(l => l.id && !cloudIds.has(l.id));
        
        if (unsyncedItems.length > 0) {
          console.log(`[ScriptEngine] ⬆️ Auto-syncing ${unsyncedItems.length} pending local items to cloud...`);
          supabase.from('narrative_components').upsert(
            unsyncedItems.map(item => ({
              id: item.id || crypto.randomUUID(),
              project_id: projectId,
              type: item.type,
              name: item.name,
              description: item.description,
              content_pattern: item.content_pattern,
              category: item.category || item.type,
              behavior_flag: item.behavior_flag || 'rotative',
              usage_mode: item.usage_mode || 'when_compatible',
              is_active: item.is_active !== false,
              tags: item.tags || [],
              compatibility_notes: item.compatibility_notes || ''
            }))
          ).then(({ error: upsertError }: { error: any }) => {
            if (upsertError) {
              console.warn('⚠️ Falha no auto-sync ScriptEngine (em background):', upsertError.message || upsertError);
            } else {
              console.log('✅ Auto-sync concluído.');
            }
          });
        }

        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== JSON.stringify(localItems)) {
          setComponents(merged);
          localStorage.setItem(`ws_narrative_${projectId}`, mergedStr);
          console.log(`[ScriptEngine] ☁️ Background Sync applied: ${cloudData.length} cloud, ${merged.length} merged`);
        }
      }
    } catch (e: any) {
      console.warn('[ScriptEngine] Erro ao buscar/sincronizar componentes:', e.message);
      // keeps using localItems without resetting them
    }
  };

  const buildExecutionSnapshot = (overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
    approvedTheme,
    approvedBriefing,
    scriptBlocks,
    scriptStage,
    assemblerActive,
    thumbnailDirective,
    showThumbnailPanel,
    thumbnailUrl,
    executionMode,
    externalScriptText,
    externalScriptFileName,
    externalSourceLabel,
    externalSrtText,
    externalSrtFileName,
    videoCharacterMode,
    videoCharacterCustom,
    manualPublishDate,
    externalSrtPipeline,
    externalSrtObserver,
    postScriptPackage,
    ...overrides,
  });

  const saveManualThemeToBank = async (
    themeTitle: string,
    briefing: any,
    executionSnapshot?: ExecutionSnapshot
  ) => {
    if (!activeProject?.id || pendingData) return;

    const storageKey = `themes_${activeProject.id}`;
    const existingThemes = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const themeIndex = existingThemes.findIndex((item: any) =>
      item?.title?.trim().toLowerCase() === themeTitle.trim().toLowerCase()
    );
    const targetPublishDate = executionSnapshot?.manualPublishDate || manualPublishDate;
    const scheduleStatus = resolveThemeStatusFromPublishDate(targetPublishDate, 'scripted');

    const themePayload = {
      title: themeTitle,
      description: `Tema aprovado manualmente na Escrita Criativa para o projeto ${activeProject?.name || activeProject?.project_name || 'ativo'}.`,
      editorial_pillar: activeProject?.playlists?.tactical_journey?.[0]?.label || '',
      status: scheduleStatus,
      title_structure: briefing?.selectedTitleStructure?.name || '',
      selected_structure: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || '',
      title_structure_asset_id: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || null,
      pipeline_level: activeProject?.playlists?.tactical_journey?.[0]?.label || '',
      is_demand_vetted: true,
      is_persona_vetted: true,
      refined_title: themeTitle,
      priority: Number(existingThemes[themeIndex]?.priority || 0),
      notes: existingThemes[themeIndex]?.notes || 'Origem: tema manual aprovado na Escrita Criativa.',
      match_score: Number(briefing?.diagnostics?.noveltyScore || 0),
      demand_views: existingThemes[themeIndex]?.demand_views || '',
      production_assets: {
        source: 'script_engine_manual_approval',
        approved_at: new Date().toISOString(),
        hook_id: briefing?.assetLog?.hook || null,
        cta_id: briefing?.assetLog?.ctaFinal || null,
        title_structure_id: briefing?.assetLog?.titleStructure || null,
        narrative_curve_id: briefing?.selectedNarrativeCurve?.id || briefing?.assetLog?.narrativeCurve || null,
        argument_mode_id: briefing?.selectedArgumentMode?.id || briefing?.assetLog?.argumentMode || null,
        repetition_rule_ids: briefing?.selectedRepetitionRules?.map((rule: any) => rule.id) || [],
        block_count: briefing?.blockCount || briefing?.blocks?.length || null,
        duration_minutes: Number((briefing?.estimatedDuration || '').match(/\d+/)?.[0] || 0) || null,
        voice_pattern: briefing?.diagnostics?.locked?.voicePatternId || null,
        execution_mode: executionSnapshot?.executionMode || executionMode,
        external_script_text: executionSnapshot?.externalScriptText || '',
        external_file_name: executionSnapshot?.externalScriptFileName || '',
        external_source_label: executionSnapshot?.externalSourceLabel || '',
        external_srt_text: executionSnapshot?.externalSrtText || '',
        external_srt_file_name: executionSnapshot?.externalSrtFileName || '',
        target_publish_date: targetPublishDate || null,
        schedule_status: scheduleStatus,
        execution_snapshot: executionSnapshot || null,
      },
      project_id: activeProject.id,
      user_id: activeProject?.user_id || null,
      updated_at: new Date().toISOString(),
    };

    const localThemePayload = {
      ...themePayload,
      execution_mode: executionSnapshot?.executionMode || executionMode,
    };

    const nextThemes = [...existingThemes];
    if (themeIndex >= 0) {
      nextThemes[themeIndex] = { ...nextThemes[themeIndex], ...localThemePayload };
    } else {
      nextThemes.unshift({
        ...localThemePayload,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });
    }
    localStorage.setItem(storageKey, JSON.stringify(nextThemes));

    if (!supabase) return;

    try {
      const cloudThemePayload = {
        project_id: themePayload.project_id,
        user_id: themePayload.user_id,
        title: themePayload.title,
        description: themePayload.description,
        editorial_pillar: themePayload.editorial_pillar,
        status: themePayload.status,
        hook_id: null,
        title_structure: themePayload.title_structure,
        priority: themePayload.priority,
        notes: themePayload.notes,
        updated_at: themePayload.updated_at,
      };

      const existingRemote = await supabase
        .from('themes')
        .select('id')
        .eq('project_id', activeProject.id)
        .ilike('title', themeTitle)
        .limit(1);

      if (existingRemote.data && existingRemote.data[0]?.id) {
        await supabase.from('themes').update(cloudThemePayload).eq('id', existingRemote.data[0].id);
      } else {
        await supabase.from('themes').insert({
          ...cloudThemePayload,
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao sincronizar tema manual com o Banco de Temas.', error);
    }
  };

  useEffect(() => {
    if (!executionStorageKey || pendingData) {
      setExecutionHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(executionStorageKey);
      if (!raw) {
        setExecutionHydrated(true);
        return;
      }

      const snapshot = JSON.parse(raw);
      if (snapshot?.approvedTheme) setApprovedTheme(snapshot.approvedTheme);
      if (snapshot?.approvedBriefing) setApprovedBriefing(snapshot.approvedBriefing);
      const normalizedSnapshotBlocks = resolveSnapshotBlocks(snapshot);
      if (normalizedSnapshotBlocks.length > 0) {
        setScriptBlocks(normalizedSnapshotBlocks);
      }
      setScriptStage(inferScriptStageFromSnapshot(snapshot));
      if (typeof snapshot?.assemblerActive === 'boolean') setAssemblerActive(snapshot.assemblerActive);
      if (snapshot?.thumbnailDirective) setThumbnailDirective(snapshot.thumbnailDirective);
      if (typeof snapshot?.showThumbnailPanel === 'boolean') setShowThumbnailPanel(snapshot.showThumbnailPanel);
      if (typeof snapshot?.thumbnailUrl === 'string') setThumbnailUrl(snapshot.thumbnailUrl);
      if (snapshot?.executionMode === 'external' || snapshot?.executionMode === 'internal') setExecutionMode(snapshot.executionMode);
      if (typeof snapshot?.externalScriptText === 'string') setExternalScriptText(snapshot.externalScriptText);
      if (typeof snapshot?.externalScriptFileName === 'string') setExternalScriptFileName(snapshot.externalScriptFileName);
      if (typeof snapshot?.externalSourceLabel === 'string') setExternalSourceLabel(snapshot.externalSourceLabel);
      if (typeof snapshot?.externalSrtText === 'string') setExternalSrtText(snapshot.externalSrtText);
      if (typeof snapshot?.externalSrtFileName === 'string') setExternalSrtFileName(snapshot.externalSrtFileName);
      if (['male', 'female', 'custom'].includes(snapshot?.videoCharacterMode)) setVideoCharacterMode(snapshot.videoCharacterMode);
      if (typeof snapshot?.videoCharacterCustom === 'string') setVideoCharacterCustom(snapshot.videoCharacterCustom);
      if (typeof snapshot?.manualPublishDate === 'string') setManualPublishDate(snapshot.manualPublishDate);
      if (snapshot?.externalSrtPipeline) setExternalSrtPipeline(snapshot.externalSrtPipeline);
      if (Array.isArray(snapshot?.externalSrtObserver) && snapshot.externalSrtObserver.length > 0) setExternalSrtObserver(snapshot.externalSrtObserver);
      if (snapshot?.postScriptPackage) setPostScriptPackage(snapshot.postScriptPackage);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao restaurar execucao salva.', error);
    } finally {
      setExecutionHydrated(true);
    }
  }, [executionStorageKey, pendingData]);

  useEffect(() => {
    if (!executionStorageKey || !executionHydrated) return;

    const shouldPersist = !!approvedBriefing || !assemblerActive || !!approvedTheme;
    if (!shouldPersist) return;

    persistExecutionSnapshotLocally();
  }, [
    executionStorageKey,
    executionHydrated,
    approvedTheme,
    approvedBriefing,
    scriptBlocks,
    scriptStage,
    assemblerActive,
    thumbnailDirective,
    showThumbnailPanel,
    thumbnailUrl,
    executionMode,
    externalScriptText,
    externalScriptFileName,
    externalSourceLabel,
    externalSrtText,
    externalSrtFileName,
    videoCharacterMode,
    videoCharacterCustom,
    manualPublishDate,
    externalSrtPipeline,
    externalSrtObserver,
    postScriptPackage,
  ]);

  useEffect(() => {
    if (!executionHydrated) return;
    if (approvedBriefing || approvedTheme || externalScriptText || externalSrtText || !assemblerActive) return;
    setExecutionMode(defaultExecutionMode);
  }, [
    defaultExecutionMode,
    executionHydrated,
    approvedBriefing,
    approvedTheme,
    externalScriptText,
    externalSrtText,
    assemblerActive,
  ]);
  
  useEffect(() => {
    if (!executionHydrated) return;
    if (pendingData) {
      console.log('--- Assembler V4 Initializing from Content OS Kernel ---');
      
      const metaphorsStr = activeProject?.metaphor_library || '';
      const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
      const randomM = metaphors[Math.floor(Math.random() * metaphors.length)] || 'Conceito Central';
      
      const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
      const persona = activeProject?.persona_matrix || { demographics: 'Publico', pain_alignment: 'Problema' };
      const tactical_journey = activeProject?.playlists?.tactical_journey || [];

      const v4Blocks: ScriptBlock[] = [
        { 
          id: 'h1', 
          type: 'Hook', 
          title: `Hook Estrategico [${pendingData.title_structure || pendingData.selected_structure || 'S1'}]`, 
          content: pendingData.refined_title || pendingData.title || '',
          sop: `Estilo: ${sop.zoom_style}. Ritmo: ${sop.cut_rhythm}. Impacto visual imediato no gancho.` 
        },
        { 
          id: 'c1', 
          type: 'Context', 
          title: 'Conexao com a Persona', 
          content: `Vincular o tema [${pendingData.title || pendingData.raw_theme || ''}] com o perfil [${persona.demographics}] e a dor central: ${persona.pain_alignment}.`,
          sop: `Trilha: ${sop.soundtrack}. Tom empatico. Camera focada para gerar conexao.`
        }
      ];

      // Dynamic Funnel Ingestion (T1-T3)
      tactical_journey.forEach((module: any, idx: number) => {
        v4Blocks.push({
          id: `module-${idx}`,
          type: 'Development',
          title: `Bloco ${module.label}: ${module.title}`,
          content: `Injetar metafora: ${randomM}. Desenvolver ${module.title}: ${module.value || 'Focar na solucao tecnica'}.`,
          sop: `Ritmo: ${sop.cut_rhythm}. Use overlays de texto para os termos da Metaphor Library.`
        });
      });

      v4Blocks.push({ 
        id: 'cta1', 
        type: 'CTA', 
        title: 'Conversao PUC', 
        content: `CTA Estrategico: transicao para a Promessa Unica (PUC) - ${activeProject?.puc}. Chamar para a acao especifica do projeto.`,
        sop: 'Split screen ou CTA visual. Encerramento com a trilha em crescendo.'
      });

      setScriptBlocks(v4Blocks);
      setScriptStage('blueprint');
      setPostScriptPackage(null);
      onClearPending?.();
      setAssemblerActive(false); // Move to editor once pending data arrives
    } else if (scriptBlocks.length === 0 && !approvedBriefing) {
      setScriptBlocks([
        { id: 'h0', type: 'Hook', title: 'Gancho Estrategico', content: 'Inicie com uma promessa tecnica...', sop: 'Corte seco.' },
        { id: 'c0', type: 'Context', title: 'Contextualizacao', content: 'Conecte com a dor do publico...', sop: 'B-roll de contexto.' }
      ]);
    }
  }, [pendingData, activeProject?.id, executionHydrated, approvedBriefing, scriptBlocks.length]);

  const formatCharsLabel = (value?: number | null) => {
    if (!value || value <= 0) return 'Nao definido';
    return `~${Math.round(value).toLocaleString('pt-BR')} caracteres`;
  };

  const buildExternalWritingPrompt = () => {
    if (!approvedBriefing) return '';

    const minutes = Number((approvedBriefing.estimatedDuration || '').match(/\d+/)?.[0] || 0);
    const totalChars = Number(approvedBriefing.estimatedChars || (minutes ? minutes * 1200 : 0)) || 0;
    const hookChars = Number(approvedBriefing.hookChars || Math.floor(totalChars * 0.08)) || 0;
    const ctaBudget = Number(approvedBriefing.ctaChars || Math.floor(totalChars * 0.06)) || 0;
    const hasMidCta = !!approvedBriefing?.midCta;
    const midCtaChars = hasMidCta ? Math.max(160, Math.floor(ctaBudget * 0.45)) : 0;
    const finalCtaChars = hasMidCta ? Math.max(220, ctaBudget - midCtaChars) : ctaBudget;
    const bodyBlocks = Array.isArray(approvedBriefing?.blocks) ? approvedBriefing.blocks : [];
    const promptBlocks = scriptBlocks.filter((block) => block.type === 'Development');
    const centralDevelopmentBlocks = bodyBlocks.length || promptBlocks.length;
    const totalOutputBlocks = centralDevelopmentBlocks;
    const communityReferenceCatalog = buildCommunityReferenceCatalog(uniqueCommunityTemplates);
    const projectName = activeProject?.name || activeProject?.project_name || 'Projeto ativo';
    const persona = activeProject?.persona_matrix?.demographics || '';
    const pain = activeProject?.persona_matrix?.pain_alignment || '';
    const metaphors = activeProject?.metaphor_library || '';
    const sop = activeProject?.editing_sop || {};
    const selectedNarrativeCurve = approvedBriefing?.selectedNarrativeCurve;
    const selectedArgumentMode = approvedBriefing?.selectedArgumentMode;
    const selectedRepetitionRules = (approvedBriefing?.selectedRepetitionRules || []) as Array<{ id?: string; name?: string; pattern?: string; description?: string }>;
    const hookTensionMap = {
      tensionLevel: 'Alta',
      narrativeRole: 'Ruptura',
      transitionMode: 'Contraste',
    };
    const ctaTensionMap = {
      tensionLevel: 'Media',
      narrativeRole: 'Fechamento',
      transitionMode: 'Convocacao',
    };

    const narrativeArcSummary = bodyBlocks
      .map((block: any, index: number) => `Desenvolvimento ${index + 1}: ${block.tensionLevel || 'Media'} / ${block.narrativeRole || 'Diagnostico'} / ${block.transitionMode || 'Consequencia'}`)
      .join('\n');

    const extractPrimaryDirective = (content?: string) => {
      if (!content) return 'Nao definido';
      const filtered = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/^(Desenvolver:|Elemento de comunidade:|Estrutura de titulo|Camada de abertura de referencia:|Camada final de conversao de referencia:|Hook de referencia:|CTA de referencia:|Objetivo:|Conecte com a PUC:)/i.test(line));
      return filtered[0] || content.trim();
    };

    const buildAlignedBridgeInstruction = (
      nextBlock?: ScriptBlock,
      nextNarrativeBlock?: { narrativeRole?: string } | null
    ) => {
      if (!nextBlock) {
        return 'Transicao obrigatoria: feche com sensacao de conclusao natural, sem corte brusco e sem parecer encerramento apressado.';
      }

      const roleKey = (nextNarrativeBlock?.narrativeRole || '').toLowerCase();
      const roleGuidance =
        roleKey === 'espelho'
          ? 'abrindo espaco para identificacao, intimidade ou reconhecimento sem reiniciar o tema'
          : roleKey === 'diagnostico'
            ? 'transformando o que veio antes em mecanismo, leitura causal ou clareza estrutural'
            : roleKey === 'virada'
              ? 'criando uma mudanca perceptivel de eixo, revelacao ou decisao'
              : roleKey === 'aplicacao'
                ? 'convertendo insight em acao pratica, experimento ou protocolo'
                : roleKey === 'fechamento'
                  ? 'condensando o raciocinio em compromisso, sintese e convocacao'
                  : 'fazendo o proximo bloco parecer continuidade natural, e nao um novo comeco';

      return `Transicao obrigatoria: termine este bloco preparando a entrada de "${nextBlock.title}" como evolucao direta do raciocinio atual, ${roleGuidance}.`;
    };

    const buildExecutionPosture = (
      voiceStyle?: string,
      narrativeRole?: string
    ) => {
      const voiceGuidance =
        voiceStyle === 'Desafio Direto'
          ? 'fale em segunda pessoa, com urgencia clara, comando pratico e confronto sem agressividade vazia'
          : voiceStyle === 'Vulnerabilidade'
            ? 'fale em primeira pessoa, com cena concreta, vulnerabilidade real e intimidade sem melodrama'
            : 'fale em terceira pessoa tecnica, mostrando mecanismo, criterio observavel e impacto mensuravel';

      const roleGuidance =
        narrativeRole === 'Ruptura'
          ? 'abra quebrando a inercia e expondo a tensao central logo no primeiro paragrafo'
          : narrativeRole === 'Espelho'
            ? 'priorize identificacao, reconhecimento e proximidade emocional antes de ampliar a explicacao'
            : narrativeRole === 'Diagnostico'
              ? 'priorize causa, mecanismo e leitura estrutural antes de prescrever'
              : narrativeRole === 'Virada'
                ? 'introduza uma mudanca perceptivel de eixo, verdade contraintuitiva ou decisao irreversivel'
                : narrativeRole === 'Aplicacao'
                  ? 'converta o raciocinio em experimento, checklist, protocolo ou decisao executavel'
                  : 'sintetize, convoque e conclua com sensacao de fechamento natural';

      return `Postura obrigatoria: ${voiceGuidance}; ${roleGuidance}.`;
    };

    let developmentIndex = 0;
    const blockSpecifications = promptBlocks.map((block, index) => {
      const previousBlock = promptBlocks[index - 1];
      const nextBlock = promptBlocks[index + 1];
      const connectionLines = [
        previousBlock
          ? `Conexao de entrada: este bloco deve continuar naturalmente o raciocinio de "${previousBlock.title}", sem reiniciar o assunto nem repetir a mesma promessa.`
          : 'Conexao de entrada: este e o bloco de abertura e precisa iniciar o roteiro com impacto imediato, sem preambulo generico.',
      ];

      const currentDevelopmentIndex = developmentIndex++;
      const orchestratedBlock = bodyBlocks[currentDevelopmentIndex];
      const nextNarrativeBlock = nextBlock ? bodyBlocks[currentDevelopmentIndex + 1] : null;
      const blockLines = [
        `BLOCO ${index + 1} - DESENVOLVIMENTO`,
        `Titulo interno: ${block.title}`,
        `Meta de caracteres: ${formatCharsLabel((orchestratedBlock?.blockChars || 0) + (index === 0 ? hookChars : 0) + (index === promptBlocks.length - 1 ? finalCtaChars : 0) + (hasMidCta && index === Number(approvedBriefing?.midCta?.position || -1) ? midCtaChars : 0))}`,
        `Voz dominante: ${orchestratedBlock?.voiceStyle || approvedBriefing?.dominantVoice || 'Nao definida'}`,
        `Mapa de tensao: ${orchestratedBlock?.tensionLevel || 'Media'} | Papel: ${orchestratedBlock?.narrativeRole || 'Diagnostico'} | Transicao: ${orchestratedBlock?.transitionMode || 'Consequencia'}`,
        `Funcao narrativa: ${orchestratedBlock?.missionNarrative || block.content}`,
        buildExecutionPosture(orchestratedBlock?.voiceStyle, orchestratedBlock?.narrativeRole),
        `Diretriz estrutural: ${extractPrimaryDirective(block.content)}`,
        `SOP / entonacao: ${block.sop || 'Nao definido'}`,
        ...connectionLines,
        buildAlignedBridgeInstruction(nextBlock, nextNarrativeBlock),
      ];

      if (orchestratedBlock?.communityElement) {
        blockLines.push('Elemento de comunidade: use apenas como gatilho de pertencimento e identificacao coletiva, sem repetir a formulacao literal da biblioteca.');
      }

      if (orchestratedBlock?.isNarrativeTwist) {
        blockLines.push('Observacao: este e o bloco de virada narrativa e precisa marcar mudanca perceptivel de tensao ou perspectiva.');
      }

      return blockLines.join('\n');
    });

    const midCtaSection = hasMidCta
      ? [
          'INTERVENCAO INTERMEDIARIA OBRIGATORIA',
          `Insercao: embuta esta microchamada na passagem apos o bloco de desenvolvimento ${Number(approvedBriefing?.midCta?.position || 0) + 1}, sem criar um novo bloco numerado.`,
          `Meta de caracteres: ${formatCharsLabel(midCtaChars)}`,
          'Mapa de tensao: Media | Papel: Aplicacao | Transicao: Alivio',
          `Funcao narrativa: inserir uma microchamada baseada no ativo "${approvedBriefing?.midCta?.name || 'CTA intermediario'}", curta, organica e sem soar comercial demais.`,
          `Referencia funcional: ${approvedBriefing?.midCta?.pattern || 'Nao definida'}`,
          'Regra operacional: isso faz parte da engenharia do roteiro, mas nao conta como bloco adicional na numeracao final.',
        ].join('\n')
      : '';

    const lockedCompositionSection = approvedBriefing?.diagnostics ? [
      `Camada de abertura selecionada: ${approvedBriefing?.openingHook?.name || 'Nao definida'}`,
      `Camada final de conversao selecionada: ${approvedBriefing?.selectedCta?.name || 'Nao definida'}`,
      `Estrutura selecionada: ${approvedBriefing?.selectedTitleStructure?.name || 'Nao definida'}`,
      `Curva selecionada: ${selectedNarrativeCurve?.name || 'Nao definida'}`,
      `Modo de argumentacao: ${selectedArgumentMode?.name || 'Nao definido'}`,
      `Padrao de voz dominante: ${approvedBriefing?.diagnostics?.locked?.voicePatternId || 'Nao definido'}`,
      `Duracao alvo: ${approvedBriefing?.diagnostics?.locked?.durationMinutes || minutes || 'N/A'} min`,
      `Total de blocos na saida final: ${totalOutputBlocks || 'N/A'}`,
      `Blocos centrais de desenvolvimento: ${centralDevelopmentBlocks || 'N/A'}`,
    ].join('\n') : 'Composicao guiada pelo projeto ativo, sem diagnostico adicional disponivel.';

    const repetitionRulesSection = selectedRepetitionRules.length > 0
      ? selectedRepetitionRules
          .map((rule) => `- ${rule.name}: ${rule.pattern || 'Sem detalhe operacional.'}`)
          .join('\n')
      : '- Nenhuma regra adicional cadastrada.';

    return `Voce vai escrever um roteiro completo fora desta plataforma, mas precisa obedecer fielmente ao blueprint abaixo.

OBJETIVO
- Produzir um roteiro final humano, natural e variado.
- Respeitar a engenharia narrativa definida pelo orquestrador.
- Tratar a camada de abertura, a camada final de conversao, a estrutura de titulo e os elementos de comunidade apenas como referencia funcional e semantica.
- Nunca copiar literalmente frases, slogans, quotes, patterns ou construcoes reconheciveis vindas da biblioteca narrativa.
- Fazer os blocos soarem como uma fala continua de um humano, nao como pecas coladas.
- Tratar a curva narrativa como progressao macro obrigatoria do roteiro.
- Tratar o modo de argumentacao como a postura dominante de persuasao, sem soar mecanico.
- Obedecer as regras de repeticao ativas como restricoes duras de escrita.

CONTEXTO ESSENCIAL
- Projeto ativo: ${projectName}
- Tema do video: ${approvedBriefing.title}
- PUC: ${activeProject?.puc || 'Nao definida'}
- Persona: ${persona || 'Nao definida'}
- Dor central: ${pain || 'Nao definida'}
- Estrutura de titulo selecionada: ${approvedBriefing?.selectedTitleStructure?.name || 'Nao definida'}
- Pattern estrutural da estrutura: ${approvedBriefing?.selectedTitleStructure?.pattern || 'Nao definido'}
- Duracao alvo: ${minutes || 'N/A'} minutos
- Meta total de caracteres: ${formatCharsLabel(totalChars)}
- SOP base: corte ${sop.cut_rhythm || 'Nao definido'}, zoom ${sop.zoom_style || 'Nao definido'}, trilha ${sop.soundtrack || 'Nao definido'}
- Metaforas do projeto: ${metaphors || 'Nao definidas'}
- Elementos de comunidade disponiveis: ${communityReferenceCatalog || 'Nao definidos'}

DIRECAO ORQUESTRADA
${lockedCompositionSection}
- Blueprint macro da curva: ${selectedNarrativeCurve?.pattern || 'Nao definido'}
- Diretriz do argumento: ${selectedArgumentMode?.pattern || 'Nao definida'}
- A camada de abertura deve viver no inicio do primeiro bloco, e a camada final de conversao deve fechar o ultimo bloco, sem criar blocos extras.
${hasMidCta ? '- Se houver intervencao intermediaria, ela deve ser embutida na passagem indicada, sem virar bloco extra.\n' : ''}
RESTRICOES DE REPETICAO
${repetitionRulesSection}
- Os nomes dos ativos, blocos e conceitos neste briefing funcionam como rotulos operacionais internos.
- Nao reutilize esses nomes no corpo do roteiro so porque eles aparecem aqui.
- Se precisar usar um conceito canonico pelo nome, faca isso no maximo uma vez no roteiro inteiro; depois continue por parafrase, efeito narrativo ou exemplo concreto.
- Priorize cenas, linguagem oral, contraste humano e observacoes concretas acima do jargao do sistema.

MAPA DE TENSAO NARRATIVA
- Cada bloco recebe uma funcao de energia e progressao.
- Tensao Alta: ruptura, choque, desafio, virada, confronto ou revelacao forte.
- Tensao Media: aprofundamento, explicacao, espelho emocional, desenvolvimento e aplicacao.
- Tensao Baixa: respiro controlado, estabilizacao ou preparacao de fechamento.
- Papel narrativo: define o trabalho do bloco dentro da curva dramatica.
- Transicao: define como o bloco deve empurrar o proximo, evitando texto compartimentado.

CURVA DEFINIDA PELO ORQUESTRADOR
${centralDevelopmentBlocks > 0 ? '- A curva abaixo vale para os blocos centrais de desenvolvimento; a abertura e o fechamento funcionam como camadas narrativas acopladas ao primeiro e ao ultimo bloco.\n' : ''}${narrativeArcSummary || 'Curva narrativa nao definida.'}

REGRAS GERAIS DE ESCRITA
- Preserve a funcao de cada bloco exatamente na ordem fornecida.
- Respeite a meta de caracteres de cada bloco com tolerancia maxima de 8%.
- O texto final deve soar humano, nao robotico, nem excessivamente polido.
- Nao repetir textualmente as referencias narrativas.
- Manter conexoes naturais entre blocos.
- Cada bloco deve herdar o impulso do anterior e entregar uma ponte real para o proximo.
- Evite abertura redundante no inicio de cada bloco. O leitor nao pode sentir reinicio entre as partes.
- Nao use os titulos internos dos blocos como frases prontas do texto final.
- Use transicoes humanas: consequencia, contraste, aprofundamento, confissao, diagnostico, objecao respondida ou preparacao pratica.
- Se um bloco trouxer vulnerabilidade, o proximo precisa aproveitar essa emocao e converte-la em raciocinio, nao trocar abruptamente de tom.
- Se um bloco trouxer diagnostico, o proximo precisa parecer resposta ou evolucao natural desse diagnostico.
- Quando houver qualquer ambiguidade entre a funcao narrativa e a redacao bruta do bloco, obedeca primeiro a postura obrigatoria e a voz dominante declarada.
- Marcadores explicitos de narracao devem ser tratados como prioridade maxima: primeira pessoa para vulnerabilidade, segunda pessoa para desafio direto e terceira pessoa para diagnostico tecnico.
- Sempre que possivel, transforme abstracao em cena, sintoma observavel, metrica simples ou decisao concreta.
- O roteiro completo precisa parecer escrito de uma vez so, com progressao, cadencia e memoria interna.
- Nao devolver explicacoes, rotulos tecnicos, markdown ou comentarios sobre o processo.
- Entregar o roteiro final separado por blocos, na mesma ordem abaixo.

BLUEPRINT BLOCO A BLOCO
${blockSpecifications.join('\n\n')}${midCtaSection ? `\n\n${midCtaSection}` : ''}

FORMATO DE SAIDA
- A saida final deve conter exatamente ${totalOutputBlocks || 'N/A'} blocos numerados, na ordem abaixo.
- Entregue um bloco por vez, na mesma sequencia especificada.
- Use o titulo interno de cada bloco apenas como cabecalho operacional.
- Em cada bloco, escreva somente o texto final correspondente.
- Nao omita nenhum bloco.
- Nao fundir blocos.
- Nao mudar a ordem.
- Nao criar bloco extra fora da numeracao definida.
- Nao reduzir a ambicao dos caracteres sem justificativa estrutural.`;
  };

  const buildInternalWritingPrompt = () => {
    const externalPrompt = buildExternalWritingPrompt();
    if (!externalPrompt) return '';

    return `${externalPrompt}

MODO DE RETORNO PARA PRODUCAO NO APLICATIVO
- Retorne o roteiro completo em texto puro.
- Preserve exatamente a mesma quantidade de blocos do blueprint.
- Use os cabecalhos BLOCO 1, BLOCO 2, BLOCO 3... ate o ultimo bloco.
- Em cada bloco, entregue apenas o texto final daquele bloco.
- Nao adicione comentarios, observacoes, introducao extra, notas ao editor ou explicacoes fora dos blocos.
- O resultado precisa ser facilmente separavel por bloco dentro do aplicativo.`;
  };

  const getCommandContext = () => {
    const theme = approvedBriefing?.title || approvedTheme || pendingData?.title || pendingData?.raw_theme || '';
    const variation = approvedBriefing?.selectedTitleStructure?.name || pendingData?.title_structure || pendingData?.selected_structure || 'S1';
    return { theme, variation };
  };

  const syncApprovedThemeSnapshot = async (overrides: Partial<ExecutionSnapshot> = {}) => {
    if (!approvedBriefing || !approvedTheme) return;
    try {
      await saveManualThemeToBank(
        approvedTheme,
        approvedBriefing,
        buildExecutionSnapshot(overrides)
      );
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao atualizar snapshot do tema aprovado.', error);
    }
  };

  const applyManualPublishRegistration = async () => {
    const nextValue = composeManualPublishDate(manualPublishDraftDate, manualPublishDraftTime);
    setManualPublishDate(nextValue);

    if (approvedBriefing && approvedTheme) {
      await syncApprovedThemeSnapshot({ manualPublishDate: nextValue });
    }
  };

  const resolveSnapshotBlocks = (snapshot: any): ScriptBlock[] => {
    if (Array.isArray(snapshot?.scriptBlocks) && snapshot.scriptBlocks.length > 0) {
      return snapshot.scriptBlocks;
    }

    if (snapshot?.approvedBriefing && Number(snapshot?.approvedBriefing?.blockCount || 0) > 0) {
      return buildScriptBlocksFromBriefing(snapshot.approvedBriefing, snapshot?.approvedTheme || '');
    }

    return [];
  };

  const persistExecutionSnapshotLocally = (overrides: Partial<ExecutionSnapshot> = {}) => {
    if (!executionStorageKey) return;

    const snapshot = {
      ...buildExecutionSnapshot(overrides),
      updated_at: new Date().toISOString(),
    };

    localStorage.setItem(executionStorageKey, JSON.stringify(snapshot));
  };

  const buildScriptBlocksFromBriefing = (briefing: any, theme: string): ScriptBlock[] => {
    const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
    const hookReference = describeNarrativeAssetReference('Camada de abertura de referencia', briefing.openingHook);
    const ctaReference = describeNarrativeAssetReference('Camada final de conversao de referencia', briefing.selectedCta);
    const structureReference = describeNarrativeAssetReference('Estrutura de titulo', briefing.selectedTitleStructure);
    const midCtaPosition = Number(briefing?.midCta?.position ?? -1);

    return (briefing?.blocks || []).map((b: any, i: number) => {
      const openingLayer = i === 0
        ? `Abra este primeiro bloco incorporando a camada de abertura abaixo, sem copiar a formulacao original e sem transformar isso em um bloco separado.\n\n${hookReference}\n`
        : '';
      const midCtaLayer = briefing?.midCta && i === midCtaPosition
        ? `\n\nIntervencao intermediaria obrigatoria: embuta uma microchamada organicamente na passagem deste bloco, sem criar novo bloco numerado.\nReferencia funcional: ${briefing.midCta.pattern || 'Nao definida'}`
        : '';
      const closingLayer = i === ((briefing?.blocks?.length || 1) - 1)
        ? `\n\nFechamento obrigatorio: encerre este ultimo bloco incorporando a camada final de conversao abaixo, sem separar isso em um bloco adicional.\n\n${ctaReference}\n\nConecte com a PUC: ${activeProject?.puc || 'DNA do projeto'}`
        : '';

      return {
        id: `block_${i}_${b.id}`,
        type: 'Development' as const,
        title: `${b.name} [${b.voiceStyle}]`,
        content: `${openingLayer}${b.missionNarrative}\n\nDesenvolver: ${b.name}.\n${b.communityElement ? 'Elemento de comunidade: use apenas como gatilho de identificacao coletiva e pertencimento, sem repetir a frase-base cadastrada.\n' : ''}${structureReference}${midCtaLayer}${closingLayer}`,
        sop: `Voz: ${b.voiceStyle}. Trilha: ${sop.soundtrack}. Use sobreposicao de texto tecnico.`,
      };
    });
  };

  const parseExternalScriptSections = (text: string) => {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const explicitSections = normalized
      .split(/(?=^\s*(?:\*\*)?BLOCO\s+\d+)/gim)
      .map((section) => section.replace(/^\s*(?:\*\*)?BLOCO\s+\d+[^\n]*\n?/i, '').trim())
      .filter(Boolean);

    if (explicitSections.length > 0) return explicitSections;

    return normalized
      .split(/\n{2,}/)
      .map((section) => section.trim())
      .filter(Boolean);
  };

  const segmentExternalScriptForBlocks = (text: string, targetCount: number) => {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const sections = parseExternalScriptSections(normalized);
    if (sections.length >= Math.min(2, targetCount) || targetCount <= 1) {
      return sections;
    }

    const sentences =
      normalized
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
        ?.map((sentence) => sentence.trim())
        .filter(Boolean) || [normalized];

    const desiredCount = Math.min(Math.max(1, targetCount), sentences.length);
    if (desiredCount <= 1) return [normalized];

    const chunkSize = Math.ceil(sentences.length / desiredCount);
    return Array.from({ length: desiredCount }, (_, index) =>
      sentences
        .slice(index * chunkSize, (index + 1) * chunkSize)
        .join(' ')
        .trim()
    ).filter(Boolean);
  };

  const applyExternalScriptToBlocks = async (text: string, fileName?: string) => {
    const targetCount = Math.max(1, scriptBlocks.length || approvedBriefing?.blocks?.length || 1);
    const sections = segmentExternalScriptForBlocks(text, targetCount);
    if (sections.length === 0) {
      alert('Nao encontrei blocos ou secoes suficientes no texto externo.');
      return;
    }

    const nextBlocks = scriptBlocks.map((block, index) => ({
      ...block,
      content: sections[index] || block.content,
    }));

    setScriptBlocks(nextBlocks);
    setScriptStage('final');
    setPostScriptPackage(null);
    setExternalScriptText(text);
    if (fileName) setExternalScriptFileName(fileName);
    persistExecutionSnapshotLocally({
      scriptBlocks: nextBlocks,
      scriptStage: 'final',
      externalScriptText: text,
      externalScriptFileName: fileName || externalScriptFileName,
      executionMode: 'external',
      externalSrtText,
      externalSrtFileName,
      postScriptPackage: null,
    });

    await syncApprovedThemeSnapshot({
      scriptBlocks: nextBlocks,
      scriptStage: 'final',
      externalScriptText: text,
      externalScriptFileName: fileName || externalScriptFileName,
      executionMode: 'external',
      externalSrtText,
      externalSrtFileName,
      postScriptPackage: null,
    });

    alert('Roteiro externo aplicado aos blocos atuais.');
  };

  const handleExternalScriptUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setExecutionMode('external');
      setExternalScriptFileName(file.name);
      setExternalScriptText(text);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText: text,
        externalScriptFileName: file.name,
        externalSrtText,
        externalSrtFileName,
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao ler arquivo externo.', error);
      alert('Nao foi possivel ler o arquivo .txt enviado.');
    } finally {
      event.target.value = '';
    }
  };

  const handleExternalSrtUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setExecutionMode('external');
      setExternalSrtFileName(file.name);
      setExternalSrtText(text);
      setExternalSrtPipeline(null);
      const nextObserver = buildInitialSrtObserver().map((step) =>
        step.key === 'upload'
          ? { ...step, status: 'done' as const, detail: `Arquivo ${file.name} anexado e persistido nesta execucao.` }
          : step
      );
      setExternalSrtObserver(nextObserver);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText: text,
        externalSrtFileName: file.name,
        externalSrtPipeline: null,
        externalSrtObserver: nextObserver,
      });
      void syncApprovedThemeSnapshot({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText: text,
        externalSrtFileName: file.name,
        externalSrtPipeline: null,
        externalSrtObserver: nextObserver,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar SRT externo.', error);
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao ler arquivo .srt.', error);
      alert('Nao foi possivel ler o arquivo .srt enviado.');
    } finally {
      event.target.value = '';
    }
  };

  const copyTextToClipboard = async (value: string, successMessage: string) => {
    if (!value.trim()) {
      alert('Nao ha conteudo disponivel para copiar.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      alert(successMessage);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao copiar conteudo.', error);
      alert('Nao foi possivel copiar o conteudo.');
    }
  };

  const updateSrtObserverStep = (
    key: SrtPipelineObserverStep['key'],
    status: SrtPipelineStepStatus,
    detail: string
  ) => {
    setExternalSrtObserver((current) =>
      current.map((step) => (step.key === key ? { ...step, status, detail } : step))
    );
  };

  const downloadTextArtifact = (
    stem: string,
    suffix: string,
    content: string,
    options?: { extension?: 'txt' | 'csv' | 'bat'; mimeType?: string }
  ) => {
    if (!content.trim()) {
      alert('Nao ha conteudo disponivel para exportar.');
      return;
    }

    const safeStem = sanitizeDownloadFileStem(stem);
    const extension = options?.extension || 'txt';
    const mimeType = options?.mimeType || 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeStem}_${suffix}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const processAttachedSrtAssets = async () => {
    if (!externalSrtText.trim()) {
      alert('Anexe um arquivo .srt antes de processar os assets.');
      return;
    }

    if (videoCharacterMode === 'custom' && !videoCharacterCustom.trim()) {
      alert('Descreva o personagem personalizado antes de processar os prompts de video.');
      return;
    }

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    setIsProcessingSrtPipeline(true);
    setSrtPipelineStatus('Lendo o .srt anexado e preparando a timeline base...');
    updateSrtObserverStep('upload', 'done', externalSrtFileName ? `Arquivo ${externalSrtFileName} pronto para processamento.` : 'Arquivo .srt anexado e pronto para processamento.');
    updateSrtObserverStep('csv', 'running', 'Convertendo o .srt em linhas estruturadas da timeline CSV...');
    updateSrtObserverStep('assets', 'pending', 'Aguardando a classificacao heuristica dos assets.');
    updateSrtObserverStep('prompts', 'pending', 'Aguardando a geracao dos prompts visuais.');
    updateSrtObserverStep('render', 'pending', 'Aguardando a etapa 5 para renderizar os assets de texto.');
    updateSrtObserverStep('persist', 'pending', 'Aguardando persistencia local do resultado.');

    try {
      const parsedRows = parseSrtToRows(externalSrtText);
      if (!parsedRows.length) {
        throw new Error('Nao foi possivel extrair blocos validos do .srt enviado.');
      }

      updateSrtObserverStep('csv', 'done', `${parsedRows.length} linha(s) derivadas do .srt e prontas para o CSV base.`);
      setSrtPipelineStatus('CSV base derivado. Aplicando a heuristica de marcacao de assets...');

      updateSrtObserverStep('assets', 'running', 'Marcando as linhas como texto, avatar, video ou imagem...');
      const assetRows = applyAssetRules(parsedRows);
      const assetStats = buildAssetStats(assetRows);
      updateSrtObserverStep(
        'assets',
        'done',
        `${assetStats.texto} texto, ${assetStats.avatar} avatar, ${assetStats.video} video e ${assetStats.image} imagem.`
      );
      setSrtPipelineStatus('Assets marcados. Enviando as linhas elegiveis para gerar prompts visuais...');

      updateSrtObserverStep('prompts', 'running', 'Aguardando o envio do primeiro lote...');

      const promptItems = assetRows.flatMap((row, index) => {
        const type = normalizeAssetType(row.asset);
        const isEligible = type === 'vídeo' || type === 'imagem' || (type === 'texto' && textStyleMode === 'auto');
        if (!isEligible) return [];

        const previousText = assetRows[index - 1]?.texto?.trim() || '';
        const nextText = assetRows[index + 1]?.texto?.trim() || '';
        const startMs = parseSrtTimeToMs(row.startTime);
        const endMs = parseSrtTimeToMs(row.endTime);
        const durationSeconds = Number(((endMs - startMs) / 1000).toFixed(3));
  
        return [{
          row_number: row.rowNumber,
          asset: type === 'texto' ? 'text' : (type === 'vídeo' ? 'video' : 'image'),
          text: row.texto.trim(),
          start_time: row.startTime,
          end_time: row.endTime,
          duration_seconds: durationSeconds,
          previous_text: previousText,
          next_text: nextText,
        }];
      });

      const promptMap = new Map<number, string>();
      const chunkSize = 2;
      const chunks = [];
      for (let i = 0; i < promptItems.length; i += chunkSize) {
        chunks.push(promptItems.slice(i, i + chunkSize));
      }

      for (let i = 0; i < chunks.length; i++) {
        const batch = chunks[i];
        updateSrtObserverStep('prompts', 'running', `Gerando prompts visuais: processando lote ${i + 1} de ${chunks.length}...`);
        const res = await fetch('/api/assets/srt-pipeline', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            batchItems: batch,
            engine,
            model,
            apiKeyOverwrite: apiKey,
            projectConfig: activeProject,
            textStyleOverride: textStyleMode === 'custom' ? customTextStyle : (textStyleMode === 'auto' ? '' : textStyleMode),
            characterProfile: {
              mode: videoCharacterMode,
              customDescription: videoCharacterCustom,
            },
          }),
        });

        const responseText = await res.text();
        let data: any = {};
        try {
          data = JSON.parse(responseText);
        } catch (parseError) {
          if (res.status === 504) {
             throw new Error(`Timeout (Erro 504): A Vercel cancelou a operação no Lote ${i + 1}. A inteligência demorou demais para responder. Modelos avançados ("Reasoning" ou OpenAI gpt-4o) podem causar isso no plano gratuito da host. Tente usar gemini-2.5-flash.`);
          }
          throw new Error(`Erro inesperado (${res.status}) no lote ${i + 1}: A Vercel não retornou um JSON válido. Resposta: ${responseText.slice(0, 80)}...`);
        }

        if (!res.ok || data?.error) {
          throw new Error(data?.error || `Falha ao processar lote ${i + 1} do SRT.`);
        }

        (data?.prompts || []).forEach((p: { rowNumber: number; prompt: string }) => {
          if (p.rowNumber && p.prompt) promptMap.set(p.rowNumber, p.prompt);
        });
      }

      const rowsWithPrompts = assetRows.map((row) => {
        let finalPrompt = promptMap.get(row.rowNumber) || row.prompt;
        if (normalizeAssetType(row.asset) === 'texto' && textStyleMode !== 'auto') {
          finalPrompt = textStyleMode === 'custom' ? customTextStyle : textStyleMode;
        }
        return {
          ...row,
          prompt: finalPrompt,
        };
      });

      const generatedData = buildPipelineResult(rowsWithPrompts);

      updateSrtObserverStep(
        'prompts',
        'done',
        `${generatedData.stats?.video || 0} prompt(s) de video e ${generatedData.stats?.image || 0} prompt(s) de imagem preparados.`
      );
      updateSrtObserverStep('persist', 'running', 'Salvando CSV, prompts e preview dentro do snapshot desta execucao...');
      const persistedAt = new Date().toISOString();
      const pipelineResult = {
        ...generatedData,
        generatedAt: persistedAt,
      };
      setExternalSrtPipeline(pipelineResult);
      setSrtPipelineStatus('Pipeline concluido. CSV base, marcacao de assets e prompts visuais atualizados.');
      const finalizedObserver: SrtPipelineObserverStep[] = [
        {
          key: 'upload',
          label: 'SRT anexado',
          status: 'done',
          detail: externalSrtFileName ? `Arquivo ${externalSrtFileName} pronto para processamento.` : 'Arquivo .srt anexado e pronto para processamento.',
        },
        {
          key: 'csv',
          label: 'CSV base',
          status: 'done',
          detail: `${parsedRows.length} linha(s) derivadas do .srt e prontas para o CSV base.`,
        },
        {
          key: 'assets',
          label: 'Marcacao de assets',
          status: 'done',
          detail: `${assetStats.texto} texto, ${assetStats.avatar} avatar, ${assetStats.video} video e ${assetStats.image} imagem.`,
        },
        {
          key: 'prompts',
          label: 'Prompts visuais',
          status: 'done',
          detail: `${generatedData?.stats?.video || 0} prompt(s) de video e ${generatedData?.stats?.image || 0} prompt(s) de imagem preparados.`,
        },
        {
          key: 'render',
          label: 'Render de texto',
          status: 'pending',
          detail: 'Etapa 5 aguardando disparo. Os assets marcados como texto ainda nao foram renderizados em video.',
        },
        {
          key: 'persist',
          label: 'Persistencia',
          status: 'done',
          detail: `Resultado salvo localmente em ${new Date(persistedAt).toLocaleString('pt-BR')}. Use Exportar para baixar arquivos no computador.`,
        },
      ];
      setExternalSrtObserver(finalizedObserver);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
      await syncApprovedThemeSnapshot({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao processar pipeline do SRT.', error);
      updateSrtObserverStep('prompts', 'error', 'A geracao dos prompts falhou ou foi interrompida.');
      updateSrtObserverStep('persist', 'error', 'A execucao falhou antes de salvar o pipeline completo.');
      setSrtPipelineStatus('');
      alert(error instanceof Error ? error.message : 'Nao foi possivel processar o SRT anexado.');
    } finally {
      setIsProcessingSrtPipeline(false);
    }
  };

  const renderTextAssetsFromPipeline = async () => {
    if (!externalSrtPipeline?.rows?.length) {
      alert('Processe o SRT nas etapas 2, 3 e 4 antes de disparar a etapa 5.');
      return;
    }

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (!isLocalhost) {
      const pythonDir = "D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\assets\\ferramenta-legendas";
      const csvName = `${sanitizeDownloadFileStem(srtArtifactStem)}_pipeline_assets.csv`;
      const batContent = `@echo off\r\nchcp 65001 >nul\r\nset "CSV_PATH=%~dp0${csvName}"\r\necho Iniciando render de textos localmente...\r\ncd /d "${pythonDir}"\r\npython renderizar_textos.py --file "%CSV_PATH%"\r\necho.\r\necho Processo finalizado!\r\npause`;
      
      downloadTextArtifact(srtArtifactStem, 'pipeline_assets', externalSrtPipeline.csvContent, { extension: 'csv', mimeType: 'text/csv;charset=utf-8' });
      
      setTimeout(() => {
        downloadTextArtifact(srtArtifactStem, 'renderizar', batContent, { extension: 'bat', mimeType: 'text/plain;charset=utf-8' });
      }, 500);

      const persistedAt = new Date().toISOString();
      const pipelineResult = { ...externalSrtPipeline, generatedAt: persistedAt };
      setExternalSrtPipeline(pipelineResult);
      setSrtPipelineStatus('Etapa 5 (Nuvem) concluída. Os arquivos .bat e .csv foram baixados para execução manual.');
      
      const finalizedObserver = externalSrtObserver.map((step) => {
        if (step.key === 'render') {
          return { ...step, status: 'done' as const, detail: 'Download do script .bat e do CSV realizado para execução offline.' };
        }
        if (step.key === 'persist') {
          return { ...step, status: 'done' as const, detail: `Exportação gerada em ${new Date(persistedAt).toLocaleString('pt-BR')}.` };
        }
        return step.status === 'pending' ? { ...step, status: 'done' as const, detail: step.detail } : step;
      });

      setExternalSrtObserver(finalizedObserver);
      
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
      return;
    }

    setIsRenderingTextAssets(true);
    setSrtPipelineStatus('Preparando o CSV persistido e disparando a etapa 5 para os assets de texto...');
    updateSrtObserverStep('render', 'running', 'Sincronizando o CSV no pipeline externo e renderizando os assets marcados como texto...');
    updateSrtObserverStep('persist', 'pending', 'Aguardando persistencia do resultado da etapa 5.');

    try {
      const res = await fetch('/api/assets/srt-render-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline: externalSrtPipeline,
          themeTitle: approvedTheme,
          srtFileName: externalSrtFileName,
          artifactStem: srtArtifactStem,
        }),
      });

      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        if (res.status === 504) {
          throw new Error('Timeout (Erro 504): O servidor levou muito tempo para renderizar os assets de texto. Reduza o volume ou rode localmente.');
        }
        throw new Error(`Erro inesperado (${res.status}): A Vercel não retornou um JSON válido. Resposta: ${responseText.slice(0, 80)}...`);
      }

      if (!res.ok) {
        throw new Error(data?.error || 'Falha ao executar a etapa 5 do pipeline SRT.');
      }

      const persistedAt = new Date().toISOString();
      const pipelineResult = {
        ...data,
        generatedAt: persistedAt,
      };
      setExternalSrtPipeline(pipelineResult);
      setSrtPipelineStatus('Etapa 5 concluida. Os assets marcados como texto foram renderizados e os caminhos ficaram persistidos.');

      const renderInfo = pipelineResult?.textRender;
      const finalizedObserver = externalSrtObserver.map((step) => {
        if (step.key === 'render') {
          return {
            ...step,
            status: 'done' as const,
            detail: renderInfo
              ? `${renderInfo.renderedCount} render(s) novo(s), ${renderInfo.reusedCount} reutilizado(s). Saida em ${renderInfo.outputDir}.`
              : 'Etapa 5 concluida e caminhos dos assets de texto atualizados.',
          };
        }

        if (step.key === 'persist') {
          return {
            ...step,
            status: 'done' as const,
            detail: `Resultado da etapa 5 salvo em ${new Date(persistedAt).toLocaleString('pt-BR')} e no snapshot do tema aprovado.`,
          };
        }

        return step.status === 'pending'
          ? { ...step, status: 'done' as const, detail: step.detail }
          : step;
      });

      setExternalSrtObserver(finalizedObserver);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
      await syncApprovedThemeSnapshot({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao executar a etapa 5 do SRT.', error);
      updateSrtObserverStep('render', 'error', 'A etapa 5 falhou antes de devolver os caminhos dos assets de texto.');
      updateSrtObserverStep('persist', 'error', 'A execucao falhou antes de persistir o resultado da etapa 5.');
      setSrtPipelineStatus('');
      alert(error instanceof Error ? error.message : 'Nao foi possivel renderizar os assets de texto.');
    } finally {
      setIsRenderingTextAssets(false);
    }
  };

  const restoreExecutionState = () => {
    if (!executionStorageKey) return;

    try {
      const raw = localStorage.getItem(executionStorageKey);
      if (!raw) {
        alert('Nenhuma execucao salva para esta instancia.');
        return;
      }

      const snapshot = JSON.parse(raw);
      setApprovedTheme(snapshot?.approvedTheme || '');
      setApprovedBriefing(snapshot?.approvedBriefing || null);
      const normalizedSnapshotBlocks = resolveSnapshotBlocks(snapshot);
      setScriptBlocks(normalizedSnapshotBlocks);
      setScriptStage(inferScriptStageFromSnapshot(snapshot));
      setAssemblerActive(typeof snapshot?.assemblerActive === 'boolean' ? snapshot.assemblerActive : false);
      setThumbnailDirective(snapshot?.thumbnailDirective || null);
      setShowThumbnailPanel(!!snapshot?.showThumbnailPanel);
      setThumbnailUrl(snapshot?.thumbnailUrl || '');
      setExecutionMode(snapshot?.executionMode === 'external' ? 'external' : 'internal');
      setExternalScriptText(snapshot?.externalScriptText || '');
      setExternalScriptFileName(snapshot?.externalScriptFileName || '');
      setExternalSourceLabel(snapshot?.externalSourceLabel || '');
      setExternalSrtText(snapshot?.externalSrtText || '');
      setExternalSrtFileName(snapshot?.externalSrtFileName || '');
      setExternalSrtPipeline(snapshot?.externalSrtPipeline || null);
      setExternalSrtObserver(Array.isArray(snapshot?.externalSrtObserver) && snapshot.externalSrtObserver.length > 0 ? snapshot.externalSrtObserver : buildInitialSrtObserver());
      setPostScriptPackage(snapshot?.postScriptPackage || null);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao restaurar execucao manualmente.', error);
      alert('Nao foi possivel restaurar a execucao salva.');
    }
  };

  const clearExecutionState = () => {
    if (executionStorageKey) localStorage.removeItem(executionStorageKey);
    setApprovedTheme('');
    setApprovedBriefing(null);
    setScriptStage('blueprint');
    setThumbnailDirective(null);
    setShowThumbnailPanel(false);
    setThumbnailUrl('');
    setExecutionMode(defaultExecutionMode);
    setExternalScriptText('');
    setExternalScriptFileName('');
    setExternalSourceLabel('');
    setExternalSrtText('');
    setExternalSrtFileName('');
    setExternalSrtPipeline(null);
    setExternalSrtObserver(buildInitialSrtObserver());
    setPostScriptPackage(null);
    setScriptBlocks([
      { id: 'h0', type: 'Hook', title: 'Gancho Estrategico', content: 'Inicie com uma promessa tecnica...', sop: 'Corte seco.' },
      { id: 'c0', type: 'Context', title: 'Contextualizacao', content: 'Conecte com a dor do publico...', sop: 'B-roll de contexto.' }
    ]);
    setAssemblerActive(true);
  };

  const returnToAssembler = () => {
    setAssemblerActive(true);
  };

  const stopScriptGeneration = () => {
    generationStoppedRef.current = true;
    generationAbortRef.current?.abort();
    setGenerationProgress((current) =>
      current
        ? {
            ...current,
            status: 'Interrompendo a geracao e preservando os blocos concluidos...',
          }
        : null
    );
  };

  const downloadScriptAsTxt = () => {
    if (!scriptBlocks.length) {
      alert('Ainda nao ha blocos suficientes para exportar.');
      return;
    }

    const themeTitle = approvedBriefing?.title || approvedTheme || 'roteiro-content-os';
    const safeFileName = themeTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s/g, '_')
      .slice(0, 80) || 'roteiro-content-os';

    const txtContent = scriptBlocks
      .map((block, index) => `BLOCO ${index + 1} - ${block.title}\n\n${block.content.trim()}`)
      .join('\n\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const hasFinalScript = scriptStage === 'final' && scriptBlocks.some((block) => String(block.content || '').trim());
  const hasExternalScriptSource = !!externalScriptText.trim();
  const canProcessPostScriptPackage = hasFinalScript || hasExternalScriptSource;
  const packageArtifactStem = sanitizeDownloadFileStem(approvedBriefing?.title || approvedTheme || externalScriptFileName || 'roteiro-content-os');

  const resolvePostScriptSourceBlocks = (): ScriptBlock[] => {
    if (hasFinalScript) return scriptBlocks;

    const targetCount = Math.max(1, approvedBriefing?.blocks?.length || scriptBlocks.length || 1);
    const sections = segmentExternalScriptForBlocks(externalScriptText, targetCount);
    if (sections.length === 0) return [];

    return sections.map((section, index) => ({
      id: scriptBlocks[index]?.id || `external_${index + 1}`,
      type: scriptBlocks[index]?.type || 'Development',
      title: scriptBlocks[index]?.title || approvedBriefing?.blocks?.[index]?.title || `Bloco ${index + 1}`,
      content: section.trim(),
      sop: scriptBlocks[index]?.sop || '',
    }));
  };

  const generatePostScriptPackage = async () => {
    if (!approvedBriefing || !approvedTheme || !canProcessPostScriptPackage) {
      alert('Finalize o roteiro ou anexe um .txt externo antes de gerar o pacote pos-roteiro.');
      return;
    }

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
    if (!apiKey) {
      alert('Configure sua chave de API em Ajustes Globais para gerar o pacote pos-roteiro.');
      return;
    }

    const sourceBlocks = resolvePostScriptSourceBlocks();
    if (!sourceBlocks.length) {
      alert('Nao encontrei blocos suficientes no roteiro atual para processar o pacote pos-roteiro.');
      return;
    }

    const srtRows = externalSrtPipeline?.rows || (externalSrtText.trim() ? parseSrtToRows(externalSrtText) : []);
    const timelineContext = buildPostScriptTimelineContext({
      scriptBlocks: sourceBlocks,
      estimatedDuration: approvedBriefing?.estimatedDuration,
      srtRows,
    });
    const fallbackSeoPlan = buildSeoChapterPlan({
      scriptBlocks: sourceBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
    });

    setIsGeneratingPostScriptPackage(true);
    try {
      const response = await fetch('/api/post-script-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject?.ai_engine_rules,
          approvedTheme,
          approvedBriefing,
          scriptBlocks: sourceBlocks,
          srtRows,
          projectContext: {
            projectName: activeProject?.name || activeProject?.project_name || '',
            puc: activeProject?.puc || activeProject?.puc_promise || '',
            persona: activeProject?.persona || activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || '',
            soundtrack: activeProject?.editing_sop?.soundtrack || activeProject?.editing_sop?.trilha || '',
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data?.error || 'Falha ao gerar o pacote pos-roteiro.');
      }

      const nextPackage = sanitizePostScriptPackage(data, fallbackSeoPlan.anchors, timelineContext.source);
      setPostScriptPackage(nextPackage);
      persistExecutionSnapshotLocally({
        postScriptPackage: nextPackage,
        scriptStage,
      });
      void syncApprovedThemeSnapshot({
        postScriptPackage: nextPackage,
        scriptStage,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar o pacote pos-roteiro.', error);
      });

      alert('Pacote pos-roteiro gerado e salvo nesta execucao.');
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao gerar pacote pos-roteiro.', error);
      alert(`Erro ao gerar pacote pos-roteiro: ${error?.message || error}`);
    } finally {
      setIsGeneratingPostScriptPackage(false);
    }
  };

  const parseSfxTimelineEntries = (value: string) => {
    const normalized = String(value || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const blockRegex = /(?:^|\n)\s*(?:\*\*)?\[?(\d{2}:\d{2}(?::\d{2})?)\]?(?:\*\*)?[\s\S]*?(?=(?:\n\s*(?:\*\*)?\[?\d{2}:\d{2}(?::\d{2})?\]?(?:\*\*)?)|$)/g;
    const matches = normalized.match(blockRegex);
    if (!matches) return [];

    const entries = matches.map((match) => match.trim()).filter(Boolean);

    return entries.map((entry, index) => {
      const tsMatch = entry.match(/(?:\*\*)?\[?(\d{2}:\d{2}(?::\d{2})?)\]?(?:\*\*)?/);
      const timestamp = tsMatch ? tsMatch[1] : '';

      const lines = entry.split('\n').map((line) => line.trim()).filter(Boolean);
      
      const effectMatch = entry.match(/EFEITO:\s*([^\n]+)/i);
      const purposeMatch = entry.match(/FUNC(?:A|Ã)O:\s*([^\n]+)/i);
      const excerptMatch = entry.match(/TRECHO:\s*([^\n]+)/i);
      const notesMatch = entry.match(/OBS:\s*([^\n]+)/i);

      const effect = effectMatch ? effectMatch[1].trim().replace(/\*\*|["']/g, '') : '—';
      const purpose = purposeMatch ? purposeMatch[1].trim().replace(/\*\*|["']/g, '') : '—';
      const excerpt = excerptMatch ? excerptMatch[1].trim().replace(/\*\*|["']/g, '') : '—';
      const notes = notesMatch ? notesMatch[1].trim().replace(/\*\*|["']/g, '') : '—';

      return {
        id: `${timestamp}-${index}`,
        timestamp,
        effect,
        purpose,
        excerpt,
        notes,
      };
    });
  };

  const parseSeoDescriptionSections = (value: string) => {
    const normalized = String(value || '').replace(/\r\n/g, '\n').trim();
    if (!normalized) {
      return {
        intro: '',
        chapters: [] as Array<{ timestamp: string; label: string }>,
        notice: '',
      };
    }

    const lines = normalized.split('\n').map((line) => line.trimEnd());
    const timestampPattern = /^\d{2}:\d{2}(?::\d{2})?\s*[—-]\s+/;
    const firstTimestampIndex = lines.findIndex((line) => timestampPattern.test(line.trim()));
    const noticeIndex = lines.findIndex((line) => line.trim().toUpperCase().startsWith('AVISO DE IA:'));

    const introLines = lines.slice(0, firstTimestampIndex >= 0 ? firstTimestampIndex : noticeIndex >= 0 ? noticeIndex : lines.length);
    const chapterLines =
      firstTimestampIndex >= 0
        ? lines.slice(firstTimestampIndex, noticeIndex >= 0 ? noticeIndex : lines.length).filter((line) => timestampPattern.test(line.trim()))
        : [];
    const noticeLines = noticeIndex >= 0 ? lines.slice(noticeIndex) : [];

    return {
      intro: introLines.join('\n').trim(),
      chapters: chapterLines.map((line) => {
        const match = line.trim().match(/^(\d{2}:\d{2}(?::\d{2})?)\s*[—-]\s*(.+)$/);
        return {
          timestamp: match?.[1] || '',
          label: match?.[2] || line.trim(),
        };
      }),
      notice: noticeLines.join('\n').trim(),
    };
  };

  const seoDescriptionSections = parseSeoDescriptionSections(postScriptPackage?.seoDescription || '');
  const sfxTimelinePreview = parseSfxTimelineEntries(postScriptPackage?.sfxTimelineTxt || '');
  const manualPublishParts = getManualPublishDateParts(manualPublishDate);
  const pendingManualPublishValue = composeManualPublishDate(manualPublishDraftDate, manualPublishDraftTime);
  const hasPendingManualPublishChange = pendingManualPublishValue !== manualPublishDate;
  const activeStageBlockId = scriptBlocks.some((block) => block.id === expandedStageId)
    ? expandedStageId
    : scriptBlocks[0]?.id || null;
  const getBlockGenerationState = (index: number) =>
    isGeneratingScript && generationProgress
      ? index < generationProgress.completedCount
        ? 'completed'
        : index === generationProgress.currentIndex
          ? 'generating'
          : 'pending'
      : null;

  const projectPillars = activeProject?.playlists?.tactical_journey || [];
  const projectPersona = activeProject?.persona_matrix || {};
  const projectSop = activeProject?.editing_sop || {};
  const projectNarrativeSummary = {
    puC: activeProject?.puc || activeProject?.puc_promise || 'Sem PUC cadastrada',
    persona: projectPersona.demographics || activeProject?.target_persona?.audience || 'Persona nao cadastrada',
    pain: projectPersona.pain_alignment || activeProject?.target_persona?.pain_point || 'Dor central nao cadastrada',
    metaphors: (activeProject?.metaphor_library || activeProject?.ai_engine_rules?.metaphors?.join(', ') || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    pillars: projectPillars,
    cutRhythm: projectSop.cut_rhythm || '3s',
    zoomStyle: projectSop.zoom_style || 'Dynamic',
    soundtrack: projectSop.soundtrack || 'Reflexive',
    thumbStyle: activeProject?.thumb_strategy?.style || activeProject?.thumb_strategy?.layout || 'Nao configurado',
  };
  const srtArtifactStem =
    approvedBriefing?.title
    || approvedTheme
    || externalSrtFileName.replace(/\.[^.]+$/, '')
    || 'assets-srt';

  const generateThumbnailDirective = () => {
    if (!activeProject) return;
    const { theme, variation } = getCommandContext();
    if (!theme) return alert('Selecione/compile um tema antes de gerar a diretriz.');

    const themeLower = String(theme || '').toLowerCase();
    const persona = activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'o publico-alvo';
    const puc = activeProject?.puc || activeProject?.puc_promise || 'a transformacao central do projeto';
    const layouts = activeProject?.thumb_strategy?.layouts || (activeProject?.thumb_strategy?.layout ? [activeProject.thumb_strategy.layout] : []);
    const layoutHint = Array.isArray(layouts) && layouts.length > 0 ? layouts.join(' + ') : 'layout de alto contraste';
    const accent = activeProject?.accent_color || '#9BB0A5';

    const viralTitle = (() => {
      const raw = String(theme || '').replace(/["'“”‘’]/g, '').trim();
      if (!raw) return 'Estado Zen';
      const candidate = raw.split(':').pop()?.trim() || raw;
      return candidate
        .replace(/^pare de\s+/i, '')
        .replace(/^como\s+/i, '')
        .replace(/^o erro de\s+/i, '')
        .replace(/^por que\s+/i, '')
        .replace(/^a\s+/i, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(' ');
    })();

    const thumbnailTextPtBr = viralTitle.toUpperCase();
    const symbolicElements = [
      themeLower.includes('divida') || themeLower.includes('debito') ? 'painel financeiro vermelho' : null,
      themeLower.includes('crash') || themeLower.includes('pane') ? 'tela com alerta critico' : null,
      themeLower.includes('burnout') || themeLower.includes('sobrecarga') ? 'cpu superaquecida' : null,
      themeLower.includes('memoria') || themeLower.includes('foco') ? 'abas abertas e notificacoes vazando' : null,
      themeLower.includes('review') || themeLower.includes('ego') ? 'markup de correcao sobre o rosto' : null,
      themeLower.includes('kernel') ? 'nucleo luminoso protegido no peito' : null,
      themeLower.includes('prioridade') || themeLower.includes('sla') ? 'fila visual de tarefas criticas' : null,
      themeLower.includes('sono') ? 'janela noturna azul profunda' : null,
      themeLower.includes('rotina') || themeLower.includes('refactor') ? 'blocos modulares reorganizados' : null,
    ].filter(Boolean) as string[];

    const heroExpression =
      themeLower.includes('crash') || themeLower.includes('burnout') || themeLower.includes('sobrecarga')
        ? 'expressao de alerta contido, como quem percebe que chegou ao limite'
        : themeLower.includes('review') || themeLower.includes('ego')
          ? 'expressao de confronto lucido, orgulho sendo quebrado por clareza'
          : 'expressao de descoberta e controle recuperado';

    const environmentCue =
      themeLower.includes('memoria') || themeLower.includes('foco')
        ? 'workspace noturno com monitores, tabs e notificacoes pairando ao redor'
        : themeLower.includes('divida') || themeLower.includes('debito')
          ? 'ambiente premium de escritorio com overlays de custo, juros e desgaste'
          : 'set cinematografico escuro com interface tecnologica sutil ao fundo';

    const visualTags = [
      themeLower.includes('divida') || themeLower.includes('debito') ? 'divida biologica' : null,
      themeLower.includes('crash') || themeLower.includes('pane') ? 'colapso mental' : null,
      themeLower.includes('burnout') || themeLower.includes('sobrecarga') ? 'burnout' : null,
      themeLower.includes('memoria') || themeLower.includes('foco') ? 'foco profundo' : null,
      themeLower.includes('review') || themeLower.includes('ego') ? 'maturidade senior' : null,
      themeLower.includes('kernel') ? 'nucleo interno' : null,
      themeLower.includes('prioridade') || themeLower.includes('sla') ? 'priorizacao' : null,
      'alta performance',
      'carreira sustentavel',
      'arquitetura pessoal',
      'dev senior',
    ].filter(Boolean) as string[];

    const tags = Array.from(new Set(visualTags)).slice(0, 8);
    const symbolicLine = symbolicElements.length > 0
      ? symbolicElements.join(', ')
      : 'alertas sutis de sistema, contraste entre controle e desgaste, detalhes tecnicos que traduzem alta pressao';

    const directive = {
      visualConcept: `Traduzir o tema em uma cena simbolica de tensao contra controle. Layout ${layoutHint}. Fundo escuro premium com acento ${accent}. Persona visual: ${persona}. Elementos-chave: ${symbolicLine}. Estrutura narrativa: ${variation}.`,
      viralTitle,
      thumbnailPromptNoText: `Create a cinematic YouTube thumbnail, dark premium background, vivid accent color ${accent}, ${layoutHint}, photorealistic, 16:9. Show a senior tech professional in a ${environmentCue}, with ${heroExpression}. Add symbolic visual cues such as ${symbolicLine}. The image must communicate hidden cost, overload, recovery or regained control through symbolism, expression, lighting and composition, without adding any artificial headline, caption or phrase over the image. Do not render big title text, callout text or promotional wording. Only allow natural text that would already exist inside the scene, such as small interface labels on monitors, subtle dashboard readouts or ambient screen details. Use dramatic studio lighting, strong contrast, clean composition, one dominant focal point, subtle UI overlays, premium tech aesthetic, no watermark, 4K.`,
      thumbnailPromptWithPtBrText: `Create a cinematic YouTube thumbnail, dark premium background, vivid accent color ${accent}, ${layoutHint}, photorealistic, 16:9. Show a senior tech professional in a ${environmentCue}, with ${heroExpression}. Add symbolic visual cues such as ${symbolicLine}. Include a short, bold headline with a maximum of 5 words, and the headline must be written in Brazilian Portuguese only. Do not use English words in the headline. Make the typography clean, legible, premium and high contrast. Suggested headline direction: "${thumbnailTextPtBr}". The text must feel native for a Brazilian audience and should visually support this promise: "${puc}". Use dramatic studio lighting, strong contrast, clean composition, one dominant focal point, subtle UI overlays, premium tech aesthetic, no watermark, 4K.`,
      thumbnailTextPtBr,
      tags,
    };
    setThumbnailDirective(directive);
    setShowThumbnailPanel(true);
    requestAnimationFrame(() => {
      thumbnailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleDeploy = async () => {
    if (!activeProject) return;

    const { theme, variation } = getCommandContext();
    const editorialPillar = activeProject?.playlists?.tactical_journey?.[0]?.label || 'T1';

    // Collect narrative asset UUIDs ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â filter out mock/non-UUID IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assetLogIds = [
      pendingData?.selected_structure,
      approvedBriefing?.assetLog?.hook,
      approvedBriefing?.assetLog?.ctaMid,
      approvedBriefing?.assetLog?.ctaFinal,
      approvedBriefing?.assetLog?.titleStructure,
      approvedBriefing?.selectedNarrativeCurve?.id,
      approvedBriefing?.selectedArgumentMode?.id,
      ...(approvedBriefing?.selectedRepetitionRules?.map((rule: any) => rule.id) || []),
    ].filter(Boolean);
    const narrativeAssetIds = assetLogIds.filter((id: string) => uuidRegex.test(id));

    // Estimate prompt tokens based on current script blocks content
    const promptTokens = Math.round(
      scriptBlocks.reduce((acc, b) => acc + (b.content?.length || 0), 0) / 4
    );

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';

    // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Composition Log DNA (ImutÃƒÆ’Ã†â€™Ãƒâ€ Ã¢â‚¬â„¢ÃƒÆ’Ã¢â‚¬Å¡Ãƒâ€šÃ‚Â¡vel) ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
    const compositionLogPayload = {
      llm_model_id: `${engine}:${model}`,
      narrative_asset_ids: narrativeAssetIds,
      selected_variation: approvedBriefing?.openingHook?.id || 'ASSEMBLER',
      title_structure_asset_id: pendingData?.selected_structure || approvedBriefing?.assetLog?.titleStructure || null,
      prompt_tokens: promptTokens,
      editorial_pillar: editorialPillar,
      theme_title: theme,
      puc_snapshot: activeProject?.puc || '',
      outcome_status: 'pending' as const,
      thumbnail_url: thumbnailUrl || null,
    };

    const localCompositionSnapshot = {
      ...compositionLogPayload,
      selectedHookId: approvedBriefing?.assetLog?.hook || null,
      selectedCtaId: approvedBriefing?.assetLog?.ctaFinal || null,
      selectedTitleStructureId: pendingData?.selected_structure || approvedBriefing?.assetLog?.titleStructure || null,
      selectedCurveId: approvedBriefing?.selectedNarrativeCurve?.id || approvedBriefing?.assetLog?.narrativeCurve || null,
      selectedArgumentModeId: approvedBriefing?.selectedArgumentMode?.id || approvedBriefing?.assetLog?.argumentMode || null,
      selectedRepetitionRuleIds: (approvedBriefing?.selectedRepetitionRules as Array<{ id?: string }> | undefined)?.map((rule) => rule.id).filter(Boolean) || [],
      blockCount: approvedBriefing?.blockCount || approvedBriefing?.blocks?.length || scriptBlocks.filter((block) => block.type === 'Development').length || null,
      durationMinutes: Number((approvedBriefing?.estimatedDuration || '').match(/\d+/)?.[0] || 0) || null,
      voicePattern: approvedBriefing?.blocks?.map((block: any) => block.voiceStyle).join('>') || null,
      executionMode,
    };

    try {
      // Write immutable DNA log to Supabase (auto-injects project_id)
      const { error: logError } = await immutableInsert('composition_log', compositionLogPayload);
      if (logError) console.warn('[Composition Log] Supabase unavailable, saving locally:', logError.message);

      // Always save locally as backup
      const existingBI = JSON.parse(localStorage.getItem(`bi_${activeProject.id}`) || '[]');
      existingBI.push({
        ...localCompositionSnapshot,
        project_id: activeProject.id,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(`bi_${activeProject.id}`, JSON.stringify(existingBI));

      alert(`DNA registrado.\n\nMotor: ${compositionLogPayload.llm_model_id}\nEstrutura: ${variation}\nTokens: ~${promptTokens}\nAssets: ${narrativeAssetIds.length} vinculados\n\nMetricas de performance podem ser inseridas manualmente no painel de Analytics.`);
    } catch (err) {
      console.error('[handleDeploy]', err);
    }
  };

  // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ Assembler Approval Handler ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
  const handleAssemblerApprove = (briefing: any, theme: string) => {
    setApprovedTheme(theme);
    setApprovedBriefing(briefing);
    const newBlocks = buildScriptBlocksFromBriefing(briefing, theme);

    void saveManualThemeToBank(theme, briefing, {
      approvedTheme: theme,
      approvedBriefing: briefing,
      scriptBlocks: newBlocks,
      scriptStage: 'blueprint',
      assemblerActive: false,
      thumbnailDirective: null,
      showThumbnailPanel: false,
      thumbnailUrl: '',
      executionMode,
      externalScriptText: '',
      externalScriptFileName: '',
      externalSourceLabel: '',
      externalSrtText: '',
      externalSrtFileName: '',
      videoCharacterMode,
      videoCharacterCustom,
      manualPublishDate,
      externalSrtPipeline: null,
      externalSrtObserver: buildInitialSrtObserver(),
      postScriptPackage: null,
    });

    setScriptBlocks(newBlocks);
    setScriptStage('blueprint');
    setAssemblerActive(false);
    setExternalScriptText('');
    setExternalScriptFileName('');
    setExternalSourceLabel('');
    setExternalSrtText('');
    setExternalSrtFileName('');
    setExternalSrtPipeline(null);
    setExternalSrtObserver(buildInitialSrtObserver());
    setPostScriptPackage(null);
  };

  const hookTemplates      = components.filter(c => c.type === 'Hook');
  const ctaTemplates       = components.filter(c => c.type === 'CTA');
  const communityTemplates = components.filter(c => c.type === 'Community');
  const titleStructureTemplates = components.filter(c => c.type === 'Title Structure');
  const uniqueHookTemplates = dedupeNarrativeComponents(hookTemplates);
  const uniqueCtaTemplates = dedupeNarrativeComponents(ctaTemplates);
  const uniqueCommunityTemplates = dedupeNarrativeComponents(communityTemplates);
  const uniqueTitleStructureTemplates = dedupeNarrativeComponents(titleStructureTemplates);
  const sampleNarrativeAssets = [
    uniqueHookTemplates[0],
    uniqueCtaTemplates[0],
    uniqueCommunityTemplates[0],
    uniqueTitleStructureTemplates[0],
  ].filter(Boolean);

  const thumbnailDirectivePanel = showThumbnailPanel && thumbnailDirective ? (
    <div
      ref={thumbnailPanelRef}
      className="mx-6 xl:mx-8 mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 xl:p-6 space-y-5 shadow-[0_0_30px_rgba(168,85,247,0.08)]"
    >
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-300">Diretriz de Thumbnail</p>
          <p className="mt-1 text-[11px] text-white/50 leading-relaxed">Baseada no tema aprovado e nas camadas narrativas selecionadas.</p>
        </div>
        <button onClick={() => setShowThumbnailPanel(false)} className="text-white/20 hover:text-white text-sm">x</button>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
          <div className="space-y-3">
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-1">LEITURA VISUAL</span>
              <p className="text-sm font-black text-white leading-relaxed break-words">{thumbnailDirective.visualConcept}</p>
            </div>
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-1">TITULO VIRAL</span>
              <p className="text-[12px] font-black text-white leading-relaxed whitespace-pre-wrap break-words">{thumbnailDirective.viralTitle}</p>
            </div>
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-1">TEXTO PARA THUMBNAIL EM PT-BR</span>
              <p className="text-[12px] font-black tracking-[0.2em] text-blue-300 leading-relaxed whitespace-pre-wrap break-words">{thumbnailDirective.thumbnailTextPtBr}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30">TAGS</span>
                <button
                  onClick={() => navigator.clipboard.writeText(thumbnailDirective.tags.join(', '))}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-white/55 transition-all hover:border-white/20 hover:text-white"
                >
                  <Copy size={10} />
                  Copiar
                </button>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-3">
                <p className="text-[11px] text-purple-200/90 leading-relaxed break-words">
                  {thumbnailDirective.tags.join(', ')}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-midnight/40 border border-white/5 p-4 space-y-4">
          <div>
            <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-2">PROMPT 1 · SEM FRASE ARTIFICIAL</span>
            <div className="relative">
              <p className="text-[11px] text-white/80 leading-relaxed font-mono pr-10 whitespace-pre-wrap break-words">{thumbnailDirective.thumbnailPromptNoText}</p>
              <button
                onClick={() => navigator.clipboard.writeText(thumbnailDirective.thumbnailPromptNoText)}
                className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/20 rounded-lg text-white/30 hover:text-white transition-all"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-2">PROMPT 2 · TEXTO CURTO EM PT-BR</span>
            <div className="relative">
              <p className="text-[11px] text-white/80 leading-relaxed font-mono pr-10 whitespace-pre-wrap break-words">{thumbnailDirective.thumbnailPromptWithPtBrText}</p>
              <button
                onClick={() => navigator.clipboard.writeText(thumbnailDirective.thumbnailPromptWithPtBrText)}
                className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/20 rounded-lg text-white/30 hover:text-white transition-all"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ ASSEMBLER MODE ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚ÂÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬
  const ScriptMobileTabs = (
    <div className="flex lg:hidden mb-4 bg-white/5 rounded-xl p-1 border border-white/10">
      {[{ id: 'context', label: 'Contexto' }, { id: 'main', label: 'Roteiro' }].map(tab => (
        <button
          key={tab.id}
          onClick={() => setMobileTab(tab.id as any)}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
            mobileTab === tab.id ? 'bg-blue-500 text-white' : 'text-white/40 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-160px)]">
      {ScriptMobileTabs}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 animate-in">
        {/* Left: Building Blocks ÃƒÆ’Ã†â€™Ãƒâ€šÃ‚Â¢ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â€šÂ¬Ã…Â¡Ãƒâ€šÃ‚Â¬ÃƒÆ’Ã‚Â¢ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¬Ãƒâ€šÃ‚Â hidden on mobile when main tab active */}
        <section className={`w-full lg:w-[300px] xl:w-[340px] lg:shrink-0 flex-col gap-6 overflow-y-auto pr-2 pb-6 custom-scrollbar ${mobileTab === 'context' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="glass-card p-6 flex flex-col gap-4 border-blue-500/10 bg-blue-500/[0.02] shadow-xl">
          <label className="text-[10px] uppercase tracking-widest font-black text-blue-400">Instancia Content OS</label>
          <div className="flex items-center justify-between p-4 bg-midnight/40 border border-white/10 rounded-2xl ring-1 ring-white/5">
            <div className="flex flex-col gap-1">
              <span className="font-black text-sm text-white">{selectedProject}</span>
              <span className="text-[9px] text-blue-500/50 font-black uppercase tracking-widest">V4 Kernel Operational</span>
            </div>
            <div className="p-2 bg-blue-500/10 rounded-full">
              <Sparkles size={14} className="text-blue-400" />
            </div>
          </div>
        </div>

        {/* Modular Pieces */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Blueprint Modular</h3>
            <Settings size={14} className="text-white/20" />
          </div>

          {/* SOP Visualizer */}
          <div className="glass-card p-6 border-blue-500/30 bg-blue-500/10 shadow-lg shadow-blue-500/5">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="text-blue-400" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Diretrizes SOP</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-midnight/40 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] text-white/40 uppercase font-black block mb-1">Corte</span>
                <span className="text-sm font-black text-white">{activeProject?.editing_sop?.cut_rhythm || '3s'}</span>
              </div>
              <div className="p-3 bg-midnight/40 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] text-white/40 uppercase font-black block mb-1">Zoom</span>
                <span className="text-sm font-black text-white">{activeProject?.editing_sop?.zoom_style || 'Dynamic'}</span>
              </div>
            </div>
          </div>

          {/* Hooks Selection */}
          <div className="glass-card p-6 flex flex-col gap-3">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="text-blue-400" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Openers Estrategicos</span>
            </div>
            <div className="flex flex-col gap-2">
              {uniqueHookTemplates.map(h => (
                <button 
                  key={h.id} 
                  onClick={() => setSelectedHookId(h.id)}
                  className={`w-full p-4 rounded-xl text-left transition-all flex items-center justify-between group border ${
                    selectedHookId === h.id 
                    ? 'bg-blue-500/15 border-blue-400/40 ring-1 ring-blue-400/20' 
                    : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className={`font-black text-xs ${selectedHookId === h.id ? 'text-blue-300' : 'text-white/80 group-hover:text-white'}`}>{h.name}</span>
                    <span className="text-[9px] uppercase font-bold text-white/30 group-hover:text-white/50">{h.description}</span>
                  </div>
                  {selectedHookId === h.id ? <Zap size={14} className="text-blue-300" /> : <ChevronDown size={14} className="text-white/20 group-hover:text-white/40 transition-transform" /> }
                </button>
              ))}
            </div>
          </div>

          {/* D.I.O Journey */}
          <div className="glass-card p-6 flex flex-col gap-3 border-orange-400/30 bg-orange-400/5">
            <div className="flex items-center gap-3 mb-3">
              <Layout className="text-orange-400" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Jornada Tatica</span>
            </div>
            <div className="flex flex-col gap-2">
              {(activeProject?.playlists?.tactical_journey || []).map((m: any) => (
                <div key={m.id} className="p-3 bg-midnight/40 rounded-xl border border-white/10 flex items-center justify-between group/item">
                  <span className="text-[10px] font-black text-white/70">{m.label}: <span className="text-white/40">{m.title}</span></span>
                  <Plus size={12} className="text-white/20 cursor-pointer hover:text-orange-400 transition-all hover:scale-125" />
                </div>
              ))}
            </div>
          </div>
        </div>
        </section>

        {/* Right: Script Workspace - hidden on mobile when context tab active */}
        <section className={`flex-1 min-w-0 min-h-0 glass-card flex-col shadow-2xl border-white/10 ring-1 ring-white/5 ${mobileTab === 'main' ? 'flex' : 'hidden lg:flex'}`}>
        {assemblerActive ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 xl:p-6">
            <ProductionAssembler
              components={components}
              componentsHydrated={componentsHydrated}
              onApprove={handleAssemblerApprove}
            />
          </div>
        ) : (
          <>
        <div className="p-6 xl:p-8 border-b border-white/5 flex flex-col gap-6 xl:flex-row xl:justify-between xl:items-start bg-midnight/40 backdrop-blur-md">
          <div className="max-w-3xl">
            <h3 className="font-bold flex items-center gap-3 text-lg text-white">
              <Database className="text-blue-500" size={20} /> Production Assembler
            </h3>
            <p className="text-[11px] text-white/60 mt-1 font-bold leading-relaxed max-w-2xl break-words uppercase tracking-widest">
              Validado pela PUC: <span className="font-black text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">"{activeProject?.puc || 'DNA nao definido'}"</span>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full xl:w-[640px]">
            <button
              onClick={restoreExecutionState}
              className="px-4 py-3 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-white/10"
              title="Recarregar a ultima execucao salva desta instancia"
            >
              <RotateCcw size={14} /> RETOMAR EXECUCAO
            </button>
            <button
              onClick={returnToAssembler}
              className="px-4 py-3 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-white/10"
              title="Voltar para o assembler sem perder o estado salvo"
            >
              <ArrowLeft size={14} /> VOLTAR AO ASSEMBLER
            </button>
            <button
              onClick={clearExecutionState}
              className="px-4 py-3 bg-red-500/10 text-red-300 hover:bg-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-red-500/20"
              title="Limpar a execucao atual desta instancia e recomecar"
            >
              <Trash2 size={14} /> LIMPAR EXECUCAO
            </button>
            <button 
              onClick={generateThumbnailDirective}
              className="px-6 py-3 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-purple-500/20"
              title="Gerar Diretriz de Thumbnail para ferramenta externa"
            >
              <Layout size={14} /> DIRETRIZ DE THUMB
            </button>
            <button 
              onClick={handleDeploy}
              className="px-6 py-3 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-blue-500/20 shadow-lg shadow-blue-900/10"
              title="Registrar log de composicao e deploy na BI"
            >
              <Save size={14} /> REGISTRAR DNA
            </button>
            <button
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de copiar o prompt externo.');
                const externalPrompt = buildExternalWritingPrompt();
                await navigator.clipboard.writeText(externalPrompt);
                alert('Prompt externo copiado com blueprint detalhado do roteiro.');
              }}
              className="px-6 py-3 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-blue-500/20"
              title="Copiar prompt completo para usar em plataforma externa"
            >
              <MessageSquare size={14} /> COPIAR PROMPT EXTERNO
            </button>
            <button
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de copiar ou gerar versao.');
                const snapshot = {
                  project_id: activeProject?.id,
                  theme: approvedBriefing.title || approvedTheme,
                  briefing: approvedBriefing,
                  blocks: scriptBlocks,
                  created_at: new Date().toISOString(),
                };
                const key = `ws_assemblies_${activeProject?.id}`;
                const existing = JSON.parse(localStorage.getItem(key) || '[]');
                localStorage.setItem(key, JSON.stringify([snapshot, ...existing]));

                const text = JSON.stringify(snapshot, null, 2);
                await navigator.clipboard.writeText(text);
                alert('Briefing copiado e versao salva localmente.');
              }}
              className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
              title="Copiar briefing (JSON) e salvar versao local"
            >
              <Copy size={20} />
            </button>
            <button
              onClick={downloadScriptAsTxt}
              className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
              title="Baixar todos os blocos atuais em um unico arquivo .txt"
            >
              <FileText size={20} />
            </button>
            <button 
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de gerar o roteiro.');
                setIsGeneratingScript(true);
                generationStoppedRef.current = false;
                setGenerationProgress({
                  currentIndex: 0,
                  completedCount: 0,
                  total: scriptBlocks.length,
                  currentTitle: 'Preparando blueprint para geracao',
                  status: 'Inicializando a geracao dos blocos no aplicativo...',
                });
                try {
                  const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
                  const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
                  const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
                  if (!apiKey) {
                    setIsGeneratingScript(false);
                    setGenerationProgress(null);
                    return alert('Configure sua chave de API em Ajustes Globais para gerar o roteiro.');
                  }

                  const promptForGeneration = buildInternalWritingPrompt();
                  if (!promptForGeneration) {
                    setIsGeneratingScript(false);
                    setGenerationProgress(null);
                    return alert('Aprove um assembly completo antes de gerar o roteiro.');
                  }

                  const totalBlocks = scriptBlocks.length;
                  setGenerationProgress({
                    currentIndex: -1,
                    completedCount: 0,
                    total: totalBlocks,
                    currentTitle: approvedBriefing.title,
                    status: 'Enviando o blueprint completo para a IA do aplicativo...',
                  });

                  const controller = new AbortController();
                  generationAbortRef.current = controller;
                  const res = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
                    body: JSON.stringify({
                      engine,
                      model,
                      prompt: promptForGeneration,
                      apiKeyOverwrite: apiKey,
                      projectConfig: activeProject?.ai_engine_rules,
                      responseType: 'text'
                    })
                  });

                  if (!res.ok) {
                    const errBody = await res.text();
                    throw new Error(`Falha IA (${res.status}): ${errBody}`);
                  }

                  const data = await res.json();
                  let text = '';
                  if (engine === 'gemini') {
                    text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                  } else {
                    text = data.choices?.[0]?.message?.content || '';
                  }

                  const sections = parseExternalScriptSections(text);
                  if (sections.length === 0) {
                    throw new Error('A IA respondeu, mas nao retornou blocos parseaveis.');
                  }
                  if (sections.length < totalBlocks) {
                    throw new Error(`A IA retornou ${sections.length} blocos, mas o blueprint exige ${totalBlocks}.`);
                  }

                  let workingBlocks = [...scriptBlocks];
                  setGenerationProgress({
                    currentIndex: 0,
                    completedCount: 0,
                    total: totalBlocks,
                    currentTitle: 'Distribuindo roteiro nos blocos',
                    status: 'Resposta recebida. Aplicando o roteiro aos cards STG...',
                  });

                  for (let i = 0; i < workingBlocks.length; i++) {
                    if (generationStoppedRef.current) {
                      throw new Error('__GENERATION_ABORTED__');
                    }

                    const block = workingBlocks[i];
                    const nextBlocks = [...workingBlocks];
                    nextBlocks[i] = { ...nextBlocks[i], content: (sections[i] || nextBlocks[i].content).trim() };
                    workingBlocks = nextBlocks;
                    setScriptBlocks(workingBlocks);
                    setGenerationProgress({
                      currentIndex: i,
                      completedCount: i + 1,
                      total: workingBlocks.length,
                      currentTitle: block.title,
                      status: `Bloco ${i + 1} concluido. Preenchendo os cards STG abaixo em tempo real.`,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 20));
                  }

                  setGenerationProgress({
                    currentIndex: -1,
                    completedCount: workingBlocks.length,
                    total: workingBlocks.length,
                    currentTitle: approvedBriefing.title,
                    status: 'Roteiro completo. Finalizando e salvando o snapshot desta execucao...',
                  });

                  setIsGeneratingScript(false);
                  generationAbortRef.current = null;
                  generationStoppedRef.current = false;

                  void syncApprovedThemeSnapshot({
                    scriptBlocks: workingBlocks,
                    scriptStage: 'final',
                    executionMode: 'internal',
                    postScriptPackage: null,
                  }).catch((error) => {
                    console.warn('[ScriptEngine] Falha ao salvar snapshot final apos geracao.', error);
                  });
                  setScriptStage('final');
                  setPostScriptPackage(null);
                  persistExecutionSnapshotLocally({
                    scriptBlocks: workingBlocks,
                    scriptStage: 'final',
                    executionMode: 'internal',
                    postScriptPackage: null,
                  });

                  alert('Roteiro IA gerado nos blocos.');
                  setGenerationProgress(null);
                } catch (e: any) {
                  if (e?.name === 'AbortError' || e?.message === '__GENERATION_ABORTED__') {
                    alert('Geracao interrompida. Os blocos ja concluidos foram mantidos.');
                  } else {
                  alert(`Erro ao gerar roteiro: ${e.message || e}`);
                  }
                } finally {
                  if (generationAbortRef.current) {
                    generationAbortRef.current = null;
                    generationStoppedRef.current = false;
                    setIsGeneratingScript(false);
                    setGenerationProgress(null);
                  }
                }
              }}
              disabled={isGeneratingScript || executionMode === 'external'}
              className="px-8 py-3 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] shadow-lg shadow-blue-500/25 hover:bg-blue-400 hover:shadow-blue-400/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
              title={executionMode === 'external' ? 'Mude para producao no aplicativo se quiser gerar os blocos por IA aqui.' : 'Gerar texto final para cada bloco via IA'}
            >
              {isGeneratingScript ? 'GERANDO...' : executionMode === 'external' ? 'MODO EXTERNO ATIVO' : 'GERAR ROTEIRO IA'} <Play size={14} fill="currentColor" />
            </button>
            {isGeneratingScript && (
              <button
                onClick={stopScriptGeneration}
                className="px-6 py-3 bg-red-500/10 text-red-300 hover:bg-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-red-500/20"
                title="Interromper a geracao e manter o que ja foi concluido"
              >
                <Octagon size={14} /> PARAR GERACAO
              </button>
            )}
          </div>
        </div>

        {generationProgress && (
          <div className="mx-6 xl:mx-8 mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] px-5 py-4 shadow-[0_0_30px_rgba(59,130,246,0.08)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-300">Geracao em andamento</p>
                <p className="text-sm font-black text-white">{generationProgress.status}</p>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  Bloco atual: <span className="text-white/80">{generationProgress.currentTitle}</span>. O texto gerado vai sendo inserido logo abaixo, dentro dos cards <span className="text-white/80">STG</span>, e permanece salvo no snapshot desta execucao.
                </p>
              </div>
              <div className="xl:w-[280px] space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                  <span>Progresso</span>
                  <span>{generationProgress.completedCount}/{generationProgress.total} blocos</span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-300"
                    style={{
                      width: `${generationProgress.total > 0 ? (generationProgress.completedCount / generationProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {thumbnailDirectivePanel}

        {approvedBriefing && (
          <div className="mx-6 xl:mx-8 mt-4 p-5 xl:p-6 bg-blue-500/[0.035] border border-blue-500/18 rounded-[28px] shadow-[0_0_40px_rgba(59,130,246,0.08)] space-y-5">
            <div className="min-w-0 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-300">Briefing aprovado</p>
              <p className="max-w-3xl text-[11px] text-white/45 leading-relaxed">
                O roteiro abaixo esta sendo montado com o briefing travado no assembler. O resumo principal fica visivel aqui para voce acompanhar o que esta sendo produzido sem perder o contexto editorial.
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-midnight/30 px-5 py-5 xl:px-6 xl:py-6">
              <h4 className="max-w-5xl text-[2rem] xl:text-[2.65rem] font-black text-white italic leading-[0.98] break-words">
                {approvedBriefing.title}
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Duracao', value: approvedBriefing.estimatedDuration || 'N/D' },
                { label: 'Blocos', value: `${approvedBriefing.blockCount || approvedBriefing.blocks?.length || 0}` },
                { label: 'Voz', value: approvedBriefing.dominantVoice?.split(' ')[0] || 'N/D' },
                { label: 'Chars', value: approvedBriefing.estimatedChars ? `~${approvedBriefing.estimatedChars.toLocaleString('pt-BR')}` : 'N/D' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-2xl border border-white/10 bg-midnight/40 px-4 py-3.5">
                  <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">{item.label}</span>
                  <span className="block text-sm font-black leading-tight text-white break-words">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-midnight/40 border border-white/5">
                <span className="text-[9px] font-black uppercase tracking-[3px] text-white/25 block mb-1">Camada de abertura</span>
                <p className="text-[11px] text-white/70 leading-relaxed break-words">{approvedBriefing.openingHook?.name || 'Nao definida'}</p>
              </div>
              <div className="p-4 rounded-2xl bg-midnight/40 border border-white/5">
                <span className="text-[9px] font-black uppercase tracking-[3px] text-white/25 block mb-1">Camada final de conversao</span>
                <p className="text-[11px] text-white/70 leading-relaxed break-words">{approvedBriefing.selectedCta?.name || 'Nao definida'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mx-6 xl:mx-8 mt-4 p-5 xl:p-6 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
          <div className="space-y-4">
            <div className="max-w-3xl">
              <span className="text-[10px] font-black uppercase tracking-widest text-blue-300">Modo de Producao</span>
              <p className="mt-2 max-w-xl text-[11px] text-white/45 leading-relaxed">
                O orquestrador continua montando o blueprint. Aqui voce decide se o texto final sera produzido no app ou em plataforma externa.
              </p>
            </div>
            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_320px]">
              {[
                { value: 'internal', title: 'Produzir no aplicativo', description: 'Gera o texto final por IA dentro do app.' },
                { value: 'external', title: 'Produzir externamente', description: 'Copia o prompt e recebe o roteiro final por texto ou .txt.' },
              ].map((option) => {
                const isActive = executionMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExecutionMode(option.value as ExecutionMode)}
                    className={`min-h-[168px] rounded-2xl border px-5 py-5 text-left transition-all ${
                      isActive
                        ? 'bg-blue-500/15 border-blue-400/40 shadow-lg shadow-blue-500/15'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className={`block text-[10px] font-black uppercase tracking-[2px] ${isActive ? 'text-blue-300' : 'text-white/80'}`}>
                      {option.title}
                    </span>
                    <span className="block mt-3 text-[11px] text-white/45 leading-relaxed">
                      {option.description}
                    </span>
                  </button>
                );
              })}
              <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4">
                <label className="block text-[9px] font-black uppercase tracking-[0.24em] text-blue-300">
                  Data e hora de postagem
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Data</span>
                    <input
                      type="date"
                      value={manualPublishDraftDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        setManualPublishDraftDate(nextDate);
                        if (!nextDate) {
                          setManualPublishDraftTime('');
                          return;
                        }

                        if (!manualPublishDraftTime) {
                          setManualPublishDraftTime('09:00');
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-midnight/50 px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-blue-400/40"
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Horario</span>
                    <input
                      type="time"
                      value={manualPublishDraftTime}
                      onChange={(e) => setManualPublishDraftTime(e.target.value)}
                      disabled={!manualPublishDraftDate}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-midnight/50 px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-blue-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-5 text-white/35">
                  Com horario, passado publica e futuro programa. Sem horario, vale a regra por dia.
                </p>
                <div className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2">
                  <span className="block text-[8px] font-black uppercase tracking-[0.18em] text-white/35">Rastreabilidade</span>
                  <p className="mt-1 text-[10px] leading-5 text-white/60">
                    Snapshot atual: {formatManualPublishTrace(manualPublishDate)}. Esse valor segue junto na execução salva e no tema quando houver registro no banco.
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      void applyManualPublishRegistration();
                    }}
                    disabled={!manualPublishDraftDate || !hasPendingManualPublishChange}
                    className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100 transition-all hover:border-blue-300/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {manualPublishDate ? 'Atualizar data registrada' : 'Registrar data de postagem'}
                  </button>
                  {hasPendingManualPublishChange && manualPublishDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualPublishDraftDate(manualPublishParts.date);
                        setManualPublishDraftTime(manualPublishParts.time);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/65 transition-all hover:border-white/20 hover:text-white"
                    >
                      Descartar alteracao
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {executionMode === 'external' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
                <div className="space-y-3">
                  <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Roteiro externo recebido</label>
                  <textarea
                    value={externalScriptText}
                    onChange={(e) => setExternalScriptText(e.target.value)}
                    placeholder="Cole aqui o roteiro final gerado fora do aplicativo. Se ele vier separado em BLOCO 1, BLOCO 2, etc., o app aplica automaticamente nos blocos atuais."
                    className="w-full min-h-[220px] bg-midnight/40 border border-white/10 rounded-2xl px-4 py-4 text-[12px] text-white/85 leading-relaxed outline-none focus:border-blue-400/40 resize-y placeholder:text-white/15"
                  />
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Plataforma externa</label>
                    <input
                      value={externalSourceLabel}
                      onChange={(e) => {
                        const value = e.target.value;
                        setExternalSourceLabel(value);
                        persistExecutionSnapshotLocally({
                          executionMode: 'external',
                          externalSourceLabel: value,
                        });
                      }}
                      placeholder="Ex: ChatGPT, Claude, Gemini..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-blue-400/40 placeholder:text-white/20"
                    />
                  </div>

                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Arquivo do roteiro (.txt)</label>
                      <p className="mt-1 text-[10px] text-white/40 leading-relaxed">
                        Use para aplicar o roteiro final aos blocos atuais. O arquivo fica salvo nesta execucao mesmo se voce sair da pagina.
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleExternalScriptUpload}
                      className="block w-full text-[11px] text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-500/15 file:px-4 file:py-2.5 file:text-[10px] file:font-black file:uppercase file:tracking-[0.2em] file:text-blue-300 hover:file:bg-blue-500/20"
                    />
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-3 text-[11px] text-white/65">
                      {externalScriptFileName ? `Arquivo persistido: ${externalScriptFileName}` : 'Nenhum .txt anexado ainda.'}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Arquivo de legendas (.srt)</label>
                      <p className="mt-1 text-[10px] text-white/40 leading-relaxed">
                        O upload do .srt atende a entrada da etapa 1. Abaixo, o app replica as etapas 2, 3 e 4 do pipeline para gerar CSV base, marcacao de assets e prompts visuais.
                      </p>
                    </div>
                    <input
                      type="file"
                      accept=".srt,text/plain"
                      onChange={handleExternalSrtUpload}
                      className="block w-full text-[11px] text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-purple-500/15 file:px-4 file:py-2.5 file:text-[10px] file:font-black file:uppercase file:tracking-[0.2em] file:text-purple-200 hover:file:bg-purple-500/20"
                    />
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-3 text-[11px] text-white/65">
                      {externalSrtFileName ? `Arquivo persistido: ${externalSrtFileName}` : 'Nenhum .srt anexado ainda.'}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-purple-200">Personagem dos prompts de video</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                          Mantem continuidade visual entre cenas. Os prompts de video tambem serao gerados sem falas, apenas com som ambiente.
                        </p>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { value: 'male', label: 'Masculino' },
                          { value: 'female', label: 'Feminino' },
                          { value: 'custom', label: 'Personalizado' },
                        ].map((option) => {
                          const selected = videoCharacterMode === option.value;
                          return (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => setVideoCharacterMode(option.value as VideoCharacterMode)}
                              className={`rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] transition-all ${
                                selected
                                  ? 'border-purple-300/40 bg-purple-500/15 text-purple-100'
                                  : 'border-white/10 bg-white/5 text-white/45 hover:text-white/75'
                              }`}
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      {videoCharacterMode === 'custom' && (
                        <textarea
                          value={videoCharacterCustom}
                          onChange={(e) => setVideoCharacterCustom(e.target.value)}
                          placeholder="Ex: mulher brasileira, 42 anos, arquiteta de software, cabelo curto, olhar concentrado, roupa casual premium, home office escuro..."
                          className="w-full min-h-[90px] resize-y rounded-xl border border-white/10 bg-midnight/45 px-3 py-3 text-[11px] leading-5 text-white/80 outline-none placeholder:text-white/20 focus:border-purple-300/40"
                        />
                      )}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">Estilo Visual do Texto (Render)</p>
                        <p className="mt-1 text-[10px] leading-relaxed text-white/40">
                          Delegue para a IA decidir o estilo cena a cena, ou force um estilo global para tudo.
                        </p>
                      </div>
                      <select 
                        value={textStyleMode}
                        onChange={(e) => setTextStyleMode(e.target.value)}
                        className="w-full bg-midnight/60 border border-white/10 rounded-xl px-3 py-2 text-[10px] uppercase font-black tracking-widest text-white outline-none focus:border-amber-500/40"
                      >
                        <option value="auto">Automático (IA, Variável cena a cena)</option>
                        {activeProject?.editing_sop?.text_styles?.split(',').map((s: string) => s.trim()).filter(Boolean).map((opt: string) => (
                          <option key={opt} value={opt}>{opt}</option>
                        ))}
                        <option value="custom">Personalizado...</option>
                      </select>
                      {textStyleMode === 'custom' && (
                        <input
                           value={customTextStyle}
                           onChange={(e) => setCustomTextStyle(e.target.value)}
                           placeholder="Ex: Neon, Vintage VHS, Clean White..."
                           className="w-full rounded-xl border border-white/10 bg-midnight/45 px-3 py-2 text-[11px] text-white/80 outline-none placeholder:text-white/20 focus:border-amber-500/40"
                        />
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={processAttachedSrtAssets}
                      disabled={isProcessingSrtPipeline || isRenderingTextAssets || !externalSrtText.trim()}
                      className="w-full rounded-xl border border-purple-400/25 bg-purple-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-purple-200 transition-all hover:bg-purple-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isProcessingSrtPipeline ? 'PROCESSANDO SRT...' : 'PROCESSAR SRT EM ASSETS'}
                    </button>
                    {externalSrtPipeline && (
                      <button
                        type="button"
                        onClick={renderTextAssetsFromPipeline}
                        disabled={isProcessingSrtPipeline || isRenderingTextAssets || externalSrtPipeline.stats.texto === 0}
                        className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isRenderingTextAssets ? 'RENDERIZANDO TEXTOS...' : 'ETAPA 5 · RENDERIZAR TEXTOS'}
                      </button>
                    )}
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-3 text-[11px] text-white/65">
                      {externalSrtPipeline?.generatedAt
                        ? `Pipeline persistido em ${new Date(externalSrtPipeline.generatedAt).toLocaleString('pt-BR')}.`
                        : 'Nenhum pipeline de assets processado ainda.'}
                    </div>
                  </div>

                  <div className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                    <div>
                      <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Pacote pos-roteiro</label>
                      <p className="mt-1 text-[10px] text-white/40 leading-relaxed">
                        Processa titulos virais, descricao SEO com timestamps, prompt Suno e a timeline de SFX a partir do roteiro final que ja esta nos blocos.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={generatePostScriptPackage}
                      disabled={isGeneratingPostScriptPackage || !canProcessPostScriptPackage}
                      className="w-full rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 transition-all hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingPostScriptPackage ? 'PROCESSANDO PACOTE...' : postScriptPackage ? 'REPROCESSAR PACOTE POS-ROTEIRO' : 'PROCESSAR PACOTE POS-ROTEIRO'}
                    </button>
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-3 text-[11px] text-white/65">
                      {!canProcessPostScriptPackage
                        ? 'Finalize o roteiro interno ou anexe um .txt externo para habilitar esta etapa.'
                        : postScriptPackage
                          ? `Pacote persistido em ${new Date(postScriptPackage.generatedAt).toLocaleString('pt-BR')}.`
                          : 'Nenhum pacote pos-roteiro processado ainda.'}
                    </div>
                  </div>
                </div>
              </div>

              {(isProcessingSrtPipeline || isRenderingTextAssets || externalSrtPipeline) && (
                <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.04] p-5 space-y-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
                      <div className="space-y-2 max-w-3xl">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-purple-200">Pipeline SRT adaptado ao app</p>
                      <p className="text-sm font-black text-white">
                        {(isProcessingSrtPipeline || isRenderingTextAssets)
                          ? srtPipelineStatus || (isRenderingTextAssets ? 'Executando a etapa 5 sobre o CSV persistido...' : 'Executando as etapas 2, 3 e 4 sobre o .srt anexado...')
                          : srtPipelineStatus || 'CSV base, assets e prompts persistidos nesta execucao.'}
                      </p>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        Etapa 1 fica coberta pelo upload do arquivo. A partir daqui o app replica a conversao para CSV, a marcacao heuristica de assets, a geracao dos prompts visuais e o render dos assets marcados como texto.
                      </p>
                    </div>
                      <div className="rounded-xl border border-purple-300/15 bg-black/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-purple-100">
                        {isProcessingSrtPipeline ? 'Processando' : isRenderingTextAssets ? 'Renderizando' : externalSrtPipeline ? 'Persistido' : 'Aguardando'}
                      </div>
                    </div>

                    {externalSrtPipeline && (
                      <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
                        {[
                          { label: 'Linhas', value: externalSrtPipeline.stats.total },
                          { label: 'Texto', value: externalSrtPipeline.stats.texto },
                          { label: 'Avatar', value: externalSrtPipeline.stats.avatar },
                          { label: 'Video', value: externalSrtPipeline.stats.video },
                          { label: 'Imagem', value: externalSrtPipeline.stats.image },
                          { label: 'Render', value: externalSrtPipeline.rows.filter((row) => row.caminho).length },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl border border-white/10 bg-midnight/40 px-4 py-3">
                            <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">{item.label}</span>
                            <span className="block text-sm font-black text-white">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Observador de status</p>
                        <p className="text-[10px] text-white/40 mt-1">Mostra em qual ponto da adaptacao o app esta e o que ja foi concluido.</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[10px] text-white/55">
                        {isProcessingSrtPipeline ? 'Processando agora' : isRenderingTextAssets ? 'Renderizando textos' : externalSrtPipeline ? 'Pipeline pronto' : 'Aguardando processamento'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
                      {externalSrtObserver.map((step) => (
                        <div key={step.key} className="rounded-2xl border border-white/8 bg-black/15 px-4 py-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                                step.status === 'done'
                                  ? 'bg-emerald-400'
                                  : step.status === 'running'
                                    ? 'bg-blue-400 animate-pulse'
                                    : step.status === 'error'
                                      ? 'bg-red-400'
                                      : 'bg-white/20'
                              }`}
                            />
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/70">{step.label}</span>
                          </div>
                          <p
                            className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                              step.status === 'done'
                                ? 'text-emerald-300'
                                : step.status === 'running'
                                  ? 'text-blue-300'
                                  : step.status === 'error'
                                    ? 'text-red-300'
                                    : 'text-white/30'
                            }`}
                          >
                            {step.status === 'done' ? 'Concluido' : step.status === 'running' ? 'Em execucao' : step.status === 'error' ? 'Erro' : 'Pendente'}
                          </p>
                          <p className="text-[10px] leading-5 text-white/45">{step.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Onde os arquivos ficam</p>
                    <p className="text-[10px] leading-6 text-white/55">
                      O CSV base e os arquivos de prompts ficam persistidos dentro do snapshot local desta execucao e no snapshot do tema aprovado. Quando voce usa os botoes de exportacao, eles vao para a pasta de downloads padrao do navegador como `.csv` e `.txt`. Ja a etapa 5 escreve um CSV espelho e os videos de texto diretamente no pipeline externo, preservando os caminhos em `caminho`.
                    </p>
                  </div>

                  {externalSrtPipeline && (
                    <>
                      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                        <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompts de video</p>
                              <p className="text-[10px] text-white/40 mt-1">Saida equivalente ao arquivo `_prompts_video.txt`.</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(externalSrtPipeline.videoPromptsTxt, 'Prompts de video copiados.')}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadTextArtifact(srtArtifactStem, 'prompts_video', externalSrtPipeline.videoPromptsTxt)}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                            </div>
                          </div>
                          <textarea
                            readOnly
                            value={externalSrtPipeline.videoPromptsTxt || 'Nenhum prompt de video foi gerado para este SRT.'}
                            className="w-full min-h-[180px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                          />
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompts de imagem</p>
                              <p className="text-[10px] text-white/40 mt-1">Saida equivalente ao arquivo `_prompts_imagem.txt`.</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(externalSrtPipeline.imagePromptsTxt, 'Prompts de imagem copiados.')}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadTextArtifact(srtArtifactStem, 'prompts_imagem', externalSrtPipeline.imagePromptsTxt)}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                            </div>
                          </div>
                          <textarea
                            readOnly
                            value={externalSrtPipeline.imagePromptsTxt || 'Nenhum prompt de imagem foi gerado para este SRT.'}
                            className="w-full min-h-[180px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                          />
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-midnight/40 overflow-hidden">
                        <div 
                          onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.03] transition-colors select-none group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                              <Database size={16} className="text-blue-400" />
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[2px] text-white/60 group-hover:text-white transition-colors block">Preview da timeline CSV</p>
                              <p className="text-[9px] text-white/30 tracking-widest">{externalSrtPipeline.rows.length} assets rastreados</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isTimelineExpanded ? 'rotate-180' : ''}`}>
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>

                        <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isTimelineExpanded ? 'grid-rows-[1fr] opacity-100 p-4 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
                          <div className="min-h-0 space-y-3 pt-3">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                              <div>
                                <p className="text-[10px] text-white/40 mt-1">A estrutura abaixo replica o CSV base das etapas 2 e 3, ja com a coluna `prompt` preenchida na etapa 4.</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => copyTextToClipboard(externalSrtPipeline.csvContent, 'CSV base copiado.')}
                                  className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                                >
                                  <Copy size={12} className="inline mr-2" /> Copiar CSV
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadTextArtifact(srtArtifactStem, 'timeline_assets', externalSrtPipeline.csvContent, { extension: 'csv', mimeType: 'text/csv;charset=utf-8' })}
                                  className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                                >
                                  <FileText size={12} className="inline mr-2" /> Exportar CSV
                                </button>
                              </div>
                            </div>

                            <div className="overflow-x-auto rounded-2xl border border-white/5 bg-black/15">
                              <table className="min-w-full text-left text-[11px] text-white/75">
                                <thead className="bg-white/[0.03] text-[9px] uppercase tracking-[0.2em] text-white/35">
                                  <tr>
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">Inicio</th>
                                    <th className="px-4 py-3">Fim</th>
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3">Texto</th>
                                    <th className="px-4 py-3">Prompt</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {externalSrtPipeline.rows.slice(0, 8).map((row) => (
                                    <tr key={row.rowNumber} className="border-t border-white/5 align-top">
                                      <td className="px-4 py-3 font-black text-white/60">{row.rowNumber}</td>
                                      <td className="px-4 py-3">{row.startTime}</td>
                                      <td className="px-4 py-3">{row.endTime}</td>
                                      <td className="px-4 py-3 font-black text-blue-200">{row.asset || '-'}</td>
                                      <td className="px-4 py-3 max-w-[260px] leading-5 text-white/70">{row.texto}</td>
                                      <td className="px-4 py-3 max-w-[320px] leading-5 text-white/55">{row.prompt || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {externalSrtPipeline.rows.length > 8 && (
                              <p className="text-[10px] text-white/35">
                                Preview mostrando as primeiras 8 linhas. O CSV completo fica persistido nesta execucao e pode ser exportado.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                        <div className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between">
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-300">Etapa 5 · Render de texto</p>
                            <p className="text-[10px] text-white/40 mt-1">
                              Usa o `renderizar_textos.py` externo para gerar MP4s apenas para as linhas marcadas como `texto` e atualizar a coluna `caminho`.
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {externalSrtPipeline.textRender?.csvPath && (
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(externalSrtPipeline.textRender?.csvPath || '', 'Caminho do CSV espelho copiado.')}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-amber-400/30 hover:text-amber-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar CSV espelho
                              </button>
                            )}
                            {externalSrtPipeline.textRender?.outputDir && (
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(externalSrtPipeline.textRender?.outputDir || '', 'Pasta de renders copiada.')}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-amber-400/30 hover:text-amber-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar pasta de render
                              </button>
                            )}
                          </div>
                        </div>

                        {externalSrtPipeline.textRender ? (
                          <>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                                <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">Novos renders</span>
                                <span className="block text-sm font-black text-white">{externalSrtPipeline.textRender.renderedCount}</span>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                                <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">Reutilizados</span>
                                <span className="block text-sm font-black text-white">{externalSrtPipeline.textRender.reusedCount}</span>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 xl:col-span-2">
                                <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">Ultima renderizacao</span>
                                <span className="block text-sm font-black text-white">{new Date(externalSrtPipeline.textRender.lastRenderedAt).toLocaleString('pt-BR')}</span>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/35 mb-2">CSV espelho no pipeline externo</p>
                                <p className="text-[11px] leading-6 text-white/75 break-all">{externalSrtPipeline.textRender.csvPath}</p>
                              </div>
                              <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                                <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/35 mb-2">Pasta de saida dos MP4s</p>
                                <p className="text-[11px] leading-6 text-white/75 break-all">{externalSrtPipeline.textRender.outputDir}</p>
                              </div>
                            </div>
                            <textarea
                              readOnly
                              value={externalSrtPipeline.textRender.log || 'Sem log de render disponivel.'}
                              className="w-full min-h-[180px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                            />
                          </>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                            A etapa 5 ainda nao foi disparada. Quando voce clicar em <span className="font-black text-amber-200">ETAPA 5 · RENDERIZAR TEXTOS</span>, o app vai gerar o CSV espelho no pipeline externo, executar o `renderizar_textos.py` e preencher a coluna `caminho` das linhas marcadas como texto.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {(canProcessPostScriptPackage || !!postScriptPackage) && (
          <div className="mx-6 xl:mx-8 mt-6 rounded-[32px] border border-blue-500/15 bg-blue-500/[0.03] overflow-hidden shadow-[0_0_40px_rgba(59,130,246,0.06)]">
            <div 
              onClick={() => setIsPostPackageExpanded(!isPostPackageExpanded)}
              className="flex items-center justify-between p-6 xl:p-8 cursor-pointer hover:bg-blue-500/5 transition-colors select-none group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors mt-1">
                  <Sparkles size={24} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.38em] text-blue-300">Pacote pos-roteiro</p>
                  <h4 className="text-xl font-black text-white mt-1 group-hover:text-blue-100 transition-colors">Saidas prontas para publicacao</h4>
                  <p className="text-[11px] leading-6 text-white/50 mt-1 max-w-2xl">
                    Esta etapa deriva o roteiro final em titulos virais, descricao SEO com timestamps, prompt musical para Suno e uma timeline de SFX pronta para o editor.
                  </p>
                </div>
              </div>
              <div className="hidden xl:flex items-center gap-4">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); generatePostScriptPackage(); }}
                  disabled={isGeneratingPostScriptPackage || !canProcessPostScriptPackage}
                  className="rounded-2xl border border-blue-400/25 bg-blue-500/15 px-5 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-blue-200 transition-all hover:border-blue-300/35 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingPostScriptPackage ? 'GERANDO...' : postScriptPackage ? 'REGERAR PACOTE' : 'GERAR PACOTE'}
                </button>
                <div className={`p-2 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isPostPackageExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown size={20} />
                </div>
              </div>
            </div>

            <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isPostPackageExpanded ? 'grid-rows-[1fr] opacity-100 px-6 pb-6 xl:px-8 xl:pb-8 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="min-h-0 space-y-6 pt-6">
                {!canProcessPostScriptPackage && !postScriptPackage ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                Finalize o roteiro interno ou anexe um <span className="font-black text-blue-200">.txt externo</span> para liberar esta etapa.
              </div>
            ) : postScriptPackage ? (
              <>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.95fr)]">
                  <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">5 titulos virais</p>
                        <p className="mt-1 text-[10px] text-white/40">Opcoes persistidas para teste rapido.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.titles.map((title, index) => `${index + 1}. ${title}`).join('\n'), 'Titulos virais copiados.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>
                    <div className="space-y-2">
                      {postScriptPackage.titles.map((title, index) => (
                        <div key={`${index}-${title}`} className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">
                          <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/35 mb-1">Opcao {index + 1}</span>
                          <p className="text-[13px] font-bold leading-6 text-white/90">{title}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Descricao SEO</p>
                        <p className="mt-1 text-[10px] text-white/40">Pronta para colar no YouTube com abertura, capitulos e aviso final.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.seoDescription, 'Descricao SEO copiada.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>
                    <div className="min-h-[320px] rounded-2xl border border-white/5 bg-black/20 px-4 py-4 space-y-4">
                      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Abertura</p>
                        <div className="mt-3 text-[11px] leading-7 text-white/80 whitespace-pre-wrap">
                          {seoDescriptionSections.intro || postScriptPackage.seoDescription}
                        </div>
                      </div>

                      {seoDescriptionSections.chapters.length > 0 && (
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
                          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Capitulos</p>
                          <div className="mt-3 space-y-1.5">
                            {seoDescriptionSections.chapters.map((chapter, index) => (
                              <div key={`${chapter.timestamp}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2.5">
                                <span className="shrink-0 rounded-lg border border-blue-400/20 bg-blue-500/10 px-2 py-1 font-mono text-[10px] font-black text-blue-200">
                                  {chapter.timestamp}
                                </span>
                                <span className="text-[11px] leading-6 text-white/80">{chapter.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {seoDescriptionSections.notice && (
                        <div className="rounded-2xl border border-amber-400/10 bg-amber-500/[0.04] px-4 py-4">
                          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-200">Aviso final</p>
                          <div className="mt-3 text-[11px] leading-7 text-white/75 whitespace-pre-wrap">
                            {seoDescriptionSections.notice}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompt Suno</p>
                        <p className="mt-1 text-[10px] text-white/40">Prompt musical persistido para gerar a trilha.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyTextToClipboard(
                            [postScriptPackage.sunoSuggestedTitle, postScriptPackage.sunoPrompt].filter(Boolean).join('\n'),
                            'Titulo e prompt Suno copiados.'
                          )
                        }
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>
                    {!!postScriptPackage.sunoSuggestedTitle && (
                      <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">
                        <span className="block text-[9px] font-black uppercase tracking-[0.24em] text-white/35 mb-1">Suggested title</span>
                        <span className="block text-[12px] font-bold text-white/85">{postScriptPackage.sunoSuggestedTitle}</span>
                      </div>
                    )}
                    <div className="min-h-[260px] rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-7 text-white/80 whitespace-pre-wrap">
                      {postScriptPackage.sunoPrompt}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Preview da timeline SFX</p>
                      <p className="mt-1 text-[10px] text-white/40">Arquivo TXT persistido no snapshot e organizado como guia visual para a edicao.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.sfxTimelineTxt, 'Timeline de SFX copiada.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTextArtifact(packageArtifactStem, 'sfx_timeline', postScriptPackage.sfxTimelineTxt)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <FileText size={12} className="inline mr-2" /> TXT
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-white/5 bg-black/15">
                    <table className="min-w-full text-left text-[11px] text-white/75">
                      <thead className="bg-white/[0.03] text-[9px] uppercase tracking-[0.2em] text-white/35">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Tempo</th>
                          <th className="px-4 py-3">Efeito</th>
                          <th className="px-4 py-3">Funcao</th>
                          <th className="px-4 py-3">Trecho</th>
                          <th className="px-4 py-3">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sfxTimelinePreview.length > 0 ? (
                          sfxTimelinePreview.map((item, index) => (
                            <tr key={item.id} className="border-t border-white/5 align-top">
                              <td className="px-4 py-4 font-black text-white/55">{index + 1}</td>
                              <td className="px-4 py-4 font-mono text-white/80">{item.timestamp}</td>
                              <td className="px-4 py-4 text-blue-200 font-semibold">{item.effect}</td>
                              <td className="px-4 py-4 leading-6">{item.purpose}</td>
                              <td className="px-4 py-4 leading-6 text-white/85">{item.excerpt}</td>
                              <td className="px-4 py-4 leading-6 text-white/60">{item.notes}</td>
                            </tr>
                          ))
                        ) : (
                          <tr className="border-t border-white/5">
                            <td colSpan={6} className="px-4 py-6 text-[11px] text-white/45">
                              Nenhum item de SFX disponivel ainda. Gere o pacote pos-roteiro para preencher este preview.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                O pacote ainda nao foi processado. Clique em <span className="font-black text-blue-200">GERAR PACOTE POS-ROTEIRO</span> para derivar titulos, descricao SEO, Suno e a timeline de SFX.
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        <div ref={mainScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6 xl:p-8 flex flex-col gap-8 custom-scrollbar bg-gradient-to-b from-transparent to-midnight/20">
          {scriptBlocks.length > 0 && (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-4 xl:p-5 space-y-4">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.32em] text-blue-300">Blocos STG agrupados</p>
                  <p className="mt-1 text-[10px] leading-5 text-white/40">
                    Clique em um STG para abrir o bloco. Isso mantém a página navegável sem perder os cards editáveis.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                  {scriptBlocks.length} blocos
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {scriptBlocks.map((block, index) => {
                  const blockGenerationState = getBlockGenerationState(index);
                  const isActive = block.id === activeStageBlockId;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => setExpandedStageId(block.id)}
                      className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                        isActive
                          ? 'border-blue-400/40 bg-blue-500/15 shadow-lg shadow-blue-500/10'
                          : 'border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className={`block text-[10px] font-black uppercase tracking-[0.22em] ${isActive ? 'text-blue-200' : 'text-white/40'}`}>
                        STG_{String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mt-2 block truncate text-[11px] font-black text-white/80">
                        {block.title}
                      </span>
                      {blockGenerationState && (
                        <span
                          className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${
                            blockGenerationState === 'generating'
                              ? 'border-blue-400/30 bg-blue-500/10 text-blue-300'
                              : blockGenerationState === 'completed'
                                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 bg-white/5 text-white/35'
                          }`}
                        >
                          {blockGenerationState === 'generating' ? 'Gerando' : blockGenerationState === 'completed' ? 'Concluido' : 'Pendente'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {scriptBlocks.filter((block) => block.id === activeStageBlockId).map((block) => {
            const index = Math.max(0, scriptBlocks.findIndex((item) => item.id === block.id));
            const blockGenerationState = getBlockGenerationState(index);

            return (
            <div key={block.id} className="relative group animate-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="flex items-center gap-3 mb-3 pl-1">
                <div className="text-[11px] font-black text-white/20 tracking-[3px] uppercase">
                  STG_{String(index + 1).padStart(2, '0')}
                </div>
                {blockGenerationState && (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                      blockGenerationState === 'generating'
                        ? 'border-blue-400/30 bg-blue-500/10 text-blue-300'
                        : blockGenerationState === 'completed'
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-white/35'
                    }`}
                  >
                    {blockGenerationState === 'generating'
                      ? 'Gerando agora'
                      : blockGenerationState === 'completed'
                        ? 'Concluido'
                        : 'Pendente'}
                  </span>
                )}
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              <div className={`flex flex-col gap-6 rounded-[32px] p-6 xl:p-8 transition-all shadow-inner relative group/block ${
                blockGenerationState === 'generating'
                  ? 'bg-blue-500/[0.04] border border-blue-400/20 ring-1 ring-blue-400/15 shadow-[0_0_30px_rgba(59,130,246,0.08)]'
                  : blockGenerationState === 'completed'
                    ? 'bg-emerald-500/[0.03] border border-emerald-400/15'
                    : 'bg-white/[0.01] border border-white/[0.05] hover:border-white/10 hover:bg-white/[0.03]'
              }`}>
                
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <span className={`inline-flex w-fit max-w-full flex-wrap text-[10px] font-black uppercase tracking-[3px] px-4 py-2 rounded-full border shadow-sm whitespace-normal break-words ${
                    block.type === 'Hook' ? 'text-blue-300 border-blue-400/60 bg-blue-500/10' : 
                    block.type === 'Context' ? 'text-blue-400 border-blue-400/60 bg-blue-400/10' : 
                    block.type === 'Development' ? 'text-orange-400 border-orange-400/60 bg-orange-400/10' :
                    'text-white/60 border-white/20 bg-white/5'
                  }`}>
                    {block.type} {'\u00BB'} {block.title}
                  </span>
                  <div className="opacity-100 xl:opacity-0 group-hover/block:opacity-100 transition-opacity flex gap-2 self-end">
                    <button className="p-2 text-white/20 hover:text-white transition-colors"><Plus size={14} /></button>
                    <button className="p-2 text-white/20 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.7fr)_300px] gap-6 xl:gap-8 items-start">
                  <div className="min-w-0">
                    <textarea 
                      ref={(el) => {
                        if (!el) return;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      className={`w-full rounded-2xl px-5 py-4 text-white/90 leading-8 outline-none transition-all resize-none overflow-hidden min-h-[120px] text-[15px] font-medium placeholder:text-white/10 ${
                        blockGenerationState === 'generating'
                          ? 'bg-blue-500/[0.04] border border-blue-400/20'
                          : blockGenerationState === 'completed'
                            ? 'bg-emerald-500/[0.03] border border-emerald-400/10'
                            : 'bg-midnight/20 border border-white/5'
                      }`}
                      value={block.content}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].content = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                    />
                  </div>
                  <div className="bg-midnight/40 rounded-3xl p-5 xl:p-6 border border-white/5 flex flex-col gap-4 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-[2px] text-blue-300">
                      <PenTool size={14} className="animate-pulse" /> SOP DE EDICAO
                    </div>
                    <textarea 
                      ref={(el) => {
                        if (!el) return;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      className="w-full bg-transparent text-[13px] text-white/70 font-medium leading-7 outline-none resize-none overflow-hidden min-h-[96px] italic border-t border-white/5 pt-4 mt-2"
                      value={block.sop}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].sop = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                      placeholder="Instrucoes para o editor..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )})}

              <button className="w-full border-2 border-dashed border-white/5 hover:border-blue-400/30 rounded-[50px] py-16 flex flex-col items-center gap-3 text-white/20 hover:text-blue-300 transition-all group bg-white/[0.01]">
            <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
            <div className="text-center">
              <span className="text-[11px] uppercase font-black tracking-[0.4em]">Injetar Bloco Modular</span>
              <p className="text-[9px] opacity-40 mt-1 uppercase tracking-widest font-bold">DNA Content OS Kernel</p>
            </div>
          </button>
        </div>
        <ScrollToTopButton containerRef={mainScrollRef} />
          </>
        )}
        </section>
      </div>
    </div>
  );
}


