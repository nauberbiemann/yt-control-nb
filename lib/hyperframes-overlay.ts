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
  hfContextTitles?: Array<{ timestamp: string; visualState?: string; headline: string; subtitle?: string; metrics?: string }>
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
    ':: ETAPA 2 -- HyperFrames Overlay Generator (HTML + Playwright + ProRes)',
    `:: Projeto : ${safeStem}`,
    `:: Overlays: ${hfRows.length} cenas identificadas`,
    '::',
    ':: Gera overlays MOV ProRes 4444 com canal alpha transparente.',
    ':: inject_and_render.py injeta variaveis nos templates HTML,',
    ':: Playwright captura frame-a-frame, FFmpeg codifica em ProRes.',
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
    ':: [2] Playwright instalado?',
    'python -c "from playwright.async_api import async_playwright" >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0E',
    '    echo Instalando Playwright -- necessario apenas uma vez...',
    '    python -m pip install playwright',
    '    python -m playwright install chromium',
    '    if %errorlevel% neq 0 (',
    '        color 0C',
    '        echo.',
    '        echo ERRO: Falha ao instalar Playwright.',
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
    ':: [4] Verificando pipeline local',
    `set "SKILL_DIR=${SKILL_DIR}"`,
    'if not exist "%SKILL_DIR%\\inject_and_render.py" (',
    '    color 0C',
    '    echo ERRO CRITICO: inject_and_render.py nao encontrado!',
    '    echo Local esperado: "%SKILL_DIR%"',
    '    pause',
    '    exit /b 1',
    ')',
    '',
    ':: [5] Pasta de templates (2 niveis acima do BAT → nivel do canal)',
    'set "TEMPLATES_DIR=%~dp0..\\..\\Template HTML"',
    'if not exist "%TEMPLATES_DIR%" (',
    '    color 0E',
    '    echo AVISO: Pasta "Template HTML" nao encontrada em %TEMPLATES_DIR%',
    '    echo Crie a pasta "Template HTML" no nivel do canal e adicione os templates.',
    '    echo Usando templates padrao do skill como fallback...',
    `    set "TEMPLATES_DIR=${SKILL_DIR}\\projects\\default\\templates"`,
    ')',
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
    const context     = (hfContextTitles || []).find((c) => c.timestamp === row.startTime);
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
      titleArg = `--title "${escapeCaption(row.texto)}"`;
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
