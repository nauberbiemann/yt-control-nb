-- Content OS - Migration V11 (Fixes for Local Rescue Tool)
-- Execute este script no SQL Editor do Supabase para corrigir o erro de envio.

-- 1. Remover a restrição antiga do status para permitir 'scheduled'
ALTER TABLE public.themes
  DROP CONSTRAINT IF EXISTS themes_status_check;

ALTER TABLE public.themes
  ADD CONSTRAINT themes_status_check 
  CHECK (status IN ('backlog', 'vetted', 'scripted', 'scheduled', 'published'));

-- 2. Adicionar campos extras que foram criados no localStorage e faltavam no Supabase
ALTER TABLE public.themes
  ADD COLUMN IF NOT EXISTS target_publish_date TEXT,
  ADD COLUMN IF NOT EXISTS production_assets JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS selected_structure TEXT;
