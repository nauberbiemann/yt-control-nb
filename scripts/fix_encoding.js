const fs = require('fs');

const files = [
  'app/page.tsx',
  'components/ContentHub.tsx',
  'components/ScriptEngine.tsx',
];

const fixes = [
  ['Ã¡', 'á'], ['Ã©', 'é'], ['Ã­', 'í'], ['Ã³', 'ó'], ['Ãº', 'ú'],
  ['Ã£', 'ã'], ['Ã§', 'ç'], ['Ã¢', 'â'], ['Ã´', 'ô'], ['Ãµ', 'õ'],
  ['Ã‡', 'Ç'], ['Ã‰', 'É'], ['Ã"', 'Ó'], ['Ãƒ', 'Ã'], ['Ã€', 'À'],
];

files.forEach(filepath => {
  try {
    let content = fs.readFileSync(filepath, 'utf8');
    let changed = 0;
    fixes.forEach(([from, to]) => {
      const before = content;
      content = content.split(from).join(to);
      if (content !== before) {
        const count = (before.split(from).length - 1);
        console.log(`  ${filepath}: "${from}" -> "${to}" (${count}x)`);
        changed += count;
      }
    });
    if (changed > 0) {
      fs.writeFileSync(filepath, content, 'utf8');
      console.log('OK ' + filepath + ': ' + changed + ' fixes');
    } else {
      console.log('CLEAN ' + filepath);
    }
  } catch(e) {
    console.log('ERROR ' + filepath + ': ' + e.message);
  }
});
