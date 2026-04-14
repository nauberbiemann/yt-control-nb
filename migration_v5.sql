-- Content OS - Migration V5 (Title Structure Traceability)
-- Execute no Supabase SQL Editor apos migration_v4.sql

-- 1. Persistir o ativo real de estrutura de titulo usado em cada tema
ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS title_structure_asset_id UUID
  REFERENCES public.narrative_components(id)
  ON DELETE SET NULL;

-- 2. Persistir o ativo real de estrutura de titulo no DNA imutavel
ALTER TABLE public.composition_log
  ADD COLUMN IF NOT EXISTS title_structure_asset_id UUID
  REFERENCES public.narrative_components(id)
  ON DELETE SET NULL;

-- 3. Indices para analise futura
CREATE INDEX IF NOT EXISTS idx_themes_title_structure_asset_id
  ON public.themes(title_structure_asset_id);

CREATE INDEX IF NOT EXISTS idx_composition_log_title_structure_asset_id
  ON public.composition_log(title_structure_asset_id);
