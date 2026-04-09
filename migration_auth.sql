-- SQL MIGRATION: AUTH & RLS (Multi-User Support)
-- Local: Supabase SQL Editor

-- 1. Adicionar coluna user_id na tabela projects
ALTER TABLE IF EXISTS projects 
ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id) DEFAULT auth.uid();

-- 2. Ativar RLS (Caso não esteja ativo)
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE content_hub ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics ENABLE ROW LEVEL SECURITY;
ALTER TABLE narrative_components ENABLE ROW LEVEL SECURITY;

-- 3. Limpar políticas públicas antigas (CUIDADO: Isso remove o acesso "Allowed Public")
DROP POLICY IF EXISTS "Allow public access" ON projects;
DROP POLICY IF EXISTS "Allow public access" ON content_hub;
DROP POLICY IF EXISTS "Allow public access" ON narrative_components;
DROP POLICY IF EXISTS "Allow public access" ON ai_assets;
DROP POLICY IF EXISTS "Allow public access" ON analytics;

-- 4. Criar Políticas de Privacidade Estrita (Propriedade de Usuário)

-- Projects: O usuário só vê o que ele criou
CREATE POLICY "Users can only access their own projects"
ON projects FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

-- Content Hub: O usuário só vê conteúdo de projetos que ele possui
CREATE POLICY "Users can access content from their own projects"
ON content_hub FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = content_hub.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Narrative Components: O usuário só vê componentes de projetos que ele possui
CREATE POLICY "Users can access narrative components from their own projects"
ON narrative_components FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects 
    WHERE projects.id = narrative_components.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- AI Assets: O usuário só vê assets de projetos que ele possui
CREATE POLICY "Users can access AI assets from their own projects"
ON ai_assets FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects 
    JOIN content_hub ON content_hub.id = ai_assets.content_id
    WHERE projects.id = content_hub.project_id 
    AND projects.user_id = auth.uid()
  )
);

-- Analytics: O usuário só vê analytics de projetos que ele possui
CREATE POLICY "Users can access analytics from their own projects"
ON analytics FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM projects 
    JOIN content_hub ON content_hub.id = analytics.content_id
    WHERE projects.id = content_hub.project_id 
    AND projects.user_id = auth.uid()
  )
);
