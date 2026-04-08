'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { AI_MODELS } from '@/lib/ai-config';

export default function EngineSelector() {
  const [activeEngine, setActiveEngine] = useState<'openai' | 'gemini'>('openai');
  const [selectedModel, setSelectedModel] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (supabase) {
      fetchConfig();
    } else {
      setLoading(false);
    }
  }, []);

  async function fetchConfig() {
    // Tenta carregar do Supabase ou do LocalStorage (Fallback)
    if (supabase) {
      try {
        const { data } = await supabase.from('user_configs').select('*').single();
        if (data) {
          setActiveEngine(data.active_engine);
          setSelectedModel(data.selected_model);
          return;
        }
      } catch (err) { console.warn('Supabase fetch failed, using local storage.'); }
    }
    
    const localEngine = localStorage.getItem('yt_active_engine') as 'openai' | 'gemini';
    const localModel = localStorage.getItem('yt_selected_model');
    if (localEngine) setActiveEngine(localEngine);
    if (localModel) setSelectedModel(localModel);
  }

  async function updateConfig(engine: 'openai' | 'gemini', model: string) {
    setActiveEngine(engine);
    setSelectedModel(model);
    
    localStorage.setItem('yt_active_engine', engine);
    localStorage.setItem('yt_selected_model', model);

    if (supabase) {
      await supabase.from('user_configs').update({ active_engine: engine, selected_model: model }).eq('id', (await supabase.from('user_configs').select('id').single()).data?.id);
    }
  }

  if (loading) return <div>Carregando Motores...</div>;

  return (
    <section className="model-selector" style={{ flexDirection: 'column', gap: '1rem' }}>
      {!supabase && (
        <div style={{ 
          border: localStorage.getItem('yt_openai_key') || localStorage.getItem('yt_gemini_key') ? '1px solid var(--primary)' : '1px solid #f87171', 
          padding: '1rem', 
          borderRadius: '12px', 
          background: localStorage.getItem('yt_openai_key') || localStorage.getItem('yt_gemini_key') ? 'rgba(155, 176, 165, 0.1)' : 'rgba(248, 113, 113, 0.1)', 
          marginBottom: '1rem' 
        }}>
          {localStorage.getItem('yt_openai_key') || localStorage.getItem('yt_gemini_key') ? (
            <p style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>✅ Operando em Modo Local. Suas chaves estão salvas neste navegador.</p>
          ) : (
            <p style={{ color: '#f87171', fontSize: '0.9rem' }}>⚠️ Modo Preview: Supabase não configurado. Suas alterações serão salvas apenas localmente.</p>
          )}
        </div>
      )}
      
      <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
        <div className={`glass-card ${activeEngine === 'openai' ? 'active-engine' : ''}`} style={{ flex: 1, border: activeEngine === 'openai' ? '1px solid var(--primary)' : '1px solid var(--card-border)' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
            OpenAI Engine
            {activeEngine === 'openai' && <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>Ativo</span>}
          </h3>
          <select 
            value={activeEngine === 'openai' ? selectedModel : ''}
            onChange={(e) => updateConfig('openai', e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          >
            {AI_MODELS.openai.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button 
            onClick={() => updateConfig('openai', AI_MODELS.openai[0].id)}
            className="btn-primary" 
            style={{ marginTop: '1rem', width: '100%', display: activeEngine === 'openai' ? 'none' : 'block' }}
          >
            Ativar OpenAI
          </button>
        </div>

        <div className={`glass-card ${activeEngine === 'gemini' ? 'active-engine' : ''}`} style={{ flex: 1, border: activeEngine === 'gemini' ? '1px solid var(--primary)' : '1px solid var(--card-border)' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
            Google Gemini Engine
            {activeEngine === 'gemini' && <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>Ativo</span>}
          </h3>
          <select 
            value={activeEngine === 'gemini' ? selectedModel : ''}
            onChange={(e) => updateConfig('gemini', e.target.value)}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          >
            {AI_MODELS.gemini.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <button 
            onClick={() => updateConfig('gemini', AI_MODELS.gemini[0].id)}
            className="btn-primary" 
            style={{ marginTop: '1rem', width: '100%', display: activeEngine === 'gemini' ? 'none' : 'block' }}
          >
            Ativar Gemini
          </button>
        </div>
      </div>
    </section>
  );
}
