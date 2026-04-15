-- Content OS - Migration V7 (Project Payload Alignment)
-- Execute no Supabase SQL Editor apos migration_v6.sql

-- O app passou a salvar campos adicionais no payload de projects.
-- Esta migration alinha o schema para evitar falhas no upsert.

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS project_name TEXT,
  ADD COLUMN IF NOT EXISTS puc_promise TEXT,
  ADD COLUMN IF NOT EXISTS editing_sop JSONB,
  ADD COLUMN IF NOT EXISTS traceability_summary JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS traceability_sources JSONB DEFAULT '{}'::jsonb;

