const fs = require('fs');
const path = require('path');

const rowsPath = path.join(__dirname, 'necron_simplified_rows.json');
try {
  const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
  console.log(`Analyzing ${rows.length} rows of subtitle/SRT text...`);
  
  const searchTerms = {
    'Tecno-sacerdote': ['sacerdote', 'marte', 'tecno', 'admech', 'mechanicus', 'priest'],
    'Inquisidor': ['inquisidor', 'inquisidora', 'imperium', 'inquisition', 'inquisitor'],
    'Narrador/Analista': ['narrador', 'analista', 'registros', 'registro', 'narrador analista', 'eu']
  };

  Object.keys(searchTerms).forEach(charName => {
    const terms = searchTerms[charName];
    console.log(`\nMentions of character group "${charName}":`);
    let count = 0;
    rows.forEach(r => {
      const txt = (r.text || '').toLowerCase();
      const match = terms.find(t => txt.includes(t));
      if (match) {
        count++;
        console.log(`  Row ${r.rowNumber} (${r.asset}) (matched "${match}"): "${r.text}"`);
        console.log(`     Generated prompt: "${r.prompt}"`);
      }
    });
    console.log(`  Total rows matching: ${count}`);
  });
} catch (err) {
  console.error(err);
}
