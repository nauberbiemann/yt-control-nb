'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    fetchProfiles();
  }, []);

  const fetchProfiles = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setProfiles(data || []);
    } catch (err) {
      console.error('Erro ao buscar perfis:', err);
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

  return (
    <div className="space-y-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6">
        <div>
          <h3 className="text-[10px] font-black text-sage uppercase tracking-[4px] mb-1">Security & Access</h3>
          <h2 className="text-3xl font-black text-white tracking-tighter italic">Gestão de Autoridade Master</h2>
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
                className={`px-4 py-2 text-[9px] font-black uppercase tracking-widest rounded-lg transition-all ${filter === f ? 'bg-sage text-midnight' : 'text-white/40 hover:text-white'}`}
              >
                {f === 'all' ? 'Tudo' : f}
              </button>
            ))}
          </div>
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
                  <span className={`px-3 py-1 text-[8px] font-black uppercase tracking-widest border rounded-full ${
                    p.status === 'approved' ? 'bg-sage/10 text-sage border-sage/20' :
                    p.status === 'pending' ? 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20' :
                    'bg-red-500/10 text-red-500 border-red-500/20'
                  }`}>
                    {p.status}
                  </span>
                </td>
                <td className="px-8 py-6">
                  <button 
                    onClick={() => handleUpdateRole(p.id, p.role === 'admin' ? 'user' : 'admin')}
                    className={`flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-all ${p.role === 'admin' ? 'text-sage' : 'text-white/20 hover:text-white'}`}
                  >
                    {p.role === 'admin' ? <ShieldCheck size={14} /> : <ShieldAlert size={14} />}
                    {p.role}
                  </button>
                </td>
                <td className="px-8 py-6 text-right">
                  <div className="flex justify-end gap-3">
                    {p.status !== 'approved' && (
                      <button 
                        onClick={() => handleUpdateStatus(p.id, 'approved')}
                        className="btn-primary py-2 px-4 flex items-center gap-2 text-[9px] bg-sage/20 border-sage/30 text-sage hover:bg-sage hover:text-midnight"
                      >
                        <UserCheck size={14} /> APROVAR
                      </button>
                    )}
                    {p.status === 'approved' && (
                      <button 
                        onClick={() => handleUpdateStatus(p.id, 'suspended')}
                        className="flex items-center gap-2 py-2 px-4 border border-red-500/20 bg-red-500/5 text-red-500/40 hover:text-red-500 hover:bg-red-500/10 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all"
                      >
                        <UserX size={14} /> SUSPENDER
                      </button>
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
