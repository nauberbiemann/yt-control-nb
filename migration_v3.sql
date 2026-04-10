-- Content OS - Migration V3 (Strategic Evolution)
-- Execute no Supabase SQL Editor

-- 1. BANCO DE TEMAS (ThemeBank)
CREATE TABLE IF NOT EXISTS public.themes (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE NOT NULL,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  editorial_pillar TEXT, -- ex: 'Educação', 'Entretenimento', 'Autoridade', 'Conversão'
  status TEXT DEFAULT 'backlog' CHECK (status IN ('backlog', 'vetted', 'scripted', 'published')),
  hook_id UUID, -- referência ao hook escolhido (narrative_components)
  title_structure TEXT, -- S1-S5
  priority INTEGER DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ENRIQUECER narrative_components COM CAMPOS ESTRATÉGICOS
ALTER TABLE public.narrative_components 
  ADD COLUMN IF NOT EXISTS category TEXT, -- para hooks: 'Curiosidade', 'Dor', 'Autoridade', etc
  ADD COLUMN IF NOT EXISTS usage_count INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_used_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS effectiveness_score NUMERIC DEFAULT 0.0;

-- 3. ENRIQUECER analytics COM ENTRADA MANUAL DE MÉTRICAS
ALTER TABLE public.analytics
  ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES public.projects(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS video_url TEXT,
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,
  ADD COLUMN IF NOT EXISTS watch_time_avg NUMERIC DEFAULT 0, -- minutos
  ADD COLUMN IF NOT EXISTS likes INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS comments INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS shares INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS manual_entry BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ,
  -- COMPOSITION DNA (o que foi usado para gerar o vídeo)
  ADD COLUMN IF NOT EXISTS dna_hook_id UUID,
  ADD COLUMN IF NOT EXISTS dna_cta_id UUID,
  ADD COLUMN IF NOT EXISTS dna_title_structure TEXT,
  ADD COLUMN IF NOT EXISTS dna_editorial_pillar TEXT,
  ADD COLUMN IF NOT EXISTS dna_ai_model TEXT;

-- 4. ENRIQUECER content_hub com thumbnail_directive
ALTER TABLE public.content_hub
  ADD COLUMN IF NOT EXISTS thumbnail_description TEXT,   -- Conceito visual descritivo
  ADD COLUMN IF NOT EXISTS thumbnail_prompt TEXT,        -- Prompt para Midjourney/DALL-E
  ADD COLUMN IF NOT EXISTS thumbnail_url TEXT,           -- URL da imagem gerada externamente
  ADD COLUMN IF NOT EXISTS hook_id UUID,
  ADD COLUMN IF NOT EXISTS editorial_pillar TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- 5. RLS para themes
ALTER TABLE public.themes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access themes" ON public.themes;
CREATE POLICY "Allow public access themes" ON public.themes FOR ALL USING (true);

-- 6. Índices de performance
CREATE INDEX IF NOT EXISTS idx_themes_project_id ON public.themes(project_id);
CREATE INDEX IF NOT EXISTS idx_themes_status ON public.themes(status);
CREATE INDEX IF NOT EXISTS idx_themes_pillar ON public.themes(editorial_pillar);
