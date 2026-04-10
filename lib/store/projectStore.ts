import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';

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
        set({ projects: projectList, activeProject, projectsLoaded: true });
      },

      loadProjects: async () => {
        try {
          if (!supabase) {
            // LocalStorage fallback
            const local = localStorage.getItem('writer_studio_projects');
            if (local) {
              const projects = JSON.parse(local);
              get().setProjects(projects);
            }
            return;
          }

          const { data, error } = await supabase
            .from('projects')
            .select('*')
            .order('created_at', { ascending: false });

          if (error) throw error;

          if (data && data.length > 0) {
            get().setProjects(data);
            // Keep local cache in sync
            localStorage.setItem('writer_studio_projects', JSON.stringify(data));
          } else {
            // Cloud empty → use local cache
            const local = localStorage.getItem('writer_studio_projects');
            if (local) get().setProjects(JSON.parse(local));
          }
        } catch (err) {
          console.error('[ProjectStore] Failed to load projects:', err);
          const local = localStorage.getItem('writer_studio_projects');
          if (local) get().setProjects(JSON.parse(local));
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
