-- ############################################################################
-- CONTENT OS - CUMULATIVE MIGRATION (V1 to V8 + Auth + Profiles)
-- Data: 2026-04-16
-- Descrição: Script consolidado para alinhar o banco Supabase na nuvem 
--             com a versão mais recente do Content OS.
-- ############################################################################

-- 0. PREPARAÇÃO
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. BASE SCHEMA (Projetos, Calendário, Hub, Assets, Analytics, Componentes)
CREATE TABLE IF NOT EXISTS public.projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  puc TEXT,
  visual_style TEXT,
  accent_color TEXT DEFAULT '#9BB0A5',
  target_persona JSONB,
  ai_engine_rules JSONB,
  playlists JSONB,
  phd_strategy JSONB,
  persona_matrix JSONB,
  editorial_line JSONB,
  narrative_voice JSONB,
  detailed_sop JSONB,
  thumb_strategy JSONB,
  metaphor_library TEXT,
  prohibited_terms TEXT,
  base_system_instruction TEXT,
  schedules JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.post_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL,
  default_time TIME DEFAULT '08:00:00',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.content_hub (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  title_structure TEXT,
  viral_title TEXT,
  category TEXT,
  playlist TEXT,
  post_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'backlog',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.ai_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES public.content_hub(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  full_script TEXT,
  b_roll_json JSONB,
  overlays_json JSONB,
  thumbnail_prompt TEXT,
  tags TEXT[],
  description_optimized TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES public.content_hub(id) ON DELETE CASCADE,
  views INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0.0,
  retention NUMERIC DEFAULT 0.0,
  post_performance_log JSONB,
  composition_log JSONB,
  match_score NUMERIC DEFAULT 0.0,
  editorial_pillar TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.narrative_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  content_pattern TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. AUTH & PROFILES
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE IF EXISTS public.projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 3. THEME BANK (V3)
CREATE TABLE IF NOT EXISTS public.themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  editorial_pillar TEXT,
  status TEXT DEFAULT 'backlog' CHECK (status IN ('backlog', 'vetted', 'scripted', 'published')),
  hook_id UUID,
  title_structure TEXT,
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. COMPOSITION LOG - DNA (V4)
CREATE TABLE IF NOT EXISTS public.composition_log (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  llm_model_id         TEXT NOT NULL,
  narrative_asset_ids  UUID[] DEFAULT '{}',
  selected_variation   TEXT CHECK (selected_variation IN ('S1','S2','S3','S4','S5')),
  prompt_tokens        INTEGER DEFAULT 0,
  editorial_pillar     TEXT,
  theme_title          TEXT,
  puc_snapshot         TEXT,
  outcome_status       TEXT DEFAULT 'pending' 
                       CHECK (outcome_status IN ('pending','published','cancelled')),
  views                INTEGER,
  ctr                  NUMERIC(5,2),
  retention_pct        NUMERIC(5,2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. SCRIPT EXECUTIONS (V6)
CREATE TABLE IF NOT EXISTS public.script_executions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  theme_id UUID REFERENCES public.themes(id) ON DELETE SET NULL,
  composition_log_id UUID REFERENCES public.composition_log(id) ON DELETE SET NULL,
  mode TEXT NOT NULL DEFAULT 'internal' CHECK (mode IN ('internal', 'external')),
  status TEXT NOT NULL DEFAULT 'prompt_ready'
         CHECK (status IN ('prompt_ready','generating_internal','waiting_external_upload','script_received','approved')),
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

-- 6. EVOLUÇÃO DE COLUNAS (V3 a V8)

-- Narrative Components
ALTER TABLE public.narrative_components 
  ADD COLUMN IF NOT EXISTS category TEXT,
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effectiveness_score NUMERIC DEFAULT 0.0,
  ADD COLUMN IF NOT EXISTS behavior_flag TEXT DEFAULT 'rotative',
  ADD COLUMN IF NOT EXISTS usage_mode TEXT DEFAULT 'when_compatible',
  ADD COLUMN IF NOT EXISTS tags JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS compatibility_notes TEXT,
  ADD COLUMN IF NOT EXISTS active BOOLEAN DEFAULT true;

-- Themes
ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS title_structure_asset_id UUID REFERENCES public.narrative_components(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS origin_mode TEXT DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS execution_mode TEXT DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS composition_log_id UUID REFERENCES public.composition_log(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS script_execution_id UUID REFERENCES public.script_executions(id) ON DELETE SET NULL;

-- Projects
ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS default_execution_mode TEXT DEFAULT 'internal',
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS puc_promise TEXT,
  ADD COLUMN IF NOT EXISTS editing_sop JSONB,
  ADD COLUMN IF NOT EXISTS traceability_summary JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS traceability_sources JSONB DEFAULT '{}'::jsonb;

-- Analytics
ALTER TABLE public.analytics
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS watch_time_avg NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS dna_hook_id UUID,
  ADD COLUMN IF NOT EXISTS dna_cta_id UUID,
  ADD COLUMN IF NOT EXISTS dna_title_structure TEXT,
  ADD COLUMN IF NOT EXISTS dna_editorial_pillar TEXT,
  ADD COLUMN IF NOT EXISTS dna_ai_model TEXT,
  ADD COLUMN IF NOT EXISTS composition_log_id UUID REFERENCES public.composition_log(id);

-- Content Hub
ALTER TABLE public.content_hub
  ADD COLUMN IF NOT EXISTS thumbnail_description TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS hook_id UUID,
  ADD COLUMN IF NOT EXISTS editorial_pillar TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Composition Log
ALTER TABLE public.composition_log
  ADD COLUMN IF NOT EXISTS title_structure_asset_id UUID REFERENCES public.narrative_components(id) ON DELETE SET NULL,
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

-- 7. RLS & POLICIES (Configuração Final)
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_hub ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.narrative_components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.composition_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.script_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Limpeza de políticas para evitar duplicatas
DROP POLICY IF EXISTS "Allow public access" ON projects;
DROP POLICY IF EXISTS "Users can only access their own projects" ON projects;
DROP POLICY IF EXISTS "Users can access content from their own projects" ON content_hub;
DROP POLICY IF EXISTS "Users can access narrative components from their own projects" ON narrative_components;
DROP POLICY IF EXISTS "Allow public access themes" ON public.themes;
DROP POLICY IF EXISTS "Allow read composition_log" ON public.composition_log;
DROP POLICY IF EXISTS "Allow insert composition_log" ON public.composition_log;
DROP POLICY IF EXISTS "Allow public access script_executions" ON public.script_executions;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;

-- Criação das políticas unificadas
CREATE POLICY "Users can only access their own projects" ON projects FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can access content from their own projects" ON content_hub FOR ALL USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = content_hub.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Users can access narrative components from their own projects" ON narrative_components FOR ALL USING (EXISTS (SELECT 1 FROM projects WHERE projects.id = narrative_components.project_id AND projects.user_id = auth.uid()));
CREATE POLICY "Allow public access themes" ON public.themes FOR ALL USING (true);
CREATE POLICY "Allow read composition_log" ON public.composition_log FOR SELECT USING (true);
CREATE POLICY "Allow insert composition_log" ON public.composition_log FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow public access script_executions" ON public.script_executions FOR ALL USING (true);
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);

-- 8. FUNCTIONS & TRIGGERS
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = NOW(); RETURN NEW; END; $$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_script_executions_updated_at ON public.script_executions;
CREATE TRIGGER trg_script_executions_updated_at BEFORE UPDATE ON public.script_executions FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 9. ADMIN SYSTEM (Opcional - Necessário se usar perfis)
CREATE OR REPLACE FUNCTION public.is_admin() RETURNS boolean AS $$ BEGIN RETURN (SELECT role = 'admin' FROM public.profiles WHERE id = auth.uid()); END; $$ LANGUAGE plpgsql SECURITY DEFINER;

-- ############################################################################
-- SCRIPT FINALIZADO
-- ############################################################################
