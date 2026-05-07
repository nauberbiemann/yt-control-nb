import JSZip from 'jszip';

export interface TemplateFileEntry {
  filename: string;
  content: string;
}

export interface TemplateStudioMeta {
  primaryColor: string;
  secondaryColor: string;
  fontFamily: string;
  styleProfile: string;
  channelName: string;
  generatedAt: string;
  total: number;
}

/**
 * Downloads the generated templates as a ZIP file.
 * Uses JSZip to bundle all HTML files and triggers browser download.
 */
export async function downloadTemplateZip(
  templates: TemplateFileEntry[],
  meta: TemplateStudioMeta
): Promise<void> {
  const zip = new JSZip();

  // Add each template file
  for (const { filename, content } of templates) {
    zip.file(filename, content);
  }

  // Add a README with setup instructions
  const readme = buildReadme(meta);
  zip.file('README.txt', readme);

  // Generate blob and trigger download
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const safeName = meta.channelName.replace(/[^a-zA-Z0-9_-]/g, '_');
  link.href = url;
  link.download = `${safeName}_Template_HTML.zip`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

function buildReadme(meta: TemplateStudioMeta): string {
  return `TEMPLATE STUDIO — ${meta.channelName}
Gerado em: ${new Date(meta.generatedAt).toLocaleString('pt-BR')}
${'─'.repeat(60)}

CONFIGURAÇÕES APLICADAS
  Cor Primária  : ${meta.primaryColor}
  Cor Secundária: ${meta.secondaryColor}
  Fonte         : ${meta.fontFamily}
  Perfil        : ${meta.styleProfile}

COMO USAR
  1. Extraia esta pasta dentro de:
       [Canal]/Template HTML/

  2. A estrutura final deve ser:
       [Canal]/
         Template HTML/
           hf_focus.html
           hf_break.html
           ...
         Assets V14/
           render_hyperframes.bat
           ...

  3. Quando o .bat for executado, ele vai buscar automaticamente
     esta pasta Template HTML/ para os overlays deste canal.

${'─'.repeat(60)}
TEMPLATES INCLUÍDOS (${meta.total})
  hf_focus.html       → Foco Executivo (cards laterais)
  hf_break.html       → Full Motion Graphic (tela cheia)
  hf_double.html      → Double Panel (split 35/65)
  hf_floating.html    → Floating Cards (Apple Vision Pro)
  hf_holo.html        → Holographic Room (painéis neon)
  hf_vertical.html    → Vertical Side Cut (moldura esquerda)
  hf_face_bottom.html → Rosto Canto Inferior (moldura bottom-left)
  hf_face_top.html    → Rosto Canto Superior (moldura top-right)
  hf_documentary.html → Documentary Frame (Netflix style)
  hf_dynamic.html     → Dynamic Crops (viewfinder + grid 1/3)
`;
}
