const fs = require('fs');

const files = [
  'devzen_project.json',
  'metabolismo_project.json',
  'meu_diagnostico_metabolismo.json',
  'generated_content.json'
];

const searchId = '460b48aa-6199-4922-95ae-0acb960b1351';
const searchTitle = 'O Fim do Império';

files.forEach(f => {
  if (!fs.existsSync(f)) return;
  console.log(`Searching file: ${f}...`);
  const content = fs.readFileSync(f, 'utf8');
  if (content.includes(searchId)) {
    console.log(`  -> Found theme ID!`);
  }
  if (content.includes(searchTitle)) {
    console.log(`  -> Found title text!`);
  }
});
