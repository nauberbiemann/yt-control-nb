import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { supabase } from '@/lib/supabase';
import { ReferenceChannel, ChannelDnaConfig } from '@/lib/types/referenceChannels';

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
  reference_channels?: ReferenceChannel[];
  channel_dna?: ChannelDnaConfig;
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

const sanitizeProjectRecord = (proj: any, depth = 0): any => {
  if (depth > 5) return '';
  if (!isPlainObject(proj)) return proj;

  const clean: Record<string, any> = {};
  for (const key of Object.keys(proj)) {
    const val: any = proj[key];
    if (val === proj) continue;
    if (isPlainObject(val)) {
      if (val.id && proj.id && val.id === proj.id) continue;
      clean[key] = sanitizeProjectRecord(val, depth + 1);
    } else {
      clean[key] = val;
    }
  }
  return clean;
};

const mergeProjectRecords = (local: any, remote: any, depth = 0): any => {
  if (depth > 5) return hasMeaningfulValue(local) ? local : remote;
  if (!isPlainObject(local) || !isPlainObject(remote)) {
    return hasMeaningfulValue(local) ? local : remote;
  }

  const merged: Record<string, any> = { ...local };
  const keys = new Set([...Object.keys(local), ...Object.keys(remote)]);

  keys.forEach((key) => {
    const localValue = local[key];
    const remoteValue = remote[key];

    if (Array.isArray(localValue) || Array.isArray(remoteValue)) {
      merged[key] = Array.isArray(localValue) && localValue.length > 0
        ? localValue
        : Array.isArray(remoteValue) && remoteValue.length > 0
        ? remoteValue
        : localValue ?? remoteValue ?? [];
      return;
    }

    if (isPlainObject(localValue) && isPlainObject(remoteValue)) {
      if (localValue.id && local.id && localValue.id === local.id) {
        merged[key] = remoteValue;
        return;
      }
      merged[key] = mergeProjectRecords(localValue, remoteValue, depth + 1);
      return;
    }

    const simpleVal = hasMeaningfulValue(localValue) ? localValue : hasMeaningfulValue(remoteValue) ? remoteValue : (localValue ?? remoteValue ?? '');
    merged[key] = isPlainObject(simpleVal) ? '' : simpleVal;
  });

  return merged;
};

const parseProjectCache = (raw: string | null): Project[] => {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.map((p) => sanitizeProjectRecord(p)).filter(Boolean);
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

const AUXILIARY_PROJECT_PREFIXES = ['themes_', 'ws_script_execution_', 'ws_narrative_', 'bi_', 'ws_channel_dna_', 'ws_ref_channels_'];

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
      .slice(0, 10)
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

const enrichProjectWithDedicatedCaches = (project: Project): Project => {
  if (!project?.id) return project;
  const dedicatedDna = readJsonCache(`ws_channel_dna_${project.id}`);
  const dedicatedRefs = readJsonCache(`ws_ref_channels_${project.id}`);

  let updated = { ...project };
  if (hasUsefulCachePayload(dedicatedDna)) {
    const currentDna = project.channel_dna || {};
    updated.channel_dna = { ...currentDna, ...dedicatedDna };
  }
  if (hasUsefulCachePayload(dedicatedRefs) && (!project.reference_channels || project.reference_channels.length === 0)) {
    updated.reference_channels = dedicatedRefs;
  }
  return updated;
};

export const SYSTEM_PRESET_PROJECTS: Project[] = [
  {
    id: 'dd5d5231-cb89-4cf6-824f-08e217b31704',
    name: 'Radar Explicado',
    project_name: 'Radar Explicado',
    puc: 'Desvendar minuciosamente, através de análises forenses e suporte tecnológico, os bastidores ocultos, erros de aviação e grandes obras.',
    puc_promise: 'Desvendar minuciosamente, através de análises forenses e suporte tecnológico, os bastidores ocultos, erros de aviação e grandes obras.',
    description: 'Desvendar minuciosamente, através de análises forenses e suporte tecnológico, os bastidores ocultos, erros de aviação e grandes obras.',
    accent_color: '#3b82f6',
    status: 'active'
  },
  {
    id: '75314d88-b4bf-4a6e-8edb-69bae8448d27',
    name: 'Garage 2050',
    project_name: 'Garage 2050',
    puc: 'O canal que ensina o motorista brasileiro a diagnosticar, cuidar e economizar no próprio carro usando só o que tem em casa.',
    puc_promise: 'O canal que ensina o motorista brasileiro a diagnosticar, cuidar e economizar no próprio carro usando só o que tem em casa.',
    description: 'O canal que ensina o motorista brasileiro a diagnosticar, cuidar e economizar no próprio carro usando só o que tem em casa.',
    accent_color: '#ef4444',
    status: 'active'
  },
  {
    id: 'd463eafc-506c-48f6-aed8-b05ce45c5b92',
    name: 'Alimento Inteligente',
    project_name: 'Alimento Inteligente',
    puc: 'Traduzir a ciência oculta de alimentos e suplementos em guias sequenciais brutais de performance física e mental.',
    puc_promise: 'Traduzir a ciência oculta de alimentos e suplementos em guias sequenciais brutais de performance física e mental.',
    description: 'Traduzir a ciência oculta de alimentos e suplementos em guias sequenciais brutais de performance física e mental.',
    accent_color: '#10b981',
    status: 'active'
  },
  {
    id: '5c24efcd-098c-41f1-88b2-b3173fbeb5eb',
    name: 'Metabolismo de Ouro',
    project_name: 'Metabolismo de Ouro',
    puc: 'Desvendar os segredos para reativar o metabolismo e a vitalidade após os 45 anos, através da sabedoria prática e nutrição.',
    puc_promise: 'Desvendar os segredos para reativar o metabolismo e a vitalidade após os 45 anos, através da sabedoria prática e nutrição.',
    description: 'Desvendar os segredos para reativar o metabolismo e a vitalidade após os 45 anos, através da sabedoria prática e nutrição.',
    accent_color: '#f59e0b',
    status: 'active'
  },
  {
    id: '2583117d-9f1c-48c9-bdac-50893c761dff',
    name: 'Miracle Ledger',
    project_name: 'Miracle Ledger',
    puc: 'Reconstructing absolute human crises through gripping, emotionally resonant confessional narratives where faith intervenes.',
    puc_promise: 'Reconstructing absolute human crises through gripping, emotionally resonant confessional narratives where faith intervenes.',
    description: 'Reconstructing absolute human crises through gripping, emotionally resonant confessional narratives where faith intervenes.',
    accent_color: '#8b5cf6',
    status: 'active'
  },
  {
    id: '33998a3d-defb-4169-a6f1-dbceaeb5e9aa',
    name: 'Urbanalypse',
    project_name: 'Urbanalypse',
    puc: 'We curate and synthesize lost engineering and ancient survival wisdom to engineer resilience for the urban apocalypse.',
    puc_promise: 'We curate and synthesize lost engineering and ancient survival wisdom to engineer resilience for the urban apocalypse.',
    description: 'We curate and synthesize lost engineering and ancient survival wisdom to engineer resilience for the urban apocalypse.',
    accent_color: '#6366f1',
    status: 'active'
  },
  {
    id: '2847bb4b-d009-4f03-a0b6-df86c10faa20',
    name: 'Vó do Campo',
    project_name: 'Vó do Campo',
    puc: 'Sabedoria ancestral do campo aplicada à produtividade real para quem quer independência financeira no quintal.',
    puc_promise: 'Sabedoria ancestral do campo aplicada à produtividade real para quem quer independência financeira no quintal.',
    description: 'Sabedoria ancestral do campo aplicada à produtividade real para quem quer independência financeira no quintal.',
    accent_color: '#84cc16',
    status: 'active'
  },
  {
    id: '7919dbc5-e1da-4ca1-88dd-3e33c91ba5b7',
    name: 'Fabrica Y',
    project_name: 'Fabrica Y',
    puc: 'Análises de engenharia, defesa e alta tecnologia da aviação e indústrias de ponta.',
    puc_promise: 'Análises de engenharia, defesa e alta tecnologia da aviação e indústrias de ponta.',
    description: 'Análises de engenharia, defesa e alta tecnologia da aviação e indústrias de ponta.',
    accent_color: '#06b6d4',
    status: 'active'
  },
  {
    id: '9d1b5e3d-c0bf-4931-a30e-0f297232ba89',
    name: 'Warhammer Legends BR',
    project_name: 'Warhammer Legends BR',
    puc: 'A história profunda, personagens e mitologia do universo Warhammer 40k em português.',
    puc_promise: 'A história profunda, personagens e mitologia do universo Warhammer 40k em português.',
    description: 'A história profunda, personagens e mitologia do universo Warhammer 40k em português.',
    accent_color: '#a855f7',
    status: 'active'
  },
  {
    id: '08124252-c007-48ee-81ba-d075e26a41ab',
    name: 'DevZen',
    project_name: 'DevZen',
    puc: 'O diferencial imbatível: transformar desenvolvedores sêniores em arquitetos do próprio estilo de vida.',
    puc_promise: 'O diferencial imbatível: transformar desenvolvedores sêniores em arquitetos do próprio estilo de vida.',
    description: 'O diferencial imbatível: transformar desenvolvedores sêniores em arquitetos do próprio estilo de vida.',
    accent_color: '#3b82f6',
    status: 'active'
  }
];

const readLocalProjectCaches = (): Project[] => {
  const primary = parseProjectCache(localStorage.getItem(PROJECTS_STORAGE_KEY));
  const backup = parseProjectCache(localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY));
  const archived = readArchivedProjects();
  const recovered = recoverProjectsFromAuxiliaryCaches();

  const allRawProjects = [...primary, ...backup, ...archived, ...recovered];
  const mergedLocal = mergeProjectCollections(SYSTEM_PRESET_PROJECTS, allRawProjects);

  return mergedLocal.map(enrichProjectWithDedicatedCaches);
};

const writeLocalProjectCaches = (projects: Project[]) => {
  const currentPrimary = parseProjectCache(localStorage.getItem(PROJECTS_STORAGE_KEY));
  const currentBackup = parseProjectCache(localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY));
  const existingLocal = mergeProjectCollections(currentPrimary, currentBackup);

  const safeProjects = Array.isArray(projects) && projects.length > 0 ? projects : [createBootstrapProject()];

  // Preservação absoluta: Mesclar a nova lista com os projetos locais existentes para NUNCA perder nada
  const mergedProjects = mergeProjectCollections(existingLocal, safeProjects);
  const normalized = normalizeProjectList(mergedProjects);
  const enrichedProjects = normalized.map(enrichProjectWithDedicatedCaches);

  enrichedProjects.forEach((p) => {
    if (p.id) {
      if (p.channel_dna && Object.keys(p.channel_dna).length > 0) {
        localStorage.setItem(`ws_channel_dna_${p.id}`, JSON.stringify(p.channel_dna));
      }
      if (Array.isArray(p.reference_channels) && p.reference_channels.length > 0) {
        localStorage.setItem(`ws_ref_channels_${p.id}`, JSON.stringify(p.reference_channels));
      }
    }
  });

  const payload = JSON.stringify(enrichedProjects);
  const hasOnlySyntheticBootstrap =
    safeProjects.length === 1 &&
    isBootstrapProject(safeProjects[0]) &&
    !localStorage.getItem(PROJECTS_STORAGE_KEY) &&
    !localStorage.getItem(PROJECTS_BACKUP_STORAGE_KEY) &&
    !localStorage.getItem(PROJECTS_ARCHIVE_STORAGE_KEY);

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
    cut_rhythm: '',
    zoom_style: '',
    soundtrack: '',
    art_direction: '',
    overlays: '',
    duration: '',
    duration_min: 0,
    duration_max: 0,
    blocks_variation: '',
    blocks_min: 0,
    blocks_max: 0,
    asset_types: [],
    measurement_focus: '',
  },
  traceability_summary: [],
  traceability_sources: {},
});

const isGhostRecoveredProject = (p: Project) => {
  const name = `${p?.name || ''} ${p?.project_name || ''}`.toLowerCase();
  return p?.is_recovered_project === true || name.includes('recuperado');
};

const normalizeProjectList = (projects: Project[]) => {
  const list = Array.isArray(projects) ? projects.filter(Boolean) : [];
  const cleanProjects = list.filter((p) => !isGhostRecoveredProject(p));

  // Mesclar sempre com o catálogo mestre SYSTEM_PRESET_PROJECTS
  const merged = mergeProjectCollections(SYSTEM_PRESET_PROJECTS, cleanProjects);

  // Se o DevZen com UUID real '08124252-c007-48ee-81ba-d075e26a41ab' estiver presente, descarta a duplicata sintética 'demo-devzen-project'
  const hasRealDevZen = merged.some((p) => p.id === '08124252-c007-48ee-81ba-d075e26a41ab');
  if (hasRealDevZen) {
    return merged.filter((p) => p.id !== BOOTSTRAP_PROJECT_ID);
  }

  return merged;
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
        const currentProjects = get().projects.filter((p) => p.id && !p.is_recovered_project);
        const combined = mergeProjectCollections(currentProjects, projects || []);
        const projectList = normalizeProjectList(combined.length > 0 ? combined : projects || []);
        const activeId = get().activeProjectId;
        const activeProject = activeId
          ? (projectList.find((p: any) => p.id === activeId) || projectList[0] || null)
          : (projectList[0] || null);
        const activeProjectId = activeProject?.id || null;
        writeLocalProjectCaches(projectList);
        set({ projects: projectList, activeProjectId, activeProject, projectsLoaded: true });
      },

      loadProjects: async () => {
        const localProjects = readLocalProjectCaches();
        const fallbackProjects = localProjects.length > 0 ? localProjects : [createBootstrapProject()];

        // Always render local data immediately so the UI is never blank
        if (!get().projectsLoaded) {
          get().setProjects(fallbackProjects);
        }

        try {
          if (!supabase) {
            console.log('[ProjectStore] Supabase not configured. Using local cache only.');
            return;
          }

          // Guard: if Supabase hangs (free-tier pause, network issue), fall back
          // to the already-rendered local data instead of blocking forever.
          const fetchWithTimeout = Promise.race([
            supabase.from('projects').select('*').order('created_at', { ascending: false }),
            new Promise<{ data: null; error: Error }>((resolve) =>
              setTimeout(() => resolve({ data: null, error: new Error('Supabase Timeout: sem resposta em 10s') }), 10_000)
            ),
          ]);

          const { data, error } = await fetchWithTimeout;

          if (error) {
            // Timeout or Supabase error — local cache is already rendered, just log and bail out gracefully.
            const isTimeout = error.message?.includes('Timeout');
            if (isTimeout) {
              console.warn('[ProjectStore] ⏱ Supabase não respondeu a tempo. Mantendo cache local.');
            } else {
              console.warn('[ProjectStore] ⚠️ Erro ao buscar projetos na nuvem:', error.message);
            }
            return;
          }

          if (data && data.length > 0) {
            // ☁️ CLOUD-WINS with local strategic field rescue.
            // After running migration_strategic_fields.sql these strategic fields
            // ARE in the cloud. But for safety, we still rescue from local if the
            // cloud record has empty values (e.g. migration not run yet).
            const STRATEGIC_FIELDS = [
              'phd_strategy',
              'persona_matrix',
              'editorial_line',
              'narrative_voice',
              'thumb_strategy',
              'reference_channels',
              'channel_dna',
              'editing_sop',
              'prohibited_terms',
              'metaphor_library',
              'playlists',
              'default_execution_mode',
              'visual_style',
            ] as const;

            const localById = new Map(localProjects.map((p) => [p.id, p]));

            const mergedCloudProjects = (data as Project[]).map((cloudProject) => {
              const localProject = localById.get(cloudProject.id);
              if (!localProject) return cloudProject;

              const rescued: Partial<Project> = {};
              for (const field of STRATEGIC_FIELDS) {
                const cloudVal = (cloudProject as any)[field];
                const localVal = (localProject as any)[field];
                const cloudEmpty =
                  cloudVal === null ||
                  cloudVal === undefined ||
                  (typeof cloudVal === 'object' && Object.keys(cloudVal || {}).length === 0) ||
                  (typeof cloudVal === 'string' && cloudVal.trim() === '');
                if (cloudEmpty && localVal && (
                  (typeof localVal === 'object' && Object.keys(localVal || {}).length > 0) ||
                  (typeof localVal === 'string' && localVal.trim() !== '') ||
                  (typeof localVal === 'number')
                )) {
                  (rescued as any)[field] = localVal;
                }
              }
              return Object.keys(rescued).length > 0
                ? { ...cloudProject, ...rescued }
                : cloudProject;
            });

            // 🛡️ Segurança Absoluta: Mesclar os projetos da nuvem com os projetos locais sem NUNCA descartar nenhum projeto do usuário
            const safeProjects = normalizeProjectList(
              mergeProjectCollections(localProjects, mergedCloudProjects)
            );

            console.log(`[ProjectStore] ☁️ Cloud-wins+rescue: ${data.length} cloud, ${localProjects.length} local → ${safeProjects.length} final`);
            get().setProjects(safeProjects);
          } else {
            // Cloud empty → local cache already rendered above, nothing to do
            console.log('[ProjectStore] Cloud empty, keeping local cache');
          }
        } catch (err) {
          console.error('[ProjectStore] Failed to load projects (using local cache):', err);
          // Local data is already rendered from the pre-fetch block above
          // Only re-set if nothing was loaded yet
          if (!get().projectsLoaded) {
            get().setProjects(fallbackProjects);
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
