'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ApiKeyManager({ onSave }: { onSave?: () => void }) {
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState('');

  useEffect(() => {
    if (supabase) {
      fetchKeys();
    }
  }, []);

  async function fetchKeys() {
    if (supabase) {
      const { data } = await supabase.from('user_configs').select('openai_key, gemini_key').single();
      if (data) {
        setOpenaiKey(data.openai_key || '');
        setGeminiKey(data.gemini_key || '');
        return;
      }
    }
    
    // Fallback LocalStorage
    setOpenaiKey(localStorage.getItem('yt_openai_key') || '');
    setGeminiKey(localStorage.getItem('yt_gemini_key') || '');
  }

  async function saveKeys() {
    setSaveStatus('Salvando...');
    
    // Salva no LocalStorage
    localStorage.setItem('yt_openai_key', openaiKey);
    localStorage.setItem('yt_gemini_key', geminiKey);

    if (supabase) {
      const { error } = await supabase
        .from('user_configs')
        .update({ openai_key: openaiKey, gemini_key: geminiKey })
        .eq('id', (await supabase.from('user_configs').select('id').single()).data?.id);
        
      if (error) {
        setSaveStatus('Erro Supabase, salvo localmente');
      } else {
        setSaveStatus('Salvo globalmente!');
        if (onSave) setTimeout(onSave, 1500);
      }
    } else {
      setSaveStatus('Salvo localmente no Browser!');
      if (onSave) setTimeout(onSave, 1500);
    }
    
    setTimeout(() => setSaveStatus(''), 3000);
  }

  return (
    <section className="glass-card" style={{ marginTop: '2rem' }}>
      <h3 style={{ marginBottom: '1.5rem' }}>Gerenciamento de Chaves de API</h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.6 }}>Chave OpenAI</label>
          <input 
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder="sk-..."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          />
        </div>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', opacity: 0.6 }}>Chave Google Gemini</label>
          <input 
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder="AIza..."
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          />
        </div>
      </div>
      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn-primary" onClick={saveKeys}>Salvar Chaves</button>
        {saveStatus && <span style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>{saveStatus}</span>}
      </div>
    </section>
  );
}
