'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';

export default function ApiKeyManager({ onSave }: { onSave?: () => void }) {
  const [openaiKey, setOpenaiKey] = useState('');
  const [geminiKey, setGeminiKey] = useState('');
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'ok' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const [serverStatus, setServerStatus] = useState({ hasOpenAI: false, hasGemini: false });

  useEffect(() => {
    fetchServerStatus();
    loadKeys();
  }, []);

  async function fetchServerStatus() {
    try {
      const res = await fetch('/api/ai/status');
      if (res.ok) {
        const data = await res.json();
        setServerStatus(data);
      }
    } catch (e) {
      console.warn('Erro ao checar status do servidor de IA', e);
    }
  }

  function loadKeys() {
    setOpenaiKey(localStorage.getItem('yt_openai_key') || '');
    setGeminiKey(localStorage.getItem('yt_gemini_key') || '');
  }

  async function saveKeys() {
    setSaveStatus('saving');
    setSaveMessage('Salvando...');

    try {
      localStorage.setItem('yt_openai_key', openaiKey.trim());
      localStorage.setItem('yt_gemini_key', geminiKey.trim());

      setSaveStatus('ok');
      setSaveMessage('Chaves salvas! Motor de IA pronto.');
      if (onSave) setTimeout(onSave, 1200);
    } catch (err: any) {
      setSaveStatus('error');
      setSaveMessage('Erro ao salvar: ' + (err.message || 'Tente novamente'));
    }

    setTimeout(() => {
      setSaveStatus('idle');
      setSaveMessage('');
    }, 3000);
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
            placeholder={serverStatus.hasOpenAI ? 'Usando Padrão do Sistema (Opcional)' : 'sk-...'}
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
            placeholder={serverStatus.hasGemini ? 'Usando Padrão do Sistema (Opcional)' : 'AIza...'}
            style={{ width: '100%', padding: '0.75rem', borderRadius: '8px', background: '#111', color: '#fff', border: '1px solid var(--card-border)' }}
          />
        </div>
      </div>

      <div style={{ marginTop: '1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <button
          className="btn-primary"
          onClick={saveKeys}
          disabled={saveStatus === 'saving'}
          style={{ opacity: saveStatus === 'saving' ? 0.7 : 1 }}
        >
          {saveStatus === 'saving' ? 'Salvando...' : 'Salvar Overrides'}
        </button>
        {saveMessage && (
          <span style={{
            fontSize: '0.9rem',
            color: saveStatus === 'error' ? '#f87171' : 'var(--primary)',
            transition: 'opacity 0.3s',
          }}>
            {saveMessage}
          </span>
        )}
      </div>

      <div className="alert info" style={{ marginTop: '2rem', background: 'rgba(52, 152, 219, 0.05)', border: '1px solid rgba(52, 152, 219, 0.2)', padding: '1rem', borderRadius: '8px' }}>
        <p style={{ fontSize: '0.85rem', margin: 0 }}>
          <strong>Segurança:</strong> Suas chaves de override permanecem criptografadas no banco ou em seu navegador. O tráfego de geração agora é processado via Proxy Backend para evitar exposição.
        </p>
      </div>
    </section>
  );
}
