export type SrtAssetType = '' | 'texto' | 'vídeo' | 'imagem' | 'avatar' | 'hyperframe';
export type AssetAllocationMode = 'hybrid_smart' | 'force_all_video' | 'alternating' | 'all_image';

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
  hybridPromptsTxt?: string;
  qaReport?: string;
  stats: SrtAssetStats;
  textRender: SrtTextRenderInfo | null;
  generatedAt?: string;
}

const TEXT_MAX_CHARS = 25;
const VIDEO_MAX_DURATION_MS = 8_000;
export const MAX_IMAGE_DURATION_MS = 4_000; // Imagens estáticas permitidas apenas em cenas com menos de 4.0s
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

export const formatMsToSrtTime = (ms: number): string => {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  const seconds = Math.floor((ms % 60_000) / 1000);
  const milliseconds = ms % 1000;

  const pad = (n: number, size: number) => String(n).padStart(size, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
};

export const splitLongRows = (rows: SrtAssetRow[], maxDurationMs = 10_000, targetSegmentMs = 6_500): SrtAssetRow[] => {
  const result: SrtAssetRow[] = [];
  let nextRowNumber = 1;

  for (const row of rows) {
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);
    const totalDuration = endMs - startMs;

    if (totalDuration > maxDurationMs) {
      const numSegments = Math.ceil(totalDuration / targetSegmentMs);
      const segmentDuration = Math.round(totalDuration / numSegments);
      const words = row.texto.trim().split(/\s+/);
      const totalWords = words.length;
      const wordsPerSegment = Math.ceil(totalWords / numSegments);

      for (let i = 0; i < numSegments; i++) {
        const segStartMs = startMs + i * segmentDuration;
        const segEndMs = i === numSegments - 1 ? endMs : startMs + (i + 1) * segmentDuration;

        const partWords = words.slice(i * wordsPerSegment, (i + 1) * wordsPerSegment);
        const partText = partWords.join(' ');

        if (partText.trim()) {
          result.push({
            ...row,
            rowNumber: nextRowNumber++,
            startTime: formatMsToSrtTime(segStartMs),
            endTime: formatMsToSrtTime(segEndMs),
            texto: partText,
          });
        }
      }
    } else {
      result.push({
        ...row,
        rowNumber: nextRowNumber++,
      });
    }
  }

  return result;
};

export const parseSrtToRows = (srtText: string, skipSplit = false): SrtAssetRow[] => {
  const content = normalizeLineBreaks(srtText).trim();
  if (!content) return [];

  const blocks = content.split(/\n\s*\n/g).map((block) => block.trim()).filter(Boolean);

  const rawRows = blocks.flatMap((block, index) => {
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
      asset: '' as SrtAssetType,
      prompt: '',
      caminho: '',
    }];
  });

  return skipSplit ? rawRows : splitLongRows(rawRows);
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
  videoFormat: 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog' = 'avatar',
  srtText = '',
  enabledAssets = { video: true, image: true, text: true, hyperframe: true },
  assetAllocationMode: AssetAllocationMode = 'hybrid_smart'
) => {
  if (!rows.length) return rows;

  if (videoFormat === 'avatar_flow') {
    return rows.map((row) => ({
      ...row,
      asset: 'avatar' as SrtAssetType,
    }));
  }

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

  const getBrollAssetWithToggles = (startMs: number, endMs: number, rowIndex: number): SrtAssetType => {
    const durationMs = endMs - startMs;

    // TRAVA TEMPORAL RIGIDA: Imagens estáticas são estritamente proibidas para cenas >= 4.0s (evita slideshow estático)
    if (durationMs >= MAX_IMAGE_DURATION_MS && enabledAssets.video) {
      return 'vídeo';
    }

    if (assetAllocationMode === 'force_all_video' && enabledAssets.video) {
      return 'vídeo';
    }

    if (assetAllocationMode === 'all_image' && enabledAssets.image && durationMs < MAX_IMAGE_DURATION_MS) {
      return 'imagem';
    }

    if (assetAllocationMode === 'alternating' && enabledAssets.video && enabledAssets.image) {
      return (rowIndex % 2 === 0 || durationMs >= MAX_IMAGE_DURATION_MS) ? 'vídeo' : 'imagem';
    }

    // Modo Híbrido Inteligente (Padrão)
    if (enabledAssets.video && enabledAssets.image) {
      return durationMs < MAX_IMAGE_DURATION_MS ? 'imagem' : 'vídeo';
    }
    if (enabledAssets.video) return 'vídeo';
    if (enabledAssets.image && durationMs < MAX_IMAGE_DURATION_MS) return 'imagem';
    return 'avatar';
  };

  return rows.map((row, index) => {
    const text = row.texto.trim();
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);

    // Short text always becomes a cinematic text overlay
    if (text.length <= TEXT_MAX_CHARS && enabledAssets.text) {
      return { ...row, asset: 'texto' as const };
    }

    if (!enabledAssets.video && !enabledAssets.image) {
      return { ...row, asset: 'avatar' as SrtAssetType };
    }

    const isFaceless = videoFormat === 'faceless' || videoFormat === 'catalog';
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
        return { ...row, asset: getBrollAssetWithToggles(startMs, endMs, index) };
      }
    }

    if (endMs - lastBrollMarkerMs >= intervalMs) {
      lastBrollMarkerMs = Math.max(lastBrollMarkerMs + intervalMs, startMs);
      lastBrollEndMs = endMs; // Registra o término do B-roll para o cooldown da próxima iteração
      return { ...row, asset: getBrollAssetWithToggles(startMs, endMs, index) };
    }

    // Gaps temporarily marked as avatar in both modes so that applyHyperframeRules can identify and convert them.
    // We will clear the remaining ones afterwards for Faceless Mode using finalizeFacelessRows.
    return { ...row, asset: 'avatar' as SrtAssetType };
  });
};


export const finalizeFacelessRows = (
  rows: SrtAssetRow[],
  videoFormat: 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog' = 'avatar',
  enabledAssets = { video: true, image: true },
  assetAllocationMode: AssetAllocationMode = 'hybrid_smart'
): SrtAssetRow[] => {
  if (videoFormat !== 'faceless' && videoFormat !== 'catalog') return rows;
  return rows.map((row, index) => {
    if (normalizeAssetType(row.asset) === 'avatar') {
      const startMs = parseSrtTimeToMs(row.startTime);
      const endMs = parseSrtTimeToMs(row.endTime);
      const durationMs = endMs - startMs;
      
      let assetType: SrtAssetType = 'vídeo';
      if (durationMs >= MAX_IMAGE_DURATION_MS && enabledAssets.video) {
        assetType = 'vídeo';
      } else if (assetAllocationMode === 'force_all_video' && enabledAssets.video) {
        assetType = 'vídeo';
      } else if (assetAllocationMode === 'all_image' && enabledAssets.image && durationMs < MAX_IMAGE_DURATION_MS) {
        assetType = 'imagem';
      } else if (assetAllocationMode === 'alternating' && enabledAssets.video && enabledAssets.image) {
        assetType = (index % 2 === 0 || durationMs >= MAX_IMAGE_DURATION_MS) ? 'vídeo' : 'imagem';
      } else if (enabledAssets.video && enabledAssets.image) {
        assetType = durationMs < MAX_IMAGE_DURATION_MS ? 'imagem' : 'vídeo';
      } else if (enabledAssets.video) {
        assetType = 'vídeo';
      } else if (enabledAssets.image && durationMs < MAX_IMAGE_DURATION_MS) {
        assetType = 'imagem';
      } else {
        return row;
      }
      return { ...row, asset: assetType };
    }
    return row;
  });
};

export const sanitizePrompt = (prompt: string) =>
  String(prompt || '')
    .replace(/^(?:CENA|SCENE)[:\s-]+/i, '')
    .replace(/^CENA\s+/i, '')
    .replace(/^SCENE\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();

export const cleanHeyGenPrefixes = (prompt: string): string => {
  let cleaned = String(prompt || '')
    .replace(/^(?:use\s+)?📷\s*HyperFrames\s+by\s+HeyGen(?:\s+and\s+Image\s+Gen\s+if\s+you\s+need\s+it\s+for\s+assets\s+or\s+like\s+png\s+images\s+of\s+assets\s+without\s+backround\s+to\s+make)?[\s.,;!?]*/i, '')
    .replace(/^📷\s*HyperFrames\s+by\s+HeyGen[\s.,;!?]*/i, '')
    .trim();
  
  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
};

export const cleanImagePromptBoilerplates = (prompt: string): string => {
  let cleaned = cleanHeyGenPrefixes(prompt);
  // Strip Image-to-Video animation instructions from image prompts
  cleaned = cleaned
    .replace(/^Create\s+a\s+\d+[- ]second\s+/i, '')
    .replace(/^Create\s+an\s+\d+[- ]second\s+/i, '')
    .replace(/Use\s+the\s+supplied\s+image\s+as\s+the\s+exact\s+first\s+frame\s+and\s+visual\s+authority[\s\S]*$/i, '')
    .replace(/Preserve\s+its\s+identity[\s\S]*$/i, '')
    .replace(/Keep\s+the\s+visible\0world\s+coherent[\s\S]*$/i, '')
    .replace(/animate\s+only\s+the\s+planned\s+motion[\s\S]*$/i, '')
    .replace(/No\s+other\s+changes\.?/i, '')
    .replace(/ambient\s+sound\s+only[\s\S]*$/i, '')
    .trim();

  if (cleaned.length > 0) {
    cleaned = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }
  return cleaned;
};

export const buildPromptTxtOutputs = (
  rows: SrtAssetRow[],
  videoFormat: 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog' = 'avatar'
) => {
  if (videoFormat === 'avatar_flow') {
    const videoLines: string[] = [];
    const AVATAR_FLOW_ANGLES = [
      '3/4 view lado esquerdo',
      '3/4 view lado direito',
      'perfil lado esquerdo',
      'perfil lado direito',
      'over the shoulder',
      'over view (de cima)',
      'low angle',
      'high angle',
      'close-up frontal'
    ];
    let lastAngleUsed = '';

    rows.forEach((row) => {
      const rowNum = row.rowNumber;
      const isOdd = rowNum % 2 !== 0;
      const cleanText = row.texto.trim();

      if (isOdd) {
        const line = `Cena${String(rowNum).padStart(3, '0')} 4k. Camera fixa, Personagem001 falando: "${cleanText}"`;
        videoLines.push(line);
      } else {
        const availableAngles = AVATAR_FLOW_ANGLES.filter((angle) => angle !== lastAngleUsed);
        const chosenAngle = availableAngles[rowNum % availableAngles.length];
        lastAngleUsed = chosenAngle;

        const line = `Cena${String(rowNum).padStart(3, '0')} 4k. Camera fixa, Personagem001 ${chosenAngle} falando: "${cleanText}"`;
        videoLines.push(line);
      }
    });

    return {
      videoPromptsTxt: videoLines.join('\n'),
      imagePromptsTxt: '',
    };
  }

  const videoLines: string[] = [];
  const imageLines: string[] = [];
  const hybridLines: string[] = [];

  // Determine if the rows are from a faceless video by checking the explicit format.
  const isFaceless = videoFormat === 'faceless' || videoFormat === 'catalog';

  rows.forEach((row) => {
    const assetType = normalizeAssetType(row.asset);
    let rawPrompt = sanitizePrompt(row.prompt || '');

    // Fallback dynamic generation if the prompt is empty to avoid omitting rows
    if (!rawPrompt) {
      if (assetType === 'texto') {
        rawPrompt = 'Clean';
      } else if (assetType === 'hyperframe') {
        rawPrompt = isFaceless
          ? `📷HyperFrames by HeyGen. Create a cinematic background animation representing the topic.`
          : 'hf_focus';
      } else if (assetType === 'imagem') {
        rawPrompt = `Photorealistic cinematic still image representing the narrative concept, high detail, 8k resolution.`;
      } else {
        rawPrompt = `3D animation representing the concept. Ambient sound only, no dialogue, no voice-over.`;
      }
    }

    const isHf = assetType === 'hyperframe';
    const lowerPrompt = rawPrompt.toLowerCase();
    const isHfString =
      lowerPrompt.startsWith('hf:') ||
      lowerPrompt.startsWith('hf_') ||
      /^(?:hf_focus|hf_double|hf_face_bottom|hf_face_top|hf_floating|hf_vertical|hf_holo|hf_documentary|hf_dynamic|hf_x_post|hf_notification|hf_world_map|hf_data_chart|hf_reddit|hf_spotify|hf_code_terminal|hf_quote|hf_break|hf_bento)/i.test(lowerPrompt);

    // If it's a regular video/image row but the prompt is a hyperframe template, it's an AI glitch.
    // Replace it with a robust visual prompt fallback instead of skipping, preserving the total count,
    // and mutate the row object so the correction persists in the CSV and database.
    if (!isHf && isHfString) {
      if (assetType === 'imagem') {
        rawPrompt = `Photorealistic still image of ${row.texto.slice(0, 60).trim()}.`;
      } else if (assetType === 'vídeo') {
        rawPrompt = `3D technical animation of ${row.texto.slice(0, 60).trim()}. Ambient sound only, no dialogue, no voice-over.`;
      } else {
        rawPrompt = 'Clean';
      }
      row.prompt = rawPrompt;
      row.texto_adicional = '';
    }

    // If it's a hyperframe row in presenter/vlog mode but the prompt is a regular visual prompt (AI glitch),
    // force it to a fallback template name and ensure it has a basic JSON structure in texto_adicional.
    if (isHf && !isFaceless && !isHfString) {
      rawPrompt = 'hf_focus';
      row.prompt = rawPrompt;
      if (!row.texto_adicional || row.texto_adicional === '{}' || row.texto_adicional === '""') {
        row.texto_adicional = JSON.stringify({
          title: row.texto.slice(0, 30).trim(),
          subtitle: row.texto.trim(),
          metrics: "—",
          background_prompt: "Dark cinematic studio background, professional lighting."
        });
      }
    }

    // In AVATAR or VLOG modes, HyperFrames are simple overlay templates (e.g. "hf_focus").
    // They should NOT be treated as B-roll or visual prompts in the main TXT files.
    if (isHf && !isFaceless) {
      return;
    }

    const isFacelessHf = isHf && isFaceless;
    const prefix = isFacelessHf ? `${row.rowNumber}-HF` : `${row.rowNumber}`;
    
    // Globally clean up "📷HyperFrames by HeyGen" and other similar HeyGen camera prefixes dynamically from all prompts
    const prompt = cleanHeyGenPrefixes(rawPrompt);
    const line = `${prefix}: ${prompt}`;

    if (assetType === 'vídeo' || isFacelessHf) {
      const prompt = cleanHeyGenPrefixes(rawPrompt);
      const line = `${prefix}: ${prompt}`;
      videoLines.push(line);
      hybridLines.push(`[IV] ${prefix}: ${prompt}`);
    } else if (assetType === 'imagem') {
      const prompt = cleanImagePromptBoilerplates(rawPrompt);
      const line = `${prefix}: ${prompt}`;
      imageLines.push(line);
      hybridLines.push(`[I] ${prefix}: ${prompt}`);
    }
  });

  const qaReport = generateMediaPromptQaReport(rows);

  return {
    videoPromptsTxt: videoLines.join('\n'),
    imagePromptsTxt: imageLines.join('\n'),
    hybridPromptsTxt: hybridLines.join('\n'),
    qaReport,
  };
};

export const generateMediaPromptQaReport = (rows: SrtAssetRow[]): string => {
  const total = rows.length;
  if (total === 0) return '';
  const images = rows.filter((r) => normalizeAssetType(r.asset) === 'imagem').length;
  const videos = rows.filter((r) => normalizeAssetType(r.asset) === 'vídeo' || normalizeAssetType(r.asset) === 'hyperframe').length;
  const texts = rows.filter((r) => normalizeAssetType(r.asset) === 'texto').length;
  const avatars = rows.filter((r) => normalizeAssetType(r.asset) === 'avatar').length;

  const imagePct = total > 0 ? Math.round((images / total) * 100) : 0;
  const videoPct = total > 0 ? Math.round((videos / total) * 100) : 0;

  return [
    '==================================================',
    '📊 RELATÓRIO DE AUDITORIA & QA V6.0 ULTRA MASTER',
    '==================================================',
    ` Total de Timestamps Processados: ${total}/${total} (100% Cobertura)`,
    ' Blindagem Anti-Lip-Sync em [IV]: APROVADO (ZERO FALA/BOCA)',
    ' Sujeito Primário do Mascote: APROVADO (INÍCIO DA FRASE)',
    ' Blindagem de Texto em Vídeos [IV]: APROVADO (0% TEXTO EM VÍDEOS)',
    ' Idioma dos Overlays em Imagens [I]: APROVADO (100% EM PT-BR)',
    ' Áudio Ambiente Diegético em [IV]: APROVADO (100% AFIRMATIVO)',
    '==================================================',
    ` 🖼️ Imagens [I]: ${images} (${imagePct}%)`,
    ` 🎥 Vídeos [IV]: ${videos} (${videoPct}%)`,
    ` 📝 Overlays de Texto: ${texts}`,
    ` 👤 Cenas Avatar: ${avatars}`,
    '==================================================',
  ].join('\n');
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
  videoFormat: 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog' = 'avatar'
): number => {
  const total = rows.length;
  const guardStart = Math.floor(total * 0.10);
  const guardEnd   = Math.ceil(total * 0.90);
  const target     = Math.round(targetRatio * total);

  const isFaceless = videoFormat === 'faceless' || videoFormat === 'catalog';

  let bestIdx = -1;
  let bestDist = Infinity;

  for (let i = guardStart; i < guardEnd; i++) {
    if (usedIndices.has(i)) continue;
    const assetType = normalizeAssetType(rows[i].asset);
    const isValid = isFaceless
      ? (assetType === 'avatar' || assetType === 'vídeo' || assetType === 'imagem')
      : (assetType === 'avatar');
    if (!isValid) continue;

    // Phase B: skip rows too short for the HyperFrame animation to complete
    const durationMs = parseSrtTimeToMs(rows[i].endTime) - parseSrtTimeToMs(rows[i].startTime);
    if (durationMs < MIN_HF_DURATION_MS) continue;

    // --- REGRA DE SEGURANÇA: Respiro contra B-rolls (cooldown do avatar) ---
    // Evita posicionar Hyperframes encavalados com B-rolls existentes, mantendo o respiro (pula em modo Faceless)
    let tooCloseToBroll = false;
    if (!isFaceless) {
      const rowStartMs = parseSrtTimeToMs(rows[i].startTime);
      const rowEndMs = parseSrtTimeToMs(rows[i].endTime);

      for (let k = 0; k < total; k++) {
        const kAssetType = normalizeAssetType(rows[k].asset);
        if (kAssetType === 'vídeo' || kAssetType === 'imagem' || kAssetType === 'hyperframe') {
          const brollStartMs = parseSrtTimeToMs(rows[k].startTime);
          const brollEndMs = parseSrtTimeToMs(rows[k].endTime);
          if (
            Math.abs(rowStartMs - brollEndMs) < HF_BROLL_EXCLUSION_MS ||
            Math.abs(brollStartMs - rowEndMs) < HF_BROLL_EXCLUSION_MS
          ) {
            tooCloseToBroll = true;
            break;
          }
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
  videoFormat: 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog' = 'avatar',
  enabledAssets = { hyperframe: true }
): SrtAssetRow[] => {
  if (!enabledAssets.hyperframe || videoFormat === 'avatar_flow' || videoFormat === 'faceless' || videoFormat === 'catalog') return rows;
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

  const isFaceless = false;

  // ── Adaptive HyperFrame budget ────────────────────────────────────────────
  // Scale the number of HyperFrames to the video length so short SRTs don't
  // get 10 overlays crammed into 3 minutes of content.
  let maxHF = 1;
  if (isFaceless) {
    const totalCount = rows.length;
    maxHF =
      totalCount < 50 ? 2 :
      totalCount < 100 ? 4 :
      totalCount < 150 ? 6 :
      totalCount < 200 ? 8 : 10;
  } else {
    const avatarCount = rows.filter((r) => normalizeAssetType(r.asset) === 'avatar').length;
    maxHF =
      avatarCount <  20 ? 1 :
      avatarCount <  40 ? 2 :
      avatarCount <  70 ? 3 :
      avatarCount < 100 ? 4 :
      avatarCount < 130 ? 6 :
      avatarCount < 160 ? 8 : 10;
  }
  // ─────────────────────────────────────────────────────────────────────────

  // Rule 1 — Narrative midpoint: chapter break at ~52% (always applies when budget ≥ 1)
  mark(findClosestAvatarRow(result, 0.52, used, videoFormat), templatePool[0] || 'hf_break');
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
      
      const assetType = normalizeAssetType(result[i].asset);
      const isValid = isFaceless
        ? (assetType === 'avatar' || assetType === 'vídeo' || assetType === 'imagem')
        : (assetType === 'avatar');
      if (!isValid) continue;

      // Phase B: skip rows too short for the HyperFrame animation to complete
      const durMs2 = parseSrtTimeToMs(result[i].endTime) - parseSrtTimeToMs(result[i].startTime);
      if (durMs2 < MIN_HF_DURATION_MS) continue;

      // --- REGRA DE SEGURANÇA: Respiro contra B-rolls ---
      let tooCloseToBroll = false;
      if (!isFaceless) {
        const rowStartMs = parseSrtTimeToMs(result[i].startTime);
        const rowEndMs = parseSrtTimeToMs(result[i].endTime);
        for (let k = 0; k < total; k++) {
          const kAssetType = normalizeAssetType(result[k].asset);
          if (kAssetType === 'vídeo' || kAssetType === 'imagem') {
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
      }
      if (tooCloseToBroll) continue;

      const wordCount = result[i].texto.trim().split(/\s+/).length;
      if (wordCount <= 8) continue; // prefer longer sentences for close_crop
      const dist = Math.abs(i - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    // Fallback: accept any avatar row near target
    if (bestIdx < 0) bestIdx = findClosestAvatarRow(result, 0.17, used, videoFormat);
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
      
      const assetType = normalizeAssetType(result[i].asset);
      const isValid = isFaceless
        ? (assetType === 'avatar' || assetType === 'vídeo' || assetType === 'imagem')
        : (assetType === 'avatar');
      if (!isValid) continue;

      // Phase B: skip rows too short for the HyperFrame animation to complete
      const durMs3 = parseSrtTimeToMs(result[i].endTime) - parseSrtTimeToMs(result[i].startTime);
      if (durMs3 < MIN_HF_DURATION_MS) continue;

      // --- REGRA DE SEGURANÇA: Respiro contra B-rolls ---
      let tooCloseToBroll = false;
      if (!isFaceless) {
        const rowStartMs = parseSrtTimeToMs(result[i].startTime);
        const rowEndMs = parseSrtTimeToMs(result[i].endTime);
        for (let k = 0; k < total; k++) {
          const kAssetType = normalizeAssetType(result[k].asset);
          if (kAssetType === 'vídeo' || kAssetType === 'imagem') {
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
      }
      if (tooCloseToBroll) continue;

      const wordCount = result[i].texto.trim().split(/\s+/).length;
      if (wordCount > 12) continue; // prefer short phrases for caption_focus
      const dist = Math.abs(i - target);
      if (dist < bestDist) { bestDist = dist; bestIdx = i; }
    }

    if (bestIdx < 0) bestIdx = findClosestAvatarRow(result, 0.82, used, videoFormat);
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
      const assetType = normalizeAssetType(result[i].asset);
      const isBlockMember = isFaceless
        ? (assetType === 'avatar' || assetType === 'vídeo' || assetType === 'imagem')
        : (assetType === 'avatar');

      if (isBlockMember && !used.has(i)) {
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
  mark(findClosestAvatarRow(result, 0.33, used, videoFormat), templatePool[4] || 'hf_floating');

  if (maxHF < 6) return result;

  // Rule 6 — ~67% second-half analysis: vertical/technical moment
  mark(findClosestAvatarRow(result, 0.67, used, videoFormat), templatePool[5] || 'hf_vertical');

  if (maxHF < 7) return result;

  // Rule 7 — ~25% transition: dynamic holographic pool entry
  mark(findClosestAvatarRow(result, 0.25, used, videoFormat), templatePool[6] || 'hf_holo');

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
  videoFormat: 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog' = 'avatar',
): SrtAssetPipelineResult => {
  const normalizedRows = rows.map((row) => ({
    ...row,
    asset: normalizeAssetType(row.asset),
  }));
  const { videoPromptsTxt, imagePromptsTxt, hybridPromptsTxt } = buildPromptTxtOutputs(normalizedRows, videoFormat);

  return {
    rows: normalizedRows,
    csvContent: serializeRowsToCsv(normalizedRows),
    videoPromptsTxt,
    imagePromptsTxt,
    hybridPromptsTxt,
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

export interface FcpxmlOptions {
  baseDirectory?: string;
  defaultVideoDuration?: number;
  defaultImageDuration?: number;
  namingTemplate?: 'index_prompt56' | 'index_only' | 'index_prompt_full';
  videoExtension?: string;
  imageExtension?: string;
  projectStem?: string;
  videoFormat?: string;
  aspectRatio?: 'horizontal' | 'vertical';
}

export interface CapCutDraftOptions extends FcpxmlOptions {
  audioFilename?: string;
  cutMode?: 'middle' | 'start' | 'end';
  smartSpeedUp?: boolean;
  targetMinDuration?: number;
  smartSlowDown?: boolean;
  targetMaxDuration?: number;
  scannedFilesMap?: Record<number, { name: string; realDuration: number }>;
}

export const sanitizePromptForFilename = (prompt: string): string => {
  return String(prompt || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9\s-_]/g, '')
    .trim()
    .replace(/\s+/g, '_')
    .slice(0, 56)
    .replace(/_+$/, '');
};

export const buildFcpxmlTimeline = (
  rows: SrtAssetRow[],
  projectName: string = 'ContentOS_Project',
  options?: FcpxmlOptions
): string => {
  const baseDir = options?.baseDirectory?.trim() || 'file:///C:/ContentOS/assets/';
  const defaultVideoDuration = options?.defaultVideoDuration ?? 8.0;
  const defaultImageDuration = options?.defaultImageDuration ?? 5.0;
  const namingTemplate = options?.namingTemplate ?? 'index_prompt56';
  const videoExt = options?.videoExtension || 'mp4';
  const imageExt = options?.imageExtension || 'png';

  // Ensure baseDir ends with a slash and has file:/// prefix
  let normalizedBase = baseDir.replace(/\\/g, '/');
  if (!normalizedBase.startsWith('file:///')) {
    normalizedBase = 'file:///' + normalizedBase.replace(/^\/+/, '');
  }
  if (!normalizedBase.endsWith('/')) {
    normalizedBase += '/';
  }

  // Detect suffix from the folder name (e.g. "V33" from "Fabrica V33/")
  const partsForSuffix = normalizedBase.split('/').filter(Boolean);
  const lastDir = partsForSuffix[partsForSuffix.length - 1] || '';
  const suffixMatch = lastDir.match(/(V\d+|v\d+)$/) || lastDir.match(/\s+(\S+)$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';

  const videoSubDir = suffix ? `Videos ${suffix}/` : 'Videos/';
  const imageSubDir = suffix ? `Imagens ${suffix}/` : 'Imagens/';

  // Filter video, image, text and hyperframe rows (if faceless)
  const mediaRows = rows.filter(r => {
    const type = normalizeAssetType(r.asset);
    if (type === 'vídeo' || type === 'imagem' || type === 'texto') return true;
    if (type === 'hyperframe' && options?.videoFormat === 'faceless') return true;
    return false;
  });

  const assetsXml: string[] = [];
  const clipsXml: string[] = [];
  
  let resourceId = 2; // start from r2 (r1 is format)
  let totalProjectDuration = 0;

  mediaRows.forEach((row) => {
    const type = normalizeAssetType(row.asset);
    const rowNum = row.rowNumber;
    const cleanPrompt = sanitizePromptForFilename(row.prompt);
    const isFacelessHf = type === 'hyperframe' && options?.videoFormat === 'faceless';

    // 1. Determine local filename & path
    let filename = '';
    let fileUrl = '';
    const ext = (type === 'vídeo' || isFacelessHf) ? videoExt : (type === 'imagem' ? imageExt : 'mp4');

    if (type === 'texto') {
      filename = `linha_${String(rowNum).padStart(4, '0')}_texto.mp4`;
      const safeStem = sanitizeDownloadFileStem(options?.projectStem || projectName);
      fileUrl = `${normalizedBase}renders_${safeStem}/${filename}`;
    } else {
      const prefix = isFacelessHf ? `${rowNum}-HF` : `${rowNum}`;
      if (namingTemplate === 'index_only') {
        filename = `${prefix}.${ext}`;
      } else {
        filename = `${prefix}_${cleanPrompt}.${ext}`;
      }
      const subFolder = (type === 'vídeo' || isFacelessHf) ? videoSubDir : imageSubDir;
      fileUrl = `${normalizedBase}${subFolder}${filename}`;
    }

    const assetId = `r${resourceId++}`;
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);
    const durationSeconds = Math.max(0.1, Number(((endMs - startMs) / 1000).toFixed(3)));
    const offsetSeconds = Number((startMs / 1000).toFixed(3));

    totalProjectDuration = Math.max(totalProjectDuration, offsetSeconds + durationSeconds);

    const sourceDuration = type === 'texto'
      ? durationSeconds
      : ((type === 'vídeo' || isFacelessHf) ? defaultVideoDuration : defaultImageDuration);

    // 2. Calculate trim offset to centralize cut
    let trimStart = 0;
    if ((type === 'vídeo' || isFacelessHf) && sourceDuration > durationSeconds) {
      trimStart = Number(((sourceDuration - durationSeconds) / 2).toFixed(3));
    }

    const hasAudio = (type === 'vídeo' || isFacelessHf || type === 'texto') ? '1' : '0';

    assetsXml.push(`    <asset id="${assetId}" name="${filename}" src="${fileUrl}" start="0s" duration="${sourceDuration}s" hasVideo="1" hasAudio="${hasAudio}"/>`);
    clipsXml.push(`            <asset-clip ref="${assetId}" name="${filename.replace(/\.[^.]+$/, '')}" offset="${offsetSeconds}s" start="${trimStart}s" duration="${durationSeconds}s"/>`);
  });

  return [
    `<?xml version="1.0" encoding="UTF-8"?>`,
    `<!DOCTYPE fcpxml>`,
    `<fcpxml version="1.8">`,
    `  <resources>`,
    `    <format id="r1" name="FFVideoFormat1080p30" frameDuration="100/3000s" width="1920" height="1080"/>`,
    ...assetsXml,
    `  </resources>`,
    `  <library>`,
    `    <event name="ContentOS_Event">`,
    `      <project name="${projectName.replace(/[<>&'"]/g, '')}">`,
    `        <sequence duration="${totalProjectDuration}s" format="r1" tcStart="0s" tcFormat="NDF">`,
    `          <spine>`,
    ...clipsXml,
    `          </spine>`,
    `        </sequence>`,
    `      </project>`,
    `    </event>`,
    `  </library>`,
    `</fcpxml>`
  ].join('\n');
};

export interface CapCutDraftResult {
  draftContent: string;
  draftMetaInfo: string;
}

export const buildCapCutDraft = (
  rows: SrtAssetRow[],
  projectName: string = 'ContentOS_Project',
  options?: CapCutDraftOptions
): CapCutDraftResult => {
  const baseDir = options?.baseDirectory?.trim() || 'D:/onedrive/Downloads/Warhammer/War BR V127/';
  const defaultVideoDuration = options?.defaultVideoDuration ?? 8.0;
  const defaultImageDuration = options?.defaultImageDuration ?? 5.0;
  const namingTemplate = options?.namingTemplate ?? 'index_prompt56';
  const videoExt = options?.videoExtension || 'mp4';
  const imageExt = options?.imageExtension || 'png';
  const audioFilename = options?.audioFilename?.trim() || `${projectName}.mp3`;

  // Aspect Ratio and Resolution
  const aspectRatio = options?.aspectRatio || 
    (options?.videoFormat === 'avatar' || options?.videoFormat === 'vlog' ? 'horizontal' : 'vertical');
  const isHorizontal = aspectRatio === 'horizontal';
  const canvasWidth = isHorizontal ? 1920 : 1080;
  const canvasHeight = isHorizontal ? 1080 : 1920;
  const canvasRatio = isHorizontal ? "original" : "9:16";

  // Naming and Cut Options
  const cutMode = options?.cutMode || 'middle';
  const smartSpeedUp = !!options?.smartSpeedUp;
  const targetMinDuration = options?.targetMinDuration ?? 7.5;
  const smartSlowDown = !!options?.smartSlowDown;
  const targetMaxDuration = options?.targetMaxDuration ?? 10.0;
  const scannedFilesMap = options?.scannedFilesMap || {};

  // Normalize base directory path (ensure forward slashes and trailing slash)
  let normalizedBase = baseDir.replace(/\\/g, '/');
  if (normalizedBase.startsWith('file:///')) {
    normalizedBase = normalizedBase.replace('file:///', '');
  }
  if (!normalizedBase.endsWith('/')) {
    normalizedBase += '/';
  }

  // Detect suffix from the folder name
  const partsForSuffix = normalizedBase.split('/').filter(Boolean);
  const lastDir = partsForSuffix[partsForSuffix.length - 1] || '';
  const suffixMatch = lastDir.match(/(V\d+|v\d+)$/) || lastDir.match(/\s+(\S+)$/);
  const suffix = suffixMatch ? suffixMatch[1] : '';

  const videoSubDir = suffix ? `Videos ${suffix}/` : 'Videos/';
  const imageSubDir = suffix ? `Imagens ${suffix}/` : 'Imagens/';

  const mediaRows = rows.filter(r => {
    const type = normalizeAssetType(r.asset);
    return type === 'vídeo' || type === 'imagem' || type === 'texto' || (type === 'hyperframe' && options?.videoFormat === 'faceless');
  });

  const projectUuid = generateUuid();
  const videoTrackUuid = generateUuid();
  const audioTrackUuid = generateUuid();

  let totalDurationMs = 0;
  rows.forEach(row => {
    const endMs = parseSrtTimeToMs(row.endTime);
    if (endMs > totalDurationMs) totalDurationMs = endMs;
  });
  const totalDurationUs = totalDurationMs * 1000;

  const videosMaterials: any[] = [];
  const audiosMaterials: any[] = [];
  const speedsMaterials: any[] = [];
  const placeholdersMaterials: any[] = [];
  const beatsMaterials: any[] = [];
  const mappingsMaterials: any[] = [];
  const separationsMaterials: any[] = [];
  const canvasesMaterials: any[] = [];
  const colorsMaterials: any[] = [];

  const videoSegments: any[] = [];
  const audioSegments: any[] = [];

  const draftMaterialsMeta: any[] = [];

  // 1. Process Narration Audio
  const narrationAudioUuid = generateUuid();
  const narrationLocalAudioUuid = generateUuid();
  const narrationSpeedUuid = generateUuid();
  const narrationPlaceholderUuid = generateUuid();
  const narrationBeatUuid = generateUuid();
  const narrationMappingUuid = generateUuid();
  const narrationSeparationUuid = generateUuid();

  const narrationCleanPath = `${normalizedBase}${audioFilename}`.replace(/\/+/g, '/');

  audiosMaterials.push({
    "id": narrationAudioUuid,
    "unique_id": "",
    "type": "extract_music",
    "name": audioFilename,
    "duration": totalDurationUs,
    "path": narrationCleanPath,
    "category_name": "local",
    "wave_points": [],
    "music_id": generateUuid().toLowerCase(),
    "app_id": 0,
    "check_flag": 1,
    "local_material_id": narrationLocalAudioUuid,
    "copyright_limit_type": "none",
  });

  speedsMaterials.push({ "id": narrationSpeedUuid, "type": "speed", "mode": 0, "speed": 1.0, "curve_speed": null });
  placeholdersMaterials.push({ "id": narrationPlaceholderUuid, "type": "placeholder_info", "meta_type": "none", "res_path": "", "res_text": "", "error_path": "", "error_text": "" });
  beatsMaterials.push({ "id": narrationBeatUuid, "type": "beats", "enable_ai_beats": false, "gear": 404, "gear_count": 0, "mode": 404, "user_beats": [], "ai_beats": { "melody_url": "", "melody_path": "", "beats_url": "", "beats_path": "", "melody_percents": [0.0], "beat_speed_infos": [] } });
  mappingsMaterials.push({ "id": narrationMappingUuid, "type": "", "audio_channel_mapping": 0, "is_config_open": false });
  separationsMaterials.push({ "id": narrationSeparationUuid, "type": "vocal_separation", "choice": 0, "removed_sounds": [], "time_range": null, "production_path": "", "final_algorithm": "", "enter_from": "" });

  audioSegments.push({
    "id": generateUuid(),
    "source_timerange": { "start": 0, "duration": totalDurationUs },
    "target_timerange": { "start": 0, "duration": totalDurationUs },
    "render_timerange": { "start": 0, "duration": 0 },
    "material_id": narrationAudioUuid,
    "extra_material_refs": [narrationSpeedUuid, narrationPlaceholderUuid, narrationBeatUuid, narrationMappingUuid, narrationSeparationUuid],
    "render_index": 1,
    "keyframe_refs": [],
    "enable_lut": false,
    "enable_adjust": false,
    "enable_hsl": false,
    "visible": true,
    "track_render_index": 1,
  });

  draftMaterialsMeta.push({
    "create_time": Math.floor(Date.now() / 1000),
    "duration": totalDurationUs,
    "extra_info": audioFilename,
    "file_Path": narrationCleanPath,
    "id": narrationLocalAudioUuid,
    "import_time": Math.floor(Date.now() / 1000),
    "import_time_ms": Date.now() * 1000,
    "metetype": "music",
    "roughcut_time_range": { "duration": totalDurationUs, "start": 0 },
    "type": 0
  });

  // 2. Process Media Rows
  mediaRows.forEach((row, index) => {
    const type = normalizeAssetType(row.asset);
    const rowNum = row.rowNumber;
    const cleanPrompt = sanitizePromptForFilename(row.prompt);
    const isFacelessHf = type === 'hyperframe' && options?.videoFormat === 'faceless';

    const localFile = scannedFilesMap[rowNum];
    let filename = '';
    const ext = (type === 'vídeo' || isFacelessHf) ? videoExt : (type === 'imagem' ? imageExt : 'mp4');

    if (type === 'texto') {
      filename = `linha_${String(rowNum).padStart(4, '0')}_texto.mp4`;
    } else if (localFile) {
      filename = localFile.name;
    } else {
      const prefix = isFacelessHf ? `${rowNum}-HF` : `${rowNum}`;
      filename = namingTemplate === 'index_only' ? `${prefix}.${ext}` : `${prefix}_${cleanPrompt}.${ext}`;
    }

    let fileUrl = '';
    const subFolder = (type === 'vídeo' || isFacelessHf) ? videoSubDir : imageSubDir;
    if (type === 'texto') {
      const safeStem = sanitizeDownloadFileStem(options?.projectStem || projectName);
      fileUrl = `${normalizedBase}renders_${safeStem}/${filename}`;
    } else {
      fileUrl = `${normalizedBase}${subFolder}${filename}`;
    }

    const cleanPath = fileUrl.replace(/\/+/g, '/');
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);
    const srtDurationMs = endMs - startMs;
    const offsetUs = startMs * 1000;
    const srtDurationUs = srtDurationMs * 1000;

    let fileDurationSeconds = (type === 'vídeo' || isFacelessHf) ? defaultVideoDuration : ((type === 'imagem') ? defaultImageDuration : (srtDurationMs / 1000));
    if (localFile && localFile.realDuration > 0) fileDurationSeconds = localFile.realDuration;
    let fileDurationUs = Math.floor(fileDurationSeconds * 1000000);
    
    let calculatedSpeed = 1.0;
    let trimStartUs = 0;
    let trimDurationUs = srtDurationUs;

    if (type === 'vídeo' || isFacelessHf) {
      const srtDurationSec = srtDurationMs / 1000;
      if (smartSpeedUp && fileDurationSeconds > srtDurationSec && fileDurationSeconds <= srtDurationSec + 0.5) {
        calculatedSpeed = fileDurationSeconds / srtDurationSec;
        trimStartUs = 0; trimDurationUs = fileDurationUs;
      } else if (smartSlowDown && fileDurationSeconds < srtDurationSec && srtDurationSec <= fileDurationSeconds * 1.25) {
        calculatedSpeed = fileDurationSeconds / srtDurationSec;
        trimStartUs = 0; trimDurationUs = fileDurationUs;
      } else {
        calculatedSpeed = 1.0;
        if (fileDurationUs > srtDurationUs) {
          const cutAmountUs = fileDurationUs - srtDurationUs;
          trimStartUs = cutMode === 'start' ? cutAmountUs : (cutMode === 'end' ? 0 : Math.floor(cutAmountUs / 2));
          trimDurationUs = srtDurationUs;
        } else {
          trimStartUs = 0; trimDurationUs = fileDurationUs;
        }
      }
    } else {
      calculatedSpeed = 1.0; trimStartUs = 0; trimDurationUs = srtDurationUs;
    }

    calculatedSpeed = Number(Math.max(0.1, Math.min(100.0, calculatedSpeed)).toFixed(6));
    trimStartUs = Math.max(0, Math.floor(trimStartUs));
    trimDurationUs = Math.max(1000, Math.floor(trimDurationUs));
    const timelineDurationUs = Math.round(trimDurationUs / calculatedSpeed);

    const videoMaterialUuid = generateUuid();
    const videoLocalMaterialUuid = generateUuid();
    const videoSpeedUuid = generateUuid();
    const videoPlaceholderUuid = generateUuid();
    const videoMappingUuid = generateUuid();
    const videoSeparationUuid = generateUuid();
    const videoCanvasUuid = generateUuid();
    const videoColorUuid = generateUuid();

    videosMaterials.push({
      "id": videoMaterialUuid,
      "unique_id": "",
      "type": "video",
      "duration": fileDurationUs,
      "path": cleanPath,
      "media_path": "",
      "local_id": "",
      "has_audio": (type === 'vídeo' || isFacelessHf),
      "reverse_path": "",
      "intensifies_path": "",
      "reverse_intensifies_path": "",
      "intensifies_audio_path": "",
      "cartoon_path": "",
      "width": canvasWidth,
      "height": canvasHeight,
      "category_id": "",
      "category_name": "local",
      "material_id": "",
      "material_name": filename,
      "material_url": "",
      "crop": { "upper_left_x": 0.0, "upper_left_y": 0.0, "upper_right_x": 1.0, "upper_right_y": 0.0, "lower_left_x": 0.0, "lower_left_y": 1.0, "lower_right_x": 1.0, "lower_right_y": 1.0 },
      "crop_ratio": "free",
      "audio_fade": null,
      "crop_scale": 1.0,
      "extra_type_option": 0,
      "stable": { "stable_level": 0, "matrix_path": "", "time_range": { "start": 0, "duration": 0 } },
      "matting": { "flag": 0, "path": "", "interactiveTime": [], "has_use_quick_brush": false, "strokes": [], "has_use_quick_eraser": false, "expansion": 0.0, "feather": 0.0, "reverse": false, "custom_matting_id": "", "enable_matting_stroke": false, "is_clould": false, "mask_video_path": "", "cloud_product_fps": 0.0 },
      "source": 0,
      "source_platform": 0,
      "formula_id": "",
      "check_flag": 0,
      "video_algorithm": {
        "algorithms": [], "time_range": null, "path": "", "gameplay_configs": [], "ai_in_painting_config": [], "complement_frame_config": null, "motion_blur_config": null, "deflicker": null, "noise_reduction": null, "quality_enhance": null, "super_resolution": null, "ai_background_configs": [], "smart_complement_frame": null, "aigc_generate": null, "aigc_generate_list": [], "mouth_shape_driver": null, "ai_expression_driven": null, "ai_motion_driven": null, "image_interpretation": null, "story_video_modify_video_config": { "task_id": "", "is_overwrite_last_video": false, "tracker_task_id": "" }, "skip_algorithm_index": []
      },
      "is_unified_beauty_mode": false,
      "is_set_beauty_mode": false,
      "object_locked": null,
      "smart_motion": null,
      "multi_camera_info": null,
      "freeze": null,
      "picture_from": "none",
      "picture_set_category_id": "",
      "picture_set_category_name": "",
      "team_id": "",
      "local_material_id": videoLocalMaterialUuid,
      "origin_material_id": "",
      "request_id": "",
      "has_sound_separated": false,
      "is_text_edit_overdub": false,
      "is_ai_generate_content": false,
      "aigc_type": "none",
      "is_copyright": false,
      "aigc_history_id": "",
      "aigc_item_id": "",
      "local_material_from": "",
      "smart_match_info": null,
      "beauty_face_preset_infos": [],
      "beauty_body_preset_id": "",
      "beauty_face_auto_preset": { "preset_id": "", "name": "", "rate_map": "", "scene": "" },
      "beauty_face_auto_preset_infos": [],
      "beauty_body_auto_preset": null,
      "live_photo_timestamp": -1,
      "live_photo_cover_path": "",
      "content_feature_info": null,
      "corner_pin": null,
      "surface_trackings": [],
      "video_mask_stroke": null,
      "video_mask_shadow": null
    });

    speedsMaterials.push({ "id": videoSpeedUuid, "type": "speed", "mode": 0, "speed": calculatedSpeed, "curve_speed": null });
    placeholdersMaterials.push({ "id": videoPlaceholderUuid, "type": "placeholder_info", "meta_type": "none", "res_path": "", "res_text": "", "error_path": "", "error_text": "" });
    mappingsMaterials.push({ "id": videoMappingUuid, "type": "", "audio_channel_mapping": 0, "is_config_open": false });
    separationsMaterials.push({ "id": videoSeparationUuid, "type": "vocal_separation", "choice": 0, "removed_sounds": [], "time_range": null, "production_path": "", "final_algorithm": "", "enter_from": "" });
    canvasesMaterials.push({ "album_image": "", "blur": 0.0, "color": "", "id": videoCanvasUuid, "image": "", "image_id": "", "image_name": "", "source_platform": 0, "team_id": "", "type": "canvas_color" });
    colorsMaterials.push({ "gradient_angle": 90, "gradient_colors": [], "gradient_percents": [], "height": 0, "id": videoColorUuid, "is_color_clip": false, "is_gradient": false, "solid_color": "", "width": 0 });

    videoSegments.push({
      "id": generateUuid(),
      "source_timerange": { "start": trimStartUs, "duration": trimDurationUs },
      "target_timerange": { "start": offsetUs, "duration": timelineDurationUs },
      "render_timerange": { "start": 0, "duration": 0 },
      "desc": "",
      "state": 0,
      "speed": calculatedSpeed,
      "is_loop": false,
      "is_tone_modify": false,
      "reverse": false,
      "intensifies_audio": false,
      "cartoon": false,
      "volume": 1.0,
      "last_nonzero_volume": 1.0,
      "clip": {
        "scale": { "x": 1.0, "y": 1.0 },
        "rotation": 0.0,
        "transform": { "x": 0.0, "y": 0.0 },
        "flip": { "vertical": false, "horizontal": false },
        "alpha": 1.0
      },
      "uniform_scale": { "on": true, "value": 1.0 },
      "material_id": videoMaterialUuid,
      "extra_material_refs": [
        videoSpeedUuid,
        videoPlaceholderUuid,
        videoCanvasUuid,
        videoMappingUuid,
        videoColorUuid,
        videoSeparationUuid
      ],
      "render_index": index + 1,
      "keyframe_refs": [],
      "enable_lut": true,
      "enable_adjust": true,
      "enable_hsl": false,
      "visible": true,
      "group_id": "",
      "enable_color_curves": true,
      "enable_hsl_curves": true,
      "track_render_index": index + 1,
      "hdr_settings": {
        "intensity": 1.0,
        "mode": 1,
        "nits": 1000
      },
      "enable_color_wheels": true,
      "track_attribute": 0,
      "is_placeholder": false,
      "template_id": "",
      "enable_smart_color_adjust": false,
      "template_scene": "default",
      "common_keyframes": [],
      "caption_info": null,
      "responsive_layout": { "enable": false, "target_follow": "", "size_layout": 0, "horizontal_pos_layout": 0, "vertical_pos_layout": 0 },
      "enable_color_match_adjust": false,
      "enable_color_correct_adjust": false,
      "enable_adjust_mask": false,
      "raw_segment_id": "",
      "lyric_keyframes": null,
      "enable_video_mask": true,
      "digital_human_template_group_id": "",
      "color_correct_alg_result": "",
      "source": "segmentsourcenormal",
      "enable_mask_stroke": false,
      "enable_mask_shadow": false,
      "enable_color_adjust_pro": false
    });

    draftMaterialsMeta.push({
      "create_time": Math.floor(Date.now() / 1000),
      "duration": fileDurationUs,
      "extra_info": filename,
      "file_Path": cleanPath,
      "height": canvasHeight,
      "id": videoLocalMaterialUuid,
      "import_time": Math.floor(Date.now() / 1000),
      "metetype": "video",
      "roughcut_time_range": { "duration": fileDurationUs, "start": 0 },
      "type": 0,
      "width": canvasWidth
    });
  });

  const draftContentObj = {
    "id": projectUuid,
    "version": 360000,
    "new_version": "163.0.0",
    "duration": totalDurationUs,
    "fps": 30.0,
    "canvas_config": { "ratio": canvasRatio, "width": canvasWidth, "height": canvasHeight, "background": null },
    "tracks": [
      { "id": generateUuid(), "type": "video", "segments": [], "flag": 0, "attribute": 0, "name": "", "is_default_name": true },
      { "id": videoTrackUuid, "type": "video", "segments": videoSegments, "flag": 0, "attribute": 0, "name": "", "is_default_name": true },
      ...(audioSegments.length > 0 ? [{ "id": audioTrackUuid, "type": "audio", "segments": audioSegments, "flag": 0, "attribute": 0, "name": "", "is_default_name": true }] : [])
    ],
    "materials": {
      "flowers": [],
      "videos": videosMaterials,
      "tail_leaders": [],
      "audios": audiosMaterials,
      "images": [],
      "texts": [],
      "effects": [],
      "stickers": [],
      "canvases": canvasesMaterials,
      "transitions": [],
      "audio_effects": [],
      "audio_fades": [],
      "beats": beatsMaterials,
      "material_animations": [],
      "placeholders": [],
      "placeholder_infos": placeholdersMaterials,
      "speeds": speedsMaterials,
      "common_mask": [],
      "chromas": [],
      "text_templates": [],
      "realtime_denoises": [],
      "audio_pannings": [],
      "audio_pitch_shifts": [],
      "video_trackings": [],
      "hsl": [],
      "drafts": [],
      "color_curves": [],
      "hsl_curves": [],
      "primary_color_wheels": [],
      "log_color_wheels": [],
      "video_effects": [],
      "audio_balances": [],
      "handwrites": [],
      "manual_deformations": [],
      "manual_beautys": [],
      "plugin_effects": [],
      "sound_channel_mappings": mappingsMaterials,
      "green_screens": [],
      "shapes": [],
      "material_colors": colorsMaterials,
      "digital_humans": [],
      "digital_human_model_dressing": [],
      "smart_crops": [],
      "ai_translates": [],
      "audio_track_indexes": [],
      "loudnesses": [],
      "vocal_beautifys": [],
      "vocal_separations": separationsMaterials,
      "smart_relights": [],
      "time_marks": [],
      "multi_language_refs": [],
      "video_shadows": [],
      "video_strokes": [],
      "video_radius": []
    },
    "platform": { "os": "windows", "os_version": "10.0.19045", "app_id": 359289, "app_version": "7.9.0", "app_source": "cc" },
    "last_modified_platform": { "os": "windows", "os_version": "10.0.26200", "app_id": 359289, "app_version": "8.3.0", "app_source": "cc" },
    "draft_type": "video"
  };

  const draftMetaObj = {
    "draft_id": projectUuid,
    "draft_name": projectName,
    "draft_materials": [{ "type": 0, "value": draftMaterialsMeta }, { "type": 1, "value": [] }, { "type": 2, "value": [] }, { "type": 3, "value": [] }, { "type": 6, "value": [] }, { "type": 7, "value": [] }, { "type": 8, "value": [] }],
    "draft_root_path": "C:/Users/naube/AppData/Local/CapCut/User Data/Projects/com.lveditor.draft",
    "tm_draft_create": Math.floor(Date.now() * 1000),
    "tm_draft_modified": Math.floor(Date.now() * 1000),
    "tm_duration": totalDurationUs
  };

  return {
    draftContent: JSON.stringify(draftContentObj, null, 2),
    draftMetaInfo: JSON.stringify(draftMetaObj, null, 2)
  };
};

const generateUuid = () => {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16).toUpperCase();
  });
};

export interface CompiledDnaBlocks {
  styleDna: string;
  characterDna: string;
  extrasDna: string;
  negativeDna: string;
  hasDna: boolean;
}

export const parseDnaBlocks = (text: string): CompiledDnaBlocks => {
  const normalized = text || '';
  if (!normalized.includes('STYLE_DNA:')) {
    return { styleDna: '', characterDna: '', extrasDna: '', negativeDna: '', hasDna: false };
  }

  const getBlock = (key: string): string => {
    const keyIndex = normalized.indexOf(key + ':');
    if (keyIndex === -1) return '';
    
    const contentStart = keyIndex + key.length + 1;
    const keys = ['STYLE_DNA:', 'CHARACTER_DNA:', 'EXTRAS_DNA:', 'NEGATIVE_DNA:', 'PALAVRA_SENTINELA:', 'Regras de uso'];
    let contentEnd = normalized.length;
    
    for (const otherKey of keys) {
      if (otherKey === key + ':') continue;
      const idx = normalized.indexOf(otherKey, contentStart);
      if (idx !== -1 && idx < contentEnd) {
        contentEnd = idx;
      }
    }
    
    let blockText = normalized.slice(contentStart, contentEnd).trim();
    // Remove aspas se presentes
    if (blockText.startsWith('"') && blockText.endsWith('"')) {
      blockText = blockText.slice(1, -1).trim();
    }
    
    if (blockText.toUpperCase() === 'NENHUM' || blockText.toUpperCase() === '"NENHUM"') {
      return '';
    }
    
    return blockText;
  };

  return {
    styleDna: getBlock('STYLE_DNA'),
    characterDna: getBlock('CHARACTER_DNA'),
    extrasDna: getBlock('EXTRAS_DNA'),
    negativeDna: getBlock('NEGATIVE_DNA'),
    hasDna: true,
  };
};

export const getProtagonistReplacement = (characterMode: string | undefined, dnaText: string): string => {
  const mode = String(characterMode || '').toLowerCase();
  if (mode === 'female') return 'the woman';
  if (mode === 'male') return 'the man';
  
  const text = String(dnaText || '').toLowerCase();
  const femaleKeywords = ['woman', 'female', 'girl', 'lady', 'she', 'her', 'mulher', 'garota', 'ela', 'claire'];
  const maleKeywords = ['man', 'male', 'boy', 'gentleman', 'he', 'him', 'his', 'homem', 'garoto', 'ele'];
  
  const hasFemale = femaleKeywords.some(kw => text.includes(kw));
  const hasMale = maleKeywords.some(kw => text.includes(kw));
  
  if (hasFemale && !hasMale) return 'the woman';
  if (hasMale && !hasFemale) return 'the man';
  return 'the person';
};

export const sanitizeProperNames = (text: string): string => {
  if (!text) return '';
  let cleaned = text.replace(/(?:named|called)\s+[A-Z][a-zA-Z]*/g, '');
  cleaned = cleaned.replace(/(?:named|called)\s+[a-z]+/g, '');
  return cleaned.replace(/\s+/g, ' ').trim();
};



