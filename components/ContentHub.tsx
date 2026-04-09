'use client';

import { useState, useEffect } from 'react';
import { 
  Plus, 
  Search, 
  TrendingUp, 
  Zap, 
  ChevronRight, 
  Clock,
  Edit3,
  Package,
  Copy,
  ExternalLink,
  Image as ImageIcon,
  Database,
  Trash2,
  Send,
  Target as TargetIcon,
  CheckCircle2
} from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { AIConfig, resolveModel, isReasoningModel } from '@/lib/ai-config';

interface Theme {
  id: string;
  project_id: string;
  raw_theme: string;
  category: string;
  demand_views: string;
  connection_note: string;
  match_score: number;
  selected_structure: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  title: string; 
  status: 'Backlog' | 'Roteirização' | 'Produção' | 'Publicado';
  created_at: string;
  production_assets?: {
    thumb_prompt: string;
    thumb_text: string[];
    tags: string[];
  };
}

interface ContentHubProps {
  activeProject?: any;
  selectedAIConfig: AIConfig;
  onGerarRoteiro?: (data: any) => void;
}

export default function ContentHub({ activeProject, selectedAIConfig, onGerarRoteiro }: ContentHubProps) {
  const [themes, setThemes] = useState<Theme[]>([]);
  const [showResults, setShowResults] = useState(false);
  const [baseTopic, setBaseTopic] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [currentMatch, setCurrentMatch] = useState<number | null>(null);
  const [lowMatchAlert, setLowMatchAlert] = useState<string | null>(null);
  const [refactoringSuggestion, setRefactoringSuggestion] = useState<string | null>(null);
  const [prohibitedWarning, setProhibitedWarning] = useState<string[]>([]);

  // Form States for New Theme
  const [newThemeCategory, setNewThemeCategory] = useState<string>('');
  const [newThemeDemand, setNewThemeDemand] = useState('');
  const [newThemeNote, setNewThemeNote] = useState('');
  const [selectedStructureId, setSelectedStructureId] = useState<string>('S1');
  const [generatedTitles, setGeneratedTitles] = useState<Record<string, string>>({});
  
  // Refinement & Assets States
  const [activeEditTheme, setActiveEditTheme] = useState<Theme | null>(null);
  const [isGeneratingAssets, setIsGeneratingAssets] = useState<string | null>(null); // Theme ID

  useEffect(() => {
    if (activeProject?.id) {
      fetchThemes();
      // Initialize with first journey module title
      const journey = activeProject.playlists?.tactical_journey || [];
      if (journey.length > 0) {
        setNewThemeCategory(`${journey[0].label}: ${journey[0].title}`);
      } else {
        setNewThemeCategory('M1: Teoria');
      }
    }
  }, [activeProject?.id, activeProject?.playlists?.tactical_journey]);

  const fetchThemes = async () => {
    if (!activeProject?.id) return;
    
    try {
      if (supabase) {
        const { data, error } = await supabase
          .from('content_hub')
          .select('*')
          .eq('project_id', activeProject.id)
          .order('created_at', { ascending: false });
        
        if (error) throw error;
        if (data && data.length > 0) {
          setThemes(data);
          return;
        }
      }

      // Fallback para LocalStorage se a nuvem estiver vazia ou offline
      const local = localStorage.getItem(`themes_${activeProject.id}`);
      if (local) setThemes(JSON.parse(local));
      else setThemes([]);
      
    } catch (err) {
      console.warn('Fallback: Usando LocalStorage para temas.', err);
      const local = localStorage.getItem(`themes_${activeProject.id}`);
      if (local) setThemes(JSON.parse(local));
    }
  };

  const handleSaveTheme = async (generatedTitle: string, structureId: string) => {
    if (!baseTopic || !activeProject) return;

    const newTheme: Theme = {
      id: Date.now().toString(),
      project_id: activeProject.id,
      raw_theme: baseTopic,
      category: newThemeCategory,
      demand_views: newThemeDemand,
      connection_note: newThemeNote,
      match_score: currentMatch || 0,
      selected_structure: structureId as any,
      title: generatedTitle,
      status: 'Backlog',
      created_at: new Date().toISOString()
    };

    try {
      const updatedThemes = [newTheme, ...themes];
      setThemes(updatedThemes);
      localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(updatedThemes));

      if (supabase) {
        const { error } = await supabase.from('content_hub').upsert(newTheme);
        if (error) console.error('Supabase save error:', error);
      }
      
      // Reset Form (Optional: Keep some data for batch entry)
      setBaseTopic('');
      setNewThemeDemand('');
      setNewThemeNote('');
      setShowResults(false);
      setCurrentMatch(null);
    } catch (err) {
      console.error('Error saving theme:', err);
    }
  };

  const deleteTheme = async (id: string) => {
    try {
      const filtered = themes.filter(t => t.id !== id);
      setThemes(filtered);
      localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(filtered));

      if (supabase) {
        const { error } = await supabase.from('content_hub').delete().eq('id', id);
        if (error) console.error('Supabase delete error:', error);
      }
    } catch (err) {
      console.error('Error deleting theme:', err);
    }
  };

  // S1-S5 Strategic Title Structures (V3 Final Technical Patterns)
  const titleStructures = [
    { id: 'S1', name: 'Provocação', pattern: 'O erro técnico que [TARGET] ignora ao abordar [TEMA]', type: 'ego' },
    { id: 'S2', name: 'Metáfora', pattern: '[METAFORA]: A analogia definitiva para dominar [TEMA]', type: 'authority' },
    { id: 'S3', name: 'Interrupção', pattern: 'PARE de usar métodos genéricos em [TEMA]! Aplique o M1: [JORNADA]', type: 'pattern-break' },
    { id: 'S4', name: 'Desconstrução', pattern: 'Por que o [TEMA] tradicional falha (A verdade do nicho)', type: 'insight' },
    { id: 'S5', name: 'Blueprint', pattern: 'O [METAFORA] do [TEMA]: Roteiro Técnico do Diagnóstico ao Lifestyle', type: 'practical' },
  ];

  const getScore = (topic: string, note: string, generatedText: string = '') => {
    const metaphorsStr = activeProject.ai_engine_rules?.metaphors?.join(', ') || activeProject.metaphor_library || '';
    const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
    
    const prohibitedStr = activeProject.ai_engine_rules?.prohibited?.join(', ') || activeProject.prohibited_terms || '';
    const prohibited = prohibitedStr.split(',').map((s: string) => s.trim()).filter(Boolean);

    const evalText = (topic + ' ' + note + ' ' + generatedText).toLowerCase();

    const hasMetaphorPotential = metaphors.some((m: string) => 
      evalText.includes(m.toLowerCase())
    );

    // Dynamic DNA Alignment
    const painAlignment = activeProject.persona_matrix?.pain_alignment || activeProject.target_persona?.pain_point || '';
    const hasPainAlignment = evalText.includes(painAlignment.toLowerCase());
    
    // Editorial Pillar Check
    const pillars = activeProject.editorial_line?.pillars || [];
    const hasEditorialMatch = pillars.some((p: string) => 
      p.trim() !== '' && evalText.includes(p.toLowerCase())
    );

    // PHD Skill Alignment
    const skillFocus = activeProject.phd_strategy?.skill || '';
    const hasSkillMatch = evalText.includes(skillFocus.toLowerCase());

    const hasConnectionDepth = note.length > 30;
    
    let score = 30;
    if (hasPainAlignment) score += 20; 
    if (hasMetaphorPotential) score += 20; 
    if (hasEditorialMatch) score += 15;
    if (hasSkillMatch) score += 10;
    if (hasConnectionDepth) score += 5;

    const detectedProhibited = prohibited.filter((p: string) => 
      evalText.includes(p.toLowerCase())
    );

    score -= (detectedProhibited.length * 20);
    const finalScore = Math.max(0, Math.min(98, score + Math.floor(Math.random() * 5)));

    let suggestion = "Fit Perfeito.";
    if (finalScore < 40) suggestion = "Fora do DNA. Verifique o Alinhamento de Dor.";
    else if (finalScore < 60) suggestion = "Ajuste o Título para um dos Pilares Editoriais.";
    else if (finalScore < 80) suggestion = "Ótimo fit. Considere injetar mais do seu 'Skill PHD'.";

    return {
      score: finalScore,
      detectedProhibited,
      suggestion
    };
  };

  const calculateMatchScore = async () => {
    if (!baseTopic || !activeProject) return;
    setIsAnalyzing(true);
    setLowMatchAlert(null);
    setGeneratedTitles({});
    
    // Process local score immediately
    const result = getScore(baseTopic, newThemeNote);
    setCurrentMatch(result.score);
    setProhibitedWarning(result.detectedProhibited);
    setRefactoringSuggestion(result.suggestion);
    
    try {
      const engine = selectedAIConfig?.engine || 'gemini';
      const model = selectedAIConfig?.model || 'gemini-1.5-flash';
      
      const geminiKey = localStorage.getItem('yt_gemini_key');
      const openaiKey = localStorage.getItem('yt_openai_key');

      const missingOpenAI = engine === 'openai' && !openaiKey;
const missingGemini = engine === 'gemini' && !geminiKey;

      if (missingOpenAI) {
        alert("⚠️ Chave API da OpenAI ausente!\nA IA não fará a síntese dos Títulos, fallback Javascript ativo.\nAcesse a Engrenagem no menu lateral para registrar.");
      } else if (missingGemini) {
        alert("⚠️ Chave API do Google Gemini ausente!\nA IA não fará a síntese dos Títulos, fallback Javascript ativo.\nAcesse a Engrenagem no menu lateral para registrar.");
      }

      const prompt = `PROMPT ANTIGRAVITY: ENGINE DE COMPOSIÇÃO DINÂMICA (DB-DRIVEN)

OBJETIVO: Agir como um sintetizador de conteúdo agnóstico. 100% do vocabulário, estruturas e ganchos da saída devem ser derivados dos dados informados no contexto sistêmico, não de vocabulário genérico da AI.

1. LÓGICA DE INJEÇÃO E MAPEAMENTO
Você não está apenas escrevendo; você está processando ativos.
- Metáforas: Use estritamente as terminologias técnicas fornecidas. Aja sob a persona de um Engenheiro / Arquiteto que está construindo o título a partir desse vocabulário exato. Ex: Se foi dado "Thermal Throttling", substitua o genérico "Estresse" por "Thermal Throttling Mental".
- Conector de Abstração: Todo termo técnico utilizado na saída DEVE estar no \`composition_log\`.

2. REGRAS DE COMPOSIÇÃO - O FILTRO "SÊNIOR NO CAFÉ"
- Fale de sênior para sênior de forma brutalmente cética e pragmática.
- ZERO VAZAMENTO DE ABSTRAÇÃO: É TERMINANTEMENTE PROIBIDO colocar "S1:", "M1:", "Diagnóstico M1", "Blueprint", IDs, chaves de db ou metadados de prompt dentro das frases geradas. Os leitores nunca devem ler a infraestrutura.
- Não use "roda o estresse". Use verbos de consequência sistêmica (Ex: "Quando o estresse vira Dívida Técnica").
- 70 CARACTERES MÁXIMO POR LINHA.

[CONTEXTO DE CONFIGURAÇÃO]
Tema do Usuário: ${baseTopic}
DNA / Target Persona: ${activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'Sênior Tech'}
Módulo Atual da Jornada (Tonalidade e Escopo Técnico): ${newThemeCategory}
Metáforas Cadastradas do BD: ${activeProject?.metaphor_library || activeProject?.ai_engine_rules?.metaphors?.join(', ') || 'N/A'}

[REFINAMENTO DE PADRÕES E ESTRUTURAS (Templates Puros)]
S1 (Provocação): Um tapa técnico. Aponte o erro crônico sobre [TEMA]. (Ex: "O erro de arquitetura que está fritando sua carreira antes dos 40.").
S2 (Autoridade Analógica): A metáfora deve ser o sujeito, não a explicação. (Ex: "Thermal Throttling: Por que você não foca em código complexo.").
S3 (Quebra / Interrupção): "Pare de ser o herói". (Ex: "Pare de tratar seu cérebro como servidor legado.").
S4 (Insight Radical): Desconstrua por que o padrão tradicional de [TEMA] gera dívida técnica silenciosa.
S5 (Sustentabilidade/Workflow): O Blueprint de refatoração para sobreviver sobre [TEMA].

[OUTPUT OBRIGATÓRIO (JSON STRICT BI & TRACKING)]
Prepare e retorne estritamente um objeto JSON com duas chaves principais: "titles" (contendo S1 a S5 com vazamento zero da abstração) e "composition_log". Nunca adicione blocos de markdown em volta.
{
  "titles": {
    "S1": "...",
    "S2": "...",
    "S3": "...",
    "S4": "...",
    "S5": "..."
  },
  "composition_log": {
    "theme_mapped": "${baseTopic}",
    "journey_layer": "${newThemeCategory}",
    "metaphors_used": ["lista_dos_IDs_ou_termos_injetados_nestes_titulos"]
  }
}`;

      // --- CHAMADA VIA BACKEND PROXY (MÓDULO DE ENGENHARIA) ---
      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          prompt,
          apiKeyOverwrite: engine === 'gemini' ? geminiKey : openaiKey,
          projectConfig: activeProject?.ai_engine_rules
        })
      });

      if (!response.ok) {
        const errorBody = await response.text();
        alert(`Erro ${response.status} na Geração de IA: ${errorBody}`);
        return;
      }

      const data = await response.json();
      let text = '';
      
      // Normalização da resposta dependendo da engine
      if (engine === 'gemini') {
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else if (engine === 'openai') {
        text = data.choices?.[0]?.message?.content || '';
      }

      if (text) {
        try {
          // Limpeza de possíveis blocos de código Markdown
          const cleanText = text.replace(/```json/gi, '').replace(/```/g, '').trim();
          const parsed = JSON.parse(cleanText);
          const extractedTitles = parsed.titles || parsed; // fallback se não vier em objeto titles
          
          setGeneratedTitles(extractedTitles);
          
          const combinedAI = Object.values(extractedTitles).join(' ');
          const newResult = getScore(baseTopic, newThemeNote, combinedAI);
          setCurrentMatch(newResult.score);
          setRefactoringSuggestion(newResult.suggestion);
          
          console.log(`Composition BI Log (${engine}) processado com sucesso:`, parsed.composition_log);
        } catch(e: any) { 
          alert(`Falha ao processar resposta JSON da IA. Resposta Crua:\n` + text.substring(0, 150));
        }
      } else {
        alert("A IA retornou uma resposta vazia.");
      }
    } catch(err) {
      console.error("AI Title Generator Error:", err);
    }

    
    setIsAnalyzing(false);
    setShowResults(true);
  };

  const handleUpdateTheme = async (themeId: string, updatedData: Partial<Theme>) => {
    try {
      const themeToUpdate = themes.find(t => t.id === themeId);
      if (!themeToUpdate) return;

      const newScore = updatedData.title || updatedData.connection_note 
        ? getScore(updatedData.title || themeToUpdate.title, updatedData.connection_note || themeToUpdate.connection_note).score 
        : themeToUpdate.match_score;

      const updatedTheme = { ...themeToUpdate, ...updatedData, match_score: newScore };
      const updatedThemes = themes.map(t => t.id === themeId ? updatedTheme : t);
      
      setThemes(updatedThemes);
      localStorage.setItem(`themes_${activeProject.id}`, JSON.stringify(updatedThemes));

      if (supabase) {
        await supabase.from('content_hub').upsert(updatedTheme);
      }
      setActiveEditTheme(null);
    } catch (err) {
      console.error('Error updating theme:', err);
    }
  };

  const generateAssets = async (theme: Theme) => {
    setIsGeneratingAssets(theme.id);
    
    // Simulate AI Generation for Thumbnail & SEO
    setTimeout(async () => {
      const metaphorsStr = activeProject.ai_engine_rules?.metaphors?.join(', ') || activeProject.metaphor_library || '';
      const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
      const randomMetaphor = metaphors[Math.floor(Math.random() * metaphors.length)] || 'Elemento Técnico';

      const assets = {
        thumb_prompt: `High-quality cinematic 3D render, dark background, neon accents, focusing on ${randomMetaphor} related to ${theme.title}. Professional color grading, 8k resolution.`,
        thumb_text: [
          theme.title.split(' ')[0] + " FATAL",
          "PARE DE FAZER " + theme.title.split(' ')[0],
          "O SEGREDO DO " + theme.title.split(' ')[0]
        ],
        tags: [activeProject.target_persona?.audience || 'Nicho', theme.title.split(' ')[0], 'Produtividade', 'Tecnologia', 'Estratégia']
      };

      await handleUpdateTheme(theme.id, { production_assets: assets });
      setIsGeneratingAssets(null);
    }, 2000);
  };

  const getDynamicTitle = (pattern: string) => {
    const metaphorsStr = activeProject?.metaphor_library || activeProject?.ai_engine_rules?.metaphors?.join(', ') || 'Conceito Técnico';
    const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
    const randomMetaphor = metaphors[Math.floor(Math.random() * metaphors.length)] || 'Conceito';
    
    // Extrai apenas o termo principal da persona (Ex: "Desenvolvedor Sênior" em vez da biografia inteira)
    const rawTarget = activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'seu público';
    const shortTarget = rawTarget.split(',')[0].split('.')[0].trim();
    
    const journey = activeProject?.playlists?.tactical_journey?.[0]?.title || 'Fundamentos';

    return pattern
      .replace('[TEMA]', baseTopic || 'Tema')
      .replace('[TARGET]', shortTarget)
      .replace('[METAFORA]', randomMetaphor)
      .replace('[JORNADA]', journey)
      .replace('[PAIN]', activeProject?.persona_matrix?.pain_alignment || activeProject?.target_persona?.pain_point || 'esse problema');
  };

  return (
    <div className="flex flex-col gap-8 animate-in text-white pb-20">
      {/* Header & Strategic Analysis */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 glass-card p-8 bg-gradient-to-br from-[var(--accent-color-glow)] to-transparent border-[var(--accent-color-glow)] flex flex-col gap-4 relative overflow-hidden">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[var(--accent-color-glow)] rounded-lg">
              <Zap className="text-[var(--accent-color)]" size={24} />
            </div>
            <div>
              <h2 className="text-2xl font-bold tracking-tight">Gerador de Títulos S1-S5</h2>
              <p className="text-white/60 text-[10px] uppercase tracking-widest font-black mt-1">Engine de Engenharia de Cliques</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4 bg-white/5 border border-[var(--accent-color)]/20 p-4 rounded-xl mt-2">
            <div className="flex-1">
              <span className="text-[10px] uppercase font-black tracking-widest text-[var(--accent-color)] opacity-80">Diretriz de Síntese Narrativa (Prompt Engine V2)</span>
              <p className="text-[11px] text-white/60 mt-2 leading-relaxed">
                <span className="block mb-2 font-bold opacity-80">Objetivo: Agir como um motor de síntese que processa um Tema Bruto utilizando estritamente as definições de estrutura e contexto do projeto.</span>
                <span className="block text-[10px] font-mono text-white/40 italic">Lógica V2: Conhecimento como base (não copiar), Moldagem via DB e Filtrações de Ouro (Máx 70 chars).</span>
              </p>
            </div>
            <button 
              onClick={() => {
                const prompt = `DIRETRIZ DE SÍNTESE NARRATIVA (PROMPT ENGINE V2)

1. DEFINIÇÃO DE PAPEL: > Você é um especialista em Copywriting que transforma dados técnicos em títulos de alto impacto.

2. LOGICA DE PROCESSAMENTO (NÃO VIOLAR):
CONHECIMENTO (BASE): As informações de 'Persona', 'Metáforas' e 'DNA' são apenas inspiração. É terminantemente PROIBIDO copiar e colar descrições longas ou textos literais desses campos.
MOLDE (DB): Use as 'Estruturas de Título' (Patterns) cadastradas no banco como o único guia de formato.
AÇÃO: Extraia apenas o conceito-chave do Tema Bruto e as palavras-chave da Persona para preencher as lacunas do pattern.

3. REGRAS DE OURO DE SÍNTESE:
Máximo de 70 caracteres. Se o título tiver mais que isso, está errado.
Gramática Humana: O título deve soar como um sênior falando com outro sênior em um café, não como um relatório de banco de dados.
Substituição Inteligente: Onde o pattern pede uma 'Provocação', crie uma frase curta. Onde pede uma 'Metáfora', use apenas o NOME da metáfora (ex: "Memory Leak"), nunca a explicação dela.

4. EXEMPLO DE FILTRO MENTAL:
Input do DB: Persona = "Desenvolvedor Sênior exausto de 40 anos..."
Input do DB: Pattern = "{Pergunta} + {Consequência}"
Saída Correta: "Por que sua produtividade caiu? O custo oculto do burnout sênior."
Saída Errada: "Por que Desenvolvedor Sênior exausto de 40 anos + O impacto do estresse..." -> PROIBIDO.

[INPUT DO PROJETO - INJETE CONFORME AS REGRAS]
Tema Bruto: ${baseTopic || ''}
Atmosfera Narrativa / Persona: ${activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'N/A'}
Engenharia de Metáforas: ${activeProject?.metaphor_library || activeProject?.ai_engine_rules?.metaphors?.join(', ') || 'N/A'}

[ESTRUTURAS-BASE A PREENCHER]
` + titleStructures.map(s => `${s.id} (${s.name}): ${s.pattern}`).join('\n');
                
                navigator.clipboard.writeText(prompt);
                alert("Prompt Engine V2 copiado para a área de transferência!");
              }}
              className="px-4 py-3 bg-[var(--accent-color)]/10 text-[var(--accent-color)] hover:bg-[var(--accent-color)] hover:text-midnight transition-all border border-[var(--accent-color)]/20 rounded-lg text-[10px] items-center justify-center font-black tracking-widest uppercase flex flex-col gap-1 whitespace-nowrap"
            >
              <Copy size={16} />
              Copiar V2
            </button>
          </div>
          
          <div className="flex flex-col gap-6 mt-4">
            <div className="flex gap-4">
              <div className="flex-1 relative group">
                <input 
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-5 py-5 outline-none focus:ring-4 focus:ring-[var(--accent-color)]/10 focus:border-[var(--accent-color)] transition-all text-white font-bold placeholder:text-white/10"
                  placeholder="Insira o tema bruto para análise estratégica..."
                  value={baseTopic}
                  onChange={(e) => setBaseTopic(e.target.value)}
                />
                {!activeProject && (
                  <div className="absolute inset-0 bg-midnight/80 backdrop-blur-sm flex items-center justify-center rounded-xl border border-white/5">
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Selecione uma Instância para Ativar a Engine</span>
                  </div>
                )}
              </div>
              <button 
                onClick={calculateMatchScore}
                disabled={!baseTopic || isAnalyzing || !activeProject}
                className={`px-8 rounded-xl font-bold transition-all flex items-center gap-3 shadow-lg ${
                  isAnalyzing ? 'bg-white/5 text-white/20 cursor-wait' : 'bg-[var(--accent-color)] text-midnight hover:scale-105 active:scale-95 shadow-[var(--accent-color-glow)]'
                }`}
              >
                {isAnalyzing ? (
                  <>
                    <div className="w-4 h-4 border-2 border-midnight/20 border-t-midnight animate-spin rounded-full" />
                    ANALISANDO COM {selectedAIConfig.model.toUpperCase()}...
                  </>
                ) : (
                  <>ANALISAR MATCH <ChevronRight size={18} /></>
                )}
              </button>
            </div>

            {/* Strategic Metadata Inputs (V3 Final) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 animate-in fade-in slide-in-from-top-2 duration-700">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-white/60 ml-1">Playlist / Categoria</label>
                <span className="text-[9px] uppercase font-bold text-white/40 ml-1 -mt-1 mb-1">Ponto da jornada tática (M1-M3).</span>
                <select 
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 outline-none focus:ring-4 focus:ring-[var(--accent-color)]/10 focus:border-[var(--accent-color)] transition-all text-sm text-white font-bold appearance-none cursor-pointer"
                  value={newThemeCategory}
                  onChange={(e: any) => setNewThemeCategory(e.target.value)}
                >
                  {(activeProject?.playlists?.tactical_journey || [
                    { label: 'M1', title: 'Teoria / Diagnóstico' },
                    { label: 'M2', title: 'Prática / Implementação' },
                    { label: 'M3', title: 'Otimização / Lifestyle' }
                  ]).map((item: any) => (
                    <option key={item.label} value={`${item.label}: ${item.title}`} className="bg-midnight text-white">
                      {item.label}: {item.title}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-white/60 ml-1">Demanda (Views Estimadas)</label>
                <span className="text-[9px] uppercase font-bold text-white/40 ml-1 -mt-1 mb-1">Volume de audiência real detectado.</span>
                <input 
                  type="text"
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-4 outline-none focus:ring-4 focus:ring-[var(--accent-color)]/10 focus:border-[var(--accent-color)] transition-all text-sm text-white font-bold placeholder:text-white/5"
                  placeholder="Ex: 50k"
                  value={newThemeDemand}
                  onChange={(e) => setNewThemeDemand(e.target.value)}
                />
              </div>
              <div className="md:col-span-2 flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-white/60 ml-1">Observação de Conexão (Match Persona)</label>
                <span className="text-[9px] uppercase font-bold text-white/40 ml-1 -mt-1 mb-1">Como este tema alivia a dor central do seu avatar?</span>
                <textarea 
                  className="bg-white/5 border border-white/10 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-[var(--accent-color)]/10 focus:border-[var(--accent-color)] transition-all text-sm text-white font-medium placeholder:text-white/5 min-h-[100px] resize-none"
                  placeholder="Injete o motivo estratégico para falar sobre isso agora."
                  value={newThemeNote}
                  onChange={(e) => setNewThemeNote(e.target.value)}
                />
              </div>
            </div>
          </div>

          {showResults && (
            <div className="grid grid-cols-1 gap-3 mt-8 animate-in slide-in-from-top-4 duration-500">
              <div className="flex justify-between items-center mb-2 px-2">
                <span className="text-[10px] font-black text-[var(--accent-color)] uppercase tracking-[0.3em]">Clique na Estrutura para Salvar no Banco</span>
                {Object.keys(generatedTitles).length > 0 && (
                  <span className="text-[9px] font-bold text-sage uppercase border border-sage/20 bg-sage/5 px-2 py-1 rounded">Síntese IA Ativa</span>
                )}
              </div>
              {titleStructures.map(s => {
                const finalTitle = generatedTitles[s.id] || getDynamicTitle(s.pattern);
                return (
                  <div 
                    key={s.id} 
                    onClick={() => handleSaveTheme(finalTitle, s.id)}
                    className="flex items-center justify-between p-4 bg-white/5 border border-white/5 rounded-2xl group hover:border-[var(--accent-color)]/50 hover:bg-[var(--accent-color-glow)] transition-all cursor-pointer"
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-8 h-8 rounded-lg bg-white/5 flex items-center justify-center text-[10px] font-black text-white/20 group-hover:text-[var(--accent-color)] group-hover:bg-[var(--accent-color-glow)] transition-all border border-white/5 uppercase">
                        {s.id}
                      </div>
                      <div className="flex flex-col">
                        <span className="text-[8px] uppercase tracking-widest font-black text-[var(--accent-color)] opacity-60 mb-0.5">{s.name}</span>
                        <span className="text-sm text-white/90 font-medium">{finalTitle}</span>
                      </div>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg opacity-0 group-hover:opacity-100 transition-all hover:bg-[var(--accent-color)] hover:text-midnight">
                      <Plus size={16} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="glass-card p-8 flex flex-col items-center justify-center text-center gap-4 relative border-[var(--accent-color-glow)]">
          <div className={`w-20 h-20 rounded-full flex items-center justify-center transition-all duration-1000 ${currentMatch ? 'bg-[var(--accent-color-glow)]' : 'bg-white/5'}`}>
            <TrendingUp className={currentMatch ? 'text-[var(--accent-color)]' : 'text-white/10'} size={40} />
          </div>
          <div className="flex flex-col gap-1">
            <h3 className="font-black text-white uppercase text-sm">Match de Público</h3>
            <p className="text-[9px] text-white/50 uppercase tracking-widest font-black mt-1">Fit Estratégico Real-Time</p>
          </div>
          <div className="flex flex-col items-center">
            <span className={`text-5xl font-black transition-all duration-1000 ${currentMatch !== null ? (currentMatch > 70 ? 'text-sage' : currentMatch > 40 ? 'text-blue-400' : 'text-red-400') : 'text-white/10'}`}>
              {currentMatch !== null ? `${currentMatch}%` : '--%'}
            </span>
            {currentMatch !== null && (
              <div className={`mt-4 px-3 py-1 rounded-full border ${currentMatch > 70 ? 'bg-sage/10 border-sage/20' : currentMatch > 40 ? 'bg-blue-500/10 border-blue-500/20' : 'bg-red-500/10 border-red-500/20'}`}>
                <span className={`text-[8px] font-black uppercase tracking-widest ${currentMatch > 70 ? 'text-sage' : currentMatch > 40 ? 'text-blue-400' : 'text-red-400'}`}>
                  {currentMatch > 80 ? 'ALTO POTENCIAL' : currentMatch > 60 ? 'FIT MODERADO' : 'AJUSTE NECESSÁRIO'}
                </span>
              </div>
            )}
          </div>
          
          {refactoringSuggestion && (
            <div className="mt-6 p-4 glass-card border-white/5 bg-white/[0.02] rounded-2xl animate-in slide-in-from-bottom-2">
              <p className="text-[10px] uppercase font-black tracking-widest text-[#9BB0A5] mb-2">Sugestão Estratégica</p>
              <p className="text-[11px] text-white/50 leading-relaxed italic">"{refactoringSuggestion}"</p>
            </div>
          )}

          {prohibitedWarning.length > 0 && (
            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/20 rounded-xl animate-bounce">
              <p className="text-[9px] font-black text-red-400 uppercase tracking-widest">
                🚫 Termos Proibidos Detectados: {prohibitedWarning.join(', ')}
              </p>
            </div>
          )}
          
          {lowMatchAlert && (
            <div className="absolute inset-x-0 bottom-0 bg-red-500/20 backdrop-blur-md p-4 animate-in slide-in-from-bottom-full duration-500 border-t border-red-500/30">
              <p className="text-[9px] font-black uppercase tracking-[2px] text-red-400">
                ⚠️ Tema muito genérico. Tente injetar: <span className="text-white underline">{lowMatchAlert}</span> para elevar o Match Score.
              </p>
            </div>
          )}
        </div>
      </section>

      {/* Theme Table */}
      <section className="glass-card overflow-hidden border-white/5">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-white/5 rounded-lg">
              <Database size={18} className="text-[var(--accent-color)]" />
            </div>
            <h3 className="font-bold tracking-tight">Banco de Temas Estratégicos</h3>
          </div>
          <div className="flex gap-3">
            <div className="relative group">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-white/20 group-focus-within:text-[var(--accent-color)] transition-colors" size={14} />
              <input className="bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-xs outline-none focus:border-[var(--accent-color)]/30 transition-all w-64" placeholder="Buscar temas na instância..." />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.2em] text-white/20 border-b border-white/5 bg-white/[0.01]">
                <th className="px-6 py-5 font-black">Status</th>
                <th className="px-6 py-5 font-black">Tema Bruto / Estrutura Técnica</th>
                <th className="px-6 py-5 font-black text-center">Demanda (Views)</th>
                <th className="px-6 py-5 font-black text-center">Match Score</th>
                <th className="px-6 py-5 font-black"></th>
              </tr>
            </thead>
            <tbody>
              {themes.length === 0 ? (
                <tr>
                  <td colSpan={5} className="px-6 py-20 text-center">
                    <div className="flex flex-col items-center gap-4 opacity-20">
                      <Database size={48} strokeWidth={1} />
                      <p className="text-xs uppercase font-bold tracking-[0.3em]">Nenhum tema validado nesta instância</p>
                    </div>
                  </td>
                </tr>
              ) : (
                themes.map(theme => (
                  <tr key={theme.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                    <td className="px-6 py-5">
                      <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full border text-[9px] font-black uppercase tracking-widest ${
                        theme.status === 'Backlog' ? 'bg-white/5 border-white/10 text-white/40' :
                        theme.status === 'Roteirização' ? 'bg-blue-500/10 border-blue-500/20 text-blue-400' :
                        theme.status === 'Produção' ? 'bg-orange-500/10 border-orange-500/20 text-orange-400' :
                        'bg-sage/10 border-sage/20 text-sage'
                      }`}>
                        {theme.status === 'Backlog' && <Clock size={10} />}
                        {theme.status === 'Produção' && <Zap size={10} />}
                        {theme.status === 'Publicado' && <CheckCircle2 size={10} />}
                        {theme.status}
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-3">
                          <span className="text-[10px] font-black px-2 py-0.5 bg-white/5 rounded border border-white/10 text-white/40 uppercase">
                            {theme.selected_structure}
                          </span>
                          <span className="text-sm font-bold text-white/90 group-hover:text-sage transition-colors">{theme.title}</span>
                        </div>
                        <div className="flex items-center gap-4 text-[10px] text-white/20 uppercase font-black tracking-widest">
                          <span className="flex items-center gap-1"><TargetIcon size={10} /> {theme.category}</span>
                          <span className="opacity-30">|</span>
                          <span className="truncate max-w-[300px] italic font-medium normal-case">"{theme.connection_note || 'Sem nota de conexão'}"</span>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-center">
                      <span className="text-xs font-mono text-white/40">{theme.demand_views || '---'}</span>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col items-center gap-1">
                        <span className={`text-sm font-black ${
                          theme.match_score > 80 ? 'text-sage' : 
                          theme.match_score > 60 ? 'text-blue-400' : 'text-red-400'
                        }`}>
                          {theme.match_score}%
                        </span>
                        <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className={`h-full transition-all duration-1000 ${
                              theme.match_score > 80 ? 'bg-sage' : 
                              theme.match_score > 60 ? 'bg-blue-400' : 'bg-red-400'
                            }`}
                            style={{ width: `${theme.match_score}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                        <button 
                          onClick={() => setActiveEditTheme(theme)}
                          className="p-2 hover:bg-white/10 rounded-lg transition-all text-white/20"
                          title="Refinar Título (Manual Tuning)"
                        >
                          <Edit3 size={14} />
                        </button>
                        <button 
                          onClick={() => generateAssets(theme)}
                          className={`p-2 rounded-lg transition-all font-bold ${
                            isGeneratingAssets === theme.id 
                            ? 'bg-sage/20 text-sage animate-pulse' 
                            : theme.production_assets 
                              ? 'bg-sage/10 text-sage hover:bg-sage/20' 
                              : 'hover:bg-white/10 text-white/20'
                          }`}
                          title={theme.production_assets ? "Ver Ativos de Produção" : "Gerar Ativos de Produção"}
                        >
                          <Package size={14} />
                        </button>
                        <button 
                          onClick={() => onGerarRoteiro?.(theme)}
                          className="p-2 hover:bg-sage hover:text-midnight rounded-lg transition-all text-white/20"
                          title="Gerar Roteiro (Enviar para Engine)"
                        >
                          <Send size={14} />
                        </button>
                        <button 
                          onClick={() => deleteTheme(theme.id)}
                          className="p-2 hover:bg-red-500/20 hover:text-red-500 rounded-lg transition-all text-white/10"
                          title="Remover Tema"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* REFINEMENT & ASSETS MODAL */}
      {activeEditTheme && (
        <div className="fixed inset-0 z-[2000] bg-midnight/90 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in zoom-in-95 duration-300">
          <div className="glass-card w-full max-w-xl p-8 flex flex-col gap-6 shadow-2xl border-white/10">
            <div className="flex justify-between items-center">
              <div>
                <h3 className="text-xl font-bold text-white">Iteração Estratégica</h3>
                <p className="text-white/40 text-[10px] uppercase font-black tracking-widest mt-1">Refinamento de Título e Ativos</p>
              </div>
              <button 
                onClick={() => setActiveEditTheme(null)}
                className="w-8 h-8 rounded-full border border-white/10 flex items-center justify-center text-white/40 hover:text-white transition-colors"
              >✕</button>
            </div>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-sage">Título Final (Ajuste Fino)</label>
                <textarea 
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-sage/40 transition-all text-white min-h-[80px]"
                  value={activeEditTheme.title}
                  onChange={(e) => setActiveEditTheme({...activeEditTheme, title: e.target.value})}
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] uppercase font-black tracking-widest text-white/20">Nota de Conexão</label>
                <textarea 
                  className="bg-white/5 border border-white/10 rounded-xl px-4 py-3 outline-none focus:border-sage/40 transition-all text-white/60 text-sm"
                  value={activeEditTheme.connection_note}
                  onChange={(e) => setActiveEditTheme({...activeEditTheme, connection_note: e.target.value})}
                />
              </div>
            </div>

            <div className="flex items-center gap-4 p-4 bg-sage/5 border border-sage/10 rounded-xl">
              <TrendingUp className="text-sage" size={24} />
              <div>
                <p className="text-[9px] font-black uppercase text-sage tracking-widest">Match Score Real-Time</p>
                <p className="text-2xl font-black text-white">{getScore(activeEditTheme.title, activeEditTheme.connection_note).score}%</p>
              </div>
            </div>

            {activeEditTheme.production_assets && (
              <div className="flex flex-col gap-4 p-4 bg-white/5 border border-white/5 rounded-xl animate-in slide-in-from-top-2">
                <div className="flex flex-col gap-2">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] uppercase font-black tracking-widest text-white/20">Prompt de Thumbnail</label>
                    <button 
                      onClick={() => {
                        navigator.clipboard.writeText(activeEditTheme.production_assets?.thumb_prompt || "");
                        alert("Prompt copiado!");
                      }}
                      className="p-1 hover:text-sage transition-colors"
                    ><Copy size={12} /></button>
                  </div>
                  <p className="text-[10px] text-white/60 bg-midnight/40 p-3 rounded-lg border border-white/5 italic">
                    {activeEditTheme.production_assets.thumb_prompt}
                  </p>
                </div>
                <div className="flex flex-col gap-2">
                  <label className="text-[9px] uppercase font-black tracking-widest text-white/20">SEO Tags</label>
                  <div className="flex flex-wrap gap-1.5">
                    {activeEditTheme.production_assets.tags.map(tag => (
                      <span key={tag} className="px-2 py-0.5 bg-white/5 rounded text-[9px] text-sage/80 border border-white/5">#{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <button 
              onClick={() => handleUpdateTheme(activeEditTheme.id, { title: activeEditTheme.title, connection_note: activeEditTheme.connection_note })}
              className="w-full py-4 bg-sage text-midnight font-black uppercase tracking-[3px] text-xs rounded-xl shadow-lg shadow-sage/20 hover:scale-[1.02] active:scale-95 transition-all mt-4"
            >
              SALVAR REFINAMENTO
            </button>
          </div>
        </div>
      )}

      {/* LOADER OVERLAY FOR ASSETS */}
      {isGeneratingAssets && (
        <div className="fixed inset-0 z-[3000] bg-midnight/90 backdrop-blur-2xl flex items-center justify-center">
          <div className="flex flex-col items-center gap-6 animate-pulse">
            <div className="w-16 h-16 border-4 border-sage/10 border-t-sage rounded-full animate-spin" />
            <div className="text-center">
              <p className="text-sm font-black text-white uppercase tracking-[4px]">Criando Asset Pack...</p>
              <p className="text-[10px] text-white/30 uppercase mt-2">Injetando Metáforas e DNA de produção</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
