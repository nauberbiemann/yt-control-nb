// Using native global fetch

const geminiKey = 'sb_publishable_QrmgBy5oT4djYBSffDrr5Q_98IdRUXa'; // public/demo key or we can read from environment/localstorage if needed

const textToAnalyze = `Eu admito, já comprei WPI porque a embalagem dizia "mais proteína". O Whey Protein Isolate costuma ter mais de 90% de proteína por porção porque passa por microfiltração ou troca iônica que removem quase toda a gordura e a lactose. Isso acelera a cinética dos aminoácidos e eleva o pico de leucina mais rápido no sangue. Mas o mercado premium criou uma camada de marketing que empurra variantes caras sem diferença prática quando a dose...`;

const factCheckPrompt = `Você é um verificador de fatos (Fact-Checker) jornalístico profissional e detalhado.
Analise o roteiro a seguir e identifique afirmações que envolvam fatos, estatísticas, datas, dados científicos, eventos históricos ou nomes de produtos/marcas.

Faça uma checagem com o motor de busca e produza um relatório estruturado no seguinte formato:
1. Resumo Geral (Total de fatos checados, quantos corretos, alertas e incorretos).
2. Tabela de Verificação Focada em Ajustes:
   - IMPORTANTE: Para evitar que a tabela seja cortada por limite de tamanho, liste detalhadamente na tabela APENAS as afirmações que receberem o status ⚠️ ALERTA ou ❌ INCORRETO.
   - Colunas da tabela: Fato citado | Status (⚠️ ALERTA ou ❌ INCORRETO) | Correção/Ajuste sugerido e fonte (URL clicável se houver).
3. Lista de Fatos Confirmados (✅ PRECISO):
   - Apresente apenas uma lista simples ou parágrafo compacto citando de forma resumida os fatos que foram confirmados e estão corretos (para não inflar o tamanho do texto).

Seja rigoroso e preciso. Se o fato for fictício ou alucinado, marque como incorreto.
Retorne APENAS o relatório estruturado em Markdown limpo.

[ROTEIRO PARA VERIFICAÇÃO]:
${textToAnalyze}`;

async function run() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY || 'sua_chave_aqui'}`;
  
  // Let's read from local .env.local to get the actual API key if needed
  const fs = require('fs');
  const path = require('path');
  let key = process.env.GEMINI_API_KEY;
  try {
    const envFile = fs.readFileSync(path.join(__dirname, '..', '.env.local'), 'utf8');
    const match = envFile.match(/GEMINI_API_KEY=["']?([^"'\r\n]+)/);
    if (match) key = match[1];
  } catch (e) {}

  if (!key) {
    console.error('No GEMINI_API_KEY found in .env.local');
    return;
  }

  console.log('Sending request to Gemini...');
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: factCheckPrompt }] }],
      generationConfig: {
        temperature: 0.9,
        maxOutputTokens: 8192
      }
    })
  });

  const data = await res.json();
  console.log('API Response Status:', res.status);
  if (!res.ok) {
    console.error('API Error:', data);
    return;
  }

  const candidate = data.candidates?.[0];
  console.log('Finish Reason:', candidate?.finishReason);
  console.log('\n--- Text Content ---');
  console.log(candidate?.content?.parts?.[0]?.text);
}

run();
