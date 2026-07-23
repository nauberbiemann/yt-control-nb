const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'BKP', 'yt_control_backup_2026-06-03.json');

try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  let list = data['ws_narrative_9d1b5e3d-c0bf-4931-a30e-0f297232ba89'];
  console.log('Type of list:', typeof list);
  if (typeof list === 'string') {
    list = JSON.parse(list);
  }
  
  const entries = Array.isArray(list) ? list : Object.values(list);
  console.log(`Found ${entries.length} items`);
  
  let matchesCount = 0;
  entries.forEach((item, index) => {
    const str = JSON.stringify(item);
    if (str.toLowerCase().includes('tecno-sacerdote') || str.toLowerCase().includes('inquisidor') || str.toLowerCase().includes('necron') || str.toLowerCase().includes('despertar') || str.toLowerCase().includes('sacerdote')) {
      matchesCount++;
      console.log(`\n[Item ${index}] ID: ${item.id}, Type: ${item.type}, Name: ${item.name}`);
      Object.keys(item).forEach(k => {
        const val = item[k];
        if (typeof val === 'string' && val.length > 50) {
          console.log(`     ${k}: ${val.slice(0, 300)}...`);
        } else {
          console.log(`     ${k}:`, val);
        }
      });
    }
  });
  console.log(`Total matches: ${matchesCount}`);
} catch (err) {
  console.error(err);
}
