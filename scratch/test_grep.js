const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'components', 'ScriptEngine.tsx');
try {
  const content = fs.readFileSync(filePath, 'utf8');
  const lines = content.split('\n');
  console.log(`ScriptEngine.tsx has ${lines.length} lines.`);
  
  lines.forEach((line, index) => {
    if (line.toLowerCase().includes('videoformat')) {
      console.log(`Line ${index + 1}: ${line.trim()}`);
    }
  });
} catch (err) {
  console.error(err);
}
