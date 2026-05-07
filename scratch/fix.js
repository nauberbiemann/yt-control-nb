const fs = require('fs');
let content = fs.readFileSync('./components/TTSModule.tsx', 'utf8');
content = content.replace(/\\`/g, '`').replace(/\\\$/g, '$');
fs.writeFileSync('./components/TTSModule.tsx', content);
console.log('Fixed file');
