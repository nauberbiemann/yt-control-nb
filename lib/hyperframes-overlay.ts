import { normalizeAssetType, sanitizeDownloadFileStem, type SrtAssetRow } from './srt-asset-pipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export type HfStyleOverride = 'dark' | 'light' | 'brand-warm' | 'brand-cool';

const STYLE_LABELS: Record<HfStyleOverride, string> = {
  'dark':       'Dark - fundo escuro, texto claro',
  'light':      'Light - fundo claro, texto escuro',
  'brand-warm': 'Brand Warm - tons quentes, dourado',
  'brand-cool': 'Brand Cool - tons frios, azul/ciano',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const stemToSeed = (stem: string): number =>
  stem.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000;

const resolveVariation = (stem: string, override?: HfStyleOverride) => {
  const seed = stemToSeed(stem);
  const PALETTES: HfStyleOverride[] = ['dark', 'light', 'brand-warm', 'brand-cool'];
  const palette = override ?? PALETTES[Math.floor(seed / 10) % PALETTES.length];
  const MOTIONS = ['smooth', 'punchy', 'subtle'] as const;
  const motion = MOTIONS[Math.floor(seed / 100) % MOTIONS.length];
  const ENTRIES = ['left', 'right', 'up', 'fade'] as const;
  const entry = ENTRIES[seed % ENTRIES.length];
  return { seed, palette, motion, entry, label: STYLE_LABELS[palette] };
};

const safeStartTime = (t: string) => t.replace(/:/g, '-').replace(',', '-');

const escapeCaption = (text: string): string =>
  text
    .replace(/"/g, '\\"')
    .replace(/[%]/g, '%%')
    .replace(/[()]/g, '')      // parens break CMD if blocks
    .replace(/[<>|&^]/g, '')
    .trim()
    .slice(0, 75);

// ─── Timestamp matching ───────────────────────────────────────────────────────
// AI returns timestamps as "[MM:SS]" while SRT rows use "HH:MM:SS,mmm".
// This fuzzy match converts both to seconds and finds the nearest context
// within a tolerance window, preventing the silent fallback to row.texto.

const tsToSec = (ts: string): number => {
  const clean = ts.replace(/[\[\]]/g, '').replace(',', '.').trim();
  const parts = clean.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + (parts[1] || 0);
  if (parts.length === 3) return parts[0] * 3_600 + parts[1] * 60 + (parts[2] || 0);
  return 0;
};

type HfContext = { timestamp: string; visualState?: string; headline: string; subtitle?: string; metrics?: string; bgPrompt?: string };

const findHfContext = (list: HfContext[], startTime: string, toleranceSec = 12): HfContext | undefined => {
  if (!list?.length) return undefined;
  const rowSec = tsToSec(startTime);
  let best: HfContext | undefined;
  let bestDiff = Infinity;
  for (const c of list) {
    const diff = Math.abs(tsToSec(c.timestamp) - rowSec);
    if (diff < bestDiff) { bestDiff = diff; best = c; }
  }
  return bestDiff <= toleranceSec ? best : undefined;
};

// Truncate long fallback text to N words so it fits in overlay templates
const truncateToWords = (text: string, maxWords = 8): string => {
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(' ') + '...';
};

// ─── Local bgPrompt generator ────────────────────────────────────────────────────────
// Generates a photorealistic scene prompt from the SRT texto + visualState.
// Does NOT rely on the AI — works immediately for every HyperFrame row.
// When the AI returns a bgPrompt in hfContextTitles, that takes priority.

const STATE_SCENE: Record<string, string> = {
  hf_face_top:    'Cinematic wide shot, soft window light, blurred neutral background, elegant setting',
  hf_face_bottom: 'Warm intimate environment, shallow depth of field, natural textured background',
  hf_documentary: 'High contrast documentary lighting, architectural or historical setting, moody shadows',
  hf_double:      'Clean split composition, structured modern environment, data-inspired visual',
  hf_floating:    'Bright open space, airy minimal setting, ambient studio light',
  hf_break:       'Dramatic pause, deep shadow contrast, single subject spotlight, cinematic wide',
  hf_holo:        'Premium minimal set, subtle blue holographic glow, dark glass surfaces',
  hf_dynamic:     'High energy environment, fast-motion blur elements, vivid saturated palette',
  hf_vertical:    'Technical workspace, monitors and code or data, cool blue-white tones',
  hf_focus:       'Professional environment, directional soft light, shallow focus, clean composition',
};

export const generateHfBgPrompt = (texto: string, visualState: string, aiPrompt?: string): string => {
  // AI-generated prompt always wins when available
  if (aiPrompt?.trim()) return aiPrompt.trim();
  const scene    = STATE_SCENE[visualState] ?? STATE_SCENE['hf_focus'];
  const subject  = truncateToWords(texto, 10);
  return `Photorealistic still image: ${subject}. ${scene}. 16:9, no people.`;
};

/**
 * Appends HyperFrame background prompts to the existing imagePromptsTxt.
 * Format: HF{rowNumber}: {prompt} — identical to image prompts (Print 2 style).
 * Rows with AI-generated bgPrompt use that; others auto-generate from texto.
 */
export const enrichImagePromptsTxt = (
  baseImagePromptsTxt: string,
  hfRows: SrtAssetRow[],
  hfContextTitles: HfContext[] = [],
): string => {
  if (!hfRows.length) return baseImagePromptsTxt;

  const hfLines = hfRows.map((row) => {
    const context    = findHfContext(hfContextTitles, row.startTime);
    const visualState = context?.visualState ?? 'hf_focus';
    const prompt     = generateHfBgPrompt(row.texto, visualState, context?.bgPrompt);
    return `HF${row.rowNumber}: ${prompt}`;
  });

  const separator = baseImagePromptsTxt.trim() ? '\n' : '';
  return `${baseImagePromptsTxt}${separator}\n${hfLines.join('\n')}`;
};

// Maps visualState → template filename
const TEMPLATE_MAP: Record<string, string> = {
  hf_focus:       'hf_focus.html',
  hf_vertical:    'hf_vertical.html',
  hf_face_bottom: 'hf_face_bottom.html',
  hf_face_top:    'hf_face_top.html',
  hf_double:      'hf_double.html',
  hf_floating:    'hf_floating.html',
  hf_break:       'hf_break.html',
  hf_documentary: 'hf_documentary.html',
  hf_holo:        'hf_holo.html',
  hf_dynamic:     'hf_dynamic.html',
};

const resolveTemplate = (visualState?: string, promptFallback?: string): string => {
  if (visualState && TEMPLATE_MAP[visualState]) return TEMPLATE_MAP[visualState];
  // Legacy fallback: hf:template_name in the prompt field
  if (promptFallback?.startsWith('hf:')) {
    const legacy = promptFallback.slice(3);
    return TEMPLATE_MAP[legacy] ?? 'hf_focus.html';
  }
  return 'hf_focus.html';
};

// Diretório do skill (separado do nome do script para usar cd /d)
const SKILL_DIR =
  'D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\avatar-hyperframes-editor-skill';

// ─── BAT Builder ──────────────────────────────────────────────────────────────

export const buildHyperframesBat = (
  rows: SrtAssetRow[],
  stem: string,
  styleOverride?: HfStyleOverride,
  hfContextTitles?: HfContext[]
): string => {
  const safeStem  = sanitizeDownloadFileStem(stem);
  const hfRows    = rows.filter((r) => normalizeAssetType(r.asset) === 'hyperframe');
  const variation = resolveVariation(safeStem, styleOverride);

  if (hfRows.length === 0) {
    return [
      '@echo off',
      'chcp 65001 >nul',
      'echo Nenhum HyperFrame detectado neste SRT.',
      'pause',
    ].join('\r\n');
  }

  const header = [
    '@echo off',
    'chcp 65001 >nul',
    'color 0A',
    '',
    ':: ================================================================',
    `:: ETAPA 2 -- HyperFrames Overlay Generator`,
    `:: Projeto  : ${safeStem}`,
    `:: Overlays : ${hfRows.length} cena(s)`,
    `:: Estilo   : ${variation.label}`,
    '::',
    ':: Gera arquivos .MOV transparentes (ProRes 4444) via Playwright.',
    ':: Requisito: Python no PATH + pip install playwright + playwright install chromium',
    ':: ================================================================',
    '',
    ':: [1] Python disponivel?',
    'python --version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo.',
    '    echo ERRO: Python nao encontrado no PATH.',
    '    echo Instale em https://www.python.org e marque "Add Python to PATH".',
    '    echo.',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    ':: [2] Script principal existe?',
    `set "SKILL_DIR=${SKILL_DIR}"`,
    'if not exist "%SKILL_DIR%\\inject_and_render.py" (',
    '    color 0C',
    '    echo ERRO: inject_and_render.py nao encontrado em %SKILL_DIR%',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    ':: [3] Pasta de templates — busca em 3 locais em prioridade:',
    '::      1) Template HTML do canal (personalizado)',
    '::      2) lib\\hf-templates\\ do app Next.js  ^(fonte da verdade, sempre atualizado^)',
    '::      3) Skill do André ^(fallback legado^)',
    'set "TEMPLATES_DIR=%~dp0..\\..\\Template HTML"',
    'if exist "%TEMPLATES_DIR%" goto templates_ok',
    '',
    `set "TEMPLATES_DIR=D:\\onedrive\\Downloads\\yt-control-nb\\lib\\hf-templates"`,
    'if exist "%TEMPLATES_DIR%" (',
    '    echo INFO: Usando templates do projeto ^(lib/hf-templates^)',
    '    goto templates_ok',
    ')',
    '',
    `set "TEMPLATES_DIR=${SKILL_DIR}\\projects\\default\\templates"`,
    'echo AVISO: Usando templates padrao do skill.',
    ':templates_ok',
    '',
    ':: [6] Criando pasta de output',
    'set "OUT_DIR=%~dp0hyperframes_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    'echo.',
    'echo --- HYPERFRAMES OVERLAY GENERATOR ---',
    `echo Projeto  : ${safeStem}`,
    'echo Templates: %TEMPLATES_DIR%',
    `echo Overlays : ${hfRows.length} cena(s)`,
    'echo Output   : %OUT_DIR%',
    'echo.',
    '',
    ':: Mudando para o diretorio do skill',
    'cd /d "%SKILL_DIR%"',
    '',
  ];


  const overlayCommands: string[] = [];
  hfRows.forEach((row, i) => {
    // Fuzzy-match by nearest timestamp (AI uses [MM:SS], SRT uses HH:MM:SS,mmm)
    // Positional fallback: if timestamp matching fails (AI returned different TS), use hfContextTitles[i]
    const context = findHfContext(hfContextTitles || [], row.startTime)
      ?? (hfContextTitles && hfContextTitles.length > i ? hfContextTitles[i] : undefined);
    const visualState = context?.visualState;
    const templateFile = resolveTemplate(visualState, row.prompt);
    const stateName   = visualState ?? 'hf_focus';
    const caption     = escapeCaption(row.texto);
    const startSafe   = safeStartTime(row.startTime);

    const endMs = row.endTime
      ? (() => {
          const [h, m, se] = row.endTime.split(':');
          const [s, ms]    = se.split(',');
          return (
            (Number(h) * 3_600_000) +
            (Number(m) * 60_000) +
            (Number(s) * 1_000) +
            Number(ms)
          );
        })()
      : 3000;
    const startMs = (() => {
      const [h, m, se] = row.startTime.split(':');
      const [s, ms]    = se.split(',');
      return (
        (Number(h) * 3_600_000) +
        (Number(m) * 60_000) +
        (Number(s) * 1_000) +
        Number(ms)
      );
    })();
    const durationSec = Math.max(1.0, (endMs - startMs) / 1000).toFixed(2);
    const outName = `hf_${String(row.rowNumber).padStart(3, '0')}_${startSafe}_${stateName}.mov`;

    let titleArg    = '';
    let subtitleArg = '';
    let metricsArg  = '';

    if (context) {
      if (context.headline)                             titleArg    = `--title "${escapeCaption(context.headline)}"`;
      if (context.subtitle && context.subtitle !== '—') subtitleArg = `--subtitle "${escapeCaption(context.subtitle)}"`;
      if (context.metrics  && context.metrics  !== '—') metricsArg  = `--metrics "${escapeCaption(context.metrics)}"`;
    } else {
      // Fallback: truncate SRT text to max 8 words so it fits the overlay
      titleArg = `--title "${escapeCaption(truncateToWords(row.texto, 8))}"`;
    }

    // Instruction comment for templates that need manual CapCut work
    const manualStates = ['hf_face_bottom', 'hf_face_top', 'hf_documentary', 'hf_dynamic'];
    const manualNote   = manualStates.includes(stateName)
      ? `:: NOTA EDITOR: ${stateName} requer reposicionamento manual do avatar no CapCut`
      : '';

    const pyArgs = [
      `--template "%TEMPLATES_DIR%\\${templateFile}"`,
      titleArg,
      subtitleArg,
      metricsArg,
      `--duration ${durationSec}`,
      `--output "%OUT_DIR%\\${outName}"`,
    ].filter(Boolean).join(' ');

    overlayCommands.push(
      `:: --- [${i + 1}/${hfRows.length}] row ${row.rowNumber} | ${row.startTime} | ${stateName} ---`,
      ...(manualNote ? [manualNote] : []),
      `echo [${i + 1}/${hfRows.length}] Gerando: ${outName}`,
      `python inject_and_render.py ${pyArgs}`,
      'if %errorlevel% neq 0 (',
      '    color 0E',
      `    echo AVISO: Falha ao gerar overlay ${row.rowNumber}. Ajuste manualmente.`,
      '    color 0A',
      ') else (',
      `    echo OK: ${outName}`,
      ')',
      'echo.',
    );
  });

  const footer = [
    ':: ================================================================',
    'color 0A',
    'echo.',
    `echo --- PRONTO! ${hfRows.length} overlay(s) MOV gerado(s) em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar no CapCut:',
    'echo   1. Importe a pasta hyperframes_overlays',
    'echo   2. O tempo esta no nome do arquivo (ex: 00-03-55 = 3min55s)',
    'echo   3. Coloque cada .mov ACIMA do avatar na timeline',
    'echo   4. Os arquivos .mov tem fundo transparente (ProRes 4444)',
    'echo   5. Templates hf_face_* e hf_documentary: reposicione o avatar manualmente',
    'echo.',
    'pause',
  ];

  return [...header, ...overlayCommands, ...footer].join('\r\n');
};

// ─── Background Prompts Exporter ──────────────────────────────────────────────

/**
 * Generates a plain-text file matching the same format as image_prompts.txt,
 * prefixed with "HF" + SRT row number instead of just the row number.
 * Format: HF{rowNumber}: {bgPrompt}
 *
 * When bgPrompt is available (requires regenerating the post-script-package
 * after the bgPrompt field was added to the AI schema), the prompt is output
 * directly. When not available, a structured placeholder with the SRT context
 * is shown so the editor can complete it quickly.
 *
 * Compatible with: Midjourney, Kling, RunwayML, Sora, Adobe Firefly, etc.
 */
export const buildHfBackgroundPromptsTxt = (
  hfRows: SrtAssetRow[],
  stem: string,
  hfContextTitles: HfContext[] = [],
): string => {
  const safeStem = sanitizeDownloadFileStem(stem);

  const header = [
    `# HyperFrame Background Prompts — ${safeStem}`,
    `# Total: ${hfRows.length} posicoes | Use em: Midjourney, Kling, RunwayML, Sora`,
    `# Formato: HF[linha]: [prompt] — cole direto no gerador de sua preferencia`,
    `# Camada no CapCut: abaixo do avatar, ajuste opacidade se necessario`,
    '',
  ];

  const promptLines = hfRows.map((row) => {
    const context  = findHfContext(hfContextTitles, row.startTime);
    const bgPrompt = context?.bgPrompt?.trim();
    const label    = `HF${row.rowNumber}`;

    if (bgPrompt) {
      // AI generated a context-aware background prompt — use it directly
      return `${label}: ${bgPrompt}`;
    }

    // No bgPrompt yet: show structured placeholder with SRT context
    // so the editor can paste into an AI tool and complete it quickly
    const headline = context?.headline ?? truncateToWords(row.texto, 6);
    const state    = context?.visualState ?? 'hf_focus';
    const excerpt  = truncateToWords(row.texto, 10);
    return `${label}: [REGERAR POS-ROTEIRO] ${state} | Headline: "${headline}" | Trecho: "${excerpt}"`;
  });

  return [...header, ...promptLines].join('\r\n');
};
