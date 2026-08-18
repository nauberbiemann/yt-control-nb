export interface PostScriptScriptBlock {
  title: string;
  content: string;
}

export interface PostScriptChapterAnchor {
  index: number;
  timestamp: string;
  originalTitle: string;
  preview: string;
  layer?: 'structural' | 'semantic' | 'rhythmic';
  rationale?: string;
}

export interface ThumbnailJsonLayer {
  thumbnail_option?: string;
  canvas?: { width: number; height: number; unit?: string; aspect_ratio: string };
  background_scene?: {
    description: string;
    style: string;
    camera_angle: string;
    lighting: string;
    color_palette: string[];
  };
  character?: {
    present: boolean;
    note?: string;
    style?: string;
    action?: string;
    expression?: string;
    clothing?: string;
  };
  text_layers?: Array<{
    id?: string;
    content: string;
    role?: string;
    font_family: string;
    font_size: number;
    color: string;
    stroke?: { color: string; width: number } | string;
    position?: { x: string; y: string; zone?: string } | string;
    transform?: string;
  }>;
  indicators?: Array<{
    id?: string;
    type: string;
    color: string;
    stroke_color?: string;
    stroke_width?: number;
    glow?: boolean;
    position: string;
    size?: string;
    points_to: string;
  }>;
  badges?: Array<{
    id?: string;
    present?: boolean;
    type?: string;
    background_color: string;
    text_color: string;
    content: string;
    font_family?: string;
    font_size?: number;
    position?: string;
  }>;
  composition?: {
    layout: string;
    focal_point: string;
    eye_flow: string;
    safe_zone_margin?: string;
    background_base?: string;
  } | string;
  mood?: string;
  generation_notes?: string;
}

export interface PostScriptPackage {
  titles: string[];
  thumbnailCopies?: string[];
  thumbnailJsons?: ThumbnailJsonLayer[];
  seoDescription: string;
  sourcesSection?: string[];
  pinnedComment?: string;
  seoTags?: string[];
  sunoPrompt: string;
  sunoSuggestedTitle?: string;
  sfxTimelineTxt: string;
  hfContextTitles?: Array<{
    timestamp: string;
    visualState: string;
    headline: string;
    subtitle: string;
    metrics: string;
    bgPrompt?: string;
  }>;
  chapterAnchors: PostScriptChapterAnchor[];
  timelineSource: 'srt' | 'estimated';
  generatedAt: string;
}

export interface PostScriptTimelineContext {
  totalDurationSeconds: number;
  source: 'srt' | 'estimated';
}

export interface PostScriptSfxAnchor {
  timestamp: string;
  seconds: number;
  layer: 'structural' | 'semantic' | 'rhythmic';
  rationale: string;
  excerpt: string;
}

const BLOCK_PREVIEW_LIMIT = 220;

const LANGUAGE_ASSETS: Record<string, {
  aiNotice: string;
  introFallback: string;
  templates: Array<{ regex: RegExp; label: string }>;
  structuralAbertura: string;
  structuralVirada: string;
  structuralFechamento: string;
  defaultChapter: string;
}> = {
  Português: {
    aiNotice: 'AVISO DE IA: Este conteúdo foi estrategicamente desenvolvido com apoio de inteligência artificial, com supervisão humana para garantir clareza, coerência e integridade editorial.',
    introFallback: 'Neste vídeo eu mostro como a sobrecarga silenciosa se instala, por que ela parece produtividade por tanto tempo e quais ajustes práticos ajudam a recuperar clareza, energia e consistência.',
    templates: [
      { regex: /\b(notifica|aba|slack|context switch|contexto|atencao|foco fragmentado)\b/i, label: 'O custo invisível da atenção fragmentada' },
      { regex: /\b(sono|exaust|cansac|burnout|desgaste|juros)\b/i, label: 'Os juros silenciosos do desgaste' },
      { regex: /\b(cerebro|thrott|clock|superaquec|sobrecarga|lento)\b/i, label: 'Quando o sistema começa a falhar' },
      { regex: /\b(arquitetura|kernel|base|prioridade|limite)\b/i, label: 'A base que precisa ser reorganizada' },
      { regex: /\b(regra|protocolo|rotina|checklist|manutenc|plano|commit)\b/i, label: 'O protocolo prático para retomar controle' },
      { regex: /\b(reconstruc|recuper|reboot|reinicio|itera|sustentavel)\b/i, label: 'Como manter o sistema estável a longo prazo' },
    ],
    structuralAbertura: 'Onde a perda de performance começa',
    structuralVirada: 'A virada que muda a leitura do problema',
    structuralFechamento: 'O fechamento prático para consolidar a mudança',
    defaultChapter: 'Ponto importante da jornada'
  },
  English: {
    aiNotice: 'AI NOTICE: This content was strategically developed with the support of artificial intelligence, under human supervision to ensure clarity, coherence, and editorial integrity.',
    introFallback: 'In this video, I explain how silent overload sets in, why it feels like productivity for so long, and what practical tweaks help restore clarity, energy, and consistency.',
    templates: [
      { regex: /\b(notific|tab|slack|context switch|attention|fragmented focus|focus)\b/i, label: 'The invisible cost of fragmented attention' },
      { regex: /\b(sleep|exhaust|fatigu|burnout|wear|silent tax)\b/i, label: 'The silent tax of burnout' },
      { regex: /\b(brain|thrott|clock|overheat|overload|slow)\b/i, label: 'When the system begins to fail' },
      { regex: /\b(architect|kernel|base|priorit|limit|boundary)\b/i, label: 'The foundation that needs reorganization' },
      { regex: /\b(rule|protocol|routin|checklist|mainten|plan|commit)\b/i, label: 'The practical protocol to regain control' },
      { regex: /\b(reconstruct|recov|reboot|restart|iterat|sustain)\b/i, label: 'How to keep the system stable in the long run' },
    ],
    structuralAbertura: 'Where the performance loss begins',
    structuralVirada: 'The shift that changes the reading of the problem',
    structuralFechamento: 'The practical wrap-up to consolidate the change',
    defaultChapter: 'Important point in the journey'
  },
  Español: {
    aiNotice: 'AVISO DE IA: Este contenido fue desarrollado estratégicamente con el apoyo de inteligencia artificial, bajo supervisión humana para garantizar claridad, coherencia e integridad editorial.',
    introFallback: 'En este video muestro cómo se instala la sobrecarga silenciosa, por qué parece productividad durante tanto tiempo e cuáles ajustes prácticos ayudan a recuperar claridad, energía y consistencia.',
    templates: [
      { regex: /\b(notific|pestana|slack|context switch|atencion|enfoque fragmentado|foco)\b/i, label: 'El costo invisible de la atención fragmentada' },
      { regex: /\b(sueno|agotamiento|fatiga|burnout|desgaste|interes silencioso)\b/i, label: 'El interés silencioso del desgaste' },
      { regex: /\b(cerebro|thrott|reloj|sobrecalent|sobrecarga|lento)\b/i, label: 'Cuando el sistema comienza a fallar' },
      { regex: /\b(arquitect|kernel|base|prioridad|limite)\b/i, label: 'La base que necesita reorganizarse' },
      { regex: /\b(regla|protocolo|rutina|checklist|manten|plan|commit)\b/i, label: 'El protocolo práctico para retomar el control' },
      { regex: /\b(reconstruc|recuper|reboot|reinicio|iterac|sostenible)\b/i, label: 'Cómo mantener el sistema estable a largo plazo' },
    ],
    structuralAbertura: 'Donde comienza la pérdida de rendimiento',
    structuralVirada: 'El giro que cambia la lectura del problema',
    structuralFechamento: 'El cierre práctico para consolidar el cambio',
    defaultChapter: 'Punto importante del camino'
  }
};

const getLanguageAssets = (lang?: string) => {
  const l = (lang || 'Português').trim();
  if (l === 'English') return LANGUAGE_ASSETS.English;
  if (l === 'Español' || l === 'Spanish') return LANGUAGE_ASSETS.Español;
  return LANGUAGE_ASSETS.Português;
};

const SUNO_PROMPT_MAX_CHARS = 800;

const toSeconds = (value: string) => {
  const trimmed = String(value || '').trim();
  if (!trimmed) return 0;
  const parts = trimmed.split(':').map((part) => Number(part));
  if (parts.some((part) => Number.isNaN(part))) return 0;

  if (parts.length === 3) {
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  }

  if (parts.length === 2) {
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  }

  return Number(parts[0]) || 0;
};

export const parseEstimatedDurationSeconds = (value?: string | null) => {
  const raw = String(value || '').trim();
  if (!raw) return 0;

  const hourMatch = raw.match(/(\d+)\s*h/i);
  const minuteMatch = raw.match(/(\d+)\s*m(?:in)?/i) || raw.match(/(\d+)\s*min/i);
  const plainMinutesMatch = raw.match(/(\d+)\s*minutos?/i);

  if (hourMatch || minuteMatch || plainMinutesMatch) {
    const hours = Number(hourMatch?.[1] || 0);
    const minutes = Number(minuteMatch?.[1] || plainMinutesMatch?.[1] || 0);
    return hours * 3600 + minutes * 60;
  }

  return toSeconds(raw);
};

export const formatTimelineTimestamp = (seconds: number) => {
  const safe = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const remainingSeconds = safe % 60;

  if (hours > 0) {
    return [hours, minutes, remainingSeconds]
      .map((part) => String(part).padStart(2, '0'))
      .join(':');
  }

  return [minutes, remainingSeconds]
    .map((part) => String(part).padStart(2, '0'))
    .join(':');
};

const cleanPreview = (value: string) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const extractSfxExcerpt = (value: string, matchIndex: number = -1) => {
  const clean = cleanPreview(value);
  if (matchIndex === -1 || matchIndex >= clean.length) {
    const words = clean.split(/\s+/).slice(0, 12).join(' ').trim();
    return words.length < clean.length ? `${words}...` : words;
  }

  const windowSize = 60;
  let start = Math.max(0, matchIndex - windowSize);
  let end = Math.min(clean.length, matchIndex + windowSize);
  
  if (start > 0) {
    const spaceIdx = clean.indexOf(' ', start);
    if (spaceIdx !== -1 && spaceIdx < matchIndex) start = spaceIdx + 1;
  }
  if (end < clean.length) {
    const spaceIdx = clean.lastIndexOf(' ', end);
    if (spaceIdx !== -1 && spaceIdx > matchIndex) end = spaceIdx;
  }
  
  let excerpt = clean.slice(start, end).trim();
  if (start > 0) excerpt = `...${excerpt}`;
  if (end < clean.length) excerpt = `${excerpt}...`;
  
  return excerpt;
};

const cleanInlineLabelHuman = (value: string) =>
  cleanPreview(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const cleanMultiline = (value: string) =>
  String(value || '')
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const truncateSunoPrompt = (value: string): string => {
  if (value.length <= SUNO_PROMPT_MAX_CHARS) return value;
  const cut = value.lastIndexOf(' ', SUNO_PROMPT_MAX_CHARS);
  return value.slice(0, cut > 0 ? cut : SUNO_PROMPT_MAX_CHARS).trim();
};

const normalizeSfxEffectName = (value: string) => {
  const raw = cleanPreview(value);
  const normalized = raw
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const mappings: Array<{ regex: RegExp; label: string }> = [
    { regex: /\b(glitch|bug|erro|falha|digital)\b/, label: 'Digital Glitch' },
    { regex: /\b(rumble|grave|sub|baixo|tensao profunda)\b/, label: 'Low Rumble' },
    { regex: /\b(whoosh|swoosh|transicao|passagem|corte)\b/, label: 'Cinematic Whoosh' },
    { regex: /\b(riser|rise|crescendo|subida|tensao)\b/, label: 'Tension Riser' },
    { regex: /\b(hit|impact|impacto|metal|metalico|batida)\b/, label: 'Metallic Impact' },
    { regex: /\b(click|clique|keyboard|teclado|typing|digitacao)\b/, label: 'Keyboard Clicks' },
    { regex: /\b(notification|notificacao|ping|alert|alerta|beep)\b/, label: 'Notification Ping' },
    { regex: /\b(ambience|ambiencia|ambiente|room tone|silencio|pad)\b/, label: 'Ambient Room Tone' },
    { regex: /\b(pulse|pulso|bass|baixo)\b/, label: 'Sub Bass Pulse' },
    { regex: /\b(reverse|rewind|rollback)\b/, label: 'Reverse Whoosh' },
  ];

  for (const mapping of mappings) {
    if (mapping.regex.test(normalized)) return mapping.label;
  }

  if (/^[a-z0-9 /-]+$/i.test(raw) && raw.length <= 36) return raw;
  return 'Cinematic Accent Hit';
};

const normalizeSfxTimelineEffectNames = (value: string) =>
  cleanMultiline(value)
    .split('\n')
    .map((line) => {
      if (!line.trim().toUpperCase().startsWith('EFEITO:')) return line;
      const effect = line.split(':').slice(1).join(':').trim();
      return `EFEITO: ${normalizeSfxEffectName(effect)}`;
    })
    .join('\n');

const cleanInlineLabel = (value: string) =>
  cleanPreview(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/[“”"'`]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

const SFX_SEMANTIC_PATTERNS: Array<{ regex: RegExp; score: number; rationale: string }> = [
  // Tech/Dev niche (existing)
  { regex: /\b(crash|colapso|pane|quebra|quebrou|failure|break|broke|fallo|rompio)\b/gi, score: 5, rationale: 'momento de colapso ou falha' },
  { regex: /\b(sobrecarga|burnout|exaust|cansaco|esgotamento|overload|exhaust|fatigue|wear|tiredness|agotamiento)\b/gi, score: 5, rationale: 'trecho de desgaste ou pressao alta' },
  { regex: /\b(slap|glitch|erro|bug|falha|loop|error|failure|falla)\b/gi, score: 4, rationale: 'linguagem de falha ou disrupcao' },
  { regex: /\b(reconstrucao|recuperacao|reinicio|reboot|calma|controle|reconstruction|recovery|restart|calm|control|reconstruccion|recuperacion)\b/gi, score: 3, rationale: 'trecho de recuperacao ou estabilizacao' },
  // Universal Narrative / Hooks
  { regex: /\b(alerta|alarme|critico|urgente|atencao|cuidado|perigo|risco|alert|alarm|critical|urgent|attention|warning|danger|risk|alarma|critico|atencion|peligro|riesgo)\b/gi, score: 4, rationale: 'sinal de alerta ou urgencia' },
  { regex: /\b(virada|mudanca|decisao|aceitei|percebi|entendi|clareza|descobri|revelacao|shift|change|decision|accepted|realized|understood|clarity|discovered|revelation|cambio|decision|acepte|perci|entendi|claridad|descubri|revelacion)\b/gi, score: 4, rationale: 'virada ou realizacao importante' },
  { regex: /\b(foco|prioridade|disciplina|limite|regra|solucao|estrategia|metodo|passo|focus|priority|discipline|limit|boundary|rule|solution|strategy|method|step|prioridad|regla|solucion|estrategia|metodo|paso)\b/gi, score: 3, rationale: 'direcionamento pratico ou solucao' },
  { regex: /\b(surpresa|incrivel|chocante|inesperado|bizarro|absurdo|surprise|incredible|shocking|unexpected|bizarre|absurd|sorpresa|increible|chocante|inesperado)\b/gi, score: 4, rationale: 'momento de choque ou surpresa' },
  { regex: /\b(segredo|misterio|verdade|mentira|mito|oculto|escondido|secret|mystery|truth|lie|myth|hidden|secreto|misterio|verdad|mentira)\b/gi, score: 4, rationale: 'revelacao de segredo ou mito' },
  { regex: /\b(sucesso|conquista|vitoria|resultado|lucro|crescimento|aumento|esforco|success|achievement|victory|result|profit|growth|increase|effort|exito|victoria|logro|esfuerzo)\b/gi, score: 4, rationale: 'momento de conquista ou impacto' },
  { regex: /\b(dor|problema|dificuldade|obstaculo|barreira|medo|frustracao|crise|pain|problem|difficulty|obstacle|barrier|fear|frustration|crisis|dolor|obstaculo|miedo|frustracion|crisis)\b/gi, score: 4, rationale: 'ponto de dor ou obstaculo' },
];

export const buildScriptTranscript = (blocks: PostScriptScriptBlock[]) =>
  blocks
    .map((block, index) => {
      const content = cleanPreview(block.content);
      return `BLOCO ${index + 1} - ${block.title}\n${content}`;
    })
    .join('\n\n');

export const buildPostScriptTimelineContext = ({
  scriptBlocks,
  estimatedDuration,
  srtRows,
}: {
  scriptBlocks: PostScriptScriptBlock[];
  estimatedDuration?: string | null;
  srtRows?: Array<{ startTime?: string; endTime?: string }> | null;
}): PostScriptTimelineContext => {
  const lastSrtTime = Array.isArray(srtRows) && srtRows.length > 0
    ? String(srtRows[srtRows.length - 1]?.endTime || srtRows[srtRows.length - 1]?.startTime || '')
    : '';

  const srtSeconds = lastSrtTime ? toSeconds(lastSrtTime.replace(',', '.').split('.')[0]) : 0;
  if (srtSeconds > 0) {
    return { totalDurationSeconds: srtSeconds, source: 'srt' };
  }

  const estimatedDurationSeconds = parseEstimatedDurationSeconds(estimatedDuration);
  if (estimatedDurationSeconds > 0) {
    return { totalDurationSeconds: estimatedDurationSeconds, source: 'estimated' };
  }

  const totalChars = scriptBlocks.reduce((acc, block) => acc + cleanPreview(block.content).length, 0);
  const fallbackSeconds = Math.max(60, Math.round(totalChars / 17));
  return { totalDurationSeconds: fallbackSeconds, source: 'estimated' };
};

export const buildChapterAnchors = ({
  scriptBlocks,
  totalDurationSeconds,
  srtRows,
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
  srtRows?: Array<{ startTime?: string; endTime?: string; texto?: string }> | null;
}): PostScriptChapterAnchor[] => {
  if (!scriptBlocks.length) return [];

  const weights = scriptBlocks.map((block) => Math.max(1, cleanPreview(block.content).length));
  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  const cleanForMatch = (text: string) => String(text || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let lastMatchedRowIndex = 0;
  let accumulated = 0;

  return scriptBlocks.map((block, index) => {
    let timestampSeconds = 0;

    if (index === 0) {
      timestampSeconds = 0;
    } else {
      const targetRatio = accumulated / totalWeight;

      if (srtRows && srtRows.length > 0) {
        let matched = false;
        const blockStart = cleanForMatch(cleanPreview(block.content).slice(0, 80));
        
        if (blockStart.length > 10) {
          for (let i = lastMatchedRowIndex; i < srtRows.length; i++) {
            const rowClean = cleanForMatch(srtRows[i].texto || '');
            if (!rowClean) continue;
            
            if (
              (blockStart.length >= 15 && rowClean.length >= 15 && (blockStart.startsWith(rowClean.slice(0, 15)) || rowClean.startsWith(blockStart.slice(0, 15)))) ||
              (rowClean.length >= 25 && blockStart.includes(rowClean)) ||
              (blockStart.length >= 25 && rowClean.includes(blockStart))
            ) {
              timestampSeconds = toSeconds((srtRows[i].startTime || '').replace(',', '.').split('.')[0]);
              lastMatchedRowIndex = i;
              matched = true;
              break;
            }
          }
        }

        if (!matched) {
          const srtWeights = srtRows.map(row => Math.max(1, cleanPreview(row.texto || '').length));
          const totalSrtWeight = srtWeights.reduce((acc, w) => acc + w, 0);
          const targetSrtChars = targetRatio * totalSrtWeight;
        
          let currentSrtChars = 0;
          for (let i = 0; i < srtRows.length; i++) {
            currentSrtChars += srtWeights[i];
            if (currentSrtChars >= targetSrtChars) {
              timestampSeconds = toSeconds((srtRows[i].startTime || '').replace(',', '.').split('.')[0]);
              lastMatchedRowIndex = i;
              break;
            }
          }
        }
      } else {
        timestampSeconds = Math.round(targetRatio * Math.max(0, totalDurationSeconds - 1));
      }
    }

    accumulated += weights[index];

    return {
      index: index + 1,
      timestamp: formatTimelineTimestamp(timestampSeconds),
      originalTitle: String(block.title || `Bloco ${index + 1}`).trim(),
      preview: cleanPreview(block.content).slice(0, BLOCK_PREVIEW_LIMIT),
    };
  });
};

const determineSeoChapterCount = (totalDurationSeconds: number) => {
  if (totalDurationSeconds <= 8 * 60) return 4;
  if (totalDurationSeconds <= 14 * 60) return 5;
  if (totalDurationSeconds <= 20 * 60) return 6;
  return 7;
};

const parseAnchorSeconds = (timestamp: string) => toSeconds(timestamp);

const blockTimeMetadata = ({
  scriptBlocks,
  totalDurationSeconds,
  srtRows,
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
  srtRows?: Array<{ startTime?: string; endTime?: string; texto?: string }> | null;
}) => {
  const chapterAnchors = buildChapterAnchors({ scriptBlocks, totalDurationSeconds, srtRows });
  return scriptBlocks.map((block, index) => ({
    index,
    block,
    anchor: chapterAnchors[index],
    seconds: parseAnchorSeconds(chapterAnchors[index]?.timestamp || '00:00'),
    preview: cleanPreview(block.content).slice(0, BLOCK_PREVIEW_LIMIT),
  }));
};

const scoreSemanticCandidate = (text: string) => {
  let score = 0;
  const rationales = new Set<string>();
  let bestMatchIndex = -1;

  for (const pattern of SFX_SEMANTIC_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags.replace('g', '') + 'g');
    let match;
    while ((match = regex.exec(text)) !== null) {
      score += pattern.score;
      rationales.add(`${pattern.rationale} ("${match[0]}")`);
      if (bestMatchIndex === -1) bestMatchIndex = match.index;
    }
  }

  if (/[!?]/.test(text)) {
    score += 1;
    rationales.add('trecho com carga de impacto');
    if (bestMatchIndex === -1) bestMatchIndex = text.search(/[!?]/);
  }

  return {
    score,
    rationale: Array.from(rationales).join('; ') || 'trecho de impacto semantico',
    bestMatchIndex
  };
};

const canPlaceAnchor = (anchors: PostScriptSfxAnchor[], seconds: number, minSpacingSeconds: number) =>
  anchors.every((anchor) => Math.abs(anchor.seconds - seconds) >= minSpacingSeconds);

const canPlaceChapter = (anchors: PostScriptChapterAnchor[], seconds: number, minSpacingSeconds: number) =>
  anchors.every((anchor) => Math.abs(parseAnchorSeconds(anchor.timestamp) - seconds) >= minSpacingSeconds);

const extractSeoIntro = (value: string) => {
  const normalized = cleanMultiline(value);
  if (!normalized) return '';

  const lines = normalized.split('\n');
  const timestampIndex = lines.findIndex((line) => /^\d{2}:\d{2}(?::\d{2})?\s*[—-]\s+/.test(line.trim()));
  const noticeIndex = lines.findIndex((line) => line.trim().toUpperCase().startsWith('AVISO DE IA:'));
  const cutoff = [timestampIndex, noticeIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const introLines = lines.slice(0, cutoff ?? lines.length).filter((line) => line.trim());
  return cleanMultiline(introLines.join('\n'));
};

const humanizeSeoIntro = (value: string) => {
  const intro = extractSeoIntro(value)
    .replace(/\s*[“”"][^“”"]+[“”"]/g, (match) => match.replace(/[“”"]/g, ''))
    .replace(/\b(Neste video eu mostro como|Neste video voce vai ver como)\b/i, 'Neste video eu mostro')
    .replace(/\s+/g, ' ')
    .trim();

  if (!intro) {
    return 'Neste video eu mostro como a sobrecarga silenciosa se instala, por que ela parece produtividade por tanto tempo e quais ajustes praticos ajudam a recuperar clareza, energia e consistencia.';
  }

  return intro;
};

const deriveChapterLabel = (anchor: PostScriptChapterAnchor, isLast: boolean) => {
  const source = cleanInlineLabelHuman(`${anchor.preview} ${anchor.originalTitle}`).toLowerCase();

  const semanticTemplates: Array<{ regex: RegExp; label: string }> = [
    { regex: /\b(notifica|aba|slack|context switch|contexto|aten[cç][aã]o|foco fragmentado)\b/, label: 'O custo invisivel da atencao fragmentada' },
    { regex: /\b(sono|exaust|cansac|burnout|desgaste|juros)\b/, label: 'Os juros silenciosos do desgaste' },
    { regex: /\b(cerebro|thrott|clock|superaquec|sobrecarga|lento)\b/, label: 'Quando o sistema comeca a falhar' },
    { regex: /\b(arquitetura|kernel|base|prioridade|limite)\b/, label: 'A base que precisa ser reorganizada' },
    { regex: /\b(regra|protocolo|rotina|checklist|manutenc|plano|commit)\b/, label: 'O protocolo pratico para retomar controle' },
    { regex: /\b(reconstruc|recuper|reboot|reinicio|itera|sustentavel)\b/, label: 'Como manter o sistema estavel a longo prazo' },
  ];

  for (const template of semanticTemplates) {
    if (template.regex.test(source)) return template.label;
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'abertura') {
    return 'Onde a perda de performance comeca';
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'virada') {
    return 'A virada que muda a leitura do problema';
  }

  if (isLast || (anchor.layer === 'structural' && anchor.rationale === 'fechamento')) {
    return 'O fechamento pratico para consolidar a mudanca';
  }

  const candidate = cleanInlineLabelHuman(anchor.preview || anchor.originalTitle)
    .replace(/^[^A-Za-zÀ-ÿ0-9]+/, '')
    .replace(/^(eu|voce|neste video|agora|depois|aqui)\s+/i, '')
    .split(/[.!?]/)[0]
    .trim();

  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 8);
  const shortLabel = words.join(' ').trim();
  if (!shortLabel) return 'Ponto importante da jornada';

  return shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
};

const extractSeoIntroClean = (value: string) => {
  const normalized = cleanMultiline(value);
  if (!normalized) return '';

  const lines = normalized.split('\n');
  const timestampIndex = lines.findIndex((line) => /^\d{2}:\d{2}(?::\d{2})?\s*-\s+/.test(line.trim()));
  const noticeIndex = lines.findIndex((line) => line.trim().toUpperCase().startsWith('AVISO DE IA:'));
  const cutoff = [timestampIndex, noticeIndex].filter((index) => index >= 0).sort((a, b) => a - b)[0];
  const introLines = lines.slice(0, cutoff ?? lines.length).filter((line) => line.trim());
  return cleanMultiline(introLines.join('\n'));
};

const humanizeSeoIntroClean = (value: string) => {
  const intro = extractSeoIntroClean(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/^No (capitulo|bloco)\s+[^,]+,\s*/i, '')
    .replace(/\s*[“”"][^“”"]+[“”"]/g, (match) => match.replace(/[“”"]/g, ''))
    .replace(/\b(Neste video eu mostro como|Neste video voce vai ver como)\b/i, 'Neste video eu mostro')
    .replace(/\s+/g, ' ')
    .trim();

  if (!intro) {
    return 'Neste video eu mostro como a sobrecarga silenciosa se instala, por que ela parece produtividade por tanto tempo e quais ajustes praticos ajudam a recuperar clareza, energia e consistencia.';
  }

  return intro;
};

const deriveChapterLabelHuman = (anchor: PostScriptChapterAnchor, isLast: boolean) => {
  const source = cleanInlineLabel(`${anchor.preview} ${anchor.originalTitle}`).toLowerCase();

  const semanticTemplates: Array<{ regex: RegExp; label: string }> = [
    { regex: /\b(notifica|aba|slack|context switch|contexto|atencao|foco fragmentado)\b/, label: 'O custo invisivel da atencao fragmentada' },
    { regex: /\b(sono|exaust|cansac|burnout|desgaste|juros)\b/, label: 'Os juros silenciosos do desgaste' },
    { regex: /\b(cerebro|thrott|clock|superaquec|sobrecarga|lento)\b/, label: 'Quando o sistema comeca a falhar' },
    { regex: /\b(arquitetura|kernel|base|prioridade|limite)\b/, label: 'A base que precisa ser reorganizada' },
    { regex: /\b(regra|protocolo|rotina|checklist|manutenc|plano|commit)\b/, label: 'O protocolo pratico para retomar controle' },
    { regex: /\b(reconstruc|recuper|reboot|reinicio|itera|sustentavel)\b/, label: 'Como manter o sistema estavel a longo prazo' },
  ];

  for (const template of semanticTemplates) {
    if (template.regex.test(source)) return template.label;
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'abertura') {
    return 'Onde a perda de performance comeca';
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'virada') {
    return 'A virada que muda a leitura do problema';
  }

  if (isLast || (anchor.layer === 'structural' && anchor.rationale === 'fechamento')) {
    return 'O fechamento pratico para consolidar a mudanca';
  }

  const candidate = cleanInlineLabel(anchor.preview || anchor.originalTitle)
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^(eu|voce|neste video|agora|depois|aqui)\s+/i, '')
    .split(/[.!?]/)[0]
    .trim();

  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 8);
  const shortLabel = words.join(' ').trim();
  if (!shortLabel) return 'Ponto importante da jornada';

  return shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
};

const humanizeSeoIntroCustom = (value: string, fallback: string) => {
  const intro = extractSeoIntroClean(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/^No (capitulo|bloco)\s+[^,]+,\s*/i, '')
    .replace(/\s*[“”"][^“”"]+[“”"]/g, (match) => match.replace(/[“”"]/g, ''))
    .replace(/\b(Neste video eu mostro como|Neste video voce vai ver como|In this video I show|En este video muestro)\b/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!intro) return fallback;
  return intro;
};

const deriveChapterLabelCustom = (
  anchor: PostScriptChapterAnchor, 
  isLast: boolean, 
  assets: typeof LANGUAGE_ASSETS.Português
) => {
  const source = cleanInlineLabelHuman(`${anchor.preview} ${anchor.originalTitle}`).toLowerCase();

  for (const template of assets.templates) {
    if (template.regex.test(source)) return template.label;
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'abertura') {
    return assets.structuralAbertura;
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'virada') {
    return assets.structuralVirada;
  }

  if (isLast || (anchor.layer === 'structural' && anchor.rationale === 'fechamento')) {
    return assets.structuralFechamento;
  }

  const candidate = cleanInlineLabelHuman(anchor.preview || anchor.originalTitle)
    .replace(/^[^A-Za-z0-9]+/g, '')
    .replace(/^(eu|voce|neste video|agora|depois|aqui|i|you|now|after|here|nosotros|usted|en este video)\s+/i, '')
    .split(/[.!?]/)[0]
    .trim();

  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 8);
  const shortLabel = words.join(' ').trim();
  if (!shortLabel) return assets.defaultChapter;

  return shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
};

const buildSeoDescriptionFromPackage = (
  rawSeoDescription: string, 
  anchors: PostScriptChapterAnchor[], 
  channelLanguage?: string,
  sources?: string[]
) => {
  const intro = cleanMultiline(rawSeoDescription).trim();
  const cleanChapters = (anchors || []).map((anchor) => {
    const raw = (anchor.originalTitle || anchor.preview || 'Capítulo').trim();
    const clean = raw.replace(/^Bloco\s*\d+\s*[-—:]?\s*/i, '').trim();
    return `${anchor.timestamp} — ${clean}`;
  });

  const sections: string[] = [];

  if (intro) {
    sections.push(intro);
  }

  if (sources && sources.length > 0) {
    sections.push(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n📚 Fontes:\n' +
      sources.map((s, idx) => `[${idx + 1}] ${cleanPreview(s)}`).join('\n')
    );
  }

  if (cleanChapters.length > 0) {
    sections.push(
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n⏰ CAPÍTULOS & TIMESTAMPS DO VÍDEO:\n' +
      cleanChapters.join('\n')
    );
  }

  return sections.join('\n\n');
};

export const buildSeoChapterPlan = ({
  scriptBlocks,
  totalDurationSeconds,
  srtRows,
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
  srtRows?: Array<{ startTime?: string; endTime?: string; texto?: string }> | null;
}) => {
  const targetCount = determineSeoChapterCount(totalDurationSeconds);
  const minSpacingSeconds = Math.max(60, Math.round(totalDurationSeconds * 0.08));
  const timeline = blockTimeMetadata({ scriptBlocks, totalDurationSeconds, srtRows });
  const selected: PostScriptChapterAnchor[] = [];

  const addChapter = (input: {
    timestamp: string;
    seconds: number;
    index: number;
    originalTitle: string;
    preview: string;
    layer: 'structural' | 'semantic' | 'rhythmic';
    rationale: string;
  }) => {
    if (!canPlaceChapter(selected, input.seconds, minSpacingSeconds)) return false;
    selected.push({
      index: input.index,
      timestamp: input.timestamp,
      originalTitle: input.originalTitle,
      preview: input.preview,
      layer: input.layer,
      rationale: input.rationale,
    });
    selected.sort((a, b) => parseAnchorSeconds(a.timestamp) - parseAnchorSeconds(b.timestamp));
    return true;
  };

  const first = timeline[0];
  const turningPoint = timeline[Math.min(timeline.length - 1, Math.max(1, Math.floor((timeline.length - 1) * 0.55)))];
  const closing = timeline[Math.max(0, timeline.length - 1)];

  [first, turningPoint, closing].forEach((item, index) => {
    if (!item) return;
    addChapter({
      timestamp: item.anchor?.timestamp || formatTimelineTimestamp(item.seconds),
      seconds: item.seconds,
      index: item.index + 1,
      originalTitle: String(item.block.title || `Bloco ${item.index + 1}`).trim(),
      preview: item.preview,
      layer: 'structural',
      rationale:
        index === 0
          ? 'abertura'
          : index === 1
            ? 'virada'
            : 'fechamento',
    });
  });

  const semanticCandidates = timeline
    .map((item) => {
      const { score, rationale } = scoreSemanticCandidate(`${item.block.title} ${item.block.content}`);
      return { ...item, score, rationale };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.seconds - b.seconds);

  for (const item of semanticCandidates) {
    if (selected.length >= targetCount) break;
    addChapter({
      timestamp: item.anchor?.timestamp || formatTimelineTimestamp(item.seconds),
      seconds: item.seconds,
      index: item.index + 1,
      originalTitle: String(item.block.title || `Bloco ${item.index + 1}`).trim(),
      preview: item.preview,
      layer: 'semantic',
      rationale: item.rationale,
    });
  }

  const rhythmicSlots = Math.max(0, targetCount - selected.length);
  if (rhythmicSlots > 0) {
    const idealStep = totalDurationSeconds / (rhythmicSlots + 1);
    for (let slot = 1; slot <= rhythmicSlots; slot += 1) {
      const targetSeconds = Math.round(slot * idealStep);
      if (!canPlaceChapter(selected, targetSeconds, minSpacingSeconds)) continue;

      const closestItem = timeline.reduce((closest, item) => {
        if (!closest) return item;
        return Math.abs(item.seconds - targetSeconds) < Math.abs(closest.seconds - targetSeconds) ? item : closest;
      }, timeline[0]);

      const seconds = closestItem?.seconds ?? targetSeconds;
      if (!canPlaceChapter(selected, seconds, minSpacingSeconds)) continue;

      addChapter({
        timestamp: closestItem?.anchor?.timestamp || formatTimelineTimestamp(seconds),
        seconds,
        index: (closestItem?.index ?? slot) + 1,
        originalTitle: String(closestItem?.block.title || `Bloco ${(closestItem?.index ?? slot) + 1}`).trim(),
        preview: closestItem?.preview || '',
        layer: 'rhythmic',
        rationale: 'ponto de respiro e navegacao',
      });
    }
  }

  if (selected.length < targetCount) {
    for (const item of timeline) {
      if (selected.length >= targetCount) break;
      addChapter({
        timestamp: item.anchor?.timestamp || formatTimelineTimestamp(item.seconds),
        seconds: item.seconds,
        index: item.index + 1,
        originalTitle: String(item.block.title || `Bloco ${item.index + 1}`).trim(),
        preview: item.preview,
        layer: 'rhythmic',
        rationale: 'ponto complementar de navegacao editorial',
      });
    }
  }

  if (selected.length < Math.min(targetCount, timeline.length)) {
    const fallbackCount = Math.min(targetCount, timeline.length);
    const sampledIndexes =
      fallbackCount === 1
        ? [0]
        : Array.from({ length: fallbackCount }, (_, index) =>
            Math.round((index * (timeline.length - 1)) / (fallbackCount - 1))
          );

    for (const sampledIndex of sampledIndexes) {
      const item = timeline[sampledIndex];
      if (!item) continue;
      const alreadyIncluded = selected.some((anchor) => anchor.index === item.index + 1);
      if (alreadyIncluded) continue;
      selected.push({
        index: item.index + 1,
        timestamp: item.anchor?.timestamp || formatTimelineTimestamp(item.seconds),
        originalTitle: String(item.block.title || `Bloco ${item.index + 1}`).trim(),
        preview: item.preview,
        layer: 'rhythmic',
        rationale: 'ponto adicional de navegacao editorial',
      });
      if (selected.length >= fallbackCount) break;
    }
    selected.sort((a, b) => parseAnchorSeconds(a.timestamp) - parseAnchorSeconds(b.timestamp));
  }

  return {
    targetCount,
    minSpacingSeconds,
    anchors: selected.slice(0, targetCount),
  };
};

export const buildSfxAnchorPlan = ({
  scriptBlocks,
  totalDurationSeconds,
  minSpacingSeconds = 25,
  srtRows,
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
  minSpacingSeconds?: number;
  srtRows?: Array<{ startTime?: string; endTime?: string; texto?: string }> | null;
}) => {
  const targetCount = clamp(Math.round(totalDurationSeconds / 80) + 2, 6, 20);
  const timeline = blockTimeMetadata({ scriptBlocks, totalDurationSeconds, srtRows });
  const anchors: PostScriptSfxAnchor[] = [];

  const addAnchor = (anchor: PostScriptSfxAnchor) => {
    if (!canPlaceAnchor(anchors, anchor.seconds, minSpacingSeconds)) return false;
    anchors.push(anchor);
    anchors.sort((a, b) => a.seconds - b.seconds);
    return true;
  };

  const first = timeline[0];
  const turningPoint = timeline[Math.min(timeline.length - 1, Math.max(1, Math.floor((timeline.length - 1) * 0.55)))];
  const closing = timeline[Math.max(0, timeline.length - 1)];

  [first, turningPoint, closing].forEach((item, index) => {
    if (!item) return;
    const rationale =
      index === 0
        ? 'abertura da narrativa'
        : index === 1
          ? 'virada estrutural do roteiro'
          : 'fechamento e consolidacao final';

    addAnchor({
      timestamp: item.anchor?.timestamp || formatTimelineTimestamp(item.seconds),
      seconds: item.seconds,
      layer: 'structural',
      rationale,
      excerpt: extractSfxExcerpt(item.block?.content || ''),
    });
  });

  const semanticCandidates = timeline
    .map((item) => {
      const { score, rationale, bestMatchIndex } = scoreSemanticCandidate(`${item.block.title} ${item.block.content}`);
      let contentMatchIndex = -1;
      const titleLen = (item.block.title || '').length + 1;
      if (bestMatchIndex >= titleLen) {
        contentMatchIndex = bestMatchIndex - titleLen;
      } else if (bestMatchIndex !== -1) {
        contentMatchIndex = 0;
      }
      return {
        ...item,
        score,
        rationale,
        contentMatchIndex
      };
    })
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.seconds - b.seconds);

  for (const item of semanticCandidates) {
    if (anchors.length >= targetCount) break;
    addAnchor({
      timestamp: item.anchor?.timestamp || formatTimelineTimestamp(item.seconds),
      seconds: item.seconds,
      layer: 'semantic',
      rationale: item.rationale,
      excerpt: extractSfxExcerpt(item.block?.content || '', item.contentMatchIndex),
    });
  }

  const rhythmicSlotCount = Math.max(0, targetCount - anchors.length);
  if (rhythmicSlotCount > 0) {
    const idealStep = totalDurationSeconds / (rhythmicSlotCount + 1);
    for (let slot = 1; slot <= rhythmicSlotCount; slot += 1) {
      const targetSeconds = Math.round(slot * idealStep);
      if (!canPlaceAnchor(anchors, targetSeconds, minSpacingSeconds)) continue;

      const closestItem = timeline.reduce((closest, item) => {
        if (!closest) return item;
        return Math.abs(item.seconds - targetSeconds) < Math.abs(closest.seconds - targetSeconds) ? item : closest;
      }, timeline[0]);

      const seconds = closestItem?.seconds ?? targetSeconds;
      if (!canPlaceAnchor(anchors, seconds, minSpacingSeconds)) continue;

      addAnchor({
        timestamp: closestItem?.anchor?.timestamp || formatTimelineTimestamp(seconds),
        seconds,
        layer: 'rhythmic',
        rationale: 'espacamento ritmico para evitar longos trechos sem acento sonoro',
        excerpt: extractSfxExcerpt(closestItem?.block?.content || ''),
      });
    }
  }

  return {
    targetCount,
    minSpacingSeconds,
    anchors: anchors.slice(0, targetCount),
  };
};

export const sanitizePostScriptPackage = (
  raw: any | null | undefined,
  fallbackAnchors: PostScriptChapterAnchor[],
  timelineSource: 'srt' | 'estimated',
  channelLanguage?: string
): PostScriptPackage => {
  // Support up to 10-15 titles (A/B testing set)
  const titles: string[] = Array.from<string>(
    new Set(
      (Array.isArray(raw?.titles) ? raw?.titles : [])
        .map((title: any) => cleanPreview(String(title || '')))
        .filter(Boolean)
    )
  ).slice(0, 15);

  // Thumbnail copies: 3 punchy imperative options
  const thumbnailCopies: string[] = Array.from<string>(
    new Set(
      (Array.isArray(raw?.thumbnail_copies) ? raw?.thumbnail_copies : Array.isArray(raw?.thumbnailCopies) ? raw?.thumbnailCopies : [])
        .map((c: any) => cleanPreview(String(c || '')).toUpperCase())
        .filter(Boolean)
    )
  ).slice(0, 3);

  // Thumbnail JSONs: 3 structured art direction objects
  const rawJsons = Array.isArray(raw?.thumbnail_jsons) ? raw.thumbnail_jsons : Array.isArray(raw?.thumbnailJsons) ? raw.thumbnailJsons : [];
  const thumbnailJsons = rawJsons.slice(0, 3).map((item: any) => ({
    canvas: item?.canvas || { width: 1280, height: 720, aspect_ratio: '16:9' },
    background: item?.background || { style: 'photorealistic', prompt: 'Atmospheric scene background' },
    character: item?.character || { style: '2D comic illustration', action: 'Pointing with shock expression', expression: 'Shocked' },
    text_layers: Array.isArray(item?.text_layers) ? item.text_layers : [],
    indicators: Array.isArray(item?.indicators) ? item.indicators : [],
    badges: Array.isArray(item?.badges) ? item.badges : [],
    composition: item?.composition || 'Character on right, bold Anton text on left, indicator pointing to key detail',
    negative_dna: item?.negative_dna || 'speech, talking, mouth open, blurry, low resolution',
  }));

  // Sources section
  const sourcesSection: string[] = Array.from<string>(
    new Set(
      (Array.isArray(raw?.sourcesSection) ? raw?.sourcesSection : Array.isArray(raw?.sources_section) ? raw?.sources_section : Array.isArray(raw?.sources) ? raw?.sources : [])
        .map((s: any) => cleanPreview(String(s || '')))
        .filter(Boolean)
    )
  ).slice(0, 5);

  // Pinned comment & SEO Tags
  const pinnedComment = cleanPreview(String(raw?.pinnedComment || raw?.pinned_comment || ''));
  const seoTags: string[] = Array.from<string>(
    new Set(
      (Array.isArray(raw?.seoTags) ? raw?.seoTags : Array.isArray(raw?.seo_tags) ? raw?.seo_tags : Array.isArray(raw?.tags) ? raw?.tags : [])
        .map((t: any) => cleanPreview(String(t || '')))
        .filter(Boolean)
    )
  ).slice(0, 20);

  const finalChapterAnchors = Array.isArray(raw?.chapterAnchors) && raw.chapterAnchors.length > 0 ? raw.chapterAnchors : fallbackAnchors;

  return {
    titles,
    thumbnailCopies: thumbnailCopies.length > 0 ? thumbnailCopies : undefined,
    thumbnailJsons: thumbnailJsons.length > 0 ? thumbnailJsons : undefined,
    seoDescription: buildSeoDescriptionFromPackage(
      String(raw?.seoDescription || ''),
      finalChapterAnchors,
      channelLanguage,
      sourcesSection
    ),
    sourcesSection: sourcesSection.length > 0 ? sourcesSection : undefined,
    pinnedComment: pinnedComment || undefined,
    seoTags: seoTags.length > 0 ? seoTags : undefined,
    sunoPrompt: truncateSunoPrompt(cleanMultiline(String(raw?.sunoPrompt || ''))),
    sunoSuggestedTitle: cleanPreview(String(raw?.sunoSuggestedTitle || '')),
    sfxTimelineTxt: normalizeSfxTimelineEffectNames(String(raw?.sfxTimelineTxt || '')),
    hfContextTitles: Array.isArray(raw?.hfContextTitles) ? raw.hfContextTitles : [],
    chapterAnchors: finalChapterAnchors,
    timelineSource,
    generatedAt: String(raw?.generatedAt || new Date().toISOString()),
  };
};
