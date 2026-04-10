-- SQL MIGRATION: USER PROFILES & MASTER APPROVAL (V2 - Anti-Recursion)
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

-- 2. Ativar RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 3. Função de Verificação de Admin (SECURITY DEFINER para evitar recursão)
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean AS $$
BEGIN
  RETURN (
    SELECT role = 'admin' 
    FROM public.profiles 
    WHERE id = auth.uid()
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Políticas de Visualização (Profiles)
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "Users can view own profile" 
ON public.profiles FOR SELECT 
USING (auth.uid() = id OR public.is_admin());

DROP POLICY IF EXISTS "Admins can update all profiles" ON public.profiles;
CREATE POLICY "Admins can update all profiles" 
ON public.profiles FOR UPDATE 
USING (public.is_admin());

-- 5. Função Automática de Cadastro (Trigger)
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, status, role)
  VALUES (
    new.id, 
    new.email, 
    CASE WHEN new.email = 'nauber.biemann@gmail.com' THEN 'approved' ELSE 'pending' END,
    CASE WHEN new.email = 'nauber.biemann@gmail.com' THEN 'admin' ELSE 'user' END
  );
  RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Vincular Gatilho ao Auth
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE PROCEDURE public.handle_new_user();

-- 7. Promoção Retroativa (Caso o Master já esteja cadastrado)
INSERT INTO public.profiles (id, email, status, role)
SELECT id, email, 'approved', 'admin'
FROM auth.users
WHERE email = 'nauber.biemann@gmail.com'
ON CONFLICT (id) DO UPDATE 
SET status = 'approved', role = 'admin';
