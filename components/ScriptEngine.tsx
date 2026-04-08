'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Play, 
  Save, 
  Copy, 
  Layout, 
  Settings, 
  MessageSquare, 
  Sparkles,
  ChevronDown,
  Trash2,
  Plus,
  Database,
  PenTool,
  History,
  Zap
} from 'lucide-react';

interface ScriptBlock {
  id: string;
  type: 'Hook' | 'Context' | 'Development' | 'CTA' | 'SOP';
  title: string;
  content: string;
  sop?: string; // New field for production guidelines
}

interface ScriptEngineProps {
  activeProject?: any;
  pendingData?: any;
  onClearPending?: () => void;
}

export default function ScriptEngine({ activeProject, pendingData, onClearPending }: ScriptEngineProps) {
  const [selectedProject] = useState(activeProject?.name || 'Selecione um Projeto');
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  
  // BI Traceability States
  const [components, setComponents] = useState<any[]>([]);
  const [selectedHookId, setSelectedHookId] = useState<string>('h_S1');
  const [selectedCtaId, setSelectedCtaId] = useState<string>('cta_default');

  useEffect(() => {
    fetchComponents();
  }, [activeProject?.id]);

  const fetchComponents = async () => {
    try {
      if (supabase) {
        const { data, error } = await supabase.from('narrative_components').select('*').eq('project_id', activeProject?.id);
        if (data && data.length > 0) {
          setComponents(data);
          return;
        }
      }
      
      // Fallback para LocalStorage antes de usar os Mocks fixos
      const localData = localStorage.getItem(`ws_narrative_${activeProject?.id}`);
      if (localData) {
        setComponents(JSON.parse(localData));
      } else {
        setComponents([
          { id: 'h_S1', type: 'Hook', name: 'Provocação S1', description: 'Começa com um erro técnico.' },
          { id: 'h_S5', type: 'Hook', name: 'Blueprint S5', description: 'Apresenta o mapa da solução.' },
          { id: 'h_S3', type: 'Hook', name: 'Interrupção S3', description: 'Quebra de padrão agressiva.' },
          { id: 'cta_default', type: 'CTA', name: 'Conversão PUC', description: 'Chamada padrão alinhada à matriz de conversão.' }
        ]);
      }
    } catch (e) {
      console.error(e);
    }
  };
  
  useEffect(() => {
    if (pendingData) {
      console.log('--- Assembler V4 Initializing from Content OS Kernel ---');
      
      const metaphorsStr = activeProject?.metaphor_library || '';
      const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
      const randomM = metaphors[Math.floor(Math.random() * metaphors.length)] || 'Conceito Central';
      
      const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
      const persona = activeProject?.persona_matrix || { demographics: 'Público', pain_alignment: 'Problema' };
      const journey = activeProject?.playlists?.tactical_journey || [];

      const v4Blocks: ScriptBlock[] = [
        { 
          id: 'h1', 
          type: 'Hook', 
          title: `Hook Estratégico [${pendingData.selected_structure}]`, 
          content: pendingData.title,
          sop: `Estilo: ${sop.zoom_style}. Ritmo: ${sop.cut_rhythm}. Impacto visual imediato no gancho.` 
        },
        { 
          id: 'c1', 
          type: 'Context', 
          title: 'Contextualização (Persona Fit)', 
          content: `Vincular o tema [${pendingData.raw_theme}] com o lifestyle [${persona.demographics}] e a dor central: ${persona.pain_alignment}.`,
          sop: `Trilha: ${sop.soundtrack}. Tom empático. Câmera focada para gerar conexão.`
        }
      ];

      // Dynamic Journey Ingestion (M1-M3)
      journey.forEach((module: any, idx: number) => {
        v4Blocks.push({
          id: `module-${idx}`,
          type: 'Development',
          title: `Core ${module.label}: ${module.title}`,
          content: `Injetar metáfora: ${randomM}. Desenvolver ${module.title}: ${module.value || 'Focar na solução técnica'}.`,
          sop: `Ritmo: ${sop.cut_rhythm}. Use overlays de texto para os termos da Metaphor Library.`
        });
      });

      v4Blocks.push({ 
        id: 'cta1', 
        type: 'CTA', 
        title: 'Conversão PUC', 
        content: `CTA Estratégico: Transição para a Promessa Única (PUC) - ${activeProject?.puc}. Chamar para a ação específica do projeto.`,
        sop: 'Split screen ou CTA visual. Encerramento com a trilha em crescendo.'
      });

      setScriptBlocks(v4Blocks);
      onClearPending?.();
    } else if (scriptBlocks.length === 0) {
      setScriptBlocks([
        { id: 'h0', type: 'Hook', title: 'Gancho Estratégico', content: 'Inicie com uma promessa técnica...', sop: 'Corte seco.' },
        { id: 'c0', type: 'Context', title: 'Contextualização', content: 'Conecte com a dor do público...', sop: 'B-roll de contexto.' }
      ]);
    }
  }, [pendingData, activeProject?.id]);

  const handleDeploy = async () => {
    if (!activeProject) return;

    const compositionLog = {
      theme_id: pendingData?.id || `theme_${Date.now()}`,
      title_structure_id: pendingData?.selected_structure || 'S1',
      hook_id: selectedHookId,
      cta_id: selectedCtaId,
      editorial_pillar: activeProject?.playlists?.tactical_journey?.[0]?.label || 'M1'
    };

    const analyticsData = {
      content_id: pendingData?.id, 
      composition_log: compositionLog,
      match_score: pendingData?.match_score || 85,
      editorial_pillar: compositionLog.editorial_pillar,
      views: Math.floor(Math.random() * 50000) + 5000,
      ctr: (Math.random() * 5 + 4).toFixed(2),
      retention: (Math.random() * 30 + 30).toFixed(1)
    };

    try {
      if (supabase) {
        // If content_id exists, insert/upsert
        if (analyticsData.content_id) {
           await supabase.from('analytics').upsert(analyticsData);
        }
      }
      // Save locally to simulate BI population
      const existingBI = JSON.parse(localStorage.getItem(`bi_${activeProject.id}`) || '[]');
      existingBI.push({ ...analyticsData, created_at: new Date().toISOString() });
      localStorage.setItem(`bi_${activeProject.id}`, JSON.stringify(existingBI));

      alert(`Deploy Registrado com Sucesso!\nLog de Composição:\nHook: ${compositionLog.hook_id}\nTarget: ${compositionLog.title_structure_id}`);
    } catch (err) {
      console.error(err);
    }
  };

  const hookTemplates = components.filter(c => c.type === 'Hook');
  const ctaTemplates = components.filter(c => c.type === 'CTA');

  return (
    <div className="flex flex-col lg:flex-row gap-6 animate-in h-[calc(100vh-160px)]">
      {/* Left: Building Blocks */}
      <section className="w-full lg:w-1/3 flex flex-col gap-6 overflow-y-auto pr-2 pb-6 custom-scrollbar">
        <div className="glass-card p-6 flex flex-col gap-4 border-sage/20 bg-sage/[0.02] shadow-xl">
          <label className="text-[10px] uppercase tracking-widest font-black text-sage">Instância Content OS</label>
          <div className="flex items-center justify-between p-4 bg-midnight/40 border border-white/10 rounded-2xl ring-1 ring-white/5">
            <div className="flex flex-col gap-1">
              <span className="font-black text-sm text-white">{selectedProject}</span>
              <span className="text-[9px] text-sage font-black uppercase tracking-widest">V4 Kernel Operational</span>
            </div>
            <div className="p-2 bg-sage/10 rounded-full">
              <Sparkles size={14} className="text-sage" />
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
              <Sparkles className="text-sage" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Openers Estratégicos</span>
            </div>
            <div className="flex flex-col gap-2">
              {hookTemplates.map(h => (
                <button 
                  key={h.id} 
                  onClick={() => setSelectedHookId(h.id)}
                  className={`w-full p-4 rounded-xl text-left transition-all flex items-center justify-between group border ${
                    selectedHookId === h.id 
                    ? 'bg-sage/10 border-sage/40 ring-1 ring-sage/20' 
                    : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className={`font-black text-xs ${selectedHookId === h.id ? 'text-sage' : 'text-white/80 group-hover:text-white'}`}>{h.name}</span>
                    <span className="text-[9px] uppercase font-bold text-white/30 group-hover:text-white/50">{h.description}</span>
                  </div>
                  {selectedHookId === h.id ? <Zap size={14} className="text-sage" /> : <ChevronDown size={14} className="text-white/20 group-hover:text-white/40 transition-transform" /> }
                </button>
              ))}
            </div>
          </div>

          {/* D.I.O Journey */}
          <div className="glass-card p-6 flex flex-col gap-3 border-orange-400/30 bg-orange-400/5">
            <div className="flex items-center gap-3 mb-3">
              <Layout className="text-orange-400" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Jornada Tática</span>
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

      {/* Right: Script Workspace */}
      <section className="flex-1 glass-card flex flex-col overflow-hidden shadow-2xl border-white/10 ring-1 ring-white/5">
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-midnight/40 backdrop-blur-md">
          <div>
            <h3 className="font-bold flex items-center gap-3 text-lg">
              <Database className="text-sage" size={20} /> Production Assembler
            </h3>
            <p className="text-[10px] text-white/60 tracking-widest uppercase mt-1 font-bold">
              Validado pela PUC: <span className="font-black text-sage drop-shadow-[0_0_8px_rgba(155,176,165,0.4)]">"{activeProject?.puc || 'DNA não definido'}"</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={handleDeploy}
              className="px-6 py-3 bg-sage/10 text-sage hover:bg-sage hover:text-midnight rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-sage/20"
              title="Registrar Log de Composição e Deploy na BI"
            >
              <Save size={14} /> DEPLOY & LOG TRACKING
            </button>
            <button className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10">
              <Copy size={20} />
            </button>
            <button 
              onClick={() => {
                alert('🚀 O motor de IA está injetando o DNA estratégico no roteiro modular...');
              }}
              className="px-8 py-3 bg-sage text-midnight rounded-xl font-black text-[10px] uppercase tracking-[2px] shadow-lg shadow-sage/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3"
            >
              GERAR ROTEIRO IA <Play size={14} fill="currentColor" />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-12 flex flex-col gap-12 custom-scrollbar bg-gradient-to-b from-transparent to-midnight/20">
          {scriptBlocks.map((block, index) => (
            <div key={block.id} className="relative group animate-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="absolute -left-12 top-2 text-[12px] font-black text-white/5 group-hover:text-sage transition-all duration-500">
                STG_0{index + 1}
              </div>
              <div className="flex flex-col gap-6 bg-white/[0.01] border border-white/[0.05] rounded-[40px] p-10 hover:border-white/10 hover:bg-white/[0.03] transition-all shadow-inner relative group/block">
                
                <div className="flex items-center justify-between mb-4">
                  <span className={`text-[10px] font-black uppercase tracking-[3px] px-5 py-2 rounded-full border shadow-sm ${
                    block.type === 'Hook' ? 'text-sage border-sage/60 bg-sage/10' : 
                    block.type === 'Context' ? 'text-blue-400 border-blue-400/60 bg-blue-400/10' : 
                    block.type === 'Development' ? 'text-orange-400 border-orange-400/60 bg-orange-400/10' :
                    'text-white/60 border-white/20 bg-white/5'
                  }`}>
                    {block.type} {'\u00BB'} {block.title}
                  </span>
                  <div className="opacity-0 group-hover/block:opacity-100 transition-opacity flex gap-2">
                    <button className="p-2 text-white/20 hover:text-white transition-colors"><Plus size={14} /></button>
                    <button className="p-2 text-white/20 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-10">
                  <div className="lg:col-span-2">
                    <textarea 
                      className="w-full bg-transparent text-white/90 leading-relaxed outline-none transition-all resize-none min-h-[160px] text-sm font-medium placeholder:text-white/5"
                      value={block.content}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].content = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                    />
                  </div>
                  <div className="bg-midnight/40 rounded-3xl p-6 border border-white/5 flex flex-col gap-4">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-[2px] text-sage">
                      <PenTool size={14} className="animate-pulse" /> SOP DE EDIÇÃO
                    </div>
                    <textarea 
                      className="w-full bg-transparent text-[12px] text-white/70 font-medium leading-relaxed outline-none resize-none h-full italic border-t border-white/5 pt-4 mt-2"
                      value={block.sop}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].sop = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                      placeholder="Instruções para o editor..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button className="w-full border-2 border-dashed border-white/5 hover:border-sage/20 rounded-[50px] py-16 flex flex-col items-center gap-3 text-white/10 hover:text-sage transition-all group bg-white/[0.01]">
            <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
            <div className="text-center">
              <span className="text-[11px] uppercase font-black tracking-[0.4em]">Injetar Bloco Modular</span>
              <p className="text-[9px] opacity-40 mt-1 uppercase tracking-widest font-bold">DNA Content OS Kernel</p>
            </div>
          </button>
        </div>
      </section>
    </div>
  );
}
