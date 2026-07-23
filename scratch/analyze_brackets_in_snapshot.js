const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, 'necron_execution_snapshot.json');
try {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const txt = snapshot.externalSrtPipeline.videoPromptsTxt || '';
  
  const lines = txt.split('\n');
  console.log(`Analyzing videoPromptsTxt in database snapshot (${lines.length} lines)...`);
  
  let matchCount = 0;
  lines.forEach((line, index) => {
    if (line.includes('[') && line.includes(']')) {
      matchCount++;
      console.log(`Line ${index + 1}: ${line}`);
    }
  });
  console.log(`Total lines containing bracketed characters in database snapshot: ${matchCount}`);
} catch (err) {
  console.error(err);
}
