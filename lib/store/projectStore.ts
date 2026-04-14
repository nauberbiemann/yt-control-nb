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
        const projectList = projects || [];
        const activeId = get().activeProjectId;
        const activeProject = activeId
          ? (projectList.find((p: any) => p.id === activeId) || null)
          : null;
        writeLocalProjectCaches(projectList);
        set({ projects: projectList, activeProject, projectsLoaded: true });
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
            const mergedProjects = [...mergedRemote, ...localOnly];

            get().setProjects(mergedProjects);
          } else {
            // Cloud empty → use local cache
            get().setProjects(localProjects);
          }
        } catch (err) {
          console.error('[ProjectStore] Failed to load projects:', err);
          const localProjects = readLocalProjectCaches();
          get().setProjects(localProjects);
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
