'use client';

import { useState } from 'react';
import { AlertTriangle, Trash2 } from 'lucide-react';

interface DeleteModalProps {
  projectName: string;
  onClose: () => void;
  onConfirm: () => void;
}

export default function DeleteProjectModal({ projectName, onClose, onConfirm }: DeleteModalProps) {
  const [confirmText, setConfirmText] = useState('');

  return (
    <div className="fixed inset-0 z-[1100] bg-black/90 backdrop-blur-md flex items-center justify-center p-4 animate-in">
      <div className="glass-card w-full max-w-md border-red-500/20 p-8 flex flex-col gap-6">
        <div className="flex flex-col items-center text-center gap-4">
          <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center text-red-500">
            <AlertTriangle size={32} />
          </div>
          <div>
            <h2 className="text-xl font-bold text-white">Excluir Projeto?</h2>
            <p className="text-sm text-white/50 mt-2">
              Esta ação é permanente e apagará todo o histórico e configurações do canal <strong>{projectName}</strong>.
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <label className="text-xs uppercase tracking-widest font-bold text-white/30 text-center">
            Instrução de Segurança:
          </label>
          <p className="text-sm text-center text-white/80">
            Digite exatamente <span className="text-red-500 font-mono font-bold">"{projectName}"</span> abaixo:
          </p>
          <input 
            className="bg-white/5 border border-white/10 rounded-xl p-4 focus:border-red-500 outline-none transition-all text-white placeholder:text-white/10 text-center font-medium"
            placeholder="Digite o nome aqui..."
            value={confirmText}
            onChange={(e) => setConfirmText(e.target.value)}
          />
        </div>

        <div className="flex flex-col gap-2">
          <button 
            onClick={onConfirm}
            disabled={confirmText.trim() !== projectName.trim()}
            className={`w-full py-4 rounded-xl font-bold transition-all flex items-center justify-center gap-2 ${
              confirmText.trim() === projectName.trim() 
              ? 'bg-red-500 text-white hover:bg-red-600 shadow-lg shadow-red-500/20' 
              : 'bg-white/5 text-white/20 cursor-not-allowed border border-white/5'
            }`}
          >
            <Trash2 size={18} /> Excluir Definitivamente
          </button>
          <button 
            onClick={onClose}
            className="w-full py-3 text-sm text-white/40 hover:text-white transition-colors"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
