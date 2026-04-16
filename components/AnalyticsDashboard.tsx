'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useActiveProject } from '@/lib/store/projectStore';
import { useCompositionLogs, useThemes } from '@/lib/hooks/useProjectData';
import {
  AlertTriangle,
  ArrowUpRight,
  BarChart2,
  ChevronRight,
  CheckCircle2,
  Database,
  FileSpreadsheet,
  Link2,
  MousePointer2,
  ShieldCheck,
  Target,
  TrendingUp,
  Upload,
  Watch,
  Zap,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  type AnalyticsCsvPreview,
  type AnalyticsEntry,
  mergeAnalyticsEntries,
  parseYouTubeStudioCsv,
  readAnalyticsEntries,
} from '@/lib/analytics';

interface AnalyticsDashboardProps {
  activeProject?: any;
}

const SHEET_LINK_STORAGE_PREFIX = 'analytics_sheet_link_';

function LegacyAnalyticsDashboard({ activeProject: propProject }: AnalyticsDashboardProps) {
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
          <p className="text-blue-400 font-mono text-sm">{`Match Score: ${payload[0].value}%`}</p>
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
          { label: 'Views Totais', val: '20.6k', change: '+12%', icon: TrendingUp, color: 'text-blue-400' },
          { label: 'CTR Médio', val: '7.45%', change: '+5%', icon: MousePointer2, color: 'text-brand' },
          { label: 'Retenção', val: '48.5%', change: '-2%', icon: Watch, color: 'text-amber-400' },
          { label: 'Instâncias Ativas', val: '04', change: 'Estável', icon: Target, color: 'text-indigo-400' }
        ].map(card => (
          <div key={card.label} className="glass-card p-6 flex flex-col gap-3 group hover:translate-y-[-4px] transition-all duration-500 border-white/5 hover:border-blue-500/20">
            <div className="flex justify-between items-center mb-1">
              <div className={`p-2 rounded-lg bg-white/5 ${card.color.replace('text', 'text-opacity-20 bg')}`}>
                <card.icon className={card.color} size={18} />
              </div>
              <span className={`text-[10px] font-black tracking-tighter ${card.change.startsWith('+') ? 'text-blue-400' : 'text-red-400/60'}`}>
                {card.change}
              </span>
            </div>
            <p className="text-[9px] uppercase font-black tracking-[0.2em] text-white/20">{card.label}</p>
            <h4 className="text-2xl font-black text-white tracking-tighter">{card.val}</h4>
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
              <div key={i} className="flex gap-6 relative group">
                {i < 1 && <div className="absolute left-2.5 top-8 w-px h-12 bg-white/5" />}
                <div className="w-5 h-5 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center shrink-0 mt-1 transition-all group-hover:border-blue-500/50">
                  <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_8px_rgba(59,130,246,0.5)]" />
                </div>
                <div className="flex flex-col gap-1.5 flex-1">
                  <div className="flex items-center gap-3">
                    <span className="text-[10px] font-mono text-white/20 uppercase tracking-tighter">{log.time}</span>
                    <span className="text-[9px] font-black text-blue-400 bg-blue-500/5 px-2 py-0.5 rounded-full border border-blue-500/10 uppercase tracking-widest">{log.project}</span>
                  </div>
                  <h4 className="text-sm font-black text-white/80 tracking-tight">{log.action}</h4>
                  <p className="text-[11px] text-white/30 italic leading-relaxed">{log.details}</p>
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
              <div key={m.name} className="flex flex-col gap-3 p-4 rounded-2xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all">
                <div className="flex justify-between items-center">
                  <span className="text-xs font-black text-white/80 uppercase tracking-widest">{m.name}</span>
                  <span className="text-[11px] font-mono text-blue-400 font-black">{m.score}%</span>
                </div>
                <div className="w-full bg-white/5 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-gradient-to-r from-blue-600 to-blue-400 h-full transition-all duration-1000 shadow-[0_0_10px_rgba(59,130,246,0.5)]" style={{ width: `${m.score}%` }} />
                </div>
                <div className="flex gap-4 text-[9px] text-white/20 uppercase tracking-[0.2em] font-black">
                  <span>Avg CTR: <span className="text-white/40">{m.ctr}</span></span>
                  <span>Avg Views: <span className="text-white/40">{m.views}</span></span>
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
              <tr key={s.id} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors group">
                <td className="px-8 py-5 text-[10px] font-black text-white/20 uppercase tracking-widest">{s.date}</td>
                <td className="px-8 py-5 font-bold text-white tracking-tight">{s.title}</td>
                <td className="px-8 py-5 font-mono text-xs text-white/60 tracking-tighter">{s.views}</td>
                <td className="px-8 py-5 font-black text-xs text-blue-400 tabular-nums">{s.ctr}</td>
                <td className="px-8 py-5 font-black text-xs text-amber-500/80 tabular-nums">{s.retention}</td>
                <td className="px-8 py-5">
                  <span className="text-[9px] font-black uppercase tracking-widest text-white/20 border border-white/10 bg-white/5 px-3 py-1.5 rounded-full group-hover:text-white/40 group-hover:border-white/20 transition-all">
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

const formatCompactNumber = (value: number) =>
  new Intl.NumberFormat('pt-BR', {
    notation: 'compact',
    maximumFractionDigits: value >= 1000 ? 1 : 0,
  }).format(value || 0);

const formatPercent = (value: number) => `${value.toFixed(1).replace('.', ',')}%`;

const formatDateTime = (value?: string) => {
  if (!value) return 'Sem data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const formatDateLabel = (value?: string) => {
  if (!value) return 'Sem data';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });
};

const formatDurationFromSeconds = (value?: number) => {
  if (!value) return '—';
  const minutes = Math.floor(value / 60);
  const seconds = value % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
};

const MetricCard = ({
  label,
  value,
  hint,
  icon: Icon,
  colorClass,
}: {
  label: string;
  value: string;
  hint: string;
  icon: any;
  colorClass: string;
}) => (
  <div className="glass-card p-6 flex flex-col gap-3 border-white/5 hover:border-blue-500/20 transition-all duration-500">
    <div className="flex items-center justify-between gap-3">
      <div className={`flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 ${colorClass}`}>
        <Icon size={18} />
      </div>
      <span className="text-right text-[10px] uppercase font-black tracking-[0.2em] text-white/20">{hint}</span>
    </div>
    <p className="text-[9px] uppercase font-black tracking-[0.25em] text-white/20">{label}</p>
    <p className="text-2xl font-black tracking-tight text-white">{value}</p>
  </div>
);

export default function AnalyticsDashboard({ activeProject: propProject }: AnalyticsDashboardProps) {
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;
  const { themes } = useThemes();
  const { logs } = useCompositionLogs();
  const projectId = activeProject?.id;

  const [entries, setEntries] = useState<AnalyticsEntry[]>([]);
  const [csvPreview, setCsvPreview] = useState<AnalyticsCsvPreview | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [sheetUrl, setSheetUrl] = useState('');
  const [importNotice, setImportNotice] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isFetchingSheet, setIsFetchingSheet] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!projectId) {
      setEntries([]);
      return;
    }

    setEntries(readAnalyticsEntries(projectId, themes as any[], logs as any[]));
  }, [projectId, themes, logs]);

  useEffect(() => {
    if (!projectId) {
      setSheetUrl('');
      return;
    }

    try {
      const stored = localStorage.getItem(`${SHEET_LINK_STORAGE_PREFIX}${projectId}`);
      setSheetUrl(stored || '');
    } catch {
      setSheetUrl('');
    }
  }, [projectId]);

  const csvCoverage = useMemo(() => {
    const linkedEntries = entries.filter((entry) => !!entry.theme_id);
    const distinctThemes = new Set(linkedEntries.map((entry) => entry.theme_id).filter(Boolean));

    return {
      linkedVideos: linkedEntries.length,
      linkedThemes: distinctThemes.size,
      importedAt: entries[0]?.imported_at,
    };
  }, [entries]);

  const topMetrics = useMemo(() => {
    const totalViews = entries.reduce((acc, entry) => acc + (entry.views || 0), 0);
    const ctrEntries = entries.filter((entry) => entry.ctr > 0);
    const retentionEntries = entries.filter((entry) => entry.retention_avg > 0);
    const avgCtr =
      ctrEntries.length > 0
        ? ctrEntries.reduce((acc, entry) => acc + entry.ctr, 0) / ctrEntries.length
        : 0;
    const avgRetention =
      retentionEntries.length > 0
        ? retentionEntries.reduce((acc, entry) => acc + entry.retention_avg, 0) / retentionEntries.length
        : 0;

    return {
      totalViews,
      avgCtr,
      avgRetention,
    };
  }, [entries]);

  const viewsSeries = useMemo(
    () =>
      [...entries]
        .filter((entry) => entry.published_at || entry.imported_at)
        .sort((a, b) => {
          const timeA = new Date(a.published_at || a.imported_at || 0).getTime();
          const timeB = new Date(b.published_at || b.imported_at || 0).getTime();
          return timeA - timeB;
        })
        .map((entry) => ({
          label: formatDateLabel(entry.published_at || entry.imported_at),
          views: entry.views,
        })),
    [entries]
  );

  const structureSeries = useMemo(() => {
    const grouped = new Map<string, { totalCtr: number; totalViews: number; count: number }>();

    entries.forEach((entry) => {
      const key = entry.title_structure || 'Sem estrutura';
      const current = grouped.get(key) || { totalCtr: 0, totalViews: 0, count: 0 };
      grouped.set(key, {
        totalCtr: current.totalCtr + (entry.ctr || 0),
        totalViews: current.totalViews + (entry.views || 0),
        count: current.count + 1,
      });
    });

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        ctr: value.count > 0 ? Number((value.totalCtr / value.count).toFixed(2)) : 0,
        views: value.totalViews,
      }))
      .sort((a, b) => b.ctr - a.ctr)
      .slice(0, 6);
  }, [entries]);

  const modelBenchmark = useMemo(() => {
    const grouped = new Map<string, { views: number; ctr: number; count: number }>();

    entries.forEach((entry) => {
      const key = entry.llm_model_id || 'Sem DNA registrado';
      const current = grouped.get(key) || { views: 0, ctr: 0, count: 0 };
      grouped.set(key, {
        views: current.views + (entry.views || 0),
        ctr: current.ctr + (entry.ctr || 0),
        count: current.count + 1,
      });
    });

    return Array.from(grouped.entries())
      .map(([name, value]) => ({
        name,
        avgCtr: value.count > 0 ? value.ctr / value.count : 0,
        avgViews: value.count > 0 ? value.views / value.count : 0,
        videos: value.count,
      }))
      .sort((a, b) => b.avgCtr - a.avgCtr)
      .slice(0, 5);
  }, [entries]);

  const timelineEvents = useMemo(() => {
    const logEvents = (logs as any[]).slice(0, 6).map((log) => ({
      id: `log-${log.id}`,
      timestamp: log.created_at,
      label: 'DNA registrado',
      title: log.theme_title || 'Execução sem título',
      detail: `${log.llm_model_id || 'Modelo não informado'} • ${log.executionMode || 'modo interno'}`,
      chip: 'Composição',
    }));

    const importEvents = entries.slice(0, 6).map((entry) => ({
      id: `analytics-${entry.id}`,
      timestamp: entry.imported_at,
      label: 'CSV importado',
      title: entry.video_title,
      detail: `${formatCompactNumber(entry.views)} views • CTR ${formatPercent(entry.ctr)} • retenção ${formatPercent(entry.retention_avg)}`,
      chip: entry.theme_title || 'Métrica',
    }));

    return [...logEvents, ...importEvents]
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 8);
  }, [entries, logs]);

  const handlePickCsv = () => {
    fileInputRef.current?.click();
  };

  const handleCsvSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !projectId) return;

    setIsParsing(true);
    setImportNotice('');
    try {
      const content = await file.text();
      const preview = parseYouTubeStudioCsv(content, {
        projectId,
        fileName: file.name,
        themes: themes as any[],
        logs: logs as any[],
      });

      setPendingFileName(file.name);
      setCsvPreview(preview);
      setImportNotice(
        preview.entries.length > 0
          ? `${preview.entries.length} vídeos reconhecidos no CSV.`
          : 'Nenhuma linha útil foi identificada no CSV.'
      );
    } catch {
      setImportNotice('Não foi possível ler o CSV selecionado.');
      setCsvPreview(null);
    } finally {
      setIsParsing(false);
      event.target.value = '';
    }
  };

  const handleImportFromGoogleSheets = async () => {
    if (!projectId || !sheetUrl.trim()) return;

    setIsFetchingSheet(true);
    setImportNotice('');
    try {
      const response = await fetch('/api/analytics/google-sheets', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ sheetUrl }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || 'Não foi possível ler a planilha do Google Sheets.');
      }

      const preview = parseYouTubeStudioCsv(payload.csvText, {
        projectId,
        fileName: payload?.sourceLabel || 'Google Sheets',
        themes: themes as any[],
        logs: logs as any[],
      });

      setPendingFileName(payload?.sourceLabel || 'Google Sheets');
      setCsvPreview(preview);
      setImportNotice(
        preview.entries.length > 0
          ? `${preview.entries.length} vídeos reconhecidos a partir do Google Sheets.`
          : 'Nenhuma linha útil foi identificada na aba compartilhada.'
      );
      localStorage.setItem(`${SHEET_LINK_STORAGE_PREFIX}${projectId}`, sheetUrl.trim());
    } catch (error) {
      setImportNotice(
        error instanceof Error
          ? error.message
          : 'Não foi possível ler a planilha do Google Sheets.'
      );
      setCsvPreview(null);
    } finally {
      setIsFetchingSheet(false);
    }
  };

  const handleConfirmImport = () => {
    if (!projectId || !csvPreview || csvPreview.entries.length === 0) return;

    setIsImporting(true);
    try {
      const merged = mergeAnalyticsEntries(projectId, csvPreview.entries, themes as any[], logs as any[]);
      setEntries(merged);
      setImportNotice(`${csvPreview.entries.length} vídeos importados de ${pendingFileName}.`);
      setCsvPreview(null);
      setPendingFileName('');
    } finally {
      setIsImporting(false);
    }
  };

  if (!activeProject) {
    return (
      <div className="glass-card p-8 text-sm text-white/40">
        Selecione um canal ativo para liberar o BI & Analytics.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-8 animate-in pb-12">
      <input
        ref={fileInputRef}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={handleCsvSelected}
      />

      <section className="glass-card flex flex-col gap-6 p-6 md:p-8">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="max-w-3xl">
            <p className="text-[10px] uppercase font-black tracking-[0.3em] text-blue-400/80">
              BI & Analytics conectado ao projeto
            </p>
            <h3 className="mt-3 text-2xl font-black tracking-tight text-white">
              Importe o CSV do YouTube Studio e ligue a performance real ao DNA editorial
            </h3>
            <p className="mt-3 text-sm leading-relaxed text-white/45">
              O painel cruza métricas do Studio com temas, estruturas, hooks e modelos já registrados no app.
              Assim você deixa de enxergar só views e passa a ver o que realmente funciona.
            </p>
          </div>

          <div className="flex w-full max-w-xl flex-col gap-3">
            <input
              type="url"
              value={sheetUrl}
              onChange={(event) => setSheetUrl(event.target.value)}
              placeholder="Cole aqui o link do Google Sheets da aba Dados da tabela"
              className="w-full rounded-2xl border border-white/10 bg-midnight px-4 py-3 text-sm text-white outline-none transition-all placeholder:text-white/20 focus:border-blue-500/30"
            />
            <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handlePickCsv}
              className="btn-secondary px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em]"
            >
              <Upload size={14} className="mr-2 inline" />
              Importar CSV do Studio
            </button>
            <button
              type="button"
              onClick={() => {
                if (!sheetUrl.trim()) {
                  setImportNotice('Cole primeiro o link compartilhado do Google Sheets para habilitar essa importação.');
                  return;
                }
                handleImportFromGoogleSheets();
              }}
              disabled={isFetchingSheet}
              className="btn-secondary px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] disabled:opacity-50"
            >
              <Link2 size={14} className="mr-2 inline" />
              Importar Google Sheets
            </button>
            {csvPreview && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={isImporting || csvPreview.entries.length === 0}
                className="btn-primary px-5 py-3 text-[11px] font-black uppercase tracking-[0.2em] disabled:opacity-50"
              >
                <ArrowUpRight size={14} className="mr-2 inline" />
                Confirmar importação
              </button>
            )}
            </div>
            <p className="text-[11px] leading-relaxed text-white/30">
              Use o link compartilhado da planilha. O app salva esse link neste projeto para reimportações futuras.
            </p>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <MetricCard
            label="Views reais"
            value={formatCompactNumber(topMetrics.totalViews)}
            hint={entries.length > 0 ? `${entries.length} vídeos` : 'Sem CSV'}
            icon={TrendingUp}
            colorClass="text-blue-400"
          />
          <MetricCard
            label="CTR média"
            value={formatPercent(topMetrics.avgCtr)}
            hint={csvCoverage.linkedThemes > 0 ? `${csvCoverage.linkedThemes} temas ligados` : 'Aguardando vínculo'}
            icon={MousePointer2}
            colorClass="text-cyan-400"
          />
          <MetricCard
            label="Retenção média"
            value={formatPercent(topMetrics.avgRetention)}
            hint="Com base no CSV"
            icon={Watch}
            colorClass="text-amber-400"
          />
          <MetricCard
            label="Instâncias ativas"
            value={String((themes as any[]).length).padStart(2, '0')}
            hint={`${(themes as any[]).filter((theme) => theme.status === 'published').length} publicados`}
            icon={Target}
            colorClass="text-indigo-400"
          />
        </div>

        <div className="grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
            <div className="flex items-center gap-3">
              <FileSpreadsheet size={18} className="text-blue-400" />
              <div>
                <p className="text-[10px] uppercase font-black tracking-[0.25em] text-white/20">
                  Pipeline de importação
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  {pendingFileName || csvCoverage.importedAt ? 'CSV carregado para este projeto' : 'Aguardando CSV do YouTube Studio'}
                </p>
              </div>
            </div>

            <div className="mt-5 grid gap-3 md:grid-cols-3">
              <div className="rounded-2xl border border-white/8 bg-midnight/50 p-4">
                <p className="text-[9px] uppercase font-black tracking-[0.25em] text-white/20">Arquivo</p>
                <p className="mt-2 text-sm font-semibold text-white">{pendingFileName || 'Nenhum CSV selecionado'}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-midnight/50 p-4">
                <p className="text-[9px] uppercase font-black tracking-[0.25em] text-white/20">Vídeos reconhecidos</p>
                <p className="mt-2 text-sm font-semibold text-white">{csvPreview?.entries.length ?? entries.length}</p>
              </div>
              <div className="rounded-2xl border border-white/8 bg-midnight/50 p-4">
                <p className="text-[9px] uppercase font-black tracking-[0.25em] text-white/20">Temas vinculados</p>
                <p className="mt-2 text-sm font-semibold text-white">
                  {csvPreview
                    ? new Set(csvPreview.entries.map((entry) => entry.theme_id).filter(Boolean)).size
                    : csvCoverage.linkedThemes}
                </p>
              </div>
            </div>

            <div className="mt-4 rounded-2xl border border-white/8 bg-midnight/60 p-4 text-sm text-white/45">
              {isParsing || isFetchingSheet
                ? 'Lendo o CSV e tentando vincular cada vídeo ao DNA editorial deste projeto...'
                : importNotice || 'Quando você importar o CSV, o app vai cruzar título, estrutura e logs já persistidos.'}
            </div>
            {csvPreview?.warnings && csvPreview.warnings.length > 0 && (
              <div className="mt-4 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4">
                <div className="flex items-center gap-2 text-amber-300">
                  <AlertTriangle size={16} />
                  <p className="text-[10px] uppercase font-black tracking-[0.25em]">Alertas da leitura</p>
                </div>
                <ul className="mt-3 space-y-2 text-sm text-white/55">
                  {csvPreview.warnings.slice(0, 4).map((warning) => (
                    <li key={warning}>{warning}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="rounded-3xl border border-white/8 bg-white/[0.02] p-5">
            <div className="flex items-center gap-3">
              <CheckCircle2 size={18} className="text-emerald-400" />
              <div>
                <p className="text-[10px] uppercase font-black tracking-[0.25em] text-white/20">
                  Cobertura editorial
                </p>
                <p className="mt-1 text-sm font-semibold text-white">
                  O BI já usa o que o app conhece sobre o canal
                </p>
              </div>
            </div>

            <div className="mt-5 space-y-4">
              {[
                { label: 'Temas do projeto', value: String((themes as any[]).length) },
                { label: 'Entradas com tema ligado', value: String(csvCoverage.linkedVideos) },
                { label: 'Logs de composição', value: String((logs as any[]).length) },
                { label: 'Última importação', value: csvCoverage.importedAt ? formatDateTime(csvCoverage.importedAt) : 'Ainda não houve' },
              ].map((item) => (
                <div key={item.label} className="flex items-center justify-between border-b border-white/5 pb-3 last:border-b-0 last:pb-0">
                  <span className="text-[10px] uppercase font-black tracking-[0.22em] text-white/20">{item.label}</span>
                  <span className="text-sm font-semibold text-white">{item.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-[1.35fr_0.95fr]">
        <section className="glass-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 bg-white/[0.01] p-6">
            <h3 className="flex items-center gap-2 text-sm font-bold text-white">
              <Database className="text-blue-400" size={18} /> Timeline operacional
            </h3>
            <span className="text-[10px] uppercase font-black tracking-[0.22em] text-white/20">
              composição + importação
            </span>
          </div>

          <div className="flex flex-col gap-8 p-8">
            {timelineEvents.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-midnight/40 p-8 text-sm text-white/35">
                Ainda não há eventos para este projeto. Quando você registrar DNA na Escrita Criativa ou importar o CSV do Studio,
                a timeline passa a contar a história da produção.
              </div>
            ) : (
              timelineEvents.map((event, index) => (
                <div key={event.id} className="relative flex gap-5">
                  {index < timelineEvents.length - 1 && (
                    <div className="absolute left-[10px] top-8 h-[calc(100%+12px)] w-px bg-white/6" />
                  )}
                  <div className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-blue-500/30 bg-blue-500/10">
                    <div className="h-2 w-2 rounded-full bg-blue-400 shadow-[0_0_10px_rgba(59,130,246,0.55)]" />
                  </div>
                  <div className="flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <span className="text-[10px] font-mono uppercase tracking-tight text-white/20">
                        {formatDateTime(event.timestamp)}
                      </span>
                      <span className="rounded-full border border-blue-500/15 bg-blue-500/5 px-2 py-1 text-[9px] uppercase font-black tracking-[0.2em] text-blue-300">
                        {event.chip}
                      </span>
                    </div>
                    <p className="mt-2 text-sm font-black tracking-tight text-white/85">{event.label}</p>
                    <p className="mt-1 text-sm font-semibold text-white/70">{event.title}</p>
                    <p className="mt-1 text-[11px] italic leading-relaxed text-white/35">{event.detail}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="glass-card bg-gradient-to-br from-blue-500/[0.02] to-transparent p-8">
          <h3 className="flex items-center gap-3 text-sm font-bold text-white">
            <Zap className="text-cyan-400" size={18} /> Benchmark por modelo de IA
          </h3>

          <div className="mt-6 flex flex-col gap-4">
            {modelBenchmark.length === 0 ? (
              <div className="rounded-3xl border border-dashed border-white/10 bg-midnight/40 p-6 text-sm text-white/35">
                O benchmark aparece quando o CSV encontra vídeos ligados a logs de composição.
              </div>
            ) : (
              modelBenchmark.map((model) => (
                <div key={model.name} className="rounded-2xl border border-white/5 bg-white/[0.02] p-4">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-xs font-black uppercase tracking-[0.15em] text-white/80">{model.name}</p>
                    <span className="text-[11px] font-mono font-black text-cyan-300">
                      {formatPercent(model.avgCtr)}
                    </span>
                  </div>
                  <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-cyan-600 to-blue-400"
                      style={{ width: `${Math.min(100, model.avgCtr * 8)}%` }}
                    />
                  </div>
                  <div className="mt-3 flex flex-wrap gap-4 text-[9px] uppercase tracking-[0.2em] text-white/25">
                    <span>Vídeos: <span className="text-white/45">{model.videos}</span></span>
                    <span>Views médias: <span className="text-white/45">{formatCompactNumber(model.avgViews)}</span></span>
                  </div>
                </div>
              ))
            )}
          </div>

          <div className="mt-6 rounded-2xl border border-blue-500/15 bg-blue-500/[0.04] p-4 text-[11px] leading-relaxed text-white/45">
            Esse bloco compara performance real do Studio com o modelo gravado no DNA do roteiro. Ele ganha valor conforme você
            registra mais deploys na Escrita Criativa e importa mais vídeos publicados.
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <section className="glass-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 p-6">
            <h4 className="flex items-center gap-2 text-sm font-bold text-white">
              <TrendingUp className="text-blue-400" size={18} /> Views por data de publicação
            </h4>
            <span className="text-[10px] uppercase font-black tracking-[0.22em] text-white/20">
              série temporal
            </span>
          </div>
          <div className="h-[300px] p-4">
            {viewsSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-white/35">
                O gráfico aparece depois da primeira importação de CSV.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={viewsSeries} margin={{ top: 16, right: 16, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="analyticsViews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.55} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="label" stroke="rgba(255,255,255,0.24)" tickLine={false} axisLine={false} />
                  <YAxis stroke="rgba(255,255,255,0.24)" tickLine={false} axisLine={false} width={60} />
                  <Tooltip
                    contentStyle={{
                      background: 'rgba(7, 12, 25, 0.95)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '16px',
                    }}
                  />
                  <Area type="monotone" dataKey="views" stroke="#60a5fa" fill="url(#analyticsViews)" strokeWidth={3} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>

        <section className="glass-card overflow-hidden">
          <div className="flex items-center justify-between border-b border-white/5 p-6">
            <h4 className="flex items-center gap-2 text-sm font-bold text-white">
              <BarChart2 className="text-fuchsia-400" size={18} /> Estruturas com melhor CTR
            </h4>
            <span className="text-[10px] uppercase font-black tracking-[0.22em] text-white/20">
              média por estrutura
            </span>
          </div>
          <div className="h-[300px] p-4">
            {structureSeries.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-white/35">
                O ranking aparece quando o CSV encontra vídeos ligados a estruturas.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={structureSeries} margin={{ top: 16, right: 16, left: 0, bottom: 16 }}>
                  <CartesianGrid stroke="rgba(255,255,255,0.05)" vertical={false} />
                  <XAxis dataKey="name" stroke="rgba(255,255,255,0.24)" tickLine={false} axisLine={false} hide />
                  <YAxis stroke="rgba(255,255,255,0.24)" tickLine={false} axisLine={false} width={48} />
                  <Tooltip
                    formatter={(value) => formatPercent(typeof value === 'number' ? value : Number(value || 0))}
                    contentStyle={{
                      background: 'rgba(7, 12, 25, 0.95)',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: '16px',
                    }}
                  />
                  <Bar dataKey="ctr" radius={[10, 10, 0, 0]} fill="#c084fc" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </section>
      </div>

      <section className="glass-card overflow-hidden">
        <div className="flex flex-col gap-3 border-b border-white/5 p-6 md:flex-row md:items-center md:justify-between">
          <div>
            <h4 className="text-sm font-bold uppercase tracking-[0.2em] text-white/45">Tabela de vídeos importados</h4>
            <p className="mt-2 text-sm text-white/35">
              Essa tabela cruza métricas reais do Studio com estrutura, modelo, tempo médio de exibição e vínculo com tema.
            </p>
          </div>
          <div className="rounded-2xl border border-white/8 bg-midnight/50 px-4 py-3 text-[10px] uppercase tracking-[0.2em] text-white/25">
            {entries.length > 0 ? `${entries.length} linhas persistidas neste projeto` : 'Nenhum vídeo importado ainda'}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[1100px] border-collapse text-left">
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.01] text-[9px] uppercase tracking-[0.25em] text-white/20">
                <th className="px-6 py-4">Publicação</th>
                <th className="px-6 py-4">Vídeo</th>
                <th className="px-6 py-4">Views</th>
                <th className="px-6 py-4">Impressões</th>
                <th className="px-6 py-4">CTR</th>
                <th className="px-6 py-4">Retenção</th>
                <th className="px-6 py-4">Duração média</th>
                <th className="px-6 py-4">Modelo IA</th>
                <th className="px-6 py-4">Estrutura</th>
              </tr>
            </thead>
            <tbody>
              {entries.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-6 py-10 text-center text-sm text-white/35">
                    Importe o CSV do YouTube Studio para preencher o BI com métricas reais.
                  </td>
                </tr>
              ) : (
                entries.map((entry) => (
                  <tr key={entry.id} className="border-b border-white/5 transition-colors hover:bg-white/[0.02]">
                    <td className="px-6 py-5 text-[10px] font-black uppercase tracking-[0.2em] text-white/25">
                      {formatDateTime(entry.published_at || entry.imported_at)}
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex max-w-[280px] flex-col gap-1">
                        <span className="font-bold tracking-tight text-white">{entry.video_title}</span>
                        <span className="text-[11px] text-white/35">{entry.theme_title || 'Sem vínculo editorial'}</span>
                        {entry.video_url && (
                          <span className="flex items-center gap-1 text-[11px] text-blue-300/80">
                            <Link2 size={12} /> URL mapeada
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-5 font-mono text-xs text-white/70">{formatCompactNumber(entry.views)}</td>
                    <td className="px-6 py-5 font-mono text-xs text-white/45">{formatCompactNumber(entry.impressions)}</td>
                    <td className="px-6 py-5 text-xs font-black text-cyan-300">{formatPercent(entry.ctr)}</td>
                    <td className="px-6 py-5 text-xs font-black text-amber-300">{formatPercent(entry.retention_avg)}</td>
                    <td className="px-6 py-5 text-xs font-semibold text-white/60">
                      {formatDurationFromSeconds(entry.avg_view_duration_seconds)}
                    </td>
                    <td className="px-6 py-5">
                      <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-[9px] uppercase tracking-[0.2em] text-white/30">
                        {entry.llm_model_id || 'Sem DNA'}
                      </span>
                    </td>
                    <td className="px-6 py-5 text-xs font-semibold text-white/60">{entry.title_structure || 'Sem estrutura'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
