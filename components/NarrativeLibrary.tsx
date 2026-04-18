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
  { value: 'Narrative Curve', label: 'Narrative Curve (Curva Narrativa)' },
  { value: 'Argument Mode', label: 'Argument Mode (Modo de Argumentação)' },
  { value: 'Repetition Rule', label: 'Repetition Rule (Regra Anti-Repetição)' },
];

const HOOK_CATEGORIES = ['Curiosidade', 'Dor', 'Autoridade', 'Paradoxo', 'Urgência', 'Social Proof'];
const BEHAVIOR_FLAG_OPTIONS = [
  { value: 'fixed', label: 'Fixo' },
  { value: 'rotative', label: 'Rotativo' },
  { value: 'experimental', label: 'Experimental' },
];
const WRITING_LIBRARY_TYPES = ['Narrative Curve', 'Argument Mode', 'Repetition Rule'];
const CONTENT_TABS = ['Hook', 'CTA', 'Title Structure', 'Community'];
const WRITING_TABS = ['Narrative Curve', 'Argument Mode'];
const RULE_TABS = ['Repetition Rule'];
const TAB_GROUPS = {
  content: CONTENT_TABS,
  writing: WRITING_TABS,
  rules: RULE_TABS,
} as const;
const SECTION_META = {
  content: {
    label: 'Conteudo',
    description: 'Hooks, CTAs, estruturas de titulo e comunidade.',
    color: 'text-blue-400',
    icon: BookOpen,
  },
  writing: {
    label: 'Escrita',
    description: 'Curvas narrativas e modos de argumentacao.',
    color: 'text-indigo-400',
    icon: Lightbulb,
  },
  rules: {
    label: 'Regras',
    description: 'Ativos de anti-repeticao e restricoes de escrita.',
    color: 'text-emerald-400',
    icon: Hash,
  },
} as const;

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

const usesBehaviorFlag = (type: string) => WRITING_LIBRARY_TYPES.includes(type);

const getBehaviorLabel = (flag?: string) => {
  switch ((flag || '').toLowerCase()) {
    case 'fixed':
      return 'Fixo';
    case 'rotative':
      return 'Rotativo';
    case 'experimental':
      return 'Experimental';
    default:
      return '';
  }
};

const getTypeDisplayName = (type: string) => {
  if (type === 'Community') return 'Comunidade';
  if (type === 'Narrative Curve') return 'Curva';
  if (type === 'Argument Mode') return 'Argumento';
  if (type === 'Repetition Rule') return 'Anti-Repetição';
  return type;
};

const getTypeOptionsForSection = (section: keyof typeof TAB_GROUPS) =>
  TYPE_OPTIONS.filter((option) => TAB_GROUPS[section].includes(option.value as any));

const getDefaultTypeForSection = (section: keyof typeof TAB_GROUPS) =>
  TAB_GROUPS[section][0];

const getCategoryMicrocopy = (type: string) => {
  if (type === 'Narrative Curve') {
    return 'Cadastre aqui a progressao macro do roteiro: como ele comeca, aprofunda, vira e fecha.';
  }
  if (type === 'Argument Mode') {
    return 'Defina aqui a postura de persuasao: como o narrador confronta, convence e qual tom preserva.';
  }
  if (type === 'Repetition Rule') {
    return 'Use esta categoria para bloquear repeticoes de linguagem, formulas e estruturas entre blocos ou roteiros.';
  }
  return 'Escolha o tipo de ativo narrativo que sera reutilizado na composicao dos roteiros do projeto.';
};

const getNameMicrocopy = (type: string) => {
  if (type === 'Narrative Curve') {
    return 'De um nome facil de reconhecer, como a sequencia emocional ou estrutural que o roteiro deve seguir.';
  }
  if (type === 'Argument Mode') {
    return 'Nomeie a forma de convencer, por exemplo confronto tecnico, confissao pragmatica ou diagnostico direto.';
  }
  if (type === 'Repetition Rule') {
    return 'Nome curto da restricao, como conceito canonico so 1x ou evitar pergunta retorica em blocos seguidos.';
  }
  return 'Use um nome curto e rastreavel para o ativo, para facilitar leitura no briefing e nas analises.';
};

const getDescriptionMicrocopy = (type: string) => {
  if (type === 'Narrative Curve') {
    return 'Explique quando essa curva deve entrar e que tipo de progressao emocional ela gera no video.';
  }
  if (type === 'Argument Mode') {
    return 'Explique qual efeito de persuasao esse modo cria e o que ele deve evitar para nao descaracterizar o canal.';
  }
  if (type === 'Repetition Rule') {
    return 'Explique o motivo da restricao e em que situacoes ela deve travar, penalizar ou limitar a escrita.';
  }
  return 'Descreva por que esse ativo funciona e o efeito estrategico que ele deve causar no espectador.';
};

const getCategoryFieldMicrocopy = (type: string) => {
  if (usesBehaviorFlag(type)) {
    return 'Marque se esse ativo deve entrar sempre, variar por rotacao ou aparecer so como teste.';
  }
  if (type === 'Hook') {
    return 'Ajuda o orquestrador a entender qual familia de gancho esta sendo usada.';
  }
  return 'Use uma tag curta para facilitar organizacao, filtros e leitura futura do ativo.';
};

const getPatternMicrocopy = (type: string) => {
  if (type === 'Narrative Curve') {
    return 'Escreva a sequencia de movimento do roteiro em ordem, como ruptura > espelho > virada > aplicacao > fechamento.';
  }
  if (type === 'Argument Mode') {
    return 'Descreva como a IA deve usar essa postura no texto: tom, cadencia, tipo de ataque, prova e fechamento.';
  }
  if (type === 'Repetition Rule') {
    return 'Escreva a regra de forma operacional: o que nao pode repetir, qual limite usar e o que fazer no lugar.';
  }
  return 'Registre a estrutura-chave ou pattern central que faz esse ativo ser reproduzivel pelo orquestrador.';
};

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
  const [activeSection, setActiveSection] = useState<'content' | 'writing' | 'rules'>('content');
  const [activeTab, setActiveTab] = useState<string>('All');
  
  // Create / Edit Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<NarrativeComponent | null>(null);
  const [formData, setFormData] = useState({
    type: getDefaultTypeForSection('content'),
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

  useEffect(() => {
    if (!isModalOpen || editingItem) return;
    if (!TAB_GROUPS[activeSection].includes(formData.type as any)) {
      setFormData((prev) => ({
        ...prev,
        type: getDefaultTypeForSection(activeSection),
        category: ''
      }));
    }
  }, [activeSection, editingItem, formData.type, isModalOpen]);

  const fetchComponents = async () => {
    if (!activeProject?.id) {
      setComponents([]);
      setIsLoading(false);
      return;
    }

    let localItems: NarrativeComponent[] = [];
    let hasLocalData = false;

    // 1. INSTANT LOCAL CACHE LOAD (SWR Pattern)
    const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
    if (localData) {
      try {
        const parsed = JSON.parse(localData);
        if (Array.isArray(parsed) && parsed.length > 0) {
          localItems = parsed;
          setComponents(parsed);
          hasLocalData = true;
          setIsLoading(false); // ⚡ UNBLOCK UI IMMEDIATELY
        }
      } catch {}
    }

    if (!hasLocalData) {
      setIsLoading(true); // Only block UI if we absolutely have nothing to show
    }

    // 2. BACKGROUND SYNC
    if (!supabase) {
      if (!hasLocalData) setIsLoading(false);
      return;
    }

    try {
      const fetchPromise = supabase
        .from('narrative_components')
        .select('*')
        .eq('project_id', activeProject.id)
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
        console.warn('⚠️ Supabase Background Fetch Error:', error.message);
      } else {
        const cloudItems = (data ?? []) as NarrativeComponent[];
        const merged = dedupeNarrativeComponents(mergeNarrativeComponents(localItems, cloudItems));
        
        // ⬆️ AUTO-PUSH UNSYNCED ITEMS TO CLOUD
        const cloudIds = new Set(cloudItems.map(c => c.id));
        const unsyncedItems = localItems.filter(l => l.id && !cloudIds.has(l.id));
        
        if (unsyncedItems.length > 0) {
          console.log(`[ContentOS] ⬆️ Auto-syncing ${unsyncedItems.length} pending local items to cloud...`);
          supabase.from('narrative_components').upsert(
            unsyncedItems.map(item => ({ ...item, project_id: activeProject.id }))
          ).then(({ error: upsertError }) => {
            if (upsertError) console.error('❌ Falha no auto-sync:', upsertError.message);
            else console.log('✅ Auto-sync concluído.');
          });
        }

        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== JSON.stringify(localItems)) {
          setComponents(merged);
          localStorage.setItem(`ws_narrative_${activeProject.id}`, mergedStr);
          console.log(`[ContentOS] ☁️ Background Sync applied: ${cloudItems.length} cloud, ${merged.length} merged`);
        }
      }
    } catch (e) {
      console.error('❌ Erro crítico ao buscar componentes background:', e);
    } finally {
      setIsLoading(false);
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
    setFormData({
      type: getDefaultTypeForSection(activeSection),
      name: '',
      description: '',
      content_pattern: '',
      category: ''
    });
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

  const currentTabs = TAB_GROUPS[activeSection];
  const sectionTypeOptions = getTypeOptionsForSection(activeSection);
  const activeSectionMeta = SECTION_META[activeSection];
  const sectionComponents = components.filter((component) => currentTabs.includes(component.type as any));
  const filteredComponents = activeTab === 'All'
    ? sectionComponents
    : sectionComponents.filter(c => c.type === activeTab);
  const contentCount = components.filter((component) => CONTENT_TABS.includes(component.type as any)).length;
  const writingCount = components.filter((component) => WRITING_TABS.includes(component.type as any)).length;
  const rulesCount = components.filter((component) => RULE_TABS.includes(component.type as any)).length;

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
          <h2 className="text-2xl font-black text-white italic uppercase tracking-widest flex items-center gap-4">
            <div className="p-2.5 bg-blue-500/10 rounded-2xl border border-blue-500/20 shadow-[0_0_15px_rgba(59,130,246,0.1)]">
              <BookOpen className="text-blue-400" size={24} /> 
            </div>
            Biblioteca Narrativa
          </h2>
          <p className="text-[10px] text-white/40 uppercase tracking-[0.3em] mt-2 font-black">
            Motor Tático de Conversão • {activeProject.project_name || activeProject.name}
          </p>
        </div>
        <button onClick={openNewModal} className="btn-primary py-3 px-6 flex items-center gap-2 text-xs">
          <Plus size={16} /> ADICIONAR {activeSectionMeta.label.toUpperCase()}
        </button>
      </section>

      {/* Section Navigator */}
      <section className="grid grid-cols-1 gap-3 md:grid-cols-3 max-w-5xl">
        {[
          {
            id: 'content' as const,
            label: 'Conteudo',
            count: contentCount,
            icon: BookOpen,
            description: 'Hooks, CTAs, estruturas de titulo e comunidade.',
            color: 'text-sage',
          },
          {
            id: 'writing' as const,
            label: 'Escrita',
            count: writingCount,
            icon: Lightbulb,
            description: 'Curvas narrativas e modos de argumentacao.',
            color: 'text-fuchsia-300',
          },
          {
            id: 'rules' as const,
            label: 'Regras',
            count: rulesCount,
            icon: Hash,
            description: 'Ativos de anti-repeticao e restricoes de escrita.',
            color: 'text-rose-300',
          },
        ].map(({ id, label, count, icon: Icon, description, color }) => (
          <button
            key={id}
            onClick={() => {
              setActiveSection(id);
              setActiveTab('All');
            }}
            className={`glass-card p-6 text-left transition-all duration-500 border-white/5 ${
              activeSection === id
                ? 'bg-blue-600/10 border-blue-500/30 shadow-[0_0_30px_rgba(37,99,235,0.1)]'
                : 'hover:bg-white/[0.03] hover:border-white/10'
            }`}
          >
            <div className="flex items-center gap-2 mb-3">
              <Icon size={16} className={color} />
              <span className="text-[11px] font-black uppercase tracking-widest text-white/80">{label}</span>
              <span className="rounded-full border border-white/10 bg-white/[0.04] px-2 py-0.5 text-[9px] font-black text-white/40">
                {count}
              </span>
            </div>
            <p className="text-xs leading-relaxed text-white/35">{description}</p>
          </button>
        ))}
      </section>

      {/* Analytics & Filters Insight Container */}
      <section className="glass-card w-full max-w-5xl border-white/5 bg-midnight/40 overflow-hidden">
        <div className="flex gap-2 p-3 overflow-x-auto whitespace-nowrap [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {['All', ...currentTabs].map(tab => (
            <button 
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`shrink-0 px-4 py-2.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all
                ${activeTab === tab 
                  ? 'bg-blue-600 text-white shadow-[0_0_20px_rgba(37,99,235,0.4)]' 
                  : 'text-white/40 hover:text-white hover:bg-white/5'}`
              }
            >
              {tab === 'All' ? 'Tudo da secao' : getTypeDisplayName(tab)}
            </button>
          ))}
        </div>
        <div className="px-6 py-3 flex gap-3 text-white/30 hidden sm:flex border-l border-white/5">
          <Filter size={16} />
        </div>
      </section>

      {/* Grid of Components */}
      {isLoading ? (
        <div className="text-center p-20 text-white/20 italic">Carregando Biblioteca Neural...</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredComponents.map(comp => (
            <div key={comp.id} className="glass-card p-0 overflow-hidden flex flex-col group border-white/5 hover:border-blue-500/30 transition-all duration-500">
              {/* Header */}
              <div className="p-6 border-b border-white/5 bg-white/[0.01] flex justify-between items-start">
                <div>
                  <span className={`text-[8px] uppercase tracking-widest font-black px-2 py-1 rounded inline-block mb-3 border
                    ${comp.type === 'Hook' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20' : 
                      comp.type === 'CTA' ? 'bg-indigo-400/10 text-indigo-400 border-indigo-400/20' :
                      comp.type === 'Community' ? 'bg-emerald-400/10 text-emerald-400 border-emerald-400/20' :
                      comp.type === 'Narrative Curve' ? 'bg-blue-400/10 text-blue-400 border-blue-400/20 shadow-[0_0_10px_rgba(59,130,246,0.1)]' :
                      comp.type === 'Argument Mode' ? 'bg-cyan-400/10 text-cyan-300 border-cyan-400/20' :
                      comp.type === 'Repetition Rule' ? 'bg-rose-400/10 text-rose-300 border-rose-400/20' :
                      'bg-orange-400/10 text-orange-400 border-orange-400/20'
                    }`}
                  >
                    {comp.type === 'Community' ? '◈ Comunidade' : getTypeDisplayName(comp.type)}
                  </span>
                  <h3 className="font-bold text-white tracking-tight text-lg">{comp.name}</h3>
                  {usesBehaviorFlag(comp.type) && getBehaviorLabel(comp.category) && (
                    <span className="mt-2 inline-flex text-[8px] uppercase tracking-widest font-black px-2 py-1 rounded-full border border-white/10 bg-white/5 text-white/45">
                      {getBehaviorLabel(comp.category)}
                    </span>
                  )}
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
                  <Wand2 size={120} className="absolute -bottom-10 -right-10 text-blue-500/[0.03] rotate-12 pointer-events-none" />
                  <span className="text-[9px] uppercase font-black tracking-widest text-blue-400/40 mb-2 block tracking-[0.2em]">— CORE PATTERN</span>
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
                <Wand2 className="text-blue-400" size={20} />
                {editingItem ? 'Editar Componente' : 'Novo Pattern Estratégico'}
              </h2>
            </div>
            
            <form onSubmit={handleSave} className="p-8 flex flex-col gap-6">
              
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Categoria</label>
                <CustomSelect
                  value={formData.type}
                  onChange={val => setFormData({...formData, type: val})}
                  options={sectionTypeOptions}
                  placeholder="Selecionar Categoria"
                />
                <p className="text-[11px] leading-relaxed text-white/28">
                  {getCategoryMicrocopy(formData.type)}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Nome do Pattern</label>
                <input 
                  type="text"
                  placeholder={
                    formData.type === 'Narrative Curve'
                      ? 'Ex: Choque > Diagnóstico > Virada > Aplicação'
                      : formData.type === 'Argument Mode'
                        ? 'Ex: Confronto técnico direto'
                        : formData.type === 'Repetition Rule'
                          ? 'Ex: Conceito canônico só 1x'
                          : 'Ex: Paradoxo S1, CTA Nativo Lead'
                  }
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                  value={formData.name}
                  onChange={(e) => setFormData({...formData, name: e.target.value})}
                  required
                />
                <p className="text-[11px] leading-relaxed text-white/28">
                  {getNameMicrocopy(formData.type)}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">Descrição Tática</label>
                <textarea 
                  placeholder={
                    formData.type === 'Narrative Curve'
                      ? 'Explique quando essa curva deve ser usada e qual progressão emocional ela cria.'
                      : formData.type === 'Argument Mode'
                        ? 'Explique como esse modo convence a audiência e que tom ele preserva.'
                        : formData.type === 'Repetition Rule'
                          ? 'Explique por que essa regra evita repetição e quando ela deve travar o roteiro.'
                          : 'Como e por que este elemento funciona estrategicamente?'
                  }
                  className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-blue-500 focus:outline-none h-20 resize-none"
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                />
                <p className="text-[11px] leading-relaxed text-white/28">
                  {getDescriptionMicrocopy(formData.type)}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  {usesBehaviorFlag(formData.type) ? 'Comportamento do ativo' : 'Categoria / Tag interna'}
                </label>
                {usesBehaviorFlag(formData.type) ? (
                  <CustomSelect
                    value={formData.category}
                    onChange={val => setFormData({...formData, category: val})}
                    options={BEHAVIOR_FLAG_OPTIONS}
                    placeholder="Selecionar comportamento"
                  />
                ) : formData.type === 'Hook' ? (
                  <CustomSelect
                    value={formData.category}
                    onChange={val => setFormData({...formData, category: val})}
                    options={HOOK_CATEGORIES.map((item) => ({ value: item, label: item }))}
                    placeholder="Selecionar categoria"
                  />
                ) : (
                  <input
                    type="text"
                    placeholder="Ex: Fechamento, Conversão, Autoridade..."
                    className="bg-white/5 border border-white/10 rounded-xl p-3 text-sm text-white focus:border-blue-500 focus:outline-none"
                    value={formData.category}
                    onChange={(e) => setFormData({...formData, category: e.target.value})}
                  />
                )}
                <p className="text-[11px] leading-relaxed text-white/28">
                  {getCategoryFieldMicrocopy(formData.type)}
                </p>
              </div>

              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-white/40">
                  {formData.type === 'Narrative Curve'
                    ? 'Sequência / Blueprint'
                    : formData.type === 'Argument Mode'
                      ? 'Regras de uso'
                      : formData.type === 'Repetition Rule'
                        ? 'Regra operacional'
                        : 'Core Pattern (Estrutura-Chave)'}
                </label>
                <textarea 
                  placeholder={
                    formData.type === 'Narrative Curve'
                      ? 'Ex: ruptura > espelho > diagnóstico > virada > aplicação > fechamento'
                      : formData.type === 'Argument Mode'
                        ? 'Ex: use confronto no início, evidência no meio e fechamento prático sem tom guru.'
                        : formData.type === 'Repetition Rule'
                          ? 'Ex: não repetir nomes canônicos mais de 1 vez no corpo do roteiro; depois usar paráfrases.'
                          : 'Ex: O maior erro ignorado ao tentarem [Atingir Objetivo] é [Prática Comum]. O segredo está na [Solução Incomum].'
                  }
                  className="bg-white/5 border border-white/10 rounded-xl p-4 text-sm text-white font-medium focus:border-blue-500 focus:outline-none h-32 resize-none"
                  value={formData.content_pattern}
                  onChange={(e) => setFormData({...formData, content_pattern: e.target.value})}
                  required
                />
                <p className="text-[11px] leading-relaxed text-white/28">
                  {getPatternMicrocopy(formData.type)}
                </p>
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
