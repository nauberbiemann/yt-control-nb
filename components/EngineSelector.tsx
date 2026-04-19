'use client';

import { useState, useEffect } from 'react';
import { AI_MODELS } from '@/lib/ai-config';
import CustomSelect from './ui/CustomSelect';
import { Cpu, Zap } from 'lucide-react';

// Storage keys
const KEY_ENGINE = 'yt_active_engine';
const KEY_MODEL = 'yt_selected_model';

export default function EngineSelector() {
  const [activeEngine, setActiveEngine] = useState<'openai' | 'gemini'>('openai');
  const [selectedModel, setSelectedModel] = useState('');
  const [hasKeys, setHasKeys] = useState(false);

  useEffect(() => {
    const engine = (localStorage.getItem(KEY_ENGINE) as 'openai' | 'gemini') || 'openai';
    const model = localStorage.getItem(KEY_MODEL) || '';
    const openaiKey = localStorage.getItem('yt_openai_key') || '';
    const geminiKey = localStorage.getItem('yt_gemini_key') || '';
    setActiveEngine(engine);
    setSelectedModel(model);
    setHasKeys(!!(openaiKey || geminiKey));
  }, []);

  function updateConfig(engine: 'openai' | 'gemini', model: string) {
    setActiveEngine(engine);
    setSelectedModel(model);
    localStorage.setItem(KEY_ENGINE, engine);
    localStorage.setItem(KEY_MODEL, model);
  }

  return (
    <section className="model-selector" style={{ flexDirection: 'column', gap: '1rem' }}>
      <div style={{
        border: hasKeys ? '1px solid var(--primary)' : '1px solid #f87171',
        padding: '1rem',
        borderRadius: '12px',
        background: hasKeys ? 'rgba(155, 176, 165, 0.1)' : 'rgba(248, 113, 113, 0.1)',
        marginBottom: '1rem'
      }}>
        {hasKeys ? (
          <p style={{ color: 'var(--primary)', fontSize: '0.9rem' }}>✅ Chaves de API configuradas. Motor de IA operacional.</p>
        ) : (
          <p style={{ color: '#f87171', fontSize: '0.9rem' }}>⚠️ Nenhuma chave de API configurada. Vá em <strong>Gestão Master</strong> para adicionar suas chaves OpenAI ou Gemini.</p>
        )}
      </div>

      <div style={{ display: 'flex', gap: '1rem', width: '100%' }}>
        <div className={`glass-card ${activeEngine === 'openai' ? 'active-engine' : ''}`} style={{ flex: 1, border: activeEngine === 'openai' ? '1px solid var(--primary)' : '1px solid var(--card-border)' }}>
          <h3 style={{ marginBottom: '1rem', display: 'flex', justifyContent: 'space-between' }}>
            OpenAI Engine
            {activeEngine === 'openai' && <span style={{ color: 'var(--primary)', fontSize: '0.8rem' }}>Ativo</span>}
          </h3>
          <CustomSelect
            value={activeEngine === 'openai' ? selectedModel : ''}
            onChange={(val) => updateConfig('openai', val)}
            options={AI_MODELS.openai.map(m => ({ value: m.id, label: m.name }))}
            icon={<Zap size={14} />}
            placeholder="Modelo OpenAI"
          />
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
          <CustomSelect
            value={activeEngine === 'gemini' ? selectedModel : ''}
            onChange={(val) => updateConfig('gemini', val)}
            options={AI_MODELS.gemini.map(m => ({ value: m.id, label: m.name }))}
            icon={<Cpu size={14} />}
            placeholder="Modelo Gemini"
          />
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
