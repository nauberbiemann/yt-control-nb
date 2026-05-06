import { normalizeAssetType, sanitizeDownloadFileStem, type SrtAssetRow } from './srt-asset-pipeline';

export type HfStyleOverride = 'dark' | 'light' | 'brand-warm' | 'brand-cool';

const STYLE_LABELS: Record<HfStyleOverride, string> = {
  'dark':       'Dark (fundo escuro, texto claro)',
  'light':      'Light (fundo claro, texto escuro)',
  'brand-warm': 'Brand Warm (tons quentes, dourado)',
  'brand-cool': 'Brand Cool (tons frios, azul/ciano)',
};

// Palette → FFmpeg colors (bg RGBA hex, text color)
const PALETTE_COLORS: Record<HfStyleOverride, { bg: string; text: string; bar: string }> = {
  'dark':       { bg: '0x000000', text: '0xFFFFFF', bar: '0x111111' },
  'light':      { bg: '0xFFFFFF', text: '0x111111', bar: '0xF0F0F0' },
  'brand-warm': { bg: '0x1A0A00', text: '0xFFD700', bar: '0x2A1200' },
  'brand-cool': { bg: '0x00101A', text: '0x00E5FF', bar: '0x001525' },
};

const stemToSeed = (stem: string): number =>
  stem.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000;

const resolveVariation = (stem: string, override?: HfStyleOverride) => {
  const seed    = stemToSeed(stem);
  const PALETTES: HfStyleOverride[] = ['dark', 'light', 'brand-warm', 'brand-cool'];
  const palette = override ?? PALETTES[Math.floor(seed / 10) % PALETTES.length];
  return { seed, palette, label: STYLE_LABELS[palette] };
};

const safeStartTime = (t: string) => t.replace(/:/g, '-').replace(',', '-');

// Escape text for FFmpeg drawtext (value wrapped in single quotes in the filter).
// Inside single-quoted FFmpeg option values: only ' and % need special handling.
const esc = (text: string): string =>
  text
    .replace(/'/g, '')       // remove apostrophes (would break single-quote delimiters)
    .replace(/[%]/g, '%%')   // CMD: %% → literal %
    .replace(/[<>|&^"]/g, '') // strip CMD special chars
    .trim()
    .slice(0, 55);

// Build the -vf filter string for each template type
const buildVf = (
  template: string,
  caption: string,
  palette: HfStyleOverride,
): string => {
  const { text, bar } = PALETTE_COLORS[palette];
  // Use fontconfig font name — avoids ANY path/colon escaping issue in FFmpeg 8.x drawtext.
  // FFmpeg is compiled with --enable-fontconfig so 'font=Arial' works on all Windows systems.
  const FONT = 'font=Arial';
  const t = esc(caption);

  switch (template) {
    case 'chapter_break_no_avatar':
      // Bold bar at bottom
      return [
        'format=rgba',
        `colorchannelmixer=aa=0`,
        `drawbox=x=0:y=840:w=1920:h=240:color=${bar}@0.92:t=fill`,
        `drawtext=${FONT}:text='${t}':fontsize=54:fontcolor=${text}:x=(w-text_w)/2:y=910:bordercolor=0x000000:borderw=2`,
      ].join(',');

    case 'avatar_close_crop':
      // Lower-third bar
      return [
        'format=rgba',
        `colorchannelmixer=aa=0`,
        `drawbox=x=60:y=920:w=1800:h=120:color=${bar}@0.88:t=fill`,
        `drawtext=${FONT}:text='${t}':fontsize=38:fontcolor=${text}:x=100:y=940:bordercolor=0x000000:borderw=1`,
      ].join(',');

    case 'caption_focus':
      // Centered emphasis
      return [
        'format=rgba',
        `colorchannelmixer=aa=0`,
        `drawbox=x=160:y=440:w=1600:h=200:color=${bar}@0.90:t=fill`,
        `drawtext=${FONT}:text='${t}':fontsize=56:fontcolor=${text}:x=(w-text_w)/2:y=490:bordercolor=0x000000:borderw=2`,
      ].join(',');

    case 'avatar_side_panel':
      // Right side vertical panel
      return [
        'format=rgba',
        `colorchannelmixer=aa=0`,
        `drawbox=x=1380:y=0:w=540:h=1080:color=${bar}@0.88:t=fill`,
        `drawtext=${FONT}:text='${t}':fontsize=34:fontcolor=${text}:x=1410:y=(h-text_h)/2:bordercolor=0x000000:borderw=1`,
      ].join(',');

    default:
      return [
        'format=rgba',
        `colorchannelmixer=aa=0`,
        `drawbox=x=0:y=880:w=1920:h=200:color=${bar}@0.90:t=fill`,
        `drawtext=${FONT}:text='${t}':fontsize=46:fontcolor=${text}:x=(w-text_w)/2:y=930:bordercolor=0x000000:borderw=2`,
      ].join(',');
  }
};

const extractTemplate = (prompt: string): string => {
  if (prompt.startsWith('hf:')) return prompt.slice(3);
  return 'avatar_full_clean';
};

export const buildHyperframesBat = (
  rows: SrtAssetRow[],
  stem: string,
  styleOverride?: HfStyleOverride,
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
    ':: ETAPA 2 -- HyperFrames Overlay Generator (FFmpeg -- sem Python)',
    `:: Projeto : ${safeStem}`,
    `:: Estilo  : ${variation.label}`,
    `:: Overlays: ${hfRows.length} cena(s) identificada(s)`,
    '::',
    ':: Gera overlays WebM com fundo transparente via FFmpeg.',
    ':: Requisito: FFmpeg no PATH (https://ffmpeg.org)',
    ':: ================================================================',
    '',
    ':: [1] FFmpeg disponivel?',
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
    ':: [2] Verificando fonte do sistema',
    'set "FONT=C:\\Windows\\Fonts\\segoeui.ttf"',
    'if not exist "%FONT%" set "FONT=C:\\Windows\\Fonts\\arial.ttf"',
    '',
    ':: [3] Criando pasta de output',
    'set "OUT_DIR=%~dp0hyperframes_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    'echo.',
    'echo --- HYPERFRAMES OVERLAY GENERATOR ---',
    `echo Projeto : ${safeStem}`,
    `echo Estilo  : ${variation.label}`,
    `echo Overlays: ${hfRows.length} cena(s)`,
    'echo Output  : %OUT_DIR%',
    'echo.',
  ];

  const commands: string[] = [];

  hfRows.forEach((row, i) => {
    const template    = extractTemplate(row.prompt);
    const startSafe   = safeStartTime(row.startTime);
    const endMs       = row.endTime
      ? (() => {
          const [h, m, se] = row.endTime.split(':');
          const [s, ms] = se.split(',');
          return (Number(h) * 3_600_000) + (Number(m) * 60_000) + (Number(s) * 1_000) + Number(ms);
        })()
      : 3000;
    const startMs     = (() => {
      const [h, m, se] = row.startTime.split(':');
      const [s, ms]    = se.split(',');
      return (Number(h) * 3_600_000) + (Number(m) * 60_000) + (Number(s) * 1_000) + Number(ms);
    })();
    const dur         = Math.max(1.0, (endMs - startMs) / 1000).toFixed(2);
    const outName     = `hf_${String(row.rowNumber).padStart(3, '0')}_${startSafe}_${template}.webm`;
    const vf          = buildVf(template, row.texto, variation.palette);

    commands.push(
      `:: --- [${i + 1}/${hfRows.length}] row ${row.rowNumber} | ${row.startTime} | ${template} ---`,
      `echo [${i + 1}/${hfRows.length}] ${template} -- ${row.startTime}`,
      `echo     Output : ${outName}`,
      `ffmpeg -y -f lavfi -i "color=c=0x000000:s=1920x1080:r=30:d=${dur}" -vf "${vf}" -c:v libvpx-vp9 -pix_fmt yuva420p -b:v 0 -crf 33 -an "%OUT_DIR%\\${outName}"`,
      'if %errorlevel% neq 0 (',
      '    color 0E',
      `    echo AVISO: Falha ao gerar overlay ${row.rowNumber}. Verifique a versao do FFmpeg.`,
      '    color 0A',
      ') else (',
      `    echo     OK!`,
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
    'echo Como usar no editor (DaVinci / Premiere):',
    'echo   1. Importe a pasta hyperframes_overlays',
    'echo   2. O tempo esta no nome do arquivo',
    'echo   3. Coloque cada .webm ACIMA do avatar.mp4',
    'echo   4. Os arquivos tem fundo transparente (canal alpha)',
    'echo.',
    'pause',
  ];

  return [...header, ...commands, ...footer].join('\r\n');
};
