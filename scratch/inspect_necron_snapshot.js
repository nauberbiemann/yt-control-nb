const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, 'necron_execution_snapshot.json');
try {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  console.log('Keys in snapshot:', Object.keys(snapshot));
  
  const pipeline = snapshot.externalSrtPipeline || {};
  console.log('Pipeline keys:', Object.keys(pipeline));
  
  // Cast (Narrative Cast / Consistent Characters)
  const visualBlueprint = pipeline.visualBlueprint || {};
  console.log('Visual Blueprint keys:', Object.keys(visualBlueprint));
  const cast = visualBlueprint.cast || [];
  console.log('\n=== CAST ===');
  console.log(JSON.stringify(cast, null, 2));
  
  // Let's get the original SRT rows or processed rows
  const rows = pipeline.rows || [];
  console.log(`\n=== ROWS (${rows.length} rows) ===`);
  console.log('First 5 rows:');
  console.log(rows.slice(0, 5));
  
  // Let's write all row index, asset, and subtitle text to a file so we can see it
  const simplifiedRows = rows.map(r => ({
    rowNumber: r.rowNumber,
    asset: r.asset,
    text: r.texto,
    prompt: r.prompt
  }));
  
  fs.writeFileSync(
    path.join(__dirname, 'necron_simplified_rows.json'),
    JSON.stringify(simplifiedRows, null, 2),
    'utf8'
  );
  console.log('\nSaved simplified rows to scratch/necron_simplified_rows.json');
  
  // Let's count how many times each cast member is mentioned in the subtitle texts (case insensitive)
  console.log('\n=== MENTION ANALYSIS ===');
  cast.forEach(char => {
    const name = char.name;
    // Let's create search terms: split by space, search for parts
    const terms = [name.toLowerCase()];
    // Add common variations or roles
    if (name.includes('Tecno-sacerdote')) terms.push('sacerdote', 'marte', 'tecno');
    if (name.includes('Inquisidor')) terms.push('inquisidor', 'imperium');
    if (name.includes('Narrador')) terms.push('narrador', 'analista', 'registros');
    
    console.log(`Character Name: "${name}"`);
    console.log(`  Search terms:`, terms);
    
    const matches = [];
    rows.forEach(r => {
      const txt = (r.texto || '').toLowerCase();
      const matchedTerm = terms.find(term => txt.includes(term));
      if (matchedTerm) {
        matches.push({ rowNumber: r.rowNumber, term: matchedTerm, text: r.texto });
      }
    });
    
    console.log(`  Found ${matches.length} matching rows:`);
    matches.forEach(m => {
      console.log(`    Row ${m.rowNumber} (matched "${m.term}"): "${m.text}"`);
    });
  });
  
} catch (err) {
  console.error(err);
}
