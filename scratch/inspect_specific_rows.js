const fs = require('fs');
const path = require('path');

const rowsPath = path.join(__dirname, 'necron_simplified_rows.json');
try {
  const rows = JSON.parse(fs.readFileSync(rowsPath, 'utf8'));
  const rowNumbers = [1, 13, 62, 72, 117];
  
  console.log('=== SELECTED ROWS DETAILS ===');
  rowNumbers.forEach(num => {
    const r = rows.find(x => x.rowNumber === num);
    if (r) {
      console.log(`Row ${num}:`);
      console.log(`  Asset: ${r.asset}`);
      console.log(`  Text:  "${r.text}"`);
      console.log(`  Prompt: "${r.prompt}"`);
    } else {
      console.log(`Row ${num} not found.`);
    }
  });
} catch (err) {
  console.error(err);
}
