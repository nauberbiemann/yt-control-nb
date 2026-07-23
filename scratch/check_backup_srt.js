const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '../meu_diagnostico_metabolismo.json');
try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  const key = 'themes_5c24efcd-098c-41f1-88b2-b3173fbeb5eb';
  let themesList = data[key];
  if (typeof themesList === 'string') {
    themesList = JSON.parse(themesList);
  }
  
  const theme = themesList.find(t => t.title.includes('Preservação Muscular'));
  if (theme) {
    console.log('Title:', theme.title);
    const pipe = theme.production_assets?.execution_snapshot?.externalSrtPipeline;
    console.log('Type of externalSrtPipeline:', typeof pipe);
    if (pipe) {
      console.log('Keys of externalSrtPipeline:', Object.keys(pipe));
      // Print first few characters of values or lengths if arrays
      for (const k of Object.keys(pipe)) {
        const val = pipe[k];
        if (Array.isArray(val)) {
          console.log(`  - Key "${k}" is Array of length: ${val.length}`);
          if (val.length > 0) {
            console.log(`    First item keys:`, Object.keys(val[0]));
          }
        } else {
          console.log(`  - Key "${k}": type ${typeof val}, stringified snippet: ${JSON.stringify(val).slice(0, 100)}`);
        }
      }
    }
  } else {
    console.log('Theme not found in backup');
  }
} catch (e) {
  console.error(e);
}
