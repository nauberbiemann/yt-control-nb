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
  
  console.log('Themes in backup (Metabolismo de Ouro):');
  themesList.forEach(t => {
    const blockCount = t.production_assets?.block_count || t.production_assets?.execution_snapshot?.scriptBlocks?.length;
    console.log(`- "${t.title}"`);
    console.log(`  Block Count: ${blockCount}`);
  });
  
  // Let's check other themes in other projects in case
  const themeKeys = Object.keys(data).filter(k => k.startsWith('themes_'));
  themeKeys.forEach(tk => {
    let lst = data[tk];
    if (typeof lst === 'string') lst = JSON.parse(lst);
    console.log(`\n=== Project key: ${tk} ===`);
    lst.forEach(t => {
      const blockCount = t.production_assets?.block_count || t.production_assets?.execution_snapshot?.scriptBlocks?.length;
      if (blockCount === 7) {
        console.log(`- "${t.title}" has 7 blocks!`);
      }
    });
  });
} catch (e) {
  console.error(e);
}
