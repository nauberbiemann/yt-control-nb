import { normalizeAssetType, parseSrtTimeToMs, sanitizeDownloadFileStem, type SrtAssetRow, type SrtAssetType } from './srt-asset-pipeline';

// ─── SFX type mapping ─────────────────────────────────────────────────────────

type SfxType = 'ting' | 'whoosh' | 'whoosh_out' | 'impact' | 'rise';

interface SfxEvent {
  rowNumber: number;
  startTime: string;
  sfxType:   SfxType;
  rowSeed:   number;
}

const TRANSITION_MAP: Partial<Record<`${SrtAssetType}->${SrtAssetType}`, SfxType>> = {
  'avatar->texto':       'ting',
  'texto->avatar':       'whoosh_out',
  'avatar->hyperframe':  'impact',
  'hyperframe->avatar':  'whoosh_out',
  'avatar->imagem':      'whoosh',
  'imagem->avatar':      'whoosh_out',
  'avatar->vídeo':       'whoosh',
  'vídeo->avatar':       'whoosh_out',
};

// ─── Seed helpers ─────────────────────────────────────────────────────────────

const stemToProjectSeed = (stem: string): number =>
  stem.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000;

const rowSeed = (projectSeed: number, rowNumber: number): number =>
  (projectSeed + rowNumber * 37) % 1000;

// ─── Transition detector ──────────────────────────────────────────────────────

const detectSfxEvents = (rows: SrtAssetRow[], projectSeed: number): SfxEvent[] => {
  const events: SfxEvent[] = [];

  // Prevent SFX flooding: minimum gap between consecutive SFX (15 s) + max 15 events per project
  const SFX_COOLDOWN_MS = 15_000;
  const SFX_MAX_EVENTS  = 15;
  let lastSfxEndMs = -Infinity;

  for (let i = 0; i < rows.length - 1; i++) {
    if (events.length >= SFX_MAX_EVENTS) break;

    const from = normalizeAssetType(rows[i].asset);
    const to   = normalizeAssetType(rows[i + 1].asset);

    if (!from || !to || from === to) continue;

    const key = `${from}->${to}` as `${SrtAssetType}->${SrtAssetType}`;
    const sfxType = TRANSITION_MAP[key];

    if (!sfxType) continue;

    // Enforce minimum cooldown between SFX events
    const startMs = parseSrtTimeToMs(rows[i + 1].startTime);
    if (startMs - lastSfxEndMs < SFX_COOLDOWN_MS) continue;
    lastSfxEndMs = parseSrtTimeToMs(rows[i + 1].endTime || rows[i + 1].startTime);

    events.push({
      rowNumber: rows[i + 1].rowNumber,
      startTime: rows[i + 1].startTime,
      sfxType,
      rowSeed:   rowSeed(projectSeed, rows[i + 1].rowNumber),
    });
  }

  return events;
};

// ─── BAT content builder ──────────────────────────────────────────────────────

const SKILL_PATH =
  'D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\avatar-hyperframes-editor-skill';

const RENDER_SFX_SCRIPT = `${SKILL_PATH}\\render_sfx.py`;

const safeTime = (t: string) => t.replace(/:/g, '-').replace(',', '-');

const SFX_LABELS: Record<SfxType, string> = {
  ting:       'Bell/Ting   (destaque de texto)',
  whoosh:     'Whoosh In   (asset entrando)',
  whoosh_out: 'Whoosh Out  (asset saindo)',
  impact:     'Impact      (virada narrativa)',
  rise:       'Rise        (tensao/capitulo)',
};

/**
 * Builds the content of the _3_sfx.bat file.
 * Detects asset transitions in the CSV rows and generates one SFX MP3
 * per transition at the exact startTime of the destination row.
 *
 * Uses a double seed (project + row) so every SFX sounds slightly different
 * from others in the same project, and different projects generate different sets.
 */
export const buildSfxBat = (rows: SrtAssetRow[], stem: string): string => {
  const safeStem    = sanitizeDownloadFileStem(stem);
  const projectSeed = stemToProjectSeed(safeStem);
  const events      = detectSfxEvents(rows, projectSeed);

  if (!events.length) return '';

  const header = [
    '@echo off',
    'chcp 65001 >nul',
    'color 0A',
    '',
    ':: ================================================================',
    ':: ETAPA 3 — SFX Generator',
    `:: Projeto : ${safeStem}`,
    `:: Eventos : ${events.length} transi\u00e7\u00e3o(oes) de asset detectada(s)`,
    '::',
    ':: Gera efeitos sonoros sincronizados com as transicoes do CSV.',
    ':: Roda em paralelo com os Bats 1 e 2. Nao precisa do avatar.mp4.',
    ':: ================================================================',
    '',
    ':: [1] FFmpeg disponivel?',
    'ffmpeg -version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo.',
    '    echo ERRO: FFmpeg nao encontrado no PATH.',
    '    echo Baixe em https://ffmpeg.org/download.html',
    '    echo.',
    '    echo Pressione qualquer tecla para fechar...',
    '    pause >nul',
    '    exit /b 1',
    ')',
    '',
    ':: [2] Python disponivel?',
    'python --version >nul 2>&1',
    'if %errorlevel% neq 0 (',
    '    color 0C',
    '    echo.',
    '    echo ERRO: Python nao encontrado no PATH.',
    '    echo.',
    '    echo Pressione qualquer tecla para fechar...',
    '    pause >nul',
    '    exit /b 1',
    ')',
    '',
    ':: [3] Script de render disponivel?',
    `set "RENDER_SCRIPT=${RENDER_SFX_SCRIPT}"`,
    'if not exist "%RENDER_SCRIPT%" (',
    '    color 0C',
    '    echo.',
    '    echo ERRO: render_sfx.py nao encontrado.',
    `    echo Local esperado: "${RENDER_SFX_SCRIPT}"`,
    '    echo.',
    '    echo Pressione qualquer tecla para fechar...',
    '    pause >nul',
    '    exit /b 1',
    ')',
    '',
    ':: [4] Criando pasta de output',
    'set "OUT_DIR=%~dp0sfx_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    'echo.',
    'echo --- SFX GENERATOR ---',
    `echo Projeto : ${safeStem}`,
    `echo Seed    : ${projectSeed} ^(variacao unica por projeto^)`,
    `echo Eventos : ${events.length} transicoes de asset`,
    'echo Output  : %OUT_DIR%',
    'echo.',
    '',
  ];

  const sfxCommands: string[] = [];
  events.forEach((ev, i) => {
    const outName  = `sfx_${String(i + 1).padStart(3, '0')}_${safeTime(ev.startTime)}_${ev.sfxType}.mp3`;
    const label    = SFX_LABELS[ev.sfxType];

    sfxCommands.push(
      `:: --- [${i + 1}/${events.length}] row ${ev.rowNumber} | ${ev.startTime} | ${ev.sfxType} ---`,
      `echo [${i + 1}/${events.length}] ${label}`,
      `echo     Tempo  : ${ev.startTime}`,
      `echo     Output : ${outName}`,
      'python "%RENDER_SCRIPT%" ^',
      `  --type ${ev.sfxType} ^`,
      `  --seed ${ev.rowSeed} ^`,
      `  --output "%OUT_DIR%\\${outName}"`,
      'if %errorlevel% neq 0 (',
      '    color 0E',
      `    echo AVISO: Falha ao gerar SFX ${i + 1}. Continue.`,
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
    `echo --- PRONTO! ${events.length} efeito(s) gerado(s) em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar no editor:',
    'echo   1. Importe a pasta sfx_overlays no seu projeto',
    'echo   2. O tempo de entrada esta no nome do arquivo',
    'echo      ex: sfx_003_00-05-44-000_impact.mp3',
    'echo          significa: inicia em 00:05:44 do video',
    'echo   3. Coloque cada .mp3 em uma faixa de audio dedicada',
    'echo   4. Ajuste o volume conforme necessario (sugerido: -12dB)',
    'echo.',
    'pause',
  ];

  return [...header, ...sfxCommands, ...footer].join('\r\n');
};
