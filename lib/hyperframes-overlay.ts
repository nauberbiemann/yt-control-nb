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

const extractTemplate = (prompt: string): string => {
  if (prompt.startsWith('hf:')) return prompt.slice(3);
  return 'avatar_full_clean';
};

// Diretório do skill (separado do nome do script para usar cd /d)
const SKILL_DIR =
  'D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\avatar-hyperframes-editor-skill';

// ─── BAT Builder ──────────────────────────────────────────────────────────────

export const buildHyperframesBat = (
  rows: SrtAssetRow[],
  stem: string,
  styleOverride?: HfStyleOverride,
  hfContextTitles?: Array<{ timestamp: string; headline: string; subtitle?: string; metrics?: string }>
): string => {
  const safeStem  = sanitizeDownloadFileStem(stem);
  const hfRows    = rows.filter((r) => normalizeAssetType(r.asset) === 'hyperframe');
  const variation = resolveVariation(safeStem, styleOverride);

  if (!hfRows.length) return '';

  const header = [
    '@echo off',
    'chcp 65001 >nul',
    'color 0A',
    '',
    ':: ================================================================',
    ':: ETAPA 2 -- HyperFrames Overlay Generator (Pillow + FFmpeg)',
    `:: Projeto : ${safeStem}`,
    `:: Estilo  : ${variation.label}`,
    `:: Overlays: ${hfRows.length} cenas identificadas`,
    '::',
    ':: Gera overlays WebM com fundo transparente -- canal alpha.',
    ':: Pillow renderiza os frames PNG, FFmpeg empacota como WebM.',
    ':: ================================================================',
    '',
    ':: [1] Python disponivel?',
    'python --version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo.',
    '    echo ERRO: Python nao encontrado no PATH.',
    '    echo Instale em https://www.python.org e marque "Add to PATH".',
    '    echo.',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    ':: [2] Pillow instalado?',
    'python -c "import PIL" >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0E',
    '    echo Instalando Pillow -- necessario apenas uma vez...',
    '    python -m pip install pillow',
    '    if %errorlevel% neq 0 (',
    '        color 0C',
    '        echo.',
    '        echo ERRO: Falha ao instalar Pillow.',
    '        echo.',
    '        pause',
    '        exit /b 1',
    '    )',
    ')',
    '',
    ':: [3] FFmpeg disponivel?',
    'ffmpeg -version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo.',
    '    echo ERRO: FFmpeg nao encontrado no PATH.',
    '    echo Baixe em https://ffmpeg.org/download.html e adicione ao PATH.',
    '    echo.',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    `:: [4] Mudando de diretorio e apontando pro pipeline local`,
    `set "SKILL_DIR=${SKILL_DIR}"`,
    'if not exist "%SKILL_DIR%\\render_hyperframes.py" (',
    '    color 0C',
    '    echo ERRO CRITICO: render_hyperframes.py nao mapeado!',
    '    echo Local esperado: "%SKILL_DIR%"',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    ':: [5] Criando pasta de output (ANTES do cd)',
    'set "OUT_DIR=%~dp0hyperframes_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    'echo.',
    'echo --- HYPERFRAMES OVERLAY GENERATOR ---',
    `echo Projeto : ${safeStem}`,
    `echo Estilo  : ${variation.label} ^(seed: ${variation.seed}^)`,
    `echo Overlays: ${hfRows.length} cena(s)`,
    'echo Output  : %OUT_DIR%',
    'echo.',
    `set "SEED=${variation.seed}"`,
    `set "PALETTE=${variation.palette}"`,
    `set "MOTION=${variation.motion}"`,
    `set "ENTRY=${variation.entry}"`,
    '',
    ':: Mudando para o diretorio do skill (cd /d aceita paths nativos do sistema)',
    'cd /d "%SKILL_DIR%"',
    '',
  ];

  const overlayCommands: string[] = [];
  hfRows.forEach((row, i) => {
    const template  = extractTemplate(row.prompt);
    const caption   = escapeCaption(row.texto);
    const startSafe = safeStartTime(row.startTime);
    const endMs     = row.endTime
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
    const outName = `hf_${String(row.rowNumber).padStart(3, '0')}_${startSafe}_${template}.webm`;

    // Find contextual titles for this anchor
    const context = (hfContextTitles || []).find((c) => c.timestamp === row.startTime);
    let titleArg = '';
    let subtitleArg = '';
    let metricsArg = '';

    if (context) {
      if (context.headline) titleArg = `--title "${escapeCaption(context.headline)}"`;
      if (context.subtitle && context.subtitle !== '—') subtitleArg = `--subtitle "${escapeCaption(context.subtitle)}"`;
      if (context.metrics && context.metrics !== '—') metricsArg = `--metrics "${escapeCaption(context.metrics)}"`;
    } else {
      // Fallback: use raw text if no AI context is found
      titleArg = `--title "${escapeCaption(row.texto)}"`;
    }

    // Build single-line python call
    const pyArgs = [
      `--template ${template}`,
      titleArg,
      subtitleArg,
      metricsArg,
      `--duration ${durationSec}`,
      '--seed %SEED%',
      '--palette %PALETTE%',
      '--motion %MOTION%',
      '--entry %ENTRY%',
      `--output "%OUT_DIR%\\${outName}"`,
    ].filter(Boolean).join(' ');

    overlayCommands.push(
      `:: --- [${i + 1}/${hfRows.length}] row ${row.rowNumber} | ${row.startTime} | ${template} ---`,
      `echo [${i + 1}/${hfRows.length}] Gerando: ${outName}`,
      `python render_hyperframes.py ${pyArgs}`,
      'if %errorlevel% neq 0 (',
      '    color 0E',
      `    echo AVISO: Falha ao gerar overlay ${row.rowNumber}. Continue e ajuste manualmente.`,
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
    `echo --- PRONTO! ${hfRows.length} overlay(s) WebM gerado(s) em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar no editor (DaVinci / Premiere):',
    'echo   1. Importe a pasta hyperframes_overlays',
    'echo   2. O tempo esta no nome do arquivo',
    'echo   3. Coloque cada .webm ACIMA do avatar.mp4',
    'echo   4. Os arquivos tem fundo transparente (canal alpha)',
    'echo.',
    'pause',
  ];

  return [...header, ...overlayCommands, ...footer].join('\r\n');
};
