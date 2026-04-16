'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { Zap, Mail, Lock, UserPlus, LogIn } from 'lucide-react';

export default function AuthOverlay() {
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (isLogin) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({ email, password });
        if (error) throw error;
        alert("Cadastro realizado! Verifique seu e-mail (se confirmado no Supabase) ou faça login.");
        setIsLogin(true);
      }
    } catch (err: any) {
      setError(err.message || "Erro na autenticação.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-midnight/90 backdrop-blur-xl animate-in fade-in duration-500">
      <div className="glass-card w-full max-w-md p-10 border-blue-500/20 shadow-[0_0_50px_rgba(59,130,246,0.1)] relative overflow-hidden">
        {/* Decorative Background */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-blue-500/10 blur-3xl rounded-full" />
        
        <div className="flex flex-col items-center gap-4 mb-8">
          <div className="p-3 bg-blue-500/20 rounded-2xl border border-blue-500/30">
            <Zap className="text-blue-400" size={32} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-black tracking-tighter text-white">CONTENT OS</h1>
            <p className="text-[10px] uppercase font-black tracking-[0.3em] text-blue-400 opacity-80 mt-1">Writer Studio Cloud</p>
          </div>
        </div>

        <div className="flex bg-white/5 p-1 rounded-xl mb-8">
          <button 
            onClick={() => setIsLogin(true)}
            className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${isLogin ? 'bg-blue-500 text-midnight shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <LogIn size={14} /> LOGIN
          </button>
          <button 
            onClick={() => setIsLogin(false)}
            className={`flex-1 py-3 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-2 ${!isLogin ? 'bg-blue-500 text-midnight shadow-lg' : 'text-white/40 hover:text-white'}`}
          >
            <UserPlus size={14} /> CADASTRAR
          </button>
        </div>

        <form onSubmit={handleAuth} className="space-y-4">
          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-white/40 ml-1">E-mail Corporativo</label>
            <div className="relative">
              <Mail className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-white font-bold"
                placeholder="nome@exemplo.com"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase font-black tracking-widest text-white/40 ml-1">Senha de Acesso</label>
            <div className="relative">
              <Lock className="absolute left-4 top-1/2 -translate-y-1/2 text-white/20" size={18} />
              <input 
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-xl pl-12 pr-4 py-4 outline-none focus:ring-4 focus:ring-blue-500/10 focus:border-blue-500 transition-all text-white font-bold"
                placeholder="••••••••"
              />
            </div>
          </div>

          {error && (
            <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-500 text-[11px] font-bold text-center animate-in slide-in-from-top-2">
              {error}
            </div>
          )}

          <button 
            disabled={loading}
            className="w-full bg-blue-500 text-midnight py-4 rounded-xl font-black text-xs uppercase tracking-widest shadow-[0_0_20px_rgba(59,130,246,0.3)] hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-wait mt-4"
          >
            {loading ? "PROCESSANDO..." : isLogin ? "ENTRAR NO SISTEMA" : "CRIAR CONTA PRIVADA"}
          </button>
        </form>

        <p className="text-center text-[10px] text-white/20 mt-8 uppercase tracking-widest font-black">
          Infraestrutura Segura via Supabase RLS
        </p>
      </div>
    </div>
  );
}
