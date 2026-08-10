-- Writer Studio Cloud / Content OS Migration V12
-- Description: Adiciona suporte a Canais de Referência, Roteiros Virais, Thumbnails de Benchmark e DNA do Próprio Canal (.md) por Projeto

ALTER TABLE IF EXISTS public.projects
  ADD COLUMN IF NOT EXISTS reference_channels JSONB DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS channel_dna JSONB DEFAULT '{}'::jsonb;

-- Comentário explicativo nas colunas
COMMENT ON COLUMN public.projects.reference_channels IS 'Lista de Canais de Referência (com Roteiros Virais e Thumbnails de Benchmark) do projeto';
COMMENT ON COLUMN public.projects.channel_dna IS 'DNA Estratégico do Próprio Canal (Manual .md, Prompts STYLE_DNA, CHARACTER_DNA, EXTRAS_DNA, NEGATIVE_DNA)';
