const fs = require('fs');
const path = require('path');

const snapshotPath = path.join(__dirname, 'necron_execution_snapshot.json');
try {
  const snapshot = JSON.parse(fs.readFileSync(snapshotPath, 'utf8'));
  
  console.log('=== postScriptPackage keys ===');
  const packageData = snapshot.postScriptPackage || {};
  console.log(Object.keys(packageData));
  
  if (packageData.project) {
    console.log('Project keys:', Object.keys(packageData.project));
    console.log('Project name:', packageData.project.name);
  }
  
  // Search for the visualBlueprint or cast in the whole snapshot object
  function searchKey(obj, path = '') {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'object') {
      Object.keys(obj).forEach(k => {
        if (k.toLowerCase().includes('blueprint') || k.toLowerCase().includes('cast') || k.toLowerCase().includes('elenco') || k.toLowerCase().includes('character')) {
          console.log(`Found key "${k}" at path: ${path}.${k}`);
          console.log('Value:', JSON.stringify(obj[k], null, 2));
        }
        searchKey(obj[k], `${path}.${k}`);
      });
    }
  }
  
  console.log('\nSearching for blueprint/cast/character/elenco keys:');
  searchKey(snapshot);
  
} catch (err) {
  console.error(err);
}
