'use client';

import { useState, useEffect } from 'react';
import Sidebar from '@/components/Sidebar';
import EngineSelector from '@/components/EngineSelector';
import ApiKeyManager from '@/components/ApiKeyManager';
import ProjectWizardModal from '@/components/ProjectWizardModal';
import DeleteProjectModal from '@/components/DeleteProjectModal';
import ContentHub from '@/components/ContentHub';
import ScriptEngine from '@/components/ScriptEngine';
import ProductionTracker from '@/components/ProductionTracker';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import NarrativeLibrary from '@/components/NarrativeLibrary';
import AuthOverlay from '@/components/auth/AuthOverlay';
import AwaitingApproval from '@/components/auth/AwaitingApproval';
import UserManagement from '@/components/admin/UserManagement';
import { supabase } from '@/lib/supabase';
import { AI_MODELS, DEFAULT_CONFIG, AIConfig } from '@/lib/ai-config';
import { 
  Trash2, 
  Settings, 
  ChevronRight, 
  Plus, 
  Zap, 
  Database, 
  PenTool, 
  CheckSquare, 
  History,
  FolderOpen,
  Sparkles,
  Cpu,
  Download,
  Upload,
  CloudSync,
  LogOut
} from 'lucide-react';

export default function Home() {
  const [currentView, setCurrentView] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [projects, setProjects] = useState<any[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [activeAIConfig, setActiveAIConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [pendingScript, setPendingScript] = useState<any>(null);

  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  useEffect(() => {
    // 1. Escutar Mudanças de Auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        await fetchProfile(session.user.id);
        fetchProjects();
      } else {
        setProfile(null);
        setProjects([]);
        setLoading(false);
      }
    });

    // 2. Carregar Configs de IA
    const savedAI = localStorage.getItem('ws_ai_config');
    if (savedAI) {
      try {
        setActiveAIConfig(JSON.parse(savedAI));
      } catch (e) {
        console.error("Erro ao carregar config IA", e);
      }
    }

    return () => subscription.unsubscribe();
  }, []);

  const handleUpdateAI = (config: AIConfig) => {
    setActiveAIConfig(config);
    localStorage.setItem('ws_ai_config', JSON.stringify(config));
  };

  const fetchProfile = async (userId: string) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) throw error;
      setProfile(data);
    } catch (err) {
      console.error('Erro ao buscar perfil:', err);
      // Opcional: Se der erro (ex: trigger ainda rodando), podemos tentar novamente ou deslogar.
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      console.log('--- Fetching Projects ---');

      // 🛡️ Safety Guard: Se o Supabase for null, use apenas o LocalStorage
      if (!supabase) {
        console.warn('Supabase not configured. Operating in Safe Mode (LocalStorage only).');
        const localData = localStorage.getItem('writer_studio_projects');
        if (localData) {
          const parsed = JSON.parse(localData);
          setProjects(parsed);
          if (parsed.length > 0 && !activeProjectId) {
            setActiveProjectId(parsed[0].id);
          }
        }
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      
      if (data && data.length > 0) {
        console.log('Projetos sincronizados da nuvem:', data);
        setProjects(data);
        localStorage.setItem('writer_studio_projects', JSON.stringify(data));
      } else {
        console.log('Nuvem vazia. Mantendo dados locais para sincronização.');
        const local = localStorage.getItem('writer_studio_projects');
        if (local) setProjects(JSON.parse(local));
      }
    } catch (err) {
      console.error('Erro ao buscar projetos:', err);
      // Fallback para LocalStorage se o Supabase falhar
      const local = localStorage.getItem('writer_studio_projects');
      if (local) setProjects(JSON.parse(local));
    }
  };


  const handleLogout = async () => {
    if (confirm('Deseja realmente encerrar a sessão?')) {
      await supabase.auth.signOut();
    }
  };

  const handleExport = () => {
    const projectsData = localStorage.getItem('writer_studio_projects');
    if (!projectsData) return alert('Nenhum dado local para exportar.');
    
    const exportBundle: any = {
      projects: JSON.parse(projectsData),
      libraries: {},
      themes: {},
      version: '2.0-universal'
    };

    // Capturar todas as bibliotecas narrativas e temas vinculados
    exportBundle.projects.forEach((p: any) => {
      const libData = localStorage.getItem(`ws_narrative_${p.id}`);
      if (libData) exportBundle.libraries[p.id] = JSON.parse(libData);
      
      const themeData = localStorage.getItem(`themes_${p.id}`);
      if (themeData) exportBundle.themes[p.id] = JSON.parse(themeData);
    });
    
    const blob = new Blob([JSON.stringify(exportBundle)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `content-os-full-backup-${new Date().toISOString().split('T')[0]}.json`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const bundle = JSON.parse(event.target?.result as string);
        let projectsToImport = [];
        let librariesToImport: any = {};
        
        // Suporte para formato antigo e novo universal
        if (Array.isArray(bundle)) {
          projectsToImport = bundle;
        } else if (bundle.version === '2.0-universal') {
          projectsToImport = bundle.projects;
          librariesToImport = bundle.libraries || {};
        } else {
          throw new Error('Formato de backup não reconhecido.');
        }

        const idMap: Record<string, string> = {};
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

        // 1. Remapear Projetos e gerar Mapa de IDs
        const sanitizedProjects = projectsToImport.map((p: any) => {
          const oldId = p.id.toString();
          if (!uuidRegex.test(oldId)) {
            const newId = crypto.randomUUID();
            idMap[oldId] = newId;
            return { ...p, id: newId };
          } else {
            idMap[oldId] = oldId;
            return { ...p };
          }
        });

        // 2. Persistir Projetos
        localStorage.setItem('writer_studio_projects', JSON.stringify(sanitizedProjects));
        setProjects(sanitizedProjects);

        // 3. Remapear e Persistir Bibliotecas Narrativas
        let migratedCount = 0;
        Object.keys(librariesToImport).forEach(oldProjId => {
          const newProjId = idMap[oldProjId];
          if (newProjId) {
            const components = librariesToImport[oldProjId].map((c: any) => ({
              ...c,
              project_id: newProjId, 
              id: uuidRegex.test(c.id) ? c.id : crypto.randomUUID()
            }));
            localStorage.setItem(`ws_narrative_${newProjId}`, JSON.stringify(components));
            migratedCount += components.length;
          }
        });

        // 4. Manter a Instância Ativa se ela foi remapeada
        if (activeProjectId && idMap[activeProjectId]) {
          setActiveProjectId(idMap[activeProjectId]);
        } else if (sanitizedProjects.length > 0) {
          setActiveProjectId(sanitizedProjects[0].id);
        }

        alert(`Backup Universal importado: ${sanitizedProjects.length} projetos e ${migratedCount} itens de biblioteca. Clique em Sincronizar Nuvem.`);
        
        // Autoridade Total: Não chamamos fetchProjects para evitar que a nuvem vazia apague o estado recém-importado.
        // O usuário sincronizará manualmente em seguida.
      } catch (err) {
        alert('Erro ao importar backup: ' + (err as Error).message);
      }
    };
    reader.readAsText(file);
  };

  const handleWipeData = () => {
    if (confirm('💣 ATENÇÃO: Isso apagará TODOS os projetos e bibliotecas locais. Use apenas para limpar o ambiente antes de uma nova importação definitiva. Deseja prosseguir?')) {
      localStorage.clear();
      setProjects([]);
      setActiveProjectId(null);
      alert('Localhost resetado com sucesso.');
      window.location.reload();
    }
  };

  const handleSyncToCloud = async () => {
    if (!supabase) return alert('Supabase não configurado.');
    
    setLoading(true);
    try {
      const updatedProjects = [...projects];
      let fullSyncCount = 0;
      
      for (let i = 0; i < updatedProjects.length; i++) {
        const originalId = updatedProjects[i].id; // 🔑 Guardar ID original para buscar sub-dados
        const project = { ...updatedProjects[i] };
        
        // 🛡️ Sanitize ID: Se não for um UUID válido, gere um novo
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        if (!uuidRegex.test(project.id)) {
          project.id = crypto.randomUUID();
          updatedProjects[i] = project;
        }

        // 1. Upsert Projeto com user_id
        const { error: projError } = await supabase
          .from('projects')
          .upsert({ ...project, user_id: user?.id })
          .eq('id', project.id);
          
        if (projError) throw projError;

        // 2. Sincronizar Biblioteca Narrativa Associada
        let libData = localStorage.getItem(`ws_narrative_${project.id}`) || localStorage.getItem(`ws_narrative_${originalId}`);
        
        // Safety Net: Se não encontrar pelo ID, buscar órfãos pelo nome do projeto
        if (!libData) {
          const keys = Object.keys(localStorage);
          const legacyKey = keys.find(k => k.startsWith('ws_narrative_') && k.includes(project.name));
          if (legacyKey) libData = localStorage.getItem(legacyKey);
        }

        if (libData) {
          const components = JSON.parse(libData);
          if (Array.isArray(components) && components.length > 0) {
            for (const comp of components) {
              const { error: libError } = await supabase
                .from('narrative_components')
                .upsert({
                  ...comp,
                  project_id: project.id
                });
              if (libError) console.warn('Falha ao sincronizar componente:', libError.message);
            }
            fullSyncCount += components.length;
            
            // Auto-reparo Local: Mover dados para a chave correta para o futuro
            localStorage.setItem(`ws_narrative_${project.id}`, libData);
          }
        }
      }
      
      // Atualizar estado e localStorage com os novos UUIDs
      setProjects(updatedProjects);
      localStorage.setItem('writer_studio_projects', JSON.stringify(updatedProjects));
      
      alert(`Sincronização global concluída! ${updatedProjects.length} canais e ${fullSyncCount} itens de biblioteca salvos.`);
    } catch (err: any) {
      alert('Erro na sincronização: ' + err.message);
    } finally {
      setLoading(false);
      await fetchProjects();
    }
  };

  const handleSaveProject = async (formData: any) => {
    try {
      console.log('--- V3 STRATEGIC SAVE (LOCAL-FIRST) ---');
      
      const projectData = {
        id: formData.id || (editingProject ? editingProject.id : crypto.randomUUID()),
        name: formData.project_name || formData.name,
        puc: formData.puc_promise || formData.puc,
        visual_style: formData.visual_style,
        accent_color: formData.accent_color || '#9BB0A5',
        target_persona: formData.target_persona || {
          audience: formData.target_audience,
          pain_point: formData.core_pain_point
        },
        ai_engine_rules: formData.ai_engine_rules || {
          metaphors: formData.metaphor_library?.split(',').map((s: string) => s.trim()) || [],
          prohibited: formData.prohibited_terms?.split(',').map((s: string) => s.trim()) || []
        },
        playlists: formData.playlists || {
          m1: formData.m1,
          m2: formData.m2,
          m3: formData.m3
        },
        phd_strategy: formData.phd_strategy || { passion: '', skill: '', demand: '' },
        persona_matrix: formData.persona_matrix || { demographics: '', language: '', pain_alignment: '' },
        editorial_line: formData.editorial_line || { pillars: ['', '', '', '', ''] },
        narrative_voice: formData.narrative_voice || { atmosphere: [], positioning: '' },
        metaphor_library: formData.metaphor_library || '',
        prohibited_terms: formData.prohibited_terms || '',
        base_system_instruction: formData.base_system_instruction,
        schedules: formData.posting_schedule || {},
        detailed_sop: formData.editing_sop || {},
        thumb_strategy: formData.thumb_strategy || {},
        status: 'active',
        user_id: user?.id, // 🔑 Vínculo de Identidade
        updated_at: new Date().toISOString()
      };

      // 💾 1. Global State & LocalStorage
      const currentProjects = [...projects];
      const index = currentProjects.findIndex(p => p.id === projectData.id);
      if (index !== -1) currentProjects[index] = projectData;
      else currentProjects.push(projectData);
      
      localStorage.setItem('writer_studio_projects', JSON.stringify(currentProjects));
      setProjects(currentProjects);

      // ☁️ 2. Supabase Cloud Sync
      if (supabase) {
        const { error } = await supabase
          .from('projects')
          .upsert(projectData)
          .eq('id', projectData.id);
        
        if (error) console.warn('⚠️ Supabase Sync Error:', error.message);
      }
      
      setIsModalOpen(false);
      setEditingProject(null);
      await fetchProjects();
    } catch (err: any) {
      console.error('❌ Critical Save Failure:', err);
      setIsModalOpen(false);
      alert('Erro ao salvar. Verifique sua conexão.');
    }
  };

  const handleDeleteProject = async () => {
    if (!projectToDelete) return;
    
    try {
      // ☁️ Sincronização de Nuvem (Se configurada)
      if (supabase) {
        const { error } = await supabase
          .from('projects')
          .delete()
          .eq('id', projectToDelete.id);
        if (error) throw error;
      }
      
      // 💾 Persistência Local (Modo de Segurança / Offline)
      const currentProjects = projects.filter(p => p.id !== projectToDelete.id);
      setProjects(currentProjects);
      localStorage.setItem('writer_studio_projects', JSON.stringify(currentProjects));

      if (activeProjectId === projectToDelete.id) {
        setActiveProjectId(null);
        setCurrentView('home');
      }
      
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
      // fetchProjects recalibra a lista final
      await fetchProjects();
    } catch (err: any) {
      console.error('❌ Erro crítico ao excluir:', err);
      // Fallback de emergência caso tudo falhe
      const filtered = projects.filter(p => p.id !== projectToDelete.id);
      setProjects(filtered);
      localStorage.setItem('writer_studio_projects', JSON.stringify(filtered));
      setIsDeleteModalOpen(false);
      setProjectToDelete(null);
    }
  };

  const handleGerarRoteiro = (themeData: any) => {
    setPendingScript(themeData);
    setCurrentView('scripts');
  };

  const renderView = () => {
    // Strategic Views Guard (Locked State)
    const strategicViews = ['content-hub', 'scripts', 'production', 'analytics', 'library'];
    if (strategicViews.includes(currentView) && !activeProject) {
      return (
        <div className="glass-card p-20 text-center flex flex-col items-center gap-6 animate-in fade-in zoom-in duration-500">
          <div className="w-24 h-24 rounded-full bg-white/5 border border-white/10 flex items-center justify-center mb-4 shadow-2xl">
            <FolderOpen size={48} className="text-white/10" />
          </div>
          <h3 className="text-3xl font-black text-white uppercase tracking-tighter">🔒 Instância Não Selecionada</h3>
          <p className="text-white/40 text-sm max-w-md mx-auto leading-relaxed">
            Para acessar o **{currentView.replace('-', ' ').toUpperCase()}**, você precisa primeiro selecionar uma instância de conteúdo no Dashboard para que possamos injetar o DNA estratégico correto.
          </p>
          <button 
            onClick={() => setCurrentView('home')}
            className="btn-primary py-4 px-10 text-[11px] font-black uppercase tracking-[0.3em] mt-4"
          >
            Voltar ao Dashboard e Ativar Canal
          </button>
        </div>
      );
    }

    switch(currentView) {
      case 'home':
        return (
          <>
            <section className="mb-12">
              <div className="flex justify-between items-center mb-8">
                <div>
                  <h3 className="text-[10px] uppercase tracking-[3px] font-black text-white/20 mb-1">Visão Geral</h3>
                  <h2 className="text-2xl font-bold">Projetos Ativos</h2>
                </div>
                <button className="btn-primary py-3 px-6" onClick={() => { setEditingProject(null); setIsModalOpen(true); }}>
                  + Novo Projeto
                </button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {projects.map(project => {
                  const isActive = project.id === activeProjectId;
                  const brandColor = project.primary_color || '#9bb0a5';
                  
                  return (
                    <div 
                      key={project.id} 
                      className={`glass-card group transition-all duration-500 hover:translate-y-[-8px] cursor-pointer ${isActive ? 'ring-2 active-glow shadow-2xl' : 'border-transparent hover:border-white/10'}`} 
                      onClick={() => {
                        setActiveProjectId(project.id);
                        setCurrentView('content-hub');
                      }}
                      style={{ 
                        borderLeft: `5px solid ${brandColor}`,
                        borderColor: isActive ? brandColor : 'transparent',
                        boxShadow: isActive ? `0 0 35px ${brandColor}44` : 'none'
                      }}
                    >
                      <div className="flex justify-between items-start mb-6">
                        <span className="status-badge" style={{ background: `${brandColor}15`, color: brandColor, borderColor: `${brandColor}33` }}>
                          {isActive ? '● SELECIONADO' : 'ATIVO'}
                        </span>
                        <span className="text-[10px] font-mono opacity-20 group-hover:opacity-50 transition-opacity">
                          #{ (project.project_name || project.name)?.replace(/\s/g, '').toUpperCase() }
                        </span>
                      </div>
                      <h4 className="text-xl font-bold mb-3 tracking-tight">{project.project_name || project.name || 'Canal Sem Nome'}</h4>
                      <p className="text-sm text-white/40 mb-8 line-clamp-2 leading-relaxed italic">
                        "{project.puc_promise || project.description || 'Defina sua promessa única no wizard.'}"
                      </p>
                      <div className="flex gap-3 justify-between items-center mt-auto">
                        <div className="flex gap-2">
                          <button 
                            className={`py-2.5 px-5 text-[10px] font-black tracking-widest transition-all ${isActive ? 'bg-sage text-midnight' : 'btn-primary'}`}
                            onClick={(e) => {
                              e.stopPropagation();
                              setActiveProjectId(project.id);
                              setCurrentView('content-hub');
                            }}
                          >
                            {isActive ? 'GESTÃO ATIVA' : 'GERAR CONTEÚDO'}
                          </button>
                          <button 
                            className="bg-white/5 border border-white/5 hover:border-white/20 p-2.5 rounded-xl transition-all text-white/40 hover:text-white"
                            onClick={(e) => { 
                              e.stopPropagation();
                              setEditingProject(project); 
                              setIsModalOpen(true); 
                            }}
                            title="Configurações Estratégicas"
                          >
                            <Settings size={16} />
                          </button>
                        </div>
                        <button 
                          className="p-2 text-red-500/20 hover:text-red-500 transition-colors"
                          onClick={(e) => { 
                            e.stopPropagation();
                            setProjectToDelete(project); 
                            setIsDeleteModalOpen(true); 
                          }}
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </div>
                  );
                })}
                {projects.length === 0 && (
                  <div className="col-span-full py-32 text-center opacity-20 border-2 border-dashed border-white/5 rounded-[40px] flex flex-col items-center gap-4">
                    <FolderOpen size={48} />
                    <p className="font-medium tracking-widest text-sm uppercase">Nenhuma instância configurada no Content OS.</p>
                  </div>
                )}
              </div>
            </section>

            <section className="glass-card p-12 bg-gradient-to-br from-white/[0.02] to-transparent">
              <div className="flex items-center gap-3 mb-6">
                <History className="text-sage" size={20} />
                <h3 className="text-lg font-bold uppercase tracking-tight">Global History Timeline</h3>
              </div>
              <p className="text-sm text-white/30 italic">Seu histórico de gerações consolidado de todos os canais aparecerá aqui conforme você produzir novos roteiros.</p>
            </section>

            {showSettings && (
              <section className="glass-card p-12 mt-10 animate-in slide-in-from-top-4 border-sage/20 bg-sage/[0.02]">
                <div className="flex items-center gap-3 mb-10">
                  <Settings className="text-sage" size={24} />
                  <h3 className="text-xl font-bold uppercase tracking-tight">Configurações de Engine Global</h3>
                </div>
                <div className="flex flex-col gap-12">
                  <EngineSelector />
                  <div className="h-px bg-white/5" />
                  <ApiKeyManager />
                  <div className="h-px bg-white/5" />
                  
                  {/* Sync & Cloud Migration Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <CloudSync className="text-sage" size={18} />
                      <h4 className="text-sm font-bold uppercase tracking-widest text-white/60">Gestão de Dados & Sync</h4>
                    </div>
                    <div className="flex gap-4">
                      <button 
                        onClick={handleExport}
                        className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-white/60 hover:text-white group"
                        title="Exportar Projetos (Backup JSON)"
                      >
                        <Download size={20} className="group-hover:text-sage transition-colors" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Exportar Backup</span>
                      </button>
                      
                      <label 
                        className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-white/60 hover:text-white group cursor-pointer"
                        title="Importar Projetos (JSON)"
                      >
                        <Upload size={20} className="group-hover:text-sage transition-colors" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Importar JSON</span>
                        <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                      </label>
                      
                      <button 
                        onClick={handleSyncToCloud}
                        className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-white/60 hover:text-white group"
                        title="Sincronizar Local com Nuvem"
                      >
                        <Database size={20} className="group-hover:text-sage transition-colors" />
                        <span className="text-[10px] font-bold uppercase tracking-wider">Sincronizar Nuvem</span>
                      </button>
                    </div>
                    <p className="mt-4 text-[10px] text-white/20 uppercase tracking-widest leading-relaxed">
                      Use estas ferramentas para migrar dados entre ambiente Local e Produção ou para garantir persistência global no Supabase.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </>
        );
      case 'projects':
        return (
          <section className="glass-card p-12">
            <div className="flex justify-between items-center mb-12">
              <div>
                <h3 className="text-[10px] uppercase tracking-[3px] font-black text-white/20 mb-1">Inventory</h3>
                <h2 className="text-2xl font-bold italic">Gestão de Canais</h2>
              </div>
              <button className="btn-primary py-3 px-8" onClick={() => { setEditingProject(null); setIsModalOpen(true); }}>+ Novo Projeto</button>
            </div>
            <div className="flex flex-col gap-4">
              {projects.map(p => {
                const isActive = p.id === activeProjectId;
                const brandColor = p.primary_color || '#9bb0a5';
                
                return (
                  <div 
                    key={p.id} 
                    className={`flex justify-between items-center p-6 bg-white/[0.03] rounded-[24px] border transition-all group cursor-pointer ${isActive ? 'ring-2 active-glow border-transparent' : 'border-white/5 hover:border-white/10'}`}
                    onClick={() => setActiveProjectId(p.id)}
                    style={{ 
                      borderColor: isActive ? brandColor : 'transparent',
                      boxShadow: isActive ? `0 0 15px ${brandColor}22` : 'none',
                      borderLeft: isActive ? `4px solid ${brandColor}` : '1px solid rgba(255,255,255,0.05)'
                    }}
                  >
                    <div className="flex items-center gap-6">
                      <div className="w-2.5 h-12 rounded-full shadow-lg" style={{ background: brandColor, boxShadow: `0 0 15px ${brandColor}44` }} />
                      <div className="flex flex-col">
                        <span className={`font-black text-lg tracking-tight transition-colors ${isActive ? 'text-white' : 'group-hover:text-sage'}`}>
                          {p.project_name || p.name || 'Instância Sem Nome'}
                          {isActive && <span className="ml-3 text-[9px] bg-white/10 px-2 py-0.5 rounded-full text-white/40 uppercase tracking-widest">Ativo</span>}
                        </span>
                        <span className="text-[10px] text-white/20 uppercase font-black tracking-[0.2em]">{p.visual_style} • {p.accent_color}</span>
                      </div>
                    </div>
                    <div className="flex gap-6 items-center">
                      <button 
                        onClick={(e) => { e.stopPropagation(); setActiveProjectId(p.id); }} 
                        className={`text-xs font-black uppercase tracking-widest transition-all ${isActive ? 'text-[var(--accent-color)] cursor-default' : 'text-white/20 hover:text-white'}`}
                      >
                        {isActive ? 'Selecionado' : 'Selecionar'}
                      </button>
                      <div className="w-px h-4 bg-white/5" />
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation();
                          setEditingProject(p); 
                          setIsModalOpen(true); 
                        }} 
                        className="text-xs font-black uppercase tracking-widest text-sage/60 hover:text-sage"
                      >
                        Configurar
                      </button>
                      <div className="w-px h-4 bg-white/5" />
                      <button 
                        onClick={(e) => { 
                          e.stopPropagation();
                          setProjectToDelete(p); 
                          setIsDeleteModalOpen(true); 
                        }} 
                        className="text-xs font-black uppercase tracking-widest text-red-500/40 hover:text-red-500"
                      >
                        Excluir
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
        case 'content-hub':
          return <ContentHub 
            activeProject={activeProject} 
            selectedAIConfig={activeAIConfig} 
            onGerarRoteiro={handleGerarRoteiro}
          />;
        case 'scripts':
          return <ScriptEngine 
            activeProject={activeProject} 
            pendingData={pendingScript}
            onClearPending={() => setPendingScript(null)}
          />;
        case 'library':
          return <NarrativeLibrary activeProject={activeProject} />;
      case 'production':
        return <ProductionTracker activeProject={activeProject} />;
      case 'calendar':
        return (
          <div className="glass-card p-24 text-center border-dashed border-2 border-white/5">
            <h3 className="font-black text-white/10 text-4xl uppercase tracking-tighter mb-6">Calendário Editorial</h3>
            <p className="text-white/20 text-sm max-w-sm mx-auto italic leading-relaxed">
              O agendamento inteligente baseado no DNA de postagem da sua instância está em fase de calibração técnica.
            </p>
          </div>
        );
      case 'analytics':
        return <AnalyticsDashboard activeProject={activeProject} />;
      case 'admin':
        return <UserManagement />;
      default:
        return <div className="glass-card p-12 opacity-10 italic">Módulo em desenvolvimento...</div>;
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-4 border-[var(--accent-color)]/20 border-t-[var(--accent-color)] animate-spin rounded-full shadow-[0_0_15px_rgba(var(--accent-color-rgb),0.2)]" />
          <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em]">Carregando Channel OS...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthOverlay />;
  }

  if (profile && profile.status !== 'approved') {
    return <AwaitingApproval email={user.email!} />;
  }

  return (
    <main 
      className="min-h-screen bg-midnight text-white flex overflow-hidden font-sans"
      style={{ 
        '--accent-color': activeProject?.accent_color || '#9BB0A5',
        '--accent-color-glow': `${activeProject?.accent_color || '#9BB0A5'}15`
      } as React.CSSProperties}
    >
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        activeProject={activeProject}
        onResetProject={() => {
          setActiveProjectId(null);
          setCurrentView('home');
        }}
        userRole={profile?.role}
      />
      
      <main className="main-content">
        <header className="header flex justify-between items-center px-12 py-6 bg-midnight/60 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-20">
          <div className="flex items-center gap-8">
            <h2 className="text-[11px] font-black uppercase tracking-[4px] text-white/30">
              {currentView === 'home' ? 'Global Command' : activeProject ? `Instância: ${activeProject.project_name || activeProject.name}` : 'Aguardando Seleção'}
            </h2>
            {activeProject && (
              <div className="flex items-center gap-2.5 px-4 py-1.5 bg-sage/5 rounded-full border border-sage/10 animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="w-2 h-2 rounded-full bg-sage shadow-[0_0_12px_#9bb0a5]" />
                <span className="text-[10px] font-black text-sage uppercase tracking-[0.1em] leading-none">Scoping Ativo</span>
              </div>
            )}
          </div>
          
          <div className="flex items-center gap-8">
            <button 
              onClick={handleLogout}
              className="p-3 rounded-2xl bg-white/5 border border-white/5 text-white/20 hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-300"
              title="Encerrar Sessão"
            >
              <LogOut size={20} />
            </button>

            {/* AI Model Selector */}
            <div className="relative group">
              <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/5 hover:border-[var(--accent-color)]/30 hover:bg-[var(--accent-color-glow)] transition-all cursor-pointer group">
                <Sparkles size={16} className="text-[var(--accent-color)]" />
                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                  {activeAIConfig.model}
                </span>
                <ChevronRight size={14} className="rotate-90 text-white/20 group-hover:text-[var(--accent-color)] transition-all" />
              </div>

              {/* Dropdown Menu */}
              <div className="absolute right-0 top-full mt-2 w-64 bg-midnight/90 backdrop-blur-3xl border border-white/10 rounded-2xl shadow-2xl opacity-0 group-hover:opacity-100 pointer-events-none group-hover:pointer-events-auto transition-all transform origin-top-right scale-95 group-hover:scale-100 z-50 p-2">
                <div className="px-3 py-2 text-[8px] font-black text-white/20 uppercase tracking-[3px] border-b border-white/5 mb-1">Select Engine Engine</div>
                
                {/* OpenAI Section */}
                <div className="mb-1">
                  <div className="px-3 py-1 text-[8px] font-bold text-sage opacity-50 uppercase tracking-widest">OpenAI Family</div>
                  {AI_MODELS.openai.map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => handleUpdateAI({ engine: 'openai', model: m.id })}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left ${activeAIConfig.model === m.id ? 'bg-[var(--accent-color-glow)] text-[var(--accent-color)]' : 'text-white/40'}`}
                    >
                      <span className="text-[10px] font-bold uppercase">{m.id}</span>
                      {activeAIConfig.model === m.id && <div className="w-1 h-1 rounded-full bg-[var(--accent-color)]" />}
                    </button>
                  ))}
                </div>

                {/* Gemini Section */}
                <div>
                  <div className="px-3 py-1 text-[8px] font-bold text-blue-400 opacity-50 uppercase tracking-widest">Google Gemini</div>
                  {AI_MODELS.gemini.map(m => (
                    <button 
                      key={m.id} 
                      onClick={() => handleUpdateAI({ engine: 'gemini', model: m.id })}
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left ${activeAIConfig.model === m.id ? 'bg-[var(--accent-color-glow)] text-[var(--accent-color)]' : 'text-white/40'}`}
                    >
                      <span className="text-[10px] font-bold uppercase">{m.id}</span>
                      {activeAIConfig.model === m.id && <div className="w-1 h-1 rounded-full bg-[var(--accent-color)]" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>



            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-2xl border transition-all duration-500 ${showSettings ? 'bg-sage/10 border-sage/30 text-sage shadow-[0_0_20px_rgba(155,176,165,0.1)]' : 'bg-white/5 border-white/5 text-white/20 hover:text-white hover:border-white/10'}`}
              title="Ajustes Globais"
            >
              <Settings size={22} />
            </button>
            <div className="flex items-center gap-4 bg-white/5 px-5 py-2.5 rounded-2xl border border-white/5 shadow-inner">
              <div className="w-2 h-2 rounded-full bg-sage animate-pulse shadow-[0_0_8px_#9bb0a5]" />
              <span className="text-[10px] font-black text-white/30 uppercase tracking-[3px]">Status: • Online</span>
            </div>
          </div>
        </header>
        
        <div className="p-12 max-w-[1700px] mx-auto min-h-[calc(100vh-100px)]">
          {renderView()}
        </div>
      </main>

      {isModalOpen && (
        <ProjectWizardModal 
          onClose={() => { setIsModalOpen(false); setEditingProject(null); }} 
          onComplete={handleSaveProject}
          initialData={editingProject}
        />
      )}
      {isDeleteModalOpen && (
        <DeleteProjectModal 
          onClose={() => setIsDeleteModalOpen(false)} 
          onConfirm={handleDeleteProject}
          projectName={projectToDelete?.project_name || projectToDelete?.name}
        />
      )}
    </main>
  );

}
