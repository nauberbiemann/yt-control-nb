-- ============================================================================
-- MIGRATION: Add strategic DNA columns to projects table
-- Date: 2026-04-19
-- Context: These fields (phd_strategy, persona_matrix, editorial_line,
--          narrative_voice, thumb_strategy) were being stored only in
--          localStorage, causing data loss on page reload as the cloud
--          version (without these fields) was overwriting the local version.
--
-- HOW TO RUN:
--   1. Open your Supabase dashboard at https://supabase.com
--   2. Go to "SQL Editor" in the left menu
--   3. Click "+ New query"
--   4. Paste this entire script and click "RUN"
-- ============================================================================

ALTER TABLE public.projects
  ADD COLUMN IF NOT EXISTS phd_strategy      JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS persona_matrix    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS editorial_line    JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS narrative_voice   JSONB DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS thumb_strategy    JSONB DEFAULT '{}'::jsonb;

-- Verify the columns were added
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'projects'
  AND column_name IN ('phd_strategy','persona_matrix','editorial_line','narrative_voice','thumb_strategy')
ORDER BY column_name;
