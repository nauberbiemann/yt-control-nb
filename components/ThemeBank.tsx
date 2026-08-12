'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject, useProjectStore } from '@/lib/store/projectStore';
import CustomSelect from './ui/CustomSelect';
import ContentHub from './ContentHub';
import {
  Lightbulb,
  Plus,
  Search,
  Filter,
  ChevronRight,
  ChevronDown,
  Trash2,
  Edit3,
  BookOpen,
  Zap,
  TrendingUp,
  Target,
  Sparkles,
  CheckCircle2,
  Clock,
  FileText,
  Star,
  Cloud,
  CloudOff,
  BarChart3,
  Maximize2,
  X,
  Users,
  RotateCcw,
} from 'lucide-react';

const PILLARS = ['Educação', 'Entretenimento', 'Autoridade', 'Conversão', 'Comunidade'];
const STATUSES = ['backlog', 'vetted', 'scripted', 'scheduled', 'published'] as const;
const STRUCTURES = ['S1 — Curiosidade', 'S2 — Dor + Solução', 'S3 — Autoridade', 'S4 — Contrário', 'S5 — Lista'];
const PIPELINES = [
  { value: 'T1', label: 'T1 — Topo de Funil (Viral)', desc: 'Foco em alcance e novos inscritos.' },
  { value: 'T2', label: 'T2 — Meio de Funil (Retenção)', desc: 'Foco em autoridade e tempo de exibição.' },
  { value: 'T3', label: 'T3 — Fundo de Funil (Comunidade)', desc: 'Foco em conexão e conversão.' }
];

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  backlog:   { label: 'Backlog',    color: 'text-slate-400 bg-slate-400/5 border-slate-400/10',  icon: Clock       },
  vetted:    { label: 'Aprovado',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: CheckCircle2 },
  scripted:  { label: 'Produção', color: 'text-indigo-400 bg-indigo-500/10 border-indigo-500/20', icon: FileText    },
  scheduled: { label: 'Programado', color: 'text-amber-300 bg-amber-500/10 border-amber-500/20', icon: Clock },
  published: { label: 'Publicado',  color: 'text-emerald-400 bg-emerald-500/10 border-emerald-500/20', icon: Star },
};

const PILLAR_OPTIONS = PILLARS.map(p => ({ value: p, label: p }));
const STATUS_OPTIONS = STATUSES.map(s => ({ value: s, label: STATUS_META[s].label }));
const STRUCTURE_OPTIONS = STRUCTURES.map(s => ({ value: s, label: s }));
const PIPELINE_OPTIONS = PIPELINES.map(p => ({ value: p.value, label: p.label }));

interface TitleStructureAsset {
  id: string;
  name: string;
  pattern: string;
  slotId: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  source: 'library' | 'fallback';
}

const DEFAULT_TITLE_STRUCTURES: TitleStructureAsset[] = [
  { id: 'fallback-s1', slotId: 'S1', name: 'Provocacao', pattern: 'O erro tecnico que [TARGET] ignora ao abordar [TEMA]', source: 'fallback' },
  { id: 'fallback-s2', slotId: 'S2', name: 'Metafora', pattern: '[METAFORA]: A analogia definitiva para dominar [TEMA]', source: 'fallback' },
  { id: 'fallback-s3', slotId: 'S3', name: 'Interrupcao', pattern: 'PARE de usar metodos genericos em [TEMA]! Aplique o M1: [JORNADA]', source: 'fallback' },
  { id: 'fallback-s4', slotId: 'S4', name: 'Desconstrucao', pattern: 'Por que o [TEMA] tradicional falha (A verdade do nicho)', source: 'fallback' },
  { id: 'fallback-s5', slotId: 'S5', name: 'Blueprint', pattern: 'O [METAFORA] do [TEMA]: Roteiro Tecnico do Diagnostico ao Lifestyle', source: 'fallback' },
];

interface Theme {
  id: string;
  title: string;
  description?: string;
  editorial_pillar?: string;
  status: typeof STATUSES[number];
  title_structure?: string;
  selected_structure?: string;
  title_structure_asset_id?: string | null;
  pipeline_level?: string;
  is_demand_vetted: boolean;
  is_persona_vetted: boolean;
  refined_title?: string;
  priority: number;
  notes?: string;
  match_score?: number;
  demand_views?: string;
  production_assets?: any;
  target_publish_date?: string;
  created_at: string;
}

interface ThemeBankProps {
  activeProject?: any; // Optional: store takes priority
  userId?: string;
  selectedAIConfig?: any;
  initialExpandedStatus?: string; // Auto-expand this status section on mount
  onGerarRoteiro?: (data: any) => void;
  onOpenInWriting?: (theme: any) => void;
  onResumeInWriting?: () => void;
  onConsultarConselho?: (theme: any) => void;
}

const THEME_CLOUD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const getThemeMergeKey = (theme: Partial<Theme>) => {
  if (theme.id) return `id:${theme.id}`;
  const semanticTitle = (theme.refined_title || theme.title || '').trim().toLowerCase();
  const semanticStructure = (theme.title_structure || '').trim().toLowerCase();
  if (!semanticTitle) return '';
  return `semantic:${semanticTitle}:${semanticStructure}`;
};

const emptyTheme: Omit<Theme, 'id' | 'created_at'> = {
  title: '',
  description: '',
  editorial_pillar: '',
  status: 'backlog',
  title_structure: '',
  selected_structure: '',
  title_structure_asset_id: null,
  pipeline_level: '',
  is_demand_vetted: false,
  is_persona_vetted: false,
  refined_title: '',
  priority: 0,
  notes: '',
  target_publish_date: '',
};

export default function ThemeBank({ activeProject: propProject, userId, selectedAIConfig, initialExpandedStatus, onGerarRoteiro, onOpenInWriting, onResumeInWriting, onConsultarConselho }: ThemeBankProps) {
  // Zustand store takes priority over prop for isolation guarantee
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;

  const [themes, setThemes] = useState<Theme[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterPillar, setFilterPillar] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [showForm, setShowForm] = useState(false);
  const [editingTheme, setEditingTheme] = useState<Theme | null>(null);
  const [form, setForm] = useState(emptyTheme);
  const [saving, setSaving] = useState(false);
  const [workspace, setWorkspace] = useState<'fila' | 'briefing'>('fila');
  const [projectTitleStructures, setProjectTitleStructures] = useState<TitleStructureAsset[]>(DEFAULT_TITLE_STRUCTURES);

  // Accordion & Sorting states
  const [expandedStatuses, setExpandedStatuses] = useState<string[]>(
    initialExpandedStatus ? [initialExpandedStatus] : []
  );
  const [sortConfigs, setSortConfigs] = useState<Record<string, 'priority' | 'date_desc' | 'date_asc'>>({});
  const [cloudSyncedIds, setCloudSyncedIds] = useState<Set<string>>(new Set());
  const [allNarrativeComponents, setAllNarrativeComponents] = useState<any[]>([]);
  const [showDnaTable, setShowDnaTable] = useState(false);
  const [showDnaFullscreen, setShowDnaFullscreen] = useState(false);

  const [isReorganizing, setIsReorganizing] = useState(false);

  const isAviationTitle = (title: string, description: string = '') => {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes('radar explicado')) return true;
    if (text.includes('fábrica y') || text.includes('fabrica y')) return false;
    return /aviao|avião|aviões|avioes|caça|caças|caca|cacas|mft-lf|cenipa|embraer|tucano|praetor|phenom|e-jet|e2|c-390|amx|jato|jatos|voepass|ntsb|faa|perícia|pericia|piloto|pilotos|voo|voos|aeroporto|cabine|turbina|pistas|desastres|aeronave|aeronaves|aeronáutica|aeronautica|aeronáuticos|gripen|f-39|f-5|mirage|esquadrilha/i.test(text);
  };

  const isNavalTitle = (title: string, description: string = '') => {
    const text = `${title} ${description}`.toLowerCase();
    if (text.includes('fábrica y') || text.includes('fabrica y')) return true;
    if (text.includes('radar explicado')) return false;
    return /navio|navios|submarino|submarinos|submersas|semissubmersíveis|semissubmersiveis|plataforma|plataformas|marinheiro|marinheiros|guindaste|guindastes|portuários|portuarios|siderurgia|casco|quebra-gelo|offshore|desmontagem|reciclagem|embarcações|embarcacoes|embarcação|propulsão|porta-aviões|porta-avioes|estaleiro|estaleiros|fundições|fundicoes|correntes gigantes/i.test(text);
  };

  const isTestOrDummyTitle = (text: unknown): boolean => {
    if (!text || typeof text !== 'string') return false;
    return /html_injection|xss|onerror|<u>|<img|test_theme|test_project/i.test(text);
  };

  const filterThemesByProjectDomain = (list: Theme[], proj: any): Theme[] => {
    const cleanList = list.filter(t => !isTestOrDummyTitle(t.title) && !isTestOrDummyTitle(t.description));
    if (!proj) return cleanList;
    const projName = (proj.name || proj.project_name || '').toLowerCase();
    if (projName.includes('radar')) {
      return cleanList.filter(t => !isNavalTitle(t.title || '', t.description || ''));
    }
    if (/fabric|fábric/i.test(projName)) {
      return cleanList.filter(t => !isAviationTitle(t.title || '', t.description || ''));
    }
    return cleanList;
  };

  const reorganizeThemesByProject = async (silent = false) => {
    if (!supabase) return;
    setIsReorganizing(true);
    try {
      let projectsList = useProjectStore.getState().projects || [];
      if (!projectsList || projectsList.length === 0) {
        const { data } = await supabase.from('projects').select('*');
        projectsList = data || [];
      }

      const radarProject = projectsList.find((p: any) =>
        (p.name || p.project_name || '').toLowerCase().includes('radar')
      );
      const fabricaProject = projectsList.find((p: any) => {
        const n = (p.name || p.project_name || '').toLowerCase();
        return n.includes('fabric') || n.includes('fábric');
      });

      const radarId = radarProject?.id || 'dd5d5231-cb89-4cf6-824f-08e217b31704';
      const fabricaId = fabricaProject?.id || '7919dbc5-e1da-4ca1-88dd-3e33c91ba5b7';

      const { data: allThemes, error } = await supabase
        .from('themes')
        .select('*')
        .in('project_id', [radarId, fabricaId]);

      if (error) {
        console.warn('[ThemeBank] Warning fetching themes for reorganization:', error.message);
      }

      const remoteThemes = allThemes || [];

      let localRadarThemes: any[] = [];
      let localFabricaThemes: any[] = [];
      try {
        localRadarThemes = JSON.parse(localStorage.getItem(`themes_${radarId}`) || '[]');
        localFabricaThemes = JSON.parse(localStorage.getItem(`themes_${fabricaId}`) || '[]');
      } catch {}

      const allLocalThemes = [...localRadarThemes, ...localFabricaThemes];
      const mergedAllMap = new Map<string, any>();
      remoteThemes.forEach((t: any) => { if (t.id) mergedAllMap.set(t.id, t); });
      allLocalThemes.forEach((t: any) => { if (t.id && !mergedAllMap.has(t.id)) mergedAllMap.set(t.id, t); });

      const combinedThemes = Array.from(mergedAllMap.values());

      const cleanRadarThemes: any[] = [];
      const cleanFabricaThemes: any[] = [];
      const supabaseUpdates: Array<{ id: string; project_id: string; title: string }> = [];

      combinedThemes.forEach((t: any) => {
        const title = t.title || '';
        const desc = t.description || '';
        if (isAviationTitle(title, desc)) {
          const item = { ...t, project_id: radarId };
          cleanRadarThemes.push(item);
          if (t.project_id !== radarId) {
            supabaseUpdates.push({ id: t.id, project_id: radarId, title });
          }
        } else if (isNavalTitle(title, desc)) {
          const item = { ...t, project_id: fabricaId };
          cleanFabricaThemes.push(item);
          if (t.project_id !== fabricaId) {
            supabaseUpdates.push({ id: t.id, project_id: fabricaId, title });
          }
        } else {
          if (t.project_id === fabricaId) cleanFabricaThemes.push(t);
          else cleanRadarThemes.push(t);
        }
      });

      if (supabaseUpdates.length > 0) {
        console.log(`[ThemeBank] 🔄 Updating ${supabaseUpdates.length} swapped themes in Supabase...`);
        for (const item of supabaseUpdates) {
          await supabase
            .from('themes')
            .update({ project_id: item.project_id })
            .eq('id', item.id);
        }
      }

      localStorage.setItem(`themes_${radarId}`, JSON.stringify(cleanRadarThemes));
      localStorage.setItem(`themes_${fabricaId}`, JSON.stringify(cleanFabricaThemes));

      if (activeProject?.id === radarId) {
        setThemes(cleanRadarThemes);
      } else if (activeProject?.id === fabricaId) {
        setThemes(cleanFabricaThemes);
      } else {
        await fetchThemes();
      }

      if (!silent) {
        alert(`✅ Sucesso! Temas reorganizados entre projetos:\n\n• Radar Explicado (Aviação): ${cleanRadarThemes.length} temas\n• Fábrica Y (Engenharia Pesada): ${cleanFabricaThemes.length} temas`);
      }
    } catch (err: any) {
      console.error('[ThemeBank] Erro ao reorganizar temas:', err);
      if (!silent) alert('Erro ao reorganizar temas: ' + (err?.message || err));
    } finally {
      setIsReorganizing(false);
    }
  };

  const toggleStatus = (status: string) => {
    setExpandedStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // 🛠️ Agnosticismo de Dados: Puxa os pilares configurados no Projeto
  const projectPillars = activeProject?.editorial_line?.pillars?.filter((p: string) => p.trim() !== '') || [];
  const currentPillarOptions = projectPillars.length > 0 
    ? projectPillars.map((p: string) => ({ value: p, label: p }))
    : PILLAR_OPTIONS; // Fallback se não houver pilares cadastrados

  const getThemePublishDate = (theme: Partial<Theme>) =>
    theme.target_publish_date || theme.production_assets?.target_publish_date || '';

  const resolveThemeStatusFromPublishDate = (
    dateValue: string,
    fallbackStatus: typeof STATUSES[number]
  ): typeof STATUSES[number] => {
    if (!dateValue) {
      if (fallbackStatus === 'scheduled' || fallbackStatus === 'published') return 'scripted';
      return fallbackStatus;
    }

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

  const formatPublishDate = (dateValue: string) => {
    if (!dateValue) return '';
    const date = new Date(dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`);
    if (Number.isNaN(date.getTime())) return dateValue;
    return dateValue.includes('T')
      ? date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
      : date.toLocaleDateString('pt-BR');
  };

  const toDateTimeInputValue = (dateValue: string) => {
    if (!dateValue) return '';
    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) return `${dateValue}T00:00`;
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateValue)) return dateValue.slice(0, 16);
    return dateValue;
  };

  const normalizeThemeScheduleStatus = (theme: Theme): Theme => {
    const targetPublishDate = getThemePublishDate(theme);
    if (!targetPublishDate) return theme;

    const normalizedStatus = resolveThemeStatusFromPublishDate(targetPublishDate, theme.status);
    if (normalizedStatus === theme.status && theme.production_assets?.schedule_status === normalizedStatus) {
      return theme;
    }

    return {
      ...theme,
      status: normalizedStatus,
      production_assets: theme.production_assets
        ? {
            ...theme.production_assets,
            schedule_status: normalizedStatus,
          }
        : theme.production_assets,
    };
  };

  const mergeThemes = (localItems: Theme[], remoteItems: Theme[]) => {
    // ☁️ CLOUD-WINS: Start with local as base, then remote fully overwrites.
    // This means cloud data is always authoritative.
    const merged = new Map<string, Theme>();

    // 1. Insert local first (lowest priority)
    localItems.forEach((theme) => {
      const key = getThemeMergeKey(theme);
      if (!key) return;
      merged.set(key, normalizeThemeScheduleStatus(theme));
    });

    // 2. Remote overwrites unconditionally (cloud is authority)
    remoteItems.forEach((theme) => {
      const key = getThemeMergeKey(theme);
      if (!key) return;
      const local = merged.get(key);
      
      // Smart merge production_assets to prevent discarding local execution snapshots/pipelines
      const mergedProductionAssets = (() => {
        const remoteAssets = theme.production_assets;
        const localAssets = local?.production_assets;
        if (!remoteAssets) return localAssets || {};
        if (!localAssets) return remoteAssets || {};
        
        const remoteSnapshot = remoteAssets.execution_snapshot;
        const localSnapshot = localAssets.execution_snapshot;
        
        let mergedSnapshot = remoteSnapshot;
        if (remoteSnapshot && localSnapshot) {
          mergedSnapshot = {
            ...localSnapshot,
            ...remoteSnapshot,
            scriptBlocks: (Array.isArray(remoteSnapshot.scriptBlocks) && remoteSnapshot.scriptBlocks.length > 0)
              ? remoteSnapshot.scriptBlocks
              : (localSnapshot.scriptBlocks || []),
            externalScriptText: remoteSnapshot.externalScriptText || localSnapshot.externalScriptText || '',
            externalSrtText: remoteSnapshot.externalSrtText || localSnapshot.externalSrtText || '',
            externalSrtPipeline: remoteSnapshot.externalSrtPipeline || localSnapshot.externalSrtPipeline || undefined,
            postScriptPackage: remoteSnapshot.postScriptPackage || localSnapshot.postScriptPackage || undefined,
            externalSrtObserver: (Array.isArray(remoteSnapshot.externalSrtObserver) && remoteSnapshot.externalSrtObserver.length > 0)
              ? remoteSnapshot.externalSrtObserver
              : (localSnapshot.externalSrtObserver || []),
          };
        } else if (!remoteSnapshot && localSnapshot) {
          mergedSnapshot = localSnapshot;
        }
        
        const mergedAssets = {
          ...localAssets,
          ...remoteAssets,
          execution_snapshot: mergedSnapshot,
        };
        
        if (mergedAssets._compressed && (Object.keys(remoteAssets).length > 0 || mergedSnapshot)) {
          delete mergedAssets._compressed;
        }
        return mergedAssets;
      })();

      merged.set(
        key,
        normalizeThemeScheduleStatus({
          // Local provides only fields missing from remote
          ...(local || {}),
          // Remote fully overlays
          ...theme,
          // production_assets: smart merged
          production_assets: mergedProductionAssets,
        } as Theme)
      );
    });

    return Array.from(merged.values()).sort((a, b) => {
      const priorityDelta = (Number(b.priority) || 0) - (Number(a.priority) || 0);
      if (priorityDelta !== 0) return priorityDelta;
      return new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime();
    });
  };

  const sanitizeThemeStatusForCloud = (status?: string | null) => {
    const normalized = (status || '').toLowerCase().trim();
    if (['published', 'publicado'].includes(normalized)) return 'published';
    if (['vetted', 'approved', 'aprovado'].includes(normalized)) return 'vetted';
    if (['scripted', 'scheduled', 'programado', 'production', 'producao', 'produção'].includes(normalized)) return 'scripted';
    return 'backlog';
  };

  const sanitizeThemeForCloud = (payload: any) => ({
    id: editingTheme?.id || payload.id || crypto.randomUUID(),
    project_id: payload.project_id || activeProject.id,
    user_id: userId || null,
    title: payload.title || payload.refined_title || 'Tema sem título',
    description: payload.description || '',
    editorial_pillar: payload.editorial_pillar || payload.pipeline_level || '',
    status: sanitizeThemeStatusForCloud(payload.status),
    hook_id: payload.hook_id || null,
    title_structure: payload.title_structure || '',
    priority: Number(payload.priority) || 0,
    notes: payload.notes || '',
    target_publish_date: payload.target_publish_date || null,
    production_assets: payload.production_assets || {},
    created_at: editingTheme?.created_at || payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const sanitizeProjectForCloud = () => ({
    id: activeProject.id,
    name: activeProject.name || activeProject.project_name || 'Canal Recuperado',
    project_name: activeProject.project_name || activeProject.name || 'Canal Recuperado',
    description: activeProject.description || activeProject.puc || activeProject.puc_promise || 'Projeto sincronizado do Banco de Temas.',
    puc: activeProject.puc || activeProject.puc_promise || '',
    puc_promise: activeProject.puc_promise || activeProject.puc || '',
    status: 'active',
    visual_style: activeProject.visual_style || null,
    accent_color: activeProject.accent_color || '#9BB0A5',
    target_persona: activeProject.target_persona || null,
    ai_engine_rules: activeProject.ai_engine_rules || null,
    playlists: activeProject.playlists || null,
    phd_strategy: activeProject.phd_strategy || null,
    persona_matrix: activeProject.persona_matrix || null,
    editorial_line: activeProject.editorial_line || null,
    narrative_voice: activeProject.narrative_voice || null,
    detailed_sop: activeProject.detailed_sop || activeProject.editing_sop || null,
    editing_sop: activeProject.editing_sop || activeProject.detailed_sop || null,
    thumb_strategy: activeProject.thumb_strategy || null,
    metaphor_library: activeProject.metaphor_library || null,
    prohibited_terms: activeProject.prohibited_terms || null,
    base_system_instruction: activeProject.base_system_instruction || null,
    default_execution_mode: activeProject.default_execution_mode || 'internal',
    traceability_summary: activeProject.traceability_summary || [],
    traceability_sources: activeProject.traceability_sources || {},
    user_id: activeProject.user_id || null,
    created_at: activeProject.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  useEffect(() => {
    if (activeProject?.id) {
      fetchThemes();
      fetchTitleStructures();
    }
  }, [activeProject?.id]);

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

  const inferStructureSlot = (value: string, index: number): 'S1' | 'S2' | 'S3' | 'S4' | 'S5' => {
    const normalized = value.toUpperCase();
    if (normalized.includes('S1')) return 'S1';
    if (normalized.includes('S2')) return 'S2';
    if (normalized.includes('S3')) return 'S3';
    if (normalized.includes('S4')) return 'S4';
    if (normalized.includes('S5')) return 'S5';
    return (['S1', 'S2', 'S3', 'S4', 'S5'][index] || 'S1') as 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  };

  const normalizeTitleStructures = (components: any[]): TitleStructureAsset[] => {
    const titleAssets = components
      .filter((component) => component.type === 'Title Structure')
      .map((component, index) => ({
        id: component.id,
        name: component.name || `Estrutura ${index + 1}`,
        pattern: component.content_pattern || component.description || '',
        slotId: inferStructureSlot(`${component.name || ''} ${component.category || ''} ${component.content_pattern || ''}`, index),
        source: 'library' as const,
      }))
      .filter((component) => component.pattern.trim() !== '');

    if (titleAssets.length === 0) {
      return DEFAULT_TITLE_STRUCTURES;
    }

    const mergedBySlot = new Map<string, TitleStructureAsset>();
    DEFAULT_TITLE_STRUCTURES.forEach((fallback) => mergedBySlot.set(fallback.slotId, fallback));
    titleAssets.forEach((asset) => mergedBySlot.set(asset.slotId, asset));

    return ['S1', 'S2', 'S3', 'S4', 'S5'].map((slotId) => mergedBySlot.get(slotId) as TitleStructureAsset);
  };

  const fetchTitleStructures = async () => {
    if (!activeProject?.id) {
      setProjectTitleStructures(DEFAULT_TITLE_STRUCTURES);
      return;
    }

    try {
      let localItems: any[] = [];
      const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed)) {
            localItems = parsed;
          }
        } catch {}
      }

      if (supabase) {
        const { data, error } = await supabase
          .from('narrative_components')
          .select('*')
          .eq('project_id', activeProject.id)
          .order('created_at', { ascending: false });

        if (!error && data) {
          const allComponents = data as any[];
          setAllNarrativeComponents(allComponents);
          const titleOnly = allComponents.filter((component) => component.type === 'Title Structure');
          const merged = mergeNarrativeComponents(localItems, titleOnly);
          const normalized = normalizeTitleStructures(merged);
          setProjectTitleStructures(normalized);
          return;
        }
      }

      setAllNarrativeComponents(localItems);
      setProjectTitleStructures(normalizeTitleStructures(localItems));
    } catch (err) {
      console.warn('Erro ao buscar title structures:', err);
      setProjectTitleStructures(DEFAULT_TITLE_STRUCTURES);
    }
  };

  const fetchThemes = async () => {
    if (!activeProject?.id) return;

    let localThemes: Theme[] = [];
    let hasLocalData = false;

    // 1. INSTANT LOCAL CACHE LOAD (SWR Pattern)
    const localData = localStorage.getItem(`themes_${activeProject.id}`);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localThemes = filterThemesByProjectDomain(parsed.map((t: Theme) => normalizeThemeScheduleStatus(t)), activeProject);
          setThemes(localThemes);
          hasLocalData = true;
          setLoading(false); // ⚡ UNBLOCK UI IMMEDIATELY
        }
      } catch {}
    }

    if (!hasLocalData) {
      setLoading(true); // Only block UI if we absolutely have nothing to show
    }

    // 2. BACKGROUND SYNC
    if (!supabase || !THEME_CLOUD_ID_PATTERN.test(activeProject.id)) {
      if (!hasLocalData) setLoading(false);
      return;
    }

    try {
      const fetchPromise = supabase
        .from('themes')
        .select('*')
        .eq('project_id', activeProject.id)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });

      const timeoutPromise = new Promise((_, reject) => 
        setTimeout(() => reject(new Error('Supabase Timeout')), 8000)
      );

      let data: any = null;
      let error: any = null;

      try {
        const response: any = await Promise.race([fetchPromise, timeoutPromise]);
        data = response.data;
        error = response.error;
      } catch (err) {
        error = err;
      }

      if (error) {
         console.warn('[ThemeBank] Falha ao buscar nuvem (Timeout/Network); mantendo cache local.', error.message);
      } else {
         const rawCloudThemes = (data ?? []).map((t: Theme) => normalizeThemeScheduleStatus(t));
         const cloudThemes = filterThemesByProjectDomain(rawCloudThemes, activeProject);
         const mergedThemes = filterThemesByProjectDomain(mergeThemes(localThemes, cloudThemes), activeProject);
         
         // ⬆️ AUTO-PUSH UNSYNCED OR ENRICHED ITEMS TO CLOUD
         const cloudIds = new Set(cloudThemes.map((c: any) => c.id));
         const unsyncedItems = localThemes.filter(l => {
           if (!l.id) return false;
           // Case A: Theme is not present in the cloud at all
           if (!cloudIds.has(l.id)) return true;
           // Case B: Theme is present, but local has execution_snapshot while remote does not
           const remote = cloudThemes.find((c: Theme) => c.id === l.id);
           const localHasSnapshot = !!l.production_assets?.execution_snapshot;
           const remoteHasSnapshot = !!remote?.production_assets?.execution_snapshot;
           return localHasSnapshot && !remoteHasSnapshot;
         });
         
         if (unsyncedItems.length > 0) {
           console.log(`[ThemeBank] ⬆️ Auto-syncing ${unsyncedItems.length} pending local themes to cloud...`);
           
           const sanitizedForCloud = unsyncedItems.map(item => sanitizeThemeForCloud(item));
           
           supabase.from('themes').upsert(sanitizedForCloud).then(({ error: upsertError }: { error: any }) => {
             if (upsertError) {
               console.warn('⚠️ Falha no auto-sync (Supabase Error):', upsertError.message || upsertError);
             } else {
               console.log('✅ Auto-sync concluído.');
             }
           });
         }

         const mergedStr = JSON.stringify(mergedThemes);
         if (mergedStr !== JSON.stringify(localThemes)) {
           setThemes(mergedThemes);
           console.log(`[ThemeBank] ☁️ Background Sync applied: ${cloudThemes.length} cloud, ${mergedThemes.length} merged`);
           try {
             localStorage.setItem(`themes_${activeProject.id}`, mergedStr);
           } catch (e) {
             console.warn('[ThemeBank] Failed to persist merged themes to localStorage', e);
           }
         }
         // Track which IDs are confirmed in the cloud
         const syncedIds: string[] = [...Array.from(cloudIds) as string[], ...unsyncedItems.filter((u: any) => !cloudIds.has(u.id)).map((u: any) => u.id as string)];
         setCloudSyncedIds(new Set(syncedIds));

         // 🛠️ Auto-heal check for misassigned project themes
         const isRadarProj = (activeProject.name || activeProject.project_name || '').toLowerCase().includes('radar');
         const isFabricaProj = /fabric|fábric/i.test(activeProject.name || activeProject.project_name || '');
         const hasMisassignedThemes = rawCloudThemes.some((t: Theme) => {
           if (isRadarProj && isNavalTitle(t.title, t.description)) return true;
           if (isFabricaProj && isAviationTitle(t.title, t.description)) return true;
           return false;
         });

         if (hasMisassignedThemes && !isReorganizing) {
           console.warn('[ThemeBank] Temas trocados detectados! Executando reorganização automática...');
           setTimeout(() => reorganizeThemesByProject(true), 100);
         }
      }
    } catch (err) {
      console.warn('[ThemeBank] Erro inesperado SWR capturado.', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const selectedStructure = projectTitleStructures.find((structure) => structure.slotId === form.title_structure);
      const titleStructureAssetId = selectedStructure?.source === 'library' ? selectedStructure.id : null;
      const targetPublishDate = form.target_publish_date || '';
      const resolvedStatus = resolveThemeStatusFromPublishDate(targetPublishDate, form.status);
      const existingProductionAssets = (editingTheme as any)?.production_assets || null;
      const productionAssets = targetPublishDate || existingProductionAssets
        ? {
            ...(existingProductionAssets || {}),
            target_publish_date: targetPublishDate || null,
            schedule_status: resolvedStatus,
          }
        : null;
      const payload = {
        id: editingTheme?.id || crypto.randomUUID(),
        title: form.title,
        description: form.description || '',
        editorial_pillar: form.editorial_pillar || '',
        status: resolvedStatus,
        title_structure: form.title_structure || '',
        selected_structure: titleStructureAssetId || form.title_structure || '',
        title_structure_asset_id: titleStructureAssetId,
        pipeline_level: form.pipeline_level || '',
        is_demand_vetted: !!form.is_demand_vetted,
        is_persona_vetted: !!form.is_persona_vetted,
        refined_title: form.refined_title || '',
        priority: Number(form.priority) || 0,
        notes: form.notes || '',
        // 🛠️ Preserva campos de engenharia de cliques se existirem
        match_score: (editingTheme as any)?.match_score || 0,
        demand_views: (editingTheme as any)?.demand_views || '',
        production_assets: productionAssets,
        project_id: activeProject.id,
        user_id: userId || null,
        updated_at: new Date().toISOString(),
        created_at: editingTheme?.created_at || new Date().toISOString(),
      };

      // 💾 1. Local-First Update: Update UI immediately
      console.log("[ContentOS] Salvando tema localmente para destravar UI...");
      saveLocally(payload);
      
      // 🏁 Close form immediately
      closeForm();
      setSaving(false);

      // ☁️ 2. Background Sync (No user wait)
      if (supabase) {
        syncWithCloud(payload);
      }
    } catch (err: any) {
      console.error('❌ Erro crítico no fluxo de salvamento:', err);
      alert(`Falha ao salvar tema: ${err.message || 'Erro desconhecido'}`);
      setSaving(false);
    }
  };

  const syncWithCloud = async (payload: any) => {
    try {
      const cloudTheme = sanitizeThemeForCloud(payload);
      let { error } = editingTheme 
        ? await supabase.from('themes').update(cloudTheme).eq('id', editingTheme.id)
        : await supabase.from('themes').insert(cloudTheme);
      
      if (error && error.code === '23503') {
        console.warn('⚠️ Reparando vínculo de projeto em background...');
        const projectToSync = sanitizeProjectForCloud();

        const { error: projectError } = await supabase.from('projects').upsert(projectToSync);
        if (!projectError) {
          const retry = editingTheme 
            ? await supabase.from('themes').update(cloudTheme).eq('id', editingTheme.id)
            : await supabase.from('themes').insert(cloudTheme);
          error = retry.error;
        }
      }

      if (!error) {
        console.log('✅ Sincronização com nuvem concluída.');
        fetchThemes();
      } else {
        console.warn('⚠️ Falha na sincronização background:', error.message);
      }
    } catch (e) {
      console.error('❌ Falha silenciosa no background sync:', e);
    }
  };

  const saveLocally = (payload: any) => {
    let newComponents = [...themes];
    if (editingTheme) {
      newComponents = themes.map(t => t.id === editingTheme.id ? normalizeThemeScheduleStatus({ ...t, ...payload, id: t.id, created_at: t.created_at }) : t);
    } else {
      newComponents = [normalizeThemeScheduleStatus({ ...payload, id: payload.id || crypto.randomUUID(), created_at: payload.created_at || new Date().toISOString() }), ...themes];
    }
    setThemes(newComponents as Theme[]);
    if (activeProject?.id) {
      try {
        localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(newComponents));
      } catch (e) {
        console.warn('[ThemeBank] Failed to persist themes to localStorage in saveLocally', e);
      }
    }
  };

  const handleDelete = async (id: string) => {
    const themeToDelete = themes.find((item) => item.id === id);
    if (!themeToDelete) return;

    const confirmationMessage = [
      'Voce esta apagando um registro do Banco de Temas.',
      '',
      `Tema: ${themeToDelete.title}`,
      `Projeto: ${activeProject?.name || activeProject?.project_name || 'Projeto ativo'}`,
      `Status atual: ${STATUS_META[themeToDelete.status]?.label || themeToDelete.status}`,
      '',
      'Isto vai remover deste projeto:',
      '- titulo, descricao e notas do tema',
      '- status, pilar, pipeline e estrutura vinculada no Banco de Temas',
      '- o atalho de retorno deste tema para a Escrita Criativa',
      '',
      'Isto nao apaga:',
      '- Biblioteca Narrativa',
      '- DNA/composition logs ja registrados',
      '- metricas e analytics ja salvos',
      '',
      'Deseja apagar definitivamente este registro do Banco de Temas?',
    ].join('\n');

    if (!confirm(confirmationMessage)) return;

    try {
      const updated = themes.filter(t => t.id !== id);
      setThemes(updated);
      if (activeProject?.id) {
        try {
          localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(updated));
        } catch (e) {
          console.warn('[ThemeBank] Failed to persist themes to localStorage in handleDelete', e);
        }
      }

      if (editingTheme?.id === id) {
        closeForm();
      }

      if (!supabase) return;

      let { error, count } = await supabase
        .from('themes')
        .delete({ count: 'exact' })
        .eq('id', id);

      if (!error && !count) {
        const fallbackDelete = await supabase
          .from('themes')
          .delete({ count: 'exact' })
          .eq('project_id', activeProject.id)
          .eq('title', themeToDelete.title)
          .eq('status', themeToDelete.status);

        error = fallbackDelete.error;
      }

      if (error) {
        console.error('Erro ao deletar tema na nuvem:', error);
        alert('O tema foi removido localmente, mas a exclusao na nuvem falhou. Ele pode reaparecer se a sincronizacao remota ainda tiver esse registro.');
        return;
      }

      await fetchThemes();
    } catch (err) {
      console.error('Erro ao deletar tema:', err);
      alert('Nao foi possivel concluir a exclusao deste tema.');
    }
  };

  const hydrateCompressedThemeIfNeeded = async (theme: Theme): Promise<Theme> => {
    if (!theme?.production_assets?._compressed) {
      return theme;
    }

    try {
      console.log(`[ThemeBank] Tema "${theme.title}" está comprimido no cache local. Hidratando a partir da nuvem Supabase...`);
      if (!supabase) throw new Error('Supabase não disponível para hidratação.');
      
      const { data, error } = await supabase
        .from('themes')
        .select('production_assets')
        .eq('id', theme.id)
        .single();
      
      if (error) throw error;
      if (!data || !data.production_assets) {
        throw new Error('Assets não encontrados na nuvem.');
      }

      const hydratedTheme: Theme = {
        ...theme,
        production_assets: data.production_assets
      };

      const updatedThemes = themes.map(t => t.id === theme.id ? hydratedTheme : t);
      setThemes(updatedThemes);
      
      if (activeProject?.id) {
        localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(updatedThemes));
      }

      console.log(`[ThemeBank] Tema "${theme.title}" hidratado com sucesso!`);
      return hydratedTheme;
    } catch (err: any) {
      console.error(`[ThemeBank] Erro ao hidratar tema comprimido:`, err);
      alert(`Aviso: Não foi possível obter os dados completos do tema a partir da nuvem. Detalhes: ${err.message || err}`);
      return theme;
    }
  };

  const openEdit = async (theme: Theme) => {
    const hydratedTheme = await hydrateCompressedThemeIfNeeded(theme);
    setEditingTheme(hydratedTheme);
    setForm({
      title: hydratedTheme.title,
      description: hydratedTheme.description || '',
      editorial_pillar: hydratedTheme.editorial_pillar || '',
      status: hydratedTheme.status,
      title_structure: hydratedTheme.title_structure || '',
      selected_structure: hydratedTheme.selected_structure || '',
      title_structure_asset_id: hydratedTheme.title_structure_asset_id || null,
      pipeline_level: hydratedTheme.pipeline_level || '',
      is_demand_vetted: hydratedTheme.is_demand_vetted || false,
      is_persona_vetted: hydratedTheme.is_persona_vetted || false,
      refined_title: hydratedTheme.refined_title || '',
      priority: hydratedTheme.priority,
      notes: hydratedTheme.notes || '',
      target_publish_date: getThemePublishDate(hydratedTheme),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTheme(null);
    setForm(emptyTheme);
  };

  const isScriptEngineTheme = (theme: Theme) =>
    theme?.production_assets?.source === 'script_engine_manual_approval' ||
    theme?.production_assets?._compressed === true;

  const reopenInWriting = async (theme: Theme) => {
    if (!activeProject?.id) return;

    const hydratedTheme = await hydrateCompressedThemeIfNeeded(theme);
    let executionSnapshot = hydratedTheme?.production_assets?.execution_snapshot;
    if (!executionSnapshot) {
      alert('Este tema ainda nao tem um snapshot da Escrita Criativa para retomar.');
      return;
    }

    // Attempt to load the full snapshot from the dedicated key (if it was stripped to save space)
    try {
      const fullSnapshotRaw = localStorage.getItem(`snapshot_${theme.id}`);
      if (fullSnapshotRaw) {
        const fullSnapshot = JSON.parse(fullSnapshotRaw);
        executionSnapshot = { ...executionSnapshot, ...fullSnapshot };
      }
    } catch (e) {
      console.warn(`[ThemeBank] Failed to load full snapshot for theme ${theme.id}`, e);
    }

    // Read the existing workspace key — it may have the full text content (scriptText, srtText, scriptBlocks)
    // that the themes index now strips for space savings.
    const executionStorageKey = `ws_script_execution_${activeProject.id}`;
    let existingWorkspace: any = null;
    try {
      const existingRaw = localStorage.getItem(executionStorageKey);
      if (existingRaw) existingWorkspace = JSON.parse(existingRaw);
    } catch { /* ignore */ }

    // Prepare the workspace execution state.
    // Detect if title was changed compared to what was originally approved.
    const originalTitle = (executionSnapshot as any)?.approvedTheme || '';
    const titleChanged = originalTitle && originalTitle !== theme.title;

    const workspaceSnapshot = {
      ...executionSnapshot,
      _projectId: activeProject.id,        // 🔑 STAMP DEFINITIVE PROJECT OWNERSHIP
      // Restore large text fields from the existing workspace key (stripped from themes index)
      externalScriptText:  (executionSnapshot as any).externalScriptText  || existingWorkspace?.externalScriptText  || '',
      externalSrtText:     (executionSnapshot as any).externalSrtText     || existingWorkspace?.externalSrtText     || '',
      scriptBlocks: (Array.isArray((executionSnapshot as any).scriptBlocks) && (executionSnapshot as any).scriptBlocks.length > 0)
        ? (executionSnapshot as any).scriptBlocks
        : (existingWorkspace?.scriptBlocks || []),
      approvedTheme: theme.title,          // 🔑 always sync current title
      _themeId: theme.id,                  // 🔑 stable ID to survive title renames
      _pendingTitleUpdate: titleChanged ? theme.title : undefined,
      _originalApprovedTitle: titleChanged ? originalTitle : undefined,
      _isResume: true,                     // 🔑 flag to bypass hydration cleanup of finished themes
      updated_at: new Date().toISOString(),
    };


    if (activeProject?.id && theme.id) {
      sessionStorage.setItem(`active_script_theme_${activeProject.id}`, theme.id);
    }

    // The ScriptEngine's new split-storage logic expects SRT and Post-Script to be in separate keys
    const srtPipelineKey = `${executionStorageKey}_srt_pipeline`;
    const postPackageKey = `${executionStorageKey}_post_package`;

    const { externalSrtPipeline: srtPipeline, postScriptPackage: postPkg, ...compactSnapshot } = workspaceSnapshot as any;

    // Free up space: remove stale dedicated snapshot_ keys for this theme before writing
    try {
      // Clean up any old snapshot_ entries that may be taking up space
      const keysToClean: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('snapshot_') && k !== `snapshot_${theme.id}`) keysToClean.push(k);
      }
      keysToClean.forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore cleanup failures */ }

    // Write large objects independently — failure here is non-blocking.
    // IMPORTANT: if the compact snapshot doesn't have the large object (it was stripped to save space),
    // the dedicated key (_srt_pipeline / _post_package) already exists from persistExecutionSnapshotLocally.
    // We must NOT remove those keys — just check their current presence.
    let hasSrt = false;
    let hasPost = false;

    if (srtPipeline) {
      // Full snapshot had it inline — write it
      try {
        localStorage.setItem(srtPipelineKey, JSON.stringify(srtPipeline));
        hasSrt = true;
      } catch (e) {
        console.warn('[ThemeBank] SRT pipeline too large, skipping.', e);
        localStorage.removeItem(srtPipelineKey);
      }
    } else {
      // Not inline — check if the dedicated key already has data (from a prior persistExecutionSnapshotLocally)
      const existingSrt = localStorage.getItem(srtPipelineKey);
      if (existingSrt) {
        hasSrt = true;  // keep it as-is
      } else if (compactSnapshot._hasSrtPipeline === false) {
        localStorage.removeItem(srtPipelineKey);  // genuinely absent
      }
      // if _hasSrtPipeline is true but key is missing, hasSrt stays false (data lost, nothing we can do)
    }

    if (postPkg) {
      try {
        localStorage.setItem(postPackageKey, JSON.stringify(postPkg));
        hasPost = true;
      } catch (e) {
        console.warn('[ThemeBank] Post-script package too large, skipping.', e);
        localStorage.removeItem(postPackageKey);
      }
    } else {
      const existingPost = localStorage.getItem(postPackageKey);
      if (existingPost) {
        hasPost = true;  // keep it as-is
      } else if (compactSnapshot._hasPostPackage === false) {
        localStorage.removeItem(postPackageKey);  // genuinely absent
      }
    }

    // Write the compact snapshot (small — always works unless localStorage is entirely full)
    try {
      localStorage.setItem(executionStorageKey, JSON.stringify({
        ...compactSnapshot,
        _hasSrtPipeline: hasSrt,
        _hasPostPackage: hasPost,
      }));
    } catch (e) {
      console.warn('[ThemeBank] Failed to push resumed snapshot to workspace.', e);
      alert('Erro ao tentar retomar o roteiro. Pode haver falta de espaco no navegador.');
      return;
    }


    closeForm();
    if (onResumeInWriting) {
      onResumeInWriting();
    } else {
      // Fallback if prop not provided
      onOpenInWriting?.(theme);
    }
  };

  const structureOptions = projectTitleStructures.map((structure) => ({
    value: structure.slotId,
    label: `${structure.slotId} — ${structure.name}`,
  }));

  const normalizedThemes = themes.map((theme) => normalizeThemeScheduleStatus(theme));

  const filtered = normalizedThemes
    .filter(t => !search || t.title.toLowerCase().includes(search.toLowerCase()) || t.description?.toLowerCase().includes(search.toLowerCase()))
    .filter(t => !filterPillar || t.editorial_pillar === filterPillar)
    .filter(t => !filterStatus || t.status === filterStatus);

  // ── DNA COMPOSITION: Build short-code map from narrative library ──────
  const CODE_PREFIX: Record<string, string> = {
    'Hook': 'H',
    'CTA': 'CTA',
    'Title Structure': 'S',
    'Narrative Curve': 'C',
    'Argument Mode': 'AM',
    'Repetition Rule': 'RR',
    'Community': 'COM',
  };

  const narrativeCodeMap: Record<string, { code: string; name: string; type: string }> = {};
  (() => {
    const byType: Record<string, any[]> = {};
    allNarrativeComponents.forEach(c => {
      const type = c.type || 'Unknown';
      if (!byType[type]) byType[type] = [];
      byType[type].push(c);
    });
    Object.entries(byType).forEach(([type, items]) => {
      const prefix = CODE_PREFIX[type] || type.slice(0, 2).toUpperCase();
      items.sort((a: any, b: any) => (a.created_at || '').localeCompare(b.created_at || ''));
      items.forEach((item: any, i: number) => {
        narrativeCodeMap[item.id] = {
          code: `${prefix}${i + 1}`,
          name: item.name || 'Sem nome',
          type,
        };
      });
    });
  })();

  const resolveCode = (id: string | null | undefined) => {
    if (!id) return null;
    return narrativeCodeMap[id] || null;
  };

  // Build DNA rows for the comparison table
  const DNA_COLUMNS = [
    { key: 'pipeline', label: 'Pipeline', color: 'text-blue-400' },
    { key: 'pillar', label: 'Pilar', color: 'text-purple-400' },
    { key: 'hook', label: 'Hook', color: 'text-orange-400' },
    { key: 'cta', label: 'CTA Final', color: 'text-emerald-400' },
    { key: 'ctaMid', label: 'CTA Mid', color: 'text-teal-400' },
    { key: 'structure', label: 'Estrutura', color: 'text-yellow-400' },
    { key: 'curve', label: 'Curva', color: 'text-pink-400' },
    { key: 'argument', label: 'Argumento', color: 'text-cyan-400' },
    { key: 'voice', label: 'Voz', color: 'text-indigo-400' },
    { key: 'blocks', label: 'Blocos', color: 'text-white/50' },
    { key: 'duration', label: 'Estimada', color: 'text-white/50' },
    { key: 'actualDuration', label: 'Real', color: 'text-emerald-300' },
  ] as const;

  const buildDnaRow = (theme: Theme) => {
    const assets = theme.production_assets || {};
    const hook = resolveCode(assets.hook_id);
    const cta = resolveCode(assets.cta_id);
    const ctaMid = resolveCode(assets.execution_snapshot?.approvedBriefing?.assetLog?.ctaMid);
    const structure = resolveCode(assets.title_structure_id);
    const curve = resolveCode(assets.narrative_curve_id);
    const argument = resolveCode(assets.argument_mode_id);

    return {
      pipeline: theme.pipeline_level || assets.pipeline_level || '—',
      pillar: theme.editorial_pillar || assets.editorial_pillar || '—',
      hook: hook ? `${hook.code}` : '—',
      hookName: hook?.name || '',
      cta: cta ? `${cta.code}` : '—',
      ctaName: cta?.name || '',
      ctaMid: ctaMid ? `${ctaMid.code}` : '—',
      ctaMidName: ctaMid?.name || '',
      structure: structure ? `${structure.code}` : (theme.title_structure?.split(' ')[0] || '—'),
      structureName: structure?.name || theme.title_structure || '',
      curve: curve ? `${curve.code}` : '—',
      curveName: curve?.name || '',
      argument: argument ? `${argument.code}` : '—',
      argumentName: argument?.name || '',
      voice: assets.voice_pattern ? assets.voice_pattern.split('-').map((w: string) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') : '—',
      blocks: assets.block_count ? `${assets.block_count}` : '—',
      duration: assets.duration_minutes ? `~${assets.duration_minutes}min` : '—',
      actualDuration: (() => {
        // 1. Check if user manually set the actual duration
        if (assets.actual_duration_minutes) return `${assets.actual_duration_minutes}min`;
        // 2. Try to extract from SRT pipeline (last subtitle end time)
        const srtKey = theme.id ? `ws_script_execution_${theme.id}_srt_pipeline` : '';
        if (srtKey && typeof window !== 'undefined') {
          try {
            const srtRaw = localStorage.getItem(srtKey);
            if (srtRaw) {
              const srtData = JSON.parse(srtRaw);
              const entries = srtData?.entries || srtData?.srt_entries || [];
              if (entries.length > 0) {
                const lastEntry = entries[entries.length - 1];
                const endMs = lastEntry?.end_ms || lastEntry?.endMs || 0;
                if (endMs > 0) return `${Math.round(endMs / 60000)}min`;
              }
            }
          } catch {}
        }
        return '—';
      })(),
      compositionCode: [
        theme.pipeline_level || '',
        hook?.code || '',
        cta?.code || '',
        structure?.code || theme.title_structure?.split(' ')[0] || '',
        curve?.code || '',
        argument?.code || '',
      ].filter(Boolean).join('·') || '—',
    };
  };

  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s] = filtered.filter(t => t.status === s);
    return acc;
  }, {} as Record<string, Theme[]>);

  // ── Reusable DNA Table Renderer ──────────────────────────────────
  const handleActualDurationChange = (themeId: string, value: string) => {
    const numVal = parseInt(value) || 0;
    if (numVal <= 0) return;
    // Update the theme's production_assets locally
    setThemes(prev => prev.map(t => {
      if (t.id !== themeId) return t;
      const updatedAssets = { ...(t.production_assets || {}), actual_duration_minutes: numVal };
      return { ...t, production_assets: updatedAssets };
    }));
    // Persist to localStorage
    const localKey = `themes_${activeProject?.id}`;
    try {
      const stored = JSON.parse(localStorage.getItem(localKey) || '[]');
      const updated = stored.map((t: any) => {
        if (t.id !== themeId) return t;
        return { ...t, production_assets: { ...(t.production_assets || {}), actual_duration_minutes: numVal } };
      });
      localStorage.setItem(localKey, JSON.stringify(updated));
    } catch {}
    // Background cloud sync
    if (supabase) {
      supabase.from('themes').select('production_assets').eq('id', themeId).single()
        .then(({ data }: { data: any }) => {
          const merged = { ...(data?.production_assets || {}), actual_duration_minutes: numVal };
          supabase.from('themes').update({ production_assets: merged }).eq('id', themeId).then(() => {});
        });
    }
  };

  const renderDnaTable = (fullscreen: boolean) => {
    const fontSize = fullscreen ? 'text-[11px]' : 'text-[9px]';
    const headerFontSize = fullscreen ? 'text-[10px]' : 'text-[9px]';
    const cellPadding = fullscreen ? 'px-3 py-3' : 'px-2 py-2';
    const headerPadding = fullscreen ? 'px-3 py-3' : 'px-2 py-2.5';
    const minWidth = fullscreen ? 'min-w-[1200px]' : 'min-w-[900px]';
    const titleMinWidth = fullscreen ? 'min-w-[280px]' : 'min-w-[180px]';
    const bgBase = fullscreen ? 'bg-midnight' : 'bg-midnight/95';

    return (
      <div className={`${fullscreen ? '' : 'mt-3'} rounded-2xl border border-white/5 bg-white/[0.015] overflow-hidden`}>
        <div className="overflow-x-auto no-scrollbar">
          <table className={`w-full ${fontSize} border-collapse ${minWidth}`}>
            <thead>
              <tr className="border-b border-white/5">
                <th className={`sticky left-0 z-10 ${bgBase} backdrop-blur-sm ${headerPadding} text-left text-white/40 font-black uppercase tracking-widest ${titleMinWidth} ${headerFontSize}`}>
                  Tema
                </th>
                <th className={`${headerPadding} text-center text-white/20 font-black uppercase tracking-widest whitespace-nowrap ${headerFontSize}`}>
                  Código
                </th>
                {DNA_COLUMNS.map(col => (
                  <th key={col.key} className={`${headerPadding} text-center font-black uppercase tracking-widest whitespace-nowrap ${col.color} opacity-70 ${headerFontSize}`}>
                    {col.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {normalizedThemes
                .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime())
                .map((theme) => {
                  const dna = buildDnaRow(theme);
                  const hasComposition = theme.production_assets?.hook_id || theme.production_assets?.cta_id;
                  const statusMeta = STATUS_META[theme.status] || STATUS_META.backlog;

                  return (
                    <tr key={theme.id} className="border-b border-white/[0.03] hover:bg-white/[0.03] transition-colors">
                      {/* Theme title — sticky */}
                      <td className={`sticky left-0 z-10 ${bgBase} backdrop-blur-sm ${cellPadding} max-w-[280px]`}>
                        <p className={`text-white/80 font-bold ${fullscreen ? '' : 'truncate'} leading-tight`} title={theme.title}>
                          {theme.title}
                        </p>
                        <span className={`inline-block mt-0.5 px-1.5 py-0.5 rounded text-[7px] font-black uppercase tracking-widest border ${statusMeta.color}`}>
                          {statusMeta.label}
                        </span>
                      </td>

                      {/* Composition code */}
                      <td className={`${cellPadding} text-center`}>
                        {hasComposition ? (
                          <span className={`px-2 py-1 rounded-md bg-purple-500/10 border border-purple-500/20 text-purple-300 font-mono font-black ${fullscreen ? 'text-[9px]' : 'text-[8px]'} whitespace-nowrap`}>
                            {dna.compositionCode}
                          </span>
                        ) : (
                          <span className="text-white/15 italic">—</span>
                        )}
                      </td>

                      {/* Dynamic columns */}
                      {DNA_COLUMNS.map(col => {
                        const val = dna[col.key as keyof typeof dna] || '—';
                        const nameKey = `${col.key}Name` as keyof typeof dna;
                        const fullName = dna[nameKey] || '';
                        const isNone = val === '—';

                        // Special: editable input for actualDuration (always editable)
                        if (col.key === 'actualDuration') {
                          const currentMinutes = theme.production_assets?.actual_duration_minutes || 0;
                          return (
                            <td key={col.key} className={`${cellPadding} text-center`}>
                              <input
                                type="number"
                                placeholder="min"
                                defaultValue={currentMinutes > 0 ? currentMinutes : ''}
                                min={1}
                                max={999}
                                title={currentMinutes > 0 ? `${currentMinutes}min — clique para corrigir` : 'Duração real em minutos'}
                                className={`w-14 bg-white/5 border border-white/10 rounded px-1 py-0.5 text-center ${fontSize} text-emerald-300 placeholder-white/15 outline-none focus:border-emerald-400/40 font-bold [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none`}
                                onBlur={(e) => { if (e.target.value) handleActualDurationChange(theme.id, e.target.value); }}
                                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                              />
                            </td>
                          );
                        }

                        return (
                          <td key={col.key} className={`${cellPadding} text-center`} title={fullName ? `${val} — ${fullName}` : ''}>
                            {isNone ? (
                              <span className="text-white/10">—</span>
                            ) : (
                              <span className={`font-black ${col.color}`}>
                                {val}
                              </span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>

        {/* Legend */}
        <div className={`${fullscreen ? 'px-6 py-3' : 'px-4 py-2.5'} border-t border-white/[0.03] flex flex-wrap gap-x-4 gap-y-1`}>
          {Object.entries(CODE_PREFIX).map(([type, prefix]) => {
            const count = allNarrativeComponents.filter(c => c.type === type).length;
            if (count === 0) return null;
            const colDef = DNA_COLUMNS.find(c =>
              (type === 'Hook' && c.key === 'hook') ||
              (type === 'CTA' && c.key === 'cta') ||
              (type === 'Title Structure' && c.key === 'structure') ||
              (type === 'Narrative Curve' && c.key === 'curve') ||
              (type === 'Argument Mode' && c.key === 'argument')
            );
            return (
              <span key={type} className={`${fullscreen ? 'text-[9px]' : 'text-[8px]'} font-black uppercase tracking-widest ${colDef?.color || 'text-white/30'}`}>
                {prefix}1-{prefix}{count}: {type} ({count})
              </span>
            );
          })}
        </div>
      </div>
    );
  };

  if (!activeProject) {
    return (
      <div className="flex-1 flex items-center justify-center h-full">
        <div className="text-center space-y-3 opacity-40">
          <Lightbulb size={40} className="mx-auto" />
          <p className="text-[10px] uppercase tracking-widest font-black">Selecione um projeto</p>
        </div>
      </div>
    );
  }

  if (workspace === 'briefing') {
    return (
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center">
              <Lightbulb className="text-blue-400" size={18} />
            </div>
            <div>
              <h2 className="font-black text-white italic text-sm uppercase tracking-widest text-shadow-sm">Banco de Temas</h2>
              <p className="text-white/30 text-[10px] uppercase tracking-widest font-black">Briefing Estratégico · {activeProject.name}</p>
            </div>
          </div>
          <button
            onClick={() => setWorkspace('fila')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 font-black text-[10px] uppercase tracking-widest hover:bg-blue-500/20 hover:text-white transition-all"
          >
            Voltar para fila
          </button>
        </div>

        <div className="px-8 pt-4">
          <div className="rounded-2xl border border-blue-500/15 bg-blue-500/5 px-4 py-3">
            <p className="text-[10px] uppercase tracking-widest font-black text-blue-400 mb-1">Diretriz Estratégica</p>
            <p className="text-[10px] text-white/40 leading-relaxed">
              Selecione temas com alta densidade de retenção, conecte o DNA narrativo e prepare a base para a Escrita Criativa.
            </p>
          </div>
        </div>

        <div className="px-8 pt-5 pb-4 border-b border-white/5">
          <div className="grid grid-cols-3 gap-3">
            {[
              { step: '1', title: 'Escolher tema', desc: 'Use um tema da fila com boa chance de virar pauta.' },
              { step: '2', title: 'Definir DNA', desc: 'Junte estrutura, hook e ativos da biblioteca narrativa.' },
              { step: '3', title: 'Gerar briefing', desc: 'Saia com o pacote pronto para escrever o roteiro.' },
            ].map(item => (
              <div key={item.step} className="p-4 rounded-2xl border border-white/5 bg-white/[0.02]">
                <div className="flex items-center gap-3 mb-2">
                  <span className="w-7 h-7 rounded-lg bg-sage/10 border border-sage/20 text-sage text-[10px] font-black flex items-center justify-center">
                    {item.step}
                  </span>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-white">{item.title}</h3>
                </div>
                <p className="text-[10px] text-white/30 leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-hidden">
          <ContentHub
            activeProject={activeProject}
            selectedAIConfig={selectedAIConfig}
            onGerarRoteiro={onGerarRoteiro}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-blue-500/10 border border-blue-500/20 rounded-xl flex items-center justify-center shadow-lg shadow-blue-900/10">
            <Lightbulb className="text-blue-400" size={18} />
          </div>
          <div>
            <h2 className="font-black text-white italic text-sm uppercase tracking-widest text-shadow-sm">Banco de Temas</h2>
            <p className="text-white/30 text-[10px] uppercase tracking-widest font-black">{activeProject.name} · {themes.length} ideias</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => reorganizeThemesByProject(false)}
            disabled={isReorganizing}
            className="flex items-center gap-2 px-3 py-2 bg-amber-500/10 border border-amber-500/20 rounded-xl text-amber-300 font-black text-[10px] uppercase tracking-widest hover:bg-amber-500/20 hover:text-white transition-all disabled:opacity-50"
            title="Reorganizar e mover temas para os projetos corretos (Radar Explicado / Fábrica Y) com base no conteúdo"
          >
            <RotateCcw size={12} className={isReorganizing ? "animate-spin" : ""} />
            {isReorganizing ? 'Organizando...' : 'Organizar Temas'}
          </button>
          <button
            onClick={() => setWorkspace('briefing')}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 font-black text-[10px] uppercase tracking-widest hover:bg-blue-500/20 hover:text-white transition-all"
          >
            Criar briefing
          </button>
          <button
            onClick={() => setShowForm(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-blue-400 shadow-lg shadow-blue-500/25 transition-all"
          >
            <Plus size={12} /> Nova Ideia
          </button>
        </div>
      </div>

      <div className="px-8 pt-4">
        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-3">
          <p className="text-[10px] uppercase tracking-widest font-black text-white/40 mb-1">O que fazer agora</p>
          <p className="text-[10px] text-white/35 leading-relaxed">
            Cadastre ou encontre um tema, acompanhe o status e mova para o briefing quando a ideia estiver madura.
          </p>
          <p className="text-[10px] text-white/25 leading-relaxed mt-2">
            Saída esperada: tema organizado, com prioridade, pilar e base pronta para qualificação.
          </p>
        </div>
      </div>

      {/* Stats Dashboard */}
      <div className="px-8 py-4 border-b border-white/5 flex gap-4 overflow-x-auto no-scrollbar">
        {STATUSES.map(s => {
          const count = normalizedThemes.filter(t => t.status === s).length;
          const meta = STATUS_META[s];
          const Icon = meta.icon;
          return (
            <div key={s} className="flex-1 min-w-[120px] p-4 bg-white/[0.02] border border-white/5 rounded-2xl flex flex-col gap-1">
              <div className="flex items-center gap-2">
                <Icon size={12} className={meta.color.split(' ')[0]} />
                <span className="text-[9px] font-black uppercase tracking-widest text-white/40">{meta.label}</span>
              </div>
              <span className="text-xl font-black text-white">{count}</span>
            </div>
          );
        })}
      </div>

      {/* Filters */}
      <div className="px-8 py-3 border-b border-white/5 flex items-center gap-3 flex-shrink-0">
        <div className="relative flex-1 max-w-xs">
          <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar tema..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pl-8 pr-3 py-2 text-[10px] text-white placeholder-white/20 uppercase tracking-widest font-black outline-none focus:border-sage/40"
          />
        </div>
        <CustomSelect
          value={filterPillar}
          onChange={setFilterPillar}
          options={currentPillarOptions}
          placeholder="Todos os Pilares"
          className="min-w-[160px]"
        />
        <CustomSelect
          value={filterStatus}
          onChange={setFilterStatus}
          options={STATUS_OPTIONS}
          placeholder="Todos os Status"
          className="min-w-[160px]"
        />
      </div>

      {/* ── DNA DA COMPOSIÇÃO: Tabela Comparativa ────────────────────── */}
      {normalizedThemes.length > 0 && (
        <div className="px-8 pt-3">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowDnaTable(!showDnaTable)}
              className="flex-1 flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border border-white/5 bg-white/[0.02] hover:bg-white/[0.04] transition-all group"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                  <BarChart3 size={14} className="text-purple-400" />
                </div>
                <div className="text-left">
                  <p className="text-[10px] font-black uppercase tracking-widest text-white/70">DNA da Composição</p>
                  <p className="text-[9px] text-white/30 mt-0.5">
                    {normalizedThemes.filter(t => t.production_assets?.hook_id).length} temas com composição registrada
                  </p>
                </div>
              </div>
              <ChevronDown size={14} className={`text-white/30 transition-transform duration-300 ${showDnaTable ? 'rotate-180' : ''}`} />
            </button>
            <button
              onClick={() => setShowDnaFullscreen(true)}
              title="Abrir em tela cheia"
              className="flex items-center justify-center w-10 h-10 rounded-xl border border-purple-500/20 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 hover:text-purple-300 transition-all"
            >
              <Maximize2 size={14} />
            </button>
          </div>

          {showDnaTable && renderDnaTable(false)}
        </div>
      )}

      {/* ── DNA FULLSCREEN MODAL ────────────────────────────────────── */}
      {showDnaFullscreen && (
        <div className="fixed inset-0 z-[9999] bg-midnight/98 backdrop-blur-xl flex flex-col overflow-hidden">
          {/* Fullscreen Header */}
          <div className="flex items-center justify-between px-8 py-5 border-b border-white/5 flex-shrink-0">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center">
                <BarChart3 size={18} className="text-purple-400" />
              </div>
              <div>
                <h2 className="font-black text-white italic text-sm uppercase tracking-widest">DNA da Composição</h2>
                <p className="text-white/30 text-[10px] uppercase tracking-widest font-black">
                  {activeProject?.name} · {normalizedThemes.length} temas · {normalizedThemes.filter(t => t.production_assets?.hook_id).length} com composição
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowDnaFullscreen(false)}
              className="flex items-center gap-2 px-4 py-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white transition-all text-[10px] font-black uppercase tracking-widest"
            >
              <X size={14} /> Fechar
            </button>
          </div>

          {/* Fullscreen Table */}
          <div className="flex-1 overflow-auto px-6 py-4">
            {renderDnaTable(true)}
          </div>
        </div>
      )}

      {/* Collapsible Accordion Board */}
      <div className="flex-1 overflow-y-auto px-8 py-6 space-y-4">
        {STATUSES.map(status => {
          const meta = STATUS_META[status];
          const Icon = meta.icon;
          const items = byStatus[status] || [];
          const isExpanded = expandedStatuses.includes(status);
          const currentSort = sortConfigs[status] || 'priority';

          const sortedItems = [...items].sort((a, b) => {
            if (currentSort === 'priority') {
              return (b.priority || 0) - (a.priority || 0);
            }
            if (currentSort === 'date_asc') {
               const getD = (t: any) => new Date(t.created_at || 0).getTime();
               return getD(a) - getD(b);
            }
            if (currentSort === 'date_desc') {
               const getD = (t: any) => new Date(t.created_at || 0).getTime();
               return getD(b) - getD(a);
            }
            return 0;
          });

          return (
            <div key={status} className="flex flex-col gap-3">
              {/* Accordion Header */}
              <div 
                onClick={() => toggleStatus(status)}
                className={`flex items-center gap-2 px-4 py-3 rounded-xl border cursor-pointer hover:brightness-110 transition-all ${meta.color} bg-opacity-50 select-none`}
              >
                <Icon size={14} />
                <span className="text-[11px] font-black uppercase tracking-widest">{meta.label}</span>
                <span className="ml-auto text-[11px] font-bold opacity-80">{items.length}</span>
                
                {/* Expand Icon */}
                <div className="ml-4 pl-4 border-l border-white/10 text-white/50 flex items-center justify-center">
                  <ChevronRight size={16} className={`transition-transform duration-300 ${isExpanded ? 'rotate-90' : ''}`} />
                </div>
              </div>

              {/* Accordion Content */}
              {isExpanded && (
                <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-6">
                  {/* Sorting Controls */}
                  {items.length > 0 && (
                    <div className="flex justify-end mb-4">
                      <div className="flex items-center gap-2">
                        <span className="text-[9px] font-black uppercase tracking-widest text-white/40">Ordenar por:</span>
                        <CustomSelect
                          value={currentSort}
                          onChange={(val) => setSortConfigs(prev => ({...prev, [status]: val as any}))}
                          options={[
                            { value: 'priority', label: 'Prioridade' },
                            { value: 'date_desc', label: 'Mais Recentes' },
                            { value: 'date_asc', label: 'Mais Antigos' },
                          ]}
                          className="min-w-[140px]"
                        />
                      </div>
                    </div>
                  )}

                  {/* Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-4">
                    {sortedItems.map(theme => {
                      const targetPublishDate = getThemePublishDate(theme);

                      return (
                        <div key={theme.id} onClick={(e) => { e.stopPropagation(); openEdit(theme); }} className="glass-card p-4 space-y-3 flex flex-col group cursor-pointer hover:border-sage/40 transition-all">
                          <div className="flex items-start justify-between gap-2">
                            <p className="font-black text-white text-[12px] leading-tight group-hover:text-amber-100 transition-colors">{theme.title}</p>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                              {isScriptEngineTheme(theme) && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); reopenInWriting(theme); }}
                                  className="p-1.5 rounded-lg hover:bg-sage/20 text-white/40 hover:text-sage transition-all"
                                  title="Retomar na Escrita Criativa"
                                >
                                  <FileText size={12} />
                                </button>
                              )}
                              {onConsultarConselho && (
                                <button
                                  onClick={(e) => { e.stopPropagation(); onConsultarConselho(theme); }}
                                  className="p-1.5 rounded-lg hover:bg-blue-500/20 text-white/40 hover:text-blue-400 transition-all"
                                  title="Consultar Conselho de IA"
                                >
                                  <Users size={12} />
                                </button>
                              )}
                              <button onClick={(e) => { e.stopPropagation(); openEdit(theme); }} className="p-1.5 rounded-lg hover:bg-white/10 text-white/40 hover:text-white transition-all">
                                <Edit3 size={12} />
                              </button>
                              <button onClick={(e) => { e.stopPropagation(); handleDelete(theme.id); }} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all">
                                <Trash2 size={12} />
                              </button>
                            </div>
                          </div>
                          
                          {theme.description && (
                            <p className="text-white/40 text-[11px] leading-relaxed line-clamp-3 group-hover:text-white/60 transition-colors">{theme.description}</p>
                          )}
                          
                          <div className="flex flex-wrap items-center gap-1.5 mt-auto pt-2">
                            {theme.editorial_pillar && (
                              <span className="px-2 py-0.5 bg-sage/10 border border-sage/20 rounded text-sage text-[9px] font-black uppercase tracking-widest">
                                {theme.editorial_pillar}
                              </span>
                            )}
                            {theme.pipeline_level && (
                              <span className="px-2 py-0.5 bg-blue-500/10 border border-blue-500/20 rounded text-blue-400 text-[9px] font-black uppercase tracking-widest">
                                {theme.pipeline_level.split(' ')[0]}
                              </span>
                            )}
                            {theme.title_structure && (
                              <span className="px-2 py-0.5 bg-white/5 border border-white/10 rounded text-white/30 text-[9px] font-black uppercase tracking-widest">
                                {theme.title_structure.split(' ')[0]}
                              </span>
                            )}
                            {targetPublishDate && (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/20 rounded text-amber-200 text-[9px] font-black uppercase tracking-widest">
                                <Clock size={9} /> {formatPublishDate(targetPublishDate)}
                              </span>
                            )}
                            {isScriptEngineTheme(theme) && (
                              <span className="px-2 py-0.5 bg-sage/10 border border-sage/20 rounded text-sage text-[9px] font-black uppercase tracking-widest">
                                Retomável
                              </span>
                            )}
                            {(theme.is_demand_vetted && theme.is_persona_vetted) && (
                              <span className="ml-auto text-blue-400" title="Validação Estratégica Completa">
                                <CheckCircle2 size={12} />
                              </span>
                            )}
                            {cloudSyncedIds.size > 0 && (
                              cloudSyncedIds.has(theme.id) ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-500/10 border border-emerald-500/20 rounded text-emerald-400 text-[9px] font-black uppercase tracking-widest" title="Sincronizado com a nuvem">
                                  <Cloud size={10} /> Sync
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-500/10 border border-amber-500/30 rounded text-amber-400 text-[9px] font-black uppercase tracking-widest animate-pulse" title="Apenas local — aguardando sincronização">
                                  <CloudOff size={10} /> Local
                                </span>
                              )
                            )}
                          </div>
                          {isScriptEngineTheme(theme) && (
                            <div className="flex items-center gap-2 pt-2 mt-2 border-t border-white/5">
                              <FileText size={10} className="text-sage/70" />
                              <p className="text-[9px] text-sage/70 font-black uppercase tracking-widest">
                                Retomar na Escrita Criativa
                              </p>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                  
                  {items.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-8 opacity-40">
                      <Icon size={24} className="mb-3 text-white/30" />
                      <p className="text-[11px] font-black uppercase tracking-widest text-white/50">Nenhum tema nesta etapa</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Form Modal */}
      {showForm && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight/90 backdrop-blur-xl p-4">
          <div className="glass-card w-full max-w-lg p-8 space-y-6">
            <div className="flex items-center justify-between">
              <h3 className="font-black text-white italic text-sm uppercase tracking-widest">
                {editingTheme ? 'Editar Tema' : 'Nova Ideia'}
              </h3>
              <div className="flex items-center gap-2">
                {editingTheme && isScriptEngineTheme(editingTheme) && (
                  <button
                    onClick={() => reopenInWriting(editingTheme)}
                    className="px-3 py-2 bg-blue-500/10 border border-blue-500/20 rounded-xl text-blue-300 text-[10px] font-black uppercase tracking-widest hover:bg-blue-500/20 hover:text-white transition-all"
                  >
                    Voltar para Escrita
                  </button>
                )}
                <button onClick={closeForm} className="text-white/30 hover:text-white transition-all text-lg">✕</button>
              </div>
            </div>

            <div className="space-y-4 max-h-[60vh] overflow-y-auto pr-2 no-scrollbar">
              <div className="grid grid-cols-2 gap-3">
                <div className="col-span-2">
                  {(() => {
                    const isLocked = editingTheme && (editingTheme.status === 'published' || editingTheme.status === 'scheduled');
                    return (
                      <>
                        <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 flex items-center gap-1">
                          Título do Tema *
                          {isLocked && <span title="Tema publicado ou programado: título bloqueado para evitar inconsistência nos assets já gerados." className="text-amber-400 cursor-help">🔒</span>}
                        </label>
                        <input
                          value={form.title}
                          onChange={e => !isLocked && setForm(f => ({ ...f, title: e.target.value }))}
                          readOnly={!!isLocked}
                          placeholder="Ex: Por que 80% das pessoas falham em..."
                          className={`w-full bg-white/5 border rounded-xl px-4 py-3 text-[11px] placeholder-white/20 outline-none font-bold ${
                            isLocked
                              ? 'border-amber-500/20 text-white/40 cursor-not-allowed'
                              : 'border-white/10 text-white focus:border-sage/40'
                          }`}
                        />
                        {isLocked && (
                          <p className="text-[9px] text-amber-400/60 mt-1">Tema {editingTheme.status === 'published' ? 'publicado' : 'programado'}: título bloqueado. Edição só disponível em Produção.</p>
                        )}
                      </>
                    );
                  })()}
                </div>
                <div className="col-span-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Descrição / Ângulo</label>
                  <textarea
                    value={form.description}
                    onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                    placeholder="Qual o ângulo estratégico desta ideia?"
                    rows={2}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white placeholder-white/20 outline-none focus:border-sage/40 font-bold resize-none"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Pilar Editorial</label>
                  <CustomSelect
                    value={form.editorial_pillar || ''}
                    onChange={val => setForm(f => ({ ...f, editorial_pillar: val }))}
                    options={currentPillarOptions}
                    placeholder="Selecionar"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Pipeline de Deploy</label>
                  <CustomSelect
                    value={form.pipeline_level || ''}
                    onChange={val => setForm(f => ({ ...f, pipeline_level: val }))}
                    options={PIPELINE_OPTIONS}
                    placeholder="Selecionar T1-T3"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Estrutura de Título</label>
                  <CustomSelect
                    value={form.title_structure || ''}
                    onChange={val => setForm(f => ({ ...f, title_structure: val }))}
                    options={structureOptions}
                    placeholder="Selecionar estrutura do projeto"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Status</label>
                  <CustomSelect
                    value={form.status}
                    onChange={val => setForm(f => ({ ...f, status: val as any }))}
                    options={STATUS_OPTIONS}
                  />
                </div>
              </div>

              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_1.4fr] gap-3 items-end">
                  <div>
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300 mb-1 block">Data e horario de postagem</label>
                    <input
                      type="datetime-local"
                      value={toDateTimeInputValue(form.target_publish_date || '')}
                      onChange={(e) => {
                        const dateValue = e.target.value;
                        setForm(f => ({
                          ...f,
                          target_publish_date: dateValue,
                          status: resolveThemeStatusFromPublishDate(dateValue, f.status),
                        }));
                      }}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-blue-400/40 font-bold"
                    />
                  </div>
                  <p className="text-[10px] leading-relaxed text-white/35">
                    Com horario, passado vira Publicado e futuro vira Programado. Sem horario, vale a regra por dia.
                  </p>
                </div>
              </div>

              {form.title_structure && (
                <div className="p-4 bg-sage/5 border border-sage/20 rounded-xl space-y-2 animate-in slide-in-from-top-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-sage block">Refatoração de Título (Fusion)</label>
                  <input
                    value={form.refined_title || ''}
                    onChange={e => setForm(f => ({ ...f, refined_title: e.target.value }))}
                    placeholder="Aplique a estrutura S ao seu tema..."
                    className="w-full bg-transparent border-b border-sage/20 py-2 text-[11px] text-white italic placeholder-white/20 outline-none focus:border-sage/40 font-bold"
                  />
                </div>
              )}

              {/* Validation Checkpoints */}
              <div className="p-4 bg-white/[0.02] border border-white/5 rounded-xl space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-white/40 block">Validação Estratégica</label>
                <div className="flex gap-4">
                  <button
                    onClick={() => setForm(f => ({ ...f, is_demand_vetted: !f.is_demand_vetted }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${form.is_demand_vetted ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-white/30'}`}
                  >
                    <CheckCircle2 size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Demanda (YT)</span>
                  </button>
                  <button
                    onClick={() => setForm(f => ({ ...f, is_persona_vetted: !f.is_persona_vetted }))}
                    className={`flex-1 flex items-center justify-center gap-2 p-3 rounded-lg border transition-all ${form.is_persona_vetted ? 'bg-blue-500/10 border-blue-500/40 text-blue-400' : 'bg-white/5 border-white/10 text-white/30'}`}
                  >
                    <CheckCircle2 size={12} />
                    <span className="text-[9px] font-black uppercase tracking-widest">Persona Match</span>
                  </button>
                </div>
                {form.is_demand_vetted && form.is_persona_vetted && (
                  <p className="text-[8px] text-blue-400 font-black uppercase tracking-widest text-center animate-pulse">✨ Pronto para aprovação estratégica</p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Prioridade (0-10)</label>
                  <input
                    type="number"
                    value={form.priority}
                    min={0} max={10}
                    onChange={e => setForm(f => ({ ...f, priority: parseInt(e.target.value) || 0 }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-sage/40 font-bold"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Notas Internas</label>
                  <textarea
                    value={form.notes}
                    onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
                    placeholder="Refs, insights..."
                    rows={1}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white placeholder-white/20 outline-none focus:border-sage/40 font-bold resize-none"
                  />
                </div>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button onClick={closeForm} className="flex-1 py-3 bg-white/5 border border-white/10 rounded-xl text-white/40 text-[10px] font-black uppercase tracking-widest hover:bg-white/10 transition-all">
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !form.title.trim()}
                className="flex-1 py-3 bg-blue-500 text-white rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-blue-400 shadow-lg shadow-blue-500/20 transition-all disabled:opacity-40"
              >
                {saving ? 'Salvando...' : editingTheme ? 'Atualizar' : 'Criar Tema'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
