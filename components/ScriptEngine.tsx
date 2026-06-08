'use client';

import { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject, useProjectStore } from '@/lib/store/projectStore';
import { immutableInsert, upsertScriptExecution, getScriptExecution } from '@/lib/supabase-mutations';
import { Play, Save, Copy, Layout, Settings, MessageSquare, Sparkles, ChevronDown, Trash2, Plus, Database, PenTool, History, Zap, RotateCcw, ArrowLeft, Octagon, FileText } from 'lucide-react';
import {
  applyAssetRules,
  applyHyperframeRules,
  applyHyperframeExclusionZone,
  buildAssetStats,
  enforceTextoCooldown,
  parseSrtToRows,
  sanitizeDownloadFileStem,
  buildPipelineResult,
  normalizeAssetType,
  parseSrtTimeToMs,
  type SrtAssetPipelineResult,
  finalizeFacelessRows,
} from '@/lib/srt-asset-pipeline';
import { buildHyperframesBat } from '@/lib/hyperframes-overlay';
import { downloadTemplateZip } from '@/lib/template-studio-zip';
import { buildSfxBatFromTimeline } from '@/lib/sfx-generator';
import {
  buildPostScriptTimelineContext,
  buildSeoChapterPlan,
  sanitizePostScriptPackage,
  type PostScriptPackage,
} from '@/lib/post-script-package';
import ProductionAssembler from './ProductionAssembler';
import ScrollToTopButton from './ScrollToTopButton';

type TitleCriterionResult = true | 'parcial' | false;
interface TitleValidationResult {
  title: string;
  score: number;
  verdict: 'Aprovado' | 'Ajustes' | 'Fraco';
  breakdown: {
    tensao: TitleCriterionResult;
    relevancia: TitleCriterionResult;
    curiosidade: TitleCriterionResult;
    valor: TitleCriterionResult;
    saturacao: TitleCriterionResult;
    singularidade: TitleCriterionResult;
  };
}

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
type VideoFormat = 'avatar' | 'faceless' | 'vlog' | 'avatar_flow';

const resolveErrorMessage = (errPayload: any, fallback: string): string => {
  if (!errPayload) return fallback;
  if (typeof errPayload === 'string') return errPayload;
  if (typeof errPayload === 'object') {
    return errPayload.message || errPayload.code || JSON.stringify(errPayload);
  }
  return fallback;
};

const resolveCharacterProfileInFrontend = (
  mode: VideoCharacterMode,
  format: VideoFormat,
  projectName?: string,
  customDescription?: string
): string => {
  const resolvedMode = mode === 'female' || mode === 'custom' ? mode : 'male';
  const resolvedCustomDescription = String(customDescription || '').replace(/\s+/g, ' ').trim();

  if (resolvedMode === 'custom' && resolvedCustomDescription) {
    return resolvedCustomDescription;
  }

  const resolvedProjectName = String(projectName || '').trim();
  const videoFormat = format || 'avatar';
  const isDevZen = resolvedProjectName.toLowerCase().includes('dev') || resolvedProjectName.toLowerCase().includes('tech');
  const isMetabolismo = resolvedProjectName.toLowerCase().includes('metabolismo') || resolvedProjectName.toLowerCase().includes('saude') || resolvedProjectName.toLowerCase().includes('longevidade') || resolvedProjectName.toLowerCase().includes('ouro');

  if (isDevZen) {
    if (videoFormat === 'vlog') {
      return resolvedMode === 'female'
        ? 'same recurring Brazilian female field researcher and software architect in her early 30s, intelligent and curious expression, wearing casual techwear travel jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie'
        : 'same recurring Brazilian male field researcher and software engineer in his early 30s, intelligent and curious expression, wearing casual techwear travel jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie';
    } else {
      return resolvedMode === 'female'
        ? 'same recurring Brazilian female senior software architect in her early 40s, focused expression, subtle signs of fatigue, modern dark home office, premium casual techwear'
        : 'same recurring Brazilian male senior software architect in his early 40s, focused expression, subtle signs of fatigue, modern dark home office, premium casual techwear';
    }
  }

  if (isMetabolismo) {
    if (videoFormat === 'vlog') {
      return resolvedMode === 'female'
        ? 'same recurring Brazilian female health mentor and longevity explorer in her late 60s, radiant skin, elegant active expression, wearing an organic linen travel shirt, recording an educational vlog selfie in the natural or historical setting'
        : 'same recurring Brazilian male health educator and longevity explorer in his late 60s, elegant active expression, wearing an organic linen travel shirt, recording an educational vlog selfie in the natural or historical setting';
    } else {
      return resolvedMode === 'female'
        ? 'same recurring Brazilian female health mentor in her late 60s, radiant skin, vital active expression, elegant look, modern minimalist home office with organic textures and soft sunlight, wearing elegant natural fabrics'
        : 'same recurring Brazilian male health mentor in his late 60s, healthy vital expression, elegant look, modern minimalist home office with natural wood and plants, soft lighting';
    }
  }

  // Generic fallback
  if (videoFormat === 'vlog') {
    return resolvedMode === 'female'
      ? 'same recurring Brazilian female field researcher and didactic educator in her early 30s, intelligent and curious expression, wearing a brown canvas explorer jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie'
      : 'same recurring Brazilian male field researcher and didactic educator in his early 30s, intelligent and curious expression, wearing a brown canvas explorer jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie';
  } else {
    return resolvedMode === 'female'
      ? 'same recurring Brazilian female presenter in her early 30s, intelligent and friendly expression, modern dark home studio, professional attire'
      : 'same recurring Brazilian male presenter in his early 30s, intelligent and friendly expression, modern dark home studio, professional attire';
  }
};

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
  videoFormat?: VideoFormat;
  manualPublishDate: string;
  externalSrtPipeline: SrtAssetPipelineResult | null;
  externalSrtObserver: SrtPipelineObserverStep[];
  postScriptPackage: PostScriptPackage | null;
  hfBgPrompts?: Array<{ rowNumber: number; prompt: string }> | null;
  visualBlueprintSetting?: string;
  visualBlueprintCast?: Array<{ name: string; description: string }>;
  _themeId?: string; // stable ID to find the theme even after a title rename
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

  // Prefer content_pattern (structural template) over description (general summary)
  const supportText = asset?.pattern || asset?.description || '';
  const assetName = asset?.name || label;

  return `${label}: preserve a funcao estrategica do ativo "${assetName}" e reinterprete com formulacao propria. Nao reutilize frases, slogans, exemplos ou estruturas literais da biblioteca.${supportText ? ` Diretriz estrutural do ativo: ${supportText}` : ''}`;
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
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('avatar');
  const [preserveBrackets, setPreserveBrackets] = useState<boolean>(false);
  // Consistent Characters (Visual Blueprint & Cast)
  const [visualBlueprintSetting, setVisualBlueprintSetting] = useState<string>('');
  const [visualBlueprintCast, setVisualBlueprintCast] = useState<Array<{ name: string; description: string }>>([]);
  const [isExtractingVisuals, setIsExtractingVisuals] = useState<boolean>(false);
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
  const [isRegeneratingFallbacks, setIsRegeneratingFallbacks] = useState(false);
  // HyperFrame Background Prompts
  const [hfBgPrompts, setHfBgPrompts] = useState<Array<{ rowNumber: number; prompt: string }> | null>(null);
  const [isGeneratingHfBg, setIsGeneratingHfBg] = useState(false);
  // Pipeline orquestrado (botão único)
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [pipelineCurrentStep, setPipelineCurrentStep] = useState<string | null>(null);
  const _isPipelineMode = useRef(false);          // quando true, handlers lancam erro em vez de alert()
  const _pipelineResultRef  = useRef<any>(null);  // captura pipeline SRT entre setState assíncronos
  const _postScriptResultRef = useRef<any>(null); // captura pacote pós-roteiro entre setState assíncronos
  const [pipelineWarnings, setPipelineWarnings] = useState<string[]>([]); // avisos não-fatais
  // Template Studio
  const [isTemplateStudioExpanded, setIsTemplateStudioExpanded] = useState(false);
  const [isGeneratingTemplates, setIsGeneratingTemplates] = useState(false);
  const [templatePrimaryColor, setTemplatePrimaryColor] = useState('#00C8FF');
  const [templateSecondaryColor, setTemplateSecondaryColor] = useState('#00FF88');
  const [templateFontFamily, setTemplateFontFamily] = useState('Inter');
  const [templateStyleProfile, setTemplateStyleProfile] = useState('Tech');
  const [templateGenResult, setTemplateGenResult] = useState<{ total: number; missing: string[] } | null>(null);

  // Load Template Studio settings from localStorage
  useEffect(() => {
    if (activeProject?.id) {
      const saved = localStorage.getItem(`template_studio_${activeProject.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.primaryColor) setTemplatePrimaryColor(parsed.primaryColor);
          if (parsed.secondaryColor) setTemplateSecondaryColor(parsed.secondaryColor);
          if (parsed.fontFamily) setTemplateFontFamily(parsed.fontFamily);
          if (parsed.styleProfile) setTemplateStyleProfile(parsed.styleProfile);
        } catch (e) { /* ignore */ }
      }
    }
  }, [activeProject?.id]);

  // Save Template Studio settings to localStorage
  useEffect(() => {
    if (activeProject?.id && templatePrimaryColor) {
      localStorage.setItem(`template_studio_${activeProject.id}`, JSON.stringify({
        primaryColor: templatePrimaryColor,
        secondaryColor: templateSecondaryColor,
        fontFamily: templateFontFamily,
        styleProfile: templateStyleProfile,
      }));
    }
  }, [templatePrimaryColor, templateSecondaryColor, templateFontFamily, templateStyleProfile, activeProject?.id]);
  const [isValidatingTitles, setIsValidatingTitles] = useState(false);
  const [titleValidations, setTitleValidations] = useState<(TitleValidationResult | null)[] | null>(null);
  const [isRegeneratingTitles, setIsRegeneratingTitles] = useState(false);
  const [srtPipelineStatus, setSrtPipelineStatus] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingTitleUpdate, setPendingTitleUpdate] = useState<{ newTitle: string; oldTitle: string } | null>(null);
  const [storageUsageMB, setStorageUsageMB] = useState(0);

  const STORAGE_LIMIT_MB = 5;
  const STORAGE_WARN_THRESHOLD = 0.78; // warn at 78% (~3.9 MB)

  const checkStorageUsage = () => {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        total += (localStorage.getItem(k) || '').length * 2; // UTF-16: 2 bytes per char
      }
      setStorageUsageMB(total / (1024 * 1024));
    } catch { /* ignore */ }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  };
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isPostPackageExpanded, setIsPostPackageExpanded] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbnailPanelRef = useRef<HTMLDivElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationStoppedRef = useRef(false);
  const hasHydratedRef = useRef(false);
  
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
    videoFormat,
    manualPublishDate,
    externalSrtPipeline,
    externalSrtObserver,
    postScriptPackage,
    hfBgPrompts,
    visualBlueprintSetting,
    visualBlueprintCast,
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
    // Primary search: by title. Fallback: by theme ID stored in the snapshot (handles renamed themes)
    const snapshotThemeId = (executionSnapshot as any)?._themeId || null;
    let themeIndex = existingThemes.findIndex((item: any) =>
      item?.title?.trim().toLowerCase() === themeTitle.trim().toLowerCase()
    );
    if (themeIndex < 0 && snapshotThemeId) {
      themeIndex = existingThemes.findIndex((item: any) => item?.id === snapshotThemeId);
    }
    const targetPublishDate = (executionSnapshot?.manualPublishDate ?? manualPublishDate) || '';
    const scheduleStatus = resolveThemeStatusFromPublishDate(targetPublishDate, 'scripted');

    const existingTheme = themeIndex >= 0 ? existingThemes[themeIndex] : null;

    // Resolve pipeline_level: preserva o valor existente do tema no banco;
    // lê do briefing (agora preenchido pelo Assembler V16) e randomiza da
    // jornada tática como fallback — evitando que todos fiquem fixos em T1.
    const tacticalJourneys = activeProject?.playlists?.tactical_journey || [];
    const resolvedPipelineLevel =
      existingTheme?.pipeline_level ||
      briefing?.pipelineLevel ||
      (tacticalJourneys.length > 0
        ? tacticalJourneys[Math.floor(Math.random() * tacticalJourneys.length)]?.label
        : '') ||
      '';

    // Resolve editorial_pillar: lê do briefing (agora preenchido pelo Assembler V16
    // a partir de editorial_line.pillars) com fallback para randomização local.
    const rawPillars = activeProject?.editorial_line?.pillars
      || activeProject?.editorial_pillars
      || [];
    const pillarList: string[] = (Array.isArray(rawPillars) ? rawPillars : [])
      .map((p: any) => typeof p === 'string' ? p : p?.name || p?.label || '')
      .filter(Boolean);
    const resolvedEditorialPillar =
      existingTheme?.editorial_pillar ||
      briefing?.editorialPillar ||
      (pillarList.length > 0
        ? pillarList[Math.floor(Math.random() * pillarList.length)]
        : '') ||
      '';

    // Resolve title_structure: prefere o nome da estrutura selecionada no briefing;
    // cai para o valor que já estava gravado no tema, nunca sobrescreve com vazio.
    const resolvedTitleStructure =
      briefing?.selectedTitleStructure?.name ||
      existingTheme?.title_structure ||
      '';

    // Description rastreável: inclui estrutura e pilar para diferenciar cada tema.
    const structureLabel = briefing?.selectedTitleStructure?.name
      ? ` · Estrutura: ${briefing.selectedTitleStructure.name}`
      : '';
    const pillarLabel = resolvedEditorialPillar ? ` · Pilar: ${resolvedEditorialPillar}` : '';
    const resolvedDescription =
      existingTheme?.description ||
      `Tema aprovado manualmente na Escrita Criativa para o projeto ${activeProject?.name || activeProject?.project_name || 'ativo'}${structureLabel}${pillarLabel}.`;

    const themeId = existingTheme?.id || crypto.randomUUID();

    // 1. Prepare the full production_assets
    const fullProductionAssets = {
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
      // Only store file NAMES, not full text content — text is stored in ws_script_execution_* keys to avoid filling localStorage
      external_script_text: '',    // stripped to save space; lives in ws_script_execution_*
      external_file_name: executionSnapshot?.externalScriptFileName || '',
      external_source_label: executionSnapshot?.externalSourceLabel || '',
      external_srt_text: '',       // stripped to save space; lives in ws_script_execution_*
      external_srt_file_name: executionSnapshot?.externalSrtFileName || '',
      target_publish_date: targetPublishDate || null,
      schedule_status: scheduleStatus,
      execution_snapshot: executionSnapshot || null,
    };

    // 2. Strip ALL large fields from execution_snapshot for the themes list.
    //    Large texts (script, SRT, script blocks) only need to live in the workspace key.
    //    The themes index is for metadata and resume navigation, not for storing full content.
    const compactExecutionSnapshot = executionSnapshot ? {
      approvedTheme: executionSnapshot.approvedTheme,
      approvedBriefing: executionSnapshot.approvedBriefing,
      scriptStage: executionSnapshot.scriptStage,
      assemblerActive: executionSnapshot.assemblerActive,
      thumbnailDirective: executionSnapshot.thumbnailDirective,
      showThumbnailPanel: executionSnapshot.showThumbnailPanel,
      thumbnailUrl: executionSnapshot.thumbnailUrl,
      executionMode: executionSnapshot.executionMode,
      externalScriptFileName: executionSnapshot.externalScriptFileName,
      externalSourceLabel: executionSnapshot.externalSourceLabel,
      externalSrtFileName: executionSnapshot.externalSrtFileName,
      videoCharacterMode: executionSnapshot.videoCharacterMode,
      videoCharacterCustom: executionSnapshot.videoCharacterCustom,
      videoFormat: executionSnapshot.videoFormat,
      manualPublishDate: executionSnapshot.manualPublishDate,
      visualBlueprintSetting: executionSnapshot.visualBlueprintSetting,
      visualBlueprintCast: executionSnapshot.visualBlueprintCast,
      // Stripped: externalScriptText, externalSrtText, scriptBlocks, externalSrtPipeline, postScriptPackage, externalSrtObserver
      scriptBlocks: [],     // stripped - regenerated from briefing when needed
      externalScriptText: '',  // stripped
      externalSrtText: '',     // stripped
      externalSrtPipeline: undefined,
      postScriptPackage: undefined,
      externalSrtObserver: [],
      _hasSrtPipeline: !!executionSnapshot.externalSrtPipeline,
      _hasPostPackage: !!executionSnapshot.postScriptPackage,
      _themeId: themeId,
      _isCompact: true,
    } : null;

    const compactProductionAssets = {
      ...fullProductionAssets,
      execution_snapshot: compactExecutionSnapshot,
    };

    // 3. Save the COMPACT execution snapshot in a dedicated key for this theme.
    //    The large objects (SRT pipeline, post-script) live in _srt_pipeline / _post_package keys
    //    and don't need to be duplicated here — that was causing QuotaExceededErrors.
    if (compactExecutionSnapshot) {
      try {
        localStorage.setItem(`snapshot_${themeId}`, JSON.stringify(compactExecutionSnapshot));
      } catch (e) {
        console.warn(`[ScriptEngine] Failed to save dedicated snapshot for theme ${themeId}`, e);
      }
    }

    const themePayload = {
      id: themeId,
      title: themeTitle,
      description: resolvedDescription,
      editorial_pillar: resolvedEditorialPillar,
      status: scheduleStatus,
      title_structure: resolvedTitleStructure,
      selected_structure: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || existingTheme?.selected_structure || '',
      title_structure_asset_id: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || existingTheme?.title_structure_asset_id || null,
      pipeline_level: resolvedPipelineLevel,
      is_demand_vetted: true,
      is_persona_vetted: true,
      refined_title: themeTitle,
      priority: Number(existingTheme?.priority || 0),
      notes: existingTheme?.notes || 'Origem: tema manual aprovado na Escrita Criativa.',
      target_publish_date: targetPublishDate || null,
      match_score: Number(briefing?.diagnostics?.noveltyScore || 0),
      demand_views: existingTheme?.demand_views || '',
      production_assets: compactProductionAssets,
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
        created_at: new Date().toISOString(),
      });
    }
    
    // Storage cloud-only
    try {
      // Local caching of themes disabled to avoid 10MB quota limit
    } catch (e) {
      console.warn('[ScriptEngine] Quota exceeded saving themes locally.', e);
    }

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
        target_publish_date: themePayload.target_publish_date ?? null,
        updated_at: themePayload.updated_at,
        production_assets: compactProductionAssets,
      };

      let remoteId = existingTheme?.id;

      if (remoteId) {
        const existingRemoteById = await supabase
          .from('themes')
          .select('id')
          .eq('id', remoteId)
          .limit(1);
          
        if (!existingRemoteById.data || !existingRemoteById.data[0]) {
           remoteId = undefined; // ID not found in remote, fallback to title
        }
      }

      if (!remoteId) {
        const existingRemoteByTitle = await supabase
          .from('themes')
          .select('id')
          .eq('project_id', activeProject.id)
          .ilike('title', themeTitle)
          .limit(1);
          
        if (existingRemoteByTitle.data && existingRemoteByTitle.data[0]) {
          remoteId = existingRemoteByTitle.data[0].id;
        }
      }

      if (remoteId) {
        await supabase.from('themes').update(cloudThemePayload).eq('id', remoteId);
      } else {
        await supabase.from('themes').insert({
          ...cloudThemePayload,
          id: existingTheme?.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
        });
      }
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao sincronizar tema manual com o Banco de Temas.', error);
    }
  };

  useEffect(() => {
    hasHydratedRef.current = false;
    setExecutionHydrated(false);
  }, [executionStorageKey]);

  useEffect(() => {
    if (!executionStorageKey) {
      setExecutionHydrated(true);
      return;
    }

    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    try {
      let snapshot: any = null;
      
      // If we received pendingData that has an approvedTheme, it's a resume from ThemeBank.
      // We should hydrate directly from it instead of localStorage.
      if (pendingData && pendingData.approvedTheme) {
        snapshot = pendingData;
      } else if (!pendingData) {
        // Otherwise, if there is no pendingData (e.g. F5 reload), load from localStorage
        const raw = localStorage.getItem(executionStorageKey);
        if (raw) snapshot = JSON.parse(raw);
      }

      // If there is still pendingData (but no approvedTheme), it's a new generation. 
      // We skip hydration and let the Assembler V4 effect handle it.
      if (!snapshot && pendingData) {
        setExecutionHydrated(true);
        return;
      }

      // NEW: Check if the snapshot represents a finished (scheduled/published) script
      if (snapshot && snapshot.manualPublishDate && !pendingData) {
        const activeSessionThemeId = sessionStorage.getItem(`active_script_theme_${activeProject.id}`);
        const isCurrentlyActiveSession = activeSessionThemeId && (activeSessionThemeId === snapshot._themeId || activeSessionThemeId === snapshot.themeId || activeSessionThemeId === snapshot.id);

        if (snapshot._isResume || isCurrentlyActiveSession) {
          // Deliberate resume or active session refresh: allow hydration
          console.log('[ScriptEngine] Resuming/hydrating scheduled script in active session.');
          if (snapshot._themeId) {
            sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot._themeId);
          } else if (snapshot.themeId) {
            sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot.themeId);
          }

          if (snapshot._isResume) {
            delete snapshot._isResume;
            try {
              localStorage.setItem(executionStorageKey, JSON.stringify(snapshot));
            } catch { /* ignore */ }
          }
        } else {
          // Navigating via sidebar: bypass hydration of finished script to keep workspace clean
          console.log('[ScriptEngine] Bypassing hydration of finished/scheduled script for a clean workspace.');
          clearExecutionState();
          setExecutionHydrated(true);
          return;
        }
      }

      if (snapshot) {
        if (snapshot._themeId) {
          sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot._themeId);
        } else if (snapshot.themeId) {
          sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot.themeId);
        }
      }

      if (!snapshot) {
        if (supabase) {
          const loadFromCloud = async () => {
            try {
              console.log(`[ScriptEngine] Nenhum snapshot local para o projeto ${activeProject.id}. Tentando carregar última execução da nuvem...`);
              const { data, error } = await supabase
                .from('script_executions')
                .select('*')
                .eq('project_id', activeProject.id)
                .order('updated_at', { ascending: false })
                .limit(1);
              
              if (error) throw error;
              if (data && data[0] && data[0].execution_snapshot) {
                const cloudSnapshot = data[0].execution_snapshot;
                
                // NEW: Bypass cloud hydration if the script has already been scheduled/published
                if (cloudSnapshot.manualPublishDate) {
                  console.log('[ScriptEngine] Cloud snapshot is already scheduled/published. Bypassing cloud hydration.');
                  clearExecutionState();
                  setExecutionHydrated(true);
                  return;
                }

                console.log(`[ScriptEngine] Encontrado snapshot de execução na nuvem para o tema: ${cloudSnapshot.approvedTheme}. Reidratando workspace...`);
                
                if (cloudSnapshot.approvedTheme) setApprovedTheme(cloudSnapshot.approvedTheme);
                if (cloudSnapshot.approvedBriefing) setApprovedBriefing(cloudSnapshot.approvedBriefing);
                const normalizedSnapshotBlocks = resolveSnapshotBlocks(cloudSnapshot);
                if (normalizedSnapshotBlocks.length > 0) {
                  setScriptBlocks(normalizedSnapshotBlocks);
                }
                setScriptStage(inferScriptStageFromSnapshot(cloudSnapshot));
                if (typeof cloudSnapshot.assemblerActive === 'boolean') setAssemblerActive(cloudSnapshot.assemblerActive);
                if (cloudSnapshot.thumbnailDirective) setThumbnailDirective(cloudSnapshot.thumbnailDirective);
                if (typeof cloudSnapshot.showThumbnailPanel === 'boolean') setShowThumbnailPanel(cloudSnapshot.showThumbnailPanel);
                if (typeof cloudSnapshot.thumbnailUrl === 'string') setThumbnailUrl(cloudSnapshot.thumbnailUrl);
                if (cloudSnapshot.executionMode === 'external' || cloudSnapshot.executionMode === 'internal') setExecutionMode(cloudSnapshot.executionMode);
                if (typeof cloudSnapshot.externalScriptText === 'string') setExternalScriptText(cloudSnapshot.externalScriptText);
                if (typeof cloudSnapshot.externalScriptFileName === 'string') setExternalScriptFileName(cloudSnapshot.externalScriptFileName);
                if (typeof cloudSnapshot.externalSourceLabel === 'string') setExternalSourceLabel(cloudSnapshot.externalSourceLabel);
                if (typeof cloudSnapshot.externalSrtText === 'string') setExternalSrtText(cloudSnapshot.externalSrtText);
                if (typeof cloudSnapshot.externalSrtFileName === 'string') setExternalSrtFileName(cloudSnapshot.externalSrtFileName);
                if (['male', 'female', 'custom'].includes(cloudSnapshot.videoCharacterMode)) setVideoCharacterMode(cloudSnapshot.videoCharacterMode);
                if (typeof cloudSnapshot.videoCharacterCustom === 'string') setVideoCharacterCustom(cloudSnapshot.videoCharacterCustom);
                if (['faceless', 'avatar', 'vlog', 'avatar_flow'].includes(cloudSnapshot.videoFormat)) setVideoFormat(cloudSnapshot.videoFormat);
                if (typeof cloudSnapshot.manualPublishDate === 'string') setManualPublishDate(cloudSnapshot.manualPublishDate);
                if (typeof cloudSnapshot.visualBlueprintSetting === 'string') setVisualBlueprintSetting(cloudSnapshot.visualBlueprintSetting);
                if (Array.isArray(cloudSnapshot.visualBlueprintCast)) setVisualBlueprintCast(cloudSnapshot.visualBlueprintCast);
                
                if (cloudSnapshot.externalSrtPipeline) setExternalSrtPipeline(cloudSnapshot.externalSrtPipeline);
                if (cloudSnapshot.postScriptPackage) setPostScriptPackage(cloudSnapshot.postScriptPackage);
                if (Array.isArray(cloudSnapshot.externalSrtObserver)) setExternalSrtObserver(cloudSnapshot.externalSrtObserver);
                if (Array.isArray(cloudSnapshot.hfBgPrompts)) setHfBgPrompts(cloudSnapshot.hfBgPrompts);

                localStorage.setItem(executionStorageKey, JSON.stringify(cloudSnapshot));
              }
            } catch (err) {
              console.warn('[ScriptEngine] Falha ao tentar carregar última execução do Supabase:', err);
            } finally {
              setExecutionHydrated(true);
            }
          };
          loadFromCloud();
        } else {
          setExecutionHydrated(true);
        }
        return;
      }
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
      if (['faceless', 'avatar', 'vlog', 'avatar_flow'].includes(snapshot?.videoFormat)) setVideoFormat(snapshot.videoFormat);
      if (typeof snapshot?.manualPublishDate === 'string') setManualPublishDate(snapshot.manualPublishDate);
      if (typeof snapshot?.visualBlueprintSetting === 'string') setVisualBlueprintSetting(snapshot.visualBlueprintSetting);
      if (Array.isArray(snapshot?.visualBlueprintCast)) setVisualBlueprintCast(snapshot.visualBlueprintCast);
      // Detect pending title update injected by ThemeBank on resume
      if (snapshot?._pendingTitleUpdate && snapshot?._originalApprovedTitle) {
        setPendingTitleUpdate({ newTitle: snapshot._pendingTitleUpdate, oldTitle: snapshot._originalApprovedTitle });
      }
      // Read large objects (Cloud First, fallback to LocalStorage split-storage pattern)
      const srtPipelineKey = `${executionStorageKey}_srt_pipeline`;
      const postPackageKey = `${executionStorageKey}_post_package`;

      const loadHeavyAssets = async () => {
        let loadedSrt = null;
        let loadedPost = null;

        if (supabase && snapshot?._themeId) {
          const { data } = await getScriptExecution(snapshot._themeId);
          if (data?.execution_snapshot) {
            loadedSrt = data.execution_snapshot.externalSrtPipeline;
            loadedPost = data.execution_snapshot.postScriptPackage;
          }
        }

        // Fallback to local if cloud didn't have it (or offline)
        if (!loadedSrt) {
          try {
            const srtRaw = localStorage.getItem(srtPipelineKey);
            if (srtRaw) loadedSrt = JSON.parse(srtRaw);
          } catch { /* ignore */ }
          if (!loadedSrt && snapshot?.externalSrtPipeline) loadedSrt = snapshot.externalSrtPipeline; // old compat
        }

        // Fallback to local themes list if still missing (useful for restored backups with inline assets)
        if (!loadedSrt && snapshot?._themeId) {
          try {
            const themesStorageKey = `themes_${activeProject.id}`;
            const localThemesRaw = localStorage.getItem(themesStorageKey);
            if (localThemesRaw) {
              const localThemes = JSON.parse(localThemesRaw);
              const foundTheme = localThemes.find((t: any) => t.id === snapshot._themeId);
              const themeSnapshot = foundTheme?.production_assets?.execution_snapshot;
              if (themeSnapshot?.externalSrtPipeline) {
                loadedSrt = themeSnapshot.externalSrtPipeline;
                console.log(`[ScriptEngine] Fallback: carregou SRT pipeline da lista de temas para o tema ${snapshot._themeId}`);
              }
            }
          } catch (e) {
            console.warn('[ScriptEngine] Erro no fallback de carregar SRT pipeline da lista de temas:', e);
          }
        }

        if (!loadedPost) {
          try {
            const pkgRaw = localStorage.getItem(postPackageKey);
            if (pkgRaw) loadedPost = JSON.parse(pkgRaw);
          } catch { /* ignore */ }
          if (!loadedPost && snapshot?.postScriptPackage) loadedPost = snapshot.postScriptPackage; // old compat
        }

        // Fallback to local themes list for post package if still missing
        if (!loadedPost && snapshot?._themeId) {
          try {
            const themesStorageKey = `themes_${activeProject.id}`;
            const localThemesRaw = localStorage.getItem(themesStorageKey);
            if (localThemesRaw) {
              const localThemes = JSON.parse(localThemesRaw);
              const foundTheme = localThemes.find((t: any) => t.id === snapshot._themeId);
              const themeSnapshot = foundTheme?.production_assets?.execution_snapshot;
              if (themeSnapshot?.postScriptPackage) {
                loadedPost = themeSnapshot.postScriptPackage;
                console.log(`[ScriptEngine] Fallback: carregou post package da lista de temas para o tema ${snapshot._themeId}`);
              }
            }
          } catch (e) {
            console.warn('[ScriptEngine] Erro no fallback de carregar post package da lista de temas:', e);
          }
        }

        if (loadedSrt) {
          setExternalSrtPipeline(loadedSrt);
          // Auto-repair local storage key if it was missing
          if (snapshot?._themeId) {
            const localKey = `${executionStorageKey}_srt_pipeline`;
            if (!localStorage.getItem(localKey)) {
              try {
                localStorage.setItem(localKey, JSON.stringify(loadedSrt));
              } catch {}
            }
            // Auto-repair/sync to cloud table (script_executions) if missing
            if (supabase) {
              getScriptExecution(snapshot._themeId).then(({ data }) => {
                if (!data || !data.execution_snapshot || !data.execution_snapshot.externalSrtPipeline) {
                  console.log(`[ScriptEngine] Auto-sync: salvando SRT pipeline e post package em script_executions na nuvem...`);
                  upsertScriptExecution(snapshot._themeId, {
                    externalSrtPipeline: loadedSrt || undefined,
                    postScriptPackage: loadedPost || undefined,
                  }).catch(err => console.warn('[ScriptEngine] Falha ao upsertar heavy assets em script_executions:', err));
                }
              });
            }
          }
        }
        
        if (loadedPost) {
          setPostScriptPackage(loadedPost);
          // Auto-repair local storage key if it was missing
          if (snapshot?._themeId) {
            const localKey = `${executionStorageKey}_post_package`;
            if (!localStorage.getItem(localKey)) {
              try {
                localStorage.setItem(localKey, JSON.stringify(loadedPost));
              } catch {}
            }
          }
        }
      };

      // Fire and forget: load heavy assets in background
      loadHeavyAssets();

      if (Array.isArray(snapshot?.externalSrtObserver) && snapshot.externalSrtObserver.length > 0) setExternalSrtObserver(snapshot.externalSrtObserver);
      // Restore HF background prompts — dedicated key is primary, snapshot is fallback
      try {
        const hfKey = `yt_hf_bg_${executionStorageKey}`;
        const hfRaw = localStorage.getItem(hfKey);
        const hfSource = hfRaw ? JSON.parse(hfRaw) : snapshot?.hfBgPrompts;
        if (Array.isArray(hfSource) && hfSource.length > 0) {
          const validHf = hfSource.filter((p: any) => p.rowNumber > 0 && p.prompt);
          if (validHf.length > 0) setHfBgPrompts(validHf);
        }
      } catch { /* ignore */ }
      
      if (pendingData && pendingData.approvedTheme) {
        onClearPending?.();
      }
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
    hfBgPrompts,
    visualBlueprintSetting,
    visualBlueprintCast,
  ]);

  // Check storage usage on mount so the badge shows immediately if already high
  useEffect(() => { checkStorageUsage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

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
    // Only initialize Assembler V4 if it's a NEW theme (no approvedTheme)
    if (pendingData && !pendingData.approvedTheme) {
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

      setApprovedTheme(pendingData.refined_title || pendingData.title || '');
      setApprovedBriefing(null);
      setScriptBlocks(v4Blocks);
      setScriptStage('blueprint');
      setPostScriptPackage(null);
      
      const themeDate = pendingData.target_publish_date || pendingData.production_assets?.target_publish_date || '';
      setManualPublishDate(themeDate);
      const dateParts = getManualPublishDateParts(themeDate);
      setManualPublishDraftDate(dateParts.date);
      setManualPublishDraftTime(dateParts.time);

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

    // Split community elements into Specific (bordões, apelidos, piadas curtas) and Open (posicionamentos, críticas, opiniões)
    const specificCommunityItems = uniqueCommunityTemplates.filter((item: any) => {
      const text = ((item?.name || '') + ' ' + (item?.description || '')).toLowerCase();
      return text.length < 60 && !text.includes('posicionamento') && !text.includes('critica') && !text.includes('critico') && !text.includes('opiniao');
    });
    const openCommunityItems = uniqueCommunityTemplates.filter((item: any) => {
      const text = ((item?.name || '') + ' ' + (item?.description || '')).toLowerCase();
      return text.length >= 60 || text.includes('posicionamento') || text.includes('critica') || text.includes('critico') || text.includes('opiniao');
    });

    const specificCommunityCatalog = buildCommunityReferenceCatalog(specificCommunityItems) || 'Nenhum cadastrado';
    const openCommunityCatalog = buildCommunityReferenceCatalog(openCommunityItems) || 'Nenhum cadastrado';

    const projectName = activeProject?.name || activeProject?.project_name || 'Projeto ativo';
    const persona = activeProject?.persona_matrix?.demographics || '';
    const pain = activeProject?.persona_matrix?.pain_alignment || '';
    const metaphors = activeProject?.metaphor_library || '';
    const sop = activeProject?.editing_sop || {};
    const selectedNarrativeCurve = approvedBriefing?.selectedNarrativeCurve;
    const selectedArgumentMode = approvedBriefing?.selectedArgumentMode;
    const selectedRepetitionRules = (approvedBriefing?.selectedRepetitionRules || []) as Array<{ id?: string; name?: string; pattern?: string; description?: string }>;

    // Strategic project variables (currently neglected fields in prompting)
    const languageStyle = activeProject?.persona_matrix?.language || '';
    const desiredOutcome = activeProject?.persona_matrix?.desired_outcome || '';
    const proofPoints = activeProject?.persona_matrix?.proof_points || '';
    const positioningAngle = activeProject?.editorial_line?.positioning_angle || '';
    const contentBoundaries = activeProject?.editorial_line?.content_boundaries || '';
    const passion = activeProject?.phd_strategy?.passion || '';
    const skill = activeProject?.phd_strategy?.skill || '';
    const demand = activeProject?.phd_strategy?.demand || '';
    const baseSystemInstruction = activeProject?.base_system_instruction || '';

    // Narrator identity: combine positioning, tone, active voice and PHD strategies
    const narratorPositioning = activeProject?.narrative_voice?.positioning?.trim() || '';
    const atmosphereList = (activeProject?.narrative_voice?.atmosphere || []).join(', ');
    const dominantVoiceLabel = approvedBriefing?.dominantVoice || approvedBriefing?.diagnostics?.locked?.voicePatternId || '';
    const narratorIdentity = [
      narratorPositioning ? `Posicionamento de Autoridade: ${narratorPositioning}` : '',
      dominantVoiceLabel === 'Vulnerabilidade'
        ? 'Estilo de fala ativo: Primeira pessoa, a partir da propria experiencia. Nao como especialista externo, mas como alguem que passou pelo mesmo problema e tem cicatriz para mostrar.'
        : dominantVoiceLabel === 'Desafio Direto'
        ? 'Estilo de fala ativo: Par senior que confronta sem agredir. Nao suaviza, nao enrola. Da o diagnostico e vai embora.'
        : 'Estilo de fala ativo: Distancia tecnica analitica. Mostra o mecanismo, nao a emocao. A autoridade vem da clareza, nao da intensidade.',
      atmosphereList ? `Atmosfera/Tom de voz predominante: ${atmosphereList}.` : '',
      activeProject?.puc ? `Posicionamento Unico do Canal (PUC): ${activeProject.puc}.` : '',
      passion ? `Paixao do criador (diretriz energetica): ${passion}` : '',
      skill ? `Habilidade/Autoridade do criador: ${skill}` : '',
    ].filter(Boolean).join('\n');

    const languageSection = languageStyle || desiredOutcome || proofPoints
      ? [
          '\nESTILO LINGUISTICO E TONE OF VOICE',
          languageStyle ? `- Diretriz de linguagem: ${languageStyle}` : '',
          desiredOutcome ? `- Desfecho desejado a prometer no roteiro: ${desiredOutcome}` : '',
          proofPoints ? `- Fatos/Pontos de prova a incorporar: ${proofPoints}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const boundariesSection = positioningAngle || contentBoundaries
      ? [
          '\nDIRETRIZES DE CONTEUDO E LIMITES (BOUNDARIES)',
          positioningAngle ? `- Angulo de posicionamento editorial: ${positioningAngle}` : '',
          contentBoundaries ? `- Limites de conteudo (O que entra e o que NAO entra):\n${contentBoundaries}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const customSystemSection = baseSystemInstruction
      ? `\nINSTRUCOES ADICIONAIS DO SISTEMA DO PROJETO\n- Aplique estritamente estas regras de sistema do canal:\n${baseSystemInstruction}`
      : '';

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
      narrativeRole?: string,
      argumentMode?: { name?: string; pattern?: string; description?: string } | null
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

      // Inject argument mode pattern as active persuasion directive for this block
      const argumentPattern = argumentMode?.pattern || argumentMode?.description || '';
      const argumentGuidance = argumentPattern
        ? ` Modo de persuasao ativo ("${argumentMode?.name || 'Argumento'}") — aplique neste bloco: ${argumentPattern}`
        : '';

      return `Postura obrigatoria: ${voiceGuidance}; ${roleGuidance}.${argumentGuidance}`;
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

      // Distribute curve stages proportionally across blocks (avoids repeating last stage)
      const curveStages = selectedNarrativeCurve?.pattern
        ? selectedNarrativeCurve.pattern.split(/\s*>\s*/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const curveStageForBlock = curveStages.length > 0
        ? (() => {
            const totalBlocks = promptBlocks.length;
            const stageIndex = totalBlocks <= 1
              ? 0
              : Math.round((index / (totalBlocks - 1)) * (curveStages.length - 1));
            return curveStages[Math.min(stageIndex, curveStages.length - 1)];
          })()
        : null;

      // Calculate progress relative to the entire script (from 0 to 1)
      const relativeProgress = index / (promptBlocks.length - 1 || 1);
      const isUnder30Percent = relativeProgress <= 0.3;
      
      const ctaType = isUnder30Percent ? 'Nativa/Engajamento' : 'Conversao/Externa';
      const ctaGuidance = isUnder30Percent
        ? `- CAMADA CTA (${ctaType} - ate 30% do video): Insira uma chamada sutil de engajamento nativo (ex: curtir, comentar usando piada ou apelido do canal, ou se inscrever) de forma extremamente integrada e sem parecer comercial.`
        : `- CAMADA CTA (${ctaType} - apos 30% do video): Insira uma transicao/chamada focada em conversao para acao externa (ex: mentoria, produto, link na descricao). O convite deve ser uma evolucao obvia da entrega tecnica do bloco.`;

      const communityReference = orchestratedBlock?.communityElement
        ? orchestratedBlock.communityElement.replace(/[\p{Emoji}]/gu, '').replace(/\s{2,}/g, ' ').trim()
        : '';

      const cadenciaRhythmSpec = index === 0
        ? [
            `[ESTRUTURA DE CADENCIA - PORTAL DE ENTRADA]`,
            `- Abertura: Inicie com impacto usando a Voz Dominante. PROIBIDO jargoes como 'Voce ja se perguntou...', 'Imagine que...'.`,
            `- CTA: Insira uma chamada de engajamento nativo (baixo atrito) no fluxo de contextualizacao.`,
            communityReference ? `- Elemento de Comunidade Ativo: "${communityReference}". Reinterprete de forma natural.` : '',
            `- Informacao/Conteudo: Entregue a tese central inicial.`
          ].filter(Boolean).join('\n')
        : [
            `[ESTRUTURA DE CADENCIA NARRATIVA EM 3 TEMPOS]`,
            `Voce DEVE tecer este bloco intercalando estritamente estas 3 camadas de forma natural:`,
            `1. CAMADA CTA:`,
            `   ${ctaGuidance}`,
            `2. CAMADA DE COMUNIDADE:`,
            `   - Use e reinterprete ativos da comunidade.`,
            communityReference ? `   - Ativo especifico selecionado para este bloco: "${communityReference}". Use-o como gatilho de pertencimento.` : '   - Integre referencias de identidade ou jargoes de forma leve.',
            `3. CAMADA DE INFORMAÇÃO/CONTEÚDO:`,
            `   - Entregue o nucleo tecnico e a tese de "${block.title}".`
          ].join('\n');

      const blockLines = [
        `BLOCO ${index + 1} - DESENVOLVIMENTO`,
        `Titulo interno: ${block.title}`,
        `Meta de caracteres: ${formatCharsLabel((orchestratedBlock?.blockChars || 0) + (index === 0 ? hookChars : 0) + (index === promptBlocks.length - 1 ? finalCtaChars : 0) + (hasMidCta && index === Number(approvedBriefing?.midCta?.position || -1) ? midCtaChars : 0))}`,
        `Voz dominante: ${orchestratedBlock?.voiceStyle || approvedBriefing?.dominantVoice || 'Nao definida'}`,
        `Mapa de tensao: ${orchestratedBlock?.tensionLevel || 'Media'} | Papel: ${orchestratedBlock?.narrativeRole || 'Diagnostico'} | Transicao: ${orchestratedBlock?.transitionMode || 'Consequencia'}`,
        `Funcao narrativa: ${orchestratedBlock?.missionNarrative || block.content}`,
        buildExecutionPosture(orchestratedBlock?.voiceStyle, orchestratedBlock?.narrativeRole, selectedArgumentMode),
        `Diretriz estrutural: ${extractPrimaryDirective(block.content)}`,
        `SOP / entonacao: ${block.sop || 'Nao definido'}`,
        cadenciaRhythmSpec,
        // Inject only the specific stage for this block position
        ...(curveStageForBlock
          ? [`Estagio atual da curva narrativa para este bloco: ${curveStageForBlock}`]
          : []),
        // For block 0: translate the hook into a writing directive — orientation, not text to copy
        ...(index === 0 && (approvedBriefing?.openingHook?.name || approvedBriefing?.openingHook?.pattern || approvedBriefing?.openingHook?.description)
          ? (() => {
              const hookName = approvedBriefing.openingHook?.name || '';
              const hookRef = approvedBriefing.openingHook?.pattern || approvedBriefing.openingHook?.description || '';
              const lines = [
                `DIRETRIZ DE ENTRADA DO ROTEIRO — orienta apenas o primeiro paragrafo, sobrepoe a voz dominante nesse ponto:`,
                `Ativo de abertura selecionado: "${hookName}"`,
                hookRef ? `Orientacao funcional do ativo (bussola de escrita, nao texto a copiar): ${hookRef}` : '',
                `Como aplicar: identifique a pessoa gramatical, o angulo de tensao e a sensacao concreta que o ativo evoca. Abra o roteiro com linguagem propria que capture essa mesma energia e esse ponto de entrada. O primeiro paragrafo deve soar como se esse ativo tivesse sido escrito especificamente para este tema — com palavras completamente diferentes.`,
              ].filter(Boolean).join('\n');
              return [lines];
            })()
          : []),
        ...connectionLines,
        buildAlignedBridgeInstruction(nextBlock, nextNarrativeBlock),
      ];

      return blockLines.join('\n');
    });

    const midCtaBlockNum = Number(approvedBriefing?.midCta?.position || 0) + 1;
    const midCtaSection = hasMidCta
      ? [
          'INTERVENCAO INTERMEDIARIA OBRIGATORIA',
          `Insercao: esta microchamada DEVE aparecer imediatamente apos a ultima frase do bloco de desenvolvimento ${midCtaBlockNum}. Nao crie um bloco separado. Nao omita esta instrucao. Nao mova para outro ponto do roteiro. O texto deve fluir como continuacao natural do bloco ${midCtaBlockNum} e transicao organica para o bloco ${midCtaBlockNum + 1}.`,
          `Meta de caracteres: ${formatCharsLabel(midCtaChars)}`,
          'Mapa de tensao: Media | Papel: Aplicacao | Transicao: Alivio',
          `Funcao narrativa: inserir uma microchamada baseada no ativo "${approvedBriefing?.midCta?.name || 'CTA intermediario'}", curta, organica e sem soar comercial demais.`,
          `Referencia funcional: ${approvedBriefing?.midCta?.pattern || 'Nao definida'}`,
          'Regra operacional: esta intervencao e obrigatoria e nao pode ser omitida, resumida ou deslocada. Nao conta como bloco adicional na numeracao final.',
        ].join('\n')
      : '';

    const lockedCompositionSection = approvedBriefing?.diagnostics ? [
      `Camada de abertura selecionada: ${approvedBriefing?.openingHook?.name || 'Nao definida'}`,
      // Translate opening hook into a functional writing directive — orientation, not text to copy
      ...(approvedBriefing?.openingHook?.pattern || approvedBriefing?.openingHook?.description
        ? [`Diretriz de abertura (orientacao funcional — nao copie, use como bussola de escrita): ${approvedBriefing.openingHook.pattern || approvedBriefing.openingHook.description}`]
        : []),
      `Camada final de conversao selecionada: ${approvedBriefing?.selectedCta?.name || 'Nao definida'}`,
      `Estrutura selecionada: ${approvedBriefing?.selectedTitleStructure?.name || 'Nao definida'}`,
      `Curva selecionada: ${selectedNarrativeCurve?.name || 'Nao definida'}`,
      // Inject curve pattern as macro progression directive
      ...(selectedNarrativeCurve?.pattern
        ? [`Progressao macro da curva (aplique nos blocos em sequencia): ${selectedNarrativeCurve.pattern}`]
        : []),
      `Modo de argumentacao: ${selectedArgumentMode?.name || 'Nao definido'}`,
      // Inject argument mode pattern as persuasion posture directive
      ...(selectedArgumentMode?.pattern || selectedArgumentMode?.description
        ? [`Diretriz do modo de argumentacao (postura dominante de persuasao): ${selectedArgumentMode.pattern || selectedArgumentMode.description}`]
        : []),
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
- Executar toda a geracao do roteiro em uma unica thread/fluxo continuo de geracao. E terminantemente proibido processar por meio de requisicoes independentes, prompts separados ou fragmentados para cada bloco.
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
- Elementos de comunidade ESPECIFICOS (bordoes, piadas, apelidos): ${specificCommunityCatalog}
- Elementos de comunidade ABERTOS (posicionamentos, criticas, opinioes): ${openCommunityCatalog}

IDENTIDADE DO NARRADOR
${narratorIdentity}
- Esta identidade deve ser sentida na escolha de palavras, no nivel de intimidade, na postura diante do assunto e no ponto de entrada de cada bloco.
- O narrador deve ser uma presenca constante e ativa ao longo de todo o video. Ele nao e apenas um locutor passivo de informacoes, mas sim uma personalidade que se manifesta, comenta, reage e expressa suas opinioes e vivencias de forma natural e integrada ao longo de todo o roteiro.
- Nao declare a identidade do narrador no texto. Apenas encarne-a com presenca marcante.
${languageSection}${boundariesSection}${customSystemSection}

[DIRETRIZ DE CONTROLE NARRATIVO - CUIDADO COM A IA]
1. EVITE O EFEITO BARNUM: Nao use adjetivos ou descricoes genericas que se anulam (ex: ser 'acolhedora, firme, pratica e contemplativa' ao mesmo tempo). Assuma uma postura narrativa consistente, clara e sem contradiccoes vagas.
2. EVITE A SUBMISSAO AO NICHO: As caracteristicas, habitos e gostos do narrador devem ser de uma pessoa real e NAO podem ser apenas redundancias do nicho do canal. Se o canal fala sobre emagrecimento, o habito do narrador nao deve ser apenas 'tomar shake', e sim traços cotidianos independentes (como colecionar vinil, praticar marcenaria ou ouvir lofi de madrugada). Isso gera tridimensionalidade autentica.

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

MECANICAS DE RETENCAO OBRIGATORIAS
- Os primeiros 5 segundos devem gerar impacto imediato, sem preambulo, apresentacao ou contexto. O tipo de abertura deve ser guiado pela voz dominante declarada e pelo ativo de abertura selecionado no briefing, nao por uma formula padrao.
- Voz Vulnerabilidade: abra com cena concreta de falha, tensao pessoal ou momento de decisao. Nao use pergunta retorica como entrada padrao.
- Voz Desafio Direto: abra com afirmacao polarizadora, diagnostico provocativo ou problema imediato sem introducao. Nao use "Imagine que..." ou "Voce ja se perguntou..." como primeiro movimento.
- Voz Tecnica: abra com dado surpreendente, contradicao observavel ou mecanismo revelado. Nao use narrativa pessoal como ponto de entrada.
- Proibido como primeira frase de qualquer roteiro: "Voce ja se perguntou...", "Imagine que...", "Hoje vou te falar sobre...", "Neste video...", "Ola [nome]...". Essas construcoes sinalizam roteiro generico antes de qualquer conteudo real.
- Varie o ponto de entrada gramatical entre roteiros: ora comece com uma acao ("Ele abriu o computador e..."), ora com uma contradicao ("Todo mundo faz X. Ninguem percebe que Y."), ora com um dado concreto ("487 dias."), ora com uma cena direta ("3h da manha. Notificacao."). A abertura deste roteiro nao deve usar o mesmo padrao gramatical da abertura-tipo do projeto.
- Crie pelo menos um curiosity gap nos primeiros blocos: plante uma tensao ou duvida que so sera respondida nos blocos finais. O viewer nao pode antecipar como o assunto sera resolvido desde o inicio.
- Em momentos de alta probabilidade de saida (apos entrega de insight relevante ou no meio do roteiro), use escalacao ou revelacao parcial para manter a progressao ativa.
- Cada bloco deve parecer uma etapa necessaria da jornada. O viewer que pulasse qualquer parte precisaria sentir que perdeu algo essencial.

REGRAS DE HUMANIZACAO
- Cada bloco deve conter pelo menos uma sensacao fisica ou sensorial concreta. Nao use abstracoes: nao "voce sente medo", mas "aquela tensao no peito antes de abrir o Slack de manha e ver mensagens nao lidas do gestor".
- Use frases fragmentadas intencionalmente em momentos de revelacao ou tensao maxima. Exemplo: "Isso nao e sorte. E processo. Processo. Todo. Dia."
- Use autocorrecao ou hesitacao natural em momentos de vulnerabilidade ou diagnostico pesado. Exemplo: "O resultado foi... cara... tipo surpreendente mesmo."
- Use repeticao enfatica para impacto em frases-chave. Exemplo: "Ele fez isso. Todo dia. TODO. DIA."
- Vocabulario proibido por soar formal ou robotico: "portanto", "ademais", "e necessario", "individuos", "outrossim", "destarte", "neste sentido", "no que tange". Use: "entao", "dai", "voce precisa", "pessoas", "gente".
- Cada paragrafo deve passar no teste da conversa: seria falado naturalmente para um amigo proximo? Se soar como relatorio ou apresentacao formal, reescreva.
- Nunca inicie um bloco com nome canonico de conceito, rotulo operacional ou jargao do sistema. Inicie com cena, sensacao, pergunta concreta ou observacao direta.

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
- O roteiro completo precisa parecer escrito de uma vez so, com progressao, cadencia e memoria interna, mantendo a coerencia de uma unica thread de pensamento e narracao.
- Nao devolver explicacoes, rotulos tecnicos, markdown, numeracoes, titulos de secao ou qualquer comentario fora da narracao.

BLUEPRINT BLOCO A BLOCO
${blockSpecifications.join('\n\n')}${midCtaSection ? `\n\n${midCtaSection}` : ''}
${videoFormat === 'avatar_flow' ? `
[ESTILO DE NARRATIVA OBRIGATÓRIO — AVATAR FLOW]
- VOCÊ DEVE DIVIDIR RÍGIDAMENTE A NARRAÇÃO EM TRECHOS DE CERCA DE 24 A 26 PALAVRAS POR BLOCO. Cada bloco do blueprint deve conter estritamente essa quantidade de palavras.
- NUNCA, SOB QUALQUER HIPÓTESE, ABREVIE "Inteligência Artificial" ou qualquer sigla/número que possa causar erro na narração de voz. Escreva tudo POR EXTENSO (ex: escreva "Inteligência Artificial", NUNCA "IA"; "cinquenta por cento" em vez de "50%"; "quinze dias" em vez de "15 dias"; etc.).
- NÃO INSIRA SUBTÍTULOS SOLTOS. Como isso é uma narração contínua de cena por cena, qualquer subtítulo ou cabeçalho deve ser transformado em fala natural de transição (exemplo: transforme "Por que essa oportunidade não dura para sempre" em algo como "Agora deixa eu te explicar por que essa oportunidade não vai durar para sempre.").` : ''}

FORMATO DE SAIDA
- Escreva o roteiro inteiro como texto corrido de narrador, sem nenhuma divisao visual.
- Toda a geracao deve acontecer em um único turno de resposta continuo (thread unica). Nao use ou simule requisicoes independentes.
- Nao use cabecalhos, numeracao de blocos, titulos de secao, marcadores de markdown, colchetes ou qualquer elemento estrutural no texto entregue.
- PROIBIDO: emojis, icones ou simbolos graficos de qualquer tipo (ex: 🟢 🔴 ✅ ⚠️). Este roteiro sera narrado em voz — apenas palavras escritas por extenso. Se quiser convidar o publico a reagir, descreva a acao por extenso ("responda com verde ou vermelho"), nunca com simbolo.
- O roteiro deve fluir do inicio ao fim como uma unica fala continua. A ordem e funcao interna de cada bloco devem ser respeitadas, mas nao devem ser visiveis no texto final.
- Nao adicione notas ao editor, indicacoes de tom, parenteses explicativos ou qualquer comentario fora da narracao.
- ENCERRAMENTO ABSOLUTO: o roteiro termina na ultima palavra da narracao. Nao adicione perguntas ao produtor ("Quer que eu ajuste..."), sugestoes de revisao, comentarios pos-roteiro ou qualquer texto apos o fechamento narrativo. O modelo nao deve comunicar nada ao leitor apos o fim do roteiro.
- O resultado deve ser um texto pronto para leitura de narrador, do primeiro ao ultimo caractere, sem nenhum ajuste adicional de formatacao.
- Respeite a meta total de ${formatCharsLabel(totalChars)} e a distribuicao de caracteres por bloco com tolerancia maxima de 8%.
- Nao omita nenhuma parte, nao una secoes, nao altere a ordem narrativa interna.`;
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
    const newStatus = resolveThemeStatusFromPublishDate(nextValue, 'scripted');
    const isSchedulingOrPublishing = newStatus === 'scheduled' || newStatus === 'published';

    setManualPublishDate(nextValue);

    // When moving to scheduled/published, txt and srt content are no longer needed.
    // Clear them from state to free localStorage space for the next project in production.
    if (isSchedulingOrPublishing) {
      setExternalScriptText('');
      setExternalSrtText('');
      setExternalSrtObserver(buildInitialSrtObserver());
    }

    if (approvedBriefing && approvedTheme) {
      await syncApprovedThemeSnapshot({
        manualPublishDate: nextValue,
        ...(isSchedulingOrPublishing ? {
          externalScriptText: '',
          externalSrtText: '',
          externalSrtObserver: [],
        } : {}),
      });
    }

    persistExecutionSnapshotLocally({
      manualPublishDate: nextValue,
      ...(isSchedulingOrPublishing ? {
        externalScriptText: '',
        externalSrtText: '',
        externalSrtObserver: [],
      } : {}),
    });

    if (isSchedulingOrPublishing) {
      showToast('Conteúdo de texto liberado. Espaço de armazenamento otimizado.');
    }
  };

  const clearPublishDate = async () => {
    setManualPublishDate('');
    setManualPublishDraftDate('');
    setManualPublishDraftTime('');
    persistExecutionSnapshotLocally({ manualPublishDate: '' });
    if (approvedBriefing && approvedTheme) {
      await syncApprovedThemeSnapshot({ manualPublishDate: '' });
    }
    showToast('Data de postagem removida. Status voltou para Produção.');
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

    // Split large objects into separate localStorage keys to avoid QuotaExceededError
    // The main snapshot stores a sentinel instead of the full object
    const srtPipelineKey = `${executionStorageKey}_srt_pipeline`;
    const postPackageKey = `${executionStorageKey}_post_package`;

    const { externalSrtPipeline: srtPipeline, postScriptPackage: postPkg, ...snapshotWithoutLargeObjects } = snapshot as any;

    const compactSnapshot = {
      ...snapshotWithoutLargeObjects,
      _hasSrtPipeline: !!srtPipeline,
      _hasPostPackage: !!postPkg,
      _themeId: (snapshot as any)._themeId,
    };

    // Pre-emptive cleanup: remove stale snapshot_ keys only (safe — these are small, per-theme compact snapshots)
    try {
      const toClean: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('snapshot_')) toClean.push(k);
      }
      toClean.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }

    try {
      // Save large objects only when truthy.
      // IMPORTANT: when null, we intentionally leave the existing key intact.
      // Explicit deletion of these keys happens only in clearExecutionState().
      if (srtPipeline || postPkg) {
        const currentThemeId = (snapshot as any)._themeId;
        if (supabase && currentThemeId) {
          // CLOUD FIRST: Save heavy assets to script_executions table to avoid QuotaExceededError
          upsertScriptExecution(currentThemeId, {
            externalSrtPipeline: srtPipeline || undefined,
            postScriptPackage: postPkg || undefined,
          }).catch(err => console.warn('[ScriptEngine] Failed to save heavy assets to Supabase', err));
        } else {
          // OFFLINE FALLBACK: Save to localStorage (may throw QuotaExceededError)
          if (srtPipeline) {
            try {
              localStorage.setItem(srtPipelineKey, JSON.stringify(srtPipeline));
            } catch (quotaErr) {
              console.warn('[ScriptEngine] SRT pipeline too large for localStorage, skipping persistence of that field.', quotaErr);
              compactSnapshot._hasSrtPipeline = false;
            }
          }
          if (postPkg) {
            try {
              localStorage.setItem(postPackageKey, JSON.stringify(postPkg));
            } catch (quotaErr) {
              console.warn('[ScriptEngine] Post-script package too large for localStorage, skipping persistence of that field.', quotaErr);
              compactSnapshot._hasPostPackage = false;
            }
          }
        }
      }

      // Save the compact snapshot (always small enough)
      localStorage.setItem(executionStorageKey, JSON.stringify(compactSnapshot));
      // Update storage usage indicator after every write
      checkStorageUsage();
    } catch (err) {
      console.warn('[ScriptEngine] Falha ao persistir snapshot localmente.', err);
    }
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
    const normalized = text.replace(/\n/g, '\n').trim();
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
    const normalized = text.replace(/\n/g, '\n').trim();
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

  const compilePromptText = (text: string) => {
    if (!text) return '';
    if (preserveBrackets) return text;
    let compiled = text;
    visualBlueprintCast.forEach((char) => {
      if (!char.name || !char.description) return;
      const escapedName = char.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const regex = new RegExp(`\\[${escapedName}\\]`, 'gi');
      compiled = compiled.replace(regex, `(${char.description.trim()})`);
    });
    return compiled;
  };

  const compileUnifiedImagePrompts = (): string => {
    if (!externalSrtPipeline) return '';
    const baseText = compilePromptText(externalSrtPipeline.imagePromptsTxt);
    
    // In faceless mode, we don't append HyperFrame background image prompts.
    if (videoFormat === 'faceless') {
      return baseText;
    }

    const hfRows = externalSrtPipeline.rows.filter((r: any) => normalizeAssetType(r.asset) === 'hyperframe');
    if (!hfRows.length) return baseText;

    const hfLines = hfRows.map((r: any) => {
      const generated = hfBgPrompts?.find((p) => p.rowNumber === r.rowNumber && p.rowNumber !== -1);
      const promptText = generated?.prompt || `Photorealistic still image of a dark cinematic background representing ${r.texto.slice(0, 60).trim()}, high quality YouTube B-roll style.`;
      return `HF${r.rowNumber}: ${compilePromptText(promptText)}`;
    });

    const separator = baseText.trim() ? '\n' : '';
    return `${baseText}${separator}${hfLines.join('\n')}`;
  };

  const getCharacterSheetPrompt = (char: { name: string; description: string }) => {
    const styleBlock = char.description.toLowerCase().includes('anime') || 
                       char.description.toLowerCase().includes('cartoon') || 
                       char.description.toLowerCase().includes('illustrated') ||
                       char.description.toLowerCase().includes('stylized')
      ? "Stylized digital art style rendering. Clean, consistent line work with uniform weight. Professional animation/game studio production quality."
      : "Ultra-photorealistic rendering. Hyper-detailed as if captured by a high-end full-frame DSLR camera (Canon EOS R5, 85mm portrait lens, f/2.8, ISO 100). Skin with natural pores, subtle micro-imperfections, fine peach fuzz, and realistic subsurface scattering. Hair with individual strand-level detail, natural sheen, and volume. Eyes with realistic moisture, light reflection, and iris detail. Fabric textures clearly distinguishable — cotton weave, denim texture, leather grain, knit patterns. RAW photo quality, 8K resolution detail.";

    return [
      `Create a professional character reference sheet presented as a technical model turnaround of ${char.name}. Clean, neutral, solid plain gray background — no gradients, no environments, no props. Professional concept art turnaround used in film, game development, or animation production.`,
      styleBlock,
      `Character details: ${char.description.trim()}`,
      `The image is composed of exactly two horizontal rows with clean panel separation and even spacing:`,
      `Top row — four full-body standing views side by side, left to right:\nPanel 1: Front view — character standing facing the camera directly, feet slightly apart in a relaxed A-pose, arms slightly away from the body with hands relaxed at sides, fingers naturally open, full body visible head to feet, camera at chest height straight on.\nPanel 2: Left profile view — character rotated exactly 90 degrees facing left, same A-pose, full body visible head to feet, camera at chest height perpendicular to the side, showing left side of face, left arm forward, right arm behind.\nPanel 3: Right profile view — character rotated exactly 90 degrees facing right, same A-pose, full body visible head to feet, camera at chest height perpendicular to the side, showing right side of face, right arm forward, left arm behind, perfect mirror of panel 2.\nPanel 4: Back view — character rotated 180 degrees facing directly away from camera, same A-pose, full body visible head to feet, camera at chest height straight on, showing back of head, back of outfit, shoe heels.`,
      `Bottom row — three close-up portrait views centered beneath the full-body row, left to right:\nPanel 5: Front portrait — head, neck, and upper shoulders visible, character facing camera directly, neutral expression, highly detailed facial features, skin texture, hair, upper clothing neckline, camera at eye level straight on.\nPanel 6: Left profile portrait — head, neck, and upper shoulders visible, head rotated 90 degrees facing left, showing left ear, left jawline, left side of nose, left brow, same neutral expression, camera at eye level perpendicular, highly detailed.\nPanel 7: Right profile portrait — head, neck, and upper shoulders visible, head rotated 90 degrees facing right, showing right ear, right jawline, right side of nose, right brow, same neutral expression, camera at eye level perpendicular, perfect mirror of panel 6, highly detailed.`,
      `Absolute identity consistency across all 7 panels. Same face with identical bone structure, eye spacing, nose, lips, and chin in every view. Same body with identical height, proportions, build, and posture. Same outfit with every detail matching perfectly from every angle — same wrinkles, pocket placement, color, fit, material appearance. Same hair color, length, volume, and styling from every angle, anatomically consistent when viewed from front, side, and back. Same skin tone and marks across all panels. Same accessories in the same position from every angle. No variation in age, weight, or any physical attribute between panels. The turnaround must look like the same subject captured from different angles in the same session.`,
      `Three-point studio lighting identical across all 7 panels. Key light positioned upper-right at 45 degrees with medium-soft intensity. Fill light positioned left, softer than key light. Subtle rim light from behind for edge separation from background. Same shadow direction, softness, and highlight intensity in every panel. Neutral daylight color temperature. Crisp, print-ready output. Sharp details throughout with no softness, blur, or artifacts. Professional production quality. Clean panel edges, even spacing. No text, labels, watermarks, or annotations. Landscape orientation for the overall sheet. High resolution.`
    ].join('\n\n');
  };

  const copyAllCharacterPrompts = () => {
    if (visualBlueprintCast.length === 0) return;
    
    const combinedPrompts = visualBlueprintCast.map((char) => {
      const prompt = getCharacterSheetPrompt(char);
      return `==================================================\nFICHA DE PERSONAGEM: ${char.name.toUpperCase()}\n==================================================\n\n${prompt}`;
    }).join('\n\n\n');

    void copyTextToClipboard(combinedPrompts, 'Todos os prompts de personagens foram copiados!');
  };

  const extractVisualBlueprintAndCast = async () => {
    const textToAnalyze = externalScriptText || '';
    if (!textToAnalyze.trim()) {
      alert('Nao ha roteiro para analisar. Carregue um roteiro .txt primeiro.');
      return;
    }

    const engine = activeProject?.ai_engine_rules?.engine || 'openai';
    const model = activeProject?.ai_engine_rules?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1');
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    if (!apiKey) {
      alert(`Por favor, configure sua chave de API para ${engine} em Ajustes Globais ou no navegador.`);
      return;
    }

    setIsExtractingVisuals(true);
    try {
      const response = await fetch('/api/assets/analyze-script-visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText: textToAnalyze,
          engine,
          model,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject?.ai_engine_rules,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao analisar o roteiro.'));
      }

      const setting = data.setting || '';
      const characters = Array.isArray(data.characters) ? data.characters : [];

      setVisualBlueprintSetting(setting);
      setVisualBlueprintCast(characters);

      persistExecutionSnapshotLocally({
        visualBlueprintSetting: setting,
        visualBlueprintCast: characters,
      });
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao extrair visuais: ${err.message}`);
    } finally {
      setIsExtractingVisuals(false);
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
      showToast('Nenhum conteudo disponivel para copiar.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao copiar conteudo.', error);
      showToast('Nao foi possivel copiar o conteudo.');
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


  /**
   * Builds a rich narrative context string to anchor image/video prompt generation.
   *
   * Strategy: per-block summary (first 150 chars per block) so the LLM sees the
   * FULL narrative structure (Hook → Context → Dev → CTA) regardless of which
   * part of the SRT is in the current batch.
   *
   * Why not truncate by total chars? Cutting at 800 chars loses all blocks after
   * the first one or two, leaving the LLM blind to the rest of the video.
   * Why not first-N-blocks? Loses later blocks (Dev, CTA) which cover 60%+ of the SRT.
   * Per-block summary: ~150 chars × 5-8 blocks ≈ 250-400 tokens — covers everything.
   */
  const buildVideoContext = (): string => {
    const parts: string[] = [];

    // 1. Approved theme (primary anchor)
    if (approvedTheme) {
      parts.push(`Video title: ${approvedTheme}`);
    }

    // 2. Strategic pain point from briefing
    if (approvedBriefing?.pain_point) {
      parts.push(`Strategic pain point: ${approvedBriefing.pain_point}`);
    } else if (approvedBriefing?.theme_title && approvedBriefing.theme_title !== approvedTheme) {
      parts.push(`Theme: ${approvedBriefing.theme_title}`);
    }

    // 3. Narrative structure — internal mode: use scriptBlocks (source of truth)
    //    Since the SRT is the script with timing, every row in the SRT corresponds
    //    to content from these blocks. Giving the LLM the full block structure lets
    //    it contextualize any batch regardless of where in the timeline it falls.
    if (executionMode === 'internal' && scriptBlocks.length > 0) {
      const blockSummaries = scriptBlocks
        .filter((b) => b.type !== 'SOP' && b.content?.trim())
        .map((b) => {
          const summary = b.content.trim().slice(0, 150);
          return `[${b.type}: ${b.title}] ${summary}${b.content.trim().length > 150 ? '...' : ''}`;
        })
        .join(' | ');

      if (blockSummaries) {
        parts.push(`Full script structure: ${blockSummaries}`);
      }
    }

    // 4. External mode: use the script text directly (SRT == script with timing)
    if (executionMode === 'external') {
      const scriptSource = externalScriptText?.trim() || externalSrtText?.trim() || '';
      if (scriptSource) {
        parts.push(`Script context: ${scriptSource.slice(0, 500)}${scriptSource.length > 500 ? '...' : ''}`);
      }
    }

    return parts.filter(Boolean).join('\n');
  };

  const processAttachedSrtAssets = async () => {
    if (!externalSrtText.trim()) {
      alert('Anexe um arquivo .srt antes de processar os assets.');
      return;
    }

    if (videoFormat !== 'faceless' && videoCharacterMode === 'custom' && !videoCharacterCustom.trim()) {
      alert('Descreva o personagem personalizado antes de processar os prompts de video.');
      return;
    }

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    setHfBgPrompts(null);           // limpa fundos HF do tema anterior (bug fix contaminação)
    _pipelineResultRef.current = null;
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

      updateSrtObserverStep('assets', 'running', 'Marcando as linhas como texto, avatar, video, imagem ou hyperframe...');
      const assetRows      = applyAssetRules(parsedRows, videoFormat, externalSrtText);
      const cooledRows     = enforceTextoCooldown(assetRows);             // cooldown 20s entre textos
      const hfRows         = applyHyperframeRules(cooledRows, videoFormat); // injeta até 6 hyperframes narrativos (adaptado ao formato)
      const excludedRows   = applyHyperframeExclusionZone(hfRows);        // remove textos dentro de 30s de um HF
      const finalRows      = finalizeFacelessRows(excludedRows, videoFormat);
      const assetStats     = buildAssetStats(finalRows);
      const assetDesc      = videoFormat === 'faceless'
        ? `${assetStats.texto} texto, ${assetStats.video} video e ${assetStats.image} imagem (modo Faceless).`
        : videoFormat === 'vlog'
        ? `${assetStats.texto} texto, ${assetStats.avatar} avatar (VLOG), ${assetStats.video} video, ${assetStats.image} imagem e ${assetStats.hyperframe} hyperframe.`
        : `${assetStats.texto} texto, ${assetStats.avatar} avatar, ${assetStats.video} video, ${assetStats.image} imagem e ${assetStats.hyperframe} hyperframe.`;
      updateSrtObserverStep('assets', 'done', assetDesc);
      setSrtPipelineStatus('Assets marcados. Enviando as linhas elegiveis para gerar prompts visuais...');

      updateSrtObserverStep('prompts', 'running', 'Aguardando o envio do primeiro lote...');

      const promptItems = finalRows.flatMap((row, index) => {
        const type = normalizeAssetType(row.asset);
        const isEligible = type === 'vídeo' || type === 'imagem' || type === 'hyperframe' || (type === 'texto' && textStyleMode === 'auto');
        if (!isEligible) return [];

        const previousText = assetRows[index - 1]?.texto?.trim() || '';
        const nextText = assetRows[index + 1]?.texto?.trim() || '';
        const startMs = parseSrtTimeToMs(row.startTime);
        const endMs = parseSrtTimeToMs(row.endTime);
        const durationSeconds = Number(((endMs - startMs) / 1000).toFixed(3));
  
        return [{
          row_number: row.rowNumber,
          asset: type === 'texto' ? 'text' : (type === 'hyperframe' ? 'hyperframe' : (type === 'vídeo' ? 'video' : 'image')),
          template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
          text: row.texto.trim(),
          start_time: row.startTime,
          end_time: row.endTime,
          duration_seconds: durationSeconds,
          previous_text: previousText,
          next_text: nextText,
        }];
      });

      const promptMap = new Map<number, string>();
      const textoAdicionalMap = new Map<number, string>();
      const fallbackRowNumbers = new Set<number>(); // 🏷️ Track rows that used a fallback
      const chunkSize = 8; // Tamanho fixo otimizado para manter qualidade/foco da IA sem "viajar"
      const chunks: any[][] = [];
      for (let i = 0; i < promptItems.length; i += chunkSize) {
        chunks.push(promptItems.slice(i, i + chunkSize));
      }

      let completedCount = 0;
      let currentConcurrency = 2; // Começa em concorrência = 2
      let activeWorkers = 0;
      const results: any[] = new Array(chunks.length);
      let nextChunkIdx = 0;

      updateSrtObserverStep(
        'prompts',
        'running',
        `Gerando prompts visuais: processando ${chunks.length} lotes com concorrência auto-ajustável...`
      );

      const processNext = async (): Promise<void> => {
        // Se a concorrência diminuiu e este worker exceder o limite ativo, finaliza-se.
        if (activeWorkers > currentConcurrency) {
          activeWorkers--;
          return;
        }

        if (nextChunkIdx >= chunks.length) {
          activeWorkers--;
          return;
        }

        const currentIdx = nextChunkIdx++;
        const batch = chunks[currentIdx];

        let res: Response | null = null;
        let success = false;
        let data: any = {};
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            res = await fetch('/api/assets/srt-pipeline', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                batchItems: batch,
                engine,
                model,
                apiKeyOverwrite: apiKey,
                projectConfig: activeProject,
                videoContext: buildVideoContext(),
                videoFormat,
                textStyleOverride: textStyleMode === 'custom' ? customTextStyle : (textStyleMode === 'auto' ? '' : textStyleMode),
                characterProfile: {
                  mode: videoCharacterMode,
                  customDescription: videoCharacterCustom,
                },
                visualBlueprint: { setting: visualBlueprintSetting, cast: visualBlueprintCast },
              }),
            });

            const responseText = await res.text();

            if (res.status === 429) {
              if (currentConcurrency > 1) {
                currentConcurrency = 1;
                updateSrtObserverStep(
                  'prompts',
                  'running',
                  `[Limite de IA] Rate limit detectado. Reduzindo velocidade para modo sequencial seguro...`
                );
              }
              console.warn(`Lote ${currentIdx + 1} recebeu 429 (Rate Limit). Reduzindo concorrência para 1 e aguardando respiro...`);
              await new Promise((resolve) => setTimeout(resolve, 3000));
              continue;
            }

            if (res.status === 504) {
              if (attempt < maxRetries) {
                console.warn(`Lote ${currentIdx + 1} falhou com timeout 504. Tentando novamente tentativa ${attempt + 1} de ${maxRetries}...`);
                await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
                continue;
              }
              throw new Error(`Timeout (Erro 504): A Vercel cancelou a operação.`);
            }

            try {
              data = JSON.parse(responseText);
            } catch {
              throw new Error(`Resposta inválida (não JSON): ${responseText.slice(0, 80)}`);
            }

            if (!res.ok || data?.error) {
              throw new Error(resolveErrorMessage(data?.error, `Falha do servidor (Status ${res.status})`));
            }

            success = true;
            break;
          } catch (err: any) {
            console.warn(`[Lote ${currentIdx + 1}] Tentativa ${attempt + 1} falhou:`, err.message || err);
            
            // Em caso de falha de rede ou timeout, também reduz a velocidade de forma preventiva
            if (currentConcurrency > 1) {
              currentConcurrency = 1;
              updateSrtObserverStep(
                'prompts',
                'running',
                `[Aviso] Falha de conexão. Ajustando automaticamente para concorrência segura...`
              );
            }

            if (attempt === maxRetries) {
              console.error(`[Lote ${currentIdx + 1}] Falha persistente após ${maxRetries + 1} tentativas. Aplicando fallback local.`);
              data = {
                prompts: batch.map((item: any) => {
                  let fallback = 'Clean';
                  if (item.asset === 'text') {
                    fallback = 'Clean';
                  } else if (item.asset === 'hyperframe') {
                    fallback = item.template_name || 'hf_break';
                  } else if (item.asset === 'image') {
                    fallback = `Photorealistic still image of ${item.text.slice(0, 60).trim()}.`;
                  } else {
                    fallback = `3D technical animation of ${item.text.slice(0, 60).trim()}. Ambient sound only, no dialogue, no voice-over.`;
                  }
                  return {
                    rowNumber: item.row_number,
                    prompt: fallback,
                    isFallback: true
                  };
                })
              };
              success = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
          }
        }

        results[currentIdx] = data;
        completedCount++;

        const statusMsg = currentConcurrency === 1
          ? `Gerando prompts: processados ${completedCount} de ${chunks.length} lotes (modo seguro)...`
          : `Gerando prompts: processados ${completedCount} de ${chunks.length} lotes...`;

        updateSrtObserverStep('prompts', 'running', statusMsg);

        await processNext();
      };

      const workers = [];
      const numWorkers = Math.min(currentConcurrency, chunks.length);
      activeWorkers = numWorkers;

      for (let i = 0; i < numWorkers; i++) {
        workers.push(processNext());
      }
      await Promise.all(workers);

      // Processa e insere todos os resultados nos mapas ordenadamente
      results.forEach((data) => {
        (data?.prompts || []).forEach((p: { rowNumber: number; prompt: string; isFallback?: boolean; texto_adicional?: string }) => {
          if (p.rowNumber && p.prompt) {
            promptMap.set(p.rowNumber, p.prompt);
            if (p.texto_adicional) {
              textoAdicionalMap.set(p.rowNumber, typeof p.texto_adicional === 'string' ? p.texto_adicional : JSON.stringify(p.texto_adicional));
            }
            if (p.isFallback) fallbackRowNumbers.add(p.rowNumber);
          }
        });
      });

      const rowsWithPrompts = finalRows.map((row) => {
        let finalPrompt = promptMap.get(row.rowNumber) || row.prompt;
        if (normalizeAssetType(row.asset) === 'texto' && textStyleMode !== 'auto') {
          finalPrompt = textStyleMode === 'custom' ? customTextStyle : textStyleMode;
        }
        return {
          ...row,
          prompt: finalPrompt,
          texto_adicional: textoAdicionalMap.get(row.rowNumber) || row.texto_adicional,
          isFallback: fallbackRowNumbers.has(row.rowNumber), // 🏷️ Used for regeneration UI
        };
      });

      const generatedData = buildPipelineResult(rowsWithPrompts, null, videoFormat);

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
      _pipelineResultRef.current = pipelineResult; // captura para uso no pipeline orquestrado
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
      if (_isPipelineMode.current) throw error;
      alert(error instanceof Error ? error.message : 'Nao foi possivel processar o SRT anexado.');
    } finally {
      setIsProcessingSrtPipeline(false);
    }
  };

  const regenerateFallbackPrompts = async () => {
    if (!externalSrtPipeline?.rows?.length) return;

    const fallbackRows = externalSrtPipeline.rows.filter((row) => row.isFallback);
    if (fallbackRows.length === 0) return;

    setIsRegeneratingFallbacks(true);
    try {
      const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
      const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
      const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

      const batchItems = fallbackRows.flatMap((row, index) => {
        const type = normalizeAssetType(row.asset);
        const isEligible = type === 'vídeo' || type === 'imagem' || type === 'texto' || type === 'hyperframe';
        if (!isEligible) return [];
        const allRows = externalSrtPipeline.rows;
        const idx = allRows.findIndex((r) => r.rowNumber === row.rowNumber);
        const previousText = allRows[idx - 1]?.texto?.trim() || '';
        const nextText = allRows[idx + 1]?.texto?.trim() || '';
        const startMs = parseSrtTimeToMs(row.startTime);
        const endMs = parseSrtTimeToMs(row.endTime);
        return [{
          row_number: row.rowNumber,
          asset: type === 'texto' ? ('text' as const) : (type === 'hyperframe' ? ('hyperframe' as const) : (type === 'vídeo' ? ('video' as const) : ('image' as const))),
          template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
          text: row.texto.trim(),
          start_time: row.startTime,
          end_time: row.endTime,
          duration_seconds: Number(((endMs - startMs) / 1000).toFixed(3)),
          previous_text: previousText,
          next_text: nextText,
        }];
      });

      if (batchItems.length === 0) return;

      let res: Response | null = null;
      let responseText = '';
      let data: any = {};
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          res = await fetch('/api/assets/srt-pipeline', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              batchItems,
              engine,
              model,
              apiKeyOverwrite: apiKey,
              projectConfig: activeProject,
              videoContext: buildVideoContext(),
              videoFormat,
              characterProfile: { mode: videoCharacterMode, customDescription: videoCharacterCustom },
              visualBlueprint: { setting: visualBlueprintSetting, cast: visualBlueprintCast },
            }),
          });

          responseText = await res.text();
          if (res.status === 504) {
            if (attempt < maxRetries) {
              console.warn(`Tentativa de regeneração falhou com timeout 504. Tentando novamente tentativa ${attempt + 1} de ${maxRetries}...`);
              await new Promise((resolve) => setTimeout(resolve, 1000 * (attempt + 1)));
              continue;
            }
            throw new Error('Timeout (504): A operação demorou demais.');
          }

          try {
            data = JSON.parse(responseText);
          } catch {
            throw new Error(`Resposta inválida (não JSON): ${responseText.slice(0, 80)}`);
          }

          if (!res.ok || data?.error) {
            throw new Error(resolveErrorMessage(data?.error, `Falha do servidor (Status ${res?.status})`));
          }

          break;
        } catch (err: any) {
          if (attempt === maxRetries) {
            throw new Error(err.message || 'Falha persistente na regeneração de prompts.');
          }
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        }
      }

      // Merge: replace fallback rows with the new prompts.
      // Accept the prompt regardless of isFallback flag on the response — the LLM sometimes
      // still marks it as fallback even when a real prompt was generated (template-like output).
      // What matters is that a non-empty prompt string came back for the row number.
      const newPromptMap = new Map<number, string>();
      (data?.prompts || []).forEach((p: { rowNumber: number; prompt: string; isFallback?: boolean }) => {
        if (p.rowNumber && p.prompt?.trim()) newPromptMap.set(p.rowNumber, p.prompt.trim());
      });

      if (newPromptMap.size === 0) {
        alert('A IA não retornou nenhum prompt para os itens selecionados. Tente novamente.');
        return;
      }

      const updatedRows = externalSrtPipeline.rows.map((row) => {
        const newPrompt = newPromptMap.get(row.rowNumber);
        if (!newPrompt) return row;
        return { ...row, prompt: newPrompt, isFallback: false };
      });

      const { buildPipelineResult: rebuild } = await import('@/lib/srt-asset-pipeline');
      const updatedPipeline = { ...rebuild(updatedRows, null, videoFormat), generatedAt: externalSrtPipeline.generatedAt };
      _pipelineResultRef.current = updatedPipeline;
      setExternalSrtPipeline(updatedPipeline);
      persistExecutionSnapshotLocally({ externalSrtPipeline: updatedPipeline });
      showToast(`✅ ${newPromptMap.size} prompt(s) regenerado(s) com sucesso.`);
    } catch (err) {
      console.error('[ScriptEngine] Falha ao regenerar fallbacks:', err);
      alert(err instanceof Error ? err.message : 'Erro ao regenerar prompts incompletos.');
    } finally {
      setIsRegeneratingFallbacks(false);
    }
  };

  // ─── Regeneração de Fallbacks para Pipeline (usa ref, não estado) ─────────────
  const regenerateFallbacksForPipeline = async (): Promise<number> => {
    const pipeline = _pipelineResultRef.current;
    if (!pipeline?.rows?.length) return 0;
    const fallbackRows = pipeline.rows.filter((r: any) => r.isFallback);
    if (!fallbackRows.length) return 0;

    const engine  = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model   = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey  = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    const batchItems = fallbackRows.flatMap((row: any) => {
      const type = normalizeAssetType(row.asset);
      if (type !== 'vídeo' && type !== 'imagem' && type !== 'texto' && type !== 'hyperframe') return [];
      const allRows = pipeline.rows;
      const idx = allRows.findIndex((r: any) => r.rowNumber === row.rowNumber);
      const startMs = parseSrtTimeToMs(row.startTime);
      const endMs   = parseSrtTimeToMs(row.endTime);
      return [{
        row_number: row.rowNumber,
        asset: type === 'texto' ? ('text' as const) : (type === 'hyperframe' ? ('hyperframe' as const) : (type === 'vídeo' ? ('video' as const) : ('image' as const))),
        template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
        text: row.texto.trim(),
        start_time: row.startTime,
        end_time: row.endTime,
        duration_seconds: Number(((endMs - startMs) / 1000).toFixed(3)),
        previous_text: allRows[idx - 1]?.texto?.trim() || '',
        next_text: allRows[idx + 1]?.texto?.trim() || '',
      }];
    });
    if (!batchItems.length) return 0;

    const res = await fetch('/api/assets/srt-pipeline', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        batchItems, engine, model, apiKeyOverwrite: apiKey,
        projectConfig: activeProject,
        videoContext: buildVideoContext(),
        videoFormat,
        characterProfile: { mode: videoCharacterMode, customDescription: videoCharacterCustom },
        visualBlueprint: { setting: visualBlueprintSetting, cast: visualBlueprintCast },
      }),
    });
    const data = await res.json();
    if (!res.ok || data?.error) throw new Error(resolveErrorMessage(data?.error, 'Falha ao regenerar prompts incompletos.'));

    const newPromptMap = new Map<number, string>();
    (data?.prompts || []).forEach((p: any) => {
      if (p.rowNumber && p.prompt?.trim()) newPromptMap.set(p.rowNumber, p.prompt.trim());
    });

    // Merge resultado no ref (não depende de setState)
    const updatedRows = pipeline.rows.map((row: any) => {
      const np = newPromptMap.get(row.rowNumber);
      return np ? { ...row, prompt: np, isFallback: false } : row;
    });
    const { buildPipelineResult: rebuild } = await import('@/lib/srt-asset-pipeline');
    const updated = { ...rebuild(updatedRows, null, videoFormat), generatedAt: pipeline.generatedAt };
    _pipelineResultRef.current = updated;
    setExternalSrtPipeline(updated);
    persistExecutionSnapshotLocally({ externalSrtPipeline: updated });

    // Retorna quantos ainda estão incompletos
    return updatedRows.filter((r: any) => r.isFallback).length;
  };

  const renderTextAssetsFromPipeline = async () => {
    // Em modo pipeline, usa _pipelineResultRef para evitar stale closure do estado React
    const activePipeline = (_isPipelineMode.current && _pipelineResultRef.current)
      ? _pipelineResultRef.current
      : externalSrtPipeline;
    // Mesmo padrão para postScriptPackage (stale closure)
    const activePackage = (_isPipelineMode.current && _postScriptResultRef.current)
      ? _postScriptResultRef.current
      : postScriptPackage;

    if (!activePipeline?.rows?.length) {
      if (_isPipelineMode.current) throw new Error('Pipeline: SRT não processado corretamente. Verifique a Etapa 1.');
      alert('Processe o SRT nas etapas 2, 3 e 4 antes de disparar a etapa 5.');
      return;
    }

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (!isLocalhost) {
      const pythonDir = "D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\assets\\ferramenta-legendas";
      const csvName = `${sanitizeDownloadFileStem(srtArtifactStem)}_pipeline_assets.csv`;
      const batLines = [
        '@echo off',
        'chcp 65001 >nul',
        'color 0A',
        '',
        ':: 1. Detectando o Python dinamicamente',
        'python --version >nul 2>&1',
        'if %errorlevel% neq 0 (',
        '    color 0C',
        '    echo ERRO CRITICO: Python nao encontrado no sistema!',
        '    echo Certifique-se de que o instalou e adicionou nas Variaveis de Ambiente PATH.',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        ':: 2. Validando a presenca do arquivo CSV Base',
        `set "CSV_PATH=%~dp0${csvName}"`,
        'if not exist "%CSV_PATH%" (',
        '    color 0C',
        '    echo ERRO CRITICO: Arquivo CSV base nao encontrado!',
        '    echo O script estava procurando por:',
        '    echo "%CSV_PATH%"',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        ':: 3. Mudando de diretorio e apontando pro pipeline local',
        `set "PYTHON_DIR=${pythonDir}"`,
        'if not exist "%PYTHON_DIR%\\renderizar_textos.py" (',
        '    color 0C',
        '    echo ERRO CRITICO: Conector principal renderizar_textos.py nao mapeado!',
        '    echo Local esperado: "%PYTHON_DIR%"',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        'cd /d "%PYTHON_DIR%"',
        'echo --- PROCESSO DE RENDERIZACAO DE TEXTOS ---',
        'echo CSV Alvo: %CSV_PATH%',
        'echo.',
        'python renderizar_textos.py --file "%CSV_PATH%"',
        '',
        ':: 4. Evitando fechamentos impetuosos por erro',
        'if %errorlevel% neq 0 (',
        '    color 0C',
        '    echo.',
        '    echo ALERTA: A renderizacao retornou falhas.',
        '    echo Avalie o log do terminal acima para correcoes.',
        '    pause',
        '    exit /b %errorlevel%',
        ')',
        '',
        'color 0A',
        'echo.',
        'echo --- TUDO PRONTO! Renderizacao em lote completa.',
        'pause',
      ];
      const batContent = batLines.join('\r\n');
      
      downloadTextArtifact(srtArtifactStem, 'pipeline_assets', buildSfxEnrichedCsvContent(activePipeline.csvContent, activePackage?.sfxTimelineTxt), { extension: 'csv', mimeType: 'text/csv;charset=utf-8' });
      
      setTimeout(() => {
      downloadTextArtifact(srtArtifactStem, '1_renderizar_textos', batContent, { extension: 'bat', mimeType: 'text/plain;charset=utf-8' });
      }, 500);

      // Bat 2 — HyperFrames overlays (only if hyperframe rows exist)
      const hfRows = activePipeline.rows.filter(
        (r: any) => normalizeAssetType(r.asset) === 'hyperframe',
      );
      if (hfRows.length > 0 && videoFormat !== 'faceless') {
        const batHyperframes = buildHyperframesBat(hfRows, srtArtifactStem, undefined, activePackage?.hfContextTitles, videoFormat);
        setTimeout(() => {
          downloadTextArtifact(
            srtArtifactStem,
            '2_hyperframes',
            batHyperframes,
            { extension: 'bat', mimeType: 'text/plain;charset=utf-8' },
          );
        }, 1000);
      }

      const sfxTimeline = activePackage?.sfxTimelineTxt || '';
      const batSfx = buildSfxBatFromTimeline(sfxTimeline, srtArtifactStem, activePipeline.rows);
      if (batSfx) {
        setTimeout(() => {
          downloadTextArtifact(
            srtArtifactStem,
            '3_sfx',
            batSfx,
            { extension: 'bat', mimeType: 'text/plain;charset=utf-8' },
          );
        }, 1500);
      }

      const persistedAt = new Date().toISOString();
      const pipelineResult = { ...activePipeline, generatedAt: persistedAt };
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
          pipeline: activePipeline,
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
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao executar a etapa 5 do pipeline SRT.'));
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
      if (_isPipelineMode.current) throw error;
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
      setVisualBlueprintSetting(snapshot?.visualBlueprintSetting || '');
      setVisualBlueprintCast(Array.isArray(snapshot?.visualBlueprintCast) ? snapshot.visualBlueprintCast : []);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao restaurar execucao manualmente.', error);
      alert('Nao foi possivel restaurar a execucao salva.');
    }
  };

  function clearExecutionState() {
    if (executionStorageKey) {
      localStorage.removeItem(executionStorageKey);
      // Also clear the split-storage keys for large objects
      localStorage.removeItem(`${executionStorageKey}_srt_pipeline`);
      localStorage.removeItem(`${executionStorageKey}_post_package`);
    }

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
    setManualPublishDate('');
    setVisualBlueprintSetting('');
    setVisualBlueprintCast([]);
    setManualPublishDraftDate('');
    setManualPublishDraftTime('');
    setScriptBlocks([
      { id: 'h0', type: 'Hook', title: 'Gancho Estrategico', content: 'Inicie com uma promessa tecnica...', sop: 'Corte seco.' },
      { id: 'c0', type: 'Context', title: 'Contextualizacao', content: 'Conecte com a dor do publico...', sop: 'B-roll de contexto.' }
    ]);
    setAssemblerActive(true);
  }

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

  const downloadAvatarFlowPackage = () => {
    if (!scriptBlocks.length) {
      alert('Ainda não há blocos para exportar.');
      return;
    }

    const themeTitle = approvedBriefing?.title || approvedTheme || 'roteiro-avatar-flow';
    const safeFileName = themeTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s/g, '_')
      .slice(0, 80) || 'roteiro-avatar-flow';

    const falasLines = scriptBlocks
      .map((block) => block.content.trim())
      .filter(Boolean);

    if (falasLines.length === 0) {
      alert('Os blocos de roteiro estão vazios.');
      return;
    }

    const falasContent = falasLines.join('\n');
    const videoLines: string[] = [];
    const AVATAR_FLOW_ANGLES = [
      '3/4 view lado esquerdo',
      '3/4 view lado direito',
      'perfil lado esquerdo',
      'perfil lado direito',
      'over the shoulder',
      'over view (de cima)',
      'low angle',
      'high angle',
      'close-up frontal'
    ];
    let lastAngleUsed = '';

    falasLines.forEach((text, index) => {
      const rowNum = index + 1;
      const isOdd = rowNum % 2 !== 0;

      if (isOdd) {
        const line = `Cena${String(rowNum).padStart(3, '0')} 4k. Camera fixa, Personagem001 falando: "${text}"`;
        videoLines.push(line);
      } else {
        const availableAngles = AVATAR_FLOW_ANGLES.filter((angle) => angle !== lastAngleUsed);
        const chosenAngle = availableAngles[rowNum % availableAngles.length];
        lastAngleUsed = chosenAngle;

        const line = `Cena${String(rowNum).padStart(3, '0')} 4k. Camera fixa, Personagem001 ${chosenAngle} falando: "${text}"`;
        videoLines.push(line);
      }
    });

    const videoPromptsContent = videoLines.join('\n');

    const blobVideo = new Blob([videoPromptsContent], { type: 'text/plain;charset=utf-8' });
    const urlVideo = URL.createObjectURL(blobVideo);
    const linkVideo = document.createElement('a');
    linkVideo.href = urlVideo;
    linkVideo.download = `${safeFileName}_prompts_video.txt`;
    document.body.appendChild(linkVideo);
    linkVideo.click();
    document.body.removeChild(linkVideo);
    URL.revokeObjectURL(urlVideo);

    setTimeout(() => {
      const blobFalas = new Blob([falasContent], { type: 'text/plain;charset=utf-8' });
      const urlFalas = URL.createObjectURL(blobFalas);
      const linkFalas = document.createElement('a');
      linkFalas.href = urlFalas;
      linkFalas.download = `${safeFileName}_falas.txt`;
      document.body.appendChild(linkFalas);
      linkFalas.click();
      document.body.removeChild(linkFalas);
      URL.revokeObjectURL(urlFalas);
    }, 150);
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

    // Em pipeline mode, usa _pipelineResultRef para evitar stale closure (externalSrtPipeline ainda null)
    const srtRows = (_isPipelineMode.current && _pipelineResultRef.current?.rows)
      ? _pipelineResultRef.current.rows
      : (externalSrtPipeline?.rows || (externalSrtText.trim() ? parseSrtToRows(externalSrtText) : []));
    const hfCount = (srtRows as any[]).filter((r: any) => r.asset === 'hyperframe').length;
      console.log(`[HF] Enviando para API: ${hfCount} HF rows de ${(srtRows as any[]).length} total (fonte: ${_isPipelineMode.current ? 'pipeline' : 'externo'})`);
    if (_isPipelineMode.current) setSrtPipelineStatus(`Etapa 3: Pacote pós-roteiro — ${hfCount} anchors HF enviados à IA...`);
    const timelineContext = buildPostScriptTimelineContext({
      scriptBlocks: sourceBlocks,
      estimatedDuration: approvedBriefing?.estimatedDuration,
      srtRows,
    });
    const fallbackSeoPlan = buildSeoChapterPlan({
      scriptBlocks: sourceBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
    });

    let titleStructures: any[] = [];
    if (typeof window !== 'undefined' && activeProject?.id) {
      const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed)) {
            titleStructures = parsed
              .filter((c: any) => c.type === 'Title Structure')
              .map((c: any) => ({
                id: c.id,
                name: c.name,
                content_pattern: c.content_pattern || c.description || '',
              }));
          }
        } catch (e) {
          console.warn('[ScriptEngine] Erro ao ler titleStructures do localStorage:', e);
        }
      }
    }

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
          titleStructures,
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
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao gerar o pacote pos-roteiro.'));
      }

      const nextPackage = sanitizePostScriptPackage(data, fallbackSeoPlan.anchors, timelineContext.source);

      // ── Diagnóstico: o que a IA realmente devolveu? ──────────────────────────
      const aiCtx: any[] = nextPackage.hfContextTitles ?? [];
      console.log('[HF] hfContextTitles da IA:', JSON.stringify(aiCtx, null, 2));
      if (_isPipelineMode.current) {
        setSrtPipelineStatus(`Etapa 3: Pacote pós-roteiro ✓ — IA devolveu ${aiCtx.length} hfContextTitles (esperado: ${hfCount})`);
      }

      // ── Shuffle dos templates com seed do tema (Opção A) ─────────────────────
      // Cada tema gera uma ordem única mas reproduzível dos 10 templates.
      // Mesmo tema re-executado → mesma ordem. Tema diferente → ordem diferente.
      const HF_ALL_TEMPLATES = [
        'hf_focus', 'hf_face_bottom', 'hf_vertical', 'hf_double', 'hf_break',
        'hf_documentary', 'hf_floating', 'hf_face_top', 'hf_dynamic', 'hf_holo',
      ];
      const themeSeed = (approvedTheme || 'default')
        .split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
      const seededShuffle = (arr: string[], seed: number): string[] => {
        const copy = [...arr];
        let s = seed;
        for (let i = copy.length - 1; i > 0; i--) {
          s = ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;
          const j = s % (i + 1);
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };
      const hfTemplateOrder = seededShuffle(HF_ALL_TEMPLATES, themeSeed);
      console.log('[HF] ordem dos templates para este tema:', hfTemplateOrder);

      const hfSrtRows = (srtRows as any[]).filter((r: any) => r.asset === 'hyperframe');
      const guaranteed = hfSrtRows.map((row: any, i: number) => {
        const ai = aiCtx[i] ?? {};
        return {
          timestamp:   ai.timestamp || row.startTime || '',
          visualState: hfTemplateOrder[i % hfTemplateOrder.length],
          headline:    ai.headline  || 'Destaque',  // placeholder neutro se IA não retornar
          subtitle:    ai.subtitle  || '',
          metrics:     ai.metrics   || '—',
          bgPrompt:    ai.bgPrompt  || '',
        };
      });
      const enrichedPackage = guaranteed.length > 0
        ? { ...nextPackage, hfContextTitles: guaranteed }
        : nextPackage;

      setPostScriptPackage(enrichedPackage);
      _postScriptResultRef.current = enrichedPackage;

      setTitleValidations(null);
      persistExecutionSnapshotLocally({
        postScriptPackage: enrichedPackage,
        scriptStage,
      });
      void syncApprovedThemeSnapshot({
        postScriptPackage: enrichedPackage,
        scriptStage,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar o pacote pos-roteiro.', error);
      });

      if (!_isPipelineMode.current) alert('Pacote pos-roteiro gerado e salvo nesta execucao.');
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao gerar pacote pos-roteiro.', error);
      if (_isPipelineMode.current) throw error;
      alert(`Erro ao gerar pacote pos-roteiro: ${error?.message || error}`);
    } finally {
      setIsGeneratingPostScriptPackage(false);
    }
  };

  // ─── HF Background Prompts (extraído do inline onClick para uso no pipeline) ─
  const generateHfBgPromptsInternal = async (pipelineOverride?: any): Promise<Array<{rowNumber: number; prompt: string}> | null> => {
    const pipeline = pipelineOverride ?? externalSrtPipeline;
    if (!pipeline) return null;
    const hfRows = (pipeline.rows ?? []).filter((r: any) => normalizeAssetType(r.asset) === 'hyperframe');
    if (!hfRows.length) return null;
    setIsGeneratingHfBg(true);
    setHfBgPrompts(null);
    try {
      const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
      const model  = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-4.1';
      const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
      const res = await fetch('/api/hf-bg-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine, model, apiKeyOverwrite: apiKey,
          theme: approvedTheme || externalSrtFileName || 'video',
          hfRows: hfRows.map((r: any) => ({
            rowNumber: r.rowNumber,
            startTime: r.startTime,
            texto: r.texto,
            visualState: postScriptPackage?.hfContextTitles?.find((c: any) => {
              if (!c?.timestamp) return false;
              const clean = String(c.timestamp).replace(/[\[\]]/g, '');
              const parts = clean.split(':').map(Number);
              const cSec = parts.length === 2 ? parts[0]*60+parts[1] : parts[0]*3600+parts[1]*60+(parts[2]||0);
              const [rh, rm, rs] = r.startTime.split(':');
              const rSec = Number(rh)*3600 + Number(rm)*60 + Number((rs||'0').split(',')[0]);
              return Math.abs(cSec - rSec) <= 12;
            })?.visualState || 'hf_focus',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(resolveErrorMessage(data?.error, `Erro ${res.status}`));
      if (!data?.prompts?.length) throw new Error('IA retornou lista de prompts vazia.');
      setHfBgPrompts(data.prompts);
      try { localStorage.setItem(`yt_hf_bg_${executionStorageKey}`, JSON.stringify(data.prompts)); } catch { /* ignore */ }
      persistExecutionSnapshotLocally({ hfBgPrompts: data.prompts });
      return data.prompts;
    } catch (err: any) {
      setHfBgPrompts([{ rowNumber: -1, prompt: err?.message || 'Falha desconhecida' }]);
      if (_isPipelineMode.current) throw err;
      return null;
    } finally {
      setIsGeneratingHfBg(false);
    }
  };

  // ─── Pipeline Orquestrado (botão único) ─────────────────────────────────────
  const PIPELINE_STEP_LABELS: Record<string, string> = {
    srt:        'Etapa 1 — SRT → Assets',
    hf:         'Etapa 2 — Fundos HF',
    postscript: 'Etapa 3 — Pacote Pós-Roteiro',
    bats:       'Etapa 4 — Render + BATs',
    done:       'Concluído!',
  };

  // ─── Reset de Resultados (mantém .srt e roteiro, limpa outputs) ──────────────
  const resetPipelineResults = () => {
    setExternalSrtPipeline(null);
    setPostScriptPackage(null);
    setHfBgPrompts(null);
    setExternalSrtObserver(buildInitialSrtObserver());
    setSrtPipelineStatus('');
    setPipelineCurrentStep(null);
    _pipelineResultRef.current   = null;
    _postScriptResultRef.current = null;
    // Remove dados processados do snapshot local (mantém .srt e roteiro)
    try {
      if (executionStorageKey) {
        const raw = localStorage.getItem(executionStorageKey);
        if (raw) {
          const snap = JSON.parse(raw);
          const cleaned = {
            ...snap,
            externalSrtPipeline:  null,
            postScriptPackage:    null,
            externalSrtObserver:  buildInitialSrtObserver(),
            hfBgPrompts:          null,
          };
          localStorage.setItem(executionStorageKey, JSON.stringify(cleaned));
        }
        // Remove HF bg prompts do storage dedicado
        const hfKey = `yt_hf_bg_${executionStorageKey}`;
        localStorage.removeItem(hfKey);
      }
    } catch { /* ignore */ }
  };

  const _pipelineStepRef = useRef<string>('?');

  const runFullPipeline = async () => {
    if (!canProcessPostScriptPackage) {
      alert('O pipeline completo requer o roteiro.\n\nCarregue o arquivo .txt do roteiro ou finalize o roteiro no app antes de continuar.');
      return;
    }
    if (!externalSrtText.trim()) { alert('Anexe um arquivo .srt antes de iniciar o pipeline.'); return; }
    if (videoFormat !== 'faceless' && videoCharacterMode === 'custom' && !videoCharacterCustom.trim()) {
      alert('Descreva o personagem personalizado antes de iniciar o pipeline.');
      return;
    }
    setIsPipelineRunning(true);
    _isPipelineMode.current   = true;
    _pipelineResultRef.current   = null;
    _postScriptResultRef.current = null;
    _pipelineStepRef.current = 'srt';
    setPipelineWarnings([]);
    try {
      setPipelineCurrentStep('srt');
      try {
        await processAttachedSrtAssets();
      } catch (err: any) {
        throw new Error(`[Etapa 1 — SRT] ${err?.message || err}`);
      }
      if (!_pipelineResultRef.current) throw new Error('[Etapa 1 — SRT] Não retornou resultado. Verifique o arquivo .srt.');

      // ── Auto-retry de prompts incompletos (até 2 tentativas) ─────────────────
      let fallbackCount = (_pipelineResultRef.current.rows ?? []).filter((r: any) => r.isFallback).length;
      if (fallbackCount > 0) {
        for (let attempt = 1; attempt <= 2 && fallbackCount > 0; attempt++) {
          setSrtPipelineStatus(`🔄 Regenerando ${fallbackCount} prompt(s) incompleto(s) — tentativa ${attempt}/2...`);
          try {
            fallbackCount = await regenerateFallbacksForPipeline();
          } catch (retryErr: any) {
            console.warn('[Pipeline] Falha ao regenerar fallbacks:', retryErr);
            break; // Não bloqueia — continua o pipeline
          }
        }
        if (fallbackCount > 0) {
          const remaining = (_pipelineResultRef.current.rows ?? [])
            .filter((r: any) => r.isFallback)
            .map((r: any) => `Linha ${r.rowNumber} (${r.startTime.slice(0,8)}): ${r.texto.slice(0, 40)}...`);
          setPipelineWarnings(remaining);
          setSrtPipelineStatus(`⚠️ ${fallbackCount} prompt(s) permaneceram incompletos após 2 tentativas. Pipeline continua.`);
        }
      }

      _pipelineStepRef.current = 'hf';
      setPipelineCurrentStep('hf');
      const hfCount = (_pipelineResultRef.current.rows ?? [])
        .filter((r: any) => normalizeAssetType(r.asset) === 'hyperframe').length;
      if (hfCount > 0 && videoFormat !== 'faceless') {
        try {
          await generateHfBgPromptsInternal(_pipelineResultRef.current);
        } catch (err: any) {
          throw new Error(`[Etapa 2 — Fundos HF] ${err?.message || err}`);
        }
      }

      _pipelineStepRef.current = 'postscript';
      setPipelineCurrentStep('postscript');
      _postScriptResultRef.current = null;
      try {
        await generatePostScriptPackage();
      } catch (err: any) {
        throw new Error(`[Etapa 3 — Pós-Roteiro] ${err?.message || err}`);
      }
      if (!_postScriptResultRef.current) throw new Error('[Etapa 3 — Pós-Roteiro] Falhou. Verifique o roteiro e a API key.');

      _pipelineStepRef.current = 'bats';
      setPipelineCurrentStep('bats');
      try {
        await renderTextAssetsFromPipeline();
      } catch (err: any) {
        throw new Error(`[Etapa 4 — BATs] ${err?.message || err}`);
      }

      _pipelineStepRef.current = 'done';
      setPipelineCurrentStep('done');
      setSrtPipelineStatus('✅ Pipeline completo concluído com sucesso. BATs e CSV prontos.');
    } catch (err: any) {
      console.error('[Pipeline Completo]', err);
      alert(`Pipeline interrompido:\n\n${err?.message || 'Erro desconhecido'}`);
    } finally {
      _isPipelineMode.current = false;
      setIsPipelineRunning(false);
      setTimeout(() => setPipelineCurrentStep(null), 4000);
    }
  };

  const validateViralTitles = async () => {
    if (!postScriptPackage?.titles?.length || !approvedTheme) return;

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
    if (!apiKey) {
      alert('Configure sua chave de API em Ajustes Globais para validar os títulos.');
      return;
    }

    // Only validate null slots (unscored). If all are scored, nothing to do.
    const indicesToValidate: number[] = titleValidations
      ? titleValidations.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
      : postScriptPackage.titles.map((_, i) => i); // all when no validation exists yet

    if (indicesToValidate.length === 0) return;

    const titlesToValidate = indicesToValidate.map((i) => postScriptPackage.titles[i]);

    setIsValidatingTitles(true);
    try {
      const response = await fetch('/api/post-script-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          apiKeyOverwrite: apiKey,
          approvedTheme,
          titles: titlesToValidate,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao validar os títulos.'));
      }

      if (Array.isArray(data?.results)) {
        // Merge results back into the correct positions
        const nextValidations: (TitleValidationResult | null)[] = titleValidations
          ? [...titleValidations]
          : postScriptPackage.titles.map(() => null);
        indicesToValidate.forEach((titleIndex, resultIndex) => {
          nextValidations[titleIndex] = data.results[resultIndex] ?? null;
        });
        setTitleValidations(nextValidations);
      }
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao validar títulos.', error);
      alert(`Erro ao validar títulos: ${error?.message || error}`);
    } finally {
      setIsValidatingTitles(false);
    }
  };

  const regenerateViralTitles = async () => {
    if (!approvedTheme || !canProcessPostScriptPackage || !postScriptPackage) return;

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
    if (!apiKey) {
      alert('Configure sua chave de API em Ajustes Globais para regerar os títulos.');
      return;
    }

    // Determine which slots need replacement: those with explicit weak verdict
    // (null = unscored/new, we don't auto-regenerate those)
    const weakIndices: number[] = titleValidations
      ? titleValidations
          .map((v, i) => (v !== null && v.verdict !== 'Aprovado' ? i : -1))
          .filter((i) => i >= 0)
      : postScriptPackage.titles.map((_, i) => i); // no validation → replace all

    if (weakIndices.length === 0) {
      alert('Todos os títulos já estão aprovados! Não há nada para regerar.');
      return;
    }

    const titleCountHint = weakIndices.length;

    const sourceBlocks = resolvePostScriptSourceBlocks();
    if (!sourceBlocks.length) return;

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

    let titleStructures: any[] = [];
    if (typeof window !== 'undefined' && activeProject?.id) {
      const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed)) {
            titleStructures = parsed
              .filter((c: any) => c.type === 'Title Structure')
              .map((c: any) => ({
                id: c.id,
                name: c.name,
                content_pattern: c.content_pattern || c.description || '',
              }));
          }
        } catch (e) {
          console.warn('[ScriptEngine] Erro ao ler titleStructures do localStorage:', e);
        }
      }
    }

    setIsRegeneratingTitles(true);
    // Preserve approved scores; null out the slots being replaced so they show as unscored
    const partialValidations: (TitleValidationResult | null)[] | null = titleValidations
      ? titleValidations.map((v, i) => (weakIndices.includes(i) ? null : v))
      : null;
    setTitleValidations(partialValidations);
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
          titleCountHint,
          titleStructures,
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
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao regerar os títulos.'));
      }

      const newPackage = sanitizePostScriptPackage(data, fallbackSeoPlan.anchors, timelineContext.source);

      // Smart merge: keep approved titles, insert new ones at weak positions
      const updatedTitles = [...postScriptPackage.titles];
      weakIndices.forEach((slotIndex, newTitleIndex) => {
        if (newPackage.titles[newTitleIndex] !== undefined) {
          updatedTitles[slotIndex] = newPackage.titles[newTitleIndex];
        }
      });

      const mergedPackage: PostScriptPackage = {
        ...postScriptPackage,
        titles: updatedTitles,
        generatedAt: new Date().toISOString(),
      };
      setPostScriptPackage(mergedPackage);
      persistExecutionSnapshotLocally({
        postScriptPackage: mergedPackage,
        scriptStage,
      });
      void syncApprovedThemeSnapshot({
        postScriptPackage: mergedPackage,
        scriptStage,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar títulos regerados.', error);
      });
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao regerar títulos.', error);
      alert(`Erro ao regerar títulos: ${error?.message || error}`);
    } finally {
      setIsRegeneratingTitles(false);
    }
  };

  const buildSfxEnrichedCsvContent = (baseCsvContent: string, sfxTimelineTxt?: string | null): string => {
    if (!sfxTimelineTxt?.trim()) return baseCsvContent;

    const sfxEntries = parseSfxTimelineEntries(sfxTimelineTxt);
    if (!sfxEntries.length) return baseCsvContent;

    // Get SRT rows for snapping timestamps
    const srtRows = externalSrtPipeline?.rows || [];

    // Convert AI timestamp to seconds for nearest-match
    const toSec = (ts: string): number => {
      const clean = String(ts || '').replace(',', '.');
      const parts = clean.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    };

    // Snap to nearest SRT row start time
    const snapTs = (aiTs: string): string => {
      if (!srtRows.length) {
        const parts = aiTs.split(':').map((p: string) => p.padStart(2, '0'));
        const formatted = parts.length === 2 ? `00:${parts[0]}:${parts[1]}` : `${parts[0]}:${parts[1]}:${parts[2] || '00'}`;
        return `${formatted},000`;
      }
      const aiSec = toSec(aiTs);
      let best = srtRows[0];
      let bestDiff = Math.abs(toSec(best.startTime) - aiSec);
      for (const row of srtRows) {
        const diff = Math.abs(toSec(row.startTime) - aiSec);
        if (diff < bestDiff) { bestDiff = diff; best = row; }
      }
      return best.startTime;
    };

    const csvEsc = (v: string) => {
      const s = String(v ?? '');
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const sfxLines = sfxEntries.map((entry) => {
      const exactTs = snapTs(entry.timestamp);
      const promptSummary = [entry.effect, entry.purpose, entry.notes].filter((x) => x && x !== '—').join(' | ');
      return [
        csvEsc(exactTs),
        csvEsc(exactTs),
        csvEsc(entry.excerpt !== '—' ? entry.excerpt : ''),
        'sfx',
        csvEsc(promptSummary),
        '',
      ].join(',');
    });

    const base = baseCsvContent.trimEnd();
    return `${base}\n${sfxLines.join('\n')}`;
  };

  const parseSfxTimelineEntries = (value: string) => {
    const normalized = String(value || '').replace(/\n/g, '\n').trim();
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
    const normalized = String(value || '').replace(/\n/g, '\n').trim();
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
    || String(externalSrtFileName || '').replace(/\.[^.]+$/, '')
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
    const editorialPillar = approvedBriefing?.editorialPillar
      || (() => {
        const rp = activeProject?.editorial_line?.pillars || activeProject?.editorial_pillars || [];
        const pl: string[] = (Array.isArray(rp) ? rp : [])
          .map((p: any) => typeof p === 'string' ? p : p?.name || p?.label || '')
          .filter(Boolean);
        return pl.length > 0 ? pl[Math.floor(Math.random() * pl.length)] : 'T1';
      })();

    // Collect narrative asset UUIDs ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚Â filter out mock/non-UUID IDs
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

    // ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ Composition Log DNA (ImutÃÆ’Ã†â€™Ãâ€ ââ‚¬â„¢ÃÆ’ââ‚¬Å¡Ãâ€šÃ‚Â¡vel) ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬
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

  // ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ Assembler Approval Handler ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬
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

  // ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ ASSEMBLER MODE ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬
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
      <div className="flex flex-1 min-h-0 animate-in">

        {/* Full-width Script Workspace */}
        <section className="flex-1 min-w-0 min-h-0 glass-card flex-col shadow-2xl border-white/10 ring-1 ring-white/5 flex">
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
                if (!approvedBriefing) { showToast('Aprove um assembly antes de copiar o prompt externo.'); return; }
                const externalPrompt = buildExternalWritingPrompt();
                await navigator.clipboard.writeText(externalPrompt);
                showToast('Prompt externo copiado com blueprint detalhado do roteiro.');
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
                showToast('Briefing copiado e versao salva localmente.');
              }}
              className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
              title="Copiar briefing (JSON) e salvar versao local"
            >
              <Copy size={20} />
            </button>
            {videoFormat === 'avatar_flow' ? (
              <button
                onClick={downloadAvatarFlowPackage}
                className="flex items-center gap-2 px-4 py-3 bg-violet-600/25 text-violet-200 rounded-xl hover:bg-violet-600/45 hover:text-white transition-all border border-violet-500/30 font-bold uppercase tracking-wider text-[10px]"
                title="Exportar Pacote Avatar Flow (Prompts de Vídeo + Falas Limpas para Produção Sem SRT)"
              >
                🎬 Exportar Pacote Flow
              </button>
            ) : (
              <button
                onClick={downloadScriptAsTxt}
                className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
                title="Baixar todos os blocos atuais em um unico arquivo .txt"
              >
                <FileText size={20} />
              </button>
            )}
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
            {/* ⚡ Title-changed banner */}
            {pendingTitleUpdate && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-0.5">⚡ Título alterado</p>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    O tema foi renomeado para <span className="text-amber-300 font-bold">&ldquo;{pendingTitleUpdate.newTitle}&rdquo;</span>. Os blocos abaixo ainda usam o tema anterior.
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setApprovedTheme(pendingTitleUpdate.newTitle);
                      setPendingTitleUpdate(null);
                      persistExecutionSnapshotLocally();
                      showToast('Título atualizado. Blocos mantidos.');
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
                  >
                    Manter blocos
                  </button>
                  <button
                    onClick={() => {
                      if (!approvedBriefing) return;
                      const newTitle = pendingTitleUpdate.newTitle;
                      setApprovedTheme(newTitle);
                      const updatedBriefing = { ...approvedBriefing, title: newTitle };
                      setApprovedBriefing(updatedBriefing);
                      const newBlocks = buildScriptBlocksFromBriefing(updatedBriefing, newTitle);
                      setScriptBlocks(newBlocks);
                      setScriptStage('blueprint');
                      setPendingTitleUpdate(null);
                      persistExecutionSnapshotLocally();
                      showToast('Blocos regenerados com o novo tema!');
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-all"
                  >
                    Regenerar blocos
                  </button>
                </div>
              </div>
            )}
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
          <div className="flex flex-col gap-3 xl:flex-row xl:items-start">
            <div className="shrink-0">
              <span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-blue-300">Modo de Producao</span>
              <div className="flex gap-1 p-1 bg-black/20 rounded-xl border border-white/8">
              {([
                { value: "internal" as ExecutionMode, title: "No Aplicativo" },
                { value: "external" as ExecutionMode, title: "Externamente" },
              ]).map((option) => {
                const isActive = executionMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExecutionMode(option.value)}
                    className={`rounded-lg px-5 py-2 text-[10px] font-black uppercase tracking-[1.5px] transition-all ${
                      isActive
                        ? "bg-blue-500/20 border border-blue-400/40 text-blue-200 shadow-sm"
                        : "text-white/40 hover:text-white/70 border border-transparent"
                    }`}
                  >
                    {option.title}
                  </button>
                );
              })}
              </div>
            </div>
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
                  {manualPublishDate && (
                    <button
                      type="button"
                      onClick={() => { void clearPublishDate(); }}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-red-300 transition-all hover:border-red-400/50 hover:bg-red-500/20"
                    >
                      Limpar data
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {executionMode === 'external' && (
            <div className="space-y-4">
              {/* ROW 1: Textarea + Plataforma/TXT side by side */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Roteiro externo recebido</label>
                  <textarea
                    value={externalScriptText}
                    onChange={(e) => setExternalScriptText(e.target.value)}
                    placeholder="Cole aqui o roteiro final gerado fora do aplicativo. Se ele vier separado em BLOCO 1, BLOCO 2, etc., o app aplica automaticamente nos blocos atuais."
                    className="w-full min-h-[100px] bg-midnight/40 border border-white/10 rounded-2xl px-4 py-4 text-[12px] text-white/85 leading-relaxed outline-none focus:border-blue-400/40 resize-y placeholder:text-white/15"
                  />
                </div>
                <div className="space-y-3">
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
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Arquivo do roteiro (.txt)</label>
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleExternalScriptUpload}
                      className="block w-full text-[11px] text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-500/15 file:px-4 file:py-2.5 file:text-[10px] file:font-black file:uppercase file:tracking-[0.2em] file:text-blue-300 hover:file:bg-blue-500/20"
                    />
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                      {externalScriptFileName ? `Persistido: ${externalScriptFileName}` : 'Nenhum .txt anexado.'}
                    </div>
                    {externalScriptText && (
                      <button
                        type="button"
                        onClick={extractVisualBlueprintAndCast}
                        disabled={isExtractingVisuals}
                        className={`w-full rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-blue-200 transition-all hover:bg-blue-500/20 active:scale-95 flex items-center justify-center gap-2`}
                      >
                        {isExtractingVisuals ? '⏳ Analisando...' : '✨ Analisar Direcao de Arte & Elenco'}
                      </button>
                    )}
                  </div>
                </div>
              </div>

              {/* ROW 2: SRT + Formato/Personagem + Estilo + Botoes — 3 cols */}
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                {/* Col 1: SRT Upload & Estilo Visual */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Arquivo de legendas (.srt)</label>
                    <input
                      type="file"
                      accept=".srt,text/plain"
                      onChange={handleExternalSrtUpload}
                      className="block w-full text-[11px] text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-purple-500/15 file:px-4 file:py-2.5 file:text-[10px] file:font-black file:uppercase file:tracking-[0.2em] file:text-purple-200 hover:file:bg-purple-500/20"
                    />
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                      {externalSrtFileName ? `Persistido: ${externalSrtFileName}` : 'Nenhum .srt anexado.'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">Estilo Visual do Texto (Render)</p>
                    <select
                      value={textStyleMode}
                      onChange={(e) => setTextStyleMode(e.target.value)}
                      className="w-full bg-midnight/60 border border-white/10 rounded-xl px-3 py-2 text-[10px] uppercase font-black tracking-widest text-white outline-none focus:border-amber-500/40"
                    >
                      <option value="auto">Automatico (IA, Variavel cena a cena)</option>
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
                </div>

                {/* Col 2: Formato + Personagem */}
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Formato do Video</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'avatar', label: 'Apresentador' },
                        { value: 'vlog', label: 'VLOG' },
                        { value: 'faceless', label: 'Faceless' },
                        { value: 'avatar_flow', label: 'Avatar Flow' },
                      ] as { value: VideoFormat; label: string }[]).map((option) => {
                        const selected = videoFormat === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setVideoFormat(option.value)}
                            className={`rounded-xl border px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] transition-all text-center ${
                              selected
                                ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100'
                                : 'border-white/10 bg-white/5 text-white/45 hover:text-white/75'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {videoFormat === 'faceless' && (
                      <p className="text-[9px] text-amber-400/70 leading-relaxed">
                        Modo Faceless: imagens e videos a cada ~6s. As lacunas no CSV ficam em branco — estique a midia anterior no editor.
                      </p>
                    )}
                    {videoFormat === 'vlog' && (
                      <p className="text-[9px] text-cyan-400/70 leading-relaxed">
                        Modo VLOG Imersivo: personagem consistente em selfie trêmula 1ª pessoa e ritmo de B-roll descontraído.
                      </p>
                    )}
                    {videoFormat === 'avatar' && (
                      <p className="text-[9px] text-purple-400/70 leading-relaxed">
                        Modo Apresentador: personagem no home office/cenário fixo com inserções de B-roll frequentes.
                      </p>
                    )}
                    {videoFormat === 'avatar_flow' && (
                      <p className="text-[9px] text-violet-400/80 leading-relaxed">
                        Modo Avatar Flow: Roteiro em blocos de ~25 palavras. Prompts com alternância de ângulos cinematográficos para Personagem001 gerados de forma rápida, sem depender de SRT para começar.
                      </p>
                    )}
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-purple-200">Personagem dos prompts de video</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'male', label: 'Masculino' },
                        { value: 'female', label: 'Feminino' },
                        { value: 'custom', label: 'Custom' },
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
                    
                    {/* Visual Preview / Customizer Interface */}
                    {videoFormat !== 'faceless' && (videoCharacterMode === 'male' || videoCharacterMode === 'female') && (() => {
                      const resolvedPrompt = resolveCharacterProfileInFrontend(
                        videoCharacterMode,
                        videoFormat,
                        activeProject?.name || activeProject?.project_name
                      );
                      return (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-white/40">Visual Resolvido (Automático):</p>
                          <div className="rounded-xl border border-white/5 bg-black/35 p-3 text-[10px] leading-relaxed text-white/70 italic relative overflow-hidden group">
                            {resolvedPrompt}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setVideoCharacterCustom(resolvedPrompt);
                              setVideoCharacterMode('custom');
                            }}
                            className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-purple-200 transition-all hover:bg-purple-500/20 active:scale-95"
                          >
                            ✏️ Customizar este visual
                          </button>
                        </div>
                      );
                    })()}

                    {videoCharacterMode === 'custom' && (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={videoCharacterCustom}
                          onChange={(e) => setVideoCharacterCustom(e.target.value)}
                          placeholder="Ex: mulher brasileira, 42 anos, arquiteta de software, cabelo curto, olhar concentrado, roupa casual premium, home office escuro..."
                          className="w-full min-h-[90px] resize-y rounded-xl border border-white/10 bg-midnight/45 px-3 py-3 text-[11px] leading-5 text-white/80 outline-none placeholder:text-white/20 focus:border-purple-300/40"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const resolved = resolveCharacterProfileInFrontend(
                              'male',
                              videoFormat,
                              activeProject?.name || activeProject?.project_name
                            );
                            setVideoCharacterCustom(resolved);
                          }}
                          className="flex items-center justify-center gap-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white/60 transition-all hover:bg-white/10 hover:text-white/80"
                        >
                          ✨ Sugerir com base no Canal
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Col 3: Botoes de Acao */}
                <div className="space-y-3">
                  {/* ── BOTÃO PRINCIPAL: PIPELINE COMPLETO ────────────────── */}
                  <div className="flex gap-2 items-stretch">
                    <button
                      type="button"
                      onClick={runFullPipeline}
                      disabled={isPipelineRunning || isProcessingSrtPipeline || isRenderingTextAssets || isGeneratingPostScriptPackage || !externalSrtText.trim()}
                      className="flex-1 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-600/15 to-cyan-600/15 px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-all hover:from-emerald-600/25 hover:to-cyan-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPipelineRunning
                        ? `⏳ ${PIPELINE_STEP_LABELS[pipelineCurrentStep ?? ''] ?? 'AGUARDANDO...'}`
                        : pipelineCurrentStep === 'done'
                          ? '✅ PIPELINE CONCLUÍDO'
                          : '▶ INICIAR PIPELINE COMPLETO'}
                    </button>
                    {(externalSrtPipeline || postScriptPackage || hfBgPrompts) && (
                      <button
                        type="button"
                        title="Limpar resultados processados (mantém .srt e roteiro)"
                        onClick={() => {
                          if (confirm('Limpar todos os resultados processados?\n\nO arquivo .srt e o roteiro serão mantidos. Apenas assets, pacote pós-roteiro e fundos HF serão removidos.')) {
                            resetPipelineResults();
                          }
                        }}
                        disabled={isPipelineRunning}
                        className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-rose-300 transition-all hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-white/25 text-center">
                    {isPipelineRunning
                      ? 'Pipeline em execução — aguarde a conclusão de cada etapa...'
                      : 'Executa automaticamente: SRT → Fundos HF → Pacote Pós-Roteiro → BATs'}
                  </p>
                  {/* ── Warnings: prompts que não foram resolvidos mesmo após retry ── */}
                  {pipelineWarnings.length > 0 && (
                    <details className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 space-y-1">
                      <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-amber-300 list-none flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{pipelineWarnings.length} prompt{pipelineWarnings.length > 1 ? 's' : ''} incompleto{pipelineWarnings.length > 1 ? 's' : ''} após 2 tentativas</span>
                        <span className="text-amber-500/50 ml-auto">▼ ver detalhes</span>
                      </summary>
                      <ul className="mt-2 space-y-1 pl-1">
                        {pipelineWarnings.map((w, i) => (
                          <li key={i} className="text-[8px] text-amber-200/70 font-mono leading-relaxed">{w}</li>
                        ))}
                      </ul>
                      <p className="text-[8px] text-amber-400/50 mt-1">
                        Use o botão &quot;REGENERAR ITEMS&quot; abaixo para tentar novamente manualmente.
                      </p>
                    </details>
                  )}
                  {/* ── Divisor ───────────────────────────────────────────── */}
                  <div className="flex items-center gap-2 my-1">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] text-white/25 uppercase tracking-widest">ou etapas individuais</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  {/* ── Botão individual: só SRT ──────────────────────────── */}
                  <button
                    type="button"
                    onClick={processAttachedSrtAssets}
                    disabled={isPipelineRunning || isProcessingSrtPipeline || isRenderingTextAssets || !externalSrtText.trim()}
                    className="w-full rounded-xl border border-purple-400/25 bg-purple-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-purple-200 transition-all hover:bg-purple-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isProcessingSrtPipeline ? 'PROCESSANDO SRT...' : 'PROCESSAR SRT EM ASSETS'}
                  </button>
                  {externalSrtPipeline && (() => {
                    const fallbackRowsList = externalSrtPipeline.rows.filter((r) => r.isFallback);
                    const fallbackCount = fallbackRowsList.length;
                    if (fallbackCount === 0) return null;
                    return (
                      <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 space-y-3">
                        <div className="space-y-1">
                          <p className="text-[10px] text-orange-300 font-black uppercase tracking-widest">
                            ⚠️ {fallbackCount} prompt{fallbackCount > 1 ? 's' : ''} incompleto{fallbackCount > 1 ? 's' : ''}
                          </p>
                          <p className="text-[8px] text-orange-200/60 leading-normal">
                            Os seguintes trechos falharam e usaram prompts de fallback. Clique abaixo para regenerar.
                          </p>
                        </div>

                        <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-orange-500/20 scrollbar-track-transparent">
                          {fallbackRowsList.map((row) => (
                            <div
                              key={row.rowNumber}
                              className="flex flex-col gap-0.5 rounded border border-orange-500/10 bg-black/30 p-2 text-[9px] text-orange-200/80 font-mono"
                            >
                              <div className="flex justify-between items-center gap-1">
                                <span className="text-orange-400 font-bold">Linha #{row.rowNumber}</span>
                                <span className="rounded bg-orange-500/20 px-1 py-0.5 text-[8px] text-orange-300 font-bold uppercase shrink-0">
                                  {row.asset}
                                </span>
                              </div>
                              <div className="text-[8px] opacity-60 font-semibold">{row.startTime} - {row.endTime}</div>
                              <div className="text-white/80 italic mt-0.5 line-clamp-2">&quot;{row.texto}&quot;</div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={regenerateFallbackPrompts}
                          disabled={isRegeneratingFallbacks || isProcessingSrtPipeline}
                          className="w-full rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-200 transition-all hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRegeneratingFallbacks ? 'REGENERANDO...' : `REGENERAR ${fallbackCount} ITEM${fallbackCount > 1 ? 'S' : ''}`}
                        </button>
                      </div>
                    );
                  })()}
                  {externalSrtPipeline && (
                    <button
                      type="button"
                      onClick={renderTextAssetsFromPipeline}
                      disabled={isPipelineRunning || isProcessingSrtPipeline || isRenderingTextAssets || !postScriptPackage}
                      className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isRenderingTextAssets ? 'GERANDO BATs...' : 'ETAPA 5 · GERAR BATs'}
                    </button>
                  )}
                  <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                    {externalSrtPipeline?.generatedAt
                      ? `Pipeline persistido em ${new Date(externalSrtPipeline.generatedAt).toLocaleString('pt-BR')}.`
                      : 'Nenhum pipeline processado ainda.'}
                  </div>
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Pacote pos-roteiro</label>
                    <button
                      type="button"
                      onClick={generatePostScriptPackage}
                      disabled={isPipelineRunning || isGeneratingPostScriptPackage || !canProcessPostScriptPackage}
                      className="w-full rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 transition-all hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingPostScriptPackage ? 'PROCESSANDO PACOTE...' : postScriptPackage ? 'REPROCESSAR PACOTE POS-ROTEIRO' : 'PROCESSAR PACOTE POS-ROTEIRO'}
                    </button>
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                      {!canProcessPostScriptPackage
                        ? 'Finalize o roteiro interno ou anexe um .txt externo para habilitar esta etapa.'
                        : postScriptPackage
                          ? `Pacote persistido em ${new Date(postScriptPackage.generatedAt).toLocaleString('pt-BR')}.`
                          : 'Nenhum pacote pos-roteiro processado ainda.'}
                    </div>
                  </div>
                </div>
              </div>

              {/* DIREÇÃO DE ARTE & ELENCO CONSISTENTE (FULL WIDTH & GRADE) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[12px] font-black uppercase tracking-[0.2em] text-cyan-300">🎨 Direção de Arte & Elenco Consistente</span>
                    <p className="text-[10px] text-white/40 mt-1">Defina a ambientação visual e gerencie o elenco para consistência via colchetes [Nome].</p>
                  </div>
                  {visualBlueprintCast.length > 0 && (
                    <button
                      type="button"
                      onClick={copyAllCharacterPrompts}
                      className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-[9px] font-bold text-cyan-200 transition-all hover:bg-cyan-500/20 active:scale-95 flex items-center gap-2 uppercase tracking-wider"
                    >
                      <span>📋 Copiar Todos os Prompts (Elenco)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Cenário / Estilo Geral */}
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Cenário / Estilo Geral (PT-BR)</label>
                    <textarea
                      value={visualBlueprintSetting}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVisualBlueprintSetting(val);
                        persistExecutionSnapshotLocally({ visualBlueprintSetting: val });
                      }}
                      placeholder="Ex: Fantasia sombria Warhammer 40k, catedral espacial gotica gelida..."
                      className="w-full min-h-[140px] resize-y rounded-xl border border-white/10 bg-midnight/45 px-3 py-2 text-[11px] leading-relaxed text-white/80 outline-none focus:border-cyan-300/40"
                    />
                    <p className="text-[9px] text-white/35 leading-relaxed">
                      Descreva a atmosfera, iluminação e visual de fundo geral. O pipeline combina este estilo com as cenas geradas.
                    </p>
                  </div>

                  {/* Elenco de Personagens */}
                  <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Elenco Narrativo ({visualBlueprintCast.length})</label>
                    {visualBlueprintCast.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-white/10 rounded-xl bg-black/10">
                        <p className="text-[11px] text-white/35 italic">Nenhum personagem extraído ainda.</p>
                        <p className="text-[9px] text-white/20 mt-1 max-w-xs">
                          Anexe o arquivo do roteiro (.txt) no painel superior e clique em &quot;Analisar Direção de Arte & Elenco&quot; para gerar.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                        {visualBlueprintCast.map((char, index) => (
                          <div key={index} className="rounded-xl border border-white/5 bg-midnight/40 p-3.5 space-y-2 flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="font-bold text-[11px] text-cyan-200 tracking-wide">{char.name}</span>
                                <button
                                  type="button"
                                  onClick={() => copyTextToClipboard(getCharacterSheetPrompt(char), `Prompt de ${char.name} copiado!`)}
                                  className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all uppercase tracking-wider flex items-center gap-1.5"
                                >
                                  <span>📋 Copiar Prompt</span>
                                </button>
                              </div>
                              <textarea
                                value={char.description}
                                onChange={(e) => {
                                  const updatedCast = [...visualBlueprintCast];
                                  updatedCast[index] = { ...char, description: e.target.value };
                                  setVisualBlueprintCast(updatedCast);
                                  persistExecutionSnapshotLocally({ visualBlueprintCast: updatedCast });
                                }}
                                className="w-full min-h-[70px] bg-transparent border-0 text-[10px] leading-relaxed text-white/70 italic resize-y p-0 outline-none focus:text-white"
                              />
                            </div>
                            <div className="text-[8px] text-cyan-400/35 text-right font-mono tracking-wider">
                              Use [{char.name}] no roteiro para vincular
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
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
                      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                        {[
                          { label: 'Linhas', value: externalSrtPipeline.stats.total },
                          { label: 'Texto', value: externalSrtPipeline.stats.texto },
                          { label: 'Avatar', value: externalSrtPipeline.stats.avatar },
                          { label: 'Video', value: externalSrtPipeline.stats.video },
                          { label: 'Imagem', value: externalSrtPipeline.stats.image },
                          { label: 'Hyperframe', value: externalSrtPipeline.stats.hyperframe },
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
                      {/* Checkbox global de colchetes */}
                      <div className="flex items-center gap-3 bg-midnight/25 border border-white/10 rounded-2xl p-4 mb-4">
                        <label className="relative flex items-center gap-3 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={preserveBrackets}
                            onChange={(e) => setPreserveBrackets(e.target.checked)}
                            className="w-4.5 h-4.5 rounded border border-white/10 bg-black/40 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-500"
                          />
                          <div>
                            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:text-white transition-colors">
                              Preservar [Colchetes] de Personagens Consistentes
                            </span>
                            <span className="block text-[9px] text-white/40 mt-1 leading-relaxed">
                              Marque para manter a tag original do personagem (ex: <strong>[Grey Knight]</strong>) nos prompts copiado/exportados. Útil para fluxos de referência (Cref / Flux LoRA). Desmarque para expandir a descrição física completa automaticamente.
                            </span>
                          </div>
                        </label>
                      </div>

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
                                onClick={() => copyTextToClipboard(compilePromptText(externalSrtPipeline.videoPromptsTxt), 'Prompts de video copiados.')}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadTextArtifact(srtArtifactStem, 'prompts_video', compilePromptText(externalSrtPipeline.videoPromptsTxt))}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                            </div>
                          </div>
                          <textarea
                            readOnly
                            value={compilePromptText(externalSrtPipeline.videoPromptsTxt) || 'Nenhum prompt de video foi gerado para este SRT.'}
                            className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                          />
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompts de imagem</p>
                              <p className="text-[10px] text-white/40 mt-1">
                                Saida equivalente ao arquivo `_prompts_imagem.txt`.{' '}
                                {(() => { const n = externalSrtPipeline.rows.filter(r => normalizeAssetType(r.asset) === 'hyperframe').length; return n > 0 ? <span className="text-violet-400">{n} HF detectado{n > 1 ? 's' : ''}</span> : <span className="text-white/20">0 HF</span>; })()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (videoFormat === 'faceless') {
                                    alert('No formato Faceless, os HyperFrames já são gerados como prompts de vídeo completos na seção de vídeos acima. Não é necessário gerar fundos de imagem.');
                                    return;
                                  }
                                  await generateHfBgPromptsInternal();
                                }}
                                disabled={isGeneratingHfBg}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
                                  videoFormat === 'faceless'
                                    ? 'border-white/10 text-white/35 hover:bg-transparent cursor-pointer'
                                    : 'border-violet-500/30 text-violet-300 hover:border-violet-400/60 hover:text-violet-200'
                                }`}
                              >
                                {videoFormat === 'faceless' ? '🚫 Sem Fundos' : (isGeneratingHfBg ? '⏳ Gerando...' : '⚡ Fundos HF')}
                              </button>
                              <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  copyTextToClipboard(compileUnifiedImagePrompts(), 'Prompts copiados.');
                                }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadTextArtifact(srtArtifactStem, 'prompts_imagem', compileUnifiedImagePrompts());
                                }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                              </div>
                            </div>
                          </div>
                          {/* Inline error banner */}
                          {hfBgPrompts?.[0]?.rowNumber === -1 && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-[11px] text-red-300">
                              ❌ {hfBgPrompts[0].prompt}
                            </div>
                          )}
                          {/* Success banner */}
                          {hfBgPrompts && hfBgPrompts[0]?.rowNumber !== -1 && (
                            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-2 text-[11px] text-violet-300">
                              ✅ {hfBgPrompts.length} fundo(s) gerado(s) — veja abaixo no textarea
                            </div>
                          )}
                          <textarea
                            readOnly
                            value={compileUnifiedImagePrompts() || 'Nenhum prompt de imagem foi gerado para este SRT.'}
                            className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
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
                                  onClick={() => copyTextToClipboard(buildSfxEnrichedCsvContent(externalSrtPipeline.csvContent, postScriptPackage?.sfxTimelineTxt), 'CSV base copiado.')}
                                  className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                                >
                                  <Copy size={12} className="inline mr-2" /> Copiar CSV
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadTextArtifact(srtArtifactStem, 'timeline_assets', buildSfxEnrichedCsvContent(externalSrtPipeline.csvContent, postScriptPackage?.sfxTimelineTxt), { extension: 'csv', mimeType: 'text/csv;charset=utf-8' })}
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
                            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-300">Etapa 5 · Scripts BAT (Offline)</p>
                            <p className="text-[10px] text-white/40 mt-1">
                              Gera e baixa automaticamente os scripts `.bat` para renderizar Textos, Hyperframes e SFX localmente na sua máquina.
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
                              className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                            />
                          </>
                        ) : (
                          <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                            A etapa 5 ainda nao foi disparada. Quando voce clicar em <span className="font-black text-amber-200">ETAPA 5 · GERAR BATS</span>, o app vai processar e baixar automaticamente todos os scripts necessários para a produção offline dos recursos do projeto. Certifique-se de ter gerado o Pacote Pós-Roteiro primeiro.
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}


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
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">
                          {postScriptPackage.titles.length} título{postScriptPackage.titles.length !== 1 ? 's' : ''} virais
                        </p>
                        <p className="mt-1 text-[10px] text-white/40">
                          {titleValidations ? 'Validação concluída. Revise os vereditos abaixo.' : 'Opções persistidas para teste rápido.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.titles.map((title, index) => `${index + 1}. ${title}`).join('\n'), 'Titulos virais copiados.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>

                    {/* Titles list */}
                    <div className="space-y-2">
                      {postScriptPackage.titles.map((title, index) => {
                        const validation = titleValidations?.[index];
                        const verdictEmoji = validation
                          ? validation.score >= 4.5 ? '🟩' : validation.score >= 3.0 ? '🟨' : '🟥'
                          : null;
                        const verdictColor = validation
                          ? validation.score >= 4.5
                            ? 'text-emerald-300'
                            : validation.score >= 3.0
                              ? 'text-amber-300'
                              : 'text-red-300'
                          : '';
                        return (
                          <div key={`${index}-${title}`} className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/35 mb-1 mt-0.5 shrink-0">
                                Opção {index + 1}
                              </span>
                              {validation && (
                                <span className={`text-[10px] font-black tabular-nums shrink-0 ${verdictColor}`}>
                                  {verdictEmoji} {validation.score}/6 · {validation.verdict}
                                </span>
                              )}
                            </div>
                            <p className="text-[13px] font-bold leading-6 text-white/90">{title}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      {/* Step 1 → always visible: Validate */}
                      <button
                        type="button"
                        onClick={validateViralTitles}
                        disabled={isValidatingTitles || isRegeneratingTitles}
                        className="w-full rounded-xl border border-blue-400/20 bg-blue-500/8 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 transition-all hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isValidatingTitles
                          ? 'VALIDANDO...'
                          : !titleValidations
                            ? 'VALIDAR TÍTULOS'
                            : titleValidations.some(v => v === null)
                              ? `VALIDAR NOVOS (${titleValidations.filter(v => v === null).length})`
                              : 'REVALIDAR TÍTULOS'}
                      </button>
                      {/* Step 2 → conditional: Regenerate (appears after validation) */}
                      {titleValidations && (
                        <button
                          type="button"
                          onClick={regenerateViralTitles}
                          disabled={isRegeneratingTitles || isValidatingTitles}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 transition-all hover:border-blue-400/20 hover:text-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RotateCcw size={11} className="inline mr-2" />
                          {isRegeneratingTitles
                            ? 'REGERANDO...'
                            : titleValidations
                              ? `REGERAR FRACOS (${titleValidations.filter(v => v !== null && v.verdict !== 'Aprovado').length})`
                              : 'REGERAR TÍTULOS'}
                        </button>
                      )}
                      {/* AI working indicator */}
                      {(isValidatingTitles || isRegeneratingTitles) && (
                        <div className="flex items-center gap-3 rounded-xl border border-blue-400/15 bg-blue-500/5 px-4 py-3">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
                          </span>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">
                            {isValidatingTitles
                              ? 'IA avaliando os títulos com checklist estrutural...'
                              : 'IA gerando títulos substitutos...'}
                          </p>
                        </div>
                      )}
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
                    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4 space-y-4">
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
                    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-7 text-white/80 whitespace-pre-wrap">
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

        {/* ═══════════════════════════════════════════════════════ TEMPLATE STUDIO ═══ */}
        <div className="mx-6 xl:mx-8 mt-6 rounded-[32px] border border-purple-500/15 bg-purple-500/[0.025] overflow-hidden shadow-[0_0_40px_rgba(168,85,247,0.05)]">
          <div
            onClick={() => setIsTemplateStudioExpanded(!isTemplateStudioExpanded)}
            className="flex items-center justify-between p-6 xl:p-8 cursor-pointer hover:bg-purple-500/5 transition-colors select-none group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors mt-1">
                <Layout size={24} className="text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.38em] text-purple-300">Template Studio</p>
                <h4 className="text-xl font-black text-white mt-1 group-hover:text-purple-100 transition-colors">Gerar templates com identidade do canal</h4>
                <p className="text-[11px] leading-6 text-white/50 mt-1 max-w-2xl">
                  Configure as cores, fonte e estilo do canal. O app gera e baixa os 10 templates HTML prontos para salvar na pasta <span className="font-black text-purple-200">Canal/Template HTML/</span>.
                </p>
              </div>
            </div>
            <div className="hidden xl:flex items-center gap-4">
              <div className={`p-2 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isTemplateStudioExpanded ? 'rotate-180' : ''}`}>
                <ChevronDown size={20} />
              </div>
            </div>
          </div>

          <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isTemplateStudioExpanded ? 'grid-rows-[1fr] opacity-100 px-6 pb-6 xl:px-8 xl:pb-8 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="min-h-0 space-y-6 pt-6">

              {/* Color + Font config */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-purple-300">Identidade Visual</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Cor Primária</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={templatePrimaryColor}
                          onChange={(e) => setTemplatePrimaryColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={templatePrimaryColor}
                          onChange={(e) => setTemplatePrimaryColor(e.target.value)}
                          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] font-mono text-white/80 outline-none focus:border-purple-400/40"
                          maxLength={7}
                          placeholder="#RRGGBB"
                        />
                      </div>
                      <p className="text-[9px] text-white/30">Títulos e acentos principais</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Cor Secundária</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={templateSecondaryColor}
                          onChange={(e) => setTemplateSecondaryColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={templateSecondaryColor}
                          onChange={(e) => setTemplateSecondaryColor(e.target.value)}
                          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] font-mono text-white/80 outline-none focus:border-purple-400/40"
                          maxLength={7}
                          placeholder="#RRGGBB"
                        />
                      </div>
                      <p className="text-[9px] text-white/30">Métricas, glow e destaques</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Fonte</label>
                      <div className="relative">
                        <select
                          value={templateFontFamily}
                          onChange={(e) => setTemplateFontFamily(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-[#12121a] px-3 py-2.5 text-[12px] text-white/90 outline-none focus:border-purple-400/40 hover:border-white/20 transition-colors cursor-pointer"
                        >
                          <option value="Inter" className="bg-[#12121a] text-white">Inter (padrão)</option>
                          <option value="Outfit" className="bg-[#12121a] text-white">Outfit (moderno)</option>
                          <option value="Space Grotesk" className="bg-[#12121a] text-white">Space Grotesk (tech)</option>
                          <option value="Sora" className="bg-[#12121a] text-white">Sora (suave)</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Perfil de Estilo</label>
                      <div className="relative">
                        <select
                          value={templateStyleProfile}
                          onChange={(e) => setTemplateStyleProfile(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-[#12121a] px-3 py-2.5 text-[12px] text-white/90 outline-none focus:border-purple-400/40 hover:border-white/20 transition-colors cursor-pointer"
                        >
                          <option value="Tech" className="bg-[#12121a] text-white">Tech / IA</option>
                          <option value="Business" className="bg-[#12121a] text-white">Business / Negócios</option>
                          <option value="Education" className="bg-[#12121a] text-white">Educação / Cursos</option>
                          <option value="Lifestyle" className="bg-[#12121a] text-white">Lifestyle / Motivação</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview swatch */}
                <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-purple-300">Preview de Cores</p>
                  
                  {/* Dynamic font injection for preview */}
                  <style dangerouslySetInnerHTML={{__html: `
                    @import url('https://fonts.googleapis.com/css2?family=${String(templateFontFamily || '').replace(/ /g, '+')}:wght@400;700;800;900&display=swap');
                  `}} />

                  <div className="rounded-2xl overflow-hidden border border-white/10 relative" style={{ background: '#0a0a14' }}>
                    <div className="p-6 space-y-3">
                      <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: templatePrimaryColor }}>CANAL · INSIGHT PRINCIPAL</div>
                      <div className="text-2xl font-black text-white" style={{ fontFamily: `'${templateFontFamily}', Arial, sans-serif` }}>Título do Vídeo</div>
                      <div className="text-sm text-white/60">Subtítulo de contexto e informação</div>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black" style={{ background: `${templatePrimaryColor}18`, border: `1px solid ${templatePrimaryColor}44`, color: templatePrimaryColor }}>
                        ◆ <span style={{ color: templateSecondaryColor }}>+340%</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[9px] text-white/30">Prévia aproximada. O resultado final é renderizado pelo Playwright.</p>
                </div>
              </div>

              {/* Generate button */}
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={isGeneratingTemplates}
                  onClick={async () => {
                    setIsGeneratingTemplates(true);
                    setTemplateGenResult(null);
                    try {
                      const res = await fetch('/api/template-studio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          primaryColor: templatePrimaryColor,
                          secondaryColor: templateSecondaryColor,
                          fontFamily: templateFontFamily,
                          styleProfile: templateStyleProfile,
                          channelName: activeProject?.name || activeProject?.project_name || 'Canal',
                        }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      await downloadTemplateZip(data.templates, data.meta);
                      setTemplateGenResult({ total: data.meta.total, missing: data.missing || [] });
                      showToast(`${data.meta.total} templates gerados e baixados!`);
                    } catch (err: any) {
                      showToast(`Erro: ${err.message || 'Falha ao gerar templates.'}`);
                    } finally {
                      setIsGeneratingTemplates(false);
                    }
                  }}
                  className="w-full rounded-2xl border border-purple-400/30 bg-purple-500/15 px-6 py-4 text-[11px] font-black uppercase tracking-[0.26em] text-purple-200 transition-all hover:border-purple-300/40 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingTemplates ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400" />
                      </span>
                      GERANDO TEMPLATES...
                    </span>
                  ) : '⬇ GERAR E BAIXAR TEMPLATES DO CANAL'}
                </button>

                {templateGenResult && (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 px-5 py-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                      ✓ {templateGenResult.total} template{templateGenResult.total !== 1 ? 's' : ''} gerado{templateGenResult.total !== 1 ? 's' : ''} com sucesso
                    </p>
                    <p className="text-[10px] text-white/50">
                      Extraia o ZIP em <span className="font-black text-white/70">[Canal]/Template HTML/</span> e o .bat vai encontrá-los automaticamente no próximo processamento.
                    </p>
                    {templateGenResult.missing.length > 0 && (
                      <p className="text-[10px] text-amber-300">
                        ⚠️ Não encontrados: {templateGenResult.missing.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3 space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Instrução pós-download</p>
                  <p className="text-[10px] leading-5 text-white/45">
                    1. Extraia o ZIP · 2. Mova para <span className="font-mono text-white/60">[Canal]/Template HTML/</span> · 3. O .bat vai usar seus templates automaticamente
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
        {/* ══════════════════════════════════════════════════════════════════════════════ */}

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
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            zIndex: 9999,
            background: 'rgba(20,20,30,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '10px 18px',
            color: '#e0e0ff',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          ✓ {toastMessage}
        </div>
      )}
      {storageUsageMB >= STORAGE_LIMIT_MB * STORAGE_WARN_THRESHOLD && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '28px',
            zIndex: 9998,
            background: 'rgba(20,12,4,0.95)',
            border: `1px solid ${storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.4)'}`,
            borderRadius: '14px',
            padding: '12px 16px',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            backdropFilter: 'blur(14px)',
            boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
            minWidth: '240px',
            maxWidth: '300px',
          }}
        >
          <p style={{ color: storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? '#f87171' : '#fbbf24', fontSize: '9px', letterSpacing: '0.2em', marginBottom: '6px', fontWeight: 900, textTransform: 'uppercase' }}>
            {storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? '🔴 Armazenamento crítico' : '⚠️ Armazenamento alto'}
          </p>
          {/* Usage bar */}
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '5px', marginBottom: '8px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (storageUsageMB / STORAGE_LIMIT_MB) * 100).toFixed(1)}%`,
              background: storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? '#ef4444' : '#f59e0b',
              borderRadius: '6px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '10px', marginBottom: '8px' }}>
            {storageUsageMB.toFixed(1)} MB de ~{STORAGE_LIMIT_MB} MB usados ({((storageUsageMB / STORAGE_LIMIT_MB) * 100).toFixed(0)}%)
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1.5, marginBottom: '8px' }}>
            Programe os temas prontos para liberar espaço automaticamente.
          </p>
          <button
            onClick={() => {
              // Purge stale snapshot_ keys only — never touch other projects' workspace keys
              try {
                const toRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i) || '';
                  if (k.startsWith('snapshot_')) toRemove.push(k);
                }
                toRemove.forEach(k => localStorage.removeItem(k));
                checkStorageUsage();
                showToast(`${toRemove.length} entradas antigas removidas.`);
              } catch { /* ignore */ }
            }}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '5px 10px',
              fontSize: '9px',
              fontWeight: 900,
              letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              width: '100%',
            }}
          >
            Limpar dados antigos
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
