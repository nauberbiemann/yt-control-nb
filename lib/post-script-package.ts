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

export interface PostScriptPackage {
  titles: string[];
  seoDescription: string;
  sunoPrompt: string;
  sunoSuggestedTitle?: string;
  sfxTimelineTxt: string;
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
const FIXED_AI_NOTICE =
  'AVISO DE IA: Este conteúdo foi estrategicamente desenvolvido com apoio de inteligência artificial, com supervisão humana para garantir clareza, coerência e integridade editorial.';

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

const extractSfxExcerpt = (value: string) => {
  const clean = cleanPreview(value);
  const words = clean.split(/\s+/).slice(0, 12).join(' ').trim();
  return words.length < clean.length ? `${words}...` : words;
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
  { regex: /\b(crash|colapso|pane|quebra|quebrou)\b/gi, score: 5, rationale: 'momento de colapso ou falha' },
  { regex: /\b(alerta|alarme|critico|critica|urgente)\b/gi, score: 4, rationale: 'sinal de alerta ou urgencia' },
  { regex: /\b(virada|mudanca|decisao|aceitei|percebi|entendi|clareza)\b/gi, score: 4, rationale: 'virada ou realizacao importante' },
  { regex: /\b(sobrecarga|burnout|exaust|cansaco|esgotamento)\b/gi, score: 5, rationale: 'trecho de desgaste ou pressao alta' },
  { regex: /\b(foco|prioridade|disciplina|limite|protocolo|regra)\b/gi, score: 3, rationale: 'trecho de direcionamento pratico' },
  { regex: /\b(slap|glitch|erro|bug|falha|loop)\b/gi, score: 4, rationale: 'linguagem de falha ou disrupcao' },
  { regex: /\b(reconstrucao|recuperacao|reinicio|reboot|calma|controle)\b/gi, score: 3, rationale: 'trecho de recuperacao ou estabilizacao' },
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
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
}): PostScriptChapterAnchor[] => {
  if (!scriptBlocks.length) return [];

  const weights = scriptBlocks.map((block) => Math.max(1, cleanPreview(block.content).length));
  const totalWeight = weights.reduce((acc, weight) => acc + weight, 0);
  let accumulated = 0;

  return scriptBlocks.map((block, index) => {
    const timestamp = index === 0
      ? 0
      : Math.round((accumulated / totalWeight) * Math.max(0, totalDurationSeconds - 1));

    accumulated += weights[index];

    return {
      index: index + 1,
      timestamp: formatTimelineTimestamp(timestamp),
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
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
}) => {
  const chapterAnchors = buildChapterAnchors({ scriptBlocks, totalDurationSeconds });
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

  for (const pattern of SFX_SEMANTIC_PATTERNS) {
    const matches = text.match(pattern.regex);
    if (!matches?.length) continue;
    score += pattern.score * matches.length;
    rationales.add(pattern.rationale);
  }

  if (/[!?]/.test(text)) {
    score += 1;
    rationales.add('trecho com carga de impacto');
  }

  return {
    score,
    rationale: Array.from(rationales).join(', ') || 'trecho de impacto semantico',
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
    .replace(/\s*["“”][^"“”]+["“”]/g, (match) => match.replace(/["“”]/g, ''))
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
    .replace(/\s*["“”][^"“”]+["“”]/g, (match) => match.replace(/["“”]/g, ''))
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

const humanizeSeoIntroPtBr = (value: string) => {
  const intro = extractSeoIntroClean(value)
    .replace(/\[[^\]]+\]/g, ' ')
    .replace(/^No (capitulo|bloco)\s+[^,]+,\s*/i, '')
    .replace(/\s*["“”][^"“”]+["“”]/g, (match) => match.replace(/["“”]/g, ''))
    .replace(/\b(Neste video eu mostro como|Neste video voce vai ver como)\b/i, 'Neste vídeo eu mostro')
    .replace(/\s+/g, ' ')
    .trim();

  if (!intro) {
    return 'Neste vídeo eu mostro como a sobrecarga silenciosa se instala, por que ela parece produtividade por tanto tempo e quais ajustes práticos ajudam a recuperar clareza, energia e consistência.';
  }

  return intro;
};

const deriveChapterLabelPtBr = (anchor: PostScriptChapterAnchor, isLast: boolean) => {
  const source = cleanInlineLabelHuman(`${anchor.preview} ${anchor.originalTitle}`).toLowerCase();

  const semanticTemplates: Array<{ regex: RegExp; label: string }> = [
    { regex: /\b(notifica|aba|slack|context switch|contexto|atencao|foco fragmentado)\b/, label: 'O custo invisível da atenção fragmentada' },
    { regex: /\b(sono|exaust|cansac|burnout|desgaste|juros)\b/, label: 'Os juros silenciosos do desgaste' },
    { regex: /\b(cerebro|thrott|clock|superaquec|sobrecarga|lento)\b/, label: 'Quando o sistema começa a falhar' },
    { regex: /\b(arquitetura|kernel|base|prioridade|limite)\b/, label: 'A base que precisa ser reorganizada' },
    { regex: /\b(regra|protocolo|rotina|checklist|manutenc|plano|commit)\b/, label: 'O protocolo prático para retomar controle' },
    { regex: /\b(reconstruc|recuper|reboot|reinicio|itera|sustentavel)\b/, label: 'Como manter o sistema estável a longo prazo' },
  ];

  for (const template of semanticTemplates) {
    if (template.regex.test(source)) return template.label;
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'abertura') {
    return 'Onde a perda de performance começa';
  }

  if (anchor.layer === 'structural' && anchor.rationale === 'virada') {
    return 'A virada que muda a leitura do problema';
  }

  if (isLast || (anchor.layer === 'structural' && anchor.rationale === 'fechamento')) {
    return 'O fechamento prático para consolidar a mudança';
  }

  const candidate = cleanInlineLabelHuman(anchor.preview || anchor.originalTitle)
    .replace(/^[^A-Za-z0-9]+/, '')
    .replace(/^(eu|voce|neste video|agora|depois|aqui)\s+/i, '')
    .split(/[.!?]/)[0]
    .trim();

  const words = candidate.split(/\s+/).filter(Boolean).slice(0, 8);
  const shortLabel = words.join(' ').trim();
  if (!shortLabel) return 'Ponto importante da jornada';

  return shortLabel.charAt(0).toUpperCase() + shortLabel.slice(1);
};

const buildSeoDescriptionFromPackage = (rawSeoDescription: string, anchors: PostScriptChapterAnchor[]) => {
  const intro = humanizeSeoIntroPtBr(rawSeoDescription);
  const chapterLines = anchors.map((anchor, index) => `${anchor.timestamp} - ${deriveChapterLabelPtBr(anchor, index === anchors.length - 1)}`);
  return [intro, '', ...chapterLines, '', FIXED_AI_NOTICE].filter(Boolean).join('\n');
};

export const buildSeoChapterPlan = ({
  scriptBlocks,
  totalDurationSeconds,
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
}) => {
  const targetCount = determineSeoChapterCount(totalDurationSeconds);
  const minSpacingSeconds = Math.max(60, Math.round(totalDurationSeconds * 0.08));
  const timeline = blockTimeMetadata({ scriptBlocks, totalDurationSeconds });
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
}: {
  scriptBlocks: PostScriptScriptBlock[];
  totalDurationSeconds: number;
  minSpacingSeconds?: number;
}) => {
  const targetCount = clamp(Math.round(totalDurationSeconds / 80) + 2, 6, 20);
  const timeline = blockTimeMetadata({ scriptBlocks, totalDurationSeconds });
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
      const { score, rationale } = scoreSemanticCandidate(`${item.block.title} ${item.block.content}`);
      return {
        ...item,
        score,
        rationale,
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
      excerpt: extractSfxExcerpt(item.block?.content || ''),
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
  raw: Partial<PostScriptPackage> | null | undefined,
  fallbackAnchors: PostScriptChapterAnchor[],
  timelineSource: 'srt' | 'estimated'
): PostScriptPackage => {
  const titles = Array.from(
    new Set(
      (Array.isArray(raw?.titles) ? raw?.titles : [])
        .map((title) => cleanPreview(String(title || '')))
        .filter(Boolean)
    )
  ).slice(0, 5);

  return {
    titles,
    seoDescription: buildSeoDescriptionFromPackage(String(raw?.seoDescription || ''), Array.isArray(raw?.chapterAnchors) && raw.chapterAnchors.length > 0 ? raw.chapterAnchors : fallbackAnchors),
    sunoPrompt: cleanMultiline(String(raw?.sunoPrompt || '')),
    sunoSuggestedTitle: cleanPreview(String(raw?.sunoSuggestedTitle || '')),
    sfxTimelineTxt: normalizeSfxTimelineEffectNames(String(raw?.sfxTimelineTxt || '')),
    chapterAnchors: Array.isArray(raw?.chapterAnchors) && raw.chapterAnchors.length > 0 ? raw.chapterAnchors : fallbackAnchors,
    timelineSource,
    generatedAt: String(raw?.generatedAt || new Date().toISOString()),
  };
};
