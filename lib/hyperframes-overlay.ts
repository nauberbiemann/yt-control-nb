import { normalizeAssetType, sanitizeDownloadFileStem, type SrtAssetRow } from './srt-asset-pipeline';

export type HfStyleOverride = 'dark' | 'light' | 'brand-warm' | 'brand-cool';

const STYLE_LABELS: Record<HfStyleOverride, string> = {
  'dark':       'Dark (fundo escuro, texto claro)',
  'light':      'Light (fundo claro, texto escuro)',
  'brand-warm': 'Brand Warm (tons quentes, dourado)',
  'brand-cool': 'Brand Cool (tons frios, azul/ciano)',
};

// Colors in Hex without #
const PALETTE_COLORS: Record<HfStyleOverride, { text: string; bar: string }> = {
  'dark':       { text: 'FFFFFF', bar: '111111' },
  'light':      { text: '111111', bar: 'F0F0F0' },
  'brand-warm': { text: 'FFD700', bar: '2A1200' },
  'brand-cool': { text: '00E5FF', bar: '001525' },
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

// Escape text for python CLI argument
const esc = (text: string): string =>
  text
    .replace(/"/g, '\\"')
    .replace(/[%]/g, '%%')
    .trim()
    .slice(0, 75);

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
    ':: ETAPA 2 -- HyperFrames Overlay Generator (Python + Pillow)',
    `:: Projeto : ${safeStem}`,
    `:: Estilo  : ${variation.label}`,
    `:: Overlays: ${hfRows.length} cena(s) identificada(s)`,
    '::',
    ':: Gera overlays PNG transparentes. Ignora erros de FFmpeg/Fontconfig.',
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
    ':: [2] Pillow instalado? (instala se ausente)',
    'python -c "import PIL" >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0E',
    '    echo Instalando Pillow (processamento de imagem)...',
    '    python -m pip install pillow',
    '    if %errorlevel% neq 0 (',
    '        color 0C',
    '        echo ERRO ao instalar Pillow.',
    '        pause',
    '        exit /b 1',
    '    )',
    ')',
    '',
    ':: [3] Criando pasta de output',
    'set "OUT_DIR=%~dp0hyperframes_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    ':: [4] Gerando script Python temporario',
    'set "PY_SCRIPT=%OUT_DIR%\\render_hf.py"',
    '(',
    'echo import sys, os',
    'echo from PIL import Image, ImageDraw, ImageFont',
    'echo out_path = sys.argv[1]',
    'echo template = sys.argv[2]',
    'echo text = sys.argv[3]',
    'echo color_text = sys.argv[4]',
    'echo color_bar = sys.argv[5]',
    'echo W, H = 1920, 1080',
    'echo img = Image.new^("RGBA"^, ^(W, H^)^, ^(0,0,0,0^)^)',
    'echo draw = ImageDraw.Draw^(img^)',
    'echo font_path = "C:/Windows/Fonts/segoeui.ttf"',
    'echo if not os.path.exists^(font_path^): font_path = "C:/Windows/Fonts/arial.ttf"',
    'echo def hex_to_rgba^(h, alpha=255^):',
    'echo     return tuple^(int^(h[i:i+2], 16^) for i in ^(0, 2, 4^)^) + ^(alpha,^)',
    'echo bar_rgba = hex_to_rgba^(color_bar, 230^)',
    'echo text_rgba = hex_to_rgba^(color_text, 255^)',
    'echo if template == "chapter_break_no_avatar":',
    'echo     draw.rectangle^([0, 840, W, 1080], fill=bar_rgba^)',
    'echo     font = ImageFont.truetype^(font_path, 54^)',
    'echo     w = draw.textlength^(text, font=font^)',
    'echo     draw.text^(^(^(W-w^)/2, 910^), text, font=font, fill=text_rgba^)',
    'echo elif template == "avatar_close_crop":',
    'echo     draw.rectangle^([60, 920, 1860, 1040], fill=bar_rgba^)',
    'echo     font = ImageFont.truetype^(font_path, 38^)',
    'echo     draw.text^(^(100, 950^), text, font=font, fill=text_rgba^)',
    'echo elif template == "caption_focus":',
    'echo     draw.rectangle^([160, 440, 1760, 640], fill=bar_rgba^)',
    'echo     font = ImageFont.truetype^(font_path, 56^)',
    'echo     w = draw.textlength^(text, font=font^)',
    'echo     draw.text^(^(^(W-w^)/2, 500^), text, font=font, fill=text_rgba^)',
    'echo elif template == "avatar_side_panel":',
    'echo     draw.rectangle^([1380, 0, W, H], fill=bar_rgba^)',
    'echo     font = ImageFont.truetype^(font_path, 34^)',
    'echo     draw.text^(^(1410, H/2^), text, font=font, fill=text_rgba^)',
    'echo else:',
    'echo     draw.rectangle^([0, 880, W, 1080], fill=bar_rgba^)',
    'echo     font = ImageFont.truetype^(font_path, 46^)',
    'echo     w = draw.textlength^(text, font=font^)',
    'echo     draw.text^(^(^(W-w^)/2, 930^), text, font=font, fill=text_rgba^)',
    'echo img.save^(out_path^)',
    ') > "%PY_SCRIPT%"',
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
  const { text: cText, bar: cBar } = PALETTE_COLORS[variation.palette];

  hfRows.forEach((row, i) => {
    const template    = extractTemplate(row.prompt);
    const startSafe   = safeStartTime(row.startTime);
    // Gerar imagens estáticas PNG ao invés de vídeos
    const outName     = `hf_${String(row.rowNumber).padStart(3, '0')}_${startSafe}_${template}.png`;
    const caption     = esc(row.texto);

    commands.push(
      `:: --- [${i + 1}/${hfRows.length}] row ${row.rowNumber} | ${template} ---`,
      `echo [${i + 1}/${hfRows.length}] ${template} -- ${row.startTime}`,
      `echo     Output : ${outName}`,
      `python "%PY_SCRIPT%" "%OUT_DIR%\\${outName}" "${template}" "${caption}" "${cText}" "${cBar}"`,
      'if %errorlevel% neq 0 (',
      '    color 0E',
      `    echo AVISO: Falha ao gerar imagem ${row.rowNumber}.`,
      '    color 0A',
      ') else (',
      `    echo     OK!`,
      ')',
      'echo.',
    );
  });

  const footer = [
    ':: Limpeza do script',
    'if exist "%PY_SCRIPT%" del "%PY_SCRIPT%"',
    '',
    ':: ================================================================',
    'color 0A',
    'echo.',
    `echo --- PRONTO! ${hfRows.length} overlay(s) PNG gerado(s) em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar no editor (DaVinci / Premiere):',
    'echo   1. Importe a pasta hyperframes_overlays',
    'echo   2. Coloque cada imagem .png ACIMA do avatar.mp4',
    'echo   3. Estique a imagem na timeline pela duracao desejada',
    'echo   4. O fundo ja e 100%% transparente.',
    'echo.',
    'pause',
  ];

  return [...header, ...commands, ...footer].join('\r\n');
};
