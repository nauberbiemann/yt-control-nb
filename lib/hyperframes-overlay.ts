import { normalizeAssetType, sanitizeDownloadFileStem, type SrtAssetRow } from './srt-asset-pipeline';

// ─── Style system ─────────────────────────────────────────────────────────────

export type HfStyleOverride = 'dark' | 'light' | 'brand-warm' | 'brand-cool';

const PALETTES: HfStyleOverride[] = ['dark', 'light', 'brand-warm', 'brand-cool'];
const MOTIONS  = ['smooth', 'punchy', 'subtle'] as const;
const ENTRIES  = ['left', 'right', 'up', 'fade'] as const;

const STYLE_LABELS: Record<HfStyleOverride, string> = {
  'dark':       'Dark (fundo escuro, texto claro)',
  'light':      'Light (fundo claro, texto escuro)',
  'brand-warm': 'Brand Warm (tons quentes, dourado)',
  'brand-cool': 'Brand Cool (tons frios, azul/ciano)',
};

/**
 * Derives a deterministic numeric seed from the project stem string.
 * Same stem → same seed → same visual variation every time.
 * Different stems → statistically different visuals.
 */
const stemToSeed = (stem: string): number =>
  stem.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000;

interface HfVariation {
  seed:    number;
  palette: HfStyleOverride;
  motion:  typeof MOTIONS[number];
  entry:   typeof ENTRIES[number];
  label:   string;
}

const resolveVariation = (stem: string, override?: HfStyleOverride): HfVariation => {
  const seed    = stemToSeed(stem);
  const palette = override ?? PALETTES[Math.floor(seed / 10) % PALETTES.length];
  const motion  = MOTIONS[seed % MOTIONS.length];
  const entry   = ENTRIES[Math.floor(seed / 100) % ENTRIES.length];
  return { seed, palette, motion, entry, label: STYLE_LABELS[palette] };
};

// ─── BAT content builder ──────────────────────────────────────────────────────

const HYPERFRAMES_SKILL_PATH =
  'D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\avatar-hyperframes-editor-skill';

const RENDER_SCRIPT_PATH = `${HYPERFRAMES_SKILL_PATH}\\render_hyperframes.py`;

const safeStartTime = (t: string) => t.replace(/:/g, '-').replace(',', '-');

const extractTemplate = (prompt: string): string => {
  if (prompt.startsWith('hf:')) return prompt.slice(3);
  return 'avatar_full_clean';
};

const escapeCaption = (text: string): string =>
  text.replace(/"/g, "'").replace(/[<>|&^]/g, '').slice(0, 120);

/**
 * Builds the content of the _2_hyperframes.bat file.
 *
 * @param rows         All pipeline rows (function filters for asset === 'hyperframe')
 * @param stem         Project artifact stem (used for naming + seed)
 * @param styleOverride Optional manual style override from app dropdown
 */
export const buildHyperframesBat = (
  rows: SrtAssetRow[],
  stem: string,
  styleOverride?: HfStyleOverride,
): string => {
  const safeStem  = sanitizeDownloadFileStem(stem);
  const hfRows    = rows.filter((r) => normalizeAssetType(r.asset) === 'hyperframe');
  const variation = resolveVariation(safeStem, styleOverride);
  const csvName   = `${safeStem}_pipeline_assets.csv`;

  if (!hfRows.length) return '';

  const header = [
    '@echo off',
    'chcp 65001 >nul',
    'color 0A',
    '',
    ':: ================================================================',
    ':: ETAPA 2 — HyperFrames Overlay Generator',
    `:: Projeto : ${safeStem}`,
    `:: Estilo  : ${variation.label}`,
    `:: Overlays: ${hfRows.length} cena(s) identificada(s)`,
    '::',
    ':: Gera overlays WebM com fundo transparente (canal alpha).',
    ':: Execute ANTES de abrir o editor. Nao precisa do avatar.mp4.',
    ':: ================================================================',
    '',
    ':: [1] Python disponivel?',
    'python --version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo ERRO: Python nao encontrado no PATH.',
    '    echo Instale em https://www.python.org e marque "Add to PATH".',
    '    pause & exit /b 1',
    ')',
    '',
    ':: [2] Pillow instalado? (instala automaticamente se ausente)',
    'python -c "import PIL" >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0E',
    '    echo Instalando Pillow (necessario apenas uma vez)...',
    '    python -m pip install pillow',
    '    if %errorlevel% neq 0 (',
    '        color 0C',
    '        echo ERRO: Falha ao instalar Pillow.',
    '        pause & exit /b 1',
    '    )',
    ')',
    '',
    ':: [3] FFmpeg disponivel?',
    'ffmpeg -version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo ERRO: FFmpeg nao encontrado no PATH.',
    '    echo Baixe em https://ffmpeg.org/download.html e adicione ao PATH.',
    '    pause & exit /b 1',
    ')',
    '',
    ':: [4] Script de render disponivel?',
    `set "RENDER_SCRIPT=${RENDER_SCRIPT_PATH}"`,
    'if not exist "%RENDER_SCRIPT%" (',
    '    color 0C',
    '    echo ERRO: render_hyperframes.py nao encontrado.',
    `    echo Local esperado: "${RENDER_SCRIPT_PATH}"`,
    '    pause & exit /b 1',
    ')',
    '',
    ':: [5] Criando pasta de output',
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
    `set "PROJECT_STEM=${safeStem}"`,
    `set "SEED=${variation.seed}"`,
    `set "PALETTE=${variation.palette}"`,
    `set "MOTION=${variation.motion}"`,
    `set "ENTRY=${variation.entry}"`,
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
    const durationSec = ((endMs - startMs) / 1000).toFixed(2);
    const outName = `hf_${String(row.rowNumber).padStart(3, '0')}_${startSafe}_${template}.webm`;

    overlayCommands.push(
      `:: --- [${i + 1}/${hfRows.length}] row ${row.rowNumber} | ${row.startTime} | ${template} ---`,
      `echo [${i + 1}/${hfRows.length}] Gerando: ${outName}`,
      'python "%RENDER_SCRIPT%" ^',
      `  --template ${template} ^`,
      `  --caption "${caption}" ^`,
      `  --duration ${durationSec} ^`,
      '  --seed %SEED% ^',
      '  --palette %PALETTE% ^',
      '  --motion %MOTION% ^',
      '  --entry %ENTRY% ^',
      `  --output "%OUT_DIR%\\${outName}"`,
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
    `echo --- PRONTO! ${hfRows.length} overlay(s) gerado(s) em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar no editor (DaVinci / Premiere / etc):',
    'echo   1. Importe a pasta hyperframes_overlays no seu projeto',
    'echo   2. O tempo de entrada de cada arquivo esta no nome:',
    'echo      ex: hf_004_00-00-40-000_chapter_break_no_avatar.webm',
    'echo          significa: inicia em 00:00:40 do video',
    'echo   3. Coloque cada .webm em uma faixa ACIMA do avatar.mp4',
    'echo   4. Os arquivos tem fundo transparente (canal alpha WebM)',
    'echo.',
    'pause',
  ];

  return [...header, ...overlayCommands, ...footer].join('\r\n');
};
