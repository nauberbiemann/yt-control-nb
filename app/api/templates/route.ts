import path from 'path';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

const TEMPLATE_META: Record<string, { label: string; accent: string; note: string }> = {
  hf_break: { label: 'Full Motion Graphic', accent: '#00B4FF', note: 'tela cheia · sem avatar' },
  hf_focus: { label: 'Foco Executivo', accent: '#00FF88', note: 'painel direito · avatar livre' },
  hf_double: { label: 'Double Panel', accent: '#00FF88', note: 'split 35/65 · avatar esquerda' },
  hf_floating: { label: 'Floating Cards', accent: '#00FF88', note: 'cards orbitais · sem avatar' },
  hf_vertical: { label: 'Vertical Side Cut', accent: '#00C8FF', note: 'moldura esquerda · conteúdo direita' },
  hf_holo: { label: 'Holographic Room', accent: '#00C8FF', note: 'multi-painel · avatar implícito' },
  hf_documentary: { label: 'Documentary Frame', accent: '#FF5050', note: 'Netflix style · vignette' },
  hf_dynamic: { label: 'Dynamic Crops', accent: '#FFFFFF', note: 'viewfinder + grid 1/3' },
  hf_face_top: { label: 'Rosto Superior', accent: '#FFB400', note: 'avatar top-right' },
  hf_face_bottom: { label: 'Rosto Inferior', accent: '#00C8FF', note: 'avatar bottom-left' },
  
  hf_code_terminal: { label: 'Code Terminal', accent: '#00C8FF', note: 'terminal de desenvolvimento animado' },
  hf_data_chart: { label: 'Data Chart', accent: '#00FF88', note: 'visualização de gráficos e métricas' },
  hf_notification: { label: 'Notification Toast', accent: '#FFB400', note: 'cards e avisos do sistema' },
  hf_quote: { label: 'Quote Highlight', accent: '#FFFFFF', note: 'bloco de citação editorial de aspas' },
  hf_reddit: { label: 'Reddit Thread', accent: '#FF4500', note: 'tópico do fórum reddit premium' },
  hf_spotify: { label: 'Spotify Player', accent: '#1DB954', note: 'reprodutor de áudio e música' },
  hf_world_map: { label: 'World Map', accent: '#00B4FF', note: 'mapa mundial com pontos dinâmicos' },
  hf_x_post: { label: 'X (Twitter) Post', accent: '#FFFFFF', note: 'publicação oficial no feed do X' }
};

export async function GET(req: NextRequest) {
  try {
    const skillTemplatesDir = path.join(
      process.cwd(),
      '..', 'Produção em Massa', '1-ContentFlow',
      'avatar-hyperframes-editor-skill', 'projects', 'default', 'templates'
    );

    let templatesBase = skillTemplatesDir;
    const localFallback = path.join(process.cwd(), 'lib', 'hf-templates');

    if (!fs.existsSync(templatesBase) && fs.existsSync(localFallback)) {
      templatesBase = localFallback;
    }

    let files: string[] = [];
    if (fs.existsSync(templatesBase)) {
      files = fs.readdirSync(templatesBase).filter(f => f.endsWith('.html'));
    }

    const templatesList = files.map(file => {
      const id = file.replace('.html', '');
      const meta = TEMPLATE_META[id] || {
        label: id.replace(/^hf_/, '').split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        accent: '#FFFFFF',
        note: 'template físico detectado'
      };

      return {
        id,
        label: meta.label,
        accent: meta.accent,
        note: meta.note
      };
    });

    // Ensure they have a consistent sort (e.g. alphabetical or by default indices)
    templatesList.sort((a, b) => a.id.localeCompare(b.id));

    return NextResponse.json({ templates: templatesList });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Erro ao escanear templates.' }, { status: 500 });
  }
}
