export type SrtAssetType = '' | 'texto' | 'vídeo' | 'imagem' | 'avatar';

export interface SrtAssetRow {
  rowNumber: number;
  startTime: string;
  endTime: string;
  texto: string;
  asset: SrtAssetType;
  prompt: string;
  caminho: string;
}

export interface SrtAssetStats {
  total: number;
  texto: number;
  avatar: number;
  video: number;
  image: number;
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

export const normalizeLineBreaks = (value: string) => value.replace(/\r\n/g, '\n');

export const normalizeAssetType = (value: string): SrtAssetType => {
  const normalized = (value || '').trim().toLowerCase();

  if (!normalized) return '';
  if (normalized === 'texto') return 'texto';
  if (normalized === 'avatar') return 'avatar';
  if (normalized === 'imagem') return 'imagem';
  if (normalized === 'video' || normalized === 'vídeo' || normalized === 'vã­deo') return 'vídeo';
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
    }));
};

export const applyAssetRules = (rows: SrtAssetRow[]) => {
  if (!rows.length) return rows;

  let lastBrollMarkerMs = 0;
  const totalRows = rows.length;

  return rows.map((row, index) => {
    const text = row.texto.trim();
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);

    if (text.length <= TEXT_MAX_CHARS) {
      return { ...row, asset: 'texto' as const };
    }

    const intervalMs = getIntervalMs(index, totalRows);
    if (endMs - lastBrollMarkerMs >= intervalMs) {
      lastBrollMarkerMs = Math.max(lastBrollMarkerMs + intervalMs, startMs);
      return { ...row, asset: getBrollAsset(startMs, endMs) };
    }

    return { ...row, asset: 'avatar' as const };
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
  const headers = ['start time', 'end time', 'texto', 'asset', 'prompt', 'caminho'];
  const lines = [
    headers.join(','),
    ...rows.map((row) => [
      csvEscape(row.startTime),
      csvEscape(row.endTime),
      csvEscape(row.texto),
      csvEscape(normalizeAssetType(row.asset)),
      csvEscape(row.prompt),
      csvEscape(row.caminho),
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
});

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
