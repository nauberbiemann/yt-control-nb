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

const mergeProjectCollections = (primary: Project[], secondary: Project[]) => {
  const merged = new Map<string, Project>();

  [...primary, ...secondary].forEach((project) => {
    if (!project?.id) return;
    const existing = merged.get(project.id);
    merged.set(project.id, existing ? mergeProjectRecords(existing, project) : project);
  });

  return Array.from(merged.values());
};

const readArchivedProjects = (): Project[] => {
  try {
    const raw = localStorage.getItem(PROJECTS_ARCHIVE_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    const latestSnapshot = parsed.find((snapshot) => Array.isArray(snapshot?.projects) && snapshot.projects.length > 0);
    return latestSnapshot?.projects || [];
  } catch {
    return [];
  }
};

const readLocalProjectCaches = () => {
  const primary = parseProjectCache(localStorage.getItem(PROJECTS_STORAGE_KEY));
  const backup = parseProjectCache(localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY));
  const archived = readArchivedProjects();
  return mergeProjectCollections(mergeProjectCollections(primary, backup), archived);
};

const writeLocalProjectCaches = (projects: Project[]) => {
  const payload = JSON.stringify(projects || []);
  localStorage.setItem(PROJECTS_STORAGE_KEY, payload);
  localStorage.setItem(PROJECTS_BACKUP_STORAGE_KEY, payload);

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
  const withoutBootstrap = list.filter((project) => !isBootstrapProject(project));

  if (withoutBootstrap.length > 0) {
    return withoutBootstrap;
  }

  const bootstrapProject = list.find((project) => isBootstrapProject(project));
  return [bootstrapProject || createBootstrapProject()];
};

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      activeProjectId: null,
      activeProject: null,
      projects: [],
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

          if (!supabase) {
            // LocalStorage fallback
            get().setProjects(localProjects);
            return;
          }

          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (data && data.length > 0) {
            const localById = new Map(localProjects.map((project) => [project.id, project]));
            const remoteIds = new Set<string>();
            const remoteProjects = data as Project[];

            const mergedRemote = remoteProjects.map((project: Project) => {
              remoteIds.add(project.id);
              const localProject = localById.get(project.id);
              return localProject ? mergeProjectRecords(localProject, project) : project;
            });

            const localOnly = localProjects.filter((project) => !remoteIds.has(project.id));
              const mergedProjects = normalizeProjectList([...mergedRemote, ...localOnly]);

            get().setProjects(mergedProjects);
          } else {
            // Cloud empty → use local cache
            if (localProjects.length > 0) {
              get().setProjects(localProjects);
            } else {
              const bootstrapProject = createBootstrapProject();
              get().setProjects([bootstrapProject]);
              get().setActiveProject(bootstrapProject.id);
            }
          }
        } catch (err) {
          console.error('[ProjectStore] Failed to load projects:', err);
          const localProjects = readLocalProjectCaches();
          if (localProjects.length > 0) {
            get().setProjects(localProjects);
          } else {
            const bootstrapProject = createBootstrapProject();
            get().setProjects([bootstrapProject]);
            get().setActiveProject(bootstrapProject.id);
          }
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
