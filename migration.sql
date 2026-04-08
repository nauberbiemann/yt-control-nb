-- Writer Studio Cloud - Supabase Schema Migration (Dia 17)
-- Description: Centralized database for Multi-LLM YouTube Management

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Tabela de Projetos (Ex: Dev Zen, Warhammer, etc)
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  puc TEXT,
  visual_style TEXT,
  accent_color TEXT DEFAULT '#9BB0A5',
  target_persona JSONB,
  ai_engine_rules JSONB,
  playlists JSONB,
  phd_strategy JSONB,
  persona_matrix JSONB,
  editorial_line JSONB,
  narrative_voice JSONB,
  detailed_sop JSONB,
  thumb_strategy JSONB,
  metaphor_library TEXT,
  prohibited_terms TEXT,
  base_system_instruction TEXT,
  schedules JSONB,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. Calendário de Postagem (Dia 15)
CREATE TABLE IF NOT EXISTS post_calendar (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  day_of_week TEXT NOT NULL, -- Terça-feira, Quinta-feira, Domingo
  default_time TIME DEFAULT '08:00:00',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Central de Conteúdo com Títulos Virais (Dia 17)
CREATE TABLE IF NOT EXISTS content_hub (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  theme TEXT NOT NULL,
  title_structure TEXT, -- S1 a S5
  viral_title TEXT,
  category TEXT,
  playlist TEXT,
  post_date TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'backlog', -- backlog, generating, done, published
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Assets de IA com Versionamento (Dia 12)
CREATE TABLE IF NOT EXISTS ai_assets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES content_hub(id) ON DELETE CASCADE,
  model_used TEXT NOT NULL,
  full_script TEXT,
  b_roll_json JSONB, -- Lista de 20 B-Rolls
  overlays_json JSONB, -- Lista de 20 Overlays
  thumbnail_prompt TEXT,
  tags TEXT[],
  description_optimized TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 5. Analytics & Performance
CREATE TABLE IF NOT EXISTS analytics (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  content_id UUID REFERENCES content_hub(id) ON DELETE CASCADE,
  views INTEGER DEFAULT 0,
  ctr NUMERIC DEFAULT 0.0,
  retention NUMERIC DEFAULT 0.0,
  post_performance_log JSONB,
  composition_log JSONB, -- Engine BI: { theme_id, hook_id, cta_id, title_structure_id, editorial_pillar_id }
  match_score NUMERIC DEFAULT 0.0,
  editorial_pillar TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 6. Componentes Narrativos (Hooks, CTAs, Estruturas)
CREATE TABLE IF NOT EXISTS narrative_components (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  type TEXT NOT NULL, -- 'Hook', 'CTA', 'Title Structure'
  name TEXT NOT NULL,
  description TEXT,
  content_pattern TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- RLS (Row Level Security) - Basic Setup
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE post_calendar ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_hub ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_components ENABLE ROW LEVEL SECURITY;

-- Creating simple policies to allow all access (Public for Dev)
-- Note: In a production app, you should restrict this to authenticated users only.
CREATE POLICY "Allow public access" ON projects FOR ALL USING (true);
CREATE POLICY "Allow public access" ON post_calendar FOR ALL USING (true);
CREATE POLICY "Allow public access" ON content_hub FOR ALL USING (true);
CREATE POLICY "Allow public access" ON ai_assets FOR ALL USING (true);
CREATE POLICY "Allow public access" ON analytics FOR ALL USING (true);
CREATE POLICY "Allow public access" ON narrative_components FOR ALL USING (true);
