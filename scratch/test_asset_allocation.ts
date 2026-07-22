import { parseSrtToRows, applyAssetRules, finalizeFacelessRows, AssetAllocationMode } from '../lib/srt-asset-pipeline';

const sampleSrt = `
1
00:00:00,000 --> 00:00:02,500
O império se expandiu através das estrelas.

2
00:00:02,500 --> 00:00:07,800
Soldados marchavam sem parar enquanto naves de guerra rasgavam os céus em alta velocidade.

3
00:00:07,800 --> 00:00:10,200
Um mapa antigo revelava a localização do artefato.

4
00:00:10,200 --> 00:00:16,000
A batalha final começou no vale sombrio com explosões por todos os lados.
`.trim();

console.log('=== TESTANDO MODO HÍBRIDO INTELIGENTE (COM TRAVA < 4s) ===');
const parsed = parseSrtToRows(sampleSrt);
const enabledAssets = { video: true, image: true, text: true, hyperframe: true };

const hybridRows = applyAssetRules(parsed, 'faceless', sampleSrt, enabledAssets, 'hybrid_smart');
const finalHybrid = finalizeFacelessRows(hybridRows, 'faceless', enabledAssets, 'hybrid_smart');

finalHybrid.forEach((row) => {
  const startMs = parseSrtTimeToMs(row.startTime);
  const endMs = parseSrtTimeToMs(row.endTime);
  const durSec = ((endMs - startMs) / 1000).toFixed(1);
  console.log(`Linha #${row.rowNumber} (${durSec}s): "${row.texto.slice(0, 30)}..." => ASSET: [${row.asset}]`);
});

function parseSrtTimeToMs(timeValue: string) {
  const [hours, minutes, secondsAndMs] = timeValue.split(':');
  const [seconds, milliseconds] = secondsAndMs.split(',');
  return (((Number(hours) * 60 * 60) + (Number(minutes) * 60) + Number(seconds)) * 1000) + Number(milliseconds);
}
