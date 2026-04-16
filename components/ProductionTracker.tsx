'use client';

import { useState } from 'react';
import { useActiveProject } from '@/lib/store/projectStore';
import { 
  CheckSquare, 
  Image as ImageIcon, 
  ExternalLink, 
  Clock, 
  Mic, 
  Video, 
  Layers, 
  Music,
  Info,
  Zap,
  ArrowRight
} from 'lucide-react';

interface ProductionTask {
  id: string;
  block: string;
  voice: boolean;
  broll: boolean;
  overlays: boolean;
  music: string;
}

interface ProductionTrackerProps {
  activeProject?: any;
}

export default function ProductionTracker({ activeProject: propProject }: ProductionTrackerProps) {
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;

  const [activeVideo] = useState('Nenhum Tema Selecionado');
  const [productionTasks, setProductionTasks] = useState<ProductionTask[]>([]);

  const brandColor = activeProject?.primary_color || '#3b82f6';

  const thumbArchetypes = [
    { title: 'Rosto + Texto', desc: 'Foco em emoção e autoridade.' },
    { title: 'Objeto + Fundo', desc: 'Curiosidade sobre o elemento central.' },
    { title: 'Contraste Emocional', desc: 'Antes vs Depois ou Errado vs Certo.' }
  ];

  return (
    <div className="flex flex-col gap-8 animate-in pb-12">
      {/* Top Header - Asset Tracker */}
      <section className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-midnight/40 backdrop-blur-md">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-blue-500/10 border border-blue-500/20 flex items-center justify-center">
              <CheckSquare className="text-blue-400" size={16} />
            </div>
            <h3 className="font-black text-white italic text-sm uppercase tracking-widest text-shadow-sm">Asset Tracker: {activeProject?.project_name || 'Instância Ativa'}</h3>
          </div>
          <button className="text-[10px] uppercase font-black tracking-widest text-white/30 hover:text-blue-400 transition-colors bg-white/5 px-3 py-1.5 rounded-lg border border-white/5">
            Gerenciar Blocos SRT
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[9px] uppercase tracking-[0.25em] text-white/30 border-b border-white/5 bg-white/[0.01]">
                <th className="px-8 py-5 font-black">BLOCO</th>
                <th className="px-8 py-5 font-black text-center">VOZ</th>
                <th className="px-8 py-5 font-black text-center">B-ROLL</th>
                <th className="px-8 py-5 font-black text-center">OVERLAYS</th>
                <th className="px-8 py-5 font-black">TRILHA</th>
                <th className="px-8 py-5 text-right">STATUS</th>
              </tr>
            </thead>
            <tbody>
              {productionTasks.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-8 py-20 text-center text-white/20 italic text-sm">
                    Vincule um tema validado do Banco de Temas para iniciar o rastreamento de ativos.
                  </td>
                </tr>
              ) : (
                productionTasks.map(t => (
                  <tr key={t.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-all">
                    <td className="px-8 py-5 font-mono text-xs font-bold text-white/50">{t.block}</td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <div className={`w-3.5 h-3.5 rounded-md ${t.voice ? 'bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]' : 'bg-white/5 border border-white/10'}`} />
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <div className={`w-3.5 h-3.5 rounded-md ${t.broll ? 'bg-indigo-500 shadow-[0_0_12px_rgba(99,102,241,0.5)]' : 'bg-white/5 border border-white/10'}`} />
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <div className={`w-3.5 h-3.5 rounded-md ${t.overlays ? 'bg-emerald-500 shadow-[0_0_12px_rgba(16,185,129,0.5)]' : 'bg-white/5 border border-white/10'}`} />
                      </div>
                    </td>
                    <td className="px-8 py-5 text-[11px] text-white/40 italic font-medium">{t.music}</td>
                    <td className="px-8 py-5 text-right">
                      <button className="text-[9px] font-black text-blue-400 opacity-60 hover:opacity-100 transition-all uppercase tracking-widest bg-blue-500/10 px-3 py-1.5 rounded-lg border border-blue-500/20">CHECK ASSETS</button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      {/* Grid Bottom: Thumbnails & SOP */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Thumbnail Lab */}
        <section className="glass-card p-8 flex flex-col gap-6 bg-gradient-to-br from-blue-500/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="font-black text-white italic text-sm uppercase tracking-widest text-shadow-sm flex items-center gap-3">
              <ImageIcon className="text-blue-400" size={18} /> Thumbnail Lab
            </h3>
            <span className="text-[10px] uppercase font-black tracking-widest text-white/20">AI Prompt Gen</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {thumbArchetypes.map(a => (
              <div key={a.title} className="p-4 bg-midnight/40 border border-white/10 rounded-2xl flex items-center justify-between group hover:border-blue-500/30 transition-all cursor-pointer">
                <div>
                  <h4 className="text-sm font-bold group-hover:text-blue-400 transition-colors uppercase tracking-tight italic">{a.title}</h4>
                  <p className="text-[10px] text-white/30 uppercase tracking-widest font-black mt-0.5">{a.desc}</p>
                </div>
                <button className="p-2 h-8 w-8 rounded-lg bg-white/5 group-hover:bg-blue-500/20 flex items-center justify-center transition-all">
                  <ArrowRight size={14} className="text-white/30 group-hover:text-blue-400" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 rounded-xl bg-blue-500/5 border border-blue-500/10 text-[10px] text-white/40 leading-relaxed italic uppercase font-black tracking-widest">
            "Prompt Suggestion: Low-angle close-up of [PROJETO ACCENT BLUE] light reflecting on a minimalist workstation, cinematic lighting, 8k, bokeh background..."
          </div>
        </section>

        {/* Editing SOP Side Panel */}
        <section className="glass-card p-8 flex flex-col gap-6">
          <div className="flex items-center gap-3 text-orange-400">
            <Info size={20} />
            <h3 className="font-bold text-white uppercase tracking-tight text-sm">Diretrizes de Edição (SOP)</h3>
          </div>

          <div className="flex flex-col gap-4">
            {[
              { rule: 'Corte de Ritmo', desc: 'Realizar cortes ou zoom leve a cada 3 segundos.', color: 'bg-orange-400' },
              { rule: 'Foco Visual', desc: 'Aplicar texto em negrito nas palavras-chave faladas.', color: 'bg-sage' },
              { rule: 'Sound Design', desc: 'Usar "Swoosh" em todas as transições de tela.', color: 'bg-blue-400' },
              { rule: 'DNA Visual', desc: 'Manter overlays sempre na cor de destaque do projeto.', color: 'bg-indigo-400' }
            ].map(sop => (
              <div key={sop.rule} className="flex gap-4">
                <div className={`w-1 rounded-full ${sop.color} opacity-50`} />
                <div>
                  <h4 className="text-xs font-bold uppercase tracking-widest text-white/80">{sop.rule}</h4>
                  <p className="text-[10px] text-white/30 leading-relaxed">{sop.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="mt-auto flex items-center justify-center gap-2 py-3 bg-white/5 border border-white/5 rounded-xl text-[10px] font-black uppercase tracking-[0.2em] text-white/30 hover:text-white hover:bg-white/10 transition-all">
            <ExternalLink size={12} /> Abrir Guia Completo da Marca
          </button>
        </section>

      </div>
    </div>
  );
}
