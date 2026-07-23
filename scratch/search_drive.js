const fs = require('fs');
const path = require('path');

const root = 'D:\\onedrive\\Downloads';

function walk(dir, depth = 0) {
  if (depth > 5) return []; // Limit depth to prevent infinite recursion or very slow execution
  if (!fs.existsSync(dir)) return [];
  
  let results = [];
  try {
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const filePath = path.join(dir, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat && stat.isDirectory()) {
          // Skip node_modules or system folders
          if (file !== 'node_modules' && !file.startsWith('.')) {
            results = results.concat(walk(filePath, depth + 1));
          }
        } else {
          const lower = file.toLowerCase();
          if (lower.includes('fim_imperio') || lower.includes('trono_ouro') || lower.includes('fim-imperio') || lower.includes('trono-ouro')) {
            results.push(filePath);
          }
        }
      } catch (err) {
        // ignore read errors on files
      }
    });
  } catch (err) {
    // ignore read errors on dirs
  }
  return results;
}

console.log('Searching for files on D:\\onedrive\\Downloads...');
const foundFiles = walk(root);
console.log(`Found ${foundFiles.length} matching files:`);
foundFiles.forEach(f => console.log(`- ${f}`));
