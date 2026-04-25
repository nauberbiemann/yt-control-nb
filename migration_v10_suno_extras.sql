-- Migration para adicionar colunas extras na tabela suno_generations
-- Necessário para salvar o Título e as Configurações Avançadas

ALTER TABLE public.suno_generations
ADD COLUMN IF NOT EXISTS song_title text,
ADD COLUMN IF NOT EXISTS config_prompt text;
