-- Content OS - Migration V4 (Multi-Tenant Composition Log DNA)
-- Execute no Supabase SQL Editor após migration_v3.sql

-- ──────────────────────────────────────────────────────────────────────────────
-- 1. COMPOSITION LOG — DNA Completo e Imutável
--    Esta tabela não deve ter UPDATE policies. Cada geração é um registro 
--    permanente para rastreabilidade e experimento A/B.
-- ──────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.composition_log (
  id                   UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id           UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  
  -- Motor de IA utilizado na geração
  llm_model_id         TEXT NOT NULL,
  
  -- Array de UUIDs dos assets narrativos usados (Hooks, Metáforas, CTAs)
  narrative_asset_ids  UUID[] DEFAULT '{}',
  
  -- Estrutura de título selecionada para este roteiro
  selected_variation   TEXT CHECK (selected_variation IN ('S1','S2','S3','S4','S5')),
  
  -- Número de tokens utilizados no prompt (para análise de custo/eficiência)
  prompt_tokens        INTEGER DEFAULT 0,
  
  -- Pilar editorial selecionado
  editorial_pillar     TEXT,
  
  -- Tema / título do vídeo
  theme_title          TEXT,
  
  -- PUC do projeto no momento da geração (snapshot imutável)
  puc_snapshot         TEXT,
  
  -- Status do vídeo resultante deste log
  outcome_status       TEXT DEFAULT 'pending' 
                       CHECK (outcome_status IN ('pending','published','cancelled')),
  
  -- Métricas manuais opcionais (inseridas após publicação)
  views                INTEGER,
  ctr                  NUMERIC(5,2),
  retention_pct        NUMERIC(5,2),
  
  -- Timestamp imutável
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Sem updated_at intencional — este registro é imutável
);

-- ──────────────────────────────────────────────────────────────────────────────
-- 2. RLS — Políticas de Segurança
-- ──────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.composition_log ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode ver os logs do seu projeto
DROP POLICY IF EXISTS "Allow read composition_log" ON public.composition_log;
CREATE POLICY "Allow read composition_log" ON public.composition_log 
  FOR SELECT USING (true);

-- Inserção: apenas INSERT permitido (sem UPDATE para garantir imutabilidade)
DROP POLICY IF EXISTS "Allow insert composition_log" ON public.composition_log;
CREATE POLICY "Allow insert composition_log" ON public.composition_log 
  FOR INSERT WITH CHECK (true);

-- ─ Sem política de UPDATE: esta tabela é append-only por design. ─────────────

-- ──────────────────────────────────────────────────────────────────────────────
-- 3. ÍNDICES para Performance
-- ──────────────────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_composition_log_project 
  ON public.composition_log(project_id);

CREATE INDEX IF NOT EXISTS idx_composition_log_variation 
  ON public.composition_log(selected_variation);

CREATE INDEX IF NOT EXISTS idx_composition_log_created 
  ON public.composition_log(created_at DESC);

-- ──────────────────────────────────────────────────────────────────────────────
-- 4. ADICIONAR project_id ao analytics se não tiver (complemento V3)
-- ──────────────────────────────────────────────────────────────────────────────
ALTER TABLE public.analytics 
  ADD COLUMN IF NOT EXISTS composition_log_id UUID REFERENCES public.composition_log(id);
