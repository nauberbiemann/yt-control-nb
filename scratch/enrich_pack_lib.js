const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '../lib/pack-ganha-tempo.ts');
let content = fs.readFileSync(filePath, 'utf-8');

const additionalCode = `
export interface CuratedAssetIntervention {
  id: number;
  rowNumber: number;
  timeRange: string;
  sceneExcerpt: string;
  interventionType: 'SFX' | 'Overlay' | 'Chroma Key' | 'Gráfico / Alerta' | 'Transição' | 'Meme' | 'Ícone 3D';
  editorialPurpose: string;
  asset: PackAssetItem;
  editingGuideline: string;
}

export interface CuratedProjectStyleKit {
  masterLut: PackAssetItem;
  primaryFont: PackAssetItem;
  secondaryFont: PackAssetItem;
  baseOverlay: PackAssetItem;
}

export interface CuratedAssetPlan {
  themeTitle: string;
  videoFormat: string;
  totalDuration: string;
  styleKit: CuratedProjectStyleKit;
  interventions: CuratedAssetIntervention[];
}

/**
 * Cria um plano pontual e inteligente de enriquecimento de edição usando o Pack Ganha Tempo
 */
export function buildCuratedAssetEnrichmentPlan(
  rows: any[] = [],
  videoFormat: string = 'faceless',
  themeTitle: string = 'Roteiro de Vídeo',
  projectPuc?: string
): CuratedAssetPlan {
  const totalDuration = rows[rows.length - 1]?.endTime || '00:00:00';

  // 1. Style Kit
  const findItemByName = (name: string, fallbackCat: string): PackAssetItem => {
    const found = PACK_GANHA_TEMPO_ITEMS.find((i) => i.name.toLowerCase() === name.toLowerCase());
    if (found) return found;
    return (
      PACK_GANHA_TEMPO_ITEMS.find((i) => i.category.toLowerCase().includes(fallbackCat.toLowerCase())) ||
      PACK_GANHA_TEMPO_ITEMS[0]
    );
  };

  const isCinematic = videoFormat === 'avatar_flow' || (projectPuc || '').toLowerCase().includes('cinema');
  const styleKit: CuratedProjectStyleKit = {
    masterLut: isCinematic
      ? findItemByName('Teal & Orange 01.cube', 'LUTs')
      : findItemByName('clean_youtube_strong.cube', 'LUTs'),
    primaryFont: findItemByName('Montserrat-Bold.ttf', 'Fontes'),
    secondaryFont: findItemByName('BebasNeue-Regular.ttf', 'Fontes'),
    baseOverlay: findItemByName('Particulas_Lens_Flare_Iluminacao_Esferas.mp4', 'Overlays'),
  };

  // 2. Pontual Curated Interventions
  const interventions: CuratedAssetIntervention[] = [];
  let lastInterventionTimeMs = -30000; // Cooldown de 15s a 25s entre intervenções do mesmo tipo
  let counter = 1;

  const parseMs = (timeStr?: string): number => {
    if (!timeStr) return 0;
    const clean = timeStr.replace(/[\[\]]/g, '').trim();
    const parts = clean.split(':');
    if (parts.length === 3) {
      const [h, m, s] = parts;
      const [sec, ms] = s.split(',');
      return (Number(h) * 3600 + Number(m) * 60 + Number(sec)) * 1000 + (Number(ms) || 0);
    }
    return 0;
  };

  // Hook intervention (Cena 1 ou 2)
  if (rows.length > 0) {
    const hookRow = rows[0];
    const hookSfx = findItemByName('Woosh_Epico_1.wav', 'Efeitos_Sonoros');
    interventions.push({
      id: counter++,
      rowNumber: hookRow.rowNumber || 1,
      timeRange: \`\${hookRow.startTime || '00:00:00'} - \${hookRow.endTime || '00:00:03'}\`,
      sceneExcerpt: hookRow.texto || '',
      interventionType: 'SFX',
      editorialPurpose: 'Abertura de Alto Impacto (Hook)',
      asset: hookSfx,
      editingGuideline: 'Iniciar no primeiro frame com volume normalizado em -12dB para prender a atenção imediata.',
    });
    lastInterventionTimeMs = 0;
  }

  // Percorre as linhas buscando gatilhos pontuais
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const textLower = (row.texto || '').toLowerCase();
    const currentMs = parseMs(row.startTime);

    // Evita poluição visual/sonora (cooldown mínimo de 15s)
    if (currentMs - lastInterventionTimeMs < 15000 && i < rows.length - 2) {
      continue;
    }

    let matchedItem: PackAssetItem | null = null;
    let type: CuratedAssetIntervention['interventionType'] = 'SFX';
    let purpose = '';
    let guideline = '';

    // Gatilho: Erro / Falha / Alerta / Pane / Risco
    if (textLower.includes('erro') || textLower.includes('falha') || textLower.includes('pane') || textLower.includes('problema') || textLower.includes('perigo') || textLower.includes('cuidado')) {
      matchedItem = findItemByName('Janela_Erro_Com_Som.mov', 'Graficos');
      type = 'Gráfico / Alerta';
      purpose = 'Alerta Visual de Tensão / Quebra';
      guideline = 'Inserir no corte com escala 90% centralizada sobre o vídeo e corte abrupto.';
    }
    // Gatilho: Dinheiro / Lucro / Finanças / Custo / Milhões / Venda
    else if (textLower.includes('dinheiro') || textLower.includes('lucro') || textLower.includes('custo') || textLower.includes('milhões') || textLower.includes('faturamento') || textLower.includes('dólar') || textLower.includes('preço')) {
      matchedItem = findItemByName('Chovendo_Dinheiro_Chroma_Key.mp4', 'Chroma_Key');
      type = 'Chroma Key';
      purpose = 'Ênfase em Finanças e Riqueza';
      guideline = 'Remover o fundo verde (Ultra Key / Chroma Key) e aplicar com opacidade 85% sobreposta.';
    }
    // Gatilho: Tempo / Minutos / Segundos / Relógio / Rapidez / Aceleração
    else if (textLower.includes('segundo') || textLower.includes('minuto') || textLower.includes('tempo') || textLower.includes('pressão') || textLower.includes('hora') || textLower.includes('rápido')) {
      matchedItem = findItemByName('Timer_Barra_10_Segundos.mov', 'Graficos');
      type = 'Gráfico / Alerta';
      purpose = 'Gatilho de Urgência & Passagem do Tempo';
      guideline = 'Posicionar na parte inferior da tela (barra de progresso) para elevar o dinamismo.';
    }
    // Gatilho: Tecnologia / IA / ChatGPT / Código / Computador
    else if (textLower.includes('ia') || textLower.includes('inteligência') || textLower.includes('chatgpt') || textLower.includes('software') || textLower.includes('código') || textLower.includes('computador') || textLower.includes('sistema')) {
      matchedItem = findItemByName('Chat_GPT_Premiuim.png', 'Icones');
      type = 'Ícone 3D';
      purpose = 'Identificação Visual Tecnológica';
      guideline = 'Aplicar com animação de entrada Pop + sombra suave no canto superior direito.';
    }
    // Gatilho: CTA de Inscrição / Like (geralmente nos blocos de CTA ou finais)
    else if (textLower.includes('inscreva') || textLower.includes('curta') || textLower.includes('like') || textLower.includes('canal') || textLower.includes('comente') || textLower.includes('compartilhe')) {
      matchedItem = findItemByName('Botao_Inscreva_Se_Com_Som.mov', 'Graficos');
      type = 'Gráfico / Alerta';
      purpose = 'Chamada para Ação (CTA de Engajamento)';
      guideline = 'Inserir no terço inferior sincronizado exatamente com a palavra-chave de inscrição.';
    }
    // Gatilho: Revelação / Segredo / Choque / Mistério / Impacto
    else if (textLower.includes('segredo') || textLower.includes('verdade') || textLower.includes('chocante') || textLower.includes('surpresa') || textLower.includes('revelou') || textLower.includes('descobriu')) {
      matchedItem = findItemByName('Suspense_Impacto_Susto_1.mp3', 'Efeitos_Sonoros');
      type = 'SFX';
      purpose = 'Pico de Retenção & Revelação Narrativa';
      guideline = 'Sincronizar com o corte da cena e aplicar leve fade-out na trilha musical.';
    }
    // Quebra de padrão periódica a cada ~40s
    else if (currentMs - lastInterventionTimeMs >= 35000) {
      matchedItem = findItemByName('Glitch_Com_Som_1.mp4', 'Transicoes');
      type = 'Transição';
      purpose = 'Quebra de Padrão Visual (Refresh de Atenção)';
      guideline = 'Aplicar transição de 12 frames na virada de assunto para resetar o foco do espectador.';
    }

    if (matchedItem) {
      interventions.push({
        id: counter++,
        rowNumber: row.rowNumber,
        timeRange: \`\${row.startTime} - \${row.endTime}\`,
        sceneExcerpt: row.texto,
        interventionType: type,
        editorialPurpose: purpose,
        asset: matchedItem,
        editingGuideline: guideline,
      });
      lastInterventionTimeMs = currentMs;
    }
  }

  return {
    themeTitle,
    videoFormat,
    totalDuration,
    styleKit,
    interventions,
  };
}

/**
 * Gera a Planilha HTML de Assets pontual e inteligente para o editor
 */
export function generateAssetsSpreadsheetHtmlString(plan: CuratedAssetPlan): string {
  const { themeTitle, videoFormat, totalDuration, styleKit, interventions } = plan;

  return \`<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Planilha de Assets — \${themeTitle}</title>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700;900&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['"DM Sans"', 'sans-serif'],
            mono: ['"Space Mono"', 'monospace'],
          }
        }
      }
    }
  </script>
  <style>
    body {
      background-color: #0b0c0e;
      color: #e4e4e7;
    }
    .filtered-out {
      display: none !important;
    }
    @media print {
      body {
        background-color: #ffffff !important;
        color: #000000 !important;
      }
      .no-print {
        display: none !important;
      }
      table {
        border-color: #d4d4d8 !important;
      }
      th {
        background-color: #f1f5f9 !important;
        color: #000000 !important;
      }
      td {
        color: #18181b !important;
      }
    }
  </style>
</head>
<body class="font-sans antialiased min-h-screen pb-20">
  <!-- Header Sticky -->
  <header class="no-print sticky top-0 z-50 bg-zinc-950/90 backdrop-blur-md border-b border-zinc-800/80 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
    <div class="space-y-0.5">
      <div class="flex items-center gap-2">
        <span class="bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 px-2.5 py-0.5 text-[9px] font-black uppercase tracking-widest rounded-lg">PLANILHA DE ASSETS</span>
        <span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 text-[9px] font-bold uppercase tracking-widest rounded">\${videoFormat.toUpperCase()}</span>
        <span class="text-xs font-mono font-bold text-zinc-400">\${interventions.length} Intervenções Pontuais</span>
      </div>
      <h1 id="header-theme-title" class="text-base font-bold text-zinc-100 uppercase tracking-wide truncate max-w-xl">\${themeTitle}</h1>
    </div>

    <div class="flex flex-wrap items-center gap-3">
      <button 
        onclick="downloadCuratedCsv()" 
        class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-black uppercase tracking-wider transition-all shadow-lg shadow-emerald-600/20 flex items-center gap-2"
      >
        <span>📥 BAIXAR PLANILHA (.CSV)</span>
      </button>
      <button 
        onclick="window.print()" 
        class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
      >
        <span>🖨️ IMPRIMIR / PDF</span>
      </button>
      <button 
        onclick="downloadSelfHTML()" 
        class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border border-zinc-700 rounded-xl text-xs font-bold transition-all flex items-center gap-2"
      >
        <span>💾 SALVAR HTML</span>
      </button>
    </div>
  </header>

  <main class="max-w-7xl mx-auto px-6 py-8 space-y-8">
    <!-- Style Kit Cards -->
    <div class="space-y-3">
      <div class="flex items-center justify-between">
        <h2 class="text-xs font-black uppercase tracking-[0.2em] text-emerald-400 flex items-center gap-2">
          <span>🎨 Kit de Identidade & Estilo Base (Pack Ganha Tempo)</span>
        </h2>
        <span class="text-[10px] text-zinc-500 font-mono">Use como base para color grading e tipografia de todo o vídeo</span>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <!-- Master LUT -->
        <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
          <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Master LUT (.cube)</span>
          <div class="flex items-center gap-2">
            <span class="text-lg">🎨</span>
            <span class="font-mono text-xs font-bold text-zinc-200 truncate">\${styleKit.masterLut.name}</span>
          </div>
          <p class="text-[10px] text-zinc-400">Color grading cinematográfico uniforme.</p>
          <a href="\${styleKit.masterLut.url}" target="_blank" rel="noopener noreferrer" class="w-full text-center px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-black text-[10px] uppercase tracking-wider block transition-colors">
            📥 Baixar LUT
          </a>
        </div>

        <!-- Fonte Primária -->
        <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
          <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Fonte Primária (Títulos)</span>
          <div class="flex items-center gap-2">
            <span class="text-lg">🔤</span>
            <span class="font-mono text-xs font-bold text-zinc-200 truncate">\${styleKit.primaryFont.name}</span>
          </div>
          <p class="text-[10px] text-zinc-400">Tipografia bold para ganchos e palavras-chave.</p>
          <a href="\${styleKit.primaryFont.url}" target="_blank" rel="noopener noreferrer" class="w-full text-center px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-black text-[10px] uppercase tracking-wider block transition-colors">
            📥 Baixar Fonte
          </a>
        </div>

        <!-- Fonte Secundária -->
        <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
          <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Fonte Secundária (Legendas)</span>
          <div class="flex items-center gap-2">
            <span class="text-lg">🔤</span>
            <span class="font-mono text-xs font-bold text-zinc-200 truncate">\${styleKit.secondaryFont.name}</span>
          </div>
          <p class="text-[10px] text-zinc-400">Excelente legibilidade para legendas dinâmicas.</p>
          <a href="\${styleKit.secondaryFont.url}" target="_blank" rel="noopener noreferrer" class="w-full text-center px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-black text-[10px] uppercase tracking-wider block transition-colors">
            📥 Baixar Fonte
          </a>
        </div>

        <!-- Base Overlay -->
        <div class="p-4 rounded-2xl bg-zinc-900/60 border border-zinc-800/80 space-y-2.5">
          <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Overlay de Atmosfera</span>
          <div class="flex items-center gap-2">
            <span class="text-lg">✨</span>
            <span class="font-mono text-xs font-bold text-zinc-200 truncate">\${styleKit.baseOverlay.name}</span>
          </div>
          <p class="text-[10px] text-zinc-400">Textura e iluminação constante em Screen.</p>
          <a href="\${styleKit.baseOverlay.url}" target="_blank" rel="noopener noreferrer" class="w-full text-center px-3 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/30 text-emerald-300 font-black text-[10px] uppercase tracking-wider block transition-colors">
            📥 Baixar Overlay
          </a>
        </div>
      </div>
    </div>

    <!-- Filter & Search Bar -->
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl p-5 space-y-4">
      <div class="flex flex-col md:flex-row gap-4 md:items-center md:justify-between">
        <div class="flex-1 max-w-md relative">
          <input 
            type="text" 
            id="curated-search-input" 
            onkeyup="filterCuratedInterventions()" 
            placeholder="🔍 Filtrar intervenção por trecho da fala, função ou asset..." 
            class="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-xs text-zinc-200 placeholder-zinc-500 outline-none focus:border-emerald-500/50"
          />
        </div>
        <div class="flex items-center gap-2 text-xs font-mono font-bold text-emerald-400" id="curated-stat-counter">
          <span>\${interventions.length} intervenções mapeadas</span>
        </div>
      </div>

      <!-- Type Filter Buttons -->
      <div class="flex flex-wrap gap-1.5" id="curated-type-pills">
        <button onclick="filterInterventionType('all')" class="type-pill px-3 py-1 text-[10px] font-black uppercase rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 transition-all active:scale-95" id="pill-type-all">
          Todos (\${interventions.length})
        </button>
        <button onclick="filterInterventionType('SFX')" class="type-pill px-3 py-1 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all active:scale-95" id="pill-type-sfx">
          SFX (\${interventions.filter(i => i.interventionType === 'SFX').length})
        </button>
        <button onclick="filterInterventionType('Chroma Key')" class="type-pill px-3 py-1 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all active:scale-95" id="pill-type-chroma">
          Chroma Key (\${interventions.filter(i => i.interventionType === 'Chroma Key').length})
        </button>
        <button onclick="filterInterventionType('Gráfico / Alerta')" class="type-pill px-3 py-1 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all active:scale-95" id="pill-type-grafico">
          Gráficos (\${interventions.filter(i => i.interventionType === 'Gráfico / Alerta').length})
        </button>
        <button onclick="filterInterventionType('Transição')" class="type-pill px-3 py-1 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all active:scale-95" id="pill-type-transicao">
          Transições (\${interventions.filter(i => i.interventionType === 'Transição').length})
        </button>
        <button onclick="filterInterventionType('Ícone 3D')" class="type-pill px-3 py-1 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all active:scale-95" id="pill-type-icone">
          Ícones 3D (\${interventions.filter(i => i.interventionType === 'Ícone 3D').length})
        </button>
      </div>
    </div>

    <!-- Curated Spreadsheet Table -->
    <div class="bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
      <div class="overflow-x-auto">
        <table class="w-full text-left border-collapse" id="curated-table">
          <thead>
            <tr class="bg-zinc-950 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400">
              <th class="px-5 py-4 w-12 text-center">#</th>
              <th class="px-5 py-4 w-20">Cena</th>
              <th class="px-5 py-4 w-36">Posição Temporal</th>
              <th class="px-5 py-4 w-48">Momento & Função</th>
              <th class="px-5 py-4 w-32">Tipo</th>
              <th class="px-5 py-4">Trecho da Fala (Contexto)</th>
              <th class="px-5 py-4 w-60">Asset do Pack Ganha Tempo</th>
              <th class="px-5 py-4 w-72">Orientação de Edição</th>
              <th class="px-5 py-4 w-32 text-right">Download</th>
            </tr>
          </thead>
          <tbody class="divide-y divide-zinc-800/60 text-xs">
            \${interventions.map((item) => \`
              <tr class="curated-row hover:bg-zinc-800/40 transition-colors" data-type="\${item.interventionType}" data-text="\${(item.sceneExcerpt + ' ' + item.editorialPurpose + ' ' + item.asset.name).toLowerCase()}">
                <td class="px-5 py-4 text-center font-mono text-zinc-500 font-bold">\${item.id}</td>
                <td class="px-5 py-4 font-mono font-bold text-purple-300">#\${item.rowNumber}</td>
                <td class="px-5 py-4 font-mono font-bold text-emerald-400 whitespace-nowrap">\${item.timeRange}</td>
                <td class="px-5 py-4 font-bold text-zinc-200">
                  <span class="block text-[11px] leading-tight">\${item.editorialPurpose}</span>
                </td>
                <td class="px-5 py-4 whitespace-nowrap">
                  <span class="px-2 py-0.5 text-[8.5px] font-black uppercase tracking-wider rounded-lg bg-zinc-800 text-zinc-300 border border-zinc-700">
                    \${item.interventionType}
                  </span>
                </td>
                <td class="px-5 py-4 italic text-zinc-300 max-w-xs leading-relaxed text-[11px]">
                  &quot;\${item.sceneExcerpt}&quot;
                </td>
                <td class="px-5 py-4 font-mono text-[11px] text-zinc-200 font-semibold">
                  <div class="flex items-center gap-1.5">
                    <span>\${item.asset.mimeType.startsWith('video/') ? '🎬' : item.asset.mimeType.startsWith('image/') ? '🖼️' : item.asset.mimeType.startsWith('audio/') ? '🔊' : '📦'}</span>
                    <span class="truncate max-w-[200px]" title="\${item.asset.name}">\${item.asset.name}</span>
                  </div>
                  <span class="text-[8px] font-black uppercase text-zinc-500 block mt-0.5">\${item.asset.category.replace(/^[0-9]+_/, '')}</span>
                </td>
                <td class="px-5 py-4 text-zinc-400 text-[11px] leading-relaxed max-w-xs">
                  \${item.editingGuideline}
                </td>
                <td class="px-5 py-4 text-right whitespace-nowrap">
                  <a href="\${item.asset.url}" target="_blank" rel="noopener noreferrer" class="px-3 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white inline-flex items-center gap-1 shadow-sm transition-all">
                    <span>📥 Baixar</span>
                  </a>
                </td>
              </tr>
            \`).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </main>

  <script id="plan-data" type="application/json">
    \${JSON.stringify(plan)}
  </script>

  <script>
    const plan = JSON.parse(document.getElementById('plan-data').textContent);
    let selectedTypeFilter = 'all';

    function filterInterventionType(type) {
      selectedTypeFilter = type;
      const pills = document.querySelectorAll('.type-pill');
      pills.forEach(p => {
        p.className = 'type-pill px-3 py-1 text-[10px] font-bold uppercase rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 transition-all';
      });

      const activeMap = {
        'all': 'pill-type-all',
        'SFX': 'pill-type-sfx',
        'Chroma Key': 'pill-type-chroma',
        'Gráfico / Alerta': 'pill-type-grafico',
        'Transição': 'pill-type-transicao',
        'Ícone 3D': 'pill-type-icone',
      };

      const activeBtn = document.getElementById(activeMap[type] || 'pill-type-all');
      if (activeBtn) {
        activeBtn.className = 'type-pill px-3 py-1 text-[10px] font-black uppercase rounded-lg border border-emerald-500/30 bg-emerald-500/15 text-emerald-300 transition-all';
      }

      filterCuratedInterventions();
    }

    function filterCuratedInterventions() {
      const query = (document.getElementById('curated-search-input')?.value || '').toLowerCase().trim();
      const rows = document.querySelectorAll('.curated-row');
      let visibleCount = 0;

      rows.forEach(row => {
        const type = row.getAttribute('data-type') || '';
        const text = row.getAttribute('data-text') || '';

        const matchesType = (selectedTypeFilter === 'all' || type === selectedTypeFilter);
        const matchesQuery = !query || text.includes(query);

        if (matchesType && matchesQuery) {
          row.classList.remove('filtered-out');
          visibleCount++;
        } else {
          row.classList.add('filtered-out');
        }
      });

      const counter = document.getElementById('curated-stat-counter');
      if (counter) {
        counter.innerText = visibleCount + ' de ' + plan.interventions.length + ' intervenções visíveis';
      }
    }

    function downloadCuratedCsv() {
      let csv = 'ID,Cena,Posicao Temporal,Momento & Funcao,Tipo,Trecho da Fala,Asset Recomendado,Categoria,Tamanho (KB),Orientacao de Edicao,URL Google Drive\\r\\n';
      plan.interventions.forEach(item => {
        csv += '"' + item.id + '",' +
               '"#' + item.rowNumber + '",' +
               '"' + item.timeRange + '",' +
               '"' + item.editorialPurpose.replace(/"/g, '""') + '",' +
               '"' + item.interventionType + '",' +
               '"' + item.sceneExcerpt.replace(/"/g, '""') + '",' +
               '"' + item.asset.name + '",' +
               '"' + item.asset.category + '",' +
               item.asset.sizeKb + ',' +
               '"' + item.editingGuideline.replace(/"/g, '""') + '",' +
               '"' + item.asset.url + '"\\r\\n';
      });

      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'planilha_assets_' + (plan.themeTitle || 'video').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase() + '.csv';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function downloadSelfHTML() {
      const docSource = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
      const blob = new Blob([docSource], { type: 'text/html;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      const sanitized = (plan.themeTitle || 'video').replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
      link.download = 'planilha_assets_' + sanitized + '.html';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }
  </script>
</body>
</html>\`;
}
`;

fs.writeFileSync(filePath, content.replace(/\nexport function matchPackAssetsForScene[\s\S]*$/, '') + '\n' + additionalCode, 'utf-8');
console.log('Successfully enriched lib/pack-ganha-tempo.ts with curated plan and HTML generator');
