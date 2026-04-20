'use client';

import { useState } from 'react';
import CustomSelect from './ui/CustomSelect';
import { 
  Building2, 
  Target, 
  Cpu, 
  Rocket, 
  ChevronRight, 
  CheckCircle2,
  Palette,
  Eye,
  Zap,
  Ban,
  Plus,
  Trash2,
  Layout,
  HelpCircle
} from 'lucide-react';

interface WizardProps {
  onClose: () => void;
  onComplete: (projectData: any) => void;
  initialData?: any;
  existingProjects?: any[];
}

export default function ProjectWizardModal({ onClose, onComplete, initialData, existingProjects = [] }: WizardProps) {
  const [step, setStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [nameError, setNameError] = useState('');

  const toNumberOrEmpty = (value: unknown) => {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : '';
  };

  const normalizeJourney = (journey: any[] = []) => {
    const fallback = [
      { id: 't1', label: 'T1', title: 'Topo de Funil (Viral)', value: '', isFixed: true },
      { id: 't2', label: 'T2', title: 'Meio de Funil (Retenção)', value: '', isFixed: true },
      { id: 't3', label: 'T3', title: 'Fundo de Funil (Comunidade)', value: '', isFixed: true }
    ];
    return [0, 1, 2].map((index) => ({
      ...fallback[index],
      ...(journey[index] || {}),
      id: journey[index]?.id || fallback[index].id,
      label: journey[index]?.label || fallback[index].label,
      title: journey[index]?.title || fallback[index].title,
      value: journey[index]?.value || '',
      isFixed: journey[index]?.isFixed ?? true,
    }));
  };

  const normalizeEditingSop = (s: any) => {
    const source = s || {};
    return {
      cut_rhythm: source.cut_rhythm || '',
      zoom_style: source.zoom_style || '',
      soundtrack: source.soundtrack || '',
      art_direction: source.art_direction || '',
      overlays: source.overlays || '',
      duration: source.duration || '',
      duration_min: toNumberOrEmpty(source.duration_min ?? source.duration),
      duration_max: toNumberOrEmpty(source.duration_max),
      blocks_variation: source.blocks_variation || '',
      blocks_min: toNumberOrEmpty(source.blocks_min),
      blocks_max: toNumberOrEmpty(source.blocks_max),
      asset_types: Array.isArray(source.asset_types) ? source.asset_types : [],
      measurement_focus: source.measurement_focus || '',
      text_styles: source.text_styles || '',
    };
  };

  const normalizeThumbStrategy = (s: any) => {
    const source = s || {};
    const layouts = Array.isArray(source.layouts) && source.layouts.length > 0
      ? source.layouts
      : source.layout
        ? [source.layout]
        : ['Rosto+Texto'];

    return {
      layouts,
      layout: source.layout || layouts[0] || 'Rosto+Texto',
      description: source.description || '',
      consistency_rules: source.consistency_rules || '',
    };
  };

  const normalizePhdStrategy = (s: any) => {
    const source = s || {};
    return {
      passion: source.passion || '',
      skill: source.skill || '',
      demand: source.demand || '',
    };
  };

  const normalizePersonaMatrix = (s: any, targetPersona: any = {}) => {
    const source = s || {};
    return {
      demographics: source.demographics || targetPersona.audience || '',
      language: source.language || '',
      pain_alignment: source.pain_alignment || targetPersona.pain_point || '',
      desired_outcome: source.desired_outcome || '',
      proof_points: source.proof_points || '',
    };
  };

  const normalizeEditorialLine = (s: any) => {
    const source = s || {};
    return {
      pillars: normalizePillarList(source.pillars),
      positioning_angle: source.positioning_angle || '',
      content_boundaries: source.content_boundaries || '',
    };
  };

  const normalizeNarrativeVoice = (s: any) => {
    const source = s || {};
    return {
      atmosphere: Array.isArray(source.atmosphere) ? source.atmosphere : (source.atmosphere ? [source.atmosphere] : []),
      positioning: source.positioning || '',
    };
  };

  const normalizePillarList = (pillars: any) => {
    const list = Array.isArray(pillars) ? pillars : [];
    return [...list, '', '', '', '', ''].slice(0, 5).map((item) => item || '');
  };
  
  // Data Normalization & Initialization
  const [formData, setFormData] = useState(() => {
    const d = initialData || {};
    const journey = normalizeJourney(d.playlists?.tactical_journey || d.tactical_journey || []);
    const thumbStrategy = normalizeThumbStrategy(d.thumb_strategy || {});
    const editingSop = normalizeEditingSop(d.detailed_sop || d.editing_sop || {});
    return {
      id: d.id || '',
      name: d.name || d.project_name || '',
      puc: d.puc || d.puc_promise || '',
      accent_color: d.accent_color || '#3b82f6',
      default_execution_mode: d.default_execution_mode || 'internal',
      
      // Stage 1: Fundação (DNA)
      phd_strategy: normalizePhdStrategy(d.phd_strategy || {}),
      persona_matrix: normalizePersonaMatrix(d.persona_matrix || {}, d.target_persona || {}),
      
      // Stage 2: Inteligência (Editorial)
      editorial_line: normalizeEditorialLine(d.editorial_line || {}),
      narrative_voice: normalizeNarrativeVoice(d.narrative_voice || {}),
      
      // Stage 3: Engenharia (Packaging)
      metaphor_library: d.metaphor_library || d.ai_engine_rules?.metaphors?.join(', ') || '',
      prohibited_terms: d.prohibited_terms || d.ai_engine_rules?.prohibited?.join(', ') || '',
      thumb_strategy: thumbStrategy,
      
      // Stage 4: Produção (SOP)
      editing_sop: editingSop,
      tactical_journey: journey
    };
  });

  const updateFormData = (data: Partial<typeof formData>) => {
    setFormData(prev => ({ ...prev, ...data }));
  };

  const buildTraceabilitySummary = () => {
    const pillars = formData.editorial_line.pillars.filter((p: string) => p.trim() !== '');
    const layouts = formData.thumb_strategy.layouts || [];
    return {
      summary: [
        `PUC: ${formData.puc}`,
        `Persona: ${formData.persona_matrix.demographics}${formData.persona_matrix.language ? ` | Linguagem: ${formData.persona_matrix.language}` : ''}`,
        `Dor central: ${formData.persona_matrix.pain_alignment}`,
        `Transformação desejada: ${formData.persona_matrix.desired_outcome || 'Não definida'}`,
        `Pilares: ${pillars.join(', ') || 'Não definidos'}`,
        `Metáforas: ${formData.metaphor_library || 'Não definidas'}`,
        `Thumb: ${layouts.join(' + ') || 'Não definida'}`,
        `SOP foco: ${formData.editing_sop.measurement_focus || 'Não definido'}`
      ],
      sources: {
        puc: formData.puc,
        persona: formData.persona_matrix,
        editorial_line: formData.editorial_line,
        metaphor_library: formData.metaphor_library,
        thumb_strategy: formData.thumb_strategy,
        editing_sop: formData.editing_sop
      }
    };
  };

  const isStepValid = () => {
    switch(step) {
      case 1: 
        const isNameTaken = existingProjects.some(p => 
          p.name?.toLowerCase() === formData.name.trim().toLowerCase() && p.id !== formData.id
        );
        return formData.name.trim() !== '' && !isNameTaken && formData.puc.trim() !== '' && formData.phd_strategy.passion.trim() !== '';
      case 2: return formData.editorial_line.pillars.filter((p: string) => p.trim() !== '').length >= 3;
      case 3: return formData.metaphor_library.trim() !== '';
      case 4: 
        const sop = formData.editing_sop;
        const hasSopConfig = sop.cut_rhythm && sop.zoom_style && sop.soundtrack && sop.art_direction && sop.overlays;
        const durationMin = Number(sop.duration_min || 0);
        const durationMax = Number(sop.duration_max || 0);
        const blocksMin = Number(sop.blocks_min || 0);
        const blocksMax = Number(sop.blocks_max || 0);
        const hasValidRanges = durationMin > 0 && durationMax >= durationMin && blocksMin > 0 && blocksMax >= blocksMin;
        const hasTacticalJourney = formData.tactical_journey.every((m: any) => m.title.trim() !== '' && m.value.trim() !== '');
        return hasSopConfig && hasValidRanges && hasTacticalJourney;
      default: return false;
    }
  };

  const handleFinalize = () => {
    if (isSubmitting) return;
    setIsSubmitting(true);
    const traceability = buildTraceabilitySummary();
    
    onComplete({
      ...formData,
      id: formData.id || crypto.randomUUID(),
      default_execution_mode: formData.default_execution_mode || 'internal',
      target_persona: {
        audience: formData.persona_matrix.demographics,
        pain_point: formData.persona_matrix.pain_alignment
      },
      ai_engine_rules: {
        metaphors: formData.metaphor_library.split(',').map((s: string) => s.trim()).filter(Boolean),
        prohibited: formData.prohibited_terms.split(',').map((s: string) => s.trim()).filter(Boolean)
      },
      playlists: {
        t1: formData.tactical_journey[0]?.value || '',
        t1_title: formData.tactical_journey[0]?.title || '',
        t2: formData.tactical_journey[1]?.value || '',
        t2_title: formData.tactical_journey[1]?.title || '',
        t3: formData.tactical_journey[2]?.value || '',
        t3_title: formData.tactical_journey[2]?.title || '',
        tactical_journey: formData.tactical_journey 
      },
      traceability_summary: traceability.summary,
      traceability_sources: traceability.sources
    });
  };

  const renderStepContent = () => {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col gap-10 animate-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-[1fr_2fr] gap-8">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-blue-400 mb-1">Identificador do Projeto</label>
                <span className="text-[9px] uppercase font-bold text-white/40 -mt-1 mb-1">Nome de destaque da instância.</span>
                <input 
                  className={`w-full bg-blue-500/5 border ${nameError ? 'border-red-500/50 focus:border-red-500' : 'border-blue-500/10 focus:border-blue-500'} rounded-2xl px-5 py-5 outline-none focus:ring-4 focus:ring-blue-500/10 transition-all text-white font-black text-lg placeholder:text-white/10`}
                  placeholder="Nome da instancia"
                  value={formData.name}
                  onChange={(e) => {
                    const newName = e.target.value;
                    updateFormData({ name: newName });
                    const isTaken = existingProjects.some(p => 
                      p.name?.toLowerCase() === newName.trim().toLowerCase() && p.id !== formData.id
                    );
                    setNameError(isTaken ? 'Este nome já está sendo usado por outra instância.' : '');
                  }}
                />
                {nameError && <span className="text-[10px] text-red-400 font-bold uppercase tracking-wider ml-1">{nameError}</span>}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-white/60 mb-1">Proposta Única do Canal (PUC)</label>
                <span className="text-[9px] uppercase font-bold text-white/50 -mt-1 mb-1">A promessa central que torna seu canal imbatível.</span>
                <textarea 
                  className="w-full bg-white/5 border border-white/10 rounded-2xl px-6 py-5 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-white font-bold min-h-[90px] resize-none"
                  placeholder="Qual o diferencial imbatível do canal?"
                  value={formData.puc}
                  onChange={(e) => updateFormData({ puc: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-6">
              {['passion', 'skill', 'demand'].map((f: string) => (
                <div key={f} className="p-5 rounded-2xl border border-white/10 bg-white/[0.02] hover:bg-white/[0.05] transition-all">
                  <label className="text-[9px] font-black uppercase text-white/60 tracking-widest">{f}</label>
                  <p className="text-[8px] uppercase font-bold text-white/40 leading-tight mt-0.5 mb-3">
                    {f === 'passion' ? 'O que te move por anos' : f === 'skill' ? 'Sua autoridade técnica' : 'Volume de audiência real'}
                  </p>
                  <textarea 
                    className="w-full bg-transparent border-none text-white text-xs outline-none h-24 resize-none leading-relaxed placeholder:text-white/5"
                    placeholder={`Descreva sua ${f}...`}
                    value={(formData.phd_strategy as any)[f]}
                    onChange={(e) => updateFormData({ phd_strategy: { ...formData.phd_strategy, [f]: e.target.value } })}
                  />
                </div>
              ))}
            </div>
            <div className="p-8 rounded-[32px] border border-white/10 bg-white/[0.03] shadow-inner">
              <label className="text-[10px] uppercase font-black tracking-widest text-white/60 mb-1 block">Matriz de Persona (Target)</label>
              <span className="text-[9px] uppercase font-bold text-white/40 block mb-6">Desenhe o avatar que você deseja dominar e ajudar.</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-black text-white/40 ml-1">Lifestyle / Demografia</span>
                  <input 
                    className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-sage/10 focus:border-sage transition-all text-sm text-white placeholder:text-white/10"
                    placeholder="Defina o perfil do público"
                    value={formData.persona_matrix.demographics}
                    onChange={(e) => updateFormData({ persona_matrix: { ...formData.persona_matrix, demographics: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-black text-white/40 ml-1">Ponto de Dor Central</span>
                  <input 
                    className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-sage/10 focus:border-sage transition-all text-sm text-white placeholder:text-white/10"
                    placeholder="Defina o problema principal que o conteúdo resolve"
                    value={formData.persona_matrix.pain_alignment}
                    onChange={(e) => updateFormData({ persona_matrix: { ...formData.persona_matrix, pain_alignment: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-black text-white/40 ml-1">Linguagem e Repertorio</span>
                  <input 
                    className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-sage/10 focus:border-sage transition-all text-sm text-white placeholder:text-white/10"
                    placeholder="Como esse publico fala, pensa e se reconhece"
                    value={formData.persona_matrix.language || ''}
                    onChange={(e) => updateFormData({ persona_matrix: { ...formData.persona_matrix, language: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-[9px] uppercase font-black text-white/40 ml-1">Transformacao Desejada</span>
                  <input 
                    className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-sage/10 focus:border-sage transition-all text-sm text-white placeholder:text-white/10"
                    placeholder="Qual mudanca pratica esse projeto quer habilitar"
                    value={formData.persona_matrix.desired_outcome || ''}
                    onChange={(e) => updateFormData({ persona_matrix: { ...formData.persona_matrix, desired_outcome: e.target.value } })}
                  />
                </div>
              </div>
            </div>
            <div className="p-8 rounded-[32px] border border-blue-500/5 bg-blue-500/[0.01] shadow-inner">
              <label className="text-[10px] uppercase font-black tracking-widest text-blue-400 mb-1 block">Rastreabilidade Gerada pela Aplicação</label>
              <span className="text-[9px] uppercase font-bold text-white/40 block mb-6">Você não precisa preencher isto manualmente. A aplicação monta esse resumo a partir dos campos anteriores e usa isso nas análises futuras.</span>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {buildTraceabilitySummary().summary.map((item: string) => (
                  <div key={item} className="p-4 rounded-2xl border border-white/10 bg-white/[0.03]">
                    <p className="text-[10px] text-white/70 leading-relaxed">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 2:
        return (
          <div className="flex flex-col gap-10 animate-in slide-in-from-bottom-4">
            <div className="flex flex-col gap-6">
              <div className="flex flex-col">
                <h3 className="text-[12px] font-black text-white/70 uppercase tracking-[4px]">Linha Editorial (Os 5 Pilares)</h3>
                <span className="text-[10px] uppercase font-bold text-white/40 mt-1">Os sub-tópicos que delimitam seu território estratégico.</span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
                {formData.editorial_line.pillars.map((p: string, i: number) => (
                  <div key={i} className="flex flex-col gap-2">
                    <span className="text-[9px] font-black text-white/20 ml-1">PILAR 0{i+1}</span>
                    <input 
                      className="p-5 bg-white/5 border border-white/10 rounded-2xl text-center text-xs font-bold text-white outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all placeholder:text-white/5"
                      placeholder="Tema..."
                      value={p}
                      onChange={(e) => {
                        const newP = [...formData.editorial_line.pillars];
                        newP[i] = e.target.value;
                        updateFormData({ editorial_line: { ...formData.editorial_line, pillars: newP } });
                      }}
                    />
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-6">
              <div className="p-6 rounded-2xl border border-white/5 bg-midnight/40 shadow-inner">
                <label className="text-[9px] font-black uppercase tracking-widest text-sage mb-1 block">Atmosfera Narrativa</label>
                <span className="text-[8px] uppercase font-bold opacity-30 block mb-4">O clima emocional e o posicionamento do seu conteúdo.</span>
                <div className="grid grid-cols-2 gap-2">
                  {['Técnico', 'Reflexivo', 'Cético', 'Storyteller'].map((t: string) => (
                    <button
                      key={t}
                      onClick={() => {
                        const next = formData.narrative_voice.atmosphere.includes(t)
                          ? formData.narrative_voice.atmosphere.filter((v: string) => v !== t)
                          : [...formData.narrative_voice.atmosphere, t];
                        updateFormData({ narrative_voice: { ...formData.narrative_voice, atmosphere: next } });
                      }}
                      className={`py-3 rounded-xl border text-[9px] font-black transition-all ${
                        formData.narrative_voice.atmosphere.includes(t)
                        ? 'bg-blue-600 border-blue-500 text-white shadow-lg shadow-blue-500/20'
                        : 'bg-white/5 border-white/5 text-white/30 hover:border-white/10'
                      }`}
                    >{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] uppercase font-bold text-white/20 ml-2">Posicionamento do Narrador</span>
                <textarea 
                  className="p-6 bg-white/5 border border-white/10 rounded-2xl outline-none text-xs text-white leading-relaxed resize-none h-full"
                  placeholder="Quem é você para o seu público? O Mentor, o Cético ou o Oráculo?"
                  value={formData.narrative_voice.positioning}
                  onChange={(e) => updateFormData({ narrative_voice: { ...formData.narrative_voice, positioning: e.target.value } })}
                />
                <span className="text-[8px] uppercase font-bold opacity-10 ml-2">Define a hierarquia de autoridade com a persona.</span>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <span className="text-[9px] uppercase font-bold text-white/20 ml-2">Angulo Editorial</span>
                <textarea
                  className="p-5 bg-white/5 border border-white/10 rounded-2xl outline-none text-xs text-white leading-relaxed resize-none min-h-[110px]"
                  placeholder="Qual e o recorte que diferencia esta instancia de outras no mesmo universo?"
                  value={formData.editorial_line.positioning_angle || ''}
                  onChange={(e) => updateFormData({ editorial_line: { ...formData.editorial_line, positioning_angle: e.target.value } })}
                />
              </div>
              <div className="flex flex-col gap-2">
                <span className="text-[9px] uppercase font-bold text-white/20 ml-2">Fronteiras de Conteudo</span>
                <textarea
                  className="p-5 bg-white/5 border border-white/10 rounded-2xl outline-none text-xs text-white leading-relaxed resize-none min-h-[110px]"
                  placeholder="O que entra, o que nao entra e quais desvios devem ser evitados"
                  value={formData.editorial_line.content_boundaries || ''}
                  onChange={(e) => updateFormData({ editorial_line: { ...formData.editorial_line, content_boundaries: e.target.value } })}
                />
              </div>
            </div>
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col gap-10 animate-in slide-in-from-bottom-4">
            <div className="grid grid-cols-2 gap-6">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-sage mb-1">Engenharia de Metáforas</label>
                <span className="text-[9px] uppercase font-bold text-white/50 -mt-1 mb-2">Analogias que simplificam o complexo e criam uma marca única.</span>
                <textarea 
                  className="w-full bg-white/5 border border-white/10 rounded-3xl px-8 py-8 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-white text-sm min-h-[250px] leading-relaxed resize-none placeholder:text-white/10 shadow-inner"
                  value={formData.metaphor_library}
                  onChange={(e) => updateFormData({ metaphor_library: e.target.value })}
                  placeholder="Cadastre as analogias e termos técnicos proprietários do canal..."
                />
              </div>
              <div className="flex flex-col gap-4">
                <div className="flex flex-col">
                  <label className="text-[10px] uppercase font-black tracking-widest text-blue-400">Layout de Thumbnail</label>
                  <span className="text-[9px] uppercase font-bold opacity-30 mt-1">A narrativa visual que interrompe o scroll e força o clique.</span>
                </div>
                <div className="grid grid-cols-1 gap-3">
                  {['Rosto+Texto', 'Objeto+Fundo', 'Contraste Emocional'].map((l: string) => {
                    const currentLayouts = formData.thumb_strategy.layouts || (formData.thumb_strategy.layout ? [formData.thumb_strategy.layout] : []);
                    const isSelected = currentLayouts.includes(l);
                    return (
                      <button
                        key={l}
                        onClick={() => {
                          const next = isSelected ? currentLayouts.filter((c: string) => c !== l) : [...currentLayouts, l];
                          updateFormData({ thumb_strategy: { ...formData.thumb_strategy, layouts: next } });
                        }}
                        className={`p-5 rounded-2xl border text-left flex items-center justify-between transition-all group ${
                          isSelected
                          ? 'bg-blue-600 border-blue-500 text-white shadow-xl'
                          : 'bg-white/5 border-white/5 text-white/40 hover:bg-white/[0.07] hover:border-white/10'
                        }`}
                      >
                        <span className="text-xs font-black uppercase tracking-widest">{l}</span>
                        {isSelected ? (
                          <CheckCircle2 size={18} className="text-midnight" />
                        ) : (
                          <ChevronRight size={18} className="text-white/20 group-hover:translate-x-1 transition-transform" />
                        )}
                      </button>
                    );
                  })}
                </div>
                {((formData.thumb_strategy.layouts || (formData.thumb_strategy.layout ? [formData.thumb_strategy.layout] : [])).length > 0) && (
                  <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                    <textarea
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-xs text-white resize-none h-20 placeholder:text-white/20 font-medium"
                      placeholder="Especifique detalhes da thumbnail (ex: Cores predominantes, estilo da fonte, elementos de contraste)..."
                      value={formData.thumb_strategy.description || ''}
                      onChange={(e) => updateFormData({ thumb_strategy: { ...formData.thumb_strategy, description: e.target.value } })}
                    />
                  </div>
                )}
                <div className="mt-2 animate-in fade-in slide-in-from-top-2">
                  <textarea
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-xs text-white resize-none h-20 placeholder:text-white/20 font-medium"
                    placeholder="Regras de consistencia visual: estilo da imagem, enquadramento, contraste, tipografia e o que evitar"
                    value={formData.thumb_strategy.consistency_rules || ''}
                    onChange={(e) => updateFormData({ thumb_strategy: { ...formData.thumb_strategy, consistency_rules: e.target.value } })}
                  />
                </div>
                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-[10px] uppercase font-black tracking-widest text-red-100/30">Termos Proibidos</label>
                  <span className="text-[8px] uppercase font-bold opacity-10 -mt-1">Palavras genéricas que destroem sua autoridade.</span>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none text-xs text-white"
                    placeholder="Ex: Incrível, Segredo, Chocado..."
                    value={formData.prohibited_terms}
                    onChange={(e) => updateFormData({ prohibited_terms: e.target.value })}
                  />
                </div>
              </div>
            </div>
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col gap-10 animate-in slide-in-from-bottom-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Configurações de Estilo */}
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Ritmo de Corte', field: 'cut_rhythm', options: ['1s', '2-3s', '3s', '5s'] },
                  { label: 'Estilo de Zoom', field: 'zoom_style', options: ['Stable', 'Dynamic', 'Punch'] },
                  { label: 'Trilha Sonora', field: 'soundtrack', options: ['Epic', 'Chill', 'Dark', 'Lofi'] },
                  { label: 'Estilo Visual', field: 'art_direction', options: ['Realista', 'Cinematic', 'Minimalista', 'Cyberpunk'] },
                  { label: 'Textos (Overlays)', field: 'overlays', options: ['Apenas palavras-chave', 'Legendas completas', 'Sem texto'] },
                ].map((item) => (
                  <div key={item.field} className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-black uppercase tracking-widest text-sage">{item.label}</label>
                    <CustomSelect
                      value={(formData.editing_sop as any)[item.field]}
                      onChange={(val) => updateFormData({ editing_sop: { ...formData.editing_sop, [item.field]: val } })}
                      options={item.options.map((opt: string) => ({ value: opt, label: opt }))}
                      placeholder="Selecionar..."
                    />
                  </div>
                ))}
              </div>

              {/* Configurações de Range (Duração e Blocos) */}
              <div className="flex flex-col gap-2">
                <label className="text-[9px] font-black uppercase tracking-widest text-sage">Modo Padrao de Producao</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {[
                    { value: 'internal', title: 'No aplicativo', description: 'Usa a geracao do proprio app como caminho padrao.' },
                    { value: 'external', title: 'Em plataforma externa', description: 'Gera o prompt no app e recebe o roteiro final por texto ou .txt.' }
                  ].map((option) => {
                    const isActive = formData.default_execution_mode === option.value;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => updateFormData({ default_execution_mode: option.value })}
                        className={`text-left rounded-2xl border px-4 py-4 transition-all ${
                          isActive
                            ? 'bg-blue-500/10 border-blue-500/40 shadow-lg shadow-blue-500/10'
                            : 'bg-white/5 border-white/10 hover:border-white/20'
                        }`}
                      >
                        <span className={`block text-[11px] font-black uppercase tracking-[2px] ${isActive ? 'text-blue-300' : 'text-white/80'}`}>
                          {option.title}
                        </span>
                        <span className="block mt-2 text-[10px] leading-relaxed text-white/45">
                          {option.description}
                        </span>
                      </button>
                    );
                  })}
                </div>
                <span className="text-[10px] text-white/35">
                  Esse modo vira o padrao do canal, mas pode ser trocado dentro da Escrita Criativa a cada roteiro.
                </span>
              </div>

              <div className="grid grid-cols-1 gap-6 p-6 bg-white/[0.03] rounded-3xl border border-white/10 shadow-inner">
                <div className="space-y-4">
                  <label className="text-[10px] font-black uppercase tracking-[3px] text-blue-300 block mb-2">Controle de Range (Calibragem)</label>
                  
                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] uppercase font-bold text-white/40">Duração Mín (min)</span>
                      <input 
                        type="number"
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-black outline-none focus:border-sage transition-all"
                        value={formData.editing_sop.duration_min || ''}
                        onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, duration_min: Number(e.target.value) } })}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] uppercase font-bold text-white/40">Duração Máx (min)</span>
                      <input 
                        type="number"
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-black outline-none focus:border-sage transition-all"
                        value={formData.editing_sop.duration_max || ''}
                        onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, duration_max: Number(e.target.value) } })}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] uppercase font-bold text-white/40">Mínimo de Blocos</span>
                      <input 
                        type="number"
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-black outline-none focus:border-sage transition-all"
                        value={formData.editing_sop.blocks_min || ''}
                        onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, blocks_min: Number(e.target.value) } })}
                      />
                    </div>
                    <div className="flex flex-col gap-2">
                      <span className="text-[9px] uppercase font-bold text-white/40">Máximo de Blocos</span>
                      <input 
                        type="number"
                        className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-xs font-black outline-none focus:border-sage transition-all"
                        value={formData.editing_sop.blocks_max || ''}
                        onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, blocks_max: Number(e.target.value) } })}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex flex-col gap-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-sage">Tipos de Assets</label>
                  <div className="flex flex-wrap gap-2">
                    {['IA Images', 'Stock Video', 'Code Snippets', 'B-Roll', 'Avatar'].map((opt: string) => {
                      const isSelected = (formData.editing_sop.asset_types || []).includes(opt);
                      return (
                        <button
                          key={opt}
                          onClick={() => {
                            const current = formData.editing_sop.asset_types || [];
                            const next = isSelected ? current.filter((c: string) => c !== opt) : [...current, opt];
                            updateFormData({ editing_sop: { ...formData.editing_sop, asset_types: next } });
                          }}
                          className={`px-3 py-2 rounded-xl text-[9px] font-black uppercase border transition-all ${
                            isSelected 
                            ? 'bg-blue-500 border-blue-500 text-white shadow-lg shadow-blue-500/20' 
                            : 'bg-white/5 border-white/10 text-white/30 hover:border-white/30'
                          }`}
                        >
                          {opt}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-sage">Estilos Disponiveis de Texto (Render)</label>
                  <span className="text-[8px] uppercase font-bold text-white/40 -mt-1 mb-1">Separados por virgula. Usados pela IA ou no dropdown de Escrita Criativa.</span>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white text-[11px] font-black outline-none focus:border-sage transition-all placeholder:text-white/20"
                    placeholder="Ex: Tech Neon, Vintage VHS, Clean White..."
                    value={formData.editing_sop.text_styles || ''}
                    onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, text_styles: e.target.value } })}
                  />
                </div>
              </div>
            </div>
            <div className="space-y-4">
              <div className="flex flex-col">
                <h3 className="text-[12px] font-black text-white/70 uppercase tracking-[4px]">Jornada Tática (Pipeline de Deploy)</h3>
                <span className="text-[10px] uppercase font-bold text-white/40 mt-1">Sua estratégia de progressão de conteúdo do diagnóstico ao lifestyle.</span>
              </div>
              {formData.tactical_journey.map((m: any, i: number) => (
                <div key={m.id} className="grid grid-cols-1 md:grid-cols-[1.5fr_2fr] gap-6 p-6 border border-white/10 rounded-3xl bg-white/[0.02] hover:bg-white/[0.05] transition-all group shadow-sm">
                  <div className="flex items-center gap-5">
                    <div className="w-10 h-10 rounded-xl bg-sage/10 flex items-center justify-center text-[11px] font-black text-sage border border-sage/20 shrink-0 shadow-lg shadow-sage/5">{m.label}</div>
                    <input 
                      className="bg-transparent text-white font-black text-base outline-none w-full group-hover:text-sage transition-colors placeholder:text-white/5"
                      placeholder="Módulo..."
                      value={m.title}
                      onChange={(e) => {
                        const next = [...formData.tactical_journey];
                        next[i].title = e.target.value;
                        updateFormData({ tactical_journey: next });
                      }}
                    />
                  </div>
                  <input 
                    className="bg-white/5 border border-white/5 rounded-xl px-5 py-3 text-white/80 text-[12px] outline-none focus:border-sage/40 transition-all italic font-medium placeholder:text-white/10"
                    placeholder="Objetivo estratégico deste módulo..."
                    value={m.value}
                    onChange={(e) => {
                      const next = [...formData.tactical_journey];
                      next[i].value = e.target.value;
                      updateFormData({ tactical_journey: next });
                    }}
                  />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2">
              <label className="text-[10px] uppercase font-black tracking-widest text-sage">Foco de Analise e Revisao</label>
              <textarea
                className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-sage/10 focus:border-sage transition-all text-sm text-white min-h-[96px] resize-none placeholder:text-white/10"
                placeholder="O que deve ser verificado depois: retencao, CTR, aderencia ao publico, consistencia dos assets, clareza da promessa..."
                value={formData.editing_sop.measurement_focus || ''}
                onChange={(e) => updateFormData({ editing_sop: { ...formData.editing_sop, measurement_focus: e.target.value } })}
              />
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="fixed inset-0 z-[1000] bg-midnight/95 backdrop-blur-2xl flex items-center justify-center p-4 animate-in fade-in duration-500">
      <div className="glass-card w-full max-w-5xl h-[90vh] flex flex-col shadow-2xl border-white/10 overflow-hidden ring-1 ring-white/5">
        
        {/* Progress Bar & Header */}
        <div className="flex flex-col flex-none">
            <div className="h-1 bg-white/5 w-full">
              <div 
              className="h-full bg-blue-500 transition-all duration-700 ease-out shadow-[0_0_15px_rgba(59,130,246,0.5)]" 
              style={{ width: `${(step / 4) * 100}%` }}
            />
          </div>
          
          <div className="p-10 flex justify-between items-center border-b border-white/5 bg-midnight/30">
            <div>
              <h2 className="text-2xl font-bold tracking-tighter text-white flex items-center gap-3">
                WRITER STUDIO <span className="font-light opacity-30 italic">OS</span>
              </h2>
              <div className="flex items-center gap-3 mt-1">
                <span className="text-[10px] font-black bg-blue-500 text-white px-2 py-0.5 rounded uppercase tracking-wider">Etapa 0{step}</span>
                <span className="text-white/30 text-[10px] font-black uppercase tracking-[3px]">
                  {step === 1 ? 'Fundação DNA' : step === 2 ? 'Crivo Editorial' : step === 3 ? 'Engenharia de Clique' : 'SOP de Produção'}
                </span>
              </div>
            </div>
            <button 
              onClick={onClose} 
              className="w-10 h-10 flex items-center justify-center hover:bg-red-500/10 border border-white/10 rounded-full transition-all text-white/20 hover:text-red-500 group"
            >
              <span className="group-hover:rotate-90 transition-transform">✕</span>
            </button>
          </div>
        </div>

        {/* Step Content */}
        <div className="flex-1 overflow-y-auto p-12 custom-scrollbar bg-gradient-to-b from-transparent to-midnight/20">
          <div className="max-w-4xl mx-auto">
            {renderStepContent()}
          </div>
        </div>

        {/* Action Footer */}
        <div className="p-10 border-t border-white/5 flex justify-between items-center bg-midnight/80 backdrop-blur-xl z-20 flex-none">
          <div className="flex items-center gap-8">
            <div className="flex gap-1.5">
              {[1, 2, 3, 4].map(s => (
                <div key={s} className={`h-1 rounded-full transition-all duration-500 ${step === s ? 'w-8 bg-blue-500' : s < step ? 'w-4 bg-blue-500/30' : 'w-4 bg-white/10'}`} />
              ))}
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {step > 1 && (
              <button 
                onClick={() => setStep(s => s - 1)}
                className="px-8 py-4 border border-white/10 rounded-xl text-[10px] font-black uppercase tracking-[2px] text-white/40 hover:text-white hover:bg-white/5 transition-all"
              >
                Voltar
              </button>
            )}
            <button 
              onClick={() => step === 4 ? handleFinalize() : setStep(s => s + 1)}
              disabled={!isStepValid() || isSubmitting}
              className={`px-12 py-4 rounded-xl text-[10px] font-black uppercase tracking-[3px] transition-all duration-500 group flex items-center gap-3 ${
                isStepValid() && !isSubmitting
                ? 'bg-blue-600 text-white shadow-[0_10px_30px_rgba(37,99,235,0.2)] hover:scale-[1.05] active:scale-95' 
                : 'bg-white/5 text-white/10 cursor-not-allowed opacity-30 border border-white/5'
              }`}
            >
              {step === 4 ? (
                isSubmitting ? 'SALVANDO...' : <>DEPLOY ESTRATÉGICO <Rocket size={16} className="group-hover:animate-bounce" /></>
              ) : (
                <>PRÓXIMO PASSO <ChevronRight size={16} className="group-hover:translate-x-1 transition-transform" /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
