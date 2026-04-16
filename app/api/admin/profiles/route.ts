import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { isMasterAccessEmail } from '@/lib/auth-access';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type ProfileStatus = 'pending' | 'approved' | 'suspended';

const allowedStatuses: ProfileStatus[] = ['pending', 'approved', 'suspended'];

const getServiceRoleClient = () => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
};

const getSessionScopedClient = (token: string) => {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    throw new Error('As credenciais públicas do Supabase não estão configuradas.');
  }

  return createClient(supabaseUrl, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
    global: {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    },
  });
};

const getAuthorizedAdminContext = async (request: NextRequest) => {
  const authorization = request.headers.get('authorization') || '';
  const token = authorization.startsWith('Bearer ') ? authorization.slice(7).trim() : '';

  if (!token) {
    return NextResponse.json({ error: 'Sessão ausente. Faça login novamente.' }, { status: 401 });
  }

  const serviceRoleClient = getServiceRoleClient();
  const authClient = serviceRoleClient || getSessionScopedClient(token);
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(token);

  if (error || !user) {
    return NextResponse.json({ error: 'Não foi possível validar a sessão atual.' }, { status: 401 });
  }

  if (!isMasterAccessEmail(user.email)) {
    return NextResponse.json({ error: 'Acesso negado. Apenas o usuário master pode acessar este painel.' }, { status: 403 });
  }

  return {
    user,
    profilesClient: serviceRoleClient || getSessionScopedClient(token),
    usingServiceRole: Boolean(serviceRoleClient),
  };
};

export async function GET(request: NextRequest) {
  try {
    const authContext = await getAuthorizedAdminContext(request);
    if (authContext instanceof NextResponse) {
      return authContext;
    }

    const { profilesClient, usingServiceRole } = authContext;
    const { data, error } = await profilesClient
      .from('profiles')
      .select('id, email, status, role, created_at, updated_at')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message ||
            (usingServiceRole
              ? 'Falha ao buscar perfis.'
              : 'Falha ao buscar perfis com a sessão atual. Verifique as policies da tabela profiles no Supabase.'),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ profiles: data || [] });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha interna ao buscar perfis.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const authContext = await getAuthorizedAdminContext(request);
    if (authContext instanceof NextResponse) {
      return authContext;
    }

    const { profilesClient, usingServiceRole } = authContext;
    const body = await request.json().catch(() => ({}));
    const id = typeof body?.id === 'string' ? body.id : '';
    const status = typeof body?.status === 'string' ? body.status : '';

    if (!id || !allowedStatuses.includes(status as ProfileStatus)) {
      return NextResponse.json({ error: 'Payload inválido para atualização de status.' }, { status: 400 });
    }

    const { data: targetProfile, error: targetError } = await profilesClient
      .from('profiles')
      .select('id, email')
      .eq('id', id)
      .maybeSingle();

    if (targetError) {
      return NextResponse.json({ error: targetError.message || 'Falha ao localizar o perfil alvo.' }, { status: 500 });
    }

    if (!targetProfile) {
      return NextResponse.json({ error: 'Perfil não encontrado.' }, { status: 404 });
    }

    if (isMasterAccessEmail(targetProfile.email)) {
      return NextResponse.json({ error: 'A conta master não pode ser alterada por esta ação.' }, { status: 403 });
    }

    const { data, error } = await profilesClient
      .from('profiles')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select('id, email, status, role, created_at, updated_at')
      .single();

    if (error) {
      return NextResponse.json(
        {
          error:
            error.message ||
            (usingServiceRole
              ? 'Falha ao atualizar o perfil.'
              : 'Falha ao atualizar o perfil com a sessão atual. Verifique se a policy de UPDATE da tabela profiles está habilitada para o usuário master.'),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ profile: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Falha interna ao atualizar o perfil.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
