-- Content OS - Migration V6 (Narrative Orchestration + Script Executions)
-- Execute no Supabase SQL Editor apos migration_v5.sql

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- 1. EXPANDIR NARRATIVE_COMPONENTS
--    A biblioteca narrativa passa a comportar ativos de conteudo e de escrita.
-- ============================================================================

ALTER TABLE public.narrative_components
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS behavior_flag TEXT DEFAULT 'rotative',
  ADD COLUMN IF NOT EXISTS usage_mode TEXT DEFAULT 'when_compatible',
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compatibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

UPDATE public.narrative_components
SET
  category = COALESCE(category, type),
  behavior_flag = COALESCE(behavior_flag, 'rotative'),
  usage_mode = COALESCE(usage_mode, 'when_compatible'),
  active = COALESCE(active, is_active, true)
WHERE
  category IS NULL
  OR behavior_flag IS NULL
  OR usage_mode IS NULL
  OR active IS NULL;

ALTER TABLE public.narrative_components
  DROP CONSTRAINT IF EXISTS chk_narrative_components_category_v6;

ALTER TABLE public.narrative_components
  ADD CONSTRAINT chk_narrative_components_category_v6
  CHECK (
    category IN (
      'Hook',
      'CTA',
      'Title Structure',
      'Community',
      'Narrative Curve',
      'Argument Mode',
      'Language Signature',
      'Humanization Device',
      'Closing Style',
      'Repetition Rule'
    )
  );

ALTER TABLE public.narrative_components
  DROP CONSTRAINT IF EXISTS chk_narrative_components_behavior_flag_v6;

ALTER TABLE public.narrative_components
  ADD CONSTRAINT chk_narrative_components_behavior_flag_v6
  CHECK (behavior_flag IN ('fixed', 'rotative', 'experimental'));

ALTER TABLE public.narrative_components
  DROP CONSTRAINT IF EXISTS chk_narrative_components_usage_mode_v6;

ALTER TABLE public.narrative_components
  ADD CONSTRAINT chk_narrative_components_usage_mode_v6
  CHECK (usage_mode IN ('always', 'when_compatible', 'specific_only'));

CREATE INDEX IF NOT EXISTS idx_narrative_components_project_category
  ON public.narrative_components(project_id, category);

CREATE INDEX IF NOT EXISTS idx_narrative_components_behavior_flag
  ON public.narrative_components(project_id, behavior_flag);

-- ============================================================================
-- 2. EXPANDIR THEMES
--    O tema passa a carregar origem, modo de execucao e vinculos de roteiro.
-- ============================================================================

ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS origin_mode TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS composition_log_id UUID REFERENCES public.composition_log(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS script_execution_id UUID;

ALTER TABLE public.themes
  DROP CONSTRAINT IF EXISTS chk_themes_origin_mode_v6;

ALTER TABLE public.themes
  ADD CONSTRAINT chk_themes_origin_mode_v6
  CHECK (origin_mode IN ('manual', 'content_hub', 'script_engine'));

ALTER TABLE public.themes
  DROP CONSTRAINT IF EXISTS chk_themes_execution_mode_v6;

ALTER TABLE public.themes
  ADD CONSTRAINT chk_themes_execution_mode_v6
  CHECK (execution_mode IN ('internal', 'external'));

CREATE INDEX IF NOT EXISTS idx_themes_composition_log_id
  ON public.themes(composition_log_id);

CREATE INDEX IF NOT EXISTS idx_themes_execution_mode
  ON public.themes(project_id, execution_mode);

-- ============================================================================
-- 3. EXPANDIR COMPOSITION_LOG
--    Registrar a orquestracao completa usada na composicao.
-- ============================================================================

ALTER TABLE public.composition_log
  ADD COLUMN IF NOT EXISTS selected_curve_id UUID REFERENCES public.narrative_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_argument_mode_id UUID REFERENCES public.narrative_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_closing_style_id UUID REFERENCES public.narrative_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS selected_language_signature_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selected_humanization_device_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS selected_repetition_rule_ids UUID[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS block_count INTEGER,
  ADD COLUMN IF NOT EXISTS duration_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS voice_pattern TEXT,
  ADD COLUMN IF NOT EXISTS novelty_score NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS selection_diagnostics JSONB DEFAULT '{}'::jsonb;

ALTER TABLE public.composition_log
  DROP CONSTRAINT IF EXISTS chk_composition_log_execution_mode_v6;

ALTER TABLE public.composition_log
  ADD CONSTRAINT chk_composition_log_execution_mode_v6
  CHECK (execution_mode IN ('internal', 'external'));

CREATE INDEX IF NOT EXISTS idx_composition_log_selected_curve_id
  ON public.composition_log(selected_curve_id);

CREATE INDEX IF NOT EXISTS idx_composition_log_selected_argument_mode_id
  ON public.composition_log(selected_argument_mode_id);

CREATE INDEX IF NOT EXISTS idx_composition_log_selected_closing_style_id
  ON public.composition_log(selected_closing_style_id);

CREATE INDEX IF NOT EXISTS idx_composition_log_execution_mode
  ON public.composition_log(project_id, execution_mode);

CREATE INDEX IF NOT EXISTS idx_composition_log_created_mode
  ON public.composition_log(project_id, created_at DESC, execution_mode);

-- ============================================================================
-- 4. SCRIPT_EXECUTIONS
--    Guarda a execucao do roteiro no modo interno ou externo.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.script_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES public.themes(id) ON DELETE SET NULL,
  composition_log_id UUID REFERENCES public.composition_log(id) ON DELETE SET NULL,

  mode TEXT NOT NULL DEFAULT 'internal'
       CHECK (mode IN ('internal', 'external')),

  status TEXT NOT NULL DEFAULT 'prompt_ready'
         CHECK (
           status IN (
             'prompt_ready',
             'generating_internal',
             'waiting_external_upload',
             'script_received',
             'approved'
           )
         ),

  prompt_generated TEXT,
  script_text TEXT,
  script_blocks JSONB DEFAULT '[]'::jsonb,

  external_source TEXT,
  external_file_name TEXT,
  external_file_type TEXT,
  external_file_url TEXT,

  execution_snapshot JSONB DEFAULT '{}'::jsonb,
  validation_report JSONB DEFAULT '{}'::jsonb,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_script_executions_project
  ON public.script_executions(project_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_script_executions_theme
  ON public.script_executions(theme_id);

CREATE INDEX IF NOT EXISTS idx_script_executions_composition_log
  ON public.script_executions(composition_log_id);

CREATE INDEX IF NOT EXISTS idx_script_executions_mode_status
  ON public.script_executions(project_id, mode, status);

-- Vincular themes.script_execution_id agora que a tabela existe
ALTER TABLE public.themes
  DROP CONSTRAINT IF EXISTS fk_themes_script_execution_id_v6;

ALTER TABLE public.themes
  ADD CONSTRAINT fk_themes_script_execution_id_v6
  FOREIGN KEY (script_execution_id)
  REFERENCES public.script_executions(id)
  ON DELETE SET NULL;

-- ============================================================================
-- 5. PROJECTS
--    Modo padrao de execucao por canal.
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS default_execution_mode TEXT DEFAULT 'internal';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS chk_projects_default_execution_mode_v6;

ALTER TABLE public.projects
  ADD CONSTRAINT chk_projects_default_execution_mode_v6
  CHECK (default_execution_mode IN ('internal', 'external'));

-- ============================================================================
-- 6. UPDATED_AT trigger para script_executions
-- ============================================================================

CREATE OR REPLACE FUNCTION public.set_updated_at_v6()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_script_executions_updated_at_v6 ON public.script_executions;

CREATE TRIGGER trg_script_executions_updated_at_v6
BEFORE UPDATE ON public.script_executions
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at_v6();

-- ============================================================================
-- 7. RLS basico alinhado ao resto do projeto
-- ============================================================================

ALTER TABLE public.script_executions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access script_executions" ON public.script_executions;
CREATE POLICY "Allow public access script_executions"
  ON public.script_executions
  FOR ALL
  USING (true)
  WITH CHECK (true);
