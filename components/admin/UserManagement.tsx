'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { isMasterAccessEmail, MASTER_ACCESS_EMAILS } from '@/lib/auth-access';
import {
  Users,
  ShieldCheck,
  UserX,
  UserCheck,
  ShieldAlert,
  Search,
  Filter,
  MoreVertical
} from 'lucide-react';

export default function UserManagement() {
  const [profiles, setProfiles] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const pendingProfiles = profiles.filter((profile) => !isMasterAccessEmail(profile.email) && profile.status === 'pending');

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      setError(null);

      const query = supabase
        .from('profiles')
        .select('id, email, status, role, created_at, updated_at')
        .order('created_at', { ascending: false });

      const timeout = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Tempo limite excedido ao acessar a base master.')), 12000);
      });

      const { data, error } = await Promise.race([query, timeout]) as Awaited<typeof query>;

      if (error) throw error;
      setProfiles(data || []);
    } catch (err: any) {
      console.error('Erro ao buscar perfis:', err);
      setError(err?.message || 'Falha ao acessar os pedidos de aprovação.');
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateStatus = async (id: string, newStatus: string) => {
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ status: newStatus, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setProfiles(prev => prev.map(p => p.id === id ? { ...p, status: newStatus } : p));
    } catch (err) {
      alert('Erro ao atualizar status.');
    }
  };

  const handleUpdateRole = async (id: string, newRole: string) => {
    if (!confirm(`Deseja alterar o cargo deste usuário para ${newRole.toUpperCase()}?`)) return;

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ role: newRole, updated_at: new Date().toISOString() })
        .eq('id', id);

      if (error) throw error;

      setProfiles(prev => prev.map(p => p.id === id ? { ...p, role: newRole } : p));
    } catch (err) {
      alert('Erro ao atualizar cargo.');
    }
  };
  const filteredProfiles = profiles.filter(p => {
    const matchesSearch = p.email.toLowerCase().includes(search.toLowerCase());
    const matchesFilter = filter === 'all' || p.status === filter;
    return matchesSearch && matchesFilter;
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-20 gap-4">
        <div className="w-8 h-8 border-2 border-sage/20 border-t-sage animate-spin rounded-full" />
        <span className="text-[10px] font-black text-white/20 uppercase tracking-widest">Acessando Master Database...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div>
          <h3 className="text-[10px] font-black text-sage uppercase tracking-[4px] mb-1">Security & Access</h3>
          <h2 className="text-3xl font-black text-white tracking-tighter italic">Gestão de Autoridade Master</h2>
        </div>

        <div className="glass-card p-10 border-red-500/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-red-400">Falha ao carregar pedidos de acesso</p>
          <p className="text-white/60 text-sm mt-4 max-w-2xl leading-relaxed">{error}</p>
          <p className="text-white/30 text-xs mt-3">
            Isso normalmente indica que a tabela <code className="text-white/70">profiles</code> ainda não está acessível com as policies corretas no Supabase.
          </p>
          <div className="flex gap-3 mt-8">
            <button
              onClick={fetchProfiles}
              className="btn-primary py-3 px-5 text-[10px] bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500 hover:text-white"
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h3 className="text-[10px] font-black text-sage uppercase tracking-[4px] mb-1">Security & Access</h3>
          <h2 className="text-3xl font-black text-white tracking-tighter italic">Gestão de Autoridade Master</h2>
          <p className="text-white/40 text-xs mt-3 max-w-2xl">
            O email master autorizado nesta fase é <span className="text-white font-semibold">{MASTER_ACCESS_EMAILS[0]}</span>.
            Novos cadastros entram como <span className="text-yellow-400 font-semibold">pending</span> e só acessam o app após aprovação manual.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={16} />
            <input
              className="bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-3 text-xs text-white outline-none focus:border-sage/40 transition-all w-[240px]"
              placeholder="Buscar por e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="flex bg-white/5 p-1 rounded-xl border border-white/5">
            {['all', 'pending', 'approved', 'suspended'].map(f => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f ? 'bg-blue-500 text-white shadow-lg shadow-blue-500/20' : 'text-white/40 hover:text-white'}`}
              >
                {f === 'all' ? 'Tudo' : f}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border-yellow-500/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Pedidos Pendentes</p>
          <p className="text-3xl font-black text-yellow-400 mt-2">{pendingProfiles.length}</p>
        </div>
        <div className="glass-card p-5 border-blue-500/20">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Aprovados</p>
          <p className="text-3xl font-black text-blue-300 mt-2">{profiles.filter((profile) => isMasterAccessEmail(profile.email) || profile.status === 'approved').length}</p>
        </div>
        <div className="glass-card p-5 border-white/10">
          <p className="text-[10px] font-black uppercase tracking-widest text-white/30">Master Atual</p>
          <p className="text-sm font-black text-white mt-3 break-all">{MASTER_ACCESS_EMAILS[0]}</p>
        </div>
      </div>

      <div className="glass-card overflow-hidden border-white/5 bg-midnight/40 ring-1 ring-white/5">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="bg-white/[0.02] border-b border-white/5">
              <th className="px-8 py-6 text-[10px] font-black text-white/20 uppercase tracking-widest">Usuário</th>
              <th className="px-8 py-6 text-[10px] font-black text-white/20 uppercase tracking-widest">Status Atual</th>
              <th className="px-8 py-6 text-[10px] font-black text-white/20 uppercase tracking-widest">Nível de Acesso</th>
              <th className="px-8 py-6 text-[10px] font-black text-white/20 uppercase tracking-widest text-right">Ações de Comando</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5">
            {filteredProfiles.map(p => (
              <tr key={p.id} className="hover:bg-white/[0.02] transition-colors group">
                <td className="px-8 py-6">
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-white group-hover:text-sage transition-colors">{p.email}</span>
                    <span className="text-[9px] text-white/20 uppercase font-mono mt-1">ID: {p.id.split('-')[0]}...</span>
                  </div>
                </td>
                <td className="px-8 py-6">
                  <span className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest border rounded-full ${isMasterAccessEmail(p.email) || p.status === 'approved' ? 'bg-sage/10 text-sage border-sage/20' :
                      p.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                        'bg-red-500/10 text-red-500 border-red-500/20'
                    }`}>
                    {isMasterAccessEmail(p.email) ? 'approved' : p.status}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <div
                    className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest ${
                      isMasterAccessEmail(p.email) ? 'text-blue-300' : 'text-white/40'
                    }`}
                  >
                    {isMasterAccessEmail(p.email) ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    {isMasterAccessEmail(p.email) ? 'master' : p.role}
                  </div>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-3">
                    {!isMasterAccessEmail(p.email) && p.status !== 'approved' && (
                      <button
                        onClick={() => handleUpdateStatus(p.id, 'approved')}
                        className="btn-primary py-2 px-4 flex items-center gap-2 text-[9px] bg-blue-500/10 border-blue-500/20 text-blue-300 hover:bg-blue-500 hover:text-white shadow-lg shadow-blue-500/10"
                      >
                        <UserCheck size={14} /> APROVAR
                      </button>
                    )}
                    {!isMasterAccessEmail(p.email) && p.status === 'approved' && (
                      <button
                        onClick={() => handleUpdateStatus(p.id, 'suspended')}
                        className="flex items-center gap-2 py-2 px-4 border border-red-500/20 bg-red-500/5 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                      >
                        <UserX size={14} /> SUSPENDER
                      </button>
                    )}
                    {isMasterAccessEmail(p.email) && (
                      <span className="inline-flex items-center px-3 py-2 text-[9px] font-black uppercase tracking-widest text-blue-300 border border-blue-500/20 bg-blue-500/5 rounded-xl">
                        Conta Master Protegida
                      </span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {filteredProfiles.length === 0 && (
              <tr>
                <td colSpan={4} className="px-8 py-20 text-center">
                  <p className="text-white/20 text-[10px] font-black uppercase tracking-[0.3em]">Nenhum usuário encontrado na base.</p>
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="p-8 rounded-[32px] border border-white/5 bg-white/[0.01] flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 rounded-2xl bg-sage/10 border border-sage/20 flex items-center justify-center text-sage">
            <Users size={20} />
          </div>
          <div>
            <p className="text-[10px] font-black text-white/30 uppercase tracking-widest">Total de Registros</p>
            <p className="text-xl font-black text-white">{profiles.length}</p>
          </div>
        </div>
        <button
          onClick={fetchProfiles}
          className="text-[10px] font-black text-white/20 hover:text-sage uppercase tracking-widest transition-all"
        >
          Sincronizar Lista
        </button>
      </div>
    </div>
  );
}
