'use client';

import { useState } from 'react';
import { 
  BarChart3, 
  FolderOpen, 
  CalendarDays, 
  Database, 
  PenTool, 
  CheckSquare, 
  History,
  BookOpen,
  ShieldCheck,
  Lightbulb,
  ChevronDown,
  Check,
  RefreshCw
} from 'lucide-react';
import { useProjectStore, useActiveProject, useProjects } from '@/lib/store/projectStore';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  onResetProject: () => void;
  userRole?: string;
}

export default function Sidebar({ currentView, onViewChange, onResetProject, userRole }: SidebarProps) {
  const [selectorOpen, setSelectorOpen] = useState(false);
  
  // ── Zustand: read directly from store ──────────────────────────────────────
  const activeProject = useActiveProject();
  const projects = useProjects();
  const { setActiveProject, loadProjects } = useProjectStore();

  const menuItems = [
    { id: 'home',        label: 'Dashboard',           icon: BarChart3 },
    { id: 'projects',    label: 'Projetos',             icon: FolderOpen },
    { id: 'library',     label: 'Biblioteca Narrativa', icon: BookOpen,    strategic: true },
    { id: 'themes',      label: 'Banco de Temas',       icon: Lightbulb,   strategic: true },
    { id: 'content-hub', label: 'Content Hub',          icon: Database,    strategic: true },
    { id: 'scripts',     label: 'Escrita Criativa',     icon: PenTool,     strategic: true },
    { id: 'production',  label: 'Produção & SOP',       icon: CheckSquare, strategic: true },
    { id: 'calendar',    label: 'Calendário',           icon: CalendarDays },
    { id: 'analytics',   label: 'Memória Analytics',    icon: History,     strategic: true },
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
    <aside 
      className="sidebar transition-all duration-500"
      style={{ 
        borderRight: activeProject ? `1px solid ${activeProject.primary_color || activeProject.accent_color}22` : '1px solid var(--card-border)',
        boxShadow: activeProject ? `inset -20px 0 60px ${activeProject.primary_color || activeProject.accent_color}08` : 'none'
      }}
    >
      {/* Brand */}
      <div className="px-4 mb-6 mt-2">
        <h1 className="text-xl font-black tracking-tighter text-white">
          WRITER STUDIO <span className="text-sage italic font-light opacity-80">CLOUD</span>
        </h1>
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/20 mt-1">Strategic Engine V3</p>
      </div>

      {/* ── Project Selector ─────────────────────────────────────────────────── */}
      <div className="px-3 mb-6 relative">
        <label className="text-[8px] font-black uppercase tracking-[3px] text-white/20 px-1 mb-1.5 block">
          Canal Ativo
        </label>
        <button
          onClick={() => setSelectorOpen(!selectorOpen)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-xl border transition-all duration-300 ${
            activeProject
              ? 'bg-[var(--accent-color-glow)] border-[var(--accent-color)]/30 text-white'
              : 'bg-white/5 border-white/10 text-white/40'
          }`}
        >
          <div className="flex items-center gap-2 min-w-0">
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${activeProject ? 'bg-[var(--accent-color)] animate-pulse' : 'bg-white/20'}`} />
            <span className="text-[11px] font-black uppercase tracking-wider truncate">
              {activeProject ? (activeProject.project_name || activeProject.name) : 'Selecionar Canal'}
            </span>
          </div>
          <ChevronDown size={12} className={`flex-shrink-0 transition-transform ${selectorOpen ? 'rotate-180' : ''}`} />
        </button>

        {/* Dropdown */}
        {selectorOpen && (
          <div className="absolute left-3 right-3 top-full mt-1 z-50 bg-midnight/95 backdrop-blur-2xl border border-white/10 rounded-xl shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between px-3 py-2 border-b border-white/5">
              <span className="text-[8px] font-black uppercase tracking-[3px] text-white/30">Canais</span>
              <button 
                onClick={() => { loadProjects(); setSelectorOpen(false); }}
                className="text-white/20 hover:text-sage transition-colors"
                title="Recarregar projetos"
              >
                <RefreshCw size={10} />
              </button>
            </div>
            <div className="max-h-56 overflow-y-auto py-1">
              {projects.length === 0 ? (
                <p className="text-[10px] text-white/20 text-center py-4 uppercase tracking-widest font-black">
                  Nenhum canal criado
                </p>
              ) : (
                projects.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => handleSelectProject(p.id)}
                    className={`w-full flex items-center justify-between gap-2 px-3 py-2.5 hover:bg-white/5 transition-all text-left ${
                      activeProject?.id === p.id ? 'bg-sage/10' : ''
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <div
                        className="w-2 h-2 rounded-full flex-shrink-0"
                        style={{ backgroundColor: p.accent_color || p.primary_color || '#9BB0A5' }}
                      />
                      <span className="text-[11px] font-black text-white truncate">
                        {p.project_name || p.name}
                      </span>
                    </div>
                    {activeProject?.id === p.id && (
                      <Check size={10} className="text-sage flex-shrink-0" />
                    )}
                  </button>
                ))
              )}
            </div>
            <div className="border-t border-white/5 px-3 py-2">
              <button
                onClick={() => { onViewChange('projects'); setSelectorOpen(false); }}
                className="w-full text-[9px] font-black uppercase tracking-[2px] text-white/20 hover:text-sage transition-colors py-1"
              >
                + Criar Novo Canal
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Navigation ────────────────────────────────────────────────────────── */}
      <nav className="flex flex-col gap-1 px-2 text-white">
        {allItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group border
              ${currentView === item.id 
                ? 'text-[var(--accent-color)] border-[var(--accent-color-glow)] bg-[var(--accent-color-glow)] shadow-lg shadow-[var(--accent-color-glow)]' 
                : 'text-white/40 hover:text-white hover:bg-white/5 border-transparent'}
              ${(item as any).strategic && !activeProject ? 'opacity-20 cursor-not-allowed grayscale' : ''}
            `}
            disabled={(item as any).strategic && !activeProject}
          >
            <item.icon size={18} className={currentView === item.id ? 'text-[var(--accent-color)]' : 'opacity-40 group-hover:opacity-100 transition-opacity'} />
            <span className="text-sm font-medium tracking-tight">
              {item.label}
              {(item as any).strategic && !activeProject && <span className="ml-2 text-[8px] opacity-50">🔒</span>}
            </span>
          </button>
        ))}
      </nav>

      {/* ── Footer ────────────────────────────────────────────────────────────── */}
      <div className="mt-auto p-4 flex flex-col gap-3">
        {activeProject ? (
          <div 
            className="glass-card p-4 rounded-xl border-white/10 animate-in slide-in-from-bottom-4 relative overflow-hidden"
            style={{ borderLeft: `3px solid var(--accent-color)` }}
          >
            <div className="absolute top-0 right-0 p-2">
              <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[var(--accent-color-glow)] border border-[var(--accent-color-glow)]">
                <div className="w-1.5 h-1.5 rounded-full bg-[var(--accent-color)] animate-pulse" />
                <span className="text-[7px] font-black uppercase tracking-widest text-[var(--accent-color)]">Scoping Ativo</span>
              </div>
            </div>

            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-inner bg-[var(--accent-color-glow)] text-[var(--accent-color)]">
                {activeProject.visual_style === 'Cinematic' ? '🎬' : 
                 activeProject.visual_style === 'Cyberpunk' ? '🤖' : 
                 activeProject.visual_style === 'Minimalista' ? '⚪' : '🎨'}
              </div>
              <div className="flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-white/20">Instância Ativa</span>
                <span className="text-sm font-bold text-white truncate max-w-[120px]">{activeProject.project_name || activeProject.name}</span>
              </div>
            </div>
            <button 
              onClick={onResetProject}
              className="w-full py-2 bg-white/5 hover:bg-red-500/10 border border-white/5 hover:border-red-500/20 rounded-lg text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-red-500 transition-all font-sans"
            >
              Trocar de Canal
            </button>
          </div>
        ) : (
          <div className="glass-card p-4 rounded-xl border-white/5 bg-white/[0.02]">
            <p className="text-[10px] text-white/30 uppercase tracking-widest font-bold mb-2">Memory Status</p>
            <div className="w-full bg-white/5 h-1 rounded-full overflow-hidden">
              <div className="bg-sage h-full w-[65%]" />
            </div>
            <span className="text-[10px] text-sage/80 mt-2 inline-block">Sincronizado Cloud</span>
          </div>
        )}
      </div>
    </aside>
  );
}
