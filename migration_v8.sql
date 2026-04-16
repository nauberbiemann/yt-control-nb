-- Content OS - Migration V8 (Projects Schema Sync)
-- Add fields required by the current app payload and keep the save flow stable.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS default_execution_mode TEXT DEFAULT 'internal';

ALTER TABLE public.projects
  DROP CONSTRAINT IF EXISTS chk_projects_default_execution_mode;

ALTER TABLE public.projects
  ADD CONSTRAINT chk_projects_default_execution_mode
  CHECK (default_execution_mode IN ('internal', 'external'));
