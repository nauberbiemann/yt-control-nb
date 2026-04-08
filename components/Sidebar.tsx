import { 
  BarChart3, 
  FolderOpen, 
  CalendarDays, 
  LineChart, 
  Database, 
  PenTool, 
  CheckSquare, 
  History,
  BookOpen
} from 'lucide-react';

interface SidebarProps {
  currentView: string;
  onViewChange: (view: string) => void;
  activeProject?: any;
  onResetProject: () => void;
}

export default function Sidebar({ currentView, onViewChange, activeProject, onResetProject }: SidebarProps) {
  const menuItems = [
    { id: 'home', label: 'Dashboard', icon: BarChart3 },
    { id: 'projects', label: 'Projetos', icon: FolderOpen },
    { id: 'content-hub', label: 'Banco de Temas', icon: Database, strategic: true },
    { id: 'library', label: 'Biblioteca Narrativa', icon: BookOpen, strategic: true },
    { id: 'scripts', label: 'Escrita Criativa', icon: PenTool, strategic: true },
    { id: 'production', label: 'Produção & SOP', icon: CheckSquare, strategic: true },
    { id: 'calendar', label: 'Calendário', icon: CalendarDays },
    { id: 'analytics', label: 'Memória Analytics', icon: History, strategic: true },
  ];

  return (
    <aside 
      className="sidebar transition-all duration-500"
      style={{ 
        borderRight: activeProject ? `1px solid ${activeProject.primary_color}22` : '1px solid var(--card-border)',
        boxShadow: activeProject ? `inset -20px 0 60px ${activeProject.primary_color}08` : 'none'
      }}
    >
      <div className="px-4 mb-10 mt-2">
        <h1 className="text-xl font-black tracking-tighter text-white">
          WRITER STUDIO <span className="text-sage italic font-light opacity-80">CLOUD</span>
        </h1>
        <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-white/20 mt-1">Strategic Engine V2</p>
      </div>

      <nav className="flex flex-col gap-1 px-2 text-white">
        {menuItems.map((item) => (
          <button
            key={item.id}
            onClick={() => onViewChange(item.id)}
            className={`
              flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 group border
              ${currentView === item.id 
                ? 'text-[var(--accent-color)] border-[var(--accent-color-glow)] bg-[var(--accent-color-glow)] shadow-lg shadow-[var(--accent-color-glow)]' 
                : 'text-white/40 hover:text-white hover:bg-white/5 border-transparent'}
              ${item.strategic && !activeProject ? 'opacity-20 cursor-not-allowed grayscale' : ''}
            `}
            disabled={item.strategic && !activeProject}
          >
            <item.icon size={18} className={currentView === item.id ? 'text-[var(--accent-color)]' : 'opacity-40 group-hover:opacity-100 transition-opacity'} />
            <span className="text-sm font-medium tracking-tight">
              {item.label}
              {item.strategic && !activeProject && <span className="ml-2 text-[8px] opacity-50">🔒</span>}
            </span>
          </button>
        ))}
      </nav>

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
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center text-xl shadow-inner bg-[var(--accent-color-glow)] text-[var(--accent-color)]"
              >
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
