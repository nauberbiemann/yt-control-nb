-- SQL MIGRATION: USER PROFILES & MASTER APPROVAL
-- Local: Supabase SQL Editor

-- 1. Criar Tabela de Perfis
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID REFERENCES auth.users(id) ON DELETE CASCADE PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'suspended')),
  role TEXT DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Ativar RLS na tabela profiles
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Visualização (Profiles)
-- O usuário pode ver seu próprio perfil. O Master pode ver todos.
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id OR (SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

CREATE POLICY "Admins can update all profiles" 
ON public.profiles FOR UPDATE 
USING ((SELECT role FROM public.profiles WHERE id = auth.uid()) = 'admin');

-- 4. Função Automática de Cadastro (Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status, role)
  VALUES (
    new.id, 
    new.email, 
    -- Auto-aprovação para o Master
    CASE WHEN new.email = 'nauber.biemann@gmail.com' THEN 'approved' ELSE 'pending' END,
    -- Cargo de Admin para o Master
    CASE WHEN new.email = 'nauber.biemann@gmail.com' THEN 'admin' ELSE 'user' END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Vincular Gatilho ao Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 6. Promoção Retroativa (Caso o Master já esteja cadastrado)
UPDATE public.profiles 
SET status = 'approved', role = 'admin' 
WHERE email = 'nauber.biemann@gmail.com';
