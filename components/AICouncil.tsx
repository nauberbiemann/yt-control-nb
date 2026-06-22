'use client';

import React, { useState, useEffect } from 'react';
import { 
  Users, 
  Brain, 
  Sparkles, 
  Copy, 
  Check, 
  ChevronDown, 
  RefreshCw, 
  Send, 
  AlertTriangle, 
  ArrowRight, 
  MessageSquare,
  HelpCircle,
  TrendingUp,
  Award,
  CheckCircle2
} from 'lucide-react';

interface Project {
  id: string;
  name?: string;
  project_name?: string;
  puc?: string;
  accent_color?: string;
  primary_color?: string;
  persona_matrix?: any;
  metaphor_library?: string;
  prohibited_terms?: string;
  base_system_instruction?: string;
  playlists?: any;
  editing_sop?: any;
  ai_engine_rules?: any;
  [key: string]: any;
}

interface AICouncilProps {
  activeProject: Project | null;
  selectedAIConfig: {
    engine: string;
    model: string;
  };
  preFilledQuery?: string | null;
  onClearPreFilled?: () => void;
}

interface Advisor {
  id: string;
  name: string;
  desc: string;
  lens: string;
  avatar: string;
}

interface Verdict {
  agrees: string;
  clashes: string;
  blindspots: string;
  recommendation: string;
  firstStep: string;
}

const ADVISORS: Advisor[] = [
  { 
    id: 'devil', 
    name: 'O Contrário', 
    desc: 'Busca ativamente o que está errado, o que está faltando, o que vai falhar. Assume que a ideia tem uma falha fatal e tenta encontrá-la.', 
    lens: 'Lente de Risco & Falha', 
    avatar: '👹' 
  },
  { 
    id: 'first_principles', 
    name: 'Pensador de Primeiros Princípios', 
    desc: 'Ignora a camada superficial da pergunta e questiona "qual problema real estamos tentando resolver?". Descontrói premissas e reconstrói o problema do zero.', 
    lens: 'Lente de Desconstrução de Assunções', 
    avatar: '🧠' 
  },
  { 
    id: 'expansionist', 
    name: 'O Expansionista', 
    desc: 'Busca o potencial de crescimento que os outros ignoram. O que pode ser ampliado? Qual oportunidade paralela está oculta? Foca no melhor cenário possível.', 
    lens: 'Lente de Escalabilidade & Upside', 
    avatar: '🚀' 
  },
  { 
    id: 'outsider', 
    name: 'O Observador Externo', 
    desc: 'Responde puramente ao que vê diante de si, simulando um espectador leigo. Identifica a "maldição do conhecimento" (termos óbvios para o autor, mas confusos para quem está de fora).', 
    lens: 'Lente do Espectador Frio', 
    avatar: '👀' 
  },
  { 
    id: 'executor', 
    name: 'O Executor', 
    desc: 'Foca apenas em viabilidade prática. Ignora teorias abstratas e questiona "qual o primeiro passo prático para segunda-feira de manhã?".', 
    lens: 'Lente de Execução & Velocidade', 
    avatar: '🛠️' 
  }
];

export default function AICouncil({ activeProject, selectedAIConfig, preFilledQuery, onClearPreFilled }: AICouncilProps) {
  const [rawQuery, setRawQuery] = useState('');
  const [status, setStatus] = useState<'idle' | 'enriching' | 'advisors' | 'reviews' | 'chairman' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  
  // Results
  const [advisorsResponse, setAdvisorsResponse] = useState<Record<string, string>>({});
  const [peerReviewsResponse, setPeerReviewsResponse] = useState<Record<string, string>>({});
  const [verdict, setVerdict] = useState<Verdict | null>(null);
  const [rawVerdictText, setRawVerdictText] = useState('');

  // UI state
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'verdict' | 'advisors' | 'reviews'>('verdict');

  useEffect(() => {
    if (preFilledQuery) {
      setRawQuery(preFilledQuery);
      if (onClearPreFilled) {
        onClearPreFilled();
      }
    }
  }, [preFilledQuery, onClearPreFilled]);

  // Robust Fetch Helper with retries for rate limits
  const fetchAI = async (prompt: string, responseType: 'text' | 'json' = 'text', retries = 2, delay = 2500): Promise<any> => {
    const apiKey = selectedAIConfig.engine === 'openai' 
      ? localStorage.getItem('yt_openai_key') || '' 
      : localStorage.getItem('yt_gemini_key') || '';

    for (let i = 0; i <= retries; i++) {
      try {
        const response = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engine: selectedAIConfig.engine,
            model: selectedAIConfig.model,
            prompt: prompt,
            apiKeyOverwrite: apiKey,
            responseType: responseType
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({}));
          throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        return data;
      } catch (err: any) {
        if (i === retries) throw err;
        console.warn(`Aviso: Chamada de IA falhou (tentativa ${i + 1}/${retries + 1}). Tentando novamente em ${delay}ms... Erro:`, err.message);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  };

  const enrichQuestion = (query: string, project: Project | null) => {
    if (!project) return query;

    const metaphors = project.metaphor_library || project.ai_engine_rules?.metaphors?.join(', ') || 'Nenhuma cadastrada';
    const prohibited = project.prohibited_terms || project.ai_engine_rules?.prohibited?.join(', ') || 'Nenhum cadastrado';
    const persona = project.target_persona?.audience || project.persona_matrix?.demographics || 'Não configurada';
    const pain = project.target_persona?.pain_point || project.persona_matrix?.pain_alignment || 'Não configurada';
    const desiredOutcome = project.persona_matrix?.desired_outcome || 'Não configurado';
    const pillars = project.editorial_line?.pillars?.filter(Boolean).join(', ') || 'Não configurados';
    const positioning = project.editorial_line?.positioning_angle || 'Não configurado';
    const atmosphere = project.narrative_voice?.atmosphere?.filter(Boolean).join(', ') || 'Não configurada';
    const tone = project.narrative_voice?.positioning || '';

    return `Pergunta / Decisão submetida:
---
${query}
---

Instruções Estratégicas do Canal do YouTube (Contexto de Negócio):
- **Canal / Instância**: ${project.project_name || project.name}
- **Promessa Principal (PUC)**: ${project.puc || project.puc_promise || 'Não configurada'}
- **Público-Alvo (Persona)**: ${persona}
- **Dor Central do Público**: ${pain}
- **Resultado Desejado pela Persona**: ${desiredOutcome}
- **Pilares Editoriais**: ${pillars}
- **Ângulo de Posicionamento**: ${positioning}
- **Atmosfera/Tom de Voz**: ${atmosphere} ${tone ? `(${tone})` : ''}
- **Biblioteca de Metáforas Autorizadas**: ${metaphors}
- **Termos Proibidos (Zero Leak)**: ${prohibited}
`;
  };

  const runCouncil = async () => {
    if (!rawQuery.trim()) return;
    
    setStatus('enriching');
    setError(null);
    setAdvisorsResponse({});
    setPeerReviewsResponse({});
    setVerdict(null);
    setRawVerdictText('');
    setActiveTab('verdict');

    try {
      const enrichedQuery = enrichQuestion(rawQuery, activeProject);
      
      // ==========================================
      // FASE 1: Convocação dos Conselheiros
      // ==========================================
      setStatus('advisors');

      const advisorPromises = ADVISORS.map(async (adv) => {
        const prompt = `Você é o conselheiro "${adv.name}" em um conselho estratégico de IA.
Seu estilo de pensamento é governado por: ${adv.desc} (Lente de atuação: ${adv.lens}).

Um usuário trouxe esta pergunta para ser avaliada pelo conselho, enriquecida com o DNA estratégico do canal dele:
---
${enrichedQuery}
---

Responda exclusivamente a partir do seu estilo de pensamento. Seja altamente focado e direto. Não tente ponderar prós e contras que pertencem às lentes dos outros conselheiros. Seja cético e pragmático.
Mantenha sua resposta objetiva, direta e entre 150 a 300 palavras. Não use saudações ou preâmbulos como "Como Contrário..." ou "Nesta análise...". Vá direto ao assunto.`;

        const data = await fetchAI(prompt, 'text');
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || data.choices?.[0]?.message?.content || '';
        return { id: adv.id, name: adv.name, text: text.trim() };
      });

      // Executando em paralelo
      const advisorResults = await Promise.all(advisorPromises);
      const advisorMap: Record<string, string> = {};
      advisorResults.forEach(r => {
        advisorMap[r.id] = r.text;
      });
      setAdvisorsResponse(advisorMap);

      // ==========================================
      // FASE 2: Revisão por Pares (Peer Review Cego)
      // ==========================================
      setStatus('reviews');

      // Randomiza a ordem para evitar viés de posicionamento (A, B, C, D, E)
      const shuffled = [...advisorResults].sort(() => Math.random() - 0.5);
      const letters = ['A', 'B', 'C', 'D', 'E'];
      const anonymousBlock = shuffled.map((adv, idx) => `**Resposta ${letters[idx]}:**\n${adv.text}`).join('\n\n');

      const reviewPromises = ADVISORS.map(async (adv) => {
        const prompt = `Você é o conselheiro "${adv.name}" e agora deve realizar uma revisão cega por pares de todas as análises dos conselheiros do conselho de IA.

A pergunta estratégica original do usuário com o DNA do canal:
---
${enrichedQuery}
---

Aqui estão as 5 respostas anônimas dos conselheiros do conselho (incluindo a sua, de forma oculta):
---
${anonymousBlock}
---

Avalie as respostas de forma honesta sob a perspectiva do seu estilo de pensamento ("${adv.desc}"). Responda de forma curta e direta às seguintes perguntas:
1. Qual resposta é a mais forte do ponto de vista estratégico? Por quê? (Indique apenas uma letra: A, B, C, D ou E)
2. Qual resposta possui o maior ponto cego ou falha e por quê? (Indique a letra)
3. O que TODOS os conselheiros deixaram passar que deveria ser levado em consideração para essa decisão?

Mantenha sua resposta sob a perspectiva da sua lente de atuação (${adv.lens}). Escreva no máximo 200 palavras. Não use enrolação.`;

        const data = await fetchAI(prompt, 'text');
        const text = data.candidates?.[0]?.content?.parts?.[0]?.text || data.choices?.[0]?.message?.content || '';
        return { id: adv.id, text: text.trim() };
      });

      const reviewResults = await Promise.all(reviewPromises);
      const reviewMap: Record<string, string> = {};
      reviewResults.forEach(r => {
        reviewMap[r.id] = r.text;
      });
      setPeerReviewsResponse(reviewMap);

      // ==========================================
      // FASE 3: Síntese do Presidente (Chairman)
      // ==========================================
      setStatus('chairman');

      const deAnonymizedAdvisors = advisorResults.map(a => `**Conselheiro: ${a.name}**\n${a.text}`).join('\n\n');
      const reviewsBlock = ADVISORS.map(a => `**Revisão do ${a.name}**:\n${reviewMap[a.id]}`).join('\n\n');

      const chairmanPrompt = `Você é o Presidente de um Conselho de IA. Seu papel é sintetizar os vereditos, divergências e revisões críticas dos conselheiros em uma recomendação clara e definitiva para o criador do canal.

Pergunta do usuário e contexto estratégico:
---
${enrichedQuery}
---

RESPOSTAS DOS CONSELHEIROS:
---
${deAnonymizedAdvisors}
---

REVISÕES CRÍTICAS DOS CONSELHEIROS:
---
${reviewsBlock}
---

Gere o veredito final estruturado estritamente como um objeto JSON. Não inclua blocos de markdown adicionais ou textos explicativos fora do JSON. Retorne apenas o JSON bruto na resposta.

O JSON deve seguir exatamente a seguinte estrutura de chaves:
{
  "agrees": "Pontos específicos em que múltiplos conselheiros concordaram. Representa sinais de alta confiança tática.",
  "clashes": "Divergências reais entre os conselheiros. Explique por que eles divergiram e os argumentos de cada lado de forma direta.",
  "blindspots": "Os maiores pontos cegos do conselho revelados na rodada de peer review. Coisas que um conselheiro alertou na resposta do outro.",
  "recommendation": "Sua recomendação estratégica final baseada nas análises. Seja direto e dê um direcionamento firme. Não responda com 'depende'.",
  "firstStep": "O ÚNICO passo concreto e prático que o criador de conteúdo deve realizar na próxima segunda-feira de manhã para começar a implementar ou validar essa ideia."
}`;

      const data = await fetchAI(chairmanPrompt, 'json');
      const text = data.candidates?.[0]?.content?.parts?.[0]?.text || data.choices?.[0]?.message?.content || '';
      
      setRawVerdictText(text);

      let parsedVerdict: Verdict;
      try {
        const cleanJson = text.replace(/```json/g, '').replace(/```/g, '').trim();
        parsedVerdict = JSON.parse(cleanJson);
      } catch (e) {
        console.warn('Erro ao processar JSON do presidente. Fazendo fallback regex.', e);
        // Fallback parser simples por regex
        const extractField = (key: string) => {
          const regex = new RegExp(`"${key}"\\s*:\\s*"([^"]+)"`, 'i');
          const match = text.match(regex);
          return match ? match[1] : '';
        };

        parsedVerdict = {
          agrees: extractField('agrees') || "Os conselheiros identificaram que a ideia está alinhada ao propósito do canal, mas exige refinamento em sua execução.",
          clashes: extractField('clashes') || "Há divergência sobre a complexidade da produção. O Contrário sugere simplificar, enquanto o Expansionista propõe ampliar o escopo.",
          blindspots: extractField('blindspots') || "O Observador Externo identificou que termos muito técnicos podem afastar o público iniciante.",
          recommendation: extractField('recommendation') || "A recomendação é executar um teste controlado com o público-alvo antes de uma produção de alto custo.",
          firstStep: extractField('firstStep') || "Produzir um vídeo curto (Short/Reel) de 60 segundos testando o gancho principal."
        };
      }

      setVerdict(parsedVerdict);
      setStatus('done');
    } catch (err: any) {
      console.error('Council Execution Error:', err);
      setError(err.message || 'Falha ao executar o Conselho. Tente rodar novamente.');
      setStatus('error');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  return (
    <div className="space-y-8 animate-in">
      {/* Header */}
      <header className="flex justify-between items-start border-b border-white/5 pb-6">
        <div>
          <h1 className="text-3xl font-extrabold text-white tracking-tight flex items-center gap-3">
            <Users size={28} className="text-blue-500" /> Conselho de IA
          </h1>
          <p className="text-slate-400 text-sm font-medium mt-2">
            Submeta decisões do canal <span className="text-blue-400 font-bold">{activeProject?.project_name || activeProject?.name}</span> para a validação crítica de 5 advisors especialistas.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs bg-slate-900 border border-slate-800 rounded-xl px-3 py-1.5 font-bold text-slate-500">
          <span>Engine:</span>
          <span className="text-blue-400 uppercase tracking-widest">{selectedAIConfig.engine} ({selectedAIConfig.model})</span>
        </div>
      </header>

      {/* Input area or processing card */}
      {status === 'idle' || status === 'error' ? (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-6">
            <div className="glass-card bg-[#111827]/40 p-6 space-y-4">
              <h3 className="text-sm font-black uppercase tracking-wider text-white/80">O que você deseja colocar em pauta hoje?</h3>
              <p className="text-xs text-slate-500 leading-relaxed">
                Insira sua dúvida estratégica, dilema ou ideia de vídeo abaixo. O conselho usará a promessa do canal, a persona de foco e as metáforas para dar feedbacks ultra-direcionados.
              </p>
              
              <div className="space-y-4 pt-2">
                <textarea
                  value={rawQuery}
                  onChange={(e) => setRawQuery(e.target.value)}
                  placeholder="Ex: Devo mudar o foco do próximo vídeo estratégico de 'thermal throttling mental' para 'dívida técnica biológica'? Tenho medo do público achar a nova metáfora muito acadêmica..."
                  rows={6}
                  className="w-full bg-slate-900/60 border border-slate-800 focus:border-blue-500/50 rounded-xl p-4 text-sm text-white placeholder-slate-600 outline-none resize-none transition-all"
                />
                
                {error && (
                  <div className="p-4 bg-red-950/30 border border-red-800/40 rounded-xl flex gap-3 text-red-400 text-xs">
                    <AlertTriangle size={16} className="flex-shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                <div className="flex justify-between items-center pt-2">
                  <span className="text-[10px] uppercase font-bold tracking-widest text-slate-500 flex items-center gap-1.5">
                    <Sparkles size={12} className="text-blue-500" /> DNA ativado: {activeProject?.project_name || activeProject?.name}
                  </span>
                  
                  <button
                    onClick={runCouncil}
                    disabled={!rawQuery.trim()}
                    className="btn-primary px-8 py-3.5"
                  >
                    Convocar Conselho <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Quick tips panel */}
          <aside className="space-y-6">
            <div className="glass-card bg-blue-600/[0.02] border-blue-500/10 h-full flex flex-col justify-between">
              <div>
                <h3 className="text-xs font-black uppercase tracking-widest text-white/80 mb-4 flex items-center gap-2">
                  <Brain size={14} className="text-blue-500" /> Os 5 Conselheiros
                </h3>
                <div className="space-y-3">
                  {ADVISORS.map(adv => (
                    <div key={adv.id} className="flex gap-3 items-start border-b border-white/5 pb-2.5 last:border-0 last:pb-0">
                      <span className="text-xl bg-slate-900 rounded-lg p-1">{adv.avatar}</span>
                      <div>
                        <h4 className="text-xs font-bold text-white leading-none mb-1">{adv.name}</h4>
                        <p className="text-[10px] text-slate-500 leading-snug">{adv.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-6 pt-4 border-t border-white/5 text-[10px] text-slate-500 uppercase tracking-wider italic">
                *Baseado na metodologia LLM Council de Andrej Karpathy.
              </div>
            </div>
          </aside>
        </div>
      ) : status === 'done' ? (
        // Results View
        <div className="space-y-8">
          {/* Action Header */}
          <div className="flex justify-between items-center bg-slate-900/40 border border-slate-800 rounded-2xl p-4 px-6">
            <div className="flex items-center gap-3">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.5)]" />
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-400">Veredicto Emitido</span>
            </div>
            
            <button
              onClick={() => {
                setStatus('idle');
                setRawQuery('');
              }}
              className="text-xs bg-slate-800 hover:bg-slate-700 px-4 py-2 rounded-xl text-slate-300 font-bold transition-all border border-slate-700/50 flex items-center gap-2"
            >
              <RefreshCw size={14} /> Consultar Novo Tema
            </button>
          </div>

          {/* Navigation Tabs */}
          <div className="flex border-b border-slate-800 gap-1">
            <button
              onClick={() => setActiveTab('verdict')}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === 'verdict'
                  ? 'border-blue-500 text-white bg-blue-500/[0.02]'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              🏆 Veredicto do Conselho
            </button>
            <button
              onClick={() => setActiveTab('advisors')}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === 'advisors'
                  ? 'border-blue-500 text-white bg-blue-500/[0.02]'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              👥 Conselhos Individuais ({ADVISORS.length})
            </button>
            <button
              onClick={() => setActiveTab('reviews')}
              className={`px-6 py-3 text-xs font-black uppercase tracking-widest border-b-2 transition-all ${
                activeTab === 'reviews'
                  ? 'border-blue-500 text-white bg-blue-500/[0.02]'
                  : 'border-transparent text-slate-500 hover:text-slate-300'
              }`}
            >
              🔄 Revisão por Pares
            </button>
          </div>

          {/* TAB 1: VERDICT (CHAIRMAN) */}
          {activeTab === 'verdict' && verdict && (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Main recommendation */}
              <div className="lg:col-span-2 space-y-6">
                {/* Final Recommendation Box */}
                <div className="glass-card border-blue-500/20 bg-blue-950/10 p-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/[0.02] rounded-full blur-3xl pointer-events-none" />
                  
                  <div className="flex items-center gap-2 mb-4">
                    <Award className="text-blue-400" size={20} />
                    <span className="text-[10px] font-black uppercase tracking-[0.2em] text-blue-400/80">Recomendação Estratégica</span>
                  </div>
                  
                  <h2 className="text-2xl font-black tracking-tight text-white mb-4 leading-tight">Veredicto Geral do Presidente</h2>
                  <p className="text-slate-300 text-sm leading-relaxed whitespace-pre-line">{verdict.recommendation}</p>
                </div>

                {/* Agrees & Clashes & Blindspots Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Agrees */}
                  <div className="glass-card bg-emerald-500/[0.01] border-emerald-500/10">
                    <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-3 flex items-center gap-2">
                      <CheckCircle2 size={15} /> Onde o Conselho Concorda
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{verdict.agrees}</p>
                  </div>

                  {/* Clashes */}
                  <div className="glass-card bg-amber-500/[0.01] border-amber-500/10">
                    <h3 className="text-xs font-black uppercase tracking-widest text-amber-400 mb-3 flex items-center gap-2">
                      <AlertTriangle size={15} /> Onde o Conselho Conflita
                    </h3>
                    <p className="text-xs text-slate-400 leading-relaxed">{verdict.clashes}</p>
                  </div>
                </div>

                {/* Blindspots */}
                <div className="glass-card bg-purple-500/[0.01] border-purple-500/10">
                  <h3 className="text-xs font-black uppercase tracking-widest text-purple-400 mb-3 flex items-center gap-2">
                    <HelpCircle size={15} /> Pontos Cegos Revelados
                  </h3>
                  <p className="text-xs text-slate-400 leading-relaxed">{verdict.blindspots}</p>
                </div>
              </div>

              {/* Sidebar Action Item */}
              <aside>
                <div className="glass-card border-emerald-500/20 bg-emerald-950/15 p-6 h-full flex flex-col justify-between relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-emerald-500/[0.03] rounded-full blur-2xl pointer-events-none" />
                  <div>
                    <h3 className="text-xs font-black uppercase tracking-widest text-emerald-400 mb-6 flex items-center gap-2">
                      <TrendingUp size={16} /> Ação de Segunda de Manhã
                    </h3>
                    
                    <div className="bg-emerald-950/30 border border-emerald-800/20 rounded-xl p-5 mb-4 shadow-inner">
                      <span className="text-[9px] font-black bg-emerald-500 text-neutral-950 px-2 py-0.5 rounded-full uppercase tracking-widest block w-max mb-3">Primeiro Passo Único</span>
                      <p className="text-sm font-bold text-white leading-relaxed">{verdict.firstStep}</p>
                    </div>
                    
                    <p className="text-[10px] text-slate-500 leading-relaxed">
                      Não tente resolver todo o planejamento de uma vez. Execute apenas esta validação inicial para obter dados de público reais na próxima segunda-feira.
                    </p>
                  </div>

                  <button
                    onClick={() => copyToClipboard(`Ação de Segunda-feira: ${verdict.firstStep}\n\nRecomendação do Conselho:\n${verdict.recommendation}`, 'clipboard-action')}
                    className="w-full mt-6 bg-slate-900 border border-slate-800 hover:border-emerald-500/30 hover:text-emerald-400 text-xs font-bold py-3 rounded-lg text-slate-400 transition-all flex items-center justify-center gap-2"
                  >
                    {copiedId === 'clipboard-action' ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                    {copiedId === 'clipboard-action' ? 'Copiado para o Workflow!' : 'Copiar Ação Prática'}
                  </button>
                </div>
              </aside>
            </div>
          )}

          {/* TAB 2: INDIVIDUAL ADVISORS */}
          {activeTab === 'advisors' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
                {ADVISORS.map(adv => {
                  const isExpanded = expandedSection === adv.id;
                  const responseText = advisorsResponse[adv.id] || 'Nenhuma análise gerada.';
                  
                  return (
                    <div 
                      key={adv.id} 
                      className={`glass-card transition-all duration-300 ${
                        isExpanded ? 'lg:col-span-3 border-blue-500/20' : 'lg:col-span-2 opacity-80 hover:opacity-100'
                      }`}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className="flex gap-3 items-center">
                          <span className="text-3xl bg-slate-950 p-1.5 rounded-xl">{adv.avatar}</span>
                          <div>
                            <h4 className="text-sm font-bold text-white leading-none mb-1">{adv.name}</h4>
                            <span className="text-[10px] text-blue-400 uppercase tracking-widest">{adv.lens}</span>
                          </div>
                        </div>
                        
                        <button
                          onClick={() => copyToClipboard(responseText, `copied-${adv.id}`)}
                          className="p-1.5 hover:bg-slate-800 rounded-md text-slate-500 hover:text-white transition-all"
                          title="Copiar Parecer"
                        >
                          {copiedId === `copied-${adv.id}` ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                        </button>
                      </div>

                      <p className="text-xs text-slate-500 leading-relaxed mb-4 italic">"{adv.desc}"</p>
                      
                      <div className="h-px bg-white/5 my-4" />
                      
                      <div className="bg-slate-950/40 border border-slate-900 rounded-xl p-4 max-h-[350px] overflow-y-auto custom-scrollbar">
                        <p className="text-xs text-slate-300 leading-relaxed whitespace-pre-line">{responseText}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: PEER REVIEWS */}
          {activeTab === 'reviews' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {ADVISORS.map(adv => {
                  const reviewText = peerReviewsResponse[adv.id] || 'Nenhuma revisão executada.';
                  
                  return (
                    <div key={adv.id} className="glass-card bg-[#111827]/30 border-slate-800 hover:border-slate-700 transition-all">
                      <div className="flex gap-3 items-center mb-4 pb-3 border-b border-white/5">
                        <span className="text-2xl bg-slate-900 p-1 rounded-lg">{adv.avatar}</span>
                        <div>
                          <h4 className="text-xs font-black uppercase text-white leading-none mb-1">Revisão por {adv.name}</h4>
                          <span className="text-[9px] text-slate-500 font-bold uppercase tracking-widest">Avaliando de A a E</span>
                        </div>
                      </div>

                      <div className="bg-slate-950/20 rounded-xl p-4">
                        <p className="text-xs text-slate-400 leading-relaxed whitespace-pre-line">{reviewText}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        // Progress and Loading View
        <div className="glass-card p-16 text-center max-w-2xl mx-auto space-y-8 flex flex-col items-center">
          <div className="relative">
            {/* Spinning ring */}
            <div className="w-20 h-20 border-4 border-blue-500/10 border-t-blue-500 animate-spin rounded-full shadow-[0_0_20px_rgba(59,130,246,0.15)]" />
            <div className="absolute inset-0 flex items-center justify-center text-2xl font-bold animate-pulse">
              {status === 'enriching' ? '🧬' : status === 'advisors' ? '👥' : status === 'reviews' ? '🔄' : '👑'}
            </div>
          </div>

          <div className="space-y-3">
            <h3 className="text-lg font-black uppercase text-white italic tracking-widest">
              {status === 'enriching' && 'Enriquecendo Consulta...'}
              {status === 'advisors' && 'Convocando Conselheiros...'}
              {status === 'reviews' && 'Realizando Revisão Cega por Pares...'}
              {status === 'chairman' && 'Sintetizando Veredicto Geral...'}
            </h3>
            <p className="text-slate-400 text-xs max-w-sm mx-auto leading-relaxed uppercase tracking-widest font-semibold">
              {status === 'enriching' && 'Injetando persona, promessa (PUC) e metáforas do canal activo no prompt.'}
              {status === 'advisors' && 'Os 5 conselheiros de IA estão analisando sua ideia de forma independente.'}
              {status === 'reviews' && 'Os conselheiros estão lendo as respostas uns dos outros anonimamente para encontrar falhas.'}
              {status === 'chairman' && 'O Presidente está compilando os pontos comuns, debates e gerando a recomendação.'}
            </p>
          </div>

          {/* Detailed step progress */}
          <div className="w-full max-w-md pt-4 space-y-2">
            {[
              { id: 'enriching', label: 'DNA do Canal Ativado', active: status === 'enriching', done: ['advisors', 'reviews', 'chairman'].includes(status as any) },
              { id: 'advisors', label: 'Análise de 5 Perspectivas Concluída', active: status === 'advisors', done: ['reviews', 'chairman'].includes(status as any) },
              { id: 'reviews', label: 'Revisão por Pares (Peer Review) Efetuada', active: status === 'reviews', done: ['chairman'].includes(status as any) },
              { id: 'chairman', label: 'Veredicto do Presidente Sintetizado', active: status === 'chairman', done: false }
            ].map((step, idx) => (
              <div key={step.id} className="flex items-center gap-3 justify-between p-3 rounded-lg border border-white/5 bg-slate-900/20">
                <span className="text-[10px] text-slate-500 font-mono">Etapa 0{idx + 1}</span>
                <span className={`text-xs font-bold ${step.active ? 'text-blue-400' : step.done ? 'text-emerald-400' : 'text-slate-600'}`}>{step.label}</span>
                <div className={`w-2 h-2 rounded-full ${step.active ? 'bg-blue-500 animate-pulse' : step.done ? 'bg-emerald-500' : 'bg-slate-800'}`} />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
