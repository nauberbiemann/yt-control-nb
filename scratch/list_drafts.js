const fs = require('fs');
const path = require('path');

const pathsToCheck = [
  'C:\\Users\\naube\\AppData\\Local\\CapCut\\User Data\\CapCut Drafts',
  'D:\\onedrive\\Downloads\\Capcut\\CapCut Drafts',
];

pathsToCheck.forEach(p => {
  console.log(`\nChecking: ${p}`);
  if (fs.existsSync(p)) {
    try {
      const items = fs.readdirSync(p);
      console.log(`Contains ${items.length} items:`);
      items.forEach(item => {
        const full = path.join(p, item);
        const stat = fs.statSync(full);
        if (stat.isDirectory()) {
          console.log(`  [DIR]  ${item} (modified: ${stat.mtime.toLocaleString()})`);
          // Check if it contains draft_content.json
          const jsonFile = path.join(full, 'draft_content.json');
          if (fs.existsSync(jsonFile)) {
            console.log(`         -> HAS draft_content.json! Size: ${fs.statSync(jsonFile).size} bytes`);
          }
        }
      });
    } catch (err) {
      console.log('Error reading:', err.message);
    }
  } else {
    console.log('Path does not exist.');
  }
});
