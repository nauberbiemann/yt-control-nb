'use client';

import { useState, useEffect } from 'react';
import { 
  LayoutDashboard, 
  FolderOpen, 
  CalendarDays, 
  PenTool, 
  History,
  BookOpen,
  ShieldCheck,
  Lightbulb,
  ChevronDown,
  Check,
  RefreshCw,
  Zap,
  PanelLeftClose,
  PanelLeftOpen,
  Mic
} from 'lucide-react';
import { useProjectStore, useActiveProject, useProjects } from '@/lib/store/projectStore';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onResetProject: () => void;
  userRole?: string;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export default function Sidebar({ currentView, onViewChange, onResetProject, userRole, collapsed = false, onToggleCollapsed }: SidebarProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/version')
      .then((r) => r.json())
      .then((d) => setAppVersion(d.version))
      .catch(() => setAppVersion(null));
  }, []);
  
  const activeProject = useActiveProject();
  const projects = useProjects();
  const { setActiveProject, loadProjects } = useProjectStore();

  const menuItems = [
    { id: 'home',        label: 'Dashboard',           icon: LayoutDashboard },
    { id: 'projects',    label: 'Meus Canais',         icon: FolderOpen },
    { id: 'library',     label: 'Narrative Library',   icon: BookOpen,    strategic: true },
    { id: 'themes',      label: 'Banco de Temas',       icon: Lightbulb,   strategic: true },
    { id: 'scripts',     label: 'Escrita Criativa',     icon: PenTool,     strategic: true },
    { id: 'vozprime',    label: 'Voz Prime (TTS)',      icon: Mic,         strategic: false },
    { id: 'analytics',   label: 'BI & Analytics',       icon: History,     strategic: true },
  ];

  const adminItems = [
    { id: 'admin', label: 'Gestão Master', icon: ShieldCheck }
  ];

  const allItems = [...menuItems, ...(userRole === 'admin' ? adminItems : [])];

  const handleSelectProject = (id: string) => {
    setActiveProject(id);
    setSelectorOpen(false);
  };

  return (
    <aside className="sidebar flex flex-col">
      {/* Brand */}
      <div className="px-2 mb-8 mt-2 flex items-center gap-3">
        <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-500/20">
          <Zap size={18} className="text-white fill-white" />
        </div>
        <div className="sidebar-label min-w-0">
          <h1 className="text-lg font-black tracking-tighter text-white leading-none">
            CONTENT<span className="text-blue-500">OS</span>
          </h1>
          <p className="text-[9px] uppercase tracking-[0.2em] font-bold text-slate-500 mt-1">Writer Studio Cloud</p>
          {appVersion && (
            <div className="mt-1.5 flex items-center gap-1">
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/10 border border-blue-500/20 text-[9px] font-mono text-blue-400/80 tracking-tight">
                {appVersion}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onToggleCollapsed}
          className="ml-auto rounded-lg border border-slate-800 bg-slate-900/70 p-2 text-slate-500 transition-all hover:border-blue-500/30 hover:text-blue-300"
          title={collapsed ? 'Expandir menu' : 'Recolher menu'}
        >
          {collapsed ? <PanelLeftOpen size={15} /> : <PanelLeftClose size={15} />}
        </button>
      </div>

      {/* ── Project Selector ─────────────────────────────────────────────────── */}
      <div className="px-1 mb-8 relative">
        <label className="sidebar-label text-[10px] font-bold uppercase tracking-wider text-slate-500 px-1 mb-2 block">
          Canal em Foco
        </label>
        <button
          onClick={() => setSelectorOpen(!selectorOpen)}
          title={activeProject ? (activeProject.project_name || activeProject.name) : 'Selecionar Canal'}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-lg border transition-all duration-300 ${
            activeProject
              ? 'bg-slate-800/40 border-slate-700/50 text-white hover:bg-slate-800/60'
              : 'bg-slate-900 border-slate-800 text-slate-500 hover:text-slate-300'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeProject ? 'bg-blue-500 shadow-[0_0_8px_rgba(59, 130, 246, 0.5)]' : 'bg-slate-700'}`} />
            <span className="sidebar-label text-[12px] font-bold truncate">
              {activeProject ? (activeProject.project_name || activeProject.name) : 'Selecionar Canal'}
            </span>
          </div>
          <ChevronDown size={14} className={`sidebar-label flex-shrink-0 text-slate-500 transition-transform ${selectorOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown */}
        {selectorOpen && (
          <div className="absolute left-1 right-1 top-full mt-1 z-50 bg-[#0f172a] border border-slate-800 rounded-lg shadow-2xl overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
            <div className="flex items-center justify-between px-3 py-2 border-b border-slate-800 bg-slate-900/50">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Instâncias</span>
              <button 
                onClick={() => { loadProjects(); setSelectorOpen(false); }}
                className="text-slate-500 hover:text-blue-400 transition-colors"
              >
                <RefreshCw size={12} />
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {projects.length === 0 ? (
                <p className="text-[11px] text-slate-500 text-center py-6">
                  Nenhuma instância ativa
                </p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-slate-800/50 transition-all text-left ${
                      activeProject?.id === p.id ? 'bg-blue-600/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: p.accent_color || p.primary_color || '#3b82f6' }}
                      />
                      <span className={`text-[12px] truncate ${activeProject?.id === p.id ? 'text-blue-400 font-bold' : 'text-slate-300'}`}>
                        {p.project_name || p.name}
                      </span>
                    </div>
                    {activeProject?.id === p.id && (
                      <Check size={12} className="text-blue-400 flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-0.5 px-0 text-white">
        <label className="sidebar-label text-[10px] font-bold uppercase tracking-wider text-slate-500 px-2 mb-2 block">
          Menu Principal
        </label>
        {allItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
              nav-item w-full
              ${currentView === item.id ? 'nav-item-active' : ''}
              ${(item as any).strategic && !activeProject ? 'opacity-30 cursor-not-allowed' : ''}
            `}
            disabled={(item as any).strategic && !activeProject}
            title={item.label}
          >
            <item.icon size={18} />
            <span className="sidebar-label text-[13px] font-medium">
              {item.label}
              {(item as any).strategic && !activeProject && <span className="ml-2 text-[9px] opacity-60">🔒</span>}
            </span>
          </button>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <div className="mt-auto p-0 flex flex-col gap-3">
        {activeProject ? (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 relative overflow-hidden">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-lg bg-blue-600/10 border border-blue-600/20 flex items-center justify-center text-xl">
                {activeProject.visual_style === 'Cinematic' ? '🎬' : 
                 activeProject.visual_style === 'Cyberpunk' ? '🤖' : 
                 activeProject.visual_style === 'Minimalista' ? '⚪' : '🎨'}
              </div>
              <div className="sidebar-label flex flex-col min-w-0">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Modo Sênior</span>
                <span className="text-[12px] font-bold text-white truncate">{activeProject.project_name || activeProject.name}</span>
              </div>
            </div>
            <button 
              onClick={onResetProject}
              className="sidebar-label w-full py-2 bg-slate-800 hover:bg-slate-700 rounded-lg text-[11px] font-bold text-slate-400 hover:text-white transition-all uppercase tracking-wider"
            >
              Trocar Canal
            </button>
          </div>
        ) : (
          <div className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center justify-between mb-2">
              <p className="sidebar-label text-[10px] text-slate-500 uppercase tracking-wider font-bold">Cloud Sync</p>
              <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            </div>
            <div className="w-full bg-slate-800 h-1 rounded-full overflow-hidden">
              <div className="bg-blue-600 h-full w-[100%]" />
            </div>
            <span className="sidebar-label text-[10px] text-slate-500 mt-2 block">Criptografia Ativa</span>
          </div>
        )}
      </div>
    </aside>
  );
}
