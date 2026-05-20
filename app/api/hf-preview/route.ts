import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

/**
 * GET /api/hf-preview?template=hf_focus
 * Returns the template HTML with mock HF_DATA_JSON injected so it can be
 * rendered in an iframe for visual inspection — no CapCut or Python required.
 *
 * Optional query params:
 *   title    — overrides default mock title
 *   subtitle — overrides default mock subtitle
 *   metrics  — overrides default mock metrics (use "-" to hide)
 *   bg       — if "dark", adds a #0d1117 background so the transparent
 *              template is visible; default "dark"
 */
export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl;
  const template = (searchParams.get('template') || 'hf_focus').toLowerCase();

  // Strict regex to prevent any path traversal (only allows lowercase alphanumeric + underscore)
  if (!/^[a-z0-9_]+$/.test(template)) {
    return new NextResponse(`Invalid template name format: "${template}"`, {
      status: 400,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  const filePath = path.join(process.cwd(), 'lib', 'hf-templates', `${template}.html`);

  if (!fs.existsSync(filePath)) {
    const templatesDir = path.join(process.cwd(), 'lib', 'hf-templates');
    let availableTemplates: string[] = [];
    if (fs.existsSync(templatesDir)) {
      availableTemplates = fs.readdirSync(templatesDir)
        .filter(f => f.endsWith('.html'))
        .map(f => f.replace('.html', ''));
    }

    return new NextResponse(`Template "${template}" not found. Valid templates: ${availableTemplates.join(', ')}`, {
      status: 404,
      headers: { 'Content-Type': 'text/plain' },
    });
  }

  let html = fs.readFileSync(filePath, 'utf-8');

  // Build mock data — callers can override via query params for custom testing
  const mockData = {
    title:    searchParams.get('title')    || 'Exemplo de Destaque',
    subtitle: searchParams.get('subtitle') || 'Texto de apoio narrativo para visualização do template',
    metrics:  searchParams.get('metrics')  || '+127%',
    channel_name: searchParams.get('channel_name') || searchParams.get('channel') || 'YT CONTROL',
    background_prompt: 'Dark cinematic environment, no text, no people, moody lighting, preview mode',
  };

  // Inject mock data into {{HF_DATA_JSON}} placeholder
  html = html.replace('{{HF_DATA_JSON}}', JSON.stringify(mockData));

  // Replace remaining legacy placeholders that some templates use as innerHTML fallback
  html = html.replace(/\{\{TITLE\}\}/g,    mockData.title);
  html = html.replace(/\{\{SUBTITLE\}\}/g, mockData.subtitle);
  html = html.replace(/\{\{METRICS\}\}/g,  mockData.metrics);

  // Add a dark preview background so the transparent template is visible.
  // Injected BEFORE the closing </head> tag — never modifies existing styles.
  const previewStyle = `
<style>
  /* hf-preview: dark backdrop so the transparent template is visible in the iframe */
  html, body, #root { background: #0d1117 !important; }
</style>`;
  html = html.replace('</head>', `${previewStyle}\n</head>`);

  // Add a "template name" watermark at the very top-left for quick identification
  const watermark = `
<div style="
  position: fixed; top: 8px; left: 12px; z-index: 9999;
  font-family: monospace; font-size: 14px; font-weight: 700;
  color: rgba(255,255,255,0.35); pointer-events: none;
  letter-spacing: 0.05em;
">${template}</div>`;
  html = html.replace('<body>', `<body>${watermark}`);

  return new NextResponse(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      // Prevent caching so edits to the template files are immediately visible
      'Cache-Control': 'no-store',
    },
  });
}
