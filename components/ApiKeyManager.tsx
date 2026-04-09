'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ApiKeyManager({ onSave }: { onSave?: () => void }) {
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState('');
  const [serverStatus, setServerStatus] = useState({ hasOpenAI: false, hasGemini: false });

  useEffect(() => {
    fetchServerStatus();
    if (supabase) {
      fetchKeys();
    } else {
      setOpenaiKey(localStorage.getItem('yt_openai_key') || '');
      setGeminiKey(localStorage.getItem('yt_gemini_key') || '');
    }
  }, []);

  async function fetchServerStatus() {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (e) {
      console.error("Erro ao checar status do servidor de IA", e);
    }
  }


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
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <h3 style={{ margin: 0 }}>Gerenciamento de Chaves de API</h3>
        <span className="badge blue" style={{ fontSize: '0.75rem' }}>Modelo Híbrido Ativo</span>
      </div>

      <p style={{ fontSize: '0.9rem', opacity: 0.6, marginBottom: '2rem' }}>
        O sistema prioriza chaves locais. Se os campos estiverem vazios, serão utilizadas as chaves de infraestrutura do sistema.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '2rem' }}>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ opacity: 0.6 }}>Chave OpenAI (Override)</span>
            {serverStatus.hasOpenAI && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>✓ INFRA ATIVA</span>}
          </label>
          <input 
            type="password"
            value={openaiKey}
            onChange={(e) => setOpenaiKey(e.target.value)}
            placeholder={serverStatus.hasOpenAI ? "Usando Padrão do Sistema (Opcional)" : "sk-..."}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          />
        </div>
        <div>
          <label style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ opacity: 0.6 }}>Chave Google Gemini (Override)</span>
            {serverStatus.hasGemini && <span style={{ fontSize: '0.7rem', color: 'var(--primary)', fontWeight: 'bold' }}>✓ INFRA ATIVA</span>}
          </label>
          <input 
            type="password"
            value={geminiKey}
            onChange={(e) => setGeminiKey(e.target.value)}
            placeholder={serverStatus.hasGemini ? "Usando Padrão do Sistema (Opcional)" : "AIza..."}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          />
        </div>
      </div>
      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button className="btn-primary" onClick={saveKeys}>Salvar Overrides</button>
        {saveStatus && <span style={{ fontSize: '0.9rem', color: 'var(--primary)' }}>{saveStatus}</span>}
      </div>

      <div className="alert info" style={{ marginTop: '2rem', background: 'rgba(52, 152, 219, 0.05)', border: '1px solid rgba(52, 152, 219, 0.2)', padding: '1rem', borderRadius: '8px' }}>
        <p style={{ fontSize: '0.85rem', margin: 0 }}>
          <strong>Segurança:</strong> Suas chaves de override permanecem criptografadas no banco ou em seu navegador. O tráfego de geração agora é processado via Proxy Backend para evitar exposição.
        </p>
      </div>
    </section>
  );
}

