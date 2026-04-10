'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject } from '@/lib/store/projectStore';
import CustomSelect from './ui/CustomSelect';
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
const STATUSES = ['backlog', 'vetted', 'scripted', 'published'] as const;
const STRUCTURES = ['S1 — Curiosidade', 'S2 — Dor + Solução', 'S3 — Autoridade', 'S4 — Contrário', 'S5 — Lista'];
const PIPELINES = [
  { value: 'T1', label: 'T1 — Topo de Funil (Viral)', desc: 'Foco em alcance e novos inscritos.' },
  { value: 'T2', label: 'T2 — Meio de Funil (Retenção)', desc: 'Foco em autoridade e tempo de exibição.' },
  { value: 'T3', label: 'T3 — Fundo de Funil (Comunidade)', desc: 'Foco em conexão e conversão.' }
];

const STATUS_META: Record<string, { label: string; color: string; icon: any }> = {
  backlog:   { label: 'Backlog',    color: 'text-white/30 bg-white/5 border-white/10',  icon: Clock       },
  vetted:    { label: 'Aprovado',   color: 'text-blue-400 bg-blue-500/10 border-blue-500/20', icon: CheckCircle2 },
  scripted:  { label: 'Roteirizado', color: 'text-sage bg-sage/10 border-sage/20',       icon: FileText    },
  published: { label: 'Publicado',  color: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/20', icon: Star },
};

const PILLAR_OPTIONS = PILLARS.map(p => ({ value: p, label: p }));
const STATUS_OPTIONS = STATUSES.map(s => ({ value: s, label: STATUS_META[s].label }));
const STRUCTURE_OPTIONS = STRUCTURES.map(s => ({ value: s, label: s }));
const PIPELINE_OPTIONS = PIPELINES.map(p => ({ value: p.value, label: p.label }));

interface Theme {
  id: string;
  title: string;
  description?: string;
  editorial_pillar?: string;
  status: typeof STATUSES[number];
  title_structure?: string;
  pipeline_level?: string;
  is_demand_vetted: boolean;
  is_persona_vetted: boolean;
  refined_title?: string;
  priority: number;
  notes?: string;
  match_score?: number;
  demand_views?: string;
  production_assets?: any;
  created_at: string;
}

interface ThemeBankProps {
  activeProject?: any; // Optional: store takes priority
  userId?: string;
}

const emptyTheme: Omit<Theme, 'id' | 'created_at'> = {
  title: '',
  description: '',
  editorial_pillar: '',
  status: 'backlog',
  title_structure: '',
  pipeline_level: '',
  is_demand_vetted: false,
  is_persona_vetted: false,
  refined_title: '',
  priority: 0,
  notes: '',
};

export default function ThemeBank({ activeProject: propProject, userId }: ThemeBankProps) {
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

  // 🛠️ Agnosticismo de Dados: Puxa os pilares configurados no Projeto
  const projectPillars = activeProject?.editorial_line?.pillars?.filter((p: string) => p.trim() !== '') || [];
  const currentPillarOptions = projectPillars.length > 0 
    ? projectPillars.map((p: string) => ({ value: p, label: p }))
    : PILLAR_OPTIONS; // Fallback se não houver pilares cadastrados

  useEffect(() => {
    if (activeProject?.id) fetchThemes();
  }, [activeProject?.id]);

  const fetchThemes = async () => {
    if (!activeProject?.id) return;
    setLoading(true);
    try {
      // 1. Carregar local primeiro para UI imediata
      const localData = localStorage.getItem(`themes_${activeProject.id}`);
      if (localData) {
        const parsed = JSON.parse(localData);
        if (parsed.length > 0) setThemes(parsed);
      }

      if (!supabase) return;

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
      if (data && data.length > 0) {
        setThemes(data);
        localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(data));
      }
    } catch (err) {
      console.error('Erro ao buscar temas:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!form.title.trim()) return;
    setSaving(true);
    try {
      const payload = {
        title: form.title,
        description: form.description || '',
        editorial_pillar: form.editorial_pillar || '',
        status: form.status,
        title_structure: form.title_structure || '',
        pipeline_level: form.pipeline_level || '',
        is_demand_vetted: !!form.is_demand_vetted,
        is_persona_vetted: !!form.is_persona_vetted,
        refined_title: form.refined_title || '',
        priority: Number(form.priority) || 0,
        notes: form.notes || '',
        // 🛠️ Preserva campos de engenharia de cliques se existirem
        match_score: (editingTheme as any)?.match_score || 0,
        demand_views: (editingTheme as any)?.demand_views || '',
        production_assets: (editingTheme as any)?.production_assets || null,
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
      let { error } = editingTheme 
        ? await supabase.from('themes').update(payload).eq('id', editingTheme.id)
        : await supabase.from('themes').insert(payload);
      
      if (error && error.code === '23503') {
        console.warn('⚠️ Reparando vínculo de projeto em background...');
        const projectToSync = {
          id: activeProject.id,
          name: activeProject.name || activeProject.project_name || 'Canal Recuperado',
          project_name: activeProject.name || activeProject.project_name || 'Canal Recuperado',
          puc: activeProject.puc || activeProject.puc_promise || '',
          target_persona: activeProject.target_persona || {},
          editorial_line: activeProject.editorial_line || {},
          editing_sop: activeProject.editing_sop || activeProject.detailed_sop || {},
          status: 'active',
          updated_at: new Date().toISOString()
        };

        const { error: projectError } = await supabase.from('projects').upsert(projectToSync);
        if (!projectError) {
          const retry = editingTheme 
            ? await supabase.from('themes').update(payload).eq('id', editingTheme.id)
            : await supabase.from('themes').insert(payload);
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
      newComponents = themes.map(t => t.id === editingTheme.id ? { ...t, ...payload, id: t.id, created_at: t.created_at } : t);
    } else {
      newComponents = [{ ...payload, id: crypto.randomUUID(), created_at: new Date().toISOString() }, ...themes];
    }
    setThemes(newComponents as Theme[]);
    localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(newComponents));
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Deletar este tema?')) return;
    try {
      if (!supabase) {
        const updated = themes.filter(t => t.id !== id);
        setThemes(updated);
        localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(updated));
        return;
      }
      await supabase.from('themes').delete().eq('id', id);
      await fetchThemes();
    } catch (err) {
      console.error('Erro ao deletar tema:', err);
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
      pipeline_level: theme.pipeline_level || '',
      is_demand_vetted: theme.is_demand_vetted || false,
      is_persona_vetted: theme.is_persona_vetted || false,
      refined_title: theme.refined_title || '',
      priority: theme.priority,
      notes: theme.notes || '',
    });
    setShowForm(true);
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingTheme(null);
    setForm(emptyTheme);
  };

  const filtered = themes
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

  return (
    <div className="flex-1 flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="px-8 py-6 border-b border-white/5 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-sage/10 border border-sage/20 rounded-xl flex items-center justify-center">
            <Lightbulb className="text-sage" size={18} />
          </div>
          <div>
            <h2 className="font-black text-white italic text-sm uppercase tracking-widest">Banco de Temas</h2>
            <p className="text-white/30 text-[10px] uppercase tracking-widest font-black">{activeProject.name} · {themes.length} ideias</p>
          </div>
        </div>
        <button
          onClick={() => setShowForm(true)}
          className="flex items-center gap-2 px-4 py-2 bg-sage text-midnight rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-sage/80 transition-all"
        >
          <Plus size={12} /> Nova Ideia
        </button>
      </div>

      {/* Stats Dashboard */}
      <div className="px-8 py-4 border-b border-white/5 flex gap-4 overflow-x-auto no-scrollbar">
        {STATUSES.map(s => {
          const count = themes.filter(t => t.status === s).length;
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
                  {items.map(theme => (
                    <div key={theme.id} className="glass-card p-4 space-y-2 group cursor-pointer hover:border-sage/20 transition-all">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-black text-white text-[11px] leading-tight">{theme.title}</p>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all flex-shrink-0">
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
                        {(theme.is_demand_vetted && theme.is_persona_vetted) && (
                          <span className="ml-auto text-blue-400">
                            <CheckCircle2 size={10} />
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
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
              <button onClick={closeForm} className="text-white/30 hover:text-white transition-all text-lg">✕</button>
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
                    value={form.editorial_pillar}
                    onChange={val => setForm(f => ({ ...f, editorial_pillar: val }))}
                    options={currentPillarOptions}
                    placeholder="Selecionar"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase tracking-widest text-white/40 mb-1 block">Pipeline de Deploy</label>
                  <CustomSelect
                    value={form.pipeline_level}
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
                    value={form.title_structure}
                    onChange={val => setForm(f => ({ ...f, title_structure: val }))}
                    options={STRUCTURE_OPTIONS}
                    placeholder="Selecionar S1-S5"
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
                className="flex-1 py-3 bg-sage text-midnight rounded-xl text-[10px] font-black uppercase tracking-widest hover:bg-sage/80 transition-all disabled:opacity-40"
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
