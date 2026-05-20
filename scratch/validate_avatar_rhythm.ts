import {
  applyAssetRules,
  applyHyperframeRules,
  parseSrtToRows,
  parseSrtTimeToMs,
  enforceTextoCooldown,
  type SrtAssetRow,
  calculateSrtSeed
} from '../lib/srt-asset-pipeline';

// Helper to format ms into SRT time format (HH:MM:SS,mmm)
function formatMsToSrtTime(ms: number): string {
  const hours = Math.floor(ms / 3600000);
  const minutes = Math.floor((ms % 3600000) / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  const milliseconds = ms % 1000;
  
  const pad = (n: number, size: number) => String(n).padStart(size, '0');
  return `${pad(hours, 2)}:${pad(minutes, 2)}:${pad(seconds, 2)},${pad(milliseconds, 3)}`;
}

// Generates a mock SRT with specified length and texts
function generateMockSrt(linesCount: number, contentSeedWord: string, textStyle: 'long' | 'short' = 'long'): string {
  let srt = '';
  let currentTime = 1000; // start at 1s
  for (let i = 1; i <= linesCount; i++) {
    const start = currentTime;
    const end = currentTime + (textStyle === 'long' ? 6000 : 3500); // 6 seconds for long (satisfying MIN_HF_DURATION_MS), 3.5s for short
    
    const startStr = formatMsToSrtTime(start);
    const endStr = formatMsToSrtTime(end);
    
    let sentence = `Esta e a legenda ${i} de teste do Content OS. Seed do canal: ${contentSeedWord}.`;
    if (textStyle === 'short') {
      sentence = `Legenda ${i}`; // < 25 chars to trigger cinematic text rules
    }

    srt += `${i}\n${startStr} --> ${endStr}\n${sentence}\n\n`;
    
    currentTime = end + 500; // 500ms gap
  }
  return srt;
}

console.log("===============================================================");
console.log("=== INICIANDO VALIDAÇÃO DE REGRESSÃO E RITMO HYPERFRAMES ===");
console.log("===============================================================\n");

let globalSuccess = true;

// -----------------------------------------------------------------------------
// VALIDAÇÃO 1: Cooldown de Texto Puro de 35 segundos (First-Wins)
// -----------------------------------------------------------------------------
console.log("🧪 VALIDAÇÃO 1: Testando Cooldown de Texto Puro de 35 segundos...");
const shortTextSrt = generateMockSrt(15, "short-text", "short"); // 15 short texts, spaced by ~4 seconds
const parsedShortRows = parseSrtToRows(shortTextSrt);
const markedShortRows = parsedShortRows.map(r => ({ ...r, asset: 'texto' as const })); // Force as text
const filteredRows = enforceTextoCooldown(markedShortRows, 35000);

let lastTextoEndMs = -Infinity;
let textCooldownViolations = 0;
let textAssetCount = 0;

filteredRows.forEach((row, idx) => {
  if (row.asset === 'texto') {
    textAssetCount++;
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);
    if (startMs - lastTextoEndMs < 35000) {
      console.error(`❌ ERRO: Violação de cooldown de texto na linha ${row.rowNumber}. Distância de apenas ${startMs - lastTextoEndMs}ms.`);
      textCooldownViolations++;
    }
    lastTextoEndMs = endMs;
  }
});

if (textCooldownViolations === 0 && textAssetCount > 0) {
  console.log(`✅ SUCESSO: Cooldown de texto de 35s validado. ${textAssetCount} textos aceitos, nenhum violou o cooldown.`);
} else {
  console.error(`❌ FALHA: Encontradas ${textCooldownViolations} violações no cooldown de texto.`);
  globalSuccess = false;
}
console.log("");

// -----------------------------------------------------------------------------
// VALIDAÇÃO 2: Orçamento Adaptativo de Hyperframes de até 10 slots
// -----------------------------------------------------------------------------
console.log("🧪 VALIDAÇÃO 2: Testando Orçamento Adaptativo de Hyperframes (Teto de 10 slots)...");
// We generate a very long video with 280 lines to ensure we have >= 160 avatar rows
const longSrt = generateMockSrt(280, "projeto-alfa-ia", "long");
const parsedLongRows = parseSrtToRows(longSrt);
const rowsWithAssets = applyAssetRules(parsedLongRows, 'avatar');
const rowsWithHyperframes = applyHyperframeRules(rowsWithAssets);

const hfCount = rowsWithHyperframes.filter(r => r.asset === 'hyperframe').length;
console.log(`- Total de linhas no SRT gerado: ${rowsWithHyperframes.length}`);
console.log(`- Avatar rows identificados no total: ${rowsWithHyperframes.filter(r => r.asset === 'avatar').length}`);
console.log(`- Hyperframes injetados na timeline: ${hfCount}`);

if (hfCount === 10) {
  console.log(`✅ SUCESSO: Orçamento adaptativo de 10 slots de Hyperframe para vídeos longos confirmado!`);
} else {
  console.error(`❌ FALHA: Orçamento deveria ser 10 para 280 linhas, mas foi ${hfCount}.`);
  globalSuccess = false;
}
console.log("");

// -----------------------------------------------------------------------------
// VALIDAÇÃO 3: Aleatoriedade Estocástica e Unicidade por Hash de Conteúdo (Seeded Shuffle)
// -----------------------------------------------------------------------------
console.log("🧪 VALIDAÇÃO 3: Testando Aleatoriedade Estocástica e Unicidade de Sequência Visual...");
// We create two SRTs of the exact same size, but changing a single word to modify the content hash
const srtA = generateMockSrt(280, "tema-biologia-molecular", "long");
const srtB = generateMockSrt(280, "tema-astrofisica-relativa", "long");

const hashA = calculateSrtSeed(srtA);
const hashB = calculateSrtSeed(srtB);
console.log(`- Hash do Roteiro A (Biologia): ${hashA}`);
console.log(`- Hash do Roteiro B (Astrofísica): ${hashB}`);

if (hashA === hashB) {
  console.error("❌ FALHA Crítica: Os hashes dos dois roteiros diferentes são iguais!");
  globalSuccess = false;
}

const pipelineA = applyHyperframeRules(applyAssetRules(parseSrtToRows(srtA), 'avatar'));
const pipelineB = applyHyperframeRules(applyAssetRules(parseSrtToRows(srtB), 'avatar'));

const sequenceA = pipelineA.filter(r => r.asset === 'hyperframe').map(r => r.prompt);
const sequenceB = pipelineB.filter(r => r.asset === 'hyperframe').map(r => r.prompt);

console.log(`\n- Sequência Visual A (Biologia):`);
console.log(JSON.stringify(sequenceA, null, 2));

console.log(`\n- Sequência Visual B (Astrofísica):`);
console.log(JSON.stringify(sequenceB, null, 2));

// Compare elements to verify the exact order is not identical
let sequencesIdentical = true;
if (sequenceA.length !== sequenceB.length) {
  sequencesIdentical = false;
} else {
  sequencesIdentical = sequenceA.every((val, index) => val === sequenceB[index]);
}

if (!sequencesIdentical) {
  console.log(`\n✅ SUCESSO: As sequências visuais são diferentes! Provado estatisticamente o Seeded Shuffle via Hash do SRT.`);
} else {
  console.error(`\n❌ FALHA: As sequências são idênticas! O seeded shuffle falhou em baralhar diferentemente.`);
  globalSuccess = false;
}
console.log("");

// -----------------------------------------------------------------------------
// VALIDAÇÃO 4: Regras de Respiro Geral (Hook Clean Zone e Cooldown de B-roll)
// -----------------------------------------------------------------------------
console.log("🧪 VALIDAÇÃO 4: Testando Janelas de Respiro de Humanização no Vídeo de 200 Linhas...");
let respiroViolations = 0;
let cleanZoneViolations = 0;
let lastBrollEnd = 0;

rowsWithHyperframes.forEach(row => {
  const startMs = parseSrtTimeToMs(row.startTime);
  const endMs = parseSrtTimeToMs(row.endTime);
  const isBrollOrHf = row.asset === 'vídeo' || row.asset === 'imagem' || row.asset === 'hyperframe';

  // 12s Clean zone check
  if (startMs < 12000 && isBrollOrHf) {
    console.error(`❌ FALHA: Encontrado asset '${row.asset}' no hook inicial limpo em ${startMs}ms`);
    cleanZoneViolations++;
  }

  // 5s Cooldown after previous B-roll
  if (isBrollOrHf) {
    if (lastBrollEnd > 0 && (startMs - lastBrollEnd) < 5000) {
      console.error(`❌ FALHA: Cooldown pós B-roll de 5s violado no tempo ${startMs}ms (distância ${startMs - lastBrollEnd}ms)`);
      respiroViolations++;
    }
    lastBrollEnd = endMs;
  }
});

if (cleanZoneViolations === 0 && respiroViolations === 0) {
  console.log("✅ SUCESSO: Regras de Hook Clean Zone (12s) e Cooldown de B-roll (5s) cumpridas 100%!");
} else {
  console.error(`❌ FALHA: Encontradas violações na timeline de respiro: CleanZone=${cleanZoneViolations}, Cooldown=${respiroViolations}`);
  globalSuccess = false;
}
console.log("\n===============================================================");
if (globalSuccess) {
  console.log("🎉 VALIDAÇÃO CONCLUÍDA: TODAS AS REGRAS FORAM APROVADAS COM 100% DE SUCESSO!");
} else {
  console.error("🚨 FALHA NA VALIDAÇÃO: Pelo menos uma das regras de regressão falhou.");
  process.exit(1);
}
console.log("===============================================================");
