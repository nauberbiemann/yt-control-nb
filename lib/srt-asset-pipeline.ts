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

export const normalizeLineBreaks = (value: string) => value.replace(/\r\n/g, '\n');

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

export const applyAssetRules = (rows: SrtAssetRow[], videoFormat: 'avatar' | 'faceless' = 'avatar') => {
  if (!rows.length) return rows;

  let lastBrollMarkerMs = 0;
  const totalRows = rows.length;

  return rows.map((row, index) => {
    const text = row.texto.trim();
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);

    // Short text always becomes a cinematic text overlay
    if (text.length <= TEXT_MAX_CHARS) {
      return { ...row, asset: 'texto' as const };
    }

    const intervalMs = videoFormat === 'faceless'
      ? FACELESS_INTERVAL_MS
      : getIntervalMs(index, totalRows);

    if (endMs - lastBrollMarkerMs >= intervalMs) {
      lastBrollMarkerMs = Math.max(lastBrollMarkerMs + intervalMs, startMs);
      return { ...row, asset: getBrollAsset(startMs, endMs) };
    }

    // Avatar mode: fill gap with avatar presenter
    // Faceless mode: leave blank — editor stretches the previous media until next marker
    return { ...row, asset: (videoFormat === 'faceless' ? '' : 'avatar') as SrtAssetType };
  });
};

export const sanitizePrompt = (prompt: string) => prompt.replace(/\s+/g, ' ').trim();

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
  cooldownMs = 20_000,
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
} as const;

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
export const applyHyperframeRules = (rows: SrtAssetRow[]): SrtAssetRow[] => {
  const result = rows.map((r) => ({ ...r }));
  const used          = new Set<number>();
  const usedTemplates = new Set<string>(); // Phase C: track assigned template names

  // Phase C (editor-hyperframes): if preferred template was already used, pick the
  // next unused one from the full pool — prevents visual repetition across HF slots.
  const templatePool = Object.values(HF_TEMPLATES);
  const resolveTemplate = (preferred: string): string => {
    if (!usedTemplates.has(preferred)) return preferred;
    const fallback = templatePool.find((t) => !usedTemplates.has(t));
    return fallback ?? preferred; // graceful degradation: repeat only when pool is exhausted
  };

  const mark = (idx: number, template: string) => {
    if (idx < 0) return;
    const resolved = resolveTemplate(template); // Phase C: anti-repetition
    result[idx] = {
      ...result[idx],
      asset: 'hyperframe' as SrtAssetType,
      prompt: `hf:${resolved}`,
    };
    used.add(idx);
    usedTemplates.add(resolved); // Phase C: register as used
  };

  // ── Adaptive HyperFrame budget ────────────────────────────────────────────
  // Scale the number of HyperFrames to the video length so short SRTs don't
  // get 6 overlays crammed into 3 minutes of content.
  const avatarCount = rows.filter((r) => normalizeAssetType(r.asset) === 'avatar').length;
  const maxHF =
    avatarCount <  20 ? 1 :
    avatarCount <  40 ? 2 :
    avatarCount <  70 ? 3 :
    avatarCount < 110 ? 4 :
    avatarCount < 150 ? 5 : 6;
  // ─────────────────────────────────────────────────────────────────────────

  // Rule 1 — Narrative midpoint: chapter break at ~52% (always applies when budget ≥ 1)
  mark(findClosestAvatarRow(result, 0.52, used), HF_TEMPLATES.chapterBreak);
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
      const wordCount = result[i].texto.trim().split(/\s+/).length;
      if (wordCount <= 8) continue; // prefer longer sentences for close_crop
      const dist = Math.abs(i - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    // Fallback: accept any avatar row near target
    if (bestIdx < 0) bestIdx = findClosestAvatarRow(result, 0.17, used);
    mark(bestIdx, HF_TEMPLATES.closeCrop);
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
      const wordCount = result[i].texto.trim().split(/\s+/).length;
      if (wordCount > 12) continue; // prefer short phrases for caption_focus
      const dist = Math.abs(i - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    if (bestIdx < 0) bestIdx = findClosestAvatarRow(result, 0.82, used);
    mark(bestIdx, HF_TEMPLATES.captionFocus);
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
      if (!used.has(midIdx)) mark(midIdx, HF_TEMPLATES.sidePanel);
    }
  })();

  if (maxHF < 5) return result;

  // Rule 5 — ~33% first-half inflection: floating/list moment
  mark(findClosestAvatarRow(result, 0.33, used), HF_TEMPLATES.midEarly);

  if (maxHF < 6) return result;

  // Rule 6 — ~67% second-half analysis: vertical/technical moment
  mark(findClosestAvatarRow(result, 0.67, used), HF_TEMPLATES.midLate);

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
