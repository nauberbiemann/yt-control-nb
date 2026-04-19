'use client';

import { useState, useEffect, useRef } from 'react';
import Sidebar from '@/components/Sidebar';
import EngineSelector from '@/components/EngineSelector';
import ApiKeyManager from '@/components/ApiKeyManager';
import ProjectWizardModal from '@/components/ProjectWizardModal';
import DeleteProjectModal from '@/components/DeleteProjectModal';
import ScriptEngine from '@/components/ScriptEngine';
import AnalyticsDashboard from '@/components/AnalyticsDashboard';
import NarrativeLibrary from '@/components/NarrativeLibrary';
import ThemeBank from '@/components/ThemeBank';
import AuthOverlay from '@/components/auth/AuthOverlay';
import AwaitingApproval from '@/components/auth/AwaitingApproval';
import UserManagement from '@/components/admin/UserManagementPanel';
import { supabase } from '@/lib/supabase';
import { isMasterAccessEmail } from '@/lib/auth-access';
import { useProjectStore, useActiveProject, useProjects, isBootstrapProject } from '@/lib/store/projectStore';

// 🛠️ MODO DE DESENVOLVIMENTO: Altere para true para reativar a segurança
const ENFORCE_AUTH = true;
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
  LogOut,
  ShieldAlert,
  Lightbulb,
  Filter,
  Clock
} from 'lucide-react';

export default function Home() {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

  const isValidUuid = (value?: string | null) => !!value && uuidRegex.test(value);

  const resolveThemeStatusFromPublishDate = (dateValue?: string | null, fallbackStatus = 'scripted') => {
    if (!dateValue) return fallbackStatus;

    const normalizedDate = dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`;
    const selected = new Date(normalizedDate);
    if (Number.isNaN(selected.getTime())) return fallbackStatus;

    const now = new Date();
    if (dateValue.includes('T')) {
      return selected.getTime() <= now.getTime() ? 'published' : 'scheduled';
    }

    const selectedDay = new Date(selected);
    selectedDay.setHours(0, 0, 0, 0);
    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);

    if (selectedDay.getTime() < todayStart.getTime()) return 'published';
    if (selectedDay.getTime() > todayStart.getTime()) return 'scheduled';
    return 'scripted';
  };

  const inferThemeTitleFromSnapshot = (snapshot: any) => {
    const candidates = [
      snapshot?.approvedTheme,
      snapshot?.approvedBriefing?.refined_title,
      snapshot?.approvedBriefing?.title,
      snapshot?.approvedBriefing?.theme,
      snapshot?.approvedBriefing?.workingTitle,
      snapshot?.externalScriptFileName?.replace(/\.(txt|md)$/i, ''),
    ];

    const found = candidates.find((value) => typeof value === 'string' && value.trim().length > 0);
    return typeof found === 'string' ? found.trim() : '';
  };

  const projectHasCloudPayload = (projectId?: string | null) => {
    if (!projectId || typeof window === 'undefined') return false;

    const payloadKeys = [
      `ws_narrative_${projectId}`,
      `themes_${projectId}`,
      `ws_script_execution_${projectId}`,
      `ws_assemblies_${projectId}`,
      `bi_${projectId}`,
    ];

    return payloadKeys.some((key) => {
      const raw = localStorage.getItem(key);
      if (!raw) return false;

      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.length > 0;
        if (parsed && typeof parsed === 'object') return Object.keys(parsed).length > 0;
        return typeof parsed === 'string' ? parsed.trim().length > 0 : Boolean(parsed);
      } catch {
        return raw.trim().length > 0;
      }
    });
  };

  // Strict sanitization: only columns that exist in the `projects` Postgres table.
  // After running migration_strategic_fields.sql, the schema now includes
  // phd_strategy, persona_matrix, editorial_line, narrative_voice, thumb_strategy.
  const sanitizeProjectCloudPayload = (project: Record<string, any>) => {
    const safeName =
      project?.project_name ||
      project?.name ||
      'Canal sem nome';

    return {
      id: project?.id,
      name: safeName,
      project_name: project?.project_name || safeName,
      description:
        project?.description ||
        project?.puc ||
        project?.puc_promise ||
        'Projeto sincronizado a partir do ambiente local.',
      puc: project?.puc || project?.puc_promise || '',
      puc_promise: project?.puc_promise || project?.puc || '',
      status: project?.status || 'active',
      visual_style: project?.visual_style || null,
      accent_color: project?.accent_color || '#9BB0A5',
      // JSONB columns — base schema
      target_persona: project?.target_persona || null,
      ai_engine_rules: project?.ai_engine_rules || null,
      playlists: project?.playlists || null,
      detailed_sop: project?.detailed_sop || project?.editing_sop || null,
      editing_sop: project?.editing_sop || project?.detailed_sop || null,
      traceability_summary: project?.traceability_summary || [],
      traceability_sources: project?.traceability_sources || {},
      // JSONB columns — added by migration_strategic_fields.sql
      phd_strategy: project?.phd_strategy || null,
      persona_matrix: project?.persona_matrix || null,
      editorial_line: project?.editorial_line || null,
      narrative_voice: project?.narrative_voice || null,
      thumb_strategy: project?.thumb_strategy || null,
      // TEXT columns
      metaphor_library: project?.metaphor_library || null,
      prohibited_terms: project?.prohibited_terms || null,
      base_system_instruction: project?.base_system_instruction || null,
      default_execution_mode: project?.default_execution_mode || 'internal',
      user_id: project?.user_id || null,
      created_at: project?.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
  };

  const sanitizeThemeStatusForCloud = (status?: string | null) => {
    const normalized = (status || '').toLowerCase().trim();
    if (['published', 'publicado'].includes(normalized)) return 'published';
    if (['vetted', 'approved', 'aprovado'].includes(normalized)) return 'vetted';
    if (
      [
        'scripted',
        'scheduled',
        'programado',
        'production',
        'producao',
        'produção',
        'generating',
        'done',
      ].includes(normalized)
    ) return 'scripted';
    return 'backlog';
  };

  const sanitizeThemeCloudPayload = (item: Record<string, any>, projectId: string, currentUserId?: string | null) => ({
    id: isValidUuid(item?.id) ? item.id : crypto.randomUUID(),
    project_id: projectId,
    user_id: item?.user_id || currentUserId || null,
    title: item?.title || item?.refined_title || item?.theme || 'Tema sem título',
    description: item?.description || '',
    editorial_pillar: item?.editorial_pillar || item?.pipeline_level || '',
    status: sanitizeThemeStatusForCloud(item?.status),
    hook_id: isValidUuid(item?.hook_id) ? item.hook_id : null,
    title_structure: item?.title_structure || '',
    priority: Number.isFinite(Number(item?.priority)) ? Number(item.priority) : 0,
    notes: item?.notes || '',
    created_at: item?.created_at || new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });

  const extractBriefingDurationMinutes = (briefing: any) => {
    const durationValue =
      briefing?.estimatedDuration ||
      briefing?.duration ||
      briefing?.targetDuration ||
      briefing?.editingSop?.duration;

    if (typeof durationValue === 'number' && Number.isFinite(durationValue)) {
      return durationValue;
    }

    if (typeof durationValue === 'string') {
      const match = durationValue.match(/\d+/);
      if (match) return Number(match[0]);
    }

    return null;
  };

  const buildThemePayloadFromExecutionSnapshot = (
    project: any,
    snapshot: any,
    existingTheme: any,
    currentUserId?: string | null
  ) => {
    const themeTitle = inferThemeTitleFromSnapshot(snapshot);
    if (!themeTitle) return null;

    const briefing = snapshot?.approvedBriefing || {};
    const targetPublishDate =
      snapshot?.manualPublishDate ||
      existingTheme?.production_assets?.target_publish_date ||
      null;
    const scheduleStatus = resolveThemeStatusFromPublishDate(targetPublishDate, existingTheme?.status || 'scripted');
    const nextThemeId =
      isValidUuid(existingTheme?.id) ? existingTheme.id : crypto.randomUUID();
    const nowIso = new Date().toISOString();

    return {
      ...existingTheme,
      id: nextThemeId,
      title: themeTitle,
      refined_title: themeTitle,
      description:
        existingTheme?.description ||
        `Tema recuperado da execucao local da Escrita Criativa para o projeto ${project?.project_name || project?.name || 'ativo'}.`,
      editorial_pillar:
        existingTheme?.editorial_pillar ||
        project?.playlists?.tactical_journey?.[0]?.label ||
        '',
      status: scheduleStatus,
      title_structure:
        briefing?.selectedTitleStructure?.name ||
        existingTheme?.title_structure ||
        '',
      selected_structure:
        briefing?.selectedTitleStructure?.id ||
        briefing?.assetLog?.titleStructure ||
        existingTheme?.selected_structure ||
        '',
      title_structure_asset_id:
        briefing?.selectedTitleStructure?.id ||
        briefing?.assetLog?.titleStructure ||
        existingTheme?.title_structure_asset_id ||
        null,
      pipeline_level:
        existingTheme?.pipeline_level ||
        project?.playlists?.tactical_journey?.[0]?.label ||
        '',
      is_demand_vetted: existingTheme?.is_demand_vetted ?? true,
      is_persona_vetted: existingTheme?.is_persona_vetted ?? true,
      priority: Number(existingTheme?.priority || 0),
      notes:
        existingTheme?.notes ||
        'Origem: snapshot local recuperado e sincronizado com a nuvem.',
      match_score:
        Number(existingTheme?.match_score || briefing?.diagnostics?.noveltyScore || 0),
      demand_views: existingTheme?.demand_views || '',
      production_assets: {
        ...(existingTheme?.production_assets || {}),
        source:
          existingTheme?.production_assets?.source || 'script_engine_snapshot_recovery',
        approved_at: existingTheme?.production_assets?.approved_at || nowIso,
        hook_id:
          existingTheme?.production_assets?.hook_id ||
          briefing?.assetLog?.hook ||
          null,
        cta_id:
          existingTheme?.production_assets?.cta_id ||
          briefing?.assetLog?.ctaFinal ||
          null,
        title_structure_id:
          existingTheme?.production_assets?.title_structure_id ||
          briefing?.assetLog?.titleStructure ||
          null,
        narrative_curve_id:
          existingTheme?.production_assets?.narrative_curve_id ||
          briefing?.selectedNarrativeCurve?.id ||
          briefing?.assetLog?.narrativeCurve ||
          null,
        argument_mode_id:
          existingTheme?.production_assets?.argument_mode_id ||
          briefing?.selectedArgumentMode?.id ||
          briefing?.assetLog?.argumentMode ||
          null,
        repetition_rule_ids:
          existingTheme?.production_assets?.repetition_rule_ids ||
          briefing?.selectedRepetitionRules?.map((rule: any) => rule.id) ||
          [],
        block_count:
          existingTheme?.production_assets?.block_count ||
          briefing?.blockCount ||
          briefing?.blocks?.length ||
          snapshot?.scriptBlocks?.length ||
          null,
        duration_minutes:
          Number(existingTheme?.production_assets?.duration_minutes || 0) ||
          extractBriefingDurationMinutes(briefing),
        voice_pattern:
          existingTheme?.production_assets?.voice_pattern ||
          briefing?.diagnostics?.locked?.voicePatternId ||
          null,
        execution_mode:
          snapshot?.executionMode ||
          existingTheme?.production_assets?.execution_mode ||
          'internal',
        external_script_text:
          snapshot?.externalScriptText ||
          existingTheme?.production_assets?.external_script_text ||
          '',
        external_file_name:
          snapshot?.externalScriptFileName ||
          existingTheme?.production_assets?.external_file_name ||
          '',
        external_source_label:
          snapshot?.externalSourceLabel ||
          existingTheme?.production_assets?.external_source_label ||
          '',
        external_srt_text:
          snapshot?.externalSrtText ||
          existingTheme?.production_assets?.external_srt_text ||
          '',
        external_srt_file_name:
          snapshot?.externalSrtFileName ||
          existingTheme?.production_assets?.external_srt_file_name ||
          '',
        target_publish_date: targetPublishDate,
        schedule_status: scheduleStatus,
        execution_snapshot: snapshot,
      },
      project_id: project.id,
      user_id: existingTheme?.user_id || currentUserId || project?.user_id || null,
      updated_at: nowIso,
      created_at: existingTheme?.created_at || nowIso,
    };
  };

  const persistProjectsLocally = (projectList: any[]) => {
    const payload = JSON.stringify(projectList || []);
    localStorage.setItem('writer_studio_projects', payload);
    localStorage.setItem('writer_studio_projects_backup', payload);

    try {
      const currentArchive = JSON.parse(localStorage.getItem('writer_studio_projects_archive') || '[]');
      const archive = Array.isArray(currentArchive) ? currentArchive : [];
      const lastSnapshot = archive[0];
      const isSameAsLast = lastSnapshot && JSON.stringify(lastSnapshot.projects || []) === payload;

      if (!isSameAsLast) {
        const nextArchive = [
          { saved_at: new Date().toISOString(), projects: projectList || [] },
          ...archive,
        ].slice(0, 15);

        localStorage.setItem('writer_studio_projects_archive', JSON.stringify(nextArchive));
      }
    } catch {
      // non-blocking local archive
    }
  };

  const [currentView, setCurrentView] = useState('home');
  const [showSettings, setShowSettings] = useState(false);
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<any>(null);
  const [lastSessionId, setLastSessionId] = useState<string | null>(null);
  const [dbSetupRequired, setDbSetupRequired] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<any>(null);
  const [projectToDelete, setProjectToDelete] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [activeAIConfig, setActiveAIConfig] = useState<AIConfig>(DEFAULT_CONFIG);
  const [pendingScript, setPendingScript] = useState<any>(null);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [projectSyncStatus, setProjectSyncStatus] = useState<'idle' | 'syncing' | 'error'>('idle');
  const hasInitialized = useRef(false);
  const isMasterUser = isMasterAccessEmail(user?.email);
  const effectiveProfile = isMasterUser
    ? {
        ...profile,
        email: user?.email,
        role: 'admin',
        status: 'approved',
      }
    : profile;

  // ── Zustand Store ────────────────────────────────────────────────────────
  const projectStore = useProjectStore();
  const projects = useProjects();
  const activeProject = useActiveProject();
  const activeProjectId = projectStore.activeProjectId;
  const setActiveProjectId = (id: string | null) => projectStore.setActiveProject(id);
  const setProjects = projectStore.setProjects;

  // Guard: redirect to 'projects' view when a strategic module is accessed without an active project
  useEffect(() => {
    const strategicViews = ['themes', 'library', 'scripts', 'production', 'analytics'];
    if (strategicViews.includes(currentView) && !activeProjectId) {
      setCurrentView('projects');
    }
  }, [currentView, activeProjectId]);

  useEffect(() => {
    if (currentView === 'production') {
      setCurrentView(activeProjectId ? 'scripts' : 'projects');
    }
  }, [currentView, activeProjectId]);

  useEffect(() => {
    if (ENFORCE_AUTH && currentView === 'admin' && !isMasterUser) {
      setCurrentView('home');
    }
  }, [currentView, isMasterUser]);

  useEffect(() => {
    let timeoutId: any;

    const initApp = async () => {
      if (hasInitialized.current) return;
      hasInitialized.current = true;
      
      console.log("[ContentOS] Iniciando inicialização...");
      
      // Failsafe: se demorar mais de 10s, força a saída do loading (mais generoso)
      timeoutId = setTimeout(() => {
        if (loading) {
          console.warn("[ContentOS] Failsafe: inicialização demorou muito, forçando setLoading(false)");
          setLoading(false);
        }
      }, 10000);

      try {
        // 1. Configs IA
        console.log("[ContentOS] 1. Carregando configs IA...");
        const savedAI = localStorage.getItem('ws_ai_config');
        if (savedAI) {
          try { setActiveAIConfig(JSON.parse(savedAI)); } catch (e) {}
        }

        // 2. Load Projects (Priority: fills UI even if Auth fails)
        console.log("[ContentOS] 2. Carregando projetos (Local/Cloud)...");
        await projectStore.loadProjects();

        // 🛡️ Supabase Check
        if (!supabase) {
          console.log("[ContentOS] 3. Supabase OFF. Operando em modo local.");
          return;
        }

        // 2. Session — treat Supabase errors as non-fatal (paused free tier, network issues)
        console.log("[ContentOS] 3. Buscando sessão Supabase...");
        try {
          const { data: { session }, error: sessionError } = await supabase.auth.getSession();
          if (sessionError) {
            console.warn("[ContentOS] ⚠️ Falha ao buscar sessão (Supabase indisponível):", sessionError.message);
          } else if (session?.user) {
            console.log("[ContentOS] Sessão detectada:", session.user.id);
            setLastSessionId(session.user.id);
            setUser(session.user);
            try { await fetchProfile(session.user.id); } catch (profileErr: any) {
              console.warn("[ContentOS] ⚠️ Falha ao buscar perfil:", profileErr?.message);
            }
          } else {
            console.log("[ContentOS] Nenhuma sessão ativa.");
          }
        } catch (authErr: any) {
          console.warn("[ContentOS] ⚠️ Auth indisponível (Supabase pausado?):", authErr?.message);
        }

        // 4. Session management handled
        console.log("[ContentOS] Projetos carregados:", projectStore.projects.length);

      } catch (err) {
        console.error("[ContentOS] Erro fatal na inicialização:", err);
        // Emergency fallback: try to load projects one last time if they hasn't been loaded
        if (projectStore.projects.length === 0) {
          await projectStore.loadProjects();
        }
      } finally {
        console.log("[ContentOS] Inicialização concluída.");
        clearTimeout(timeoutId);
        setLoading(false);
      }
    };

    initApp();

    if (supabase) {
      const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event: any, session: any) => {
        console.log('--- Auth Event ---', event, session?.user?.id);
        const currentId = session?.user?.id || null;

        if (event === 'SIGNED_IN' || (event === 'INITIAL_SESSION' && session)) {
          if (currentId && currentId !== lastSessionId) {
            setLastSessionId(currentId);
            setUser(session.user);
            await fetchProfile(session.user.id);
            await projectStore.loadProjects();
          }
        } else if (event === 'SIGNED_OUT') {
          setLastSessionId(null);
          setUser(null);
          setProfile(null);
          projectStore.clearProject();
        }
      });
      return () => {
        subscription.unsubscribe();
        clearTimeout(timeoutId);
      };
    }
  }, []);

  useEffect(() => {
    if (loading || projectStore.projectsLoaded || projects.length > 0) return;
    void projectStore.loadProjects();
  }, [loading, projectStore.projectsLoaded, projects.length, projectStore]);

  // 🔄 Background Project Auto-Uploader
  // Every 90s, retry any projects that failed their cloud sync.
  useEffect(() => {
    if (!supabase) return;
    const interval = setInterval(async () => {
      try {
        const raw = localStorage.getItem('_pending_project_sync');
        if (!raw) return;
        const pending: string[] = JSON.parse(raw);
        if (!pending.length) return;

        const allProjects: any[] = JSON.parse(localStorage.getItem('writer_studio_projects') || '[]');
        const toSync = allProjects.filter((p: any) => pending.includes(p.id));
        if (!toSync.length) {
          localStorage.removeItem('_pending_project_sync');
          return;
        }

        console.log(`[AutoUploader] Tentando sincronizar ${toSync.length} projeto(s) pendente(s)...`);
        const results = await Promise.all(
          toSync.map((p: any) =>
            supabase!.from('projects').upsert(sanitizeProjectCloudPayload(p)).then(({ error }: { error: any }) => ({
              id: p.id,
              ok: !error,
              error,
            }))
          )
        );

        const stillPending = results.filter((r) => !r.ok).map((r) => r.id);
        const synced = results.filter((r) => r.ok).map((r) => r.id);

        if (synced.length) {
          console.log(`[AutoUploader] ✅ ${synced.length} projeto(s) sincronizado(s).`);
          setProjectSyncStatus('idle');
        }

        if (stillPending.length) {
          console.warn(`[AutoUploader] ⚠️ ${stillPending.length} projeto(s) ainda pendente(s).`);
          setProjectSyncStatus('error');
          localStorage.setItem('_pending_project_sync', JSON.stringify(stillPending));
        } else {
          localStorage.removeItem('_pending_project_sync');
        }
      } catch (err) {
        console.warn('[AutoUploader] Falha no ciclo de sync de projetos:', err);
      }
    }, 90_000);

    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supabase]);

  const handleUpdateAI = (config: AIConfig) => {
    setActiveAIConfig(config);
    localStorage.setItem('ws_ai_config', JSON.stringify(config));
  };

  const fetchProfile = async (userId: string, retries = 3) => {
    try {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
      
      if (error) {
        // Se não encontrar e ainda tiver tentativas, espera e tenta de novo (gatilho pode estar rodando)
        if (error.code === 'PGRST116' && retries > 0) {
          console.log(`Perfil não encontrado. Tentando novamente em 1s... (${retries} restantes)`);
          await new Promise(resolve => setTimeout(resolve, 1000));
          return fetchProfile(userId, retries - 1);
        }
        throw error;
      }
      setProfile(data);
    } catch (err: any) {
      console.error('Erro detalhado ao buscar perfil:', err.message || err);
      if (err.code === '42P01') {
        setDbSetupRequired(true);
      }
    }
  };

  const fetchProjects = async () => {
    try {
      setLoading(true);
      await projectStore.loadProjects();
    } finally {
      setLoading(false);
    }
  };


  const handleLogout = async () => {
    if (confirm('Deseja realmente encerrar a sessão?')) {
      setLoading(true);
      try {
        if (supabase) {
          await supabase.auth.signOut({ scope: 'global' });
        }
      } catch (error) {
        console.warn('[ContentOS] Falha ao encerrar sessão no Supabase:', error);
      } finally {
        setLastSessionId(null);
        setUser(null);
        setProfile(null);
        projectStore.clearProject();
        setCurrentView('home');
        setShowSettings(false);
        setLoading(false);
      }
    }
  };

  const handleExport = () => {
    const projectsData = localStorage.getItem('writer_studio_projects_backup') || localStorage.getItem('writer_studio_projects');
    if (!projectsData) return alert('Nenhum dado local para exportar.');
    
    const exportBundle: any = {
      projects: JSON.parse(projectsData),
      libraries: {},
      themes: {},
      executions: {},
      assemblies: {},
      analytics: {},
      version: '2.1-universal'
    };

    // Capturar todas as bibliotecas narrativas e temas vinculados
    exportBundle.projects.forEach((p: any) => {
      const libData = localStorage.getItem(`ws_narrative_${p.id}`);
      if (libData) exportBundle.libraries[p.id] = JSON.parse(libData);
      
      const themeData = localStorage.getItem(`themes_${p.id}`);
      if (themeData) exportBundle.themes[p.id] = JSON.parse(themeData);

      const executionData = localStorage.getItem(`ws_script_execution_${p.id}`);
      if (executionData) exportBundle.executions[p.id] = JSON.parse(executionData);

      const assemblyData = localStorage.getItem(`ws_assemblies_${p.id}`);
      if (assemblyData) exportBundle.assemblies[p.id] = JSON.parse(assemblyData);

      const analyticsData = localStorage.getItem(`bi_${p.id}`);
      if (analyticsData) exportBundle.analytics[p.id] = JSON.parse(analyticsData);
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
        let themesToImport: Record<string, any[]> = {};
        let executionsToImport: Record<string, any> = {};
        let assembliesToImport: Record<string, any[]> = {};
        let analyticsToImport: Record<string, any[]> = {};
        
        // Suporte para formato antigo e novo universal
        if (Array.isArray(bundle)) {
          projectsToImport = bundle;
        } else if (bundle.version === '2.0-universal' || bundle.version === '2.1-universal') {
          projectsToImport = bundle.projects;
          librariesToImport = bundle.libraries || {};
          themesToImport = bundle.themes || {};
          executionsToImport = bundle.executions || {};
          assembliesToImport = bundle.assemblies || {};
          analyticsToImport = bundle.analytics || {};
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
        persistProjectsLocally(sanitizedProjects);
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

        let importedThemes = 0;
        Object.keys(themesToImport).forEach((oldProjId) => {
          const newProjId = idMap[oldProjId];
          if (!newProjId) return;

          const themes = (Array.isArray(themesToImport[oldProjId]) ? themesToImport[oldProjId] : []).map((theme: any) => ({
            ...theme,
            project_id: newProjId,
            id: uuidRegex.test(theme?.id) ? theme.id : crypto.randomUUID(),
            updated_at: new Date().toISOString(),
          }));

          localStorage.setItem(`themes_${newProjId}`, JSON.stringify(themes));
          importedThemes += themes.length;
        });

        let importedExecutions = 0;
        Object.keys(executionsToImport).forEach((oldProjId) => {
          const newProjId = idMap[oldProjId];
          const executionSnapshot = executionsToImport[oldProjId];
          if (!newProjId || !executionSnapshot) return;

          localStorage.setItem(`ws_script_execution_${newProjId}`, JSON.stringify({
            ...executionSnapshot,
            updated_at: new Date().toISOString(),
          }));
          importedExecutions += 1;
        });

        let importedAssemblies = 0;
        Object.keys(assembliesToImport).forEach((oldProjId) => {
          const newProjId = idMap[oldProjId];
          if (!newProjId) return;

          const assemblies = Array.isArray(assembliesToImport[oldProjId]) ? assembliesToImport[oldProjId] : [];
          localStorage.setItem(`ws_assemblies_${newProjId}`, JSON.stringify(assemblies));
          importedAssemblies += assemblies.length;
        });

        let importedAnalytics = 0;
        Object.keys(analyticsToImport).forEach((oldProjId) => {
          const newProjId = idMap[oldProjId];
          if (!newProjId) return;

          const analyticsEntries = Array.isArray(analyticsToImport[oldProjId]) ? analyticsToImport[oldProjId] : [];
          localStorage.setItem(`bi_${newProjId}`, JSON.stringify(analyticsEntries));
          importedAnalytics += analyticsEntries.length;
        });

        // 4. Manter a Instância Ativa se ela foi remapeada
        if (activeProjectId && idMap[activeProjectId]) {
          setActiveProjectId(idMap[activeProjectId]);
        } else if (sanitizedProjects.length > 0) {
          setActiveProjectId(sanitizedProjects[0].id);
        }

        alert(`Backup Universal importado: ${sanitizedProjects.length} projetos, ${migratedCount} itens de biblioteca, ${importedThemes} temas, ${importedExecutions} snapshots da Escrita Criativa, ${importedAssemblies} snapshots do assembler e ${importedAnalytics} registros de BI. Clique em Sincronizar Nuvem.`);
        
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
    
    setIsSyncingCloud(true);
    console.log("[ContentOS-Sync] Iniciando Sincronização Mestre...");

    const withTimeout = async <T,>(promise: Promise<T>, ms = 60000, message = 'Tempo limite excedido durante a sincronização.') => {
      return await Promise.race<T>([
        promise,
        new Promise<T>((_, reject) => {
          setTimeout(() => reject(new Error(message)), ms);
        }),
      ]);
    };
    
    try {
      const syncCandidate = activeProject ? activeProject : null;

      const updatedProjects = syncCandidate
        ? [{ ...syncCandidate }]
        : [];

      if (updatedProjects.length === 0) {
        alert('Nenhum projeto com dados locais elegíveis para sincronizar. Se o DevZen for o seu projeto-base, eu já posso liberar esse bootstrap para a nuvem também.');
        return;
      }
      let totalSynced = 0;
      const nextProjects = [...projects];
      
      for (let i = 0; i < updatedProjects.length; i++) {
        const project = { ...updatedProjects[i] };
        const originalId = project.id; 
        
        console.log(`[ContentOS-Sync] Sincronizando Projeto: ${project.project_name || project.name}`);
        console.time(`sync-project-${project.id}`);

        // 🛡️ Sanitize ID: Se não for um UUID válido, gere um novo
        if (!uuidRegex.test(project.id)) {
          project.id = crypto.randomUUID();
          updatedProjects[i] = project;
        }

        const projectPayload = sanitizeProjectCloudPayload(project);
        console.log(`[ContentOS-Sync]   - Payload do Projeto: ${Math.round(JSON.stringify(projectPayload).length / 1024)} KB`);

        const { error: projError }: any = await withTimeout(
          supabase
            .from('projects')
            .upsert(projectPayload),
          120000,
          `Tempo limite ao sincronizar o projeto ${project.project_name || project.name}.`
        );
          
        if (projError) throw projError;
        totalSynced++;

        // Helper para sincronização EM LOTE
        const batchSync = async (
          localKey: string,
          tableName: string,
          sanitizer: (item: any) => any | null
        ) => {
          const rawData = localStorage.getItem(localKey);
          if (!rawData) return;
          
          try {
            const items = JSON.parse(rawData);
            if (!Array.isArray(items) || items.length === 0) return;
            
            console.log(`[ContentOS-Sync]   - Efetuando batch upload em ${tableName} (${items.length} itens)...`);

            // Sanitizar IDs dos itens no lote
            const sanitizedItems = items
              .map((item) => sanitizer(item))
              .filter(Boolean);

            if (sanitizedItems.length === 0) return;

            // Upsert do lote inteiro
            const { error }: any = await withTimeout(
              supabase
                .from(tableName)
                .upsert(sanitizedItems),
              60000,
              `Tempo limite ao sincronizar ${tableName}.`
            );
            
            if (error) {
              console.error(`[ContentOS-Sync] ❌ Erro no lote de ${tableName}:`, error.message);
            } else {
              totalSynced += sanitizedItems.length;
            }
          } catch (e) {
            console.error(`[ContentOS-Sync] ❌ Erro ao ler dados de ${localKey}:`, e);
          }
        };

        // 2 - Sincronização do Banco de Temas
        await batchSync(
          `themes_${originalId}`,
          'themes',
          (item) => sanitizeThemeCloudPayload(item, project.id, user?.id)
        );

        // Auto-reparo das chaves locais se o ID mudou
        if (originalId !== project.id) {
          ['themes_'].forEach(p => {
            const d = localStorage.getItem(`${p}${originalId}`);
            if (d) localStorage.setItem(`${p}${project.id}`, d);
          });
        }

        const projectIndex = nextProjects.findIndex((candidate) => candidate.id === originalId);
        if (projectIndex >= 0) {
          nextProjects[projectIndex] = project;
        } else {
          nextProjects.push(project);
        }

        console.timeEnd(`sync-project-${project.id}`);
      }
      
      setProjects(nextProjects);
      persistProjectsLocally(nextProjects);
      if (syncCandidate && syncCandidate.id !== updatedProjects[0]?.id && updatedProjects[0]?.id) {
        setActiveProjectId(updatedProjects[0].id);
      }
      
      console.log("[ContentOS-Sync] Sincronização Concluída!");
      alert(`Sincronização mestre concluída!\n${updatedProjects.length} canais e ${totalSynced} itens migrados com sucesso.`);
    } catch (err: any) {
      console.error("[ContentOS-Sync] ❌ Falha Crítica na Sincronização:", err);
      alert('Erro na sincronização: ' + err.message);
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleSaveProject = async (formData: any) => {
    console.log("[ContentOS] Iniciando salvamento do projeto...", formData);
    setLoading(true);
    try {
      const normalizePillarList = (pillars: any) => {
        const list = Array.isArray(pillars) ? pillars : [];
        return [...list, '', '', '', '', ''].slice(0, 5).map((item) => item || '');
      };

      const normalizeJourney = (journey: any[] = []) => {
        const fallback = [
          { id: 't1', label: 'T1', title: 'Topo de Funil (Viral)', value: '', isFixed: true },
          { id: 't2', label: 'T2', title: 'Meio de Funil (Retenção)', value: '', isFixed: true },
          { id: 't3', label: 'T3', title: 'Fundo de Funil (Comunidade)', value: '', isFixed: true }
        ];
        return [0, 1, 2].map((index) => ({
          ...fallback[index],
          ...(journey[index] || {}),
          id: journey[index]?.id || fallback[index].id,
          label: journey[index]?.label || fallback[index].label,
          title: journey[index]?.title || fallback[index].title,
          value: journey[index]?.value || '',
          isFixed: journey[index]?.isFixed ?? true,
        }));
      };

      const normalizeEditingSop = (source: any = {}) => {
        // IMPORTANT: do NOT use `Number(x || 0) || ''` — it converts valid
        // user-entered 0 or early values to '' and causes the field to reset.
        // Use explicit null/undefined checks instead.
        const toNum = (v: any) => {
          const n = Number(v);
          return Number.isFinite(n) && v !== '' && v !== null && v !== undefined ? n : '';
        };
        return {
          cut_rhythm: source.cut_rhythm || '',
          zoom_style: source.zoom_style || '',
          soundtrack: source.soundtrack || '',
          art_direction: source.art_direction || '',
          overlays: source.overlays || '',
          duration: source.duration || '',
          duration_min: toNum(source.duration_min ?? source.duration),
          duration_max: toNum(source.duration_max),
          blocks_variation: source.blocks_variation || '',
          blocks_min: toNum(source.blocks_min),
          blocks_max: toNum(source.blocks_max),
          asset_types: Array.isArray(source.asset_types) ? source.asset_types : [],
          measurement_focus: source.measurement_focus || '',
        };
      };

      const normalizeThumbStrategy = (source: any = {}) => {
        const layouts = Array.isArray(source.layouts) && source.layouts.length > 0
          ? source.layouts
          : source.layout
            ? [source.layout]
            : ['Rosto+Texto'];
        return {
          layouts,
          layout: source.layout || layouts[0] || 'Rosto+Texto',
          description: source.description || '',
          consistency_rules: source.consistency_rules || '',
        };
      };

      const normalizePersonaMatrix = (source: any = {}, targetPersona: any = {}) => ({
        demographics: source.demographics || targetPersona.audience || '',
        language: source.language || '',
        pain_alignment: source.pain_alignment || targetPersona.pain_point || '',
        desired_outcome: source.desired_outcome || '',
        proof_points: source.proof_points || '',
      });

      const normalizeEditorialLine = (source: any = {}) => ({
        pillars: normalizePillarList(source.pillars),
        positioning_angle: source.positioning_angle || '',
        content_boundaries: source.content_boundaries || '',
      });

      const normalizeNarrativeVoice = (source: any = {}) => ({
        atmosphere: Array.isArray(source.atmosphere) ? source.atmosphere : (source.atmosphere ? [source.atmosphere] : []),
        positioning: source.positioning || '',
      });

      // If the project has a non-UUID id (e.g. the bootstrap 'demo-devzen-project'),
      // generate a proper UUID so Supabase can accept the upsert.
      const rawId = formData.id || (editingProject ? editingProject.id : null);
      const projectId = (rawId && uuidRegex.test(rawId)) ? rawId : crypto.randomUUID();

      // Migrate auxiliary localStorage caches from old non-UUID id to new UUID
      if (rawId && rawId !== projectId) {
        console.log(`[ContentOS] Migrando ID de projeto: ${rawId} → ${projectId}`);
        const prefixes = ['themes_', 'ws_script_execution_', 'ws_narrative_', 'bi_', 'ws_assemblies_'];
        prefixes.forEach((prefix) => {
          const oldKey = `${prefix}${rawId}`;
          const newKey = `${prefix}${projectId}`;
          const data = localStorage.getItem(oldKey);
          if (data) {
            localStorage.setItem(newKey, data);
            localStorage.removeItem(oldKey);
          }
        });
      }
      const normalizedPlaylists = formData.playlists || {
        t1: formData.tactical_journey?.[0]?.value || '',
        t2: formData.tactical_journey?.[1]?.value || '',
        t3: formData.tactical_journey?.[2]?.value || '',
        tactical_journey: normalizeJourney(formData.tactical_journey || [])
      };
      const normalizedSop = normalizeEditingSop(formData.editing_sop || formData.detailed_sop || {});
      const normalizedThumb = normalizeThumbStrategy(formData.thumb_strategy || {});

      const baseProject = editingProject || {};
      const projectData = {
        ...baseProject,
        id: projectId,
        name: formData.name || formData.project_name || 'Canal Sem Nome',
        project_name: formData.name || formData.project_name || 'Canal Sem Nome',
        description: formData.puc || formData.puc_promise || '',
        puc: formData.puc || formData.puc_promise || '',
        puc_promise: formData.puc || formData.puc_promise || '',
        accent_color: formData.accent_color || '#9BB0A5',
        target_persona: formData.target_persona || {
          audience: formData.persona_matrix?.demographics || formData.target_audience || '',
          pain_point: formData.persona_matrix?.pain_alignment || formData.core_pain_point || ''
        },
        ai_engine_rules: formData.ai_engine_rules || {
          metaphors: formData.metaphor_library?.split(',').map((s: string) => s.trim()).filter(Boolean) || [],
          prohibited: formData.prohibited_terms?.split(',').map((s: string) => s.trim()).filter(Boolean) || []
        },
        playlists: normalizedPlaylists,
        phd_strategy: formData.phd_strategy || {},
        persona_matrix: formData.persona_matrix ? normalizePersonaMatrix(formData.persona_matrix, formData.target_persona) : {},
        editorial_line: formData.editorial_line ? normalizeEditorialLine(formData.editorial_line) : {},
        narrative_voice: formData.narrative_voice ? normalizeNarrativeVoice(formData.narrative_voice) : {},
        metaphor_library: formData.metaphor_library || '',
        prohibited_terms: formData.prohibited_terms || '',
        detailed_sop: normalizedSop,
        editing_sop: normalizedSop,
        thumb_strategy: normalizedThumb,
        default_execution_mode: formData.default_execution_mode || baseProject.default_execution_mode || 'internal',
        traceability_summary: formData.traceability_summary || [],
        traceability_sources: formData.traceability_sources || {},
        status: 'active',
        user_id: user?.id || null,
        updated_at: new Date().toISOString()
      };

      console.log("[ContentOS] Dados preparados para salvamento:", projectData);

      const currentProjects = [...projects];
      const index = currentProjects.findIndex(p => p.id === projectData.id);
      if (index !== -1) currentProjects[index] = projectData;
      else currentProjects.push(projectData);

      persistProjectsLocally(currentProjects);
      setProjects(currentProjects);

      setIsModalOpen(false);
      setEditingProject(null);
      setLoading(false);
      console.log("[ContentOS] UI atualizada localmente.");

      if (supabase) {
        console.log("[ContentOS] Sincronizando com Supabase em background...");
        // Timeout guard: if Supabase hangs (no resolve/reject in 8s), treat as
        // a transient failure and queue for the background auto-uploader.
        const upsertWithTimeout = Promise.race([
          supabase.from('projects').upsert(sanitizeProjectCloudPayload(projectData)),
          new Promise<{ error: any }>((resolve) =>
            setTimeout(() => resolve({ error: { message: 'Timeout: Supabase não respondeu em 8s.' } }), 8000)
          ),
        ]);

        upsertWithTimeout.then(({ error }: { error: any }) => {
          if (error) {
            console.warn('⚠️ Supabase Sync Error:', error.message);
            setProjectSyncStatus('error');
            try {
              const pending: string[] = JSON.parse(localStorage.getItem('_pending_project_sync') || '[]');
              if (!pending.includes(projectData.id)) {
                pending.push(projectData.id);
                localStorage.setItem('_pending_project_sync', JSON.stringify(pending));
              }
            } catch {}
          } else {
            console.log("[ContentOS] Sincronização concluída.");
            setProjectSyncStatus('idle');
            try {
              const pending: string[] = JSON.parse(localStorage.getItem('_pending_project_sync') || '[]');
              localStorage.setItem('_pending_project_sync', JSON.stringify(pending.filter((id) => id !== projectData.id)));
            } catch {}
            projectStore.loadProjects();
          }
        });
      }

    } catch (err: any) {
      console.error('❌ Critical Save Failure:', err);
      alert(`Erro ao salvar: ${err.message || 'Erro desconhecido'}`);
      setIsModalOpen(false);
      setLoading(false);
    }
  };  const handleDeleteProject = async () => {
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
      persistProjectsLocally(currentProjects);

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
      persistProjectsLocally(filtered);
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
    const strategicViews = ['themes', 'scripts', 'production', 'analytics', 'library'];
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
        const activeThemes = localStorage.getItem(`themes_${activeProjectId}`) ? JSON.parse(localStorage.getItem(`themes_${activeProjectId}`)!) : [];
        const stats = {
          finished: activeThemes.filter((t: any) => t.status === 'published').length,
          pending: activeThemes.filter((t: any) => ['backlog', 'vetted'].includes(t.status)).length,
          production: activeThemes.filter((t: any) => t.status === 'scripted').length,
          scheduled: activeThemes.filter((t: any) => t.status === 'scheduled').length
        };

        return (
          <div className="animate-in space-y-12">
            {/* 1. Header Forte */}
            <header>
              <h1 className="text-3xl font-extrabold text-white tracking-tight mb-2">
                Bem-vindo ao seu <span className="text-blue-500 italic">Content OS</span>
              </h1>
              <p className="text-slate-400 text-sm font-medium">
                {activeProject 
                  ? `Gerenciando o DNA estratégico de: ${activeProject.project_name || activeProject.name}`
                  : 'Selecione um canal para começar a produzir conteúdo estratégico.'
                }
              </p>
            </header>

            {/* 2. Cards de Resumo */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
              <div className="glass-card flex items-center gap-4 bg-emerald-500/5 border-emerald-500/20">
                <div className="w-12 h-12 bg-emerald-500/10 rounded-full flex items-center justify-center text-emerald-500">
                  <CheckSquare size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white leading-none">{stats.finished}</p>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-1">Fenômenos Publicados</p>
                </div>
              </div>
              <div className="glass-card flex items-center gap-4 bg-blue-500/5 border-blue-500/20">
                <div className="w-12 h-12 bg-blue-500/10 rounded-full flex items-center justify-center text-blue-500">
                  <Lightbulb size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white leading-none">{stats.pending}</p>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-1">Temas Qualificados</p>
                </div>
              </div>
              <div className="glass-card flex items-center gap-4 bg-amber-500/5 border-amber-500/20">
                <div className="w-12 h-12 bg-amber-500/10 rounded-full flex items-center justify-center text-amber-500">
                  <Cpu size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white leading-none">{stats.production}</p>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-1">Scripts em Produção</p>
                </div>
              </div>
              <div className="glass-card flex items-center gap-4 bg-orange-500/5 border-orange-500/20">
                <div className="w-12 h-12 bg-orange-500/10 rounded-full flex items-center justify-center text-orange-400">
                  <Clock size={24} />
                </div>
                <div>
                  <p className="text-2xl font-black text-white leading-none">{stats.scheduled}</p>
                  <p className="text-[10px] uppercase tracking-widest font-bold text-slate-500 mt-1">Posts Programados</p>
                </div>
              </div>
            </div>

            {/* 3. Bloco Principal Form + Dicas */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
              <div className="lg:col-span-3 space-y-6">
                <div className="glass-card">
                  <div className="flex justify-between items-center mb-6">
                    <h3 className="text-sm font-black uppercase tracking-widest text-white/80">Sugerir Novo Tema</h3>
                    {activeProject && (
                      <span className="text-[10px] px-2 py-1 bg-blue-600/10 text-blue-400 rounded-md border border-blue-600/20 font-bold">
                        {activeProject.project_name || activeProject.name}
                      </span>
                    )}
                  </div>
                  
                  <div className="space-y-4">
                    <div className="relative group">
                      <input 
                        type="text" 
                        placeholder="Título provisório do tema..." 
                        className="w-full bg-slate-900/50 border border-slate-700/50 rounded-lg px-4 py-3 text-sm text-white placeholder-slate-500 focus:border-blue-500 outline-none transition-all group-hover:border-slate-600"
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && activeProject) {
                            // Quick Add logic could go here or redirect to ThemeBank
                            setCurrentView('themes');
                          }
                        }}
                      />
                      <button 
                        onClick={() => activeProject ? setCurrentView('themes') : alert('Selecione um canal primeiro')}
                        className="absolute right-2 top-1.5 p-2 bg-blue-600 hover:bg-blue-500 text-white rounded-md transition-all shadow-lg shadow-blue-600/20"
                      >
                        <Plus size={16} />
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Prioridade</p>
                        <p className="text-xs font-semibold text-slate-300">Não definida</p>
                      </div>
                      <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Categoria</p>
                        <p className="text-xs font-semibold text-slate-300">Sem categoria</p>
                      </div>
                      <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-700/30">
                        <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1">Data de Vencimento</p>
                        <p className="text-xs font-semibold text-slate-300">dd/mm/aaaa</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Sidebar de Dicas */}
              <aside className="lg:col-span-1">
                <div className="glass-card h-full bg-blue-600/[0.03]">
                  <h3 className="text-sm font-black uppercase tracking-widest text-white/80 mb-6 flex items-center gap-2">
                    <Sparkles size={16} className="text-blue-500" /> Dicas Estratégicas
                  </h3>
                  <ul className="space-y-4">
                    {[
                      { step: 1, text: "Priorize temas usando a Metaphor Library." },
                      { step: 2, text: "Mantenha o tom 'Sênior no Café' para maior autoridade." },
                      { step: 3, text: "Revise os ganchos Narrativos antes de roteirizar." }
                    ].map(tip => (
                      <li key={tip.step} className="flex gap-3 items-start">
                        <span className="flex-shrink-0 w-5 h-5 bg-blue-600/20 text-blue-400 border border-blue-600/30 rounded-full flex items-center justify-center text-[10px] font-bold">
                          {tip.step}
                        </span>
                        <p className="text-xs text-slate-400 leading-relaxed">{tip.text}</p>
                      </li>
                    ))}
                  </ul>
                </div>
              </aside>
            </div>

            {/* 4. Seção Inferior: Projetos */}
            <section>
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-xl font-bold flex items-center gap-3">
                    <FolderOpen size={20} className="text-blue-500" /> Meus Canais Ativos
                  </h2>
                </div>
                <div className="flex gap-2">
                  <button className="p-2 text-slate-500 hover:text-white transition-all"><Filter size={18} /></button>
                  <button 
                    className="btn-primary" 
                    onClick={() => { setEditingProject(null); setIsModalOpen(true); }}
                  >
                    + Novo Canal
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {projects.map(project => {
                  const isActive = project.id === activeProjectId;
                  const brandColor = project.accent_color || '#3b82f6';
                  
                  return (
                    <div 
                      key={project.id} 
                      className={`glass-card group transition-all duration-300 hover:translate-y-[-4px] cursor-pointer relative overflow-hidden ${
                        isActive ? 'ring-2 ring-blue-500/50 shadow-2xl shadow-blue-500/10' : 'hover:border-slate-600'
                      }`} 
                      onClick={() => {
                        setActiveProjectId(project.id);
                        setCurrentView('themes');
                      }}
                    >
                      <div className="flex justify-between items-start mb-4">
                        <div className={`px-2 py-0.5 rounded text-[8px] font-bold uppercase tracking-widest ${
                          isActive ? 'bg-blue-500 text-white' : 'bg-slate-800 text-slate-500'
                        }`}>
                          {isActive ? 'Selecionado' : 'Ativo'}
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            className="p-1.5 hover:bg-slate-800 rounded-md text-slate-400 hover:text-white transition-all"
                            onClick={(e) => { 
                              e.stopPropagation();
                              setEditingProject(project); 
                              setIsModalOpen(true); 
                            }}
                          >
                            <Settings size={14} />
                          </button>
                        </div>
                      </div>
                      
                      <h4 className="text-lg font-bold mb-2 text-white group-hover:text-blue-400 transition-colors">
                        {project.project_name || project.name || 'Canal Sem Nome'}
                      </h4>
                      <p className="text-xs text-slate-500 line-clamp-2 mb-6 leading-relaxed">
                        {project.puc_promise || project.description || 'Nenhuma promessa estratégica definida.'}
                      </p>

                      <div className="flex items-center justify-between mt-auto pt-4 border-t border-slate-800/50">
                        <div className="flex items-center gap-2">
                           <div className="w-2 h-2 rounded-full" style={{ backgroundColor: brandColor }} />
                           <span className="text-[10px] uppercase tracking-widest font-black text-slate-500">{project.visual_style || 'Default'}</span>
                        </div>
                        <ChevronRight size={16} className="text-slate-700 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  );
                })}
              </div>
              
              {projects.length === 0 && (
                <div className="py-24 text-center glass-card border-dashed border-slate-800 bg-transparent flex flex-col items-center gap-4">
                  <FolderOpen size={48} className="text-slate-800" />
                  <p className="text-sm font-bold text-slate-600 uppercase tracking-widest">Nenhuma instância configurada</p>
                  <button 
                    className="mt-2 text-blue-500 hover:text-blue-400 text-xs font-black uppercase tracking-[0.2em]"
                    onClick={() => setIsModalOpen(true)}
                  >
                    Clique aqui para começar +
                  </button>
                </div>
              )}
            </section>

            {showSettings && (
              <section className="glass-card p-12 mt-10 animate-in slide-in-from-top-4 border-blue-500/10 bg-blue-500/[0.02]">
                <div className="flex items-center gap-3 mb-10">
                  <div className="p-3 bg-blue-500/10 rounded-2xl border border-blue-500/20">
                    <Settings className="text-blue-400" size={24} />
                  </div>
                  <h3 className="text-xl font-black text-white italic uppercase tracking-widest">Configurações de Engine Global</h3>
                </div>
                <div className="flex flex-col gap-12">
                  <EngineSelector />
                  <div className="h-px bg-white/5" />
                  <ApiKeyManager />
                  <div className="h-px bg-white/5" />
                  
                  {/* Sync & Cloud Migration Section */}
                  <div>
                    <div className="flex items-center gap-2 mb-4">
                      <CloudSync className="text-blue-400" size={18} />
                      <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-white/40">Gestão de Dados & Sync</h4>
                    </div>
                    <div className="flex gap-4">
                        <button 
                          onClick={handleExport}
                          className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-white/40 hover:text-white group"
                          title="Exportar Projetos (Backup JSON)"
                        >
                          <Download size={20} className="group-hover:text-blue-400 transition-colors" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Exportar Backup</span>
                        </button>
                        
                        <label 
                          className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-white/40 hover:text-white group cursor-pointer"
                          title="Importar Projetos (JSON)"
                        >
                          <Upload size={20} className="group-hover:text-blue-400 transition-colors" />
                          <span className="text-[10px] font-black uppercase tracking-widest">Importar JSON</span>
                          <input type="file" className="hidden" accept=".json" onChange={handleImport} />
                        </label>
                        
                        <button 
                          onClick={handleSyncToCloud}
                          disabled={isSyncingCloud}
                          className="flex-1 flex items-center justify-center gap-3 p-4 rounded-2xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 transition-all text-white/40 hover:text-white group disabled:opacity-50 disabled:cursor-wait"
                          title="Sincronizar Local com Nuvem"
                        >
                          <Database size={20} className="group-hover:text-blue-400 transition-colors" />
                          <span className="text-[10px] font-black uppercase tracking-widest">
                            {isSyncingCloud ? 'Sincronizando...' : 'Sincronizar Nuvem'}
                          </span>
                        </button>
                    </div>
                    <p className="mt-4 text-[10px] text-white/20 uppercase tracking-widest leading-relaxed">
                      Use estas ferramentas para migrar dados entre ambiente Local e Produção ou para garantir persistência global no Supabase.
                    </p>
                  </div>
                </div>
              </section>
            )}
          </div>
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
                        className={`text-xs font-black uppercase tracking-widest transition-all ${isActive ? 'text-blue-400 cursor-default' : 'text-white/20 hover:text-white'}`}
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
                        className="text-xs font-black uppercase tracking-widest text-blue-500/60 hover:text-blue-400"
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
        case 'themes':
          return <ThemeBank 
            activeProject={activeProject} 
            userId={user?.id} 
            selectedAIConfig={activeAIConfig}
            onGerarRoteiro={handleGerarRoteiro}
            onOpenInWriting={(theme) => {
              setPendingScript(theme ?? null);
              setCurrentView('scripts');
            }}
          />;
        case 'scripts':
          return <ScriptEngine 
            activeProject={activeProject} 
            pendingData={pendingScript}
            onClearPending={() => setPendingScript(null)}
          />;
        case 'library':
          return <NarrativeLibrary activeProject={activeProject} />;
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

  // 🛡️ Tela de Erro Amigável se faltar Configuração na Vercel
  if (!supabase) {
    return (
      <div className="fixed inset-0 z-[12000] flex items-center justify-center bg-midnight">
        <div className="glass-card max-w-md p-10 border-yellow-500/20 text-center space-y-6">
          <div className="w-16 h-16 bg-yellow-500/10 border border-yellow-500/20 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="text-yellow-500" size={24} />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-black text-white italic uppercase">Configuração Necessária</h1>
            <p className="text-white/40 text-[10px] uppercase tracking-widest font-black leading-relaxed">
              As Variáveis de Ambiente (Supabase Keys) não foram encontradas na Vercel.
            </p>
          </div>
          <div className="pt-4">
            <p className="text-[10px] text-white/20 font-bold uppercase">Consulte o log do console para detalhes.</p>
          </div>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-midnight flex items-center justify-center">
        <div className="flex flex-col items-center gap-6">
          <div className="w-12 h-12 border-4 border-blue-500/20 border-t-blue-500 animate-spin rounded-full shadow-[0_0_15px_rgba(59,130,246,0.2)]" />
          <div className="text-center space-y-2">
            <span className="text-[10px] font-black text-white/40 uppercase tracking-[0.3em] block">Carregando Channel OS...</span>
            <button 
              onClick={() => setLoading(false)}
              className="text-[9px] font-black text-white/10 hover:text-white/40 uppercase tracking-widest transition-all pt-4"
            >
              [ Forçar Entrada ]
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (ENFORCE_AUTH) {
    if (!user) {
      return <AuthOverlay />;
    }

    if (!isMasterUser && (!effectiveProfile || effectiveProfile.status !== 'approved')) {
      return <AwaitingApproval email={user.email!} />;
    }

    if (dbSetupRequired) {
      return (
        <div className="fixed inset-0 z-[11000] flex items-center justify-center bg-midnight/98 backdrop-blur-3xl">
          <div className="glass-card max-w-2xl p-12 border-red-500/20 text-center space-y-8">
            <div className="w-20 h-20 bg-red-500/10 border border-red-500/20 rounded-full flex items-center justify-center mx-auto">
              <Database className="text-red-500" size={32} />
            </div>
            <div className="space-y-2">
              <h1 className="text-2xl font-black text-white italic">SETUP DE BANCO REQUERIDO</h1>
              <p className="text-white/40 text-xs uppercase tracking-widest font-black">A infraestrutura master ainda não foi ativada na nuvem.</p>
            </div>
            <div className="p-6 bg-white/5 border border-white/10 rounded-2xl text-left">
              <p className="text-[10px] font-black text-sage uppercase tracking-widest mb-4">Instruções de Inicialização:</p>
              <ol className="space-y-3 text-[11px] text-white/60 font-bold uppercase tracking-tight">
                <li className="flex gap-3"><span className="text-white/20">01.</span> Acesse seu Painel do Supabase.com</li>
                <li className="flex gap-3"><span className="text-white/20">02.</span> Vá em 'SQL Editor' (ícone de terminal) no menu lateral.</li>
                <li className="flex gap-3"><span className="text-white/20">03.</span> Clique em '+ New query'.</li>
                <li className="flex gap-3"><span className="text-white/20">04.</span> Copie o conteúdo do arquivo <code className="text-sage">migration_profiles.sql</code> e cole lá.</li>
                <li className="flex gap-3"><span className="text-white/20">05.</span> Clique no botão verde 'RUN' e recarregue esta página.</li>
              </ol>
            </div>
          </div>
        </div>
      );
    }
  }

  return (
    <main 
      className={`dashboard-container min-h-screen bg-midnight text-white flex overflow-hidden font-sans ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}
      style={{ 
        '--accent-color': activeProject?.accent_color || '#9BB0A5',
        '--accent-color-glow': `${activeProject?.accent_color || '#9BB0A5'}15`
      } as React.CSSProperties}
    >
      <Sidebar 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        onResetProject={() => {
          setActiveProjectId(null);
          setCurrentView('home');
        }}
        userRole={!ENFORCE_AUTH ? 'admin' : isMasterUser ? 'admin' : 'user'}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />
      
      <main className="main-content">
        <header className="header flex justify-between items-center px-12 py-6 bg-midnight/60 backdrop-blur-2xl border-b border-white/5 sticky top-0 z-20">
          <div className="flex items-center gap-8">
            <h2 className="text-[11px] font-black uppercase tracking-[4px] text-white/30">
              {currentView === 'home' ? 'Global Command' : activeProject ? `Instância: ${activeProject.project_name || activeProject.name}` : 'Aguardando Seleção'}
            </h2>
            {activeProject && (
              <div className="flex items-center gap-2.5 px-4 py-1.5 bg-blue-500/5 rounded-full border border-blue-500/10 animate-in fade-in slide-in-from-left-4 duration-700">
                <div className="w-2 h-2 rounded-full bg-blue-500 shadow-[0_0_12px_rgba(59,130,246,0.5)]" />
                <span className="text-[10px] font-black text-blue-400 uppercase tracking-[0.1em] leading-none">Scoping Ativo</span>
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
              <div className="flex items-center gap-3 bg-white/5 px-4 py-2.5 rounded-2xl border border-white/5 hover:border-blue-500/30 hover:bg-blue-500/10 transition-all cursor-pointer group">
                <Sparkles size={16} className="text-blue-400" />
                <span className="text-[11px] font-black uppercase tracking-widest text-white/80">
                  {activeAIConfig.model}
                </span>
                <ChevronRight size={14} className="rotate-90 text-white/20 group-hover:text-blue-400 transition-all" />
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left ${activeAIConfig.model === m.id ? 'bg-blue-500/10 text-blue-400' : 'text-white/40'}`}
                    >
                      <span className="text-[10px] font-bold uppercase">{m.id}</span>
                      {activeAIConfig.model === m.id && <div className="w-1 h-1 rounded-full bg-blue-400" />}
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
                      className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl hover:bg-white/5 transition-all text-left ${activeAIConfig.model === m.id ? 'bg-blue-500/10 text-blue-400' : 'text-white/40'}`}
                    >
                      <span className="text-[10px] font-bold uppercase">{m.id}</span>
                      {activeAIConfig.model === m.id && <div className="w-1 h-1 rounded-full bg-blue-400" />}
                    </button>
                  ))}
                </div>
              </div>
            </div>



            <button 
              onClick={() => setShowSettings(!showSettings)}
              className={`p-3 rounded-2xl border transition-all duration-500 ${showSettings ? 'bg-blue-600/10 border-blue-600/30 text-blue-400 shadow-[0_0_20px_rgba(37,99,235,0.1)]' : 'bg-white/5 border-white/5 text-white/20 hover:text-white hover:border-white/10'}`}
              title="Ajustes Globais"
            >
              <Settings size={22} />
            </button>
            <div className={`flex items-center gap-4 px-5 py-2.5 rounded-2xl border shadow-inner transition-all duration-500 ${
              projectSyncStatus === 'error'
                ? 'bg-red-950/50 border-red-800/50'
                : 'bg-slate-900/50 border-slate-800/50'
            }`}>
              <div className={`w-2 h-2 rounded-full ${
                projectSyncStatus === 'error'
                  ? 'bg-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]'
                  : 'bg-blue-500 animate-pulse shadow-[0_0_8px_rgba(59,130,246,0.5)]'
              }`} />
              <span className={`text-[10px] font-black uppercase tracking-[3px] ${
                projectSyncStatus === 'error' ? 'text-red-400' : 'text-slate-500'
              }`}>
                {projectSyncStatus === 'error' ? 'Sync Pendente' : 'Status: • Online'}
              </span>
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
          existingProjects={projects}
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

