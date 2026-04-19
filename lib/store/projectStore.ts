import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

const PROJECTS_STORAGE_KEY = 'writer_studio_projects';
const PROJECTS_BACKUP_STORAGE_KEY = 'writer_studio_projects_backup';
const PROJECTS_ARCHIVE_STORAGE_KEY = 'writer_studio_projects_archive';

export interface Project {
  id: string;
  name?: string;
  project_name?: string;
  puc?: string;
  accent_color?: string;
  primary_color?: string;
  persona_matrix?: any;
  metaphor_library?: string;
  prohibited_terms?: string;
  base_system_instruction?: string;
  playlists?: any;
  editing_sop?: any;
  ai_engine_rules?: any;
  [key: string]: any;
}

interface ProjectStore {
  // State
  activeProjectId: string | null;
  activeProject: Project | null;
  projects: Project[];
  projectsLoaded: boolean;

  // Actions
  setActiveProject: (id: string | null) => void;
  setProjects: (projects: Project[]) => void;
  loadProjects: () => Promise<void>;
  clearProject: () => void;
  getActiveProject: () => Project | null;
}

const hasMeaningfulValue = (value: unknown) =>
  value !== undefined && value !== null && value !== '';

const isPlainObject = (value: unknown): value is Record<string, any> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const mergeProjectRecords = (local: any, remote: any): any => {
  if (!isPlainObject(local) || !isPlainObject(remote)) {
    return hasMeaningfulValue(remote) ? remote : local;
  }

  const merged: Record<string, any> = { ...local };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  keys.forEach((key) => {
    const localValue = local[key];
    const remoteValue = remote[key];

    if (Array.isArray(localValue) || Array.isArray(remoteValue)) {
      merged[key] = Array.isArray(remoteValue) && remoteValue.length > 0
        ? remoteValue
        : localValue ?? remoteValue ?? [];
      return;
    }

    if (isPlainObject(localValue) && isPlainObject(remoteValue)) {
      merged[key] = mergeProjectRecords(localValue, remoteValue);
      return;
    }

    merged[key] = hasMeaningfulValue(remoteValue) ? remoteValue : localValue;
  });

  return merged;
};

const parseProjectCache = (raw: string | null): Project[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const readJsonCache = (key: string) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const hasUsefulCachePayload = (value: unknown) => {
  if (Array.isArray(value)) return value.length > 0;
  if (isPlainObject(value)) return Object.keys(value).length > 0;
  return typeof value === 'string' && value.trim().length > 0;
};

const AUXILIARY_PROJECT_PREFIXES = ['themes_', 'ws_script_execution_', 'ws_narrative_', 'bi_'];

const mergeProjectCollections = (primary: Project[], secondary: Project[]) => {
  const merged = new Map<string, Project>();

  [...primary, ...secondary].forEach((project) => {
    if (!project?.id) return;
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecords(existing, project) : project);
  });

  return Array.from(merged.values());
};

const mergeArrayCache = (target: unknown, source: unknown) => {
  const targetArray = Array.isArray(target) ? target : [];
  const sourceArray = Array.isArray(source) ? source : [];
  const merged = new Map<string, any>();

  [...targetArray, ...sourceArray].forEach((item, index) => {
    const key = item?.id || item?.title || item?.name || `${index}`;
    const existing = merged.get(key);
    merged.set(key, existing ? mergeProjectRecords(existing, item) : item);
  });

  return Array.from(merged.values());
};

const repairBootstrapAuxiliaryCaches = (sourceProjectId: string) => {
  if (!sourceProjectId || sourceProjectId === BOOTSTRAP_PROJECT_ID) return;

  AUXILIARY_PROJECT_PREFIXES.forEach((prefix) => {
    const sourceKey = `${prefix}${sourceProjectId}`;
    const targetKey = `${prefix}${BOOTSTRAP_PROJECT_ID}`;
    const sourceRaw = localStorage.getItem(sourceKey);
    if (!sourceRaw) return;

    if (prefix === 'ws_script_execution_') {
      const source = readJsonCache(sourceKey);
      const target = readJsonCache(targetKey);
      const sourceScore = getProjectRecoveryScore(sourceProjectId);
      const targetScore = getProjectRecoveryScore(BOOTSTRAP_PROJECT_ID);

      if (!target || sourceScore > targetScore) {
        localStorage.setItem(targetKey, sourceRaw);
      }
      return;
    }

    const source = readJsonCache(sourceKey);
    const target = readJsonCache(targetKey);

    if (Array.isArray(source)) {
      localStorage.setItem(targetKey, JSON.stringify(mergeArrayCache(target, source)));
      return;
    }

    if (!hasUsefulCachePayload(target)) {
      localStorage.setItem(targetKey, sourceRaw);
    }
  });
};

const inferRecoveredProjectName = (projectId: string) => {
  const execution = readJsonCache(`ws_script_execution_${projectId}`);
  const themes = readJsonCache(`themes_${projectId}`);
  const firstTheme = Array.isArray(themes) ? themes.find(Boolean) : null;
  const title = execution?.approvedBriefing?.projectName ||
    execution?.approvedBriefing?.project_name ||
    execution?.approvedBriefing?.channelName ||
    firstTheme?.project_name ||
    firstTheme?.channel_name;

  if (typeof title === 'string' && title.trim()) return title.trim();
  if (projectId === BOOTSTRAP_PROJECT_ID || projectId.toLowerCase().includes('devzen')) return 'DevZen';
  return `Projeto recuperado ${projectId.slice(0, 6)}`;
};

const getPersistedActiveProjectId = () => {
  const persisted = readJsonCache('content_os_active_project');
  return persisted?.state?.activeProjectId || persisted?.activeProjectId || null;
};

const getProjectRecoveryScore = (projectId: string) => {
  const execution = readJsonCache(`ws_script_execution_${projectId}`);
  const themes = readJsonCache(`themes_${projectId}`);
  const narrative = readJsonCache(`ws_narrative_${projectId}`);
  const bi = readJsonCache(`bi_${projectId}`);
  const persistedActiveProjectId = getPersistedActiveProjectId();

  let score = projectId === persistedActiveProjectId ? 1000 : 0;

  if (execution?.approvedBriefing) score += 120;
  if (Array.isArray(execution?.scriptBlocks)) score += execution.scriptBlocks.length * 60;
  if (typeof execution?.externalScriptText === 'string' && execution.externalScriptText.trim()) score += 250;
  if (typeof execution?.externalSrtText === 'string' && execution.externalSrtText.trim()) score += 80;
  if (execution?.externalSrtPipeline) score += 80;
  if (execution?.postScriptPackage) score += 80;

  if (Array.isArray(themes)) {
    score += themes.length * 25;
    if (themes.some((theme) => theme?.production_assets?.execution_snapshot)) score += 300;
    if (themes.some((theme) => theme?.production_assets?.source === 'script_engine_manual_approval')) score += 120;
  }

  if (Array.isArray(narrative)) score += narrative.length * 8;
  if (Array.isArray(bi)) score += bi.length * 8;

  return score;
};

const recoverProjectsFromAuxiliaryCaches = (): Project[] => {
  try {
    const ids = new Set<string>();
    for (let index = 0; index < localStorage.length; index += 1) {
      const key = localStorage.key(index) || '';
      const prefix = AUXILIARY_PROJECT_PREFIXES.find((item) => key.startsWith(item));
      if (!prefix) continue;

      const projectId = key.slice(prefix.length);
      if (!projectId) continue;

      const payload = prefix === 'ws_script_execution_'
        ? localStorage.getItem(key)
        : readJsonCache(key);

      if (hasUsefulCachePayload(payload)) {
        ids.add(projectId);
      }
    }

    const candidates = Array.from(ids).map((projectId) => {
      const base = projectId === BOOTSTRAP_PROJECT_ID || projectId.toLowerCase().includes('devzen')
        ? createBootstrapProject()
        : {
            ...createBootstrapProject(),
            is_bootstrap_project: false,
            visual_style: 'Recovered',
          };

      const name = inferRecoveredProjectName(projectId);
      return {
        ...base,
        id: projectId,
        name,
        project_name: name,
        is_recovered_project: true,
        recovery_score: getProjectRecoveryScore(projectId),
      };
    });

    return candidates
      .filter((project) => Number(project.recovery_score || 0) > 0)
      .sort((a, b) => Number(b.recovery_score || 0) - Number(a.recovery_score || 0))
      .slice(0, 1)
      .map((project) => ({
        ...project,
        name: project.name?.startsWith('Projeto recuperado') ? 'DevZen recuperado' : project.name,
        project_name: project.project_name?.startsWith('Projeto recuperado') ? 'DevZen recuperado' : project.project_name,
      }));
  } catch {
    return [];
  }
};

const readArchivedProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(PROJECTS_ARCHIVE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    return parsed.reduce((acc: Project[], snapshot: any) => {
      if (!Array.isArray(snapshot?.projects) || snapshot.projects.length === 0) return acc;
      return mergeProjectCollections(acc, snapshot.projects);
    }, []);
  } catch {
    return [];
  }
};

const readLocalProjectCaches = () => {
  const primary = parseProjectCache(localStorage.getItem(PROJECTS_STORAGE_KEY));
  const backup = parseProjectCache(localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY));
  const archived = readArchivedProjects();
  const recovered = recoverProjectsFromAuxiliaryCaches();
  const bestRecovered = recovered[0];

  if (
    bestRecovered?.id &&
    bestRecovered.id !== BOOTSTRAP_PROJECT_ID &&
    Number(bestRecovered.recovery_score || 0) > getProjectRecoveryScore(BOOTSTRAP_PROJECT_ID)
  ) {
    repairBootstrapAuxiliaryCaches(bestRecovered.id);
  }

  const repairedPrimary = parseProjectCache(localStorage.getItem(PROJECTS_STORAGE_KEY));
  const repairedBackup = parseProjectCache(localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY));
  const repairedRecovered = recoverProjectsFromAuxiliaryCaches();
  const bestAfterRepair = repairedRecovered[0];
  const shouldKeepRecoveredCard =
    bestAfterRepair?.id &&
    bestAfterRepair.id !== BOOTSTRAP_PROJECT_ID &&
    getProjectRecoveryScore(bestAfterRepair.id) > getProjectRecoveryScore(BOOTSTRAP_PROJECT_ID);
  const stablePrimary = repairedPrimary.filter((project) => !project.is_recovered_project);
  const stableBackup = repairedBackup.filter((project) => !project.is_recovered_project);
  const stableArchived = archived.filter((project) => !project.is_recovered_project);

  return mergeProjectCollections(
    mergeProjectCollections(mergeProjectCollections(stablePrimary, stableBackup), stableArchived),
    shouldKeepRecoveredCard ? [bestAfterRepair] : []
  );
};

const writeLocalProjectCaches = (projects: Project[]) => {
  const safeProjects = Array.isArray(projects) && projects.length > 0 ? projects : [createBootstrapProject()];
  const hasOnlySyntheticBootstrap =
    safeProjects.length === 1 &&
    isBootstrapProject(safeProjects[0]) &&
    !localStorage.getItem(PROJECTS_STORAGE_KEY) &&
    !localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY) &&
    !localStorage.getItem(PROJECTS_ARCHIVE_STORAGE_KEY);

  const payload = JSON.stringify(safeProjects);
  localStorage.setItem(PROJECTS_STORAGE_KEY, payload);
  localStorage.setItem(PROJECTS_BACKUP_STORAGE_KEY, payload);

  if (hasOnlySyntheticBootstrap) return;

  try {
    const currentArchive = JSON.parse(localStorage.getItem(PROJECTS_ARCHIVE_STORAGE_KEY) || '[]');
    const archive = Array.isArray(currentArchive) ? currentArchive : [];
    const lastSnapshot = archive[0];
    const isSameAsLast = lastSnapshot && JSON.stringify(lastSnapshot.projects || []) === payload;

    if (!isSameAsLast) {
      const nextArchive = [
        { saved_at: new Date().toISOString(), projects: projects || [] },
        ...archive,
      ].slice(0, 15);

      localStorage.setItem(PROJECTS_ARCHIVE_STORAGE_KEY, JSON.stringify(nextArchive));
    }
  } catch {
    // Ignore archive write failures and keep main/backup keys working
  }
};

const BOOTSTRAP_PROJECT_ID = 'demo-devzen-project';

export const isBootstrapProject = (project: Project | null | undefined) =>
  project?.id === BOOTSTRAP_PROJECT_ID || project?.is_bootstrap_project === true;

const isDevZenLikeProject = (project: Project | null | undefined) => {
  const label = `${project?.project_name || ''} ${project?.name || ''}`.toLowerCase();
  return label.includes('devzen');
};

const createBootstrapProject = (): Project => ({
  id: BOOTSTRAP_PROJECT_ID,
  name: 'DevZen',
  project_name: 'DevZen',
  puc: 'O diferencial imbatível: transformar desenvolvedores sêniores em arquitetos do próprio estilo de vida.',
  puc_promise: 'O diferencial imbatível: transformar desenvolvedores sêniores em arquitetos do próprio estilo de vida.',
  description: 'Projeto exemplo do Content OS para validar a jornada editorial e o fluxo de escrita.',
  accent_color: '#3b82f6',
  primary_color: '#3b82f6',
  status: 'active',
  visual_style: 'Cinematic',
  default_execution_mode: 'internal',
  is_bootstrap_project: true,
  persona_matrix: {
    demographics: 'Desenvolvedor Sênior ou Arquiteto de Software',
    language: 'Técnica, pragmática e cética',
    pain_alignment: 'Sensação de thermal throttling mental e risco de burnout',
    desired_outcome: 'Recuperar foco, energia e previsibilidade operacional',
    proof_points: 'Alta renda, trabalho remoto, setup de alta performance'
  },
  target_persona: {
    audience: 'Desenvolvedor Sênior ou Arquiteto de Software',
    pain_point: 'Sensação de thermal throttling mental e risco de burnout'
  },
  metaphor_library: 'Memory Leak de Atenção, Dívida Técnica Biológica, Thermal Throttling Mental',
  prohibited_terms: '',
  ai_engine_rules: {
    metaphors: ['Memory Leak de Atenção', 'Dívida Técnica Biológica', 'Thermal Throttling Mental'],
    prohibited: []
  },
  playlists: {
    t1: 'Topo de Funil',
    t2: 'Meio de Funil',
    t3: 'Fundo de Funil',
    tactical_journey: [
      { id: 't1', label: 'T1', title: 'Topo de Funil', value: 'Atrair atenção com dor clara', isFixed: true },
      { id: 't2', label: 'T2', title: 'Meio de Funil', value: 'Aprofundar com mecanismo e prova', isFixed: true },
      { id: 't3', label: 'T3', title: 'Fundo de Funil', value: 'Converter com convite e confiança', isFixed: true },
    ],
  },
  editing_sop: {
    cut_rhythm: '3s',
    zoom_style: 'Dynamic',
    soundtrack: 'Epic',
    art_direction: 'Dark Navy',
    overlays: 'Technical text overlays',
    duration: '18 min',
    duration_min: 18,
    duration_max: 20,
    blocks_variation: '12',
    blocks_min: 12,
    blocks_max: 13,
    asset_types: ['Hook', 'CTA', 'Structure'],
    measurement_focus: 'Retention, focus time and conversion readiness',
  },
  traceability_summary: [],
  traceability_sources: {},
});

const normalizeProjectList = (projects: Project[]) => {
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  const recoveredProjects = list
    .filter((project) => project.is_recovered_project)
    .sort((a, b) => Number(b.recovery_score || getProjectRecoveryScore(b.id)) - Number(a.recovery_score || getProjectRecoveryScore(a.id)))
    .slice(0, 1);
  const listWithoutRecovered = list.filter((project) => !project.is_recovered_project);
  const normalizedList = [...recoveredProjects, ...listWithoutRecovered];
  const withoutBootstrap = normalizedList.filter((project) => !isBootstrapProject(project));
  const bootstrapProject = normalizedList.find((project) => isBootstrapProject(project));

  if (recoveredProjects.length > 0) {
    return [
      ...recoveredProjects,
      ...withoutBootstrap.filter((project) => !project.is_recovered_project),
    ];
  }

  if (withoutBootstrap.some(isDevZenLikeProject)) {
    return withoutBootstrap;
  }

  if (withoutBootstrap.length > 0 && !bootstrapProject) {
    return withoutBootstrap;
  }

  return [
    bootstrapProject || createBootstrapProject(),
    ...withoutBootstrap,
  ];
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      activeProjectId: null,
      activeProject: null,
      projects: [createBootstrapProject()],
      projectsLoaded: false,

      setActiveProject: (id) => {
        const projects = get().projects;
        const project = id ? (projects.find((p) => p.id === id) || null) : null;
        set({ activeProjectId: id, activeProject: project });
      },

        setProjects: (projects) => {
          const projectList = normalizeProjectList(projects || []);
          const activeId = get().activeProjectId;
          const activeProject = activeId
            ? (projectList.find((p: any) => p.id === activeId) || projectList[0] || null)
            : (projectList[0] || null);
        const activeProjectId = activeProject?.id || null;
        writeLocalProjectCaches(projectList);
        set({ projects: projectList, activeProjectId, activeProject, projectsLoaded: true });
      },

      loadProjects: async () => {
        try {
          const localProjects = readLocalProjectCaches();
          const fallbackProjects = localProjects.length > 0 ? localProjects : [createBootstrapProject()];

          if (!supabase) {
            // LocalStorage fallback (no internet / no Supabase configured)
            get().setProjects(fallbackProjects);
            return;
          }

          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (data && data.length > 0) {
            // ☁️ CLOUD-WINS with local strategic field merge.
            // Supabase is authoritative for its own columns, but fields like
            // phd_strategy, persona_matrix, editorial_line, narrative_voice and
            // thumb_strategy are NOT in the DB schema (no ALTER TABLE migration).
            // We must rescue those fields from the local cache so the user
            // never loses strategic DNA data after a page reload.
            const LOCAL_ONLY_FIELDS = [
              'phd_strategy',
              'persona_matrix',
              'editorial_line',
              'narrative_voice',
              'thumb_strategy',
            ] as const;

            const localById = new Map(localProjects.map((p) => [p.id, p]));

            const mergedCloudProjects = (data as Project[]).map((cloudProject) => {
              const localProject = localById.get(cloudProject.id);
              if (!localProject) return cloudProject;

              // For each local-only field, use the local value if the cloud
              // record doesn't have a meaningful value for it.
              const rescued: Partial<Project> = {};
              for (const field of LOCAL_ONLY_FIELDS) {
                const cloudVal = (cloudProject as any)[field];
                const localVal = (localProject as any)[field];
                const cloudEmpty =
                  cloudVal === null ||
                  cloudVal === undefined ||
                  (typeof cloudVal === 'object' && Object.keys(cloudVal || {}).length === 0);
                if (cloudEmpty && localVal && Object.keys(localVal).length > 0) {
                  (rescued as any)[field] = localVal;
                }
              }
              return Object.keys(rescued).length > 0
                ? { ...cloudProject, ...rescued }
                : cloudProject;
            });

            const remoteIds = new Set(data.map((p: Project) => p.id));
            const localOnly = localProjects.filter((p) => !remoteIds.has(p.id));
            const finalProjects = normalizeProjectList([...mergedCloudProjects, ...localOnly]);

            console.log(`[ProjectStore] ☁️ Cloud-wins+local-rescue: ${data.length} from cloud, ${localOnly.length} local-only`);
            get().setProjects(finalProjects);
          } else {
            // Cloud empty → use local cache as fallback
            console.log('[ProjectStore] Cloud empty, using local cache');
            get().setProjects(fallbackProjects);
          }
        } catch (err) {
          console.error('[ProjectStore] Failed to load projects:', err);
          const localProjects = readLocalProjectCaches();
          const fallbackProjects = localProjects.length > 0 ? localProjects : [createBootstrapProject()];
          get().setProjects(fallbackProjects);
        }
      },

      clearProject: () => {
        set({ activeProjectId: null, activeProject: null });
      },

      getActiveProject: () => get().activeProject,
    }),
    {
      name: 'content_os_active_project', // localStorage key
      partialize: (state) => ({
        activeProjectId: state.activeProjectId,
      }),
    }
  )
);

// ─── Typed selectors for performance ────────────────────────────────────────
export const useActiveProject = () => useProjectStore((s) => s.activeProject);
export const useActiveProjectId = () => useProjectStore((s) => s.activeProjectId);
export const useProjects = () => useProjectStore((s) => s.projects);
