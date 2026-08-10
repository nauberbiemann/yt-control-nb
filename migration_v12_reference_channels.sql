-- Writer Studio Cloud / Content OS Migration V12
-- Description: Adiciona suporte a Canais de Referência, Roteiros Virais e Thumbnails de Benchmark por Projeto

ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS reference_channels JSONB DEFAULT '[]'::jsonb;

-- Comentário explicativo na coluna
COMMENT ON COLUMN public.projects.reference_channels IS 'Lista de Canais de Referência (com Roteiros Virais e Thumbnails de Benchmark) do projeto';
