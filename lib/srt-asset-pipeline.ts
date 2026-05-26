export type SrtAssetType = '' | 'texto' | 'vídeo' | 'imagem' | 'avatar' | 'hyperframe';

export interface SrtAssetRow {
  rowNumber: number;
  startTime: string;
  endTime: string;
  texto: string;
  asset: SrtAssetType;
  prompt: string;
  caminho: string;
  isFallback?: boolean;
  texto_adicional?: string;
}

export interface SrtAssetStats {
  total: number;
  texto: number;
  avatar: number;
  video: number;
  image: number;
  hyperframe: number;
}

export interface SrtTextRenderInfo {
  csvPath: string;
  outputDir: string;
  renderedCount: number;
  reusedCount: number;
  log: string;
  lastRenderedAt: string;
}

export interface SrtAssetPipelineResult {
  rows: SrtAssetRow[];
  csvContent: string;
  videoPromptsTxt: string;
  imagePromptsTxt: string;
  stats: SrtAssetStats;
  textRender: SrtTextRenderInfo | null;
  generatedAt?: string;
}

const TEXT_MAX_CHARS = 25;
const VIDEO_MAX_DURATION_MS = 8_000;
const FIRST_SECTION_LIMIT = 0.3;
const SECOND_SECTION_LIMIT = 0.7;
const FIRST_SECTION_INTERVAL_MS = 20_000;
const SECOND_SECTION_INTERVAL_MS = 30_000;
const THIRD_SECTION_INTERVAL_MS = 60_000;
// Faceless mode: shorter b-roll interval — editor stretches the previous media for gaps
const FACELESS_INTERVAL_MS = 6_000;

// --- Regras de Ritmo de Humanização e Cooldown do Avatar ---
const HOOK_CLEAN_ZONE_AVATAR_MS = 12_000;      // Primeiros 12s sem B-Rolls/Hyperframes no modo Avatar
const HOOK_CLEAN_ZONE_FACELESS_MS = 4_000;      // Primeiros 4s sem B-Rolls no modo Faceless
const HOOK_CLEAN_ZONE_VLOG_MS = 6_000;          // Primeiros 6s sem B-Rolls no modo VLOG
const MIN_AVATAR_CLEAN_TIME_AVATAR_MS = 5_000;  // Mínimo de 5s de avatar limpo entre B-Rolls
const MIN_AVATAR_CLEAN_TIME_FACELESS_MS = 3_000;// Mínimo de 3s de avatar limpo entre B-Rolls
const MIN_AVATAR_CLEAN_TIME_VLOG_MS = 4_000;    // Mínimo de 4s de avatar limpo entre B-Rolls
const HF_BROLL_EXCLUSION_MS = 5_000;            // Respiro mínimo de 5s entre Hyperframes e B-Rolls


export const normalizeLineBreaks = (value: string) => String(value || '').replace(/\r\n/g, '\n');

export const normalizeAssetType = (value: string): SrtAssetType => {
  const normalized = (value || '').trim().toLowerCase();

  if (!normalized) return '';
  if (normalized === 'texto') return 'texto';
  if (normalized === 'avatar') return 'avatar';
  if (normalized === 'imagem') return 'imagem';
  if (normalized === 'video' || normalized === 'vídeo' || normalized === 'vã­deo') return 'vídeo';
  if (normalized === 'hyperframe') return 'hyperframe';
  return '';
};

export const parseSrtTimeToMs = (timeValue: string) => {
  const [hours, minutes, secondsAndMs] = timeValue.split(':');
  const [seconds, milliseconds] = secondsAndMs.split(',');
  return (((Number(hours) * 60 * 60) + (Number(minutes) * 60) + Number(seconds)) * 1000) + Number(milliseconds);
};

const getIntervalMs = (rowIndex: number, totalRows: number) => {
  const progress = (rowIndex + 1) / totalRows;
  if (progress <= FIRST_SECTION_LIMIT) return FIRST_SECTION_INTERVAL_MS;
  if (progress <= SECOND_SECTION_LIMIT) return SECOND_SECTION_INTERVAL_MS;
  return THIRD_SECTION_INTERVAL_MS;
};

const getBrollAsset = (startMs: number, endMs: number): SrtAssetType => {
  if (endMs - startMs <= VIDEO_MAX_DURATION_MS) return 'vídeo';
  return 'imagem';
};

export const parseSrtToRows = (srtText: string): SrtAssetRow[] => {
  const content = normalizeLineBreaks(srtText).trim();
  if (!content) return [];

  const blocks = content.split(/\n\s*\n/g).map((block) => block.trim()).filter(Boolean);

  return blocks.flatMap((block, index) => {
    const lines = block.split('\n').map((line) => line.trim()).filter(Boolean);
    if (lines.length < 3) return [];

    const timeLine = lines[1];
    if (!timeLine.includes(' --> ')) return [];

    const [startTime, endTime] = timeLine.split(' --> ');
    const texto = lines.slice(2).join(' ').trim();

    return [{
      rowNumber: index + 1,
      startTime,
      endTime,
      texto,
      asset: '',
      prompt: '',
      caminho: '',
    }];
  });
};

export const parseCsvToRows = (csvContent: string): SrtAssetRow[] => {
  const text = csvContent.replace(/^\uFEFF/, '');
  if (!text.trim()) return [];

  const records: string[][] = [];
  let currentField = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index];
    const nextChar = text[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentField += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === ',') {
      currentRow.push(currentField);
      currentField = '';
      continue;
    }

    if (!inQuotes && char === '\n') {
      currentRow.push(currentField);
      records.push(currentRow);
      currentRow = [];
      currentField = '';
      continue;
    }

    if (!inQuotes && char === '\r') {
      continue;
    }

    currentField += char;
  }

  if (currentField.length > 0 || currentRow.length > 0) {
    currentRow.push(currentField);
    records.push(currentRow);
  }

  const [headerRow, ...dataRows] = records;
  if (!headerRow?.length) return [];

  const headerMap = new Map<string, number>();
  headerRow.forEach((header, index) => {
    headerMap.set(header.trim().toLowerCase(), index);
  });

  return dataRows
    .filter((row) => row.some((value) => value.trim().length > 0))
    .map((row, index) => ({
      rowNumber: index + 1,
      startTime: row[headerMap.get('start time') ?? -1] || '',
      endTime: row[headerMap.get('end time') ?? -1] || '',
      texto: row[headerMap.get('texto') ?? -1] || '',
      asset: normalizeAssetType(row[headerMap.get('asset') ?? -1] || ''),
      prompt: row[headerMap.get('prompt') ?? -1] || '',
      caminho: row[headerMap.get('caminho') ?? -1] || '',
      texto_adicional: row[headerMap.get('texto_adicional') ?? -1] || '',
    }));
};

// Seeded pseudo-random generator (using a sinus-based hash spread)
export class SeededRandom {
  private seed: number;
  constructor(seed: number) {
    this.seed = seed;
  }
  next(): number {
    const x = Math.sin(this.seed++) * 10000;
    return x - Math.floor(x);
  }
  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }
}

export const calculateSrtSeed = (srtText: string): number => {
  const content = srtText || '';
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0;
  }
  return Math.abs(hash);
};

export const applyAssetRules = (
  rows: SrtAssetRow[],
  videoFormat: 'avatar' | 'faceless' | 'vlog' = 'avatar',
  srtText = ''
) => {
  if (!rows.length) return rows;

  const combinedText = srtText || rows.map((r) => r.texto).join(' ');
  const seed = calculateSrtSeed(combinedText);
  const prng = new SeededRandom(seed);

  let lastBrollMarkerMs = 0;
  let lastBrollEndMs = 0; // Monitora o fim do último B-roll inserido para aplicar o cooldown
  const totalRows = rows.length;

  const rowEndsWithPunctuation = (text: string): boolean => {
    const clean = text.trim();
    if (clean.endsWith('...') || clean.endsWith('..')) return true;
    const lastChar = clean[clean.length - 1];
    return ['.', '!', '?', ',', ';', ':'].includes(lastChar);
  };

  return rows.map((row, index) => {
    const text = row.texto.trim();
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);

    // Short text always becomes a cinematic text overlay
    if (text.length <= TEXT_MAX_CHARS) {
      return { ...row, asset: 'texto' as const };
    }

    const isFaceless = videoFormat === 'faceless';
    const isVlog = videoFormat === 'vlog';
    const cleanZoneMs = isVlog
      ? HOOK_CLEAN_ZONE_VLOG_MS
      : isFaceless
      ? HOOK_CLEAN_ZONE_FACELESS_MS
      : HOOK_CLEAN_ZONE_AVATAR_MS;
    const minCleanTimeMs = isVlog
      ? MIN_AVATAR_CLEAN_TIME_VLOG_MS
      : isFaceless
      ? MIN_AVATAR_CLEAN_TIME_FACELESS_MS
      : MIN_AVATAR_CLEAN_TIME_AVATAR_MS;

    // --- REGRA 1: Hook de Abertura Humano Seguro ---
    // Impede qualquer B-roll de quebrar a humanização inicial nos primeiros segundos do vídeo
    if (startMs < cleanZoneMs) {
      return { ...row, asset: 'avatar' as SrtAssetType };
    }

    // --- REGRA 2: Respiro do Avatar (Cooldown pós B-roll) ---
    // Impede o encavalamento sequencial rápido de múltiplos B-rolls, dando tempo para a fala do avatar
    if (startMs - lastBrollEndMs < minCleanTimeMs) {
      return { ...row, asset: 'avatar' as SrtAssetType };
    }

    let intervalMs = 0;
    const progress = (index + 1) / totalRows;

    if (isFaceless) {
      if (progress <= 0.15) {
        // Hook: fast cuts (3s to 5s)
        intervalMs = Math.round(prng.range(3000, 5000));
      } else if (progress <= 0.85) {
        // Body: comfortable cuts (6s to 10s)
        intervalMs = Math.round(prng.range(6000, 10000));
      } else {
        // CTA: stimulating cuts (5s to 7s)
        intervalMs = Math.round(prng.range(5000, 7000));
      }
    } else if (isVlog) {
      if (progress <= 0.30) {
        // Hook: dynamic cuts (10s to 16s)
        intervalMs = Math.round(prng.range(10000, 16000));
      } else if (progress <= 0.70) {
        // Body: comfortable cuts (25s to 35s)
        intervalMs = Math.round(prng.range(25000, 35000));
      } else {
        // CTA: stabilizing cuts (35s to 50s)
        intervalMs = Math.round(prng.range(35000, 50000));
      }
    } else {
      if (progress <= 0.30) {
        // Hook: dynamic cuts (8s to 14s) - Reduzido a pedido do usuário para aumentar o dinamismo inicial
        intervalMs = Math.round(prng.range(8000, 14000));
      } else if (progress <= 0.70) {
        // Body: comfortable cuts (22s to 32s)
        intervalMs = Math.round(prng.range(22000, 32000));
      } else {
        // CTA: stabilizing cuts (40s to 55s)
        intervalMs = Math.round(prng.range(40000, 55000));
      }
    }

    // --- Alinhamento por Pontuação (Natural Cuts) ---
    // Look ahead in a tolerance window of +/- 1.5 seconds (1500 ms) around ideal cut time
    const idealCutMs = lastBrollMarkerMs + intervalMs;
    const toleranceMs = 1500;
    
    let bestPunctuationRowIndex = -1;
    let bestDiff = Infinity;

    for (let j = index; j < totalRows; j++) {
      const jStartMs = parseSrtTimeToMs(rows[j].startTime);
      const jEndMs = parseSrtTimeToMs(rows[j].endTime);
      
      if (jStartMs > idealCutMs + toleranceMs) break;

      if (rowEndsWithPunctuation(rows[j].texto)) {
        const diff = Math.abs(jEndMs - idealCutMs);
        if (diff <= toleranceMs && diff < bestDiff) {
          bestDiff = diff;
          bestPunctuationRowIndex = j;
        }
      }
    }

    if (bestPunctuationRowIndex !== -1) {
      const pEndMs = parseSrtTimeToMs(rows[bestPunctuationRowIndex].endTime);
      if (bestPunctuationRowIndex === index) {
        lastBrollMarkerMs = Math.max(lastBrollMarkerMs + (pEndMs - startMs), startMs);
        lastBrollEndMs = endMs; // Registra o término do B-roll para o cooldown da próxima iteração
        return { ...row, asset: getBrollAsset(startMs, endMs) };
      }
    }

    if (endMs - lastBrollMarkerMs >= intervalMs) {
      lastBrollMarkerMs = Math.max(lastBrollMarkerMs + intervalMs, startMs);
      lastBrollEndMs = endMs; // Registra o término do B-roll para o cooldown da próxima iteração
      return { ...row, asset: getBrollAsset(startMs, endMs) };
    }

    // Gaps temporarily marked as avatar in both modes so that applyHyperframeRules can identify and convert them.
    // We will clear the remaining ones afterwards for Faceless Mode using finalizeFacelessRows.
    return { ...row, asset: 'avatar' as SrtAssetType };
  });
};


export const finalizeFacelessRows = (
  rows: SrtAssetRow[],
  videoFormat: 'avatar' | 'faceless' | 'vlog' = 'avatar'
): SrtAssetRow[] => {
  if (videoFormat !== 'faceless') return rows;
  return rows.map((row) => {
    if (normalizeAssetType(row.asset) === 'avatar') {
      const startMs = parseSrtTimeToMs(row.startTime);
      const endMs = parseSrtTimeToMs(row.endTime);
      const assetType = (endMs - startMs) <= VIDEO_MAX_DURATION_MS ? 'vídeo' : 'imagem';
      return { ...row, asset: assetType };
    }
    return row;
  });
};

export const sanitizePrompt = (prompt: string) => String(prompt || '').replace(/\s+/g, ' ').trim();

export const buildPromptTxtOutputs = (rows: SrtAssetRow[]) => {
  const videoLines: string[] = [];
  const imageLines: string[] = [];

  rows.forEach((row) => {
    const prompt = sanitizePrompt(row.prompt || '');
    if (!prompt) return;

    const line = `${row.rowNumber}: ${prompt}`;
    if (normalizeAssetType(row.asset) === 'vídeo') videoLines.push(line);
    if (normalizeAssetType(row.asset) === 'imagem') imageLines.push(line);
  });

  return {
    videoPromptsTxt: videoLines.join('\n'),
    imagePromptsTxt: imageLines.join('\n'),
  };
};

const csvEscape = (value: string) => {
  const normalized = value ?? '';
  if (/[,"\n]/.test(normalized)) {
    return `"${normalized.replace(/"/g, '""')}"`;
  }
  return normalized;
};

export const serializeRowsToCsv = (rows: SrtAssetRow[]) => {
  const headers = ['start time', 'end time', 'texto', 'asset', 'prompt', 'caminho', 'texto_adicional'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => [
      csvEscape(row.startTime),
      csvEscape(row.endTime),
      csvEscape(row.texto),
      csvEscape(normalizeAssetType(row.asset)),
      csvEscape(row.prompt),
      csvEscape(row.caminho),
      csvEscape(row.texto_adicional ?? ''),
    ].join(',')),
  ];

  return lines.join('\n');
};

export const buildAssetStats = (rows: SrtAssetRow[]): SrtAssetStats => ({
  total: rows.length,
  texto: rows.filter((row) => normalizeAssetType(row.asset) === 'texto').length,
  avatar: rows.filter((row) => normalizeAssetType(row.asset) === 'avatar').length,
  video: rows.filter((row) => normalizeAssetType(row.asset) === 'vídeo').length,
  image: rows.filter((row) => normalizeAssetType(row.asset) === 'imagem').length,
  hyperframe: rows.filter((row) => normalizeAssetType(row.asset) === 'hyperframe').length,
});

/**
 * Enforces a minimum cooldown between consecutive 'texto' rows.
 * When multiple short-text rows cluster together (e.g. 5 punchy phrases in 15s),
 * only the first passes; the rest revert to 'avatar' (first-wins rule).
 * Those reverted rows become candidates for applyHyperframeRules.
 */
export const enforceTextoCooldown = (
  rows: SrtAssetRow[],
  cooldownMs = 35_000,
): SrtAssetRow[] => {
  let lastTextoEndMs = -Infinity;

  return rows.map((row) => {
    if (normalizeAssetType(row.asset) !== 'texto') return row;

    const startMs = parseSrtTimeToMs(row.startTime);
    if (startMs - lastTextoEndMs >= cooldownMs) {
      lastTextoEndMs = parseSrtTimeToMs(row.endTime);
      return row;
    }

    // Within cooldown window — revert to avatar
    return { ...row, asset: 'avatar' as SrtAssetType };
  });
};

// ─── HyperFrame narrative rules ──────────────────────────────────────────────

const HF_TEMPLATES = {
  // ── Narrative anchor points (rules 1–6) ──────────────────────────────────
  chapterBreak: 'hf_break',        // ~52% narrative midpoint reset — full-screen kinetic
  closeCrop:    'hf_face_top',     // ~17% post-hook camera reframe — avatar top-right
  captionFocus: 'hf_focus',        // ~82% pre-CTA emphasis — right-side info panel
  sidePanel:    'hf_double',       // longest avatar block midpoint — split 35/65
  midEarly:     'hf_floating',     // ~33% list/concepts moment — floating cards
  midLate:      'hf_vertical',     // ~67% technical/analysis moment — side cut
  // ── Anti-repetition fallback pool (used when primary template is taken) ──
  holoRoom:     'hf_holo',         // holographic multi-panel — blue teal
  documentary:  'hf_documentary',  // Netflix-style documentary frame — red accent
  dynamicCrop:  'hf_dynamic',      // viewfinder + rule-of-thirds — white HUD
  faceBottom:   'hf_face_bottom',  // avatar bottom-left — cyan accent
  // ── Novos templates premiums descobriveis no filesystem ──────────────────
  bento:        'hf_bento',
  codeTerminal: 'hf_code_terminal',
  dataChart:    'hf_data_chart',
  notification: 'hf_notification',
  quote:        'hf_quote',
  reddit:       'hf_reddit',
  spotify:      'hf_spotify',
  worldMap:     'hf_world_map',
  xPost:        'hf_x_post',
} as const;

/**
 * Safely discovers all template filenames physically existing in the hf-templates folder.
 * Uses dynamic require to prevent client-side bundle crashes in Next.js.
 */
const getDiscoveredTemplates = (): string[] => {
  const defaults = [
    'hf_focus', 'hf_break', 'hf_double', 'hf_floating', 'hf_holo',
    'hf_vertical', 'hf_face_bottom', 'hf_face_top', 'hf_documentary', 'hf_dynamic',
    'hf_bento', 'hf_notification', 'hf_world_map', 'hf_data_chart', 'hf_reddit',
    'hf_spotify', 'hf_code_terminal', 'hf_quote', 'hf_x_post'
  ];

  if (typeof window !== 'undefined') {
    return defaults;
  }

  try {
    const fs = require('fs');
    const path = require('path');
    
    // Skill siblings templates path
    const skillTemplatesDir = path.join(
      process.cwd(),
      '..', 'Produção em Massa', '1-ContentFlow',
      'avatar-hyperframes-editor-skill', 'projects', 'default', 'templates'
    );
    
    let templatesBase = skillTemplatesDir;
    const localFallback = path.join(process.cwd(), 'lib', 'hf-templates');
    
    if (!fs.existsSync(templatesBase) && fs.existsSync(localFallback)) {
      templatesBase = localFallback;
    }

    if (fs.existsSync(templatesBase)) {
      const files = fs.readdirSync(templatesBase) as string[];
      const names = files
        .filter((file) => file.endsWith('.html'))
        .map((file) => file.replace('.html', ''));
      if (names.length > 0) return names;
    }
  } catch (err) {
    // Graceful fallback
  }

  return defaults;
};

/**
 * Seeded Fisher-Yates shuffle algorithm to guarantee stable visual randomness
 */
export const seededShuffle = <T>(array: T[], prng: SeededRandom): T[] => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(prng.next() * (i + 1));
    const temp = result[i];
    result[i] = result[j];
    result[j] = temp;
  }
  return result;
};

// Phase B (editor-hyperframes): minimum scene duration to guarantee GSAP animations complete fully
const MIN_HF_DURATION_MS = 5_000;

/** Returns index of the avatar row closest to targetRatio (0–1) of total rows,
 *  excluding the protected first/last 10%, already-used rows, and rows shorter
 *  than MIN_HF_DURATION_MS (Phase B: GSAP animations need at least 5s to play). */
const findClosestAvatarRow = (
  rows: SrtAssetRow[],
  targetRatio: number,
  usedIndices: Set<number>,
): number => {
  const total = rows.length;
  const guardStart = Math.floor(total * 0.10);
  const guardEnd   = Math.ceil(total * 0.90);
  const target     = Math.round(targetRatio * total);

  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = guardStart; i < guardEnd; i++) {
    if (usedIndices.has(i)) continue;
    if (normalizeAssetType(rows[i].asset) !== 'avatar') continue;
    // Phase B: skip rows too short for the HyperFrame animation to complete
    const durationMs = parseSrtTimeToMs(rows[i].endTime) - parseSrtTimeToMs(rows[i].startTime);
    if (durationMs < MIN_HF_DURATION_MS) continue;

    // --- REGRA DE SEGURANÇA: Respiro contra B-rolls (cooldown do avatar) ---
    // Evita posicionar Hyperframes encavalados com B-rolls existentes, mantendo o respiro
    const rowStartMs = parseSrtTimeToMs(rows[i].startTime);
    const rowEndMs = parseSrtTimeToMs(rows[i].endTime);
    let tooCloseToBroll = false;

    for (let k = 0; k < total; k++) {
      const assetType = normalizeAssetType(rows[k].asset);
      if (assetType === 'vídeo' || assetType === 'imagem' || assetType === 'hyperframe') {
        const brollStartMs = parseSrtTimeToMs(rows[k].startTime);
        const brollEndMs = parseSrtTimeToMs(rows[k].endTime);
        // Verifica se a janela temporal do Hyperframe intersecta ou está a menos de 5s de um B-roll
        if (
          Math.abs(rowStartMs - brollEndMs) < HF_BROLL_EXCLUSION_MS ||
          Math.abs(brollStartMs - rowEndMs) < HF_BROLL_EXCLUSION_MS
        ) {
          tooCloseToBroll = true;
          break;
        }
      }
    }

    if (tooCloseToBroll) continue;

    const dist = Math.abs(i - target);
    if (dist < bestDist) {
      bestDist = dist;
      bestIdx = i;
    }
  }

  return bestIdx;
};


/**
 * Injects up to 6 'hyperframe' rows into the classified asset array.
 * Only acts on 'avatar' rows — never overrides texto, imagem, or vídeo.
 * Each hyperframe row has its template stored in the prompt field (prefix hf:).
 *
 * Rules (narrative positions):
 *  1. ~52% — chapter_break_no_avatar  (narrative midpoint reset)
 *  2. ~17% — avatar_close_crop        (post-hook camera reframe)
 *  3. ~82% — caption_focus            (pre-CTA emphasis, short text preferred)
 *  4. midpoint of longest avatar block — avatar_side_panel (visual rhythm break)
 *  5. ~33% — floating/list moment (mid-first-half)
 *  6. ~67% — vertical/technical moment (mid-second-half)
 *
 * Phase B: only rows with >= 5s duration are eligible (GSAP animations need time).
 * Phase C: anti-repetition — if preferred template was already assigned, picks next unused from pool.
 */
export const applyHyperframeRules = (
  rows: SrtAssetRow[],
  videoFormat: 'avatar' | 'faceless' | 'vlog' = 'avatar'
): SrtAssetRow[] => {
  const result = rows.map((r) => ({ ...r }));
  const used          = new Set<number>();
  const usedTemplates = new Set<string>(); // Phase C: track assigned template names

  const combinedText = rows.map((r) => r.texto).join(' ');
  const seed = calculateSrtSeed(combinedText);
  const prng = new SeededRandom(seed);

  // Discover and shuffle the template pool using the script seed
  const discovered = getDiscoveredTemplates();
  const templatePool = seededShuffle(discovered, prng);

  const mark = (idx: number, template: string) => {
    if (idx < 0) return;
    result[idx] = {
      ...result[idx],
      asset: 'hyperframe' as SrtAssetType,
      prompt: `hf:${template}`,
    };
    used.add(idx);
  };

  // ── Adaptive HyperFrame budget ────────────────────────────────────────────
  // Scale the number of HyperFrames to the video length so short SRTs don't
  // get 10 overlays crammed into 3 minutes of content.
  const avatarCount = rows.filter((r) => normalizeAssetType(r.asset) === 'avatar').length;
  let maxHF =
    avatarCount <  20 ? 1 :
    avatarCount <  40 ? 2 :
    avatarCount <  70 ? 3 :
    avatarCount < 100 ? 4 :
    avatarCount < 130 ? 6 :
    avatarCount < 160 ? 8 : 10;

  // NEW: Faceless Mode increases visual variety and increases the budget by 50%
  const isFaceless = videoFormat === 'faceless';
  if (isFaceless) {
    maxHF = Math.min(12, Math.ceil(maxHF * 1.5));
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Rule 1 — Narrative midpoint: chapter break at ~52% (always applies when budget ≥ 1)
  mark(findClosestAvatarRow(result, 0.52, used), templatePool[0] || 'hf_break');
  if (maxHF < 2) return result;

  // Rule 2 — Post-hook reframe at ~17% (prefer rows with longer text)
  (() => {
    const total      = result.length;
    const guardStart = Math.floor(total * 0.10);
    const guardEnd   = Math.ceil(total * 0.90);
    const target     = Math.round(0.17 * total);
    let bestIdx      = -1;
    let bestDist     = Infinity;

    for (let i = guardStart; i < guardEnd; i++) {
      if (used.has(i)) continue;
      if (normalizeAssetType(result[i].asset) !== 'avatar') continue;
      // Phase B: skip rows too short for the HyperFrame animation to complete
      const durMs2 = parseSrtTimeToMs(result[i].endTime) - parseSrtTimeToMs(result[i].startTime);
      if (durMs2 < MIN_HF_DURATION_MS) continue;

      // --- REGRA DE SEGURANÇA: Respiro contra B-rolls ---
      const rowStartMs = parseSrtTimeToMs(result[i].startTime);
      const rowEndMs = parseSrtTimeToMs(result[i].endTime);
      let tooCloseToBroll = false;
      for (let k = 0; k < total; k++) {
        const assetType = normalizeAssetType(result[k].asset);
        if (assetType === 'vídeo' || assetType === 'imagem') {
          const brollStartMs = parseSrtTimeToMs(result[k].startTime);
          const brollEndMs = parseSrtTimeToMs(result[k].endTime);
          if (
            Math.abs(rowStartMs - brollEndMs) < HF_BROLL_EXCLUSION_MS ||
            Math.abs(brollStartMs - rowEndMs) < HF_BROLL_EXCLUSION_MS
          ) {
            tooCloseToBroll = true;
            break;
          }
        }
      }
      if (tooCloseToBroll) continue;

      const wordCount = result[i].texto.trim().split(/\s+/).length;
      if (wordCount <= 8) continue; // prefer longer sentences for close_crop
      const dist = Math.abs(i - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    // Fallback: accept any avatar row near target
    if (bestIdx < 0) bestIdx = findClosestAvatarRow(result, 0.17, used);
    mark(bestIdx, templatePool[1] || 'hf_face_top');
  })();

  if (maxHF < 3) return result;

  // Rule 3 — Pre-CTA emphasis at ~82% (prefer short punchy text ≤ 12 words)
  (() => {
    const total      = result.length;
    const guardStart = Math.floor(total * 0.10);
    const guardEnd   = Math.ceil(total * 0.90);
    const target     = Math.round(0.82 * total);
    let bestIdx      = -1;
    let bestDist     = Infinity;

    for (let i = guardStart; i < guardEnd; i++) {
      if (used.has(i)) continue;
      if (normalizeAssetType(result[i].asset) !== 'avatar') continue;
      // Phase B: skip rows too short for the HyperFrame animation to complete
      const durMs3 = parseSrtTimeToMs(result[i].endTime) - parseSrtTimeToMs(result[i].startTime);
      if (durMs3 < MIN_HF_DURATION_MS) continue;

      // --- REGRA DE SEGURANÇA: Respiro contra B-rolls ---
      const rowStartMs = parseSrtTimeToMs(result[i].startTime);
      const rowEndMs = parseSrtTimeToMs(result[i].endTime);
      let tooCloseToBroll = false;
      for (let k = 0; k < total; k++) {
        const assetType = normalizeAssetType(result[k].asset);
        if (assetType === 'vídeo' || assetType === 'imagem') {
          const brollStartMs = parseSrtTimeToMs(result[k].startTime);
          const brollEndMs = parseSrtTimeToMs(result[k].endTime);
          if (
            Math.abs(rowStartMs - brollEndMs) < HF_BROLL_EXCLUSION_MS ||
            Math.abs(brollStartMs - rowEndMs) < HF_BROLL_EXCLUSION_MS
          ) {
            tooCloseToBroll = true;
            break;
          }
        }
      }
      if (tooCloseToBroll) continue;

      const wordCount = result[i].texto.trim().split(/\s+/).length;
      if (wordCount > 12) continue; // prefer short phrases for caption_focus
      const dist = Math.abs(i - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    if (bestIdx < 0) bestIdx = findClosestAvatarRow(result, 0.82, used);
    mark(bestIdx, templatePool[2] || 'hf_focus');
  })();

  if (maxHF < 4) return result;

  // Rule 4 — Break the longest consecutive avatar block at its midpoint
  (() => {
    const total      = result.length;
    const guardStart = Math.floor(total * 0.10);
    const guardEnd   = Math.ceil(total * 0.90);

    let longestStart = -1;
    let longestLen   = 0;
    let curStart     = -1;
    let curLen       = 0;

    for (let i = guardStart; i < guardEnd; i++) {
      if (normalizeAssetType(result[i].asset) === 'avatar' && !used.has(i)) {
        if (curStart < 0) curStart = i;
        curLen++;
        if (curLen > longestLen) { longestLen = curLen; longestStart = curStart; }
      } else {
        curStart = -1;
        curLen   = 0;
      }
    }

    if (longestStart >= 0 && longestLen >= 4) {
      const midIdx = longestStart + Math.floor(longestLen / 2);
      if (!used.has(midIdx)) mark(midIdx, templatePool[3] || 'hf_double');
    }
  })();

  if (maxHF < 5) return result;

  // Rule 5 — ~33% first-half inflection: floating/list moment
  mark(findClosestAvatarRow(result, 0.33, used), templatePool[4] || 'hf_floating');

  if (maxHF < 6) return result;

  // Rule 6 — ~67% second-half analysis: vertical/technical moment
  mark(findClosestAvatarRow(result, 0.67, used), templatePool[5] || 'hf_vertical');

  if (maxHF < 7) return result;

  // Rule 7 — ~25% transition: dynamic holographic pool entry
  mark(findClosestAvatarRow(result, 0.25, used), templatePool[6] || 'hf_holo');

  if (maxHF < 8) return result;

  // Rule 8 — ~75% transition: documentary pool entry
  mark(findClosestAvatarRow(result, 0.75, used), templatePool[7] || 'hf_documentary');

  if (maxHF < 9) return result;

  // Rule 9 — ~42% transition: viewfinder dynamic crop
  mark(findClosestAvatarRow(result, 0.42, used), HF_TEMPLATES.dynamicCrop);

  if (maxHF < 10) return result;

  // Rule 10 — ~90% transition: pre-CTA portrait crop
  mark(findClosestAvatarRow(result, 0.90, used), HF_TEMPLATES.faceBottom);

  return result;
};

/**
 * Enforces mutual exclusion between HyperFrames and text overlays.
 * Any 'texto' row within EXCLUSION_RADIUS_MS of a 'hyperframe' row is reverted
 * to 'avatar' — the animated HyperFrame already provides visual richness at
 * that moment and a simultaneous text overlay would compete for attention.
 */
const HF_EXCLUSION_RADIUS_MS = 30_000; // 30 seconds

export const applyHyperframeExclusionZone = (
  rows: SrtAssetRow[],
  radiusMs = HF_EXCLUSION_RADIUS_MS,
): SrtAssetRow[] => {
  // Collect all HyperFrame timestamps in milliseconds
  const hfTimestamps: number[] = rows
    .filter((r) => normalizeAssetType(r.asset) === 'hyperframe')
    .map((r) => parseSrtTimeToMs(r.startTime));

  if (hfTimestamps.length === 0) return rows;

  return rows.map((row) => {
    if (normalizeAssetType(row.asset) !== 'texto') return row;

    const rowMs = parseSrtTimeToMs(row.startTime);
    const tooCloseToHf = hfTimestamps.some(
      (hfMs) => Math.abs(rowMs - hfMs) < radiusMs,
    );

    if (tooCloseToHf) {
      return { ...row, asset: 'avatar' as SrtAssetType };
    }
    return row;
  });
};

export const buildPipelineResult = (
  rows: SrtAssetRow[],
  textRender: SrtTextRenderInfo | null = null,
): SrtAssetPipelineResult => {
  const normalizedRows = rows.map((row) => ({
    ...row,
    asset: normalizeAssetType(row.asset),
  }));
  const { videoPromptsTxt, imagePromptsTxt } = buildPromptTxtOutputs(normalizedRows);

  return {
    rows: normalizedRows,
    csvContent: serializeRowsToCsv(normalizedRows),
    videoPromptsTxt,
    imagePromptsTxt,
    stats: buildAssetStats(normalizedRows),
    textRender,
  };
};

export const sanitizeDownloadFileStem = (value: string) =>
  (value || 'assets-srt')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s/g, '_')
    .slice(0, 80) || 'assets-srt';
