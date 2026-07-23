const fs = require('fs');
const path = require('path');

console.log('Searching for folder "0608" containing "draft_content.json"...');

const searchDrives = ['C:\\', 'D:\\'];

function scan(dir, depth = 0) {
  if (depth > 6) return; // limit depth to prevent slow runs
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const full = path.join(dir, file);
      try {
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          if (file === '0608') {
            const jsonFile = path.join(full, 'draft_content.json');
            if (fs.existsSync(jsonFile)) {
              console.log('FOUND ACTIVE DRAFT FOLDER:', full);
              console.log('  JSON File size:', fs.statSync(jsonFile).size);
            }
          } else if (!file.startsWith('.') && file !== 'node_modules' && file !== 'AppData' && file !== '$RECYCLE.BIN' && file !== 'System Volume Information') {
            scan(full, depth + 1);
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

searchDrives.forEach(drive => {
  console.log(`Scanning drive ${drive}...`);
  scan(drive);
});

console.log('Search finished.');
