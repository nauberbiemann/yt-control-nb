/**
 * lib/supabase-mutations.ts
 * 
 * Auto-injects project_id from the global store into all Supabase 
 * INSERT / UPDATE / DELETE operations. This prevents data from leaking
 * between projects.
 */

import { supabase } from '@/lib/supabase';
import { useProjectStore } from '@/lib/store/projectStore';

type MutationTable =
  | 'themes'
  | 'narrative_components'
  | 'content_hub'
  | 'ai_assets'
  | 'analytics'
  | 'composition_log';

// ─── INSERT ─────────────────────────────────────────────────────────────────

export async function projectInsert<T extends Record<string, any>>(
  table: MutationTable,
  data: T
): Promise<{ data: any; error: any }> {
  const projectId = useProjectStore.getState().activeProjectId;

  if (!projectId) {
    return { data: null, error: new Error('No active project selected.') };
  }

  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }

  const payload = { ...data, project_id: projectId };
  return supabase.from(table).insert(payload).select().single();
}

// ─── UPDATE ─────────────────────────────────────────────────────────────────

export async function projectUpdate<T extends Record<string, any>>(
  table: MutationTable,
  id: string,
  data: T
): Promise<{ data: any; error: any }> {
  const projectId = useProjectStore.getState().activeProjectId;

  if (!projectId) {
    return { data: null, error: new Error('No active project selected.') };
  }

  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }

  // Double-filter: by record id AND project_id to prevent cross-project updates
  return supabase
    .from(table)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('project_id', projectId)
    .select()
    .single();
}

// ─── DELETE ─────────────────────────────────────────────────────────────────

export async function projectDelete(
  table: MutationTable,
  id: string
): Promise<{ data: any; error: any }> {
  const projectId = useProjectStore.getState().activeProjectId;

  if (!projectId) {
    return { data: null, error: new Error('No active project selected.') };
  }

  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }

  // Double-filter: both by record id AND project_id for safety
  return supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('project_id', projectId);
}

// ─── IMMUTABLE INSERT (for Composition Log — no UPDATE allowed) ──────────────

export async function immutableInsert<T extends Record<string, any>>(
  table: MutationTable,
  data: T
): Promise<{ data: any; error: any }> {
  const projectId = useProjectStore.getState().activeProjectId;

  if (!projectId) {
    return { data: null, error: new Error('No active project selected.') };
  }

  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }

  const payload = {
    ...data,
    project_id: projectId,
    created_at: new Date().toISOString(),
  };

  return supabase.from(table).insert(payload).select().single();
}

// ─── FETCH LAST COMPOSITIONS (for Anti-Repetition Shuffle) ───────────────────

export async function fetchLastCompositions(projectId: string, limit = 3): Promise<any[]> {
  const normalizeLocalEntries = (entries: any[]) =>
    entries
      .filter(Boolean)
      .map((entry) => ({
        ...entry,
        selectedHookId: entry.selectedHookId || undefined,
        selectedCtaId: entry.selectedCtaId || undefined,
        selectedTitleStructureId: entry.selectedTitleStructureId || entry.title_structure_asset_id || undefined,
        blockCount: Number(entry.blockCount || entry.block_count || 0) || undefined,
        durationMinutes: Number(entry.durationMinutes || entry.estimatedDurationMinutes || entry.duration_minutes || 0) || undefined,
        voicePattern: entry.voicePattern || undefined,
        created_at: entry.created_at || new Date(0).toISOString(),
      }));

  // Try Supabase first
  let remoteEntries: any[] = [];
  if (supabase) {
    try {
      const { data } = await supabase
        .from('composition_log')
        .select('narrative_asset_ids, selected_variation, title_structure_asset_id, theme_title, created_at, estimated_duration_minutes')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit);

      remoteEntries = (data || []).map((entry) => ({
        ...entry,
        selectedHookId: entry.selectedHookId || undefined,
        selectedCtaId: entry.selectedCtaId || undefined,
        selectedTitleStructureId: entry.title_structure_asset_id || undefined,
        blockCount: Number(entry.blockCount || entry.block_count || 0) || undefined,
        durationMinutes: Number(entry.durationMinutes || entry.estimated_duration_minutes || 0) || undefined,
        voicePattern: entry.voicePattern || undefined,
      }));
    } catch {
      // fallthrough to localStorage
    }
  }

  // LocalStorage fallback
  try {
    const local = JSON.parse(localStorage.getItem(`bi_${projectId}`) || '[]') as any[];
    const merged = [...normalizeLocalEntries(local), ...remoteEntries]
      .sort((a, b) => {
        const timeA = new Date(a.created_at || 0).getTime();
        const timeB = new Date(b.created_at || 0).getTime();
        return timeB - timeA;
      });

    return merged.slice(0, limit);
  } catch {
    return remoteEntries.slice(0, limit);
  }
}
