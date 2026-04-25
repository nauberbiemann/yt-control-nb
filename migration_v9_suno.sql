-- Content OS - Migration V9 (Suno Studio Integrations)
-- Execute no Supabase SQL Editor para criar a tabela de histórico do Suno.

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE IF NOT EXISTS public.suno_generations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  preset_used TEXT NOT NULL,
  idea_prompt TEXT,
  style_prompt TEXT,
  lyrics TEXT,
  veo3_prompts TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- RLS (Row Level Security) - Permite leitura e escrita publica (similar aos outros modulos)
-- ============================================================================

ALTER TABLE public.suno_generations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow public access suno_generations" ON public.suno_generations;
CREATE POLICY "Allow public access suno_generations"
  ON public.suno_generations
  FOR ALL
  USING (true)
  WITH CHECK (true);
