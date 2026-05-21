import {
  applyAssetRules,
  parseSrtToRows,
  parseSrtTimeToMs,
  type SrtAssetRow
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

// Generates a mock SRT with specified length
function generateMockSrt(linesCount: number): string {
  let srt = '';
  let currentTime = 1000; // start at 1s
  for (let i = 1; i <= linesCount; i++) {
    const start = currentTime;
    const end = currentTime + 4000; // 4s
    
    const startStr = formatMsToSrtTime(start);
    const endStr = formatMsToSrtTime(end);
    
    srt += `${i}\n${startStr} --> ${endStr}\nEsta e a legenda ${i} de teste do Content OS para validar VLOG.\n\n`;
    
    currentTime = end + 500; // 500ms gap
  }
  return srt;
}

console.log("===============================================================");
console.log("=== INICIANDO VALIDAÇÃO DE RITMO E HEURÍSTICAS DE VLOG ===");
console.log("===============================================================\n");

let globalSuccess = true;

// 1. Generate a mock SRT with 100 lines (representing a typical video timeline)
const vlogSrt = generateMockSrt(100);
const parsedRows = parseSrtToRows(vlogSrt);

// 2. Apply asset rules for VLOG mode and Avatar mode
console.log("🧪 Passo A: Aplicando regras de assets com formatos...");
const vlogRows = applyAssetRules(parsedRows, 'vlog');
const avatarRows = applyAssetRules(parsedRows, 'avatar');

const vlogBrollCount = vlogRows.filter(r => r.asset === 'vídeo' || r.asset === 'imagem').length;
const avatarBrollCount = avatarRows.filter(r => r.asset === 'vídeo' || r.asset === 'imagem').length;

console.log(`- Total de linhas: ${vlogRows.length}`);
console.log(`- VLOG: Inserções de B-roll: ${vlogBrollCount} | Cenas de Selfie (avatar): ${vlogRows.filter(r => r.asset === 'avatar').length}`);
console.log(`- AVATAR: Inserções de B-roll: ${avatarBrollCount} | Cenas de Apresentador (avatar): ${avatarRows.filter(r => r.asset === 'avatar').length}`);

// Verify relaxed pacing: B-rolls should be less frequent (or equal due to PRNG) than avatar mode.
if (vlogBrollCount <= avatarBrollCount) {
  console.log(`✅ SUCESSO: Ritmo relaxado VLOG confirmado! (${vlogBrollCount} B-rolls no VLOG vs ${avatarBrollCount} no AVATAR).`);
} else {
  console.error(`❌ FALHA: Frequência de B-roll do VLOG (${vlogBrollCount}) é maior que do AVATAR (${avatarBrollCount}).`);
  globalSuccess = false;
}
console.log("");

// 3. Test VLOG Respiro/Pacing rules: Hook Clean Zone (6s) & Clean Time (4s)
console.log("🧪 Passo B: Testando Janelas de Respiro Exclusivas para VLOG...");
let cleanZoneViolations = 0;
let cleanTimeViolations = 0;
let lastBrollEnd = 0;

vlogRows.forEach(row => {
  const startMs = parseSrtTimeToMs(row.startTime);
  const endMs = parseSrtTimeToMs(row.endTime);
  const isBroll = row.asset === 'vídeo' || row.asset === 'imagem';

  // Hook Clean zone check: VLOG has a clean zone of 6s (6000ms)
  if (startMs < 6000 && isBroll) {
    console.error(`- ❌ FALHA: B-roll encontrado na Hook Clean Zone de 6s em ${startMs}ms.`);
    cleanZoneViolations++;
  }

  // Cooldown / Avatar Clean Time: VLOG has a minimum avatar clean time of 4s (4000ms)
  if (isBroll) {
    if (lastBrollEnd > 0 && (startMs - lastBrollEnd) < 4000) {
      console.error(`- ❌ FALHA: Cooldown pós B-roll de 4s violado em ${startMs}ms (distância de apenas ${startMs - lastBrollEnd}ms).`);
      cleanTimeViolations++;
    }
    lastBrollEnd = endMs;
  }
});

if (cleanZoneViolations === 0) {
  console.log("✅ SUCESSO: Nenhuma violação da Hook Clean Zone de 6s para VLOG.");
} else {
  globalSuccess = false;
}

if (cleanTimeViolations === 0) {
  console.log("✅ SUCESSO: Nenhuma violação de Avatar Clean Time de 4s para VLOG.");
} else {
  globalSuccess = false;
}

console.log("\n===============================================================");
if (globalSuccess) {
  console.log("🎉 VALIDAÇÃO DE VLOG CONCLUÍDA: TODAS AS REGRAS FORAM APROVADAS COM SUCESSO!");
} else {
  console.error("🚨 FALHA NA VALIDAÇÃO: Alguma regra de VLOG foi violada.");
  process.exit(1);
}
console.log("===============================================================");
