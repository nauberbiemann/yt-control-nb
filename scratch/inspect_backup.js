const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '../BKP/yt_control_backup_2026-06-03.json');
const content = fs.readFileSync(backupPath, 'utf8');
const data = JSON.parse(content);

console.log('Backup keys count:', Object.keys(data).length);
console.log('Backup keys:');
Object.keys(data).forEach(k => {
  console.log(`- ${k} (size: ${data[k].length} chars)`);
});

// Search for Warhammer in values
console.log('\nSearching for "Warhammer" in backup content...');
Object.keys(data).forEach(key => {
  const value = data[key];
  if (value.toLowerCase().includes('warhammer')) {
    console.log(`Found "warhammer" (case-insensitive) in key: ${key}`);
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) {
        console.log(`- It is an array with ${parsed.length} items.`);
        parsed.forEach((item, idx) => {
          if (JSON.stringify(item).toLowerCase().includes('warhammer')) {
            console.log(`  - Item [${idx}] contains warhammer:`, item.name || item.title || item.id || item);
          }
        });
      } else {
        console.log(`- It is an object:`, parsed.name || parsed.title || parsed.id || parsed);
      }
    } catch {
      console.log(`- Raw text contains warhammer.`);
    }
  }
});
