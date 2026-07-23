const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'ScriptEngine.tsx');
const content = fs.readFileSync(filePath, 'utf8');

const targetString = "Certifique-se de que siglas, abreviações ou letras isoladas sejam escritas por extenso no arquivo final (ex: escrever 'ípsilon' em vez de 'Y', ou 'Estados Unidos' em vez de 'EUA') para garantir a leitura perfeita pelo motor de voz.";

if (content.includes(targetString)) {
  console.log("✅ SUCCESS: The instruction was successfully found in ScriptEngine.tsx!");
} else {
  console.error("❌ FAILURE: Could not find the instruction in ScriptEngine.tsx!");
  process.exit(1);
}
