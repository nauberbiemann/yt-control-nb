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

  const brandColor = activeProject?.primary_color || '#9bb0a5';

  const thumbArchetypes = [
    { title: 'Rosto + Texto', desc: 'Foco em emoção e autoridade.' },
    { title: 'Objeto + Fundo', desc: 'Curiosidade sobre o elemento central.' },
    { title: 'Contraste Emocional', desc: 'Antes vs Depois ou Errado vs Certo.' }
  ];

  return (
    <div className="flex flex-col gap-8 animate-in pb-12">
      {/* Top Header - Asset Tracker */}
      <section className="glass-card overflow-hidden">
        <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
          <div className="flex items-center gap-3">
            <CheckSquare style={{ color: brandColor }} size={20} />
            <h3 className="font-bold uppercase tracking-tight text-sm">Asset Tracker: {activeProject?.project_name || 'Instância Ativa'}</h3>
          </div>
          <button className="text-[10px] uppercase font-black tracking-widest text-white/30 hover:text-white transition-colors">
            Gerenciar Blocos SRT
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="text-[10px] uppercase tracking-[0.2em] text-white/20 border-b border-white/5">
                <th className="px-8 py-4 font-black"><Clock size={12} /> BLOCO</th>
                <th className="px-8 py-4 font-black text-center"><Mic size={12} /> VOZ</th>
                <th className="px-8 py-4 font-black text-center"><Video size={12} /> B-ROLL</th>
                <th className="px-8 py-4 font-black text-center"><Layers size={12} /> OVERLAYS</th>
                <th className="px-8 py-4 font-black"><Music size={12} /> TRILHA</th>
                <th className="px-8 py-4 text-right">STATUS</th>
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
                        <div className={`w-3 h-3 rounded-full ${t.voice ? 'bg-sage shadow-lg shadow-sage/40' : 'bg-white/5 border border-white/10'}`} />
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <div className={`w-3 h-3 rounded-full ${t.broll ? 'bg-sage shadow-lg shadow-sage/40' : 'bg-white/5 border border-white/10'}`} />
                      </div>
                    </td>
                    <td className="px-8 py-5">
                      <div className="flex justify-center">
                        <div className={`w-3 h-3 rounded-full ${t.overlays ? 'bg-sage shadow-lg shadow-sage/40' : 'bg-white/5 border border-white/10'}`} />
                      </div>
                    </td>
                    <td className="px-8 py-5 text-xs text-white/40 italic">{t.music}</td>
                    <td className="px-8 py-5 text-right">
                      <button className="text-[10px] font-black text-sage opacity-50 hover:opacity-100 transition-opacity">CHECK ASSETS</button>
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
        <section className="glass-card p-8 flex flex-col gap-6 bg-gradient-to-br from-indigo-500/[0.03] to-transparent">
          <div className="flex items-center justify-between">
            <h3 className="font-bold flex items-center gap-3">
              <ImageIcon className="text-sage" /> Thumbnail Lab
            </h3>
            <span className="text-[10px] uppercase font-black tracking-widest text-white/20">AI Prompt Gen</span>
          </div>

          <div className="grid grid-cols-1 gap-3">
            {thumbArchetypes.map(a => (
              <div key={a.title} className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between group hover:border-sage/30 transition-all cursor-pointer">
                <div>
                  <h4 className="text-sm font-bold group-hover:text-sage transition-colors">{a.title}</h4>
                  <p className="text-[10px] text-white/30">{a.desc}</p>
                </div>
                <button className="p-2 h-8 w-8 rounded-lg bg-white/5 group-hover:bg-sage/20 flex items-center justify-center transition-all">
                  <ArrowRight size={14} className="text-white/30 group-hover:text-sage" />
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 p-4 rounded-xl bg-sage/5 border border-sage/10 text-xs text-white/60 leading-relaxed italic">
            "Prompt Suggestion: Low-angle close-up of [PROJETO ACCENT COLOR] light reflecting on a minimalist workstation, cinematic lighting, 8k, bokeh background..."
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
