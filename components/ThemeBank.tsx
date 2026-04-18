'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject } from '@/lib/store/projectStore';
import CustomSelect from './ui/CustomSelect';
import ContentHub from './ContentHub';
import {
  Lightbulb,
  Plus,
  Search,
  Filter,
  ChevronRight,
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
  onGerarRoteiro?: (data: any) => void;
  onOpenInWriting?: (theme: any) => void;
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

export default function ThemeBank({ activeProject: propProject, userId, selectedAIConfig, onGerarRoteiro, onOpenInWriting }: ThemeBankProps) {
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
    const merged = new Map<string, Theme>();

    const upsert = (theme: Theme) => {
      const key = getThemeMergeKey(theme);
      if (!key) return;
      const current = merged.get(key);
      merged.set(
        key,
        normalizeThemeScheduleStatus({
          ...(current || {}),
          ...theme,
          production_assets: theme.production_assets ?? current?.production_assets,
        } as Theme)
      );
    };

    remoteItems.forEach(upsert);
    localItems.forEach(upsert);

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
    project_id: activeProject.id,
    user_id: userId || null,
    title: payload.title || payload.refined_title || 'Tema sem título',
    description: payload.description || '',
    editorial_pillar: payload.editorial_pillar || payload.pipeline_level || '',
    status: sanitizeThemeStatusForCloud(payload.status),
    hook_id: payload.hook_id || null,
    title_structure: payload.title_structure || '',
    priority: Number(payload.priority) || 0,
    notes: payload.notes || '',
    created_at: editingTheme?.created_at || payload.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const sanitizeProjectForCloud = () => ({
    id: activeProject.id,
    name: activeProject.name || activeProject.project_name || 'Canal Recuperado',
    description: activeProject.description || activeProject.puc || activeProject.puc_promise || 'Projeto sincronizado do Banco de Temas.',
    puc: activeProject.puc || activeProject.puc_promise || '',
    status: 'active',
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
          const titleOnly = (data as any[]).filter((component) => component.type === 'Title Structure');
          const merged = mergeNarrativeComponents(localItems, titleOnly);
          const normalized = normalizeTitleStructures(merged);
          setProjectTitleStructures(normalized);
          localStorage.setItem(`ws_narrative_${activeProject.id}`, JSON.stringify(merged));
          return;
        }
      }

      setProjectTitleStructures(normalizeTitleStructures(localItems));
    } catch (err) {
      console.warn('Erro ao buscar title structures:', err);
      setProjectTitleStructures(DEFAULT_TITLE_STRUCTURES);
    }
  };

  const fetchThemes = async () => {
      if (!activeProject?.id) return;
      setLoading(true);
      try {
      let localThemes: Theme[] = [];
      // 1. Carregar local primeiro para UI imediata
      const localData = localStorage.getItem(`themes_${activeProject.id}`);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.length > 0) {
          localThemes = parsed.map((theme: Theme) => normalizeThemeScheduleStatus(theme));
          setThemes(localThemes);
          localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(localThemes));
        }
      }

      if (!supabase) return;
      if (!THEME_CLOUD_ID_PATTERN.test(activeProject.id)) {
        return;
      }

      // 2. Buscar na nuvem
      const { data, error } = await supabase
        .from('themes')
        .select('*')
        .eq('project_id', activeProject.id)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      
      // 🛠️ Proteção: Só sobrescreve o local se a nuvem realmente tiver dados.
      // Se a nuvem estiver vazia mas o local tiver dados, mantemos o local.
        if (data) {
          const normalizedRemote = data.map((theme: Theme) => normalizeThemeScheduleStatus(theme));
          const mergedThemes = mergeThemes(localThemes, normalizedRemote);
          setThemes(mergedThemes);
          localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(mergedThemes));
        }
      } catch (err) {
        console.warn('[ThemeBank] falha ao buscar temas; mantendo dados locais.', err);
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
      newComponents = [normalizeThemeScheduleStatus({ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }), ...themes];
    }
    setThemes(newComponents as Theme[]);
    localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(newComponents));
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
      localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(updated));

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

  const openEdit = (theme: Theme) => {
    setEditingTheme(theme);
    setForm({
      title: theme.title,
      description: theme.description || '',
      editorial_pillar: theme.editorial_pillar || '',
      status: theme.status,
      title_structure: theme.title_structure || '',
      selected_structure: theme.selected_structure || '',
      title_structure_asset_id: theme.title_structure_asset_id || null,
      pipeline_level: theme.pipeline_level || '',
      is_demand_vetted: theme.is_demand_vetted || false,
      is_persona_vetted: theme.is_persona_vetted || false,
      refined_title: theme.refined_title || '',
      priority: theme.priority,
      notes: theme.notes || '',
      target_publish_date: getThemePublishDate(theme),
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTheme(null);
    setForm(emptyTheme);
  };

  const isScriptEngineTheme = (theme: Theme) =>
    theme?.production_assets?.source === 'script_engine_manual_approval';

  const reopenInWriting = (theme: Theme) => {
    if (!activeProject?.id) return;

    const executionSnapshot = theme?.production_assets?.execution_snapshot;
    if (!executionSnapshot) {
      alert('Este tema ainda nao tem um snapshot da Escrita Criativa para retomar.');
      return;
    }

    localStorage.setItem(`ws_script_execution_${activeProject.id}`, JSON.stringify({
      ...executionSnapshot,
      updated_at: new Date().toISOString(),
    }));

    closeForm();
    onOpenInWriting?.(theme);
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

  const byStatus = STATUSES.reduce((acc, s) => {
    acc[s] = filtered.filter(t => t.status === s);
    return acc;
  }, {} as Record<string, Theme[]>);

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

      {/* Kanban Board */}
      <div className="flex-1 overflow-x-auto overflow-y-hidden">
        <div className="flex gap-4 p-6 h-full min-w-max">
          {STATUSES.map(status => {
            const meta = STATUS_META[status];
            const Icon = meta.icon;
            const items = byStatus[status] || [];
            return (
              <div key={status} className="w-72 flex flex-col gap-3 flex-shrink-0">
                <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${meta.color}`}>
                  <Icon size={12} />
                  <span className="text-[10px] font-black uppercase tracking-widest">{meta.label}</span>
                  <span className="ml-auto text-[9px] opacity-60">{items.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                  {items.map(theme => {
                    const targetPublishDate = getThemePublishDate(theme);

                    return (
                    <div key={theme.id} className="glass-card p-4 space-y-2 group cursor-pointer hover:border-sage/20 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black text-white text-[11px] leading-tight">{theme.title}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
                          {isScriptEngineTheme(theme) && (
                            <button
                              onClick={() => reopenInWriting(theme)}
                              className="p-1 rounded hover:bg-sage/20 text-white/40 hover:text-sage transition-all"
                              title="Retomar na Escrita Criativa"
                            >
                              <FileText size={10} />
                            </button>
                          )}
                          <button onClick={() => openEdit(theme)} className="p-1 rounded hover:bg-white/10 text-white/40 hover:text-white transition-all">
                            <Edit3 size={10} />
                          </button>
                          <button onClick={() => handleDelete(theme.id)} className="p-1 rounded hover:bg-red-500/20 text-white/40 hover:text-red-400 transition-all">
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>
                      {theme.description && (
                        <p className="text-white/40 text-[10px] leading-relaxed">{theme.description}</p>
                      )}
                      <div className="flex flex-wrap gap-1">
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
                            Retomavel
                          </span>
                        )}
                        {(theme.is_demand_vetted && theme.is_persona_vetted) && (
                          <span className="ml-auto text-blue-400">
                            <CheckCircle2 size={10} />
                          </span>
                        )}
                      </div>
                      {isScriptEngineTheme(theme) && (
                        <div className="flex items-center gap-2 pt-1">
                          <FileText size={10} className="text-sage/70" />
                          <p className="text-[10px] text-sage/70 font-black uppercase tracking-widest">
                            Retome este tema na Escrita Criativa
                          </p>
                        </div>
                      )}
                    </div>
                    );
                  })}
                  {items.length === 0 && (
                    <div className="flex items-center justify-center h-20 opacity-20">
                      <p className="text-[10px] font-black uppercase tracking-widest">Nenhum tema</p>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
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
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Título do Tema *</label>
                  <input
                    value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))}
                    placeholder="Ex: Por que 80% das pessoas falham em..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white placeholder-white/20 outline-none focus:border-sage/40 font-bold"
                  />
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
