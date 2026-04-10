/**
 * lib/hooks/useProjectData.ts
 * 
 * Custom hooks for fetching data isolated by activeProjectId.
 * All hooks auto-clear data when no project is selected and 
 * re-fetch when the active project changes.
 */

'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProjectId } from '@/lib/store/projectStore';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface NarrativeAsset {
  id: string;
  project_id: string;
  type: string;
  name: string;
  description: string;
  content_pattern: string;
  category?: string;
  usage_count?: number;
  effectiveness_score?: number;
  is_active: boolean;
  created_at: string;
}

export interface ThemeEntry {
  id: string;
  project_id: string;
  title: string;
  description?: string;
  editorial_pillar?: string;
  status: 'backlog' | 'vetted' | 'scripted' | 'published';
  title_structure?: string;
  priority: number;
  notes?: string;
  created_at: string;
}

export interface CompositionLog {
  id: string;
  project_id: string;
  llm_model_id: string;
  narrative_asset_ids: string[];
  selected_variation: 'S1' | 'S2' | 'S3' | 'S4' | 'S5';
  prompt_tokens?: number;
  created_at: string;
}

// ─── useThemes ────────────────────────────────────────────────────────────────

export function useThemes() {
  const projectId = useActiveProjectId();
  const [themes, setThemes] = useState<ThemeEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = async () => {
    if (!projectId) {
      setThemes([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      if (!supabase) {
        const local = localStorage.getItem(`themes_${projectId}`);
        setThemes(local ? JSON.parse(local) : []);
        return;
      }
      const { data, err } = await (supabase
        .from('themes')
        .select('*')
        .eq('project_id', projectId)
        .order('priority', { ascending: false })
        .order('created_at', { ascending: false }) as any);

      if (err) throw err;
      setThemes(data || []);
    } catch (e: any) {
      setError(e.message);
      const local = localStorage.getItem(`themes_${projectId}`);
      setThemes(local ? JSON.parse(local) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [projectId]);

  return { themes, loading, error, refetch: fetch };
}

// ─── useNarrativeAssets ───────────────────────────────────────────────────────

export function useNarrativeAssets(type?: string) {
  const projectId = useActiveProjectId();
  const [assets, setAssets] = useState<NarrativeAsset[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    if (!projectId) {
      setAssets([]);
      return;
    }
    setLoading(true);
    try {
      if (!supabase) {
        const local = localStorage.getItem(`ws_narrative_${projectId}`);
        const all: NarrativeAsset[] = local ? JSON.parse(local) : [];
        setAssets(type ? all.filter((a) => a.type === type) : all);
        return;
      }

      let query = supabase
        .from('narrative_components')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false });

      if (type) query = query.eq('type', type) as any;

      const { data, error } = await query;
      if (error) throw error;
      setAssets(data || []);
    } catch {
      const local = localStorage.getItem(`ws_narrative_${projectId}`);
      const all: NarrativeAsset[] = local ? JSON.parse(local) : [];
      setAssets(type ? all.filter((a) => a.type === type) : all);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [projectId, type]);

  return { assets, loading, refetch: fetch };
}

// ─── useCompositionLogs ───────────────────────────────────────────────────────

export function useCompositionLogs() {
  const projectId = useActiveProjectId();
  const [logs, setLogs] = useState<CompositionLog[]>([]);
  const [loading, setLoading] = useState(false);

  const fetch = async () => {
    if (!projectId) {
      setLogs([]);
      return;
    }
    setLoading(true);
    try {
      if (!supabase) {
        const local = localStorage.getItem(`bi_${projectId}`);
        setLogs(local ? JSON.parse(local) : []);
        return;
      }
      const { data, error } = await supabase
        .from('composition_log')
        .select('*')
        .eq('project_id', projectId)
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      setLogs(data || []);
    } catch {
      const local = localStorage.getItem(`bi_${projectId}`);
      setLogs(local ? JSON.parse(local) : []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch();
  }, [projectId]);

  return { logs, loading, refetch: fetch };
}
