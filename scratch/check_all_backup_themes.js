const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '../meu_diagnostico_metabolismo.json');
try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  console.log('Keys in backup:', Object.keys(data).filter(k => k.startsWith('themes_')));
  
  const themeKeys = Object.keys(data).filter(k => k.startsWith('themes_'));
  themeKeys.forEach(k => {
    let themesList = data[k];
    if (typeof themesList === 'string') {
      themesList = JSON.parse(themesList);
    }
    
    console.log(`\n=== Key: ${k} (${themesList.length} themes) ===`);
    let withPipeline = 0;
    let withoutPipeline = 0;
    
    themesList.forEach(t => {
      const hasPipeline = !!t.production_assets?.execution_snapshot?.externalSrtPipeline?.rows;
      if (hasPipeline) {
        const rowsCount = t.production_assets.execution_snapshot.externalSrtPipeline.rows.length;
        console.log(`- Theme: "${t.title}" -> Has pipeline with ${rowsCount} rows`);
        withPipeline++;
      } else {
        withoutPipeline++;
      }
    });
    
    console.log(`Summary for ${k}: ${withPipeline} with pipeline, ${withoutPipeline} without pipeline.`);
  });
} catch (e) {
  console.error(e);
}
