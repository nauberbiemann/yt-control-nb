'use client';

import { useState } from 'react';
import { 
  Tv, 
  Plus, 
  Trash2, 
  FileText, 
  Image as ImageIcon, 
  ExternalLink, 
  Sparkles, 
  Copy, 
  Check, 
  FileCode, 
  Wand2, 
  ShieldCheck, 
  Zap,
  BookOpen,
  Info,
  Sliders
} from 'lucide-react';
import { 
  ReferenceChannel, 
  ViralScriptRef, 
  ThumbnailRef, 
  ChannelDnaConfig, 
  parseChannelMarkdown 
} from '@/lib/types/referenceChannels';

interface ReferenceChannelsManagerProps {
  channels?: ReferenceChannel[];
  channelDna?: ChannelDnaConfig;
  onChange: (channels: ReferenceChannel[]) => void;
  onDnaChange?: (dna: ChannelDnaConfig, parsedData?: any) => void;
}

export default function ReferenceChannelsManager({
  channels = [],
  channelDna = {},
  onChange,
  onDnaChange,
}: ReferenceChannelsManagerProps) {
  const [mainTab, setMainTab] = useState<'my_dna' | 'benchmark_channels'>('my_dna');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(channels[0]?.id || null);
  const [expandedSection, setExpandedSection] = useState<'scripts' | 'thumbs' | null>('scripts');

  // DNA Form State
  const [dnaMarkdown, setDnaMarkdown] = useState(channelDna.raw_markdown || '');
  const [styleDna, setStyleDna] = useState(channelDna.style_dna || '');
  const [characterDna, setCharacterDna] = useState(channelDna.character_dna || '');
  const [extrasDna, setExtrasDna] = useState(channelDna.extras_dna || '');
  const [negativeDna, setNegativeDna] = useState(channelDna.negative_dna || '');
  const [thumbRules, setThumbRules] = useState(channelDna.thumb_rules || '');
  const [parseStatusMessage, setParseStatusMessage] = useState<string | null>(null);

  // Modal / Form state para novo canal de referência
  const [isAddingChannel, setIsAddingChannel] = useState(false);
  const [newChannelName, setNewChannelName] = useState('');
  const [newChannelUrl, setNewChannelUrl] = useState('');
  const [newChannelAngle, setNewChannelAngle] = useState('');
  const [newChannelArbiter, setNewChannelArbiter] = useState('');
  const [newChannelNotes, setNewChannelNotes] = useState('');

  // Form state para novo Roteiro Viral
  const [isAddingScript, setIsAddingScript] = useState(false);
  const [scriptTitle, setScriptTitle] = useState('');
  const [scriptUrl, setScriptUrl] = useState('');
  const [scriptText, setScriptText] = useState('');
  const [scriptHook, setScriptHook] = useState('');
  const [scriptTone, setScriptTone] = useState('');

  // Form state para nova Thumbnail
  const [isAddingThumb, setIsAddingThumb] = useState(false);
  const [thumbTitle, setThumbTitle] = useState('');
  const [thumbImageUrl, setThumbImageUrl] = useState('');
  const [thumbTextOverlay, setThumbTextOverlay] = useState('');
  const [thumbVisualElements, setThumbVisualElements] = useState('');
  const [thumbColorPalette, setThumbColorPalette] = useState('');
  const [thumbAiPrompt, setThumbAiPrompt] = useState('');

  const [copiedPromptId, setCopiedPromptId] = useState<string | null>(null);

  // Active channel selected
  const activeChannel = channels.find((c) => c.id === activeChannelId) || channels[0] || null;

  // Processador de Markdown para DNA
  const handleParseMarkdown = () => {
    if (!dnaMarkdown.trim()) return;

    const parsed = parseChannelMarkdown(dnaMarkdown);
    if (!parsed) return;

    const updatedDna: ChannelDnaConfig = {
      ...channelDna,
      raw_markdown: dnaMarkdown,
      style_dna: parsed.style_dna || styleDna,
      character_dna: parsed.character_dna || characterDna,
      extras_dna: parsed.extras_dna || extrasDna,
      negative_dna: parsed.negative_dna || negativeDna,
      thumb_rules: parsed.thumb_rules || thumbRules,
      metaphors: parsed.metaphors || channelDna.metaphors,
      narrative_patterns: parsed.narrative_patterns || channelDna.narrative_patterns,
    };

    if (parsed.style_dna) setStyleDna(parsed.style_dna);
    if (parsed.character_dna) setCharacterDna(parsed.character_dna);
    if (parsed.extras_dna) setExtrasDna(parsed.extras_dna);
    if (parsed.negative_dna) setNegativeDna(parsed.negative_dna);
    if (parsed.thumb_rules) setThumbRules(parsed.thumb_rules);

    if (onDnaChange) {
      onDnaChange(updatedDna, parsed);
    }

    setParseStatusMessage(
      `✅ DNA extraído com sucesso! (PUC: ${parsed.puc ? 'Sim' : 'Não'} | Prompts DNA: ${
        parsed.style_dna ? 'Sim' : 'Não'
      } | Metáforas: ${parsed.metaphors?.length || 0})`
    );
    setTimeout(() => setParseStatusMessage(null), 5000);
  };

  const handleSaveManualDna = () => {
    const updatedDna: ChannelDnaConfig = {
      ...channelDna,
      raw_markdown: dnaMarkdown,
      style_dna: styleDna,
      character_dna: characterDna,
      extras_dna: extrasDna,
      negative_dna: negativeDna,
      thumb_rules: thumbRules,
    };

    if (onDnaChange) {
      onDnaChange(updatedDna);
    }
    setParseStatusMessage('✅ Prompts DNA salvos com sucesso!');
    setTimeout(() => setParseStatusMessage(null), 4000);
  };

  const handleAddChannel = () => {
    if (!newChannelName.trim()) return;
    const newChan: ReferenceChannel = {
      id: 'chan_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      name: newChannelName.trim(),
      url: newChannelUrl.trim(),
      niche_angle: newChannelAngle.trim(),
      truth_arbiter: newChannelArbiter.trim(),
      notes: newChannelNotes.trim(),
      viral_scripts: [],
      thumbnail_refs: [],
      created_at: new Date().toISOString(),
    };

    const updated = [...channels, newChan];
    onChange(updated);
    setActiveChannelId(newChan.id);

    setNewChannelName('');
    setNewChannelUrl('');
    setNewChannelAngle('');
    setNewChannelArbiter('');
    setNewChannelNotes('');
    setIsAddingChannel(false);
  };

  const handleRemoveChannel = (id: string) => {
    const updated = channels.filter((c) => c.id !== id);
    onChange(updated);
    if (activeChannelId === id) {
      setActiveChannelId(updated[0]?.id || null);
    }
  };

  const handleAddScript = () => {
    if (!activeChannel || !scriptTitle.trim() || !scriptText.trim()) return;

    const words = scriptText.trim().split(/\s+/).filter(Boolean).length;
    const newScript: ViralScriptRef = {
      id: 'script_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: scriptTitle.trim(),
      url: scriptUrl.trim(),
      script_text: scriptText.trim(),
      word_count: words,
      dna_summary: {
        opening_hook: scriptHook.trim() || 'Gancho de impacto extraído do roteiro de referência',
        tone: scriptTone.trim() || 'Sênior / Autoritário',
        tension_peaks: 3,
      },
      created_at: new Date().toISOString(),
    };

    const updatedChannels = channels.map((c) => {
      if (c.id === activeChannel.id) {
        return {
          ...c,
          viral_scripts: [...(c.viral_scripts || []), newScript],
        };
      }
      return c;
    });

    onChange(updatedChannels);
    setScriptTitle('');
    setScriptUrl('');
    setScriptText('');
    setScriptHook('');
    setScriptTone('');
    setIsAddingScript(false);
  };

  const handleRemoveScript = (scriptId: string) => {
    if (!activeChannel) return;
    const updatedChannels = channels.map((c) => {
      if (c.id === activeChannel.id) {
        return {
          ...c,
          viral_scripts: (c.viral_scripts || []).filter((s) => s.id !== scriptId),
        };
      }
      return c;
    });
    onChange(updatedChannels);
  };

  const handleAddThumb = () => {
    if (!activeChannel || !thumbTitle.trim()) return;

    const newThumb: ThumbnailRef = {
      id: 'thumb_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
      title: thumbTitle.trim(),
      image_url: thumbImageUrl.trim(),
      text_overlay: thumbTextOverlay.trim(),
      visual_elements: thumbVisualElements.trim(),
      color_palette: thumbColorPalette.trim(),
      ai_prompt: thumbAiPrompt.trim(),
      created_at: new Date().toISOString(),
    };

    const updatedChannels = channels.map((c) => {
      if (c.id === activeChannel.id) {
        return {
          ...c,
          thumbnail_refs: [...(c.thumbnail_refs || []), newThumb],
        };
      }
      return c;
    });

    onChange(updatedChannels);
    setThumbTitle('');
    setThumbImageUrl('');
    setThumbTextOverlay('');
    setThumbVisualElements('');
    setThumbColorPalette('');
    setThumbAiPrompt('');
    setIsAddingThumb(false);
  };

  const handleRemoveThumb = (thumbId: string) => {
    if (!activeChannel) return;
    const updatedChannels = channels.map((c) => {
      if (c.id === activeChannel.id) {
        return {
          ...c,
          thumbnail_refs: (c.thumbnail_refs || []).filter((t) => t.id !== thumbId),
        };
      }
      return c;
    });
    onChange(updatedChannels);
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedPromptId(id);
    setTimeout(() => setCopiedPromptId(null), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Header com Navegação em 2 Sub-abas Principais */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-zinc-900/60 p-2.5 rounded-xl border border-zinc-800">
        <div className="flex items-center space-x-2">
          <button
            type="button"
            onClick={() => setMainTab('my_dna')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
              mainTab === 'my_dna'
                ? 'bg-blue-600 text-white shadow-lg shadow-blue-950/40 border border-blue-400/30'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            <FileCode className="w-4 h-4 text-blue-400" />
            <span>1. DNA & Manual do Meu Canal (.md)</span>
          </button>

          <button
            type="button"
            onClick={() => setMainTab('benchmark_channels')}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center space-x-2 ${
              mainTab === 'benchmark_channels'
                ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-950/40 border border-emerald-400/30'
                : 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800'
            }`}
          >
            <Tv className="w-4 h-4 text-emerald-400" />
            <span>2. Canais de Referência Concorrentes ({channels.length})</span>
          </button>
        </div>

        <div className="text-[11px] text-zinc-500 font-mono hidden sm:block">
          Central de Inteligência do Canal
        </div>
      </div>

      {/* BANNER 1: SUB-ABA 1 - DNA DO MEU CANAL */}
      {mainTab === 'my_dna' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-blue-950/30 border border-blue-800/40 rounded-xl p-4 flex items-start space-x-3 text-sm text-blue-200">
            <FileCode className="w-5 h-5 text-blue-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-blue-300">Manual de Identidade & Prompts DNA do Seu Canal</h4>
              <p className="text-blue-400/80 text-xs mt-1 leading-relaxed">
                Você pode importar o arquivo <strong>.md de especificação</strong> do seu canal ou preencher os Prompts de DNA Visual manualmente. 
                Estes prompts garantem que a IA renderize o mesmo personagem fotorrealista e atmosfera cinematográfica no Google Veo 3.1, Midjourney e FLUX.
              </p>
            </div>
          </div>

          {parseStatusMessage && (
            <div className="p-3 bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 text-xs rounded-xl font-medium animate-in fade-in duration-200">
              {parseStatusMessage}
            </div>
          )}

          {/* DUAL OPTION: OPÇÃO A (AUTO PARSE) vs OPÇÃO B (MANUAL FORM) */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* OPÇÃO A: IMPORTAÇÃO E PARSE DE MARKDOWN */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-5 space-y-4 flex flex-col justify-between">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-blue-400 uppercase tracking-wider flex items-center space-x-2">
                    <Wand2 className="w-4 h-4" />
                    <span>Opção A: Importar / Colar Manual .md</span>
                  </h4>
                  <span className="text-[10px] px-2 py-0.5 bg-blue-500/20 text-blue-300 rounded font-mono">
                    Auto-Parse
                  </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                  Cole o conteúdo do seu arquivo <code>MANUAL_CONFIG.md</code>. O sistema extrairá automaticamente a PUC, Pilares, Metáforas e Prompts DNA.
                </p>
                <textarea
                  rows={10}
                  placeholder="Cole aqui o conteúdo do seu arquivo .md de identidade do canal (ex: RADAR_EXPLICADO_WRITER_STUDIO_CONFIG.md)..."
                  value={dnaMarkdown}
                  onChange={(e) => setDnaMarkdown(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl p-3 text-xs text-zinc-200 font-mono focus:border-blue-500 focus:outline-none leading-relaxed"
                />
              </div>

              <button
                type="button"
                onClick={handleParseMarkdown}
                disabled={!dnaMarkdown.trim()}
                className="w-full py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center space-x-2 shadow-lg shadow-blue-950/50"
              >
                <Sparkles className="w-4 h-4" />
                <span>Processar & Preencher Dados Automático</span>
              </button>
            </div>

            {/* OPÇÃO B: EDICÃO MANUAL DOS PROMPTS DNA VISUAL */}
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h4 className="text-xs font-bold text-amber-400 uppercase tracking-wider flex items-center space-x-2">
                  <Sliders className="w-4 h-4" />
                  <span>Opção B: Preenchimento Manual dos Prompts DNA</span>
                </h4>
                <span className="text-[10px] px-2 py-0.5 bg-amber-500/20 text-amber-300 rounded font-mono">
                  Edição Fina
                </span>
              </div>

              <div className="space-y-3 text-xs">
                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    STYLE_DNA (Estilo e Iluminação do Canal)
                  </label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Visual style: Photorealistic HD aerospace cinematography, dramatic cockpit LED lighting, high-contrast..."
                    value={styleDna}
                    onChange={(e) => setStyleDna(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">
                    CHARACTER_DNA (Avatar / Narrador Recorrente)
                  </label>
                  <textarea
                    rows={3}
                    placeholder="Ex: [Radar Explicado Investigator] male aviation forensic investigator, 40 years old, neat hair, navy blue pilot shirt..."
                    value={characterDna}
                    onChange={(e) => setCharacterDna(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 font-mono focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-zinc-300 mb-1">EXTRAS_DNA (Cards / Gráficos)</label>
                    <input
                      type="text"
                      placeholder="Ex: Clean 2D graphic card with bold Portuguese text overlay..."
                      value={extrasDna}
                      onChange={(e) => setExtrasDna(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-zinc-300 mb-1">NEGATIVE_DNA (O que Excluir)</label>
                    <input
                      type="text"
                      placeholder="Ex: speech, talking, lip sync, open mouth, watermark..."
                      value={negativeDna}
                      onChange={(e) => setNegativeDna(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2 text-xs text-zinc-200 font-mono focus:border-amber-500 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-zinc-300 mb-1">Regras Visuais de Thumbnails</label>
                  <textarea
                    rows={2}
                    placeholder="Ex: Fonte Anton em ALL CAPS com outline preto 5px. Cores HEX: Vermelho #FF0000 para alerta, Amarelo #FFD700 para curiosidade."
                    value={thumbRules}
                    onChange={(e) => setThumbRules(e.target.value)}
                    className="w-full bg-zinc-900 border border-zinc-800 rounded-lg p-2.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  onClick={handleSaveManualDna}
                  className="w-full py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-950/40"
                >
                  Salvar Prompts DNAManualmente
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BANNER 2: SUB-ABA 2 - CANAIS DE REFERÊNCIA CONCORRENTES */}
      {mainTab === 'benchmark_channels' && (
        <div className="space-y-6 animate-in fade-in duration-150">
          <div className="bg-emerald-950/30 border border-emerald-800/40 rounded-xl p-4 flex items-start space-x-3 text-sm text-emerald-200">
            <Tv className="w-5 h-5 text-emerald-400 mt-0.5 shrink-0" />
            <div>
              <h4 className="font-semibold text-emerald-300">Canais de Referência & Benchmarks do Nicho</h4>
              <p className="text-emerald-400/80 text-xs mt-1 leading-relaxed">
                Cadastre os canais concorrentes do seu nicho, roteiros virais e thumbnails de sucesso. 
                Estes ativos alimentarão automaticamente o <strong>ScriptEngine</strong> (clonagem de retenção do <em>Roteirizador 2077</em>) 
                e o <strong>ProductionAssembler</strong> (geração de títulos e thumbnails A/B).
              </p>
            </div>
          </div>

          {/* Bar de Seleção de Canais e Botão Adicionar */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-800 pb-3">
            <div className="flex flex-wrap items-center gap-2 overflow-x-auto">
              {channels.length === 0 ? (
                <span className="text-xs text-zinc-500 italic">Nenhum canal de referência cadastrado ainda.</span>
              ) : (
                channels.map((chan) => {
                  const isActive = chan.id === activeChannelId;
                  const scriptCount = chan.viral_scripts?.length || 0;
                  const thumbCount = chan.thumbnail_refs?.length || 0;

                  return (
                    <button
                      key={chan.id}
                      type="button"
                      onClick={() => setActiveChannelId(chan.id)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all flex items-center space-x-2 border ${
                        isActive
                          ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/50 shadow-sm'
                          : 'bg-zinc-900/80 text-zinc-400 border-zinc-800 hover:border-zinc-700 hover:text-zinc-200'
                      }`}
                    >
                      <span>{chan.name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-zinc-800 text-zinc-400 font-mono">
                        {scriptCount} R | {thumbCount} T
                      </span>
                    </button>
                  );
                })
              )}
            </div>

            <button
              type="button"
              onClick={() => setIsAddingChannel(true)}
              className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-colors shadow-sm shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Novo Canal Concorrente</span>
            </button>
          </div>

          {/* Form de Criação de Canal */}
          {isAddingChannel && (
            <div className="bg-zinc-900/90 border border-emerald-800/60 rounded-xl p-4 space-y-4 animate-in fade-in duration-200">
              <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                <h4 className="text-xs font-bold text-emerald-400 uppercase tracking-wider flex items-center space-x-2">
                  <Tv className="w-4 h-4" />
                  <span>Cadastrar Novo Canal de Referência</span>
                </h4>
                <button
                  type="button"
                  onClick={() => setIsAddingChannel(false)}
                  className="text-xs text-zinc-500 hover:text-zinc-300"
                >
                  Cancelar
                </button>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Nome do Canal *</label>
                  <input
                    type="text"
                    placeholder="Ex: Origin Decoder"
                    value={newChannelName}
                    onChange={(e) => setNewChannelName(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">URL / Handle do YouTube</label>
                  <input
                    type="text"
                    placeholder="https://youtube.com/@originedecoder"
                    value={newChannelUrl}
                    onChange={(e) => setNewChannelUrl(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Lente / Posicionamento Único</label>
                  <input
                    type="text"
                    placeholder="Ex: Lente do DNA / Ciência Sagrada"
                    value={newChannelAngle}
                    onChange={(e) => setNewChannelAngle(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-medium text-zinc-400 mb-1">Árbitro da Verdade (Fonte Exclusiva)</label>
                  <input
                    type="text"
                    placeholder="Ex: Estudos Científicos e Genética de DNA"
                    value={newChannelArbiter}
                    onChange={(e) => setNewChannelArbiter(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-medium text-zinc-400 mb-1">Observações Estratégicas</label>
                <textarea
                  rows={2}
                  placeholder="Ex: Utiliza linguagem cética, ganchos nos primeiros 20 segundos e imagens escuras dramáticas."
                  value={newChannelNotes}
                  onChange={(e) => setNewChannelNotes(e.target.value)}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div className="flex justify-end space-x-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddingChannel(false)}
                  className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleAddChannel}
                  disabled={!newChannelName.trim()}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                >
                  Salvar Canal
                </button>
              </div>
            </div>
          )}

          {/* Canal Ativo Selecionado - Detalhes & Gerenciador de Roteiros / Thumbs */}
          {activeChannel ? (
            <div className="bg-zinc-950/80 border border-zinc-800/80 rounded-xl p-5 space-y-6">
              {/* Top Bar do Canal Ativo */}
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-zinc-800/80 pb-4">
                <div>
                  <div className="flex items-center space-x-2">
                    <h3 className="text-base font-bold text-zinc-100">{activeChannel.name}</h3>
                    {activeChannel.url && (
                      <a
                        href={activeChannel.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-emerald-400 hover:text-emerald-300"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-zinc-400">
                    {activeChannel.niche_angle && (
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-emerald-400">
                        🎯 {activeChannel.niche_angle}
                      </span>
                    )}
                    {activeChannel.truth_arbiter && (
                      <span className="px-2 py-0.5 rounded bg-zinc-900 border border-zinc-800 text-amber-400">
                        ⚖️ {activeChannel.truth_arbiter}
                      </span>
                    )}
                  </div>
                  {activeChannel.notes && (
                    <p className="text-xs text-zinc-400/80 mt-2 leading-relaxed italic">
                      "{activeChannel.notes}"
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveChannel(activeChannel.id)}
                  className="text-xs text-rose-400/70 hover:text-rose-400 flex items-center space-x-1 hover:bg-rose-950/30 px-2.5 py-1 rounded transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Remover Canal</span>
                </button>
              </div>

              {/* Abas Internas: Roteiros Virais vs Thumbnails */}
              <div className="flex items-center space-x-3 border-b border-zinc-800/60 pb-2">
                <button
                  type="button"
                  onClick={() => setExpandedSection('scripts')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
                    expandedSection === 'scripts'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <FileText className="w-4 h-4 text-emerald-400" />
                  <span>Roteiros Virais de Referência ({activeChannel.viral_scripts?.length || 0})</span>
                </button>

                <button
                  type="button"
                  onClick={() => setExpandedSection('thumbs')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-2 transition-all ${
                    expandedSection === 'thumbs'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                      : 'text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900'
                  }`}
                >
                  <ImageIcon className="w-4 h-4 text-amber-400" />
                  <span>Thumbnails de Referência ({activeChannel.thumbnail_refs?.length || 0})</span>
                </button>
              </div>

              {/* SEÇÃO 1: ROTEIROS VIRAIS DE REFERÊNCIA */}
              {expandedSection === 'scripts' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-400">
                      Cole abaixo os roteiros ou transcrições de vídeos que viralizaram neste canal. 
                      O <strong>ScriptEngine</strong> utilizará esses roteiros como referência para extrair a estrutura de retenção (estilo <em>Roteirizador 2077</em>).
                    </p>
                    {!isAddingScript && (
                      <button
                        type="button"
                        onClick={() => setIsAddingScript(true)}
                        className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar Roteiro Viral</span>
                      </button>
                    )}
                  </div>

                  {/* Form Novo Roteiro */}
                  {isAddingScript && (
                    <div className="bg-zinc-900/90 border border-emerald-800/60 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <h5 className="text-xs font-bold text-emerald-400 flex items-center space-x-2">
                          <BookOpen className="w-4 h-4" />
                          <span>Adicionar Roteiro / Transcrição de Referência</span>
                        </h5>
                        <button
                          type="button"
                          onClick={() => setIsAddingScript(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Título do Vídeo Viral *</label>
                          <input
                            type="text"
                            placeholder="Ex: What DNA Discovered About Ancient Egypt"
                            value={scriptTitle}
                            onChange={(e) => setScriptTitle(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">URL do Vídeo no YouTube (Opcional)</label>
                          <input
                            type="text"
                            placeholder="https://youtube.com/watch?v=..."
                            value={scriptUrl}
                            onChange={(e) => setScriptUrl(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">
                          Texto do Roteiro Completo / Transcrição *
                        </label>
                        <textarea
                          rows={6}
                          placeholder="Cole aqui o texto do roteiro viral de referência..."
                          value={scriptText}
                          onChange={(e) => setScriptText(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none leading-relaxed"
                        />
                        <div className="flex justify-end text-[10px] text-zinc-500 mt-1">
                          Palavras: {scriptText.trim().split(/\s+/).filter(Boolean).length}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Gancho da Abertura (Hook)</label>
                          <input
                            type="text"
                            placeholder="Ex: Primeiras frases que seguram a atenção..."
                            value={scriptHook}
                            onChange={(e) => setScriptHook(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Tom de Voz / Persona</label>
                          <input
                            type="text"
                            placeholder="Ex: Revelador, misterioso, cético"
                            value={scriptTone}
                            onChange={(e) => setScriptTone(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-emerald-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsAddingScript(false)}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAddScript}
                          disabled={!scriptTitle.trim() || !scriptText.trim()}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          Salvar Roteiro no Banco
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Lista de Roteiros Salvos */}
                  {(!activeChannel.viral_scripts || activeChannel.viral_scripts.length === 0) ? (
                    <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl">
                      <FileText className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400 font-medium">Nenhum roteiro viral de referência salvo para este canal.</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Cole transcrições de vídeos virais para calibrar o Roteirizador 2077.</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {activeChannel.viral_scripts.map((s, idx) => (
                        <div
                          key={s.id}
                          className="bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 space-y-2 transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className="text-xs font-bold text-emerald-400">#{idx + 1}</span>
                              <h6 className="text-xs font-bold text-zinc-200">{s.title}</h6>
                              {s.url && (
                                <a href={s.url} target="_blank" rel="noreferrer" className="text-zinc-500 hover:text-emerald-400">
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              )}
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className="text-[10px] px-2 py-0.5 rounded bg-emerald-950/60 text-emerald-300 font-mono border border-emerald-800/40">
                                {s.word_count || 0} palavras
                              </span>
                              <button
                                type="button"
                                onClick={() => handleRemoveScript(s.id)}
                                className="text-zinc-500 hover:text-rose-400 p-1"
                                title="Remover Roteiro"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>

                          <p className="text-xs text-zinc-400/90 font-mono bg-zinc-950 p-2.5 rounded-lg border border-zinc-800/60 line-clamp-3 leading-relaxed">
                            {s.script_text}
                          </p>

                          {s.dna_summary && (
                            <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px] text-zinc-400">
                              {s.dna_summary.opening_hook && (
                                <span className="text-emerald-400">
                                  <strong>Gancho:</strong> "{s.dna_summary.opening_hook}"
                                </span>
                              )}
                              {s.dna_summary.tone && (
                                <span className="text-amber-400">
                                  <strong>Tom:</strong> {s.dna_summary.tone}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* SEÇÃO 2: THUMBNAILS DE REFERÊNCIA */}
              {expandedSection === 'thumbs' && (
                <div className="space-y-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between">
                    <p className="text-xs text-zinc-400">
                      Cadastre thumbnails de sucesso deste canal de referência. 
                      O <strong>ProductionAssembler</strong> gerará sugestões de texto overlay e prompts visuais para Midjourney/FLUX baseados nestas referências.
                    </p>
                    {!isAddingThumb && (
                      <button
                        type="button"
                        onClick={() => setIsAddingThumb(true)}
                        className="px-3 py-1.5 bg-amber-600 hover:bg-amber-500 text-white rounded-lg text-xs font-semibold flex items-center space-x-1.5 shrink-0"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Cadastrar Thumbnail</span>
                      </button>
                    )}
                  </div>

                  {/* Form Nova Thumbnail */}
                  {isAddingThumb && (
                    <div className="bg-zinc-900/90 border border-amber-800/60 rounded-xl p-4 space-y-3">
                      <div className="flex items-center justify-between border-b border-zinc-800 pb-2">
                        <h5 className="text-xs font-bold text-amber-400 flex items-center space-x-2">
                          <ImageIcon className="w-4 h-4" />
                          <span>Adicionar Thumbnail de Referência</span>
                        </h5>
                        <button
                          type="button"
                          onClick={() => setIsAddingThumb(false)}
                          className="text-xs text-zinc-500 hover:text-zinc-300"
                        >
                          Cancelar
                        </button>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Título / Conceito da Thumbnail *</label>
                          <input
                            type="text"
                            placeholder="Ex: Rosto de Choque + DNA Dourado"
                            value={thumbTitle}
                            onChange={(e) => setThumbTitle(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Texto Curto Overlay (2 a 4 palavras)</label>
                          <input
                            type="text"
                            placeholder="Ex: ELES ESCONDERAM"
                            value={thumbTextOverlay}
                            onChange={(e) => setThumbTextOverlay(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">URL da Imagem de Preview (Opcional)</label>
                          <input
                            type="text"
                            placeholder="https://..."
                            value={thumbImageUrl}
                            onChange={(e) => setThumbImageUrl(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[11px] font-medium text-zinc-400 mb-1">Paleta de Cores & Contraste</label>
                          <input
                            type="text"
                            placeholder="Ex: Fundo escuro + Amarelo vibrante + Sombra preta"
                            value={thumbColorPalette}
                            onChange={(e) => setThumbColorPalette(e.target.value)}
                            className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">Elementos Visuais Recorrentes</label>
                        <input
                          type="text"
                          placeholder="Ex: Close no rosto com expressão exagerada + seta vermelha apontando para objeto"
                          value={thumbVisualElements}
                          onChange={(e) => setThumbVisualElements(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div>
                        <label className="block text-[11px] font-medium text-zinc-400 mb-1">Prompt de IA de Referência (Midjourney / FLUX)</label>
                        <textarea
                          rows={2}
                          placeholder="Ex: dramatic portrait of ancient scientist holding glowing DNA helix, cinematic lighting, 8k --ar 16:9"
                          value={thumbAiPrompt}
                          onChange={(e) => setThumbAiPrompt(e.target.value)}
                          className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-1.5 text-xs text-zinc-200 font-mono focus:border-amber-500 focus:outline-none"
                        />
                      </div>

                      <div className="flex justify-end space-x-2 pt-2">
                        <button
                          type="button"
                          onClick={() => setIsAddingThumb(false)}
                          className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-xs font-medium"
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          onClick={handleAddThumb}
                          disabled={!thumbTitle.trim()}
                          className="px-4 py-1.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors"
                        >
                          Salvar Thumbnail
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Grid de Thumbnails */}
                  {(!activeChannel.thumbnail_refs || activeChannel.thumbnail_refs.length === 0) ? (
                    <div className="text-center py-8 border border-dashed border-zinc-800 rounded-xl">
                      <ImageIcon className="w-8 h-8 text-zinc-600 mx-auto mb-2" />
                      <p className="text-xs text-zinc-400 font-medium">Nenhuma thumbnail de referência cadastrada.</p>
                      <p className="text-[11px] text-zinc-500 mt-1">Cadastre padrões visuais para orientar a criação no ProductionAssembler.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {activeChannel.thumbnail_refs.map((t) => (
                        <div
                          key={t.id}
                          className="bg-zinc-900/60 border border-zinc-800 hover:border-zinc-700 rounded-xl p-4 space-y-2 relative transition-all"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <h6 className="text-xs font-bold text-amber-300">{t.title}</h6>
                              {t.text_overlay && (
                                <span className="inline-block mt-1 px-2 py-0.5 text-[10px] font-black tracking-wider uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded">
                                  TEXTO: "{t.text_overlay}"
                                </span>
                              )}
                            </div>

                            <button
                              type="button"
                              onClick={() => handleRemoveThumb(t.id)}
                              className="text-zinc-500 hover:text-rose-400 p-1"
                              title="Remover Thumbnail"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>

                          {t.image_url && (
                            <div className="w-full h-32 rounded-lg overflow-hidden border border-zinc-800 bg-zinc-950">
                              <img src={t.image_url} alt={t.title} className="w-full h-full object-cover" />
                            </div>
                          )}

                          {t.visual_elements && (
                            <p className="text-xs text-zinc-400 leading-relaxed">
                              <strong>Elementos:</strong> {t.visual_elements}
                            </p>
                          )}

                          {t.color_palette && (
                            <p className="text-[11px] text-zinc-400">
                              <strong>Cores:</strong> {t.color_palette}
                            </p>
                          )}

                          {t.ai_prompt && (
                            <div className="bg-zinc-950 p-2 rounded-lg border border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-400 font-mono">
                              <span className="truncate mr-2">{t.ai_prompt}</span>
                              <button
                                type="button"
                                onClick={() => copyToClipboard(t.ai_prompt!, t.id)}
                                className="text-amber-400 hover:text-amber-300 shrink-0"
                                title="Copiar Prompt"
                              >
                                {copiedPromptId === t.id ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                              </button>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <div className="text-center py-12 border border-dashed border-zinc-800 rounded-xl bg-zinc-950/40">
              <Tv className="w-10 h-10 text-zinc-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-zinc-300">Nenhum canal concorrente selecionado.</p>
              <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                Clique no botão acima para adicionar canais concorrentes de referência do seu nicho.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
