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
        selectedCurveId: entry.selectedCurveId || undefined,
        selectedArgumentModeId: entry.selectedArgumentModeId || undefined,
        selectedRepetitionRuleIds: Array.isArray(entry.selectedRepetitionRuleIds)
          ? entry.selectedRepetitionRuleIds
          : [],
        blockCount: Number(entry.blockCount || entry.block_count || 0) || undefined,
        durationMinutes: Number(entry.durationMinutes || entry.estimatedDurationMinutes || entry.duration_minutes || 0) || undefined,
        voicePattern: entry.voicePattern || undefined,
        created_at: entry.created_at || new Date(0).toISOString(),
      }));

  const normalizeThemeEntries = (entries: any[]) =>
    entries
      .filter(Boolean)
      .map((entry) => {
        const assets = entry.production_assets || {};
        return {
          theme_title: entry.title || entry.refined_title || undefined,
          selectedHookId: assets.hook_id || undefined,
          selectedCtaId: assets.cta_id || undefined,
          selectedTitleStructureId: assets.title_structure_id || entry.title_structure_asset_id || undefined,
          selectedCurveId: assets.narrative_curve_id || undefined,
          selectedArgumentModeId: assets.argument_mode_id || undefined,
          selectedRepetitionRuleIds: Array.isArray(assets.repetition_rule_ids)
            ? assets.repetition_rule_ids.filter(Boolean)
            : [],
          blockCount: Number(assets.block_count || 0) || undefined,
          durationMinutes: Number(assets.duration_minutes || assets.estimated_duration_minutes || 0) || undefined,
          voicePattern: assets.voice_pattern || undefined,
          source: 'registered' as const,
          created_at: assets.approved_at || entry.updated_at || entry.created_at || new Date(0).toISOString(),
        };
      })
      .filter((entry) =>
        entry.selectedHookId ||
        entry.selectedCtaId ||
        entry.selectedTitleStructureId ||
        entry.selectedCurveId ||
        entry.selectedArgumentModeId ||
        entry.selectedRepetitionRuleIds.length > 0 ||
        entry.blockCount ||
        entry.durationMinutes ||
        entry.voicePattern
      );

  // Try Supabase first
  let remoteEntries: any[] = [];
  if (supabase) {
    try {
      const { data } = await supabase
        .from('composition_log')
        .select('narrative_asset_ids, selected_variation, title_structure_asset_id, selected_hook_id, selected_cta_id, selected_curve_id, selected_argument_mode_id, selected_repetition_rule_ids, block_count, duration_minutes, estimated_duration_minutes, voice_pattern, theme_title, created_at')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(limit);

      remoteEntries = ((data || []) as any[]).map((entry: any) => ({
        ...entry,
        selectedHookId: entry.selectedHookId || entry.selected_hook_id || undefined,
        selectedCtaId: entry.selectedCtaId || entry.selected_cta_id || undefined,
        selectedTitleStructureId: entry.title_structure_asset_id || undefined,
        selectedCurveId: entry.selectedCurveId || entry.selected_curve_id || undefined,
        selectedArgumentModeId: entry.selectedArgumentModeId || entry.selected_argument_mode_id || undefined,
        selectedRepetitionRuleIds: Array.isArray(entry.selectedRepetitionRuleIds)
          ? entry.selectedRepetitionRuleIds
          : Array.isArray(entry.selected_repetition_rule_ids)
            ? entry.selected_repetition_rule_ids
          : [],
        blockCount: Number(entry.blockCount || entry.block_count || 0) || undefined,
        durationMinutes: Number(entry.durationMinutes || entry.duration_minutes || entry.estimated_duration_minutes || 0) || undefined,
        voicePattern: entry.voicePattern || entry.voice_pattern || undefined,
        source: 'registered' as const,
      }));
    } catch {
      // fallthrough to localStorage
    }
  }

  // LocalStorage fallback
  try {
    const local = JSON.parse(localStorage.getItem(`bi_${projectId}`) || '[]') as any[];
    const themes = JSON.parse(localStorage.getItem(`themes_${projectId}`) || '[]') as any[];
    const merged = [...normalizeLocalEntries(local), ...normalizeThemeEntries(themes), ...remoteEntries]
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

// ─── SCRIPT EXECUTIONS (HEAVY ASSETS) ────────────────────────────────────────

export async function upsertScriptExecution(themeId: string, executionSnapshot: any): Promise<{ data: any; error: any }> {
  const projectId = useProjectStore.getState().activeProjectId;

  if (!projectId) {
    return { data: null, error: new Error('No active project selected.') };
  }

  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }

  try {
    // Check if it exists for this theme
    const { data: existing } = await supabase
      .from('script_executions')
      .select('id, execution_snapshot')
      .eq('theme_id', themeId)
      .single();

    if (existing?.id) {
      const mergedSnapshot = {
        ...(existing.execution_snapshot || {}),
        ...executionSnapshot
      };

      return supabase
        .from('script_executions')
        .update({ 
          execution_snapshot: mergedSnapshot, 
          updated_at: new Date().toISOString() 
        })
        .eq('id', existing.id)
        .select()
        .single();
    } else {
      return supabase
        .from('script_executions')
        .insert({ 
          project_id: projectId, 
          theme_id: themeId, 
          execution_snapshot: executionSnapshot 
        })
        .select()
        .single();
    }
  } catch (err: any) {
    return { data: null, error: err };
  }
}

export async function getScriptExecution(themeId: string): Promise<{ data: any; error: any }> {
  if (!supabase) {
    return { data: null, error: new Error('Supabase not configured.') };
  }

  return supabase
    .from('script_executions')
    .select('execution_snapshot')
    .eq('theme_id', themeId)
    .single();
}

export async function syncAndFreeTheme(
  themeId: string,
  projectId: string,
  fullSnapshot: any,
  storageBaseKey: string
): Promise<{ success: boolean; bytesFreed: number }> {
  if (!supabase) {
    return { success: false, bytesFreed: 0 };
  }

  const hasLocalStorage = typeof window !== 'undefined' && window.localStorage;
  const srtPipelineKey = `${storageBaseKey}_srt_pipeline`;
  const postPackageKey = `${storageBaseKey}_post_package`;
  const hfKey = `yt_hf_bg_${storageBaseKey}`;

  // 1. Ensure fullSnapshot has the srt pipeline and post package from localStorage if they aren't already in fullSnapshot
  if (hasLocalStorage) {
    if (!fullSnapshot.externalSrtPipeline) {
      try {
        const localSrt = localStorage.getItem(srtPipelineKey);
        if (localSrt) {
          fullSnapshot.externalSrtPipeline = JSON.parse(localSrt);
        }
      } catch (e) {
        console.warn('[syncAndFreeTheme] Error reading srt pipeline from localStorage:', e);
      }
    }

    if (!fullSnapshot.postScriptPackage) {
      try {
        const localPost = localStorage.getItem(postPackageKey);
        if (localPost) {
          fullSnapshot.postScriptPackage = JSON.parse(localPost);
        }
      } catch (e) {
        console.warn('[syncAndFreeTheme] Error reading post package from localStorage:', e);
      }
    }
  }

  try {
    // 2. Perform upsert of the complete snapshot
    const { data, error } = await upsertScriptExecution(themeId, fullSnapshot);

    if (error) {
      console.error('[syncAndFreeTheme] Supabase upsert failed:', error);
      return { success: false, bytesFreed: 0 };
    }

    // 3. Confirm arrival by checking returned data
    if (!data) {
      console.warn('[syncAndFreeTheme] Upsert returned empty data.');
      return { success: false, bytesFreed: 0 };
    }

    // 4. If upsert was successful, delete keys from localStorage
    let bytesFreed = 0;
    if (hasLocalStorage) {
      const keysToClean = [
        storageBaseKey,
        srtPipelineKey,
        postPackageKey,
        hfKey,
        `snapshot_${themeId}`
      ];

      keysToClean.forEach(key => {
        try {
          const val = localStorage.getItem(key);
          if (val) {
            bytesFreed += val.length * 2;
            localStorage.removeItem(key);
          }
        } catch (e) {
          console.warn(`[syncAndFreeTheme] Error removing key ${key} from localStorage:`, e);
        }
      });
    }

    return { success: true, bytesFreed };
  } catch (err) {
    console.error('[syncAndFreeTheme] Critical error during sync and free:', err);
    return { success: false, bytesFreed: 0 };
  }
}

