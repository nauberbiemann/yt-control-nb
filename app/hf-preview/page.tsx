'use client';

import { useState, useRef, useEffect } from 'react';

export interface TemplateInfo {
  id: string;
  label: string;
  accent: string;
  note: string;
}

/* ─── Scale helper — fits 1920×1080 inside a container element ─────────────── */
function useContainerScale(ref: React.RefObject<HTMLDivElement | null>) {
  const [scale, setScale] = useState(0.25);

  useEffect(() => {
    if (!ref.current) return;
    const obs = new ResizeObserver(([entry]) => {
      setScale(entry.contentRect.width / 1920);
    });
    obs.observe(ref.current);
    return () => obs.disconnect();
  }, [ref]);

  return scale;
}

/* ─── Single template card ─────────────────────────────────────────────────── */
function TemplateCard({ id, label, accent, note, src }: TemplateInfo & { src: string }) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const scale = useContainerScale(wrapperRef);
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{
      background: '#0d111a',
      border: `1px solid rgba(255,255,255,0.08)`,
      borderRadius: 16,
      overflow: 'hidden',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Card header */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '12px 16px',
        borderBottom: `1px solid rgba(255,255,255,0.06)`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{
            width: 10, height: 10, borderRadius: '50%',
            background: accent, boxShadow: `0 0 8px ${accent}88`, flexShrink: 0,
          }} />
          <div>
            <div style={{ color: '#fff', fontWeight: 700, fontSize: 14 }}>{label}</div>
            <div style={{ color: 'rgba(255,255,255,0.38)', fontSize: 11, marginTop: 1 }}>{note}</div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <code style={{
            background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.5)',
            padding: '3px 8px', borderRadius: 6, fontSize: 11,
          }}>{id}</code>
          <button
            onClick={() => setExpanded(e => !e)}
            title={expanded ? 'Recolher' : 'Expandir'}
            style={{
              background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6,
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px 8px', fontSize: 11,
            }}
          >
            {expanded ? '⊖' : '⊕'}
          </button>
          <a
            href={src}
            target="_blank"
            rel="noopener noreferrer"
            title="Abrir em tela cheia (1920×1080)"
            style={{
              background: 'rgba(255,255,255,0.07)', border: 'none', borderRadius: 6,
              color: 'rgba(255,255,255,0.5)', cursor: 'pointer', padding: '4px 8px',
              fontSize: 11, textDecoration: 'none',
            }}
          >↗</a>
        </div>
      </div>

      {/* 16:9 iframe wrapper */}
      <div
        ref={wrapperRef}
        style={{
          position: 'relative',
          width: '100%',
          paddingBottom: expanded ? `${(1080 / 1920) * 100}%` : '28.125%', // half height by default
          overflow: 'hidden',
          background: '#050810',
          transition: 'padding-bottom 0.3s ease',
        }}
      >
        <div style={{
          position: 'absolute', top: 0, left: 0,
          width: 1920, height: 1080,
          transformOrigin: 'top left',
          transform: `scale(${scale})`,
          pointerEvents: 'none', // prevent accidental clicks inside iframe
        }}>
          <iframe
            src={src}
            width={1920}
            height={1080}
            style={{ border: 'none', display: 'block' }}
            title={`Preview ${id}`}
          />
        </div>
      </div>
    </div>
  );
}

/* ─── Page ─────────────────────────────────────────────────────────────────── */
export default function HfPreviewPage() {
  const [customTitle, setCustomTitle]       = useState('');
  const [customSubtitle, setCustomSubtitle] = useState('');
  const [customMetrics, setCustomMetrics]   = useState('');
  const [customChannel, setCustomChannel]   = useState('');
  const [refreshKey, setRefreshKey]         = useState(0);
  const [templates, setTemplates]           = useState<TemplateInfo[]>([]);
  const [loading, setLoading]               = useState(true);
  const [error, setError]                   = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    fetch('/api/templates')
      .then((res) => {
        if (!res.ok) throw new Error('Falha ao carregar lista de templates.');
        return res.json();
      })
      .then((data) => {
        setTemplates(data.templates || []);
        setError(null);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || 'Erro inesperado ao listar templates.');
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const buildSrc = (id: string) => {
    const params = new URLSearchParams({ template: id });
    if (customTitle)    params.set('title',    customTitle);
    if (customSubtitle) params.set('subtitle', customSubtitle);
    if (customMetrics)  params.set('metrics',  customMetrics);
    if (customChannel)  params.set('channel_name', customChannel);
    return `/api/hf-preview?${params}`;
  };

  return (
    <div style={{
      background: '#050810', minHeight: '100vh',
      fontFamily: 'Inter, Arial, sans-serif', color: '#fff',
    }}>
      {/* Header */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 50,
        background: 'rgba(5,8,16,0.92)', backdropFilter: 'blur(12px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        padding: '16px 32px',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 24,
        flexWrap: 'wrap',
      }}>
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: '-0.03em' }}>
            HyperFrame Preview
          </h1>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.38)', margin: '2px 0 0' }}>
            {loading ? 'Carregando' : templates.length} templates · mock data injetado · animações GSAP ativas
          </p>
        </div>

        {/* Custom data controls */}
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
          {[
            { label: 'channel',  value: customChannel,  set: setCustomChannel,  placeholder: 'Nome do Canal (ex: MEU CANAL)' },
            { label: 'title',    value: customTitle,    set: setCustomTitle,    placeholder: 'Título customizado' },
            { label: 'subtitle', value: customSubtitle, set: setCustomSubtitle, placeholder: 'Subtítulo customizado' },
            { label: 'metrics',  value: customMetrics,  set: setCustomMetrics,  placeholder: 'Métrica (ex: +42%)' },
          ].map(({ label, value, set, placeholder }) => (
            <input
              key={label}
              value={value}
              onChange={e => set(e.target.value)}
              placeholder={placeholder}
              style={{
                background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
                borderRadius: 8, color: '#fff', padding: '7px 12px', fontSize: 13,
                outline: 'none', width: label === 'channel' ? 240 : 200,
              }}
            />
          ))}
          <button
            onClick={() => setRefreshKey(k => k + 1)}
            style={{
              background: 'rgba(0,255,136,0.12)', border: '1px solid rgba(0,255,136,0.3)',
              borderRadius: 8, color: '#00FF88', padding: '7px 16px', fontSize: 13,
              fontWeight: 700, cursor: 'pointer', letterSpacing: '0.04em',
            }}
          >
            ↻ Aplicar
          </button>
        </div>
      </div>

      {/* Grid */}
      <div style={{ padding: '28px 32px' }}>
        {loading && (
          <div style={{ padding: '40px', textAlign: 'center', color: 'rgba(255,255,255,0.5)', fontSize: 14 }}>
            ⏳ Carregando templates dinâmicos...
          </div>
        )}
        {error && (
          <div style={{ padding: '20px', background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.3)', borderRadius: 8, color: '#ff8080', textAlign: 'center', fontSize: 14 }}>
            ⚠️ {error}
          </div>
        )}
        {!loading && !error && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(560px, 1fr))',
            gap: 20,
          }}>
            {templates.map(t => (
              <TemplateCard
                key={`${t.id}-${refreshKey}`}
                {...t}
                src={buildSrc(t.id)}
              />
            ))}
          </div>
        )}
      </div>

      {/* Legend */}
      <div style={{
        margin: '0 32px 40px',
        padding: '16px 20px',
        background: 'rgba(255,255,255,0.03)',
        border: '1px solid rgba(255,255,255,0.06)',
        borderRadius: 12, fontSize: 12,
        color: 'rgba(255,255,255,0.4)',
        lineHeight: 1.7,
      }}>
        <strong style={{ color: 'rgba(255,255,255,0.6)' }}>Como usar:</strong>{' '}
        Clique em <strong>⊕</strong> para expandir o template para a altura completa. Clique em <strong>↗</strong> para
        abrir em 1920×1080 nativo. Use os campos acima para testar textos customizados. Cada iframe executa as
        animações GSAP independentemente — se a animação não completar ou o texto estiver cortado, o template precisa de ajuste.
      </div>
    </div>
  );
}
