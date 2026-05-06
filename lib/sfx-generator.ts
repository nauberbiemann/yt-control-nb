import { sanitizeDownloadFileStem, type SrtAssetRow } from './srt-asset-pipeline';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SfxTimelineEntry {
  timestamp: string;
  effect:    string;
  purpose:   string;
  excerpt:   string;
  notes:     string;
}

// ─── FFmpeg aevalsrc recipes ──────────────────────────────────────────────────
//
// ALL recipes use a SINGLE aevalsrc source + -af chain.
// This is the only reliable way to use lavfi without filter_complex in a BAT.
//
// Command structure:
//   ffmpeg -y -f lavfi -i "aevalsrc='<expr>':c=mono:s=44100:d=<dur>"
//          -af "<af_chain>" -ar 44100 -ac 1 -ab 192k output.mp3
//
// The aevalsrc expression uses only: sin(), PI, t, random(0), basic math.
// No named pads, no amix, no multi-source — guaranteed to work on FFmpeg >= 4.0.

type FfmpegRecipe = {
  label:    string;
  duration: number;
  // Returns { src, af } — two separate strings, no quoting ambiguity
  buildFn:  (seed: number, dur: number) => { src: string; af: string };
};

const w = (seed: number, range: number, base: number): number =>
  Number((base + ((seed % 100) / 100) * range - range / 2).toFixed(2));

const RECIPES: Record<string, FfmpegRecipe> = {

  'Digital Glitch': {
    label: 'Digital Glitch',
    duration: 1.5,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='sin(2*PI*${w(seed,200,900)}*t)*(random(0)-0.5)*abs(sin(2*PI*${w(seed,4,10)}*t))':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=300,afade=t=out:st=${(dur*0.6).toFixed(2)}:d=${(dur*0.4).toFixed(2)}`,
    }),
  },

  'Low Rumble': {
    label: 'Low Rumble',
    duration: 3.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='0.5*sin(2*PI*${w(seed,15,50)}*t)+0.3*(random(0)-0.5)':c=mono:s=44100:d=${dur}`,
      af: `lowpass=f=160,afade=t=in:st=0:d=0.4,afade=t=out:st=${(dur-0.6).toFixed(2)}:d=0.6`,
    }),
  },

  'Cinematic Whoosh': {
    label: 'Cinematic Whoosh',
    duration: 2.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='(random(0)-0.5)*sin(PI*t/${dur})':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=${w(seed,100,200).toFixed(0)},lowpass=f=4000,afade=t=in:st=0:d=0.1,afade=t=out:st=${(dur-0.2).toFixed(2)}:d=0.2`,
    }),
  },

  'Tension Riser': {
    label: 'Tension Riser',
    duration: 4.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='(random(0)-0.5)*(t/${dur})+0.2*sin(2*PI*${w(seed,60,120)}*t)*(t/${dur})':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=80,afade=t=out:st=${(dur-0.5).toFixed(2)}:d=0.5`,
    }),
  },

  'Metallic Impact': {
    label: 'Metallic Impact',
    duration: 1.2,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='(random(0)-0.5)*exp(-t*8)+0.4*sin(2*PI*${w(seed,400,1000)}*t)*exp(-t*12)':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=500,afade=t=out:st=${(dur*0.3).toFixed(2)}:d=${(dur*0.7).toFixed(2)}`,
    }),
  },

  'Keyboard Clicks': {
    label: 'Keyboard Clicks',
    duration: 2.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='(random(0)-0.5)*abs(sin(2*PI*${w(seed,2,5)}*t))':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=2000,bandpass=f=4000:width_type=o:w=2,afade=t=in:st=0:d=0.05,afade=t=out:st=${(dur-0.2).toFixed(2)}:d=0.2`,
    }),
  },

  'Notification Ping': {
    label: 'Notification Ping',
    duration: 0.8,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='sin(2*PI*${w(seed,200,1200)}*t)+0.5*sin(2*PI*${w(seed,150,1800)}*t)':c=mono:s=44100:d=${dur}`,
      af: `afade=t=out:st=${(dur*0.2).toFixed(2)}:d=${(dur*0.8).toFixed(2)}`,
    }),
  },

  'Ambient Room Tone': {
    label: 'Ambient Room Tone',
    duration: 4.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='0.12*(random(0)-0.5)+0.05*sin(2*PI*${w(seed,50,300)}*t)':c=mono:s=44100:d=${dur}`,
      af: `lowpass=f=600,afade=t=in:st=0:d=0.8,afade=t=out:st=${(dur-0.8).toFixed(2)}:d=0.8`,
    }),
  },

  'Sub Bass Pulse': {
    label: 'Sub Bass Pulse',
    duration: 2.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='sin(2*PI*${w(seed,10,45)}*t)*abs(sin(2*PI*${w(seed,1,2.5)}*t))':c=mono:s=44100:d=${dur}`,
      af: `lowpass=f=100,afade=t=in:st=0:d=0.1,afade=t=out:st=${(dur-0.3).toFixed(2)}:d=0.3`,
    }),
  },

  'Reverse Whoosh': {
    label: 'Reverse Whoosh',
    duration: 2.0,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='(random(0)-0.5)*(1-t/${dur})':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=${w(seed,200,400).toFixed(0)},lowpass=f=3000,afade=t=in:st=0:d=0.1`,
    }),
  },

  'Cinematic Accent Hit': {
    label: 'Cinematic Accent Hit',
    duration: 1.5,
    buildFn: (seed, dur) => ({
      src: `aevalsrc='(random(0)-0.5)*exp(-t*6)+0.3*sin(2*PI*${w(seed,300,700)}*t)*exp(-t*8)':c=mono:s=44100:d=${dur}`,
      af: `highpass=f=200,afade=t=out:st=${(dur*0.15).toFixed(2)}:d=${(dur*0.85).toFixed(2)}`,
    }),
  },
};

const resolveRecipe = (effectName: string): FfmpegRecipe => {
  if (RECIPES[effectName]) return RECIPES[effectName];
  const lower = effectName.toLowerCase();
  for (const [key, recipe] of Object.entries(RECIPES)) {
    if (lower.includes(key.toLowerCase())) return recipe;
  }
  return RECIPES['Cinematic Accent Hit'];
};

const timestampToSeed = (ts: string): number =>
  ts.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) % 1000;

const safeTs = (ts: string) => ts.replace(/:/g, '-').replace(',', '-');

const toSeconds = (ts: string): number => {
  const clean = ts.replace(',', '.');
  const parts = clean.split(':').map(Number);
  if (parts.length === 2) return parts[0] * 60 + parts[1];
  return parts[0] * 3600 + parts[1] * 60 + parts[2];
};

const snapToSrtRow = (aiTs: string, rows: SrtAssetRow[]): { startTime: string; rowNumber: number } | null => {
  if (!rows.length) return null;
  const aiSec = toSeconds(aiTs);
  let best = rows[0];
  let bestDiff = Math.abs(toSeconds(best.startTime) - aiSec);
  for (const row of rows) {
    const diff = Math.abs(toSeconds(row.startTime) - aiSec);
    if (diff < bestDiff) { bestDiff = diff; best = row; }
  }
  return { startTime: best.startTime, rowNumber: best.rowNumber };
};

// ─── BAT builder ──────────────────────────────────────────────────────────────

export const buildSfxBatFromTimeline = (sfxTimelineTxt: string, stem: string, srtRows: SrtAssetRow[] = []): string => {
  const safeStem  = sanitizeDownloadFileStem(stem);
  const entries   = parseSfxTimelineForBat(sfxTimelineTxt);
  if (!entries.length) return '';

  const L = (...lines: string[]) => lines;

  const header = L(
    '@echo off',
    'chcp 65001 >nul',
    'color 0A',
    '',
    ':: ================================================================',
    `:: ETAPA 3 -- SFX Generator (FFmpeg aevalsrc -- sem Python)`,
    `:: Projeto : ${safeStem}`,
    `:: Efeitos : ${entries.length} pontos da timeline da IA`,
    '::',
    ':: Sintetiza cada efeito localmente via FFmpeg.',
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
    ':: [2] Criando pasta de output',
    'set "OUT_DIR=%~dp0sfx_overlays"',
    'if not exist "%OUT_DIR%" mkdir "%OUT_DIR%"',
    '',
    'echo.',
    'echo --- SFX GENERATOR ---',
    `echo Projeto : ${safeStem}`,
    `echo Efeitos : ${entries.length} pontos`,
    'echo Output  : %OUT_DIR%',
    'echo.',
  );

  const commands: string[] = [];
  entries.forEach((entry, i) => {
    const recipe  = resolveRecipe(entry.effect);
    const seed    = timestampToSeed(entry.timestamp);
    const dur     = recipe.duration;
    const { src, af } = recipe.buildFn(seed, dur);
    const snapped = snapToSrtRow(entry.timestamp, srtRows);
    const exactTs = snapped ? snapped.startTime : entry.timestamp;
    const csvRow  = snapped ? snapped.rowNumber : (i + 1);
    const outName = `${String(csvRow).padStart(3, '0')}_sfx_${safeTs(exactTs)}_${recipe.label.replace(/\s+/g, '_')}.mp3`;

    commands.push(
      `:: --- [${i + 1}/${entries.length}] ${entry.timestamp} -> SRT ${exactTs} | ${entry.effect} ---`,
      `echo [${i + 1}/${entries.length}] ${entry.effect} -- ${entry.purpose}`,
      `echo     IA: ${entry.timestamp} -- SRT: ${exactTs}`,
      `echo     Output : ${outName}`,
      `ffmpeg -y -f lavfi -i "${src}" -af "${af}" -ar 44100 -ac 1 -ab 192k "%OUT_DIR%\\${outName}"`,
      'if %errorlevel% neq 0 (',
      `    echo AVISO: Falha ao gerar SFX ${i + 1}. Verifique sua versao do FFmpeg.`,
      ') else (',
      '    echo     OK!',
      ')',
      'echo.',
    );
  });

  const footer = L(
    ':: ================================================================',
    'color 0A',
    'echo.',
    `echo --- PRONTO! ${entries.length} efeitos gerados em:`,
    'echo %OUT_DIR%',
    'echo.',
    'echo Como usar: importe sfx_overlays no editor, insira cada .mp3',
    'echo no tempo indicado no nome do arquivo, volume sugerido: -12dB',
    'echo.',
    'pause',
  );

  return [...header, ...commands, ...footer].join('\r\n');
};

// ─── Timeline parser ───────────────────────────────────────────────────────────

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
      const clean = (s?: string) => s ? s.trim().replace(/\*\*|["']/g, '') : '—';
      return {
        timestamp: tsMatch?.[1] ?? `00:${String(index).padStart(2, '0')}`,
        effect:    clean(effectMatch?.[1]),
        purpose:   clean(purposeMatch?.[1]),
        excerpt:   clean(excerptMatch?.[1]),
        notes:     clean(notesMatch?.[1]),
      } as SfxTimelineEntry;
    })
    .filter((e): e is SfxTimelineEntry => e !== null && e.timestamp !== '');
};
