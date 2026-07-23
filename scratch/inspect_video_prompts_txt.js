const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, 'necron_execution_snapshot.json');
try {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  const txt = snapshot.externalSrtPipeline.videoPromptsTxt;
  console.log('Type of videoPromptsTxt:', typeof txt);
  if (typeof txt === 'string') {
    console.log('Length of text:', txt.length);
    console.log('First 500 characters of videoPromptsTxt:');
    console.log(txt.slice(0, 500));
  } else if (Array.isArray(txt)) {
    console.log('Length of array:', txt.length);
    console.log('First 5 items:');
    console.log(txt.slice(0, 5));
  } else {
    console.log('Value:', txt);
  }
} catch (err) {
  console.error(err);
}
