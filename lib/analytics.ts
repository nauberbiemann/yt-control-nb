export const ANALYTICS_STORAGE_PREFIX = 'analytics_entries_';

export type AnalyticsImportSource = 'csv';

export interface AnalyticsEntry {
  id: string;
  project_id: string;
  video_title: string;
  video_url?: string;
  youtube_video_id?: string;
  published_at?: string;
  views: number;
  impressions: number;
  ctr: number;
  retention_avg: number;
  avg_view_duration_seconds?: number;
  watch_time_hours?: number;
  subscribers_gained?: number;
  llm_model_id?: string;
  theme_id?: string;
  theme_title?: string;
  editorial_pillar?: string;
  title_structure?: string;
  title_structure_id?: string | null;
  hook_id?: string | null;
  cta_id?: string | null;
  curve_id?: string | null;
  argument_mode_id?: string | null;
  match_score?: number | null;
  demand_views?: string | null;
  block_count?: number | null;
  duration_minutes?: number | null;
  execution_mode?: string | null;
  import_source: AnalyticsImportSource;
  imported_at: string;
  source_file_name?: string;
  raw_row?: Record<string, string>;
}

export interface AnalyticsCsvPreview {
  headers: string[];
  entries: AnalyticsEntry[];
  warnings: string[];
  delimiter: string;
}

type ThemeLike = Record<string, any>;
type CompositionLogLike = Record<string, any>;

const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

const parseCsvRows = (csvText: string, delimiter: string) => {
  const rows: string[][] = [];
  let currentCell = '';
  let currentRow: string[] = [];
  let inQuotes = false;

  for (let index = 0; index < csvText.length; index += 1) {
    const char = csvText[index];
    const nextChar = csvText[index + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        currentCell += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && char === delimiter) {
      currentRow.push(currentCell);
      currentCell = '';
      continue;
    }

    if (!inQuotes && (char === '\n' || char === '\r')) {
      if (char === '\r' && nextChar === '\n') {
        index += 1;
      }
      currentRow.push(currentCell);
      if (currentRow.some((cell) => cell.trim() !== '')) {
        rows.push(currentRow);
      }
      currentRow = [];
      currentCell = '';
      continue;
    }

    currentCell += char;
  }

  currentRow.push(currentCell);
  if (currentRow.some((cell) => cell.trim() !== '')) {
    rows.push(currentRow);
  }

  return rows;
};

const detectDelimiter = (csvText: string) => {
  const firstLine = csvText.split(/\r?\n/).find((line) => line.trim().length > 0) || '';
  const candidates = [',', ';', '\t'];

  return candidates
    .map((delimiter) => ({
      delimiter,
      count: firstLine.split(delimiter).length,
    }))
    .sort((a, b) => b.count - a.count)[0]?.delimiter || ',';
};

const parseLooseNumber = (value?: string | null): number => {
  if (!value) return 0;
  const cleaned = value
    .replace(/[^\d,.\-kKmMbB]/g, '')
    .trim();

  if (!cleaned) return 0;

  const lastComma = cleaned.lastIndexOf(',');
  const lastDot = cleaned.lastIndexOf('.');

  let normalized = cleaned;
  if (/[kKmMbB]$/.test(cleaned)) {
    const suffix = cleaned.slice(-1).toLowerCase();
    normalized = cleaned.slice(0, -1);
    const base: number = parseLooseNumber(normalized);
    if (suffix === 'k') return Math.round(base * 1_000);
    if (suffix === 'm') return Math.round(base * 1_000_000);
    if (suffix === 'b') return Math.round(base * 1_000_000_000);
  }

  if (lastComma > lastDot) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    normalized = cleaned.replace(/,/g, '');
  } else {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
};

const parsePercent = (value?: string | null) => {
  if (!value) return 0;
  return parseLooseNumber(value);
};

const parseDurationToSeconds = (value?: string | null) => {
  if (!value) return 0;
  const cleaned = value.trim();
  if (!cleaned) return 0;

  const segments = cleaned.split(':').map((segment) => Number(segment.trim()));
  if (segments.every((segment) => Number.isFinite(segment))) {
    if (segments.length === 3) {
      return (segments[0] * 3600) + (segments[1] * 60) + segments[2];
    }
    if (segments.length === 2) {
      return (segments[0] * 60) + segments[1];
    }
  }

  return Math.round(parseLooseNumber(cleaned));
};

const parseDateTime = (value?: string | null) => {
  if (!value) return '';
  const raw = value.trim();
  if (!raw) return '';

  if (/^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$/.test(raw)) {
    return raw.length === 10 ? `${raw}T00:00` : raw.slice(0, 16);
  }

  const match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})(?:\s+(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00'] = match;
    const yyyy = year.length === 2 ? `20${year}` : year;
    return `${yyyy}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return '';

  const year = parsed.getFullYear();
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const day = String(parsed.getDate()).padStart(2, '0');
  const hour = String(parsed.getHours()).padStart(2, '0');
  const minute = String(parsed.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hour}:${minute}`;
};

const extractVideoId = (value?: string | null) => {
  if (!value) return '';
  const match = value.match(/(?:v=|\/shorts\/|youtu\.be\/)([A-Za-z0-9_-]{11})/);
  return match?.[1] || '';
};

const getFirstValue = (row: Record<string, string>, aliases: string[]) => {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const normalizedAlias = normalizeText(alias);
    const direct = keys.find((key) => normalizeText(key) === normalizedAlias);
    if (direct && row[direct] !== undefined) return row[direct];

    const partial = keys.find((key) => normalizeText(key).includes(normalizedAlias));
    if (partial && row[partial] !== undefined) return row[partial];
  }
  return '';
};

const titleCandidates = ['título do vídeo', 'titulo do video', 'video title', 'title'];
const urlCandidates = ['url do video', 'video url', 'url', 'link'];
const publishDateCandidates = ['data de publicacao', 'publish date', 'published at', 'data'];
const viewsCandidates = ['visualizacoes', 'views'];
const impressionsCandidates = ['impressoes', 'impressions'];
const ctrCandidates = ['taxa de cliques de impressoes', 'impressions click-through rate', 'ctr', 'taxa de cliques'];
const retentionCandidates = ['porcentagem media visualizada', 'average percentage viewed', 'retencao', 'retention'];
const avgViewDurationCandidates = ['duracao media da visualizacao', 'average view duration'];
const watchTimeCandidates = ['tempo de exibicao horas', 'watch time hours', 'tempo de exibicao'];
const subscribersCandidates = ['inscritos', 'subscribers'];

const getExecutionSnapshot = (theme: ThemeLike) => theme?.production_assets?.execution_snapshot || {};

const resolveTitleStructureName = (theme?: ThemeLike | null) =>
  theme?.title_structure ||
  theme?.selected_structure ||
  theme?.production_assets?.title_structure_id ||
  'Sem estrutura';

const findMatchedTheme = (videoTitle: string, themes: ThemeLike[]) => {
  const normalizedTitle = normalizeText(videoTitle);
  if (!normalizedTitle) return null;

  return themes.find((theme) => {
    const candidates = [
      theme?.refined_title,
      theme?.title,
      theme?.project_name,
      getExecutionSnapshot(theme)?.approvedTheme,
      getExecutionSnapshot(theme)?.approvedBriefing?.title,
    ]
      .filter(Boolean)
      .map((value) => normalizeText(String(value)));

    return candidates.some((candidate) =>
      candidate === normalizedTitle ||
      candidate.includes(normalizedTitle) ||
      normalizedTitle.includes(candidate)
    );
  }) || null;
};

const findMatchedCompositionLog = (videoTitle: string, logs: CompositionLogLike[]) => {
  const normalizedTitle = normalizeText(videoTitle);
  if (!normalizedTitle) return null;

  return logs.find((log) => {
    const themeTitle = normalizeText(String(log?.theme_title || ''));
    return !!themeTitle && (
      themeTitle === normalizedTitle ||
      themeTitle.includes(normalizedTitle) ||
      normalizedTitle.includes(themeTitle)
    );
  }) || null;
};

const buildEntryIdentity = (entry: Pick<AnalyticsEntry, 'video_title' | 'published_at'>) =>
  `${normalizeText(entry.video_title)}|${entry.published_at || ''}`;

const hydrateEditorialContext = (
  entry: AnalyticsEntry,
  themes: ThemeLike[],
  logs: CompositionLogLike[]
): AnalyticsEntry => {
  const matchedTheme = findMatchedTheme(entry.video_title, themes);
  const matchedLog = findMatchedCompositionLog(entry.video_title, logs);
  const snapshot = matchedTheme ? getExecutionSnapshot(matchedTheme) : {};

  return {
    ...entry,
    theme_id: matchedTheme?.id || entry.theme_id,
    theme_title: matchedTheme?.refined_title || matchedTheme?.title || entry.theme_title || entry.video_title,
    editorial_pillar: matchedTheme?.editorial_pillar || entry.editorial_pillar,
    title_structure: resolveTitleStructureName(matchedTheme) || entry.title_structure,
    title_structure_id: matchedTheme?.title_structure_asset_id || matchedTheme?.production_assets?.title_structure_id || entry.title_structure_id,
    hook_id: matchedTheme?.production_assets?.hook_id || matchedLog?.selectedHookId || entry.hook_id,
    cta_id: matchedTheme?.production_assets?.cta_id || matchedLog?.selectedCtaId || entry.cta_id,
    curve_id: matchedTheme?.production_assets?.narrative_curve_id || matchedLog?.selectedCurveId || entry.curve_id,
    argument_mode_id: matchedTheme?.production_assets?.argument_mode_id || matchedLog?.selectedArgumentModeId || entry.argument_mode_id,
    llm_model_id: matchedLog?.llm_model_id || entry.llm_model_id,
    match_score: matchedTheme?.match_score ?? entry.match_score ?? null,
    demand_views: matchedTheme?.demand_views || entry.demand_views || null,
    block_count: matchedTheme?.production_assets?.block_count || matchedLog?.blockCount || entry.block_count || null,
    duration_minutes: matchedTheme?.production_assets?.duration_minutes || matchedLog?.durationMinutes || entry.duration_minutes || null,
    execution_mode: snapshot?.executionMode || matchedTheme?.production_assets?.execution_mode || matchedLog?.executionMode || entry.execution_mode || null,
  };
};

export const readAnalyticsEntries = (projectId: string, themes: ThemeLike[] = [], logs: CompositionLogLike[] = []) => {
  try {
    const raw = localStorage.getItem(`${ANALYTICS_STORAGE_PREFIX}${projectId}`);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((entry: AnalyticsEntry) => hydrateEditorialContext(entry, themes, logs))
      .sort((a: AnalyticsEntry, b: AnalyticsEntry) => {
        const timeA = new Date(a.published_at || a.imported_at || 0).getTime();
        const timeB = new Date(b.published_at || b.imported_at || 0).getTime();
        return timeB - timeA;
      });
  } catch {
    return [];
  }
};

export const writeAnalyticsEntries = (projectId: string, entries: AnalyticsEntry[]) => {
  localStorage.setItem(`${ANALYTICS_STORAGE_PREFIX}${projectId}`, JSON.stringify(entries));
};

export const mergeAnalyticsEntries = (
  projectId: string,
  importedEntries: AnalyticsEntry[],
  themes: ThemeLike[] = [],
  logs: CompositionLogLike[] = []
) => {
  const existing = readAnalyticsEntries(projectId, themes, logs);
  const merged = new Map<string, AnalyticsEntry>();

  [...existing, ...importedEntries].forEach((entry) => {
    const hydrated = hydrateEditorialContext(entry, themes, logs);
    const key = buildEntryIdentity(hydrated);
    const previous = merged.get(key);
    merged.set(key, previous ? { ...previous, ...hydrated } : hydrated);
  });

  const result = Array.from(merged.values()).sort((a, b) => {
    const timeA = new Date(a.published_at || a.imported_at || 0).getTime();
    const timeB = new Date(b.published_at || b.imported_at || 0).getTime();
    return timeB - timeA;
  });

  writeAnalyticsEntries(projectId, result);
  return result;
};

export const parseYouTubeStudioCsv = (
  csvText: string,
  {
    projectId,
    fileName,
    themes = [],
    logs = [],
  }: {
    projectId: string;
    fileName?: string;
    themes?: ThemeLike[];
    logs?: CompositionLogLike[];
  }
): AnalyticsCsvPreview => {
  const delimiter = detectDelimiter(csvText);
  const rows = parseCsvRows(csvText, delimiter);
  const [headerRow, ...dataRows] = rows;
  const headers = (headerRow || []).map((header) => header.trim());
  const warnings: string[] = [];

  if (headers.length === 0) {
    return { headers: [], entries: [], warnings: ['O CSV não possui cabeçalho reconhecível.'], delimiter };
  }

  const entries = dataRows
    .map((values, index) => {
      const row = headers.reduce<Record<string, string>>((acc, header, headerIndex) => {
        acc[header] = values[headerIndex]?.trim() || '';
        return acc;
      }, {});

      const videoTitle = getFirstValue(row, titleCandidates);
      if (!videoTitle) {
        warnings.push(`Linha ${index + 2} ignorada: título do vídeo não encontrado.`);
        return null;
      }

      const videoUrl = getFirstValue(row, urlCandidates);
      const entry: AnalyticsEntry = hydrateEditorialContext(
        {
          id: crypto.randomUUID(),
          project_id: projectId,
          video_title: videoTitle,
          video_url: videoUrl || undefined,
          youtube_video_id: extractVideoId(videoUrl) || undefined,
          published_at: parseDateTime(getFirstValue(row, publishDateCandidates)) || undefined,
          views: Math.round(parseLooseNumber(getFirstValue(row, viewsCandidates))),
          impressions: Math.round(parseLooseNumber(getFirstValue(row, impressionsCandidates))),
          ctr: parsePercent(getFirstValue(row, ctrCandidates)),
          retention_avg: parsePercent(getFirstValue(row, retentionCandidates)),
          avg_view_duration_seconds: parseDurationToSeconds(getFirstValue(row, avgViewDurationCandidates)) || undefined,
          watch_time_hours: parseLooseNumber(getFirstValue(row, watchTimeCandidates)) || undefined,
          subscribers_gained: Math.round(parseLooseNumber(getFirstValue(row, subscribersCandidates))) || undefined,
          import_source: 'csv',
          imported_at: new Date().toISOString(),
          source_file_name: fileName,
          raw_row: row,
        },
        themes,
        logs
      );

      return entry;
    })
    .filter(Boolean) as AnalyticsEntry[];

  if (entries.length === 0) {
    warnings.push('Nenhuma linha útil foi identificada no CSV.');
  }

  return {
    headers,
    entries,
    warnings,
    delimiter,
  };
};
