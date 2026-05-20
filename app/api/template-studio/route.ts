import path from 'path';
import fs from 'fs';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Templates are now discovered dynamically from the filesystem in lib/hf-templates/

// Google Fonts map
const FONT_IMPORT_MAP: Record<string, string> = {
  Inter: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;700;900&display=swap',
  Outfit: 'https://fonts.googleapis.com/css2?family=Outfit:wght@400;700;900&display=swap',
  'Space Grotesk': 'https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;700&display=swap',
  Sora: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;700;800&display=swap',
};

// Style profile: maps to opacity/blur tweaks for dark overlays
const STYLE_PROFILE_ADJUSTMENTS: Record<string, { opacity: string; blur: string; borderOpacity: string }> = {
  Tech:      { opacity: '0.75', blur: '18px', borderOpacity: '0.22' },
  Business:  { opacity: '0.82', blur: '22px', borderOpacity: '0.28' },
  Education: { opacity: '0.70', blur: '14px', borderOpacity: '0.18' },
  Lifestyle: { opacity: '0.65', blur: '24px', borderOpacity: '0.20' },
};

function customizeTemplate(
  content: string,
  opts: {
    primaryColor: string;
    secondaryColor: string;
    fontFamily: string;
    styleProfile: string;
    channelName: string;
  }
): string {
  const { primaryColor, secondaryColor, fontFamily, styleProfile, channelName } = opts;
  const profile = STYLE_PROFILE_ADJUSTMENTS[styleProfile] || STYLE_PROFILE_ADJUSTMENTS['Tech'];
  const fontImport = FONT_IMPORT_MAP[fontFamily] || FONT_IMPORT_MAP['Inter'];

  let out = content;

  // 1. Replace Google Fonts import URL
  out = out.replace(
    /href="https:\/\/fonts\.googleapis\.com\/css2[^"]+"/g,
    `href="${fontImport}"`
  );

  // 2. Replace font-family references in CSS
  out = out.replace(
    /font-family:\s*'Inter'[^;]*;/g,
    `font-family: '${fontFamily}', Arial, sans-serif;`
  );
  out = out.replace(
    /font-family:\s*'Inter'[^,]*/g,
    `font-family: '${fontFamily}'`
  );

  // 3. Replace cyan primary accent color (#00C8FF and rgba(0,200,255,...))
  out = out.replace(/#00C8FF/g, primaryColor);
  out = out.replace(/#00c8ff/gi, primaryColor);
  // rgba for cyan: rgba(0,200,255, → convert primaryColor hex to rgb
  const pR = parseInt(primaryColor.slice(1, 3), 16);
  const pG = parseInt(primaryColor.slice(3, 5), 16);
  const pB = parseInt(primaryColor.slice(5, 7), 16);
  out = out.replace(/rgba\(0,\s*200,\s*255,/g, `rgba(${pR},${pG},${pB},`);
  out = out.replace(/rgba\(0,\s*180,\s*255,/g, `rgba(${pR},${pG},${pB},`);
  out = out.replace(/rgba\(0,\s*160,\s*255,/g, `rgba(${pR},${pG},${pB},`);
  out = out.replace(/rgba\(0,\s*100,\s*255,/g, `rgba(${pR},${pG},${pB},`);

  // 4. Replace green secondary accent (#00FF88 and rgba(0,255,136,...))
  out = out.replace(/#00FF88/g, secondaryColor);
  out = out.replace(/#00ff88/gi, secondaryColor);
  const sR = parseInt(secondaryColor.slice(1, 3), 16);
  const sG = parseInt(secondaryColor.slice(3, 5), 16);
  const sB = parseInt(secondaryColor.slice(5, 7), 16);
  out = out.replace(/rgba\(0,\s*255,\s*136,/g, `rgba(${sR},${sG},${sB},`);

  // 5. Replace amber/gold secondary (#FFB400 and rgba(255,180,0,...)) with secondaryColor
  out = out.replace(/#FFB400/g, secondaryColor);
  out = out.replace(/#ffb400/gi, secondaryColor);
  out = out.replace(/rgba\(255,\s*180,\s*0,/g, `rgba(${sR},${sG},${sB},`);

  // 6. Inject channel name as a comment at the top
  out = out.replace(
    /<!doctype html>/i,
    `<!doctype html>\n<!-- Template Studio · Canal: ${channelName} · Gerado em: ${new Date().toISOString()} -->`
  );

  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      primaryColor = '#00C8FF',
      secondaryColor = '#00FF88',
      fontFamily = 'Inter',
      styleProfile = 'Tech',
      channelName = 'Canal',
      selectedTemplates = null,
    } = body;

    // Validate hex colors
    const hexPattern = /^#[0-9A-Fa-f]{6}$/;
    if (!hexPattern.test(primaryColor) || !hexPattern.test(secondaryColor)) {
      return NextResponse.json({ error: 'Cores inválidas. Use o formato #RRGGBB.' }, { status: 400 });
    }

    // Try to locate the default templates directory
    const skillTemplatesDir = path.join(
      process.cwd(),
      '..', 'Produção em Massa', '1-ContentFlow',
      'avatar-hyperframes-editor-skill', 'projects', 'default', 'templates'
    );

    // Primary: look relative to the Next.js project root as a sibling
    let templatesBase = skillTemplatesDir;

    // Fallback: look for a local copy bundled with the Next.js app
    const localFallback = path.join(process.cwd(), 'lib', 'hf-templates');
    if (!fs.existsSync(templatesBase) && fs.existsSync(localFallback)) {
      templatesBase = localFallback;
    }

    // Dinamically discover all html templates from the physical templates directory
    let discoveredFiles: string[] = [];
    if (fs.existsSync(templatesBase)) {
      discoveredFiles = fs.readdirSync(templatesBase)
        .filter((file) => file.endsWith('.html'));
    }

    // Security sanitization and resolving templates list to process
    const targets = (selectedTemplates && Array.isArray(selectedTemplates))
      ? selectedTemplates.filter((filename: string) => {
          return filename.endsWith('.html') &&
                 !filename.includes('/') &&
                 !filename.includes('\\') &&
                 !filename.includes('..');
        })
      : discoveredFiles;

    const results: { filename: string; content: string }[] = [];
    const missing: string[] = [];

    for (const filename of targets) {
      const filePath = path.join(templatesBase, filename);

      if (!fs.existsSync(filePath)) {
        missing.push(filename);
        continue;
      }

      const raw = fs.readFileSync(filePath, 'utf-8');
      const customized = customizeTemplate(raw, {
        primaryColor,
        secondaryColor,
        fontFamily,
        styleProfile,
        channelName,
      });

      results.push({ filename, content: customized });
    }

    return NextResponse.json({
      templates: results,
      missing,
      meta: {
        primaryColor,
        secondaryColor,
        fontFamily,
        styleProfile,
        channelName,
        generatedAt: new Date().toISOString(),
        total: results.length,
      },
    });
  } catch (err: any) {
    console.error('[template-studio] Error:', err);
    return NextResponse.json({ error: err.message || 'Erro interno.' }, { status: 500 });
  }
}
