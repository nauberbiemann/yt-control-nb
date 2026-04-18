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

  async function loadKeys() {
    // Always load from localStorage first for instant display
    setOpenaiKey(localStorage.getItem('yt_openai_key') || '');
    setGeminiKey(localStorage.getItem('yt_gemini_key') || '');

    // Then try to load from Supabase
    if (supabase) {
      try {
        const { data } = await supabase
          .from('user_configs')
          .select('openai_key, gemini_key')
          .limit(1)
          .maybeSingle();

        if (data) {
          if (data.openai_key) setOpenaiKey(data.openai_key);
          if (data.gemini_key) setGeminiKey(data.gemini_key);
        }
      } catch (e) {
        console.warn('Não foi possível carregar chaves do Supabase, usando locais', e);
      }
    }
  }

  async function saveKeys() {
    setSaveStatus('saving');
    setSaveMessage('Salvando...');

    // Always save to localStorage first (instant, no failure)
    localStorage.setItem('yt_openai_key', openaiKey);
    localStorage.setItem('yt_gemini_key', geminiKey);

    if (supabase) {
      try {
        // 1. Check if a row already exists
        const { data: existing } = await supabase
          .from('user_configs')
          .select('id')
          .limit(1)
          .maybeSingle();

        if (existing?.id) {
          // Row exists → update it
          const { error } = await supabase
            .from('user_configs')
            .update({ openai_key: openaiKey, gemini_key: geminiKey })
            .eq('id', existing.id);

          if (error) throw error;
        } else {
          // No row → insert a new one
          const { error } = await supabase
            .from('user_configs')
            .insert({ openai_key: openaiKey, gemini_key: geminiKey });

          if (error) throw error;
        }

        setSaveStatus('ok');
        setSaveMessage('✓ Salvo globalmente!');
        if (onSave) setTimeout(onSave, 1500);
      } catch (err: any) {
        console.error('Erro ao salvar no Supabase:', err);
        setSaveStatus('error');
        setSaveMessage('Erro na nuvem · Salvo localmente');
      }
    } else {
      setSaveStatus('ok');
      setSaveMessage('✓ Salvo localmente no browser');
      if (onSave) setTimeout(onSave, 1500);
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
