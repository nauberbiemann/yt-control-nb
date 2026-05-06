import { sanitizeDownloadFileStem } from './srt-asset-pipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SfxTimelineEntry {
  timestamp: string; // MM:SS or HH:MM:SS
  effect:    string; // e.g. "Digital Glitch"
  purpose:   string; // e.g. "Abertura da narrativa"
  excerpt:   string; // script snippet
  notes:     string;
}

// ─── FFmpeg lavfi synthesis recipes ──────────────────────────────────────────
//
// Each recipe is a self-contained `ffmpeg -f lavfi -i <filter> ...` command.
// All outputs are MP3, mono, 44100 Hz, ~3 s unless the effect has a natural length.
//
// Parameters exposed per recipe:
//   DURATION  – seconds (float) from the entry duration window (or 3.0)
//   SEED      – numeric seed derived from timestamp for subtle variation

type FfmpegRecipe = {
  label:       string;
  duration:    number;       // default duration in seconds
  filterFn:    (seed: number, dur: number) => string; // lavfi filter string
};

// Small deterministic "wobble" helper so each instance sounds slightly different
const w = (seed: number, range: number, base: number): number =>
  Number((base + ((seed % 100) / 100) * range - range / 2).toFixed(3));

const RECIPES: Record<string, FfmpegRecipe> = {

  'Digital Glitch': {
    label: 'Digital Glitch',
    duration: 1.5,
    filterFn: (seed, dur) => {
      // Sine-modulated noise bursts + pitch envelope → glitchy digital crunch
      const freq  = w(seed, 200, 900);
      const mod   = w(seed, 5, 12);
      return [
        `sine=f=${freq}:r=44100:d=${dur}[s1]`,
        `anoisesrc=r=44100:a=0.08:c=white:d=${dur}[n1]`,
        `[s1][n1]amix=inputs=2:weights=0.4 0.6[mix]`,
        `[mix]tremolo=f=${mod}:d=0.9[tr]`,
        `[tr]afade=t=out:st=${Math.max(0, dur - 0.3)}:d=0.3`,
      ].join(',');
    },
  },

  'Low Rumble': {
    label: 'Low Rumble',
    duration: 3.0,
    filterFn: (seed, dur) => {
      const freq = w(seed, 10, 50);
      return [
        `sine=f=${freq}:r=44100:d=${dur}[sub]`,
        `anoisesrc=r=44100:a=0.06:c=pink:d=${dur}[pnk]`,
        `[sub][pnk]amix=inputs=2:weights=0.7 0.3[mix]`,
        `[mix]lowpass=f=120[lp]`,
        `[lp]afade=t=in:st=0:d=0.4,afade=t=out:st=${Math.max(0, dur - 0.6)}:d=0.6`,
      ].join(',');
    },
  },

  'Cinematic Whoosh': {
    label: 'Cinematic Whoosh',
    duration: 2.0,
    filterFn: (seed, dur) => {
      const startF = w(seed, 100, 200);
      const endF   = w(seed, 200, 2200);
      return [
        `sine=f=${startF}:r=44100:d=${dur}[sw]`,
        `anoisesrc=r=44100:a=0.35:c=white:d=${dur}[nw]`,
        `[sw][nw]amix=inputs=2:weights=0.2 0.8[raw]`,
        `[raw]aeval=val(0)*sin(PI*t/${dur})|val(0)*sin(PI*t/${dur}):c=same[env]`,
        `[env]highpass=f=${startF},lowpass=f=${endF}[hp]`,
        `[hp]afade=t=in:st=0:d=0.1,afade=t=out:st=${Math.max(0, dur - 0.2)}:d=0.2`,
      ].join(',');
    },
  },

  'Tension Riser': {
    label: 'Tension Riser',
    duration: 4.0,
    filterFn: (seed, dur) => {
      const startF = w(seed, 30, 120);
      const endF   = w(seed, 100, 1800);
      return [
        `anoisesrc=r=44100:a=0.5:c=pink:d=${dur}[pnk]`,
        `sine=f=${startF}:r=44100:d=${dur}[tone]`,
        `[pnk][tone]amix=inputs=2:weights=0.75 0.25[mix]`,
        `[mix]highpass=f=${startF},lowpass=f=${endF}[hp]`,
        `[hp]aeval=val(0)*(t/${dur})|val(0)*(t/${dur}):c=same[ramp]`,
        `[ramp]afade=t=out:st=${Math.max(0, dur - 0.4)}:d=0.4`,
      ].join(',');
    },
  },

  'Metallic Impact': {
    label: 'Metallic Impact',
    duration: 1.2,
    filterFn: (seed, dur) => {
      const freq = w(seed, 300, 1200);
      return [
        `sine=f=${freq}:r=44100:d=${dur}[s1]`,
        `anoisesrc=r=44100:a=0.9:c=white:d=0.05[burst]`,
        `[s1][burst]amix=inputs=2:weights=0.3 0.7[mix]`,
        `[mix]highpass=f=600,bandpass=f=${freq}:width_type=o:w=3[bp]`,
        `[bp]afade=t=out:st=${Math.max(0, dur * 0.15)}:d=${(dur * 0.85).toFixed(2)}`,
      ].join(',');
    },
  },

  'Keyboard Clicks': {
    label: 'Keyboard Clicks',
    duration: 2.0,
    filterFn: (seed, dur) => {
      const clickHz = w(seed, 2, 6);
      return [
        `anoisesrc=r=44100:a=0.6:c=white:d=${dur}[n]`,
        `[n]highpass=f=3000,bandpass=f=5000:width_type=o:w=2[hp]`,
        `[hp]tremolo=f=${clickHz}:d=0.95[tr]`,
        `[tr]afade=t=in:st=0:d=0.05,afade=t=out:st=${Math.max(0, dur - 0.2)}:d=0.2`,
      ].join(',');
    },
  },

  'Notification Ping': {
    label: 'Notification Ping',
    duration: 0.8,
    filterFn: (seed, dur) => {
      const freq = w(seed, 200, 1200);
      return [
        `sine=f=${freq}:r=44100:d=${dur}[s1]`,
        `sine=f=${w(seed * 2, 100, freq * 1.5)}:r=44100:d=${dur}[s2]`,
        `[s1][s2]amix=inputs=2[mix]`,
        `[mix]afade=t=out:st=${Math.max(0, dur * 0.2)}:d=${(dur * 0.8).toFixed(2)}`,
      ].join(',');
    },
  },

  'Ambient Room Tone': {
    label: 'Ambient Room Tone',
    duration: 4.0,
    filterFn: (seed, dur) => {
      const freq = w(seed, 50, 400);
      return [
        `anoisesrc=r=44100:a=0.15:c=brown:d=${dur}[brn]`,
        `sine=f=${freq}:r=44100:d=${dur}[pad]`,
        `[brn][pad]amix=inputs=2:weights=0.8 0.2[mix]`,
        `[mix]lowpass=f=800[lp]`,
        `[lp]afade=t=in:st=0:d=0.8,afade=t=out:st=${Math.max(0, dur - 0.8)}:d=0.8`,
      ].join(',');
    },
  },

  'Sub Bass Pulse': {
    label: 'Sub Bass Pulse',
    duration: 2.0,
    filterFn: (seed, dur) => {
      const freq = w(seed, 15, 45);
      const mod  = w(seed, 1, 3);
      return [
        `sine=f=${freq}:r=44100:d=${dur}[sub]`,
        `[sub]tremolo=f=${mod}:d=0.7[tr]`,
        `[tr]lowpass=f=100[lp]`,
        `[lp]afade=t=in:st=0:d=0.1,afade=t=out:st=${Math.max(0, dur - 0.3)}:d=0.3`,
      ].join(',');
    },
  },

  'Reverse Whoosh': {
    label: 'Reverse Whoosh',
    duration: 2.0,
    filterFn: (seed, dur) => {
      const startF = w(seed, 200, 2400);
      const endF   = w(seed, 100, 200);
      return [
        `anoisesrc=r=44100:a=0.45:c=white:d=${dur}[n]`,
        `sine=f=${startF}:r=44100:d=${dur}[s]`,
        `[n][s]amix=inputs=2:weights=0.8 0.2[mix]`,
        `[mix]highpass=f=${endF},lowpass=f=${startF}[hp]`,
        `[hp]aeval=val(0)*(1-t/${dur})|val(0)*(1-t/${dur}):c=same[ramp]`,
        `[ramp]afade=t=in:st=0:d=0.1`,
      ].join(',');
    },
  },

  // Generic fallback
  'Cinematic Accent Hit': {
    label: 'Cinematic Accent Hit',
    duration: 1.5,
    filterFn: (seed, dur) => {
      const freq = w(seed, 400, 800);
      return [
        `sine=f=${freq}:r=44100:d=${dur}[s]`,
        `anoisesrc=r=44100:a=0.5:c=white:d=0.08[burst]`,
        `[s][burst]amix=inputs=2:weights=0.25 0.75[mix]`,
        `[mix]highpass=f=300[hp]`,
        `[hp]afade=t=out:st=${Math.max(0, dur * 0.1)}:d=${(dur * 0.9).toFixed(2)}`,
      ].join(',');
    },
  },
};

// Resolve which recipe to use, falling back gracefully
const resolveRecipe = (effectName: string): FfmpegRecipe => {
  // Exact match first
  if (RECIPES[effectName]) return RECIPES[effectName];

  // Fuzzy: check if effectName contains any key word
  const lower = effectName.toLowerCase();
  for (const [key, recipe] of Object.entries(RECIPES)) {
    if (lower.includes(key.toLowerCase())) return recipe;
  }

  return RECIPES['Cinematic Accent Hit'];
};

// Numeric seed from timestamp string
const timestampToSeed = (ts: string): number =>
  ts.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000;

// Safe filename from timestamp: "02:09" → "02-09"
const safeTs = (ts: string) => ts.replace(/:/g, '-').replace(',', '-');

// ─── BAT builder ──────────────────────────────────────────────────────────────

/**
 * Builds the content of the _3_sfx.bat file from the AI-generated SFX timeline.
 *
 * Each named effect (Digital Glitch, Tension Riser, …) is synthesized entirely
 * via FFmpeg's lavfi (virtual device) — no Python, no external audio files.
 *
 * @param sfxTimelineTxt  The sfxTimelineTxt string from postScriptPackage
 * @param stem            Project artifact stem (used for naming)
 */
export const buildSfxBatFromTimeline = (
  sfxTimelineTxt: string,
  stem: string,
): string => {
  const safeStem = sanitizeDownloadFileStem(stem);

  // Parse the SFX timeline text into entries
  const entries = parseSfxTimelineForBat(sfxTimelineTxt);
  if (!entries.length) return '';

  const header = [
    '@echo off',
    'chcp 65001 >nul',
    'color 0A',
    '',
    ':: ================================================================',
    ':: ETAPA 3 — SFX Generator (FFmpeg lavfi — sem Python)',
    `:: Projeto : ${safeStem}`,
    `:: Efeitos : ${entries.length} ponto(s) da timeline da IA`,
    '::',
    ':: Sintetiza cada efeito localmente via FFmpeg.',
    ':: Roda em paralelo com os Bats 1 e 2.',
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
    '    echo Pressione qualquer tecla para fechar...',
    '    pause >nul',
    '    exit /b 1',
    ')',
    '',
    ':: [2] Criando pasta de output',
    'set "OUT_DIR=%~dp0sfx_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    'echo.',
    'echo --- SFX GENERATOR (FFmpeg lavfi) ---',
    `echo Projeto : ${safeStem}`,
    `echo Efeitos : ${entries.length} ponto(s) da timeline`,
    'echo Output  : %OUT_DIR%',
    'echo.',
    '',
  ];

  const commands: string[] = [];

  entries.forEach((entry, i) => {
    const recipe  = resolveRecipe(entry.effect);
    const seed    = timestampToSeed(entry.timestamp);
    const dur     = recipe.duration;
    const filter  = recipe.filterFn(seed, dur);
    const outName = `sfx_${String(i + 1).padStart(3, '0')}_${safeTs(entry.timestamp)}_${safeStem.slice(0, 20)}.mp3`;
    const label   = entry.effect;
    const purpose = entry.purpose !== '—' ? entry.purpose : '';

    commands.push(
      `:: --- [${i + 1}/${entries.length}] ${entry.timestamp} | ${label} ---`,
      `echo [${i + 1}/${entries.length}] ${label}${purpose ? ` — ${purpose}` : ''}`,
      `echo     Tempo  : ${entry.timestamp}`,
      `echo     Output : ${outName}`,
      `ffmpeg -y -f lavfi -i "${filter}" -ar 44100 -ac 1 -ab 192k "%OUT_DIR%\\${outName}" >nul 2>&1`,
      'if %errorlevel% neq 0 (',
      '    color 0E',
      `    echo AVISO: Falha ao gerar SFX ${i + 1}. Verifique a versao do FFmpeg (>= 4.4).`,
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
    `echo --- PRONTO! ${entries.length} efeito(s) gerado(s) em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar no editor:',
    'echo   1. Importe a pasta sfx_overlays no seu projeto',
    'echo   2. O tempo de entrada esta no nome do arquivo',
    'echo      ex: sfx_006_12-14_Eliminando.mp3',
    'echo          significa: insira em 12:14 do video',
    'echo   3. Coloque cada .mp3 em uma faixa de audio dedicada',
    'echo   4. Ajuste o volume conforme necessario (sugerido: -12dB)',
    'echo.',
    'pause',
  ];

  return [...header, ...commands, ...footer].join('\r\n');
};

// ─── Timeline parser (local copy — avoids importing ScriptEngine internals) ───

/**
 * Parses the sfxTimelineTxt string into SfxTimelineEntry objects.
 * Mirrors the parseSfxTimelineEntries logic in ScriptEngine.tsx.
 */
export const parseSfxTimelineForBat = (value: string): SfxTimelineEntry[] => {
  const normalized = String(value || '').replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];

  const blockRegex = /(?:^|\n)\s*(?:\*\*)?\[?(\d{2}:\d{2}(?::\d{2})?)\]?(?:\*\*)?[\s\S]*?(?=(?:\n\s*(?:\*\*)?\[?\d{2}:\d{2}(?::\d{2})?\]?(?:\*\*)?)|$)/g;
  const matches = normalized.match(blockRegex);
  if (!matches) return [];

  return matches
    .map((match, index) => {
      const entry = match.trim();
      if (!entry) return null;

      const tsMatch      = entry.match(/(?:\*\*)?\[?(\d{2}:\d{2}(?::\d{2})?)\]?(?:\*\*)?/);
      const effectMatch  = entry.match(/EFEITO:\s*([^\n]+)/i);
      const purposeMatch = entry.match(/FUNC(?:A|Ã)O:\s*([^\n]+)/i);
      const excerptMatch = entry.match(/TRECHO:\s*([^\n]+)/i);
      const notesMatch   = entry.match(/OBS:\s*([^\n]+)/i);

      const clean = (s: string | undefined) =>
        s ? s.trim().replace(/\*\*|["']/g, '') : '—';

      return {
        timestamp: tsMatch ? tsMatch[1] : `00:${String(index).padStart(2, '0')}`,
        effect:    clean(effectMatch?.[1]),
        purpose:   clean(purposeMatch?.[1]),
        excerpt:   clean(excerptMatch?.[1]),
        notes:     clean(notesMatch?.[1]),
      } as SfxTimelineEntry;
    })
    .filter((e): e is SfxTimelineEntry => e !== null && e.timestamp !== '');
};
