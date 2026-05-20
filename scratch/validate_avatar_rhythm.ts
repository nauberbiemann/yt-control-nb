import { applyAssetRules, applyHyperframeRules, parseSrtToRows, parseSrtTimeToMs, type SrtAssetRow } from '../lib/srt-asset-pipeline';

// Simulação de um arquivo SRT contendo legendas sequenciais com tempos realistas (intervalos de 2 a 4 segundos)
// Totalizando cerca de 2 minutos e meio de vídeo
const testSrt = `
1
00:00:01,000 --> 00:00:03,000
Olá, bem-vindo ao Content OS.

2
00:00:03,200 --> 00:00:06,500
Hoje nós vamos analisar a arquitetura de sistemas biológicos legados.

3
00:00:06,700 --> 00:00:09,800
Você já sentiu que seu cérebro está sofrendo um sério memory leak de atenção?

4
00:00:10,000 --> 00:00:13,200
A verdade é que nós tratamos nosso corpo como hardware de baixo custo descartável.

5
00:00:13,500 --> 00:00:17,000
Mas a longevidade exige um refactoring profundo na sua rotina diária.

6
00:00:17,200 --> 00:00:20,500
Vamos começar isolando a dívida técnica acumulada no seu sono.

7
00:00:20,800 --> 00:00:24,000
A primeira regra é estabelecer um firewall rígido de prioridades de entrada.

8
00:00:24,200 --> 00:00:27,500
Isso evita que chamadas não autorizadas consumam sua energia crítica de deep work.

9
00:00:27,800 --> 00:00:31,000
A segunda regra consiste na preservação da joia muscular do seu metabolismo.

10
00:00:31,200 --> 00:00:35,000
O músculo não é apenas estética; ele é a reserva mais preciosa de uptime.

11
00:00:35,200 --> 00:00:38,500
Se você negligencia sua força, está desenhando um SPOF humano no seu futuro.

12
00:00:38,800 --> 00:00:42,000
Toda vez que você pula o treino de pernas, está criando gargalos na replicação celular.

13
00:00:42,200 --> 00:00:45,500
É como rodar uma query complexa sem qualquer indexação no banco de dados.

14
00:00:45,800 --> 00:00:49,000
Para reverter esse declínio de desempenho biológico, siga este protocolo.

15
00:00:49,200 --> 00:00:52,500
Monitore os seus logs de cortisol logo nas primeiras horas da manhã.

16
00:00:52,800 --> 00:00:56,000
Evite café gelado nos primeiros 90 minutos após inicializar seu sistema.

17
00:00:56,200 --> 00:00:59,500
Dessa forma, o seu kernel hormonal se estabilizará de forma natural.

18
00:01:00,000 --> 00:01:03,500
E o seu dia começará em estado estável de alta performance mental.

19
00:01:03,800 --> 00:01:07,000
Compartilhe este vídeo com aquele colega tech lead que está sempre exausto.

20
00:01:07,200 --> 00:01:10,000
E assine nosso canal para mais documentação biológica pragmática.
`;

console.log("=== INICIANDO VALIDAÇÃO DE RITMO DE HUMANIZAÇÃO ===");

const runValidation = (mode: 'avatar' | 'faceless') => {
  console.log(`\n> Testando no Modo: ${mode.toUpperCase()}`);
  const initialRows = parseSrtToRows(testSrt);
  const rowsWithBrolls = applyAssetRules(initialRows, mode);
  const finalRows = applyHyperframeRules(rowsWithBrolls);

  const cleanZoneMs = mode === 'faceless' ? 4000 : 12000;
  const cooldownMs = mode === 'faceless' ? 3000 : 5000;

  let failures = 0;
  let lastBrollEndMs = 0;

  finalRows.forEach((row) => {
    const startMs = parseSrtTimeToMs(row.startTime);
    const endMs = parseSrtTimeToMs(row.endTime);
    const asset = row.asset;

    const isBrollOrHf = asset === 'vídeo' || asset === 'imagem' || asset === 'hyperframe';

    // Validação 1: Hook Clean Zone (Abertura Limpa)
    if (startMs < cleanZoneMs && isBrollOrHf) {
      console.error(`❌ FALHA: Encontrado asset '${asset}' na Clean Zone (${startMs}ms < ${cleanZoneMs}ms): "${row.texto}"`);
      failures++;
    }

    // Validação 2: Cooldown (Respiro)
    if (isBrollOrHf) {
      if (lastBrollEndMs > 0 && (startMs - lastBrollEndMs) < cooldownMs) {
        console.error(`❌ FALHA: Asset '${asset}' violou o Cooldown de ${cooldownMs}ms (distância de apenas ${startMs - lastBrollEndMs}ms pós B-roll anterior): "${row.texto}"`);
        failures++;
      }
      lastBrollEndMs = endMs;
    }

    console.log(`[${row.startTime} -> ${row.endTime}] Asset: ${asset.padEnd(10)} | Texto: ${row.texto.slice(0, 40)}...`);
  });

  if (failures === 0) {
    console.log(`\n✅ SUCESSO: Modo ${mode.toUpperCase()} passou em 100% dos testes de janelas e respiros.`);
  } else {
    console.error(`\n❌ ERRO: Encontradas ${failures} violações de tempo no modo ${mode.toUpperCase()}.`);
  }
};

runValidation('avatar');
runValidation('faceless');
