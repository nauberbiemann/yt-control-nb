'use client';

import { useState } from 'react';
import { useActiveProject } from '@/lib/store/projectStore';
import { 
  History, 
  TrendingUp, 
  Target, 
  MousePointer2, 
  Watch, 
  Zap, 
  ShieldCheck, 
  ArrowUpRight,
  ChevronRight,
  Database,
  BarChart2,
  AlertTriangle
} from 'lucide-react';
import { 
  LineChart, Line, AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from 'recharts';

interface AnalyticsDashboardProps {
  activeProject?: any;
}

export default function AnalyticsDashboard({ activeProject: propProject }: AnalyticsDashboardProps) {
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;

  const [stats] = useState([
    { id: '1', date: '01/04', title: 'Domine Next.js', views: '12.4k', ctr: '8.4%', retention: '52%', model: 'GPT-5.1 Preview' },
    { id: '2', date: '28/03', title: 'Segredo Tailwind', views: '8.2k', ctr: '6.5%', retention: '45%', model: 'Gemini 3.1 Pro' },
  ]);

  // --- BI Engine Data Mock ---
  const [matchEvolution] = useState([
    { deploy: '1', score: 62 },
    { deploy: '2', score: 68 },
    { deploy: '3', score: 71 },
    { deploy: '4', score: 85 },
    { deploy: '5', score: 96 }
  ]);

  const [componentFreq] = useState([
    { name: 'S1 (Provocação)', count: 18, color: '#ff6b6b' }, // High saturation
    { name: 'S5 (Blueprint)', count: 5, color: '#9bb0a5' },
    { name: 'Hook S3', count: 2, color: '#9bb0a5' },
    { name: 'CTA Lead', count: 12, color: '#4dabf7' },
    { name: 'CTA Like', count: 3, color: '#9bb0a5' }
  ]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      return (
        <div className="bg-midnight/90 border border-white/10 p-3 rounded-xl shadow-2xl backdrop-blur-md">
          <p className="text-[10px] uppercase font-black text-white/50 mb-1">{`Deploy #${label}`}</p>
          <p className="text-sage font-mono text-sm">{`Match Score: ${payload[0].value}%`}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="flex flex-col gap-10 animate-in pb-12">
      
      {/* Top Cards: Competitive Intelligence */}
      <section className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: 'Views Totais', val: '20.6k', change: '+12%', icon: TrendingUp, color: 'text-sage' },
          { label: 'CTR Médio', val: '7.45%', change: '+5%', icon: MousePointer2, color: 'text-blue-400' },
          { label: 'Retenção', val: '48.5%', change: '-2%', icon: Watch, color: 'text-orange-400' },
          { label: 'Instâncias Ativas', val: '04', change: 'Estável', icon: Target, color: 'text-indigo-400' }
        ].map(card => (
          <div key={card.label} className="glass-card p-6 flex flex-col gap-2 group hover:translate-y-[-4px] transition-all">
            <div className="flex justify-between items-center">
              <card.icon className={card.color} size={18} />
              <span className={`text-[10px] font-black ${card.change.startsWith('+') ? 'text-sage' : 'text-red-400 opacity-60'}`}>
                {card.change}
              </span>
            </div>
            <p className="text-[10px] uppercase font-black tracking-widest text-white/20">{card.label}</p>
            <h4 className="text-2xl font-black text-white">{card.val}</h4>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Global Memory Timeline */}
        <section className="lg:col-span-2 glass-card overflow-hidden">
          <div className="p-6 border-b border-white/5 flex justify-between items-center bg-white/[0.01]">
            <h3 className="font-bold flex items-center gap-2 text-sm">
              <Database className="text-sage" size={18} /> Histórico de Memory Sync
            </h3>
            <span className="text-[10px] uppercase font-black tracking-widest text-white/20 italic">Prevenção de Repetição</span>
          </div>

          <div className="p-8 flex flex-col gap-8">
            {[
              { time: 'Hoje, 14:30', project: 'Master Chef Pro', action: 'Ganchos S1 & S3 Gerados', details: 'Metáfora da Maillard salva no histórico global.' },
              { time: 'Ontem, 18:00', project: 'Dev Zen', action: 'Roteiro Finalizado (GPT-5.1)', details: 'Foco em Persona C-Level 40+.' }
            ].map((log, i) => (
              <div key={i} className="flex gap-6 relative">
                {i < 1 && <div className="absolute left-2.5 top-8 w-px h-12 bg-white/5" />}
                <div className="w-5 h-5 rounded-full bg-sage/20 border border-sage/40 flex items-center justify-center shrink-0 mt-1">
                  <div className="w-2 h-2 rounded-full bg-sage shadow-lg shadow-sage/50" />
                </div>
                <div className="flex flex-col gap-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">{log.time}</span>
                    <span className="text-[9px] font-black text-sage bg-sage/5 px-2 py-0.5 rounded border border-sage/20">{log.project}</span>
                  </div>
                  <h4 className="text-sm font-bold text-white/80">{log.action}</h4>
                  <p className="text-xs text-white/30 italic">{log.details}</p>
                </div>
              </div>
            ))}
          </div>

          <button className="w-full py-4 bg-white/5 border-t border-white/5 text-[10px] font-black uppercase tracking-widest text-white/20 hover:text-white transition-all">
            Ver Timeline Completa <ChevronRight size={12} className="inline ml-1" />
          </button>
        </section>

        {/* Model Performance Comparison */}
        <section className="glass-card p-8 flex flex-col gap-6 bg-gradient-to-br from-blue-500/[0.02] to-transparent">
          <h3 className="font-bold text-white flex items-center gap-3 text-sm">
            <Zap className="text-sage" size={18} /> IA Model Benchmark
          </h3>
          
          <div className="flex flex-col gap-6">
            {[
              { name: 'GPT-5.1 Preview', ctr: '8.4%', views: '24.1k', score: 95 },
              { name: 'Gemini 3.1 Pro', ctr: '6.2%', views: '18.5k', score: 88 },
              { name: 'GPT-4o (Stable)', ctr: '5.8%', views: '15.2k', score: 82 }
            ].map(m => (
              <div key={m.name} className="flex flex-col gap-2">
                <div className="flex justify-between items-end">
                  <span className="text-xs font-bold text-white/80">{m.name}</span>
                  <span className="text-[11px] font-mono text-sage">{m.score}% Performance</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-sage h-full transition-all duration-1000" style={{ width: `${m.score}%` }} />
                </div>
                <div className="flex gap-4 text-[10px] text-white/20 uppercase tracking-tighter">
                  <span>Avg CTR: {m.ctr}</span>
                  <span>Avg Views: {m.views}</span>
                </div>
              </div>
            ))}
          </div>

          <div className="mt-auto p-4 rounded-xl bg-blue-400/5 border border-blue-400/10 flex gap-4 items-center">
            <ShieldCheck className="text-blue-400 shrink-0" size={24} />
            <p className="text-[10px] text-white/40 leading-relaxed font-medium">
              O modelo <span className="text-white">GPT-5.1 Preview</span> está performando +15% melhor em CTR para nichos técnicos.
            </p>
          </div>
        </section>

      </div>

      {/* Manual Entry Table */}
      <section className="glass-card">
        <div className="p-6 border-b border-white/5 flex justify-between items-center">
          <h4 className="font-bold text-sm uppercase tracking-widest text-white/40">Logs de Performance Mensal</h4>
          <button className="btn-primary py-2 px-4 text-[10px] font-black tracking-widest">NOVA ENTRADA <ArrowUpRight size={12} className="inline ml-1" /></button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="text-[9px] uppercase tracking-[0.25em] text-white/20 border-b border-white/5 bg-white/[0.01]">
              <th className="px-8 py-4">Data</th>
              <th className="px-8 py-4">Vídeo</th>
              <th className="px-8 py-4">Views</th>
              <th className="px-8 py-4">CTR</th>
              <th className="px-8 py-4">Retenção</th>
              <th className="px-8 py-4">Modelo IA</th>
            </tr>
          </thead>
          <tbody>
            {stats.map(s => (
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
                <td className="px-8 py-4 text-xs text-white/40">{s.date}</td>
                <td className="px-8 py-4 font-bold text-sm">{s.title}</td>
                <td className="px-8 py-4 font-mono text-xs text-white/80">{s.views}</td>
                <td className="px-8 py-4 font-mono text-xs text-sage">{s.ctr}</td>
                <td className="px-8 py-4 font-mono text-xs text-orange-400">{s.retention}</td>
                <td className="px-8 py-4">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/5 px-2 py-1 rounded">
                    {s.model}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

    </div>
  );
}
