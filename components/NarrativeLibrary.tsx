'use client';

import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { supabase } from '@/lib/supabase';
import { useActiveProject } from '@/lib/store/projectStore';
import CustomSelect from './ui/CustomSelect';
import { 
  BookOpen, 
  Plus, 
  Filter, 
  Trash2, 
  Edit3,
  TrendingUp,
  Wand2,
  AlertTriangle,
  Lightbulb,
  Target,
  Sparkles,
  Hash,
  Users
} from 'lucide-react';
const TYPE_OPTIONS = [
  { value: 'Hook', label: 'Hook (Gancho Estratégico)' },
  { value: 'CTA', label: 'CTA (Call-to-Action)' },
  { value: 'Title Structure', label: 'Estrutura de Título' },
  { value: 'Community', label: 'Elemento de Comunidade (Bordão / Engajamento)' },
];

const HOOK_CATEGORIES = ['Curiosidade', 'Dor', 'Autoridade', 'Paradoxo', 'Urgência', 'Social Proof'];

const S_STRUCTURES = [
  { id: 'S1', name: 'Curiosidade / Erro Oculto', desc: 'Revela um erro comum que a persona não percebe. Gera tensão cognitiva.', example: 'Você acha que [X] funciona, mas na verdade está sabotando [Y].' },
  { id: 'S2', name: 'Dor + Solução', desc: 'Identifica uma dor específica e posiciona o vídeo como a cura.', example: 'Se você sofre com [Problema], este vídeo vai mudar tudo.' },
  { id: 'S3', name: 'Autoridade / Credencial', desc: 'Usa a autoridade do criador ou de dados para validar o conteúdo.', example: 'Após [N anos / N experimentos], descobri que [Insight].' },
  { id: 'S4', name: 'Contrário / Paradoxo', desc: 'Vai contra o senso comum. Ideal para nichos com muito conteúdo mediano.', example: 'O que todos ensinam sobre [X] está errado. O real motivo é [Y].' },
  { id: 'S5', name: 'Lista / Blueprint', desc: 'Apresenta um mapa claro e acionável. Alta retenção por progressão.', example: '[N] passos que [resultado transformador] em [tempo].' },
];

interface NarrativeLibraryProps {
  activeProject?: any;
}

interface NarrativeComponent {
  id: string;
  type: string;
  name: string;
  description: string;
  content_pattern: string;
  category?: string;
  is_active: boolean;
}

const mergeNarrativeComponents = (
  localItems: NarrativeComponent[],
  remoteItems: NarrativeComponent[]
) => {
  const merged = new Map<string, NarrativeComponent>();

  localItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });

  remoteItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });

  return Array.from(merged.values());
};

const componentSignature = (item: Partial<NarrativeComponent>) => {
  return [
    item.type || '',
    item.name || '',
    item.description || '',
    item.content_pattern || '',
    item.category || '',
  ]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const dedupeNarrativeComponents = (items: NarrativeComponent[]) => {
  const merged = new Map<string, NarrativeComponent>();

  items.forEach((item) => {
    const key = componentSignature(item);
    if (!merged.has(key) || (item.is_active && !merged.get(key)?.is_active)) {
      merged.set(key, item);
    }
  });

  return Array.from(merged.values());
};

export default function NarrativeLibrary({ activeProject: propProject }: NarrativeLibraryProps) {
  // Zustand store takes priority for data isolation
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;

  const [components, setComponents] = useState<NarrativeComponent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [activeTab, setActiveTab] = useState<'All' | 'Hook' | 'CTA' | 'Title Structure' | 'Community' | 'Padrões S1-S5'>('All');
  
  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NarrativeComponent | null>(null);
  const [formData, setFormData] = useState({
    type: 'Hook',
    name: '',
    description: '',
    content_pattern: '',
    category: ''
  });

  useEffect(() => {
    if (activeProject?.id) {
      fetchComponents();
    } else {
      setComponents([]);
      setIsLoading(false);
    }
  }, [activeProject?.id]);

  const fetchComponents = async () => {
    if (!activeProject?.id) {
      setComponents([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      console.log("[ContentOS] Buscando componentes para o projeto:", activeProject.id);
      
      let localItems: NarrativeComponent[] = [];

      // 1. Tentar LocalStorage primeiro para velocidade (UI Unblock)
      const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed)) {
            localItems = parsed;
            setComponents(parsed);
            // Não paramos o loading aqui se quisermos sincronizar com a nuvem, 
            // mas vamos parar para garantir que o usuário veja algo.
            setIsLoading(false);
          }
        } catch (parseErr) {
          console.warn('[ContentOS] LocalStorage narrativa inválido, ignorando cache local.', parseErr);
        }
      }

      // 2. Sincronizar com Supabase em background
      if (supabase) {
        const { data, error } = await supabase
          .from('narrative_components')
          .select('*')
          .eq('project_id', activeProject.id)
          .order('created_at', { ascending: false });
          
        if (error) {
          console.warn('⚠️ Supabase Fetch Error:', error.message);
        } else if (data && data.length > 0) {
          const remoteItems = data as NarrativeComponent[];
          const merged = dedupeNarrativeComponents(mergeNarrativeComponents(localItems, remoteItems));
          setComponents(merged);
          localStorage.setItem(`ws_narrative_${activeProject.id}`, JSON.stringify(merged));
        } else if (localItems.length > 0) {
          // Mantém o cache local quando a nuvem não tiver o conjunto completo ainda.
          const dedupedLocal = dedupeNarrativeComponents(localItems);
          setComponents(dedupedLocal);
          localStorage.setItem(`ws_narrative_${activeProject.id}`, JSON.stringify(dedupedLocal));
        }
      }
    } catch (e) {
      console.error('❌ Erro crítico ao buscar componentes:', e);
    } finally {
      setIsLoading(false);
      console.log("[ContentOS] Carregamento da Biblioteca concluído.");
    }
  };

  const handleSave = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!activeProject || isSubmitting) return;

    setIsSubmitting(true);
    console.log("[ContentOS] Iniciando salvamento de Ativo Narrativo...", formData);

    try {
      const payload = {
        type: formData.type,
        name: formData.name,
        description: formData.description,
        content_pattern: formData.content_pattern,
        category: formData.category || '',
        project_id: activeProject.id,
        is_active: true
      };

      // 💾 1. Persistência Local Imediata (UI Unblock)
      let newComponents = [...components];
      const tempId = editingItem ? editingItem.id : crypto.randomUUID();
      const nextItem = { ...payload, id: tempId } as NarrativeComponent;
      
      if (editingItem) {
        newComponents = newComponents.map(c => c.id === editingItem.id ? nextItem : c);
      } else {
        newComponents = [nextItem, ...newComponents];
      }

      const dedupedLocal = dedupeNarrativeComponents(newComponents);
      setComponents(dedupedLocal);
      localStorage.setItem(`ws_narrative_${activeProject.id}`, JSON.stringify(dedupedLocal));
      
      // 🏁 UI Feedback: Fecha modal e limpa form
      setIsModalOpen(false);
      resetForm();
      console.log("[ContentOS] Ativo salvo localmente.");

      // ☁️ 2. Sincronização Supabase (Background)
      if (supabase) {
        console.log("[ContentOS] Sincronizando Ativo com Supabase...");
        const action = editingItem 
          ? supabase.from('narrative_components').upsert(nextItem)
          : supabase.from('narrative_components').upsert(nextItem);
          
        action.then(({ error }: { error: any }) => {
          if (error) console.warn('⚠️ Supabase Narrative Error:', error.message);
          else {
            console.log("[ContentOS] Sincronização concluída. Recarregando...");
            fetchComponents();
          }
        });
      }
    } catch (err: any) {
      console.error('❌ Erro crítico na Biblioteca:', err);
      alert(`Erro: ${err.message || 'Falha ao processar ativo'}`);
      setIsModalOpen(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirm('Tem certeza que deseja remover este padrão da biblioteca?')) {
      if (supabase) {
        await supabase.from('narrative_components').delete().eq('id', id);
        fetchComponents();
      } else {
        const newComponents = components.filter(c => c.id !== id);
        setComponents(newComponents);
        localStorage.setItem(`ws_narrative_${activeProject?.id}`, JSON.stringify(newComponents));
      }
    }
  };

  const resetForm = () => {
    setEditingItem(null);
    setFormData({ type: 'Hook', name: '', description: '', content_pattern: '', category: '' });
  };

  const openNewModal = () => {
    resetForm();
    setIsModalOpen(true);
  };

  const openEditModal = (item: NarrativeComponent) => {
    setEditingItem(item);
    setFormData({
      type: item.type,
      name: item.name,
      description: item.description,
      content_pattern: item.content_pattern,
      category: item.category || ''
    });
    setIsModalOpen(true);
  };

  const filteredComponents = activeTab === 'All' 
    ? components 
    : components.filter(c => c.type === activeTab);

  if (!activeProject) {
    return (
      <div className="flex flex-col items-center justify-center p-20 glass-card">
        <AlertTriangle className="text-white/20 mb-4" size={48} />
        <h2 className="text-xl font-bold uppercase tracking-widest text-white/40">Selecione uma Instância</h2>
        <p className="text-sm text-white/30 text-center mt-2">Você precisa ativar um projeto para gerenciar sua biblioteca narrativa privada.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in pb-12">
      {/* Header Section */}
      <section className="flex flex-col lg:flex-row justify-between items-start lg:items-center gap-6">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-3">
            <BookOpen className="text-sage" size={24} /> 
            Biblioteca Narrativa
          </h2>
          <p className="text-[10px] text-white/50 uppercase tracking-[0.2em] mt-1 font-bold">
            Motor Tático de Conversão • {activeProject.project_name || activeProject.name}
          </p>
        </div>
        <button onClick={openNewModal} className="btn-primary py-3 px-6 flex items-center gap-2 text-xs">
          <Plus size={16} /> ADICIONAR ATIVO
        </button>
      </section>

      {/* Analytics & Filters Insight Container */}
      <section className="glass-card p-2 flex justify-between items-center bg-midnight/40 max-w-2xl border-white/5">
        <div className="flex gap-2 p-1 flex-wrap">
          {['All', 'Hook', 'CTA', 'Title Structure', 'Community'].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab as any)}
              className={`px-5 py-2.5 rounded-lg text-[10px] font-black tracking-widest uppercase transition-all
                ${activeTab === tab 
                  ? 'bg-sage text-midnight shadow-[0_0_15px_rgba(155,176,165,0.4)]' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'}`
              }
            >
              {tab === 'All' ? 'Tudo' : tab === 'Community' ? 'Comunidade' : tab}
            </button>
          ))}
        </div>
        <div className="px-6 flex gap-3 text-white/30 hidden sm:flex border-l border-white/5">
          <Filter size={16} />
        </div>
      </section>

      {/* Grid of Components */}
      {isLoading ? (
        <div className="text-center p-20 text-white/20 italic">Carregando Biblioteca Neural...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredComponents.map(comp => (
            <div key={comp.id} className="glass-card p-0 overflow-hidden flex flex-col group border-white/5 hover:border-[var(--accent-color)]/30 transition-all duration-500">
              {/* Header */}
              <div className="p-6 border-b border-white/5 bg-white/[0.01] flex justify-between items-start">
                <div>
                  <span className={`text-[8px] uppercase tracking-widest font-black px-2 py-1 rounded inline-block mb-3 border
                    ${comp.type === 'Hook' ? 'bg-sage/10 text-sage border-sage/20' : 
                      comp.type === 'CTA' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20' :
                      comp.type === 'Community' ? 'bg-purple-400/10 text-purple-400 border-purple-400/20' :
                      'bg-orange-400/10 text-orange-400 border-orange-400/20'
                    }`}
                  >
                    {comp.type === 'Community' ? '◈ Comunidade' : comp.type}
                  </span>
                  <h3 className="font-bold text-white tracking-tight">{comp.name}</h3>
                </div>
                <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => openEditModal(comp)} className="p-2 bg-white/5 hover:bg-white/20 rounded-lg text-white/40 hover:text-white transition-colors">
                    <Edit3 size={14} />
                  </button>
                  <button onClick={() => handleDelete(comp.id)} className="p-2 bg-white/5 hover:bg-red-500/20 rounded-lg text-white/40 hover:text-red-400 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
              
              {/* Body */}
              <div className="p-6 flex-1 flex flex-col gap-4">
                <p className="text-xs text-white/40 leading-relaxed italic border-l-2 border-white/10 pl-3">
                  {comp.description}
                </p>
                <div className="bg-midnight/60 p-4 rounded-xl border border-white/5 relative overflow-hidden mt-2">
                  <Wand2 size={120} className="absolute -bottom-10 -right-10 text-white/[0.02] rotate-12 pointer-events-none" />
                  <span className="text-[9px] uppercase font-black tracking-widest text-[#9BB0A5]/60 mb-2 block">— CORE PATTERN</span>
                  <p className="text-sm text-white/80 font-medium leading-relaxed">
                    {comp.content_pattern}
                  </p>
                </div>
              </div>
            </div>
          ))}
          
          {filteredComponents.length === 0 && (
            <div className="col-span-full p-20 text-center glass-card border-dashed">
              <h3 className="text-white/40 font-bold tracking-widest uppercase text-sm">Vazio</h3>
              <p className="text-white/20 text-xs mt-2">Nenhum componente tático localizado nesta classificação.</p>
            </div>
          )}
        </div>
      )}

      {/* Modal CRUD */}
      {isModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-[#0A0E17] border border-white/10 rounded-3xl w-full max-w-xl overflow-hidden shadow-2xl relative">
            <div className="p-8 border-b border-white/5 flex justify-between items-center bg-white/[0.02]">
              <h2 className="text-xl font-bold flex items-center gap-3">
                <Wand2 className="text-[var(--accent-color)]" size={20} />
                {editingItem ? 'Editar Componente' : 'Novo Pattern Estratégico'}
              </h2>
            </div>
            
            <form onSubmit={handleSave} className="p-8 flex flex-col gap-6">
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Categoria</label>
                <CustomSelect
                  value={formData.type}
                  onChange={val => setFormData({...formData, type: val})}
                  options={TYPE_OPTIONS}
                  placeholder="Selecionar Categoria"
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Nome do Pattern</label>
                <input 
                  type="text"
                  placeholder="Ex: Paradoxo S1, CTA Nativo Lead"
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-[var(--accent-color)] focus:outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Descrição Tática</label>
                <textarea 
                  placeholder="Como e por que este elemento funciona estrategicamente?"
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-[var(--accent-color)] focus:outline-none h-20 resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Core Pattern (Estrutura-Chave)</label>
                <textarea 
                  placeholder="Ex: O maior erro ignorado ao tentarem [Atingir Objetivo] é [Prática Comum]. O segredo está na [Solução Incomum]."
                  className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-medium focus:border-[var(--accent-color)] focus:outline-none h-32 resize-none"
                  value={formData.content_pattern}
                  onChange={(e) => setFormData({...formData, content_pattern: e.target.value})}
                  required
                />
              </div>

              <div className="flex justify-end gap-3 mt-4">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-6 py-3 rounded-xl border border-white/10 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 hover:text-white hover:bg-white/5 transition-colors disabled:opacity-30"
                >
                  Cancelar
                </button>
                <button 
                  type="button"
                  onClick={() => handleSave()}
                  disabled={isSubmitting || !formData.name || !formData.content_pattern}
                  className={`btn-primary py-3 px-8 text-[10px] ${isSubmitting ? 'opacity-50 cursor-wait' : ''}`}
                >
                  {isSubmitting ? 'SALVANDO NO KERNEL...' : 'SALVAR NO KERNEL'}
                </button>
              </div>

            </form>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
