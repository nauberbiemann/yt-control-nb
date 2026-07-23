const fs = require('fs');
const path = require('path');

const root = 'D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\assets\\ferramenta-legendas';

function walk(dir) {
  if (!fs.existsSync(dir)) {
    console.log(`Directory does not exist: ${dir}`);
    return [];
  }
  let results = [];
  const list = fs.readdirSync(dir);
  list.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    if (stat && stat.isDirectory()) {
      results = results.concat(walk(filePath));
    } else {
      if (file.includes('fim_imperio') || file.includes('trono_ouro')) {
        results.push(filePath);
      }
    }
  });
  return results;
}

console.log('Searching in PIPELINE_ROOT...');
const files = walk(root);
console.log(`Found ${files.length} matching files:`);
files.forEach(f => console.log(`- ${f}`));
