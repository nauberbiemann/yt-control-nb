const fs = require('fs');
const path = require('path');

const backupPath = path.join(__dirname, '..', 'BKP', 'yt_control_backup_2026-06-03.json');
console.log('Reading backup from:', backupPath);

try {
  const data = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
  
  function deepSearch(obj, pathStr = '') {
    if (obj === null || obj === undefined) return;
    
    if (typeof obj === 'string') {
      const lower = obj.toLowerCase();
      if (lower.includes('tecno-sacerdote') || lower.includes('inquisidor') || lower.includes('necron') || lower.includes('despertar') || lower.includes('sacerdote')) {
        console.log(`Match at [${pathStr}]:`, obj.slice(0, 300));
      }
    } else if (Array.isArray(obj)) {
      obj.forEach((item, index) => {
        deepSearch(item, `${pathStr}[${index}]`);
      });
    } else if (typeof obj === 'object') {
      Object.keys(obj).forEach(key => {
        deepSearch(obj[key], `${pathStr}.${key}`);
      });
    }
  }

  deepSearch(data);
  console.log('Search finished.');
} catch (err) {
  console.error('Error:', err);
}
