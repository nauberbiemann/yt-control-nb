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
  // Try Supabase first
  if (supabase) {
    try {
      const { data } = await supabase
        .from('composition_log')
        .select('narrative_asset_ids, selected_variation, theme_title')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit);
      if (data && data.length > 0) return data;
    } catch {
      // fallthrough to localStorage
    }
  }
  // LocalStorage fallback
  try {
    const local = JSON.parse(localStorage.getItem(`bi_${projectId}`) || '[]') as any[];
    return local.slice(-limit).reverse();
  } catch {
    return [];
  }
}
