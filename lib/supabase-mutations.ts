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
