export interface ThumbnailRef {
  id: string;
  title: string;
  image_url?: string;
  text_overlay?: string; // Texto curto da thumb (ex: "ELES SABIAM")
  visual_elements?: string; // Elementos focais (ex: "Rosto com expressão de choque + seta vermelha")
  color_palette?: string; // Ex: "Amarelo e Preto no fundo escuro"
  ai_prompt?: string; // Prompt Midjourney/FLUX
  created_at?: string;
}

export interface ViralScriptRef {
  id: string;
  title: string;
  url?: string;
  script_text: string; // Roteiro completo / Transcrição SALVO NO BANCO
  dna_summary?: {
    opening_hook?: string;
    tone?: string;
    tension_peaks?: number;
    vocabulary?: string[];
  };
  word_count?: number;
  created_at?: string;
}

export interface ReferenceChannel {
  id: string;
  name: string; // Ex: "Origin Decoder"
  url?: string; // Ex: "https://youtube.com/@originedecoder"
  niche_angle?: string; // Ex: "Lente do DNA / Ciência Sagrada"
  truth_arbiter?: string; // Ex: "Estudos Científicos e Genética"
  notes?: string;
  viral_scripts: ViralScriptRef[];
  thumbnail_refs: ThumbnailRef[];
  created_at?: string;
}

export interface ChannelDnaConfig {
  raw_markdown?: string;
  loaded_files?: string[];
  style_dna?: string;
  character_dna?: string;
  extras_dna?: string;
  negative_dna?: string;
  narrator_archetype?: string;
  editorial_angle?: string;
  metaphors?: string[];
  thumb_rules?: string;
  color_palette_hex?: string[];
  typography?: string;
  narrative_patterns?: Array<{
    name: string;
    tag: string;
    description?: string;
    core_pattern: string;
  }>;
}

/**
 * Helper para extrair Prompts DNA, Canais de Referência e dados estruturados de 1 ou mais arquivos Markdown (.md)
 */
export function parseChannelMarkdown(markdown: string) {
  if (!markdown || !markdown.trim()) return null;

  const result: {
    name?: string;
    puc?: string;
    passion?: string;
    skill?: string;
    demand?: string;
    persona_demographics?: string;
    persona_pain?: string;
    persona_language?: string;
    persona_transformation?: string;
    editorial_pillars?: string[];
    metaphors?: string[];
    thumb_rules?: string;
    style_dna?: string;
    character_dna?: string;
    extras_dna?: string;
    negative_dna?: string;
    atmosphere?: string;
    narrator_identity?: string;
    positioning_angle?: string;
    content_boundaries?: string;
    prohibited_terms?: string;
    cut_rhythm?: string;
    zoom_style?: string;
    soundtrack?: string;
    duration_min?: number;
    duration_max?: number;
    blocks_min?: number;
    blocks_max?: number;
    measurement_focus?: string;
    t1_value?: string;
    t2_value?: string;
    t3_value?: string;
    extracted_channels?: ReferenceChannel[];
    narrative_patterns?: Array<{ name: string; tag: string; description?: string; core_pattern: string }>;
  } = {};

  // Extrair Nome do Projeto
  const nameMatch = markdown.match(/Nome de Destaque da Instância:\s*`([^`]+)`/i) 
    || markdown.match(/Canal do Usuário:\s*\[?([^\]\n]+)\]?/i)
    || markdown.match(/#\s*([^—\n]+)/);
  if (nameMatch) result.name = nameMatch[1].replace(/^[\d.✈️📊\s]+/, '').trim();

  const cleanMarkdownText = (text: string) => {
    if (!text) return '';
    return text.replace(/^[\s*#>:-]+/, '').replace(/[\s*#>-]+$/, '').trim();
  };

  // Extrair PUC
  const pucMatch = markdown.match(/Proposta Única do Canal.*?\n>\s*\*?(.*?)\*?\n/i) || markdown.match(/PUC:\s*(.*)/i);
  if (pucMatch) result.puc = cleanMarkdownText(pucMatch[1]);

  // Extrair Passion, Skill, Demand
  const passionMatch = markdown.match(/PASSION:\s*(.*)/i) || markdown.match(/PASSION \(.*?\):\s*(.*)/i);
  if (passionMatch) result.passion = cleanMarkdownText(passionMatch[1]);

  const skillMatch = markdown.match(/SKILL:\s*(.*)/i) || markdown.match(/SKILL \(.*?\):\s*(.*)/i);
  if (skillMatch) result.skill = cleanMarkdownText(skillMatch[1]);

  const demandMatch = markdown.match(/DEMAND:\s*(.*)/i) || markdown.match(/DEMAND \(.*?\):\s*(.*)/i);
  if (demandMatch) result.demand = cleanMarkdownText(demandMatch[1]);

  // Extrair dados da Persona
  const demoMatch = markdown.match(/Lifestyle \/ Demografia:\s*(.*)/i) || markdown.match(/Demografia:\s*(.*)/i);
  if (demoMatch) result.persona_demographics = cleanMarkdownText(demoMatch[1]);

  const painMatch = markdown.match(/Ponto de Dor Central:\s*(.*)/i) || markdown.match(/Dor Central:\s*(.*)/i);
  if (painMatch) result.persona_pain = cleanMarkdownText(painMatch[1]);

  const langMatch = markdown.match(/Linguagem e Repertório:\s*(.*)/i) || markdown.match(/Linguagem:\s*(.*)/i);
  if (langMatch) result.persona_language = cleanMarkdownText(langMatch[1]);

  const transMatch = markdown.match(/Transformação Desejada:\s*(.*)/i) || markdown.match(/Transformação:\s*(.*)/i);
  if (transMatch) result.persona_transformation = cleanMarkdownText(transMatch[1]);

  // Extrair Prompts DNA
  const styleMatch = markdown.match(/STYLE_DNA:\s*([^\n\r]+)/i);
  if (styleMatch) result.style_dna = styleMatch[1].trim();

  const charMatch = markdown.match(/CHARACTER_DNA:\s*([^\n\r]+)/i);
  if (charMatch) result.character_dna = charMatch[1].trim();

  const extrasMatch = markdown.match(/EXTRAS_DNA:\s*([^\n\r]+)/i);
  if (extrasMatch) result.extras_dna = extrasMatch[1].trim();

  const negMatch = markdown.match(/NEGATIVE_DNA:\s*([^\n\r]+)/i);
  if (negMatch) result.negative_dna = negMatch[1].trim();

  // Extrair Metáforas
  const metaphorsSection = markdown.match(/Metáforas Proprietárias[\s\S]*?(?=\n##|\n###|$)/i);
  if (metaphorsSection) {
    const list = metaphorsSection[0].split('\n')
      .map(line => line.replace(/^[\d.*-]+\s*/, '').trim())
      .filter(line => line && !line.toLowerCase().includes('metáforas'));
    result.metaphors = list;
  }

  // Extrair Pilares Editoriais
  const pillarsSection = markdown.match(/Linha Editorial[\s\S]*?(?=\n##|\n###|$)/i) 
    || markdown.match(/Pilares Editoriais[\s\S]*?(?=\n##|\n###|$)/i);
  if (pillarsSection) {
    const list = pillarsSection[0].split('\n')
      .map(line => line.replace(/^[\d.*-]+\s*/, '').replace(/`/g, '').trim())
      .filter(line => line && !line.toLowerCase().includes('pilares') && !line.toLowerCase().includes('linha editorial'));
    result.editorial_pillars = list.slice(0, 5);
  }

  // Extrair Regras de Thumbnails
  const thumbSection = markdown.match(/Regras de Consistência Visual[\s\S]*?(?=\n##|\n###|$)/i);
  if (thumbSection) {
    result.thumb_rules = thumbSection[0].trim();
  }

  // Atmosfera e Narrador
  const atmosMatch = markdown.match(/Atmosfera Narrativa[\s\S]*?Seleção:\*\*\s*`?([^`\r\n]+)`?/i);
  if (atmosMatch) result.atmosphere = cleanMarkdownText(atmosMatch[1]);

  const narratorMatch = markdown.match(/Identidade do Narrador\s*[\r\n]+>\s*(.*)/i);
  if (narratorMatch) result.narrator_identity = cleanMarkdownText(narratorMatch[1]);

  // Ângulo Editorial
  const angleMatch = markdown.match(/Ângulo Editorial\s*[\r\n]+>\s*(.*)/i);
  if (angleMatch) result.positioning_angle = cleanMarkdownText(angleMatch[1]);

  // Fronteiras de Conteúdo
  const boundariesSection = markdown.match(/Fronteiras de Conteúdo[\s\S]*?(?=\n##|\n###|$)/i);
  if (boundariesSection) {
    result.content_boundaries = cleanMarkdownText(boundariesSection[0].replace(/Fronteiras de Conteúdo/i, ''));
  }

  // Termos Proibidos
  const prohibitedSection = markdown.match(/Termos Proibidos[\s\S]*?(?=\n##|\n###|$)/i);
  if (prohibitedSection) {
    const backticks = prohibitedSection[0].match(/`([^`]+)`/g);
    if (backticks) {
      result.prohibited_terms = backticks.map(t => t.replace(/`/g, '')).join(', ');
    } else {
      result.prohibited_terms = cleanMarkdownText(prohibitedSection[0].replace(/Termos Proibidos/i, ''));
    }
  }

  // SOP Parâmetros Técnicos
  const cutMatch = markdown.match(/Ritmo de Corte:\*\*?\s*`?([^`\r\n\s(]+)`?/i);
  if (cutMatch) result.cut_rhythm = cleanMarkdownText(cutMatch[1]);

  const zoomMatch = markdown.match(/Estilo de Zoom:\*\*?\s*`?([^`\r\n\s(]+)`?/i);
  if (zoomMatch) result.zoom_style = cleanMarkdownText(zoomMatch[1]);

  const soundtrackMatch = markdown.match(/Trilha Sonora:\*\*?\s*`?([^`\r\n\s(]+)`?/i);
  if (soundtrackMatch) result.soundtrack = cleanMarkdownText(soundtrackMatch[1]);

  // Controle de Range
  const durMinMatch = markdown.match(/Duração Mínima:\s*(\d+)/i);
  if (durMinMatch) result.duration_min = parseInt(durMinMatch[1], 10);

  const durMaxMatch = markdown.match(/Duração Máxima:\s*(\d+)/i);
  if (durMaxMatch) result.duration_max = parseInt(durMaxMatch[1], 10);

  const blocksMinMatch = markdown.match(/Mínimo de Blocos:\s*(\d+)/i);
  if (blocksMinMatch) result.blocks_min = parseInt(blocksMinMatch[1], 10);

  const blocksMaxMatch = markdown.match(/Máximo de Blocos:\s*(\d+)/i);
  if (blocksMaxMatch) result.blocks_max = parseInt(blocksMaxMatch[1], 10);

  // Foco de Análise
  const focusMatch = markdown.match(/Foco de Análise e Revisão\s*[\r\n]+>\s*(.*)/i);
  if (focusMatch) result.measurement_focus = cleanMarkdownText(focusMatch[1]);

  // Jornada Tática
  const t1Match = markdown.match(/T1 — Topo de Funil.*?\*\*?\s*(.*)/i);
  if (t1Match) result.t1_value = cleanMarkdownText(t1Match[1]);

  const t2Match = markdown.match(/T2 — Meio de Funil.*?\*\*?\s*(.*)/i);
  if (t2Match) result.t2_value = cleanMarkdownText(t2Match[1]);

  const t3Match = markdown.match(/T3 — Fundo de Funil.*?\*\*?\s*(.*)/i);
  if (t3Match) result.t3_value = cleanMarkdownText(t3Match[1]);

  // Extrair Canais de Referência presentes no Markdown (ex: do arquivo A1_lente_unica_radar_explicado.md)
  const extractedRefChannels: ReferenceChannel[] = [];
  const channelBlockMatches = markdown.split(/###\s*(?:[^\n]*?)/gi).slice(1);
  for (const block of channelBlockMatches) {
    const urlMatch = block.match(/URL:\s*\*?\[?(.*?)\]?\((.*?)\)/i) || block.match(/URL:\s*(https?:\/\/[^\s]+)/i);
    const focoMatch = block.match(/Foco:\s*(.*)/i) || block.match(/O que modelar:\s*(.*)/i);
    const nameLine = block.split('\n')[0]?.trim();

    if (urlMatch && nameLine) {
      const cleanName = nameLine.replace(/@\w+/g, '').replace(/^[\d.🇧🇷🌎\s]+/, '').split('—')[0]?.trim();
      const url = urlMatch[2] || urlMatch[1];
      const focus = focoMatch ? focoMatch[1].trim() : '';

      if (cleanName && url) {
        extractedRefChannels.push({
          id: 'ref_' + Date.now() + '_' + Math.random().toString(36).substr(2, 4),
          name: cleanName,
          url: url.startsWith('http') ? url : `https://${url}`,
          niche_angle: focus,
          notes: focus,
          viral_scripts: [],
          thumbnail_refs: [],
          created_at: new Date().toISOString()
        });
      }
    }
  }

  if (extractedRefChannels.length > 0) {
    result.extracted_channels = extractedRefChannels;
  }

  // Extrair Patterns Narrativos
  const patterns: Array<{ name: string; tag: string; description?: string; core_pattern: string }> = [];
  const patternBlocks = markdown.split(/Nome do Pattern:\s*/i).slice(1);
  for (const block of patternBlocks) {
    const lines = block.split('\n');
    const name = lines[0]?.trim() || '';
    const tagMatch = block.match(/Tag Interna:\s*(.*)/i);
    const descMatch = block.match(/Descrição Tática:\s*(.*)/i);
    const coreMatch = block.match(/Core Pattern:\s*(.*)/i);

    if (name && coreMatch) {
      patterns.push({
        name,
        tag: tagMatch ? tagMatch[1].trim() : 'PATTERN',
        description: descMatch ? descMatch[1].trim() : '',
        core_pattern: coreMatch[1].trim(),
      });
    }
  }

  if (patterns.length > 0) {
    result.narrative_patterns = patterns;
  }

  return result;
}
