'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject, useProjectStore } from '@/lib/store/projectStore';
import { immutableInsert } from '@/lib/supabase-mutations';
import { Play, Save, Copy, Layout, Settings, MessageSquare, Sparkles, ChevronDown, Trash2, Plus, Database, PenTool, History, Zap } from 'lucide-react';
import ProductionAssembler from './ProductionAssembler';

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

export default function ScriptEngine({ activeProject: propProject, pendingData, onClearPending }: ScriptEngineProps) {
  // Zustand store takes priority for data isolation
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;
  const activeAIConfig = (useProjectStore.getState() as any)?.activeAIConfig;

  const [selectedProject] = useState(activeProject?.name || 'Selecione um Projeto');
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [assemblerActive, setAssemblerActive] = useState(true);
  const [approvedTheme, setApprovedTheme] = useState('');
  const [approvedBriefing, setApprovedBriefing] = useState<any | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [mobileTab, setMobileTab] = useState<'context' | 'main'>('main');
  
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
      const tactical_journey = activeProject?.playlists?.tactical_journey || [];

      const v4Blocks: ScriptBlock[] = [
        { 
          id: 'h1', 
          type: 'Hook', 
          title: `Hook Estratégico [${pendingData.title_structure || pendingData.selected_structure || 'S1'}]`, 
          content: pendingData.refined_title || pendingData.title || '',
          sop: `Estilo: ${sop.zoom_style}. Ritmo: ${sop.cut_rhythm}. Impacto visual imediato no gancho.` 
        },
        { 
          id: 'c1', 
          type: 'Context', 
          title: 'Conexão com a Persona', 
          content: `Vincular o tema [${pendingData.title || pendingData.raw_theme || ''}] com o perfil [${persona.demographics}] e a dor central: ${persona.pain_alignment}.`,
          sop: `Trilha: ${sop.soundtrack}. Tom empático. Câmera focada para gerar conexão.`
        }
      ];

      // Dynamic Funnel Ingestion (T1-T3)
      tactical_journey.forEach((module: any, idx: number) => {
        v4Blocks.push({
          id: `module-${idx}`,
          type: 'Development',
          title: `Bloco ${module.label}: ${module.title}`,
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
      setAssemblerActive(false); // Move to editor once pending data arrives
    } else if (scriptBlocks.length === 0) {
      setScriptBlocks([
        { id: 'h0', type: 'Hook', title: 'Gancho Estratégico', content: 'Inicie com uma promessa técnica...', sop: 'Corte seco.' },
        { id: 'c0', type: 'Context', title: 'Contextualização', content: 'Conecte com a dor do público...', sop: 'B-roll de contexto.' }
      ]);
    }
  }, [pendingData, activeProject?.id]);

  const [thumbnailDirective, setThumbnailDirective] = useState<{description: string; prompt: string} | null>(null);
  const [showThumbnailPanel, setShowThumbnailPanel] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState('');

  const getCommandContext = () => {
    const theme = approvedBriefing?.title || approvedTheme || pendingData?.title || pendingData?.raw_theme || '';
    const variation = approvedBriefing?.openingHook?.id || pendingData?.title_structure || pendingData?.selected_structure || 'S1';
    return { theme, variation };
  };

  const generateThumbnailDirective = () => {
    if (!activeProject) return;
    const { theme, variation } = getCommandContext();
    if (!theme) return alert('Selecione/compile um tema antes de gerar a diretriz.');

    const persona = activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'o público-alvo';
    const puc = activeProject?.puc || activeProject?.puc_promise || 'a transformação central do projeto';
    const layouts = activeProject?.thumb_strategy?.layouts || (activeProject?.thumb_strategy?.layout ? [activeProject.thumb_strategy.layout] : []);
    const layoutHint = Array.isArray(layouts) && layouts.length > 0 ? layouts.join(' + ') : 'layout de alto contraste';
    const accent = activeProject?.accent_color || '#9BB0A5';

    const directive = {
      description: `CONCEITO VISUAL: Traduza o tema em tensão + resolução. Layout: ${layoutHint}. Paleta: fundo escuro com acento ${accent}. Expressão: impacto/revelação. Texto curto (máx 5 palavras) com promessa ligada à PUC. Público: ${persona}. Estrutura: ${variation}.`,
      prompt: `Create a YouTube thumbnail for a video about: "${theme}". Style: dramatic, high contrast, dark background with vivid accent color (${accent}). Layout: ${layoutHint}. Feature: close-up of person with revelatory expression OR a single symbolic object. Bold text overlay (max 5 words) aligned to this promise: "${puc}". Professional studio lighting, 4K quality. No watermarks. Aspect ratio 16:9. Photorealistic.`
    };
    setThumbnailDirective(directive);
    setShowThumbnailPanel(true);
  };

  const handleDeploy = async () => {
    if (!activeProject) return;

    const { theme } = getCommandContext();
    const editorialPillar = activeProject?.playlists?.tactical_journey?.[0]?.label || 'T1';

    // Collect narrative asset UUIDs — filter out mock/non-UUID IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assetLogIds = [
      approvedBriefing?.assetLog?.hook,
      approvedBriefing?.assetLog?.ctaMid,
      approvedBriefing?.assetLog?.ctaFinal,
    ].filter(Boolean);
    const narrativeAssetIds = assetLogIds.filter((id: string) => uuidRegex.test(id));

    // Estimate prompt tokens based on current script blocks content
    const promptTokens = Math.round(
      scriptBlocks.reduce((acc, b) => acc + (b.content?.length || 0), 0) / 4
    );

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';

    // ── Composition Log DNA (Imutável) ───────────────────────────────────────
    const compositionLogPayload = {
      llm_model_id: `${engine}:${model}`,
      narrative_asset_ids: narrativeAssetIds,
      selected_variation: approvedBriefing?.openingHook?.id || 'ASSEMBLER',
      prompt_tokens: promptTokens,
      editorial_pillar: editorialPillar,
      theme_title: theme,
      puc_snapshot: activeProject?.puc || '',
      outcome_status: 'pending' as const,
      thumbnail_url: thumbnailUrl || null,
    };

    try {
      // Write immutable DNA log to Supabase (auto-injects project_id)
      const { error: logError } = await immutableInsert('composition_log', compositionLogPayload);
      if (logError) console.warn('[Composition Log] Supabase unavailable, saving locally:', logError.message);

      // Always save locally as backup
      const existingBI = JSON.parse(localStorage.getItem(`bi_${activeProject.id}`) || '[]');
      existingBI.push({
        ...compositionLogPayload,
        project_id: activeProject.id,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(`bi_${activeProject.id}`, JSON.stringify(existingBI));

      alert(`✅ DNA Registrado!\n\nMotor: ${compositionLogPayload.llm_model_id}\nEstrutura: ${selectedVariation}\nTokens: ~${promptTokens}\nAssets: ${narrativeAssetIds.length} vinculados\n\nMétricas de performance podem ser inseridas manualmente no painel de Analytics.`);
    } catch (err) {
      console.error('[handleDeploy]', err);
    }
  };

  // ─── Assembler Approval Handler ─────────────────────────────────────────────
  const handleAssemblerApprove = (briefing: any, theme: string) => {
    setApprovedTheme(theme);
    setApprovedBriefing(briefing);

    const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };

    // Convert Briefing → ScriptBlocks for the editor
    const newBlocks: ScriptBlock[] = [
      {
        id: `h_${briefing.compositionLogId}`,
        type: 'Hook',
        title: `Hook: ${briefing.openingHook.name}`,
        content: `${theme}\n\n${briefing.openingHook.pattern}`,
        sop: `Estilo: ${sop.zoom_style}. Ritmo: ${sop.cut_rhythm}. Log ID: ${briefing.compositionLogId}`,
      },
      ...briefing.blocks.map((b: any, i: number) => ({
        id: `block_${i}_${b.id}`,
        type: 'Development' as const,
        title: `${b.name} [${b.voiceStyle}]`,
        content: `${b.missionNarrative}\n\nDesenvolver: ${b.name}`,
        sop: `Voz: ${b.voiceStyle}. Trilha: ${sop.soundtrack}. Use sobreposição de texto técnico.`,
      })),
      {
        id: `cta_${briefing.compositionLogId}`,
        type: 'CTA',
        title: `CTA: ${briefing.selectedCta.name}`,
        content: `${briefing.selectedCta.pattern}\n\nPUC: ${activeProject?.puc || 'DNA do projeto'}`,
        sop: 'CTA visual. Encerramento com trilha em crescendo.',
      },
    ];

    setScriptBlocks(newBlocks);
    setAssemblerActive(false);
  };

  const hookTemplates      = components.filter(c => c.type === 'Hook');
  const ctaTemplates       = components.filter(c => c.type === 'CTA');
  const communityTemplates = components.filter(c => c.type === 'Community');

  // ─── ASSEMBLER MODE ───────────────────────────────────────────────────────────
  if (assemblerActive && !pendingData) {
    const MobileTabs = (
      <div className="flex lg:hidden mb-4 bg-white/5 rounded-xl p-1 border border-white/10">
        {[{ id: 'context', label: 'Contexto' }, { id: 'main', label: 'Assembler' }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id as any)}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
              mobileTab === tab.id ? 'bg-sage text-midnight' : 'text-white/40 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );

    return (
      <div className="flex flex-col h-[calc(100vh-160px)] overflow-hidden w-full">
        {MobileTabs}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
          {/* Left Panel: Context — hidden on mobile when main tab active */}
          <section className={`w-full lg:w-1/3 flex-col gap-6 overflow-y-auto pr-2 pb-6 ${mobileTab === 'context' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="glass-card p-6 flex flex-col gap-4 border-sage/20 bg-sage/[0.02]">
            <label className="text-[10px] uppercase tracking-widest font-black text-sage">Instância Ativa</label>
            <div className="flex items-center justify-between p-4 bg-midnight/40 border border-white/10 rounded-2xl">
              <div className="flex flex-col gap-1">
                <span className="font-black text-sm text-white">{selectedProject}</span>
                <span className="text-[9px] text-sage font-black uppercase tracking-widest">V4 Kernel Operational</span>
              </div>
              <div className="p-2 bg-sage/10 rounded-full"><Sparkles size={14} className="text-sage" /></div>
            </div>
          </div>

          {/* Library Status Card */}
          <div className="glass-card p-6 space-y-4">
            <p className="text-[9px] font-black uppercase tracking-[3px] text-white/30">Biblioteca de Assets</p>
            <div className="space-y-2">
              {[
                { label: 'Hooks',      count: hookTemplates.length,      detail: 'openers disponíveis', color: 'text-sage' },
                { label: 'CTAs',       count: ctaTemplates.length,       detail: 'chamadas disponíveis', color: 'text-blue-400' },
                { label: 'Comunidade', count: communityTemplates.length, detail: 'elementos ativos',      color: 'text-purple-400' },
                { label: 'Pilares',    count: (activeProject?.playlists?.tactical_journey || []).length, detail: 'na jornada tática', color: 'text-orange-400' },
              ].map(({ label, count, detail, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                  <div className="text-right">
                    <span className="text-sm font-black text-white">{count}</span>
                    <span className="text-[9px] text-white/30 ml-2 font-black uppercase">{detail}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-card p-6 border-blue-500/20 bg-blue-500/[0.02] space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[3px] text-blue-400">PUC do Projeto</p>
            <p className="text-[11px] text-white/70 italic leading-relaxed">
              "{activeProject?.puc || 'DNA não definido. Configure o projeto.'}"
            </p>
          </div>
          </section>

          {/* Right Panel: Assembler — hidden on mobile when context tab active */}
          <section className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-6 ${mobileTab === 'main' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
          <ProductionAssembler
            components={components}
            onApprove={handleAssemblerApprove}
          />
          </section>
        </div>
      </div>
    );
  }

  const ScriptMobileTabs = (
    <div className="flex lg:hidden mb-4 bg-white/5 rounded-xl p-1 border border-white/10">
      {[{ id: 'context', label: 'Contexto' }, { id: 'main', label: 'Roteiro' }].map(tab => (
        <button
          key={tab.id}
          onClick={() => setMobileTab(tab.id as any)}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
            mobileTab === tab.id ? 'bg-sage text-midnight' : 'text-white/40 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col h-[calc(100vh-160px)]">
      {ScriptMobileTabs}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden animate-in">
        {/* Left: Building Blocks — hidden on mobile when main tab active */}
        <section className={`w-full lg:w-1/3 flex-col gap-6 overflow-y-auto pr-2 pb-6 custom-scrollbar ${mobileTab === 'context' ? 'flex' : 'hidden lg:flex'}`}>
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

        {/* Right: Script Workspace — hidden on mobile when context tab active */}
        <section className={`flex-1 glass-card flex-col overflow-hidden shadow-2xl border-white/10 ring-1 ring-white/5 ${mobileTab === 'main' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="p-8 border-b border-white/5 flex justify-between items-center bg-midnight/40 backdrop-blur-md">
          <div>
            <h3 className="font-bold flex items-center gap-3 text-lg">
              <Database className="text-sage" size={20} /> Production Assembler
            </h3>
            <p className="text-[11px] text-white/60 mt-1 font-bold leading-relaxed max-w-2xl">
              Validado pela PUC: <span className="font-black text-sage drop-shadow-[0_0_8px_rgba(155,176,165,0.4)]">"{activeProject?.puc || 'DNA não definido'}"</span>
            </p>
          </div>
          <div className="flex gap-3">
            <button 
              onClick={generateThumbnailDirective}
              className="px-6 py-3 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-purple-500/20"
              title="Gerar Diretriz de Thumbnail para ferramenta externa"
            >
              <Layout size={14} /> DIRETRIZ DE THUMB
            </button>
            <button 
              onClick={handleDeploy}
              className="px-6 py-3 bg-sage/10 text-sage hover:bg-sage hover:text-midnight rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-sage/20"
              title="Registrar Log de Composição e Deploy na BI"
            >
              <Save size={14} /> REGISTRAR DNA
            </button>
            <button
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de copiar/gerar versão.');
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
                alert('✅ Briefing copiado + versão salva localmente.');
              }}
              className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
              title="Copiar briefing (JSON) e salvar versão local"
            >
              <Copy size={20} />
            </button>
            <button 
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de gerar o roteiro.');
                setIsGeneratingScript(true);
                try {
                  const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
                  const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
                  const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
                  if (!apiKey) {
                    setIsGeneratingScript(false);
                    return alert('Configure sua chave de API em Ajustes Globais para gerar o roteiro.');
                  }

                  const minutes = Number((approvedBriefing.estimatedDuration || '').match(/\d+/)?.[0] || 0);
                  const targetChars = Number(approvedBriefing.estimatedChars || (minutes ? minutes * 1200 : 0)) || 0;

                  for (let i = 0; i < scriptBlocks.length; i++) {
                    const block = scriptBlocks[i];
                    const prompt = `Você é um roteirista técnico sênior. Gere o TEXTO FINAL do bloco abaixo.

REGRAS:
- Linguagem direta, pragmática.
- Voz coerente com o tipo do bloco.
- Use metáforas do projeto quando fizer sentido.
- Não escreva markdown.

CONTEXTO DO PROJETO:
PUC: ${activeProject?.puc || ''}
Persona: ${activeProject?.persona_matrix?.demographics || ''}
Dor Central: ${activeProject?.persona_matrix?.pain_alignment || ''}
Metáforas: ${activeProject?.metaphor_library || ''}
Elementos de Comunidade: ${(communityTemplates || []).map((c: any) => c.content_pattern || c.name).filter(Boolean).join(' | ')}

TEMA: ${approvedBriefing.title}
DURAÇÃO ALVO (min): ${minutes || 'N/A'}
CHARS ALVO (aprox): ${targetChars || 'N/A'}

BLOCO:
Tipo: ${block.type}
Título: ${block.title}
Instruções atuais: ${block.content}
SOP: ${block.sop || ''}

RETORNE APENAS O TEXTO FINAL DO BLOCO.`;

                    const res = await fetch('/api/ai/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        engine,
                        model,
                        prompt,
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

                    const nextBlocks = [...scriptBlocks];
                    nextBlocks[i] = { ...nextBlocks[i], content: (text || nextBlocks[i].content).trim() };
                    setScriptBlocks(nextBlocks);
                  }

                  alert('✅ Roteiro IA gerado nos blocos.');
                } catch (e: any) {
                  alert(`Erro ao gerar roteiro: ${e.message || e}`);
                } finally {
                  setIsGeneratingScript(false);
                }
              }}
              disabled={isGeneratingScript}
              className="px-8 py-3 bg-sage text-midnight rounded-xl font-black text-[10px] uppercase tracking-[2px] shadow-lg shadow-sage/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
              title="Gerar texto final para cada bloco via IA"
            >
              {isGeneratingScript ? 'GERANDO...' : 'GERAR ROTEIRO IA'} <Play size={14} fill="currentColor" />
            </button>
          </div>
        </div>

        {/* Thumbnail Directive Panel */}
        {showThumbnailPanel && thumbnailDirective && (
          <div className="mx-8 my-4 p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">🎨 Diretriz de Thumbnail</span>
              <button onClick={() => setShowThumbnailPanel(false)} className="text-white/20 hover:text-white text-sm">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1">— CONCEITO VISUAL</span>
                <p className="text-[11px] text-white/70 leading-relaxed bg-midnight/40 p-3 rounded-xl border border-white/5">{thumbnailDirective.description}</p>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1">— PROMPT PARA MIDJOURNEY / DALL-E</span>
                <div className="relative">
                  <p className="text-[11px] text-white/80 leading-relaxed bg-midnight/40 p-3 rounded-xl border border-white/5 font-mono pr-10">{thumbnailDirective.prompt}</p>
                  <button 
                    onClick={() => navigator.clipboard.writeText(thumbnailDirective.prompt)}
                    className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/20 rounded-lg text-white/30 hover:text-white transition-all"
                  ><Copy size={12} /></button>
                </div>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1">— LINK DA THUMBNAIL GERADA</span>
                <input
                  value={thumbnailUrl}
                  onChange={e => setThumbnailUrl(e.target.value)}
                  placeholder="Cole aqui a URL da imagem gerada externamente..."
                  className="w-full bg-midnight/40 border border-white/10 rounded-xl px-4 py-2 text-[11px] text-white placeholder-white/20 outline-none focus:border-purple-500/40 font-bold"
                />
              </div>
            </div>
          </div>
        )}

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
                      className="w-full bg-midnight/20 border border-white/5 rounded-2xl px-5 py-4 text-white/90 leading-relaxed outline-none transition-all resize-none overflow-hidden min-h-[160px] text-sm font-medium placeholder:text-white/10"
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
                      className="w-full bg-transparent text-[12px] text-white/70 font-medium leading-relaxed outline-none resize-none overflow-hidden min-h-[120px] italic border-t border-white/5 pt-4 mt-2"
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
    </div>
  );
}
