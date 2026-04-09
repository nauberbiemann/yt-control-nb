'use client';

import { supabase } from '@/lib/supabase';
import { ShieldAlert, Clock, LogOut } from 'lucide-react';

export default function AwaitingApproval({ email }: { email: string }) {
  const handleSignOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <div className="fixed inset-0 z-[10000] flex items-center justify-center bg-midnight/95 backdrop-blur-3xl animate-in fade-in duration-700">
      <div className="glass-card w-full max-w-lg p-12 text-center border-sage/20 relative overflow-hidden">
        {/* Animated Background Element */}
        <div className="absolute -top-24 -right-24 w-64 h-64 bg-sage/5 blur-[100px] rounded-full animate-pulse" />
        
        <div className="flex flex-col items-center gap-8 relative z-10">
          <div className="relative">
            <div className="w-24 h-24 rounded-full bg-sage/10 border border-sage/30 flex items-center justify-center">
              <Clock className="text-sage animate-pulse" size={40} />
            </div>
            <div className="absolute -bottom-2 -right-2 p-2 bg-midnight border border-sage/20 rounded-full">
              <ShieldAlert className="text-sage" size={16} />
            </div>
          </div>

          <div className="space-y-4">
            <h1 className="text-3xl font-black tracking-tighter text-white uppercase italic">
              Acesso em Análise
            </h1>
            <div className="h-px w-24 bg-gradient-to-r from-transparent via-sage/50 to-transparent mx-auto" />
            <p className="text-white/40 text-[11px] uppercase font-black tracking-[0.2em] leading-relaxed">
              Sua conta <span className="text-sage">{email}</span> foi criada com sucesso, mas este é um ambiente de alta autoridade e acesso restrito.
            </p>
          </div>

          <div className="p-6 bg-white/5 rounded-[24px] border border-white/5 w-full text-left space-y-4">
            <div className="flex items-start gap-4">
              <div className="w-1.5 h-1.5 rounded-full bg-sage mt-1.5 shrink-0 shadow-[0_0_8px_#9bb0a5]" />
              <p className="text-[10px] font-bold text-white/60 leading-relaxed uppercase">
                O Master User (nauber.biemann) já foi notificado sobre seu cadastro.
              </p>
            </div>
            <div className="flex items-start gap-4">
              <div className="w-1.5 h-1.5 rounded-full bg-sage mt-1.5 shrink-0 shadow-[0_0_8px_#9bb0a5]" />
              <p className="text-[10px] font-bold text-white/60 leading-relaxed uppercase">
                Assim que sua credencial for aprovada, o painel será liberado automaticamente.
              </p>
            </div>
          </div>

          <div className="pt-4 w-full">
            <button 
              onClick={handleSignOut}
              className="w-full flex items-center justify-center gap-3 py-4 bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/10 rounded-2xl text-[10px] font-black uppercase tracking-widest text-white/30 hover:text-white transition-all group"
            >
              <LogOut size={16} className="group-hover:-translate-x-1 transition-transform" />
              Sair e Tentar Outra Conta
            </button>
          </div>

          <footer className="pt-8 opacity-20">
            <p className="text-[8px] font-black uppercase tracking-[4px]">Writer Studio Cloud System • Security Grade 04</p>
          </footer>
        </div>
      </div>
    </div>
  );
}
