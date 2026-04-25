"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { ArrowLeft, Copy, Mic } from 'lucide-react';

// ============================================================================
// Types & Defaults
// ============================================================================
interface CustomPreset {
  id: string;
  name: string;
  genre: string;
  emotion: string;
  instruments: string;
  vocal: string;
  rules: string;
  isCustom: boolean;
}

const DEFAULT_PRESETS: CustomPreset[] = [
  {
    id: 'default',
    name: 'Padrão (Genérico)',
    genre: '',
    emotion: '',
    instruments: '',
    vocal: '',
    rules: 'CRITICAL RULE: Structure the song perfectly for a standard pop/modern song (Intro, Verse, Chorus, Verse, Chorus, Bridge, Outro).',
    isCustom: false
  },
  {
    id: 'som_que_reza',
    name: 'Som que Reza (Católico/Sensível)',
    genre: 'Cinematic, ambient',
    emotion: 'Reverent, emotional, sensitive',
    instruments: 'Acoustic guitar, soft piano',
    vocal: 'Breathy, raw, sensitive',
    rules: `CRITICAL RULES FOR "SOM QUE REZA":
1. The lyrics MUST be in Brazilian Portuguese.
2. The theme is a spiritual journey of a Catholic soul passing through pain/desert and finding adoration/peace in God.
3. The tone must be sensitive, poetic, human, and reverent. 
4. Avoid generic evangelical cliches; focus on Catholic mysticism, the Eucharist, silence, and the cross.
5. Vocals are usually raw, emotional, and sensitive.`,
    isCustom: false
  }
];

interface SunoGeneration {
  id: string;
  created_at: string;
  preset_used: string;
  idea_prompt: string;
  song_title?: string;
  config_prompt?: string;
  style_prompt: string;
  lyrics: string;
  veo3_prompts: string | null;
}

// ============================================================================
// System Prompts
// ============================================================================
const getSunoSystemPrompt = (presetRules: string, tema: string, vuln: string, genre: string, emotion: string, instruments: string, vocal: string, includeSpokenIntro: boolean) => {
  return `You are an expert AI music prompt engineer specializing in the Musci.io framework for Suno AI.
Your goal is to generate a highly optimized "Song Title", "Advanced Configs", "Style Prompt" and "Lyrics with Metatags" based on the user's inputs.

User Inputs:
- Theme (Tema): ${tema}
- Vulnerability/Pain (Vulnerabilidade): ${vuln}
- Genre/Era: ${genre}
- Emotion/Mood: ${emotion}
- Instruments: ${instruments}
- Vocal Style: ${vocal}

${presetRules}

CRITICAL FORMATTING INSTRUCTIONS:
1. Do NOT return JSON. You must return EXACTLY the 4 blocks below, separated by the exact headers.
2. The lyrics MUST be completely generated, from [Intro] to [Outro]. Do not cut or abbreviate the lyrics. Length is not an issue, provide the full song.
3. The lyrics MUST already contain all the necessary structural metatags (like [Intro], [Verse], [Chorus], [Bridge], [Outro]) and vocal directions (like (whispering), (belting)) inline.
${includeSpokenIntro ? '4. CRITICAL: The lyrics MUST start with a [Spoken Intro: soft, reflective] containing exactly 4 lines of spoken introduction.' : ''}

=== SONG TITLE ===
<A creative and emotional title for the song>

=== CONFIG ===
Vocal Gender: <Male/Female/Duet>
Lyrics Mode: Manual
Weirdness: <suggest a value from 10% to 50%>
Style Influence: <suggest a value from 30% to 80%>

=== STYLES ===
<A concise comma-separated list of tags (max 120 chars) combining the genre, emotion, instruments, and vocal style.>

=== LYRICS ===
<The full, complete lyrics with all metatags properly placed.>`;
};

const getVeo3SystemPrompt = (lyrics: string, count: number) => {
  return `You are an expert film director and AI video prompt engineer.
Based on the following song lyrics, generate ${count} highly visual, cinematic, and descriptive prompts for Google Veo3 or Runway Gen-3.
Each prompt should describe a 5-second highly cinematic scene that perfectly matches the emotion and progression of the song.

Song Lyrics:
${lyrics}

CRITICAL RULES:
1. Output MUST be in JSON format.
2. The JSON must contain an array called "prompts" with ${count} strings.
3. Each prompt must be extremely descriptive regarding lighting, camera angle, subject, action, and environment.
4. Do NOT include audio or dialogue descriptions, only visuals.

Example Output:
{
  "prompts": [
    "Wide drone shot over a misty valley at dawn, cold blue tones, cinematic lighting, slow forward tracking.",
    "Close up of a tear falling down a young woman's face, warm golden hour lighting, shallow depth of field, 35mm lens."
  ]
}`;
};

export default function SunoStudio() {
  // State: Presets
  const [presets, setPresets] = useState<CustomPreset[]>(DEFAULT_PRESETS);
  const [selectedPresetId, setSelectedPresetId] = useState<string>('default');

  // State: Inputs
  const [genre, setGenre] = useState('');
  const [emotion, setEmotion] = useState('');
  const [instruments, setInstruments] = useState('');
  const [vocal, setVocal] = useState('');
  const [tema, setTema] = useState('');
  const [vulnerabilidade, setVulnerabilidade] = useState('');
  const [veoCount, setVeoCount] = useState(5);
  const [includeSpokenIntro, setIncludeSpokenIntro] = useState(false);

  // State: Outputs
  const [songTitle, setSongTitle] = useState('');
  const [configPrompt, setConfigPrompt] = useState('');
  const [stylePrompt, setStylePrompt] = useState('');
  const [lyrics, setLyrics] = useState('');
  const [veoPrompts, setVeoPrompts] = useState<string[]>([]);
  
  // State: History & Modals
  const [history, setHistory] = useState<SunoGeneration[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showSavePreset, setShowSavePreset] = useState(false);
  const [newPresetName, setNewPresetName] = useState('');
  const [newPresetRules, setNewPresetRules] = useState('');

  // State: UI
  const [isGeneratingSuno, setIsGeneratingSuno] = useState(false);
  const [isGeneratingVeo, setIsGeneratingVeo] = useState(false);
  const [error, setError] = useState('');

  // Initialization
  useEffect(() => {
    fetchHistory();
    const savedPresets = localStorage.getItem('suno_custom_presets');
    if (savedPresets) {
      try {
        const parsed = JSON.parse(savedPresets);
        setPresets([...DEFAULT_PRESETS, ...parsed]);
      } catch (e) {
        console.error('Failed to parse custom presets', e);
      }
    }
  }, []);

  // Sync inputs when preset changes
  useEffect(() => {
    const preset = presets.find(p => p.id === selectedPresetId);
    if (preset) {
      setGenre(preset.genre);
      setEmotion(preset.emotion);
      setInstruments(preset.instruments);
      setVocal(preset.vocal);
    }
  }, [selectedPresetId, presets]);

  const fetchHistory = async () => {
    try {
      const { data, error } = await supabase
        .from('suno_generations')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(20);
      
      if (error) throw error;
      if (data) setHistory(data);
    } catch (err: any) {
      console.error('Failed to load history:', err);
    }
  };

  // Preset Management
  const handleSavePreset = () => {
    if (!newPresetName.trim()) return;
    const newPreset: CustomPreset = {
      id: `custom_${Date.now()}`,
      name: newPresetName,
      genre, emotion, instruments, vocal,
      rules: newPresetRules,
      isCustom: true
    };
    
    const customPresets = presets.filter(p => p.isCustom);
    customPresets.push(newPreset);
    
    localStorage.setItem('suno_custom_presets', JSON.stringify(customPresets));
    setPresets([...DEFAULT_PRESETS, ...customPresets]);
    setSelectedPresetId(newPreset.id);
    setShowSavePreset(false);
    setNewPresetName('');
    setNewPresetRules('');
  };

  const handleDeletePreset = (id: string) => {
    const customPresets = presets.filter(p => p.isCustom && p.id !== id);
    localStorage.setItem('suno_custom_presets', JSON.stringify(customPresets));
    setPresets([...DEFAULT_PRESETS, ...customPresets]);
    if (selectedPresetId === id) setSelectedPresetId('default');
  };

  const handleGenerateSuno = async () => {
    if (!tema) {
      setError('O campo "Tema" é obrigatório.');
      return;
    }
    setError('');
    setIsGeneratingSuno(true);

    try {
      const geminiKey = localStorage.getItem('yt_gemini_key') || '';
      if (!geminiKey) throw new Error('Chave do Gemini não encontrada no LocalStorage. Vá em Gestão Master.');

      const activePreset = presets.find(p => p.id === selectedPresetId);
      const rules = activePreset?.rules || '';
      const prompt = getSunoSystemPrompt(rules, tema, vulnerabilidade, genre, emotion, instruments, vocal, includeSpokenIntro);

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'gemini',
          model: 'gemini-3.1-pro',
          prompt: prompt,
          apiKeyOverwrite: geminiKey,
          responseType: 'text' // Texto puro
        })
      });

      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      
      const data = await res.json();
      const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      
      // Parser robusto com âncoras de linha para não confundir com o conteúdo (ex: "Style Influence")
      const headers = [
        { key: 'title', regex: /^\s*(?:===|\*\*|#)*\s*(?:SONG TITLE|TÍTULO DA MÚSICA)\s*(?:===|\*\*|#|:)*\s*$/im },
        { key: 'config', regex: /^\s*(?:===|\*\*|#)*\s*CONFIG(?:URAÇÕES)?\s*(?:===|\*\*|#|:)*\s*$/im },
        { key: 'style', regex: /^\s*(?:===|\*\*|#)*\s*STYLES?\s*(?:===|\*\*|#|:)*\s*$/im },
        { key: 'lyrics', regex: /^\s*(?:===|\*\*|#)*\s*(?:LYRICS?|LETRA(?: DA MÚSICA)?|SPOKEN INTRO)\s*(?:===|\*\*|#|:)*\s*$/im }
      ];

      const foundHeaders = headers.map(h => {
        const match = textResponse.match(h.regex);
        return {
          key: h.key,
          index: match ? match.index! : -1,
          length: match ? match[0].length : 0
        };
      }).filter(h => h.index !== -1).sort((a, b) => a.index - b.index);

      const extractPart = (key: string) => {
        const idx = foundHeaders.findIndex(h => h.key === key);
        if (idx === -1) return '';
        const start = foundHeaders[idx].index + foundHeaders[idx].length;
        const end = idx < foundHeaders.length - 1 ? foundHeaders[idx + 1].index : textResponse.length;
        return textResponse.substring(start, end).replace(/^\s*[:\-*]*\s*/, '').trim();
      };

      let extractedTitle = extractPart('title').replace(/\*\*/g, '');
      let extractedConfig = extractPart('config').replace(/\*\*/g, '');
      let extractedStyle = extractPart('style').replace(/\*\*/g, '');
      let extractedLyrics = extractPart('lyrics');

      // Fallback caso a IA não tenha gerado o header de LYRICS corretamente
      if (!extractedLyrics) {
         // Procura o início de uma letra comum, como [Intro], [Verso], etc
         const introMatch = textResponse.match(/\[(Intro|Verso|Verse|Chorus|Refrão|Instrumental|Spoken)\]/i);
         if (introMatch) {
            extractedLyrics = textResponse.substring(introMatch.index!).trim();
            // Limpa se a letra tiver sido engolida pela seção de estilo
            if (extractedStyle && extractedStyle.includes(extractedLyrics)) {
               extractedStyle = extractedStyle.replace(extractedLyrics, '').trim();
            }
         } else if (foundHeaders.length === 0) {
            extractedLyrics = textResponse.trim();
            extractedStyle = "Falha ao processar os delimitadores.";
         }
      }

      setSongTitle(extractedTitle);
      setConfigPrompt(extractedConfig);
      setStylePrompt(extractedStyle);
      setLyrics(extractedLyrics);
      setVeoPrompts([]);

      const ideaMerged = `Tema: ${tema} | Vulnerabilidade: ${vulnerabilidade}`;

      // Tenta salvar, ignorando erros se a migration ainda não foi rodada
      await supabase.from('suno_generations').insert({
        preset_used: activePreset?.name || selectedPresetId,
        idea_prompt: ideaMerged,
        song_title: extractedTitle,
        config_prompt: extractedConfig,
        style_prompt: extractedStyle,
        lyrics: extractedLyrics,
      });

      fetchHistory();

    } catch (err: any) {
      setError(err.message || 'Erro desconhecido');
    } finally {
      setIsGeneratingSuno(false);
    }
  };

  const handleGenerateVeo = async () => {
    if (!lyrics) {
      setError('Gere a música primeiro para criar os prompts de vídeo.');
      return;
    }
    setError('');
    setIsGeneratingVeo(true);

    try {
      const geminiKey = localStorage.getItem('yt_gemini_key') || '';
      if (!geminiKey) throw new Error('Chave do Gemini não encontrada.');

      const prompt = getVeo3SystemPrompt(lyrics, veoCount);

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'gemini',
          model: 'gemini-3.1-pro',
          prompt: prompt,
          apiKeyOverwrite: geminiKey,
          responseType: 'json'
        })
      });

      if (!res.ok) throw new Error(`API Error: ${res.statusText}`);
      
      const data = await res.json();
      
      let parsed = null;
      try {
        const textResponse = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        parsed = JSON.parse(textResponse.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim());
      } catch (e) {
        throw new Error('Falha ao processar o JSON do Veo3.');
      }

      setVeoPrompts(parsed.prompts || []);

      if (history.length > 0) {
        const latestId = history[0].id;
        await supabase.from('suno_generations').update({
          veo3_prompts: JSON.stringify(parsed.prompts)
        }).eq('id', latestId);
        fetchHistory();
      }

    } catch (err: any) {
      setError(err.message || 'Erro desconhecido ao gerar vídeo.');
    } finally {
      setIsGeneratingVeo(false);
    }
  };

  const handleCopyText = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const handleClear = () => {
    setTema(''); setVulnerabilidade(''); 
    setSongTitle(''); setConfigPrompt(''); setStylePrompt(''); setLyrics(''); setVeoPrompts([]);
  };

  const loadHistoryItem = (item: SunoGeneration) => {
    const foundPreset = presets.find(p => p.name === item.preset_used) || presets[0];
    setSelectedPresetId(foundPreset.id);
    
    const parts = item.idea_prompt.split('| Vulnerabilidade:');
    if (parts.length === 2) {
      setTema(parts[0].replace('Tema:', '').trim());
      setVulnerabilidade(parts[1].trim());
    } else {
      setTema(item.idea_prompt);
      setVulnerabilidade('');
    }

    setSongTitle(item.song_title || '');
    setConfigPrompt(item.config_prompt || '');
    setStylePrompt(item.style_prompt || '');
    setLyrics(item.lyrics || '');
    
    if (item.veo3_prompts) {
      try {
        setVeoPrompts(JSON.parse(item.veo3_prompts));
      } catch {
        setVeoPrompts([item.veo3_prompts]);
      }
    } else {
      setVeoPrompts([]);
    }
    setShowHistory(false);
  };

  const isCustomPreset = presets.find(p => p.id === selectedPresetId)?.isCustom;

  // Renderizador de Card do Suno
  const renderSunoCard = (title: string, content: string, setContent: (val: string) => void, rows: number = 2) => {
    if (!content) return null;
    return (
      <div className="mb-6">
        <h3 className="text-sm font-bold text-yellow-500/80 mb-2">{title}</h3>
        <div className="bg-[#0b0f19] border border-neutral-800 rounded-lg p-1 relative group shadow-lg">
          <button 
            onClick={() => handleCopyText(content)}
            className="absolute top-3 right-3 text-neutral-400 hover:text-white bg-neutral-800 hover:bg-neutral-700 p-1.5 rounded transition-all z-10 opacity-70 hover:opacity-100"
            title="Copiar"
          >
            <Copy size={16} />
          </button>
          <textarea 
            value={content}
            onChange={e => setContent(e.target.value)}
            rows={rows}
            className="w-full bg-transparent p-3 text-sm focus:outline-none resize-none font-mono leading-relaxed text-blue-100/90"
            style={{ minHeight: `${rows * 1.5}rem` }}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="flex h-screen bg-neutral-950 text-neutral-200 font-sans">
      
      {/* LEFT SIDEBAR: SUNO CONFIG */}
      <div className="w-80 border-r border-neutral-800 bg-[#0f111a] flex flex-col p-4 overflow-y-auto custom-scrollbar">
        <div className="flex items-center gap-2 mb-6">
          <a 
            href="/" 
            className="p-1.5 bg-neutral-800 hover:bg-neutral-700 rounded-lg text-neutral-300 transition-colors"
            title="Voltar para o Sistema"
          >
            <ArrowLeft size={18} />
          </a>
          <h1 className="text-lg font-bold text-white flex-1">
            Suno Studio
          </h1>
          <button onClick={() => setShowHistory(true)} className="text-xs bg-neutral-800 hover:bg-neutral-700 px-2 py-1.5 rounded text-neutral-300">
            Histórico
          </button>
        </div>
        
        {error && <div className="bg-red-900/50 border border-red-800 text-red-300 p-3 rounded mb-4 text-sm">{error}</div>}

        <div className="space-y-4 flex-1">
          {/* Preset Selector */}
          <div className="bg-[#151926] p-3 rounded-lg border border-neutral-800">
            <div className="flex justify-between items-center mb-2">
              <label className="text-[10px] uppercase tracking-wider text-neutral-400 font-bold">Preset Atual</label>
              <div className="flex gap-1">
                {isCustomPreset && (
                  <button onClick={() => handleDeletePreset(selectedPresetId)} className="text-[10px] text-red-400 hover:underline">
                    Excluir
                  </button>
                )}
              </div>
            </div>
            <select 
              value={selectedPresetId} 
              onChange={(e) => setSelectedPresetId(e.target.value)}
              className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-neutral-500 outline-none mb-2 text-neutral-200"
            >
              <optgroup label="Padrões">
                {presets.filter(p => !p.isCustom).map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </optgroup>
              {presets.filter(p => p.isCustom).length > 0 && (
                <optgroup label="Personalizados">
                  {presets.filter(p => p.isCustom).map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
            <button 
              onClick={() => setShowSavePreset(true)}
              className="w-full text-[11px] bg-neutral-800/80 hover:bg-neutral-700 py-1.5 rounded text-neutral-300 font-medium"
            >
              + Salvar configuração como novo
            </button>
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Gênero / Era</label>
            <input 
              type="text" 
              placeholder="Ex: 80s synthwave, acoustic pop" 
              value={genre} onChange={e => setGenre(e.target.value)}
              className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-neutral-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Emoção / Humor</label>
            <input 
              type="text" 
              placeholder="Ex: melancholic, euphoric" 
              value={emotion} onChange={e => setEmotion(e.target.value)}
              className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-neutral-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Instrumentos Principais</label>
            <input 
              type="text" 
              placeholder="Ex: bright piano, heavy guitars" 
              value={instruments} onChange={e => setInstruments(e.target.value)}
              className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-neutral-600 outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] uppercase tracking-wider text-neutral-400 mb-1">Estilo Vocal</label>
            <input 
              type="text" 
              placeholder="Ex: breathy female, raspy male" 
              value={vocal} onChange={e => setVocal(e.target.value)}
              className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-neutral-600 outline-none"
            />
          </div>

          <div className="bg-blue-950/20 border border-blue-900/30 p-3 rounded-lg space-y-3 mt-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-blue-400 mb-1 font-bold">Tema da Música</label>
              <textarea 
                rows={2}
                placeholder="Ex: O Olhar de Jesus no Ostensório" 
                value={tema} onChange={e => setTema(e.target.value)}
                className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-blue-500/50 outline-none resize-none"
              />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-blue-400 mb-1 font-bold">Vulnerabilidade / Dor</label>
              <textarea 
                rows={2}
                placeholder="Ex: Baixa autoestima, sentimento de abandono" 
                value={vulnerabilidade} onChange={e => setVulnerabilidade(e.target.value)}
                className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-blue-500/50 outline-none resize-none"
              />
            </div>
            
            <label className="flex items-center gap-2 cursor-pointer mt-3 p-2 bg-blue-900/10 rounded border border-blue-900/20 hover:bg-blue-900/20 transition-colors">
              <input 
                type="checkbox" 
                checked={includeSpokenIntro} 
                onChange={e => setIncludeSpokenIntro(e.target.checked)}
                className="w-4 h-4 rounded bg-[#0b0f19] border-blue-800 text-blue-500 focus:ring-blue-600 focus:ring-offset-neutral-900"
              />
              <span className="text-xs text-blue-300 font-medium flex items-center gap-1.5">
                <Mic size={14} /> Incluir introdução falada (4 linhas)
              </span>
            </label>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-neutral-800 space-y-2">
          <button 
            onClick={handleGenerateSuno}
            disabled={isGeneratingSuno}
            className="w-full bg-blue-600 text-white font-bold py-3 rounded-lg hover:bg-blue-500 disabled:opacity-50 transition-colors shadow-lg shadow-blue-900/20"
          >
            {isGeneratingSuno ? 'Gerando Música...' : '1. Gerar Música (Suno)'}
          </button>
          
          <button onClick={handleClear} className="w-full text-xs text-neutral-500 hover:text-neutral-300 py-2 transition-colors">Limpar Campos</button>
        </div>
      </div>

      {/* CENTER: SUNO RESULTS */}
      <div className="flex-1 flex flex-col p-8 bg-[#0a0d14] overflow-y-auto custom-scrollbar relative">
        {!songTitle && !lyrics && !isGeneratingSuno && (
           <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
             <div className="text-center">
                <div className="text-6xl mb-4">🎵</div>
                <h2 className="text-xl font-bold">Pronto para Compor</h2>
             </div>
           </div>
        )}

        <div className="max-w-4xl w-full mx-auto pb-10">
          {renderSunoCard("Song Title:", songTitle, setSongTitle, 1)}
          {renderSunoCard("Configurações Avançadas Recomendadas no Suno:", configPrompt, setConfigPrompt, 4)}
          {renderSunoCard("Styles (120-200 caracteres, 4-7 descritores, Sanduíche, Negativos):", stylePrompt, setStylePrompt, 2)}
          {renderSunoCard("Lyrics:", lyrics, setLyrics, 25)}
        </div>
      </div>

      {/* RIGHT SIDEBAR: VEO3 PROMPTS */}
      <div className="w-80 border-l border-neutral-800 bg-[#0f111a] flex flex-col p-4 overflow-y-auto custom-scrollbar">
        <h2 className="text-sm font-bold uppercase tracking-wider text-neutral-400 mb-4">Geração de Videoclipes</h2>
        
        <div className="bg-[#151926] border border-neutral-800 p-4 rounded-lg mb-6">
          <p className="text-xs text-neutral-500 mb-3 leading-relaxed">
            O passo 2 analisa a letra gerada e atua como um diretor cinematográfico para criar prompts visuais compatíveis com a música.
          </p>
          <div className="flex items-center justify-between mb-4 bg-[#0b0f19] p-2 rounded border border-neutral-800">
            <label className="text-xs text-neutral-400 font-medium">Qtd. Prompts:</label>
            <input 
              type="number" 
              min="1" max="20"
              value={veoCount}
              onChange={e => setVeoCount(parseInt(e.target.value) || 5)}
              className="w-12 bg-transparent text-center text-sm outline-none text-white font-mono"
            />
          </div>
          <button 
            onClick={handleGenerateVeo}
            disabled={isGeneratingVeo || !lyrics}
            className="w-full bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 font-medium py-2 rounded hover:bg-emerald-600/30 disabled:opacity-50 transition-colors text-sm"
          >
            {isGeneratingVeo ? 'Criando Cena...' : '2. Gerar Prompts Veo3'}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto space-y-3 pr-2 custom-scrollbar">
          {veoPrompts.map((prompt, i) => (
            <div key={i} className="bg-[#0b0f19] border border-neutral-800 rounded-lg p-3 group relative shadow-lg">
              <span className="text-[10px] text-emerald-500 font-bold block mb-1">CENA {i+1}</span>
              <p className="text-xs text-neutral-300 leading-relaxed pr-6">{prompt}</p>
              <button 
                onClick={() => {navigator.clipboard.writeText(prompt);}}
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 bg-neutral-800 hover:bg-neutral-700 p-1 rounded transition-opacity"
                title="Copiar prompt"
              >
                <Copy size={14} className="text-neutral-400" />
              </button>
            </div>
          ))}
          {veoPrompts.length === 0 && !isGeneratingVeo && (
            <div className="text-xs text-neutral-600 text-center mt-10">Nenhum prompt de vídeo gerado ainda.</div>
          )}
        </div>
      </div>

      {/* SAVE PRESET MODAL */}
      {showSavePreset && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
          <div className="bg-[#151926] border border-neutral-800 rounded-lg w-full max-w-md shadow-2xl p-6">
            <h2 className="font-bold text-lg mb-4">Salvar Novo Preset</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1">Nome do Preset</label>
                <input 
                  type="text" 
                  value={newPresetName}
                  onChange={e => setNewPresetName(e.target.value)}
                  placeholder="Ex: Sertanejo Motivacional"
                  className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-blue-500/50 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs uppercase tracking-wider text-neutral-400 mb-1">Regras Customizadas para IA</label>
                <textarea 
                  rows={4}
                  value={newPresetRules}
                  onChange={e => setNewPresetRules(e.target.value)}
                  placeholder="Ex: A letra deve conter gírias caipiras. A jornada do personagem sempre começa no campo e termina na cidade."
                  className="w-full bg-[#0b0f19] border border-neutral-800 rounded p-2 text-sm focus:border-blue-500/50 outline-none resize-none"
                />
              </div>
            </div>

            <div className="flex gap-2 mt-6">
              <button onClick={handleSavePreset} className="flex-1 bg-blue-600 text-white font-medium py-2 rounded hover:bg-blue-500 transition-colors">Salvar Preset</button>
              <button onClick={() => setShowSavePreset(false)} className="flex-1 bg-neutral-800 text-neutral-300 font-medium py-2 rounded hover:bg-neutral-700 transition-colors">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL */}
      {showHistory && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-6 backdrop-blur-sm">
          <div className="bg-[#151926] border border-neutral-800 rounded-lg w-full max-w-4xl h-[80vh] flex flex-col shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex justify-between items-center bg-[#0f111a] rounded-t-lg">
              <h2 className="font-bold text-lg text-white">Histórico na Nuvem (Supabase)</h2>
              <button onClick={() => setShowHistory(false)} className="text-neutral-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3 custom-scrollbar bg-[#0a0d14]">
              {history.length === 0 ? (
                <div className="text-center text-neutral-500 py-10">Nenhum histórico encontrado.</div>
              ) : (
                history.map((item) => (
                  <div key={item.id} className="bg-[#0f111a] border border-neutral-800 p-4 rounded-lg flex gap-4 hover:border-neutral-700 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs bg-neutral-800 px-2 py-1 rounded text-neutral-300">{new Date(item.created_at).toLocaleString()}</span>
                        <span className="text-xs border border-neutral-700 text-blue-400 font-medium px-2 py-1 rounded">{item.preset_used}</span>
                      </div>
                      <p className="text-sm text-neutral-200 mb-1 truncate font-medium">"{item.idea_prompt}"</p>
                      <p className="text-xs text-neutral-500 font-mono truncate">{item.song_title || 'Sem título'} - {item.style_prompt}</p>
                    </div>
                    <div className="flex items-center">
                      <button 
                        onClick={() => loadHistoryItem(item)}
                        className="bg-neutral-800 text-white text-sm px-4 py-2 rounded hover:bg-neutral-700 font-medium border border-neutral-700"
                      >
                        Carregar
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
