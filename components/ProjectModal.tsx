'use client';

import { useState } from 'react';

interface ProjectModalProps {
  onClose: () => void;
  onSave: (project: any) => void;
  initialData?: any;
}

export default function ProjectModal({ onClose, onSave, initialData }: ProjectModalProps) {
  const [name, setName] = useState(initialData?.name || '');
  const [description, setDescription] = useState(initialData?.description || '');
  const [persona, setPersona] = useState(initialData?.persona_prompt || '');
  const [color, setColor] = useState(initialData?.primary_color || '#9bb0a5');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      id: initialData?.id || Date.now(),
      name,
      description,
      persona_prompt: persona,
      primary_color: color,
    });
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100%',
      height: '100%',
      background: 'rgba(0,0,0,0.8)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 1000,
      animation: 'fadeIn 0.2s ease'
    }}>
      <div className="glass-card" style={{ width: '100%', maxWidth: '600px', padding: '2.5rem', border: `1px solid ${color}44` }}>
        <h2 style={{ marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between' }}>
          {initialData ? 'Editar Canal' : 'Novo Projeto de Canal'}
          <button onClick={onClose} style={{ background: 'transparent', border: 'none', color: '#fff', cursor: 'pointer' }}>✕</button>
        </h2>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.6 }}>Nome do Canal</label>
            <input 
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex: Dev Zen"
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.6 }}>Descrição Curta</label>
            <textarea 
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Foco do conteúdo..."
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)', minHeight: '80px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.6 }}>Instruções da Persona (System Prompt)</label>
            <textarea 
              value={persona}
              onChange={(e) => setPersona(e.target.value)}
              placeholder="Digite como a IA deve se comportar para este canal..."
              style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)', minHeight: '120px' }}
            />
          </div>

          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.6 }}>Cor de Destaque</label>
            <input 
              type="color"
              value={color}
              onChange={(e) => setColor(e.target.value)}
              style={{ width: '60px', height: '40px', background: 'none', border: 'none', cursor: 'pointer' }}
            />
          </div>

          <div style={{ display: 'flex', gap: '1rem', marginTop: '1rem' }}>
            <button type="submit" className="btn-primary" style={{ flex: 1 }}>{initialData ? 'Salvar Alterações' : 'Criar Projeto'}</button>
            <button type="button" onClick={onClose} style={{ flex: 1, background: 'transparent', border: '1px solid var(--card-border)', color: '#fff', borderRadius: '12px' }}>Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  );
}
