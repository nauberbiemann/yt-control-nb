'use client';

import { useState } from 'react';
import { Tv, Settings, X, Sparkles } from 'lucide-react';
import ReferenceChannelsManager from './ReferenceChannelsManager';
import { ReferenceChannel, ChannelDnaConfig } from '@/lib/types/referenceChannels';

interface ProjectModalProps {
  onClose: () => void;
  onSave: (project: any) => void;
  initialData?: any;
}

export default function ProjectModal({ onClose, onSave, initialData }: ProjectModalProps) {
  const [activeTab, setActiveTab] = useState<'general' | 'references'>('general');
  const [name, setName] = useState(initialData?.name || initialData?.project_name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [persona, setPersona] = useState(initialData?.persona_prompt || initialData?.base_system_instruction || '');
  const [color, setColor] = useState(initialData?.primary_color || initialData?.accent_color || '#9bb0a5');
  const [referenceChannels, setReferenceChannels] = useState<ReferenceChannel[]>(
    initialData?.reference_channels || []
  );
  const [channelDna, setChannelDna] = useState<ChannelDnaConfig>(
    initialData?.channel_dna || {}
  );

  const handleDnaUpdate = (updatedDna: ChannelDnaConfig, parsedData?: any) => {
    setChannelDna(updatedDna);
    if (parsedData) {
      if (parsedData.name && !name) setName(parsedData.name);
      if (parsedData.puc && !description) setDescription(parsedData.puc);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...initialData,
      id: initialData?.id || Date.now().toString(),
      name,
      project_name: name,
      description,
      persona_prompt: persona,
      base_system_instruction: persona,
      primary_color: color,
      accent_color: color,
      reference_channels: referenceChannels,
      channel_dna: channelDna,
    });
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
      <div 
        className="bg-zinc-950 border rounded-2xl w-full max-w-5xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden"
        style={{ borderColor: `${color}55` }}
      >
        {/* Header com Tabs */}
        <div className="p-5 border-b border-zinc-800/80 flex items-center justify-between bg-zinc-900/50">
          <div>
            <h2 className="text-lg font-bold text-zinc-100 flex items-center space-x-2">
              <span>{initialData ? 'Configurações do Canal' : 'Novo Projeto de Canal'}</span>
            </h2>
            <p className="text-xs text-zinc-400 mt-0.5">Gerencie os parâmetros do projeto, manual de DNA (.md) e benchmarks</p>
          </div>

          <div className="flex items-center space-x-2">
            <div className="flex bg-zinc-900 border border-zinc-800 p-1 rounded-xl">
              <button
                type="button"
                onClick={() => setActiveTab('general')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  activeTab === 'general'
                    ? 'bg-zinc-800 text-zinc-100 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>Geral & Persona</span>
              </button>

              <button
                type="button"
                onClick={() => setActiveTab('references')}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold flex items-center space-x-1.5 transition-all ${
                  activeTab === 'references'
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 shadow-sm'
                    : 'text-zinc-400 hover:text-zinc-200'
                }`}
              >
                <Tv className="w-3.5 h-3.5 text-emerald-400" />
                <span>DNA & Canais de Referência</span>
              </button>
            </div>

            <button
              onClick={onClose}
              className="p-1.5 text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {activeTab === 'general' ? (
            <form id="project-form" onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Nome do Canal *</label>
                <input 
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ex: Radar Explicado, Dev Zen ou O Segredo Sagrado"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Descrição Curta / Nicho</label>
                <textarea 
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Foco do conteúdo e linha editorial..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2 text-sm text-zinc-100 focus:border-emerald-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">
                  Instruções da Persona & Diretrizes do Canal (System Prompt)
                </label>
                <textarea 
                  rows={5}
                  value={persona}
                  onChange={(e) => setPersona(e.target.value)}
                  placeholder="Descreva o tom de voz da IA (ex: Sênior, cético, investigativo, sem clichês)..."
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-3.5 py-2.5 text-xs text-zinc-200 font-mono focus:border-emerald-500 focus:outline-none leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-zinc-400 mb-1">Cor de Destaque</label>
                <div className="flex items-center space-x-3">
                  <input 
                    type="color"
                    value={color}
                    onChange={(e) => setColor(e.target.value)}
                    className="w-12 h-10 bg-transparent border border-zinc-800 rounded-lg cursor-pointer"
                  />
                  <span className="text-xs text-zinc-400 font-mono">{color}</span>
                </div>
              </div>
            </form>
          ) : (
            <ReferenceChannelsManager
              channels={referenceChannels}
              channelDna={channelDna}
              onChange={(updated) => setReferenceChannels(updated)}
              onDnaChange={handleDnaUpdate}
            />
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-zinc-800/80 bg-zinc-900/40 flex items-center justify-between">
          <div className="text-xs text-zinc-500 flex items-center space-x-3">
            <span>{referenceChannels.length} concorrente(s) cadastrado(s)</span>
            {channelDna?.style_dna && (
              <span className="px-2 py-0.5 bg-blue-950 text-blue-300 rounded font-mono text-[10px]">
                🧬 Prompts DNA Ativos
              </span>
            )}
          </div>

          <div className="flex items-center space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-zinc-900 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs font-semibold transition-colors border border-zinc-800"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-bold transition-colors shadow-lg shadow-emerald-950/40"
            >
              {initialData ? 'Salvar Alterações' : 'Criar Projeto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
