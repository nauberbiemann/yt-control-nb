const fs = require('fs');
const path = require('path');

const userProfile = process.env.USERPROFILE || 'C:\\Users\\naube';
console.log('User profile:', userProfile);

const searchPaths = [
  path.join(userProfile, 'AppData', 'Local', 'CapCut'),
  path.join(userProfile, 'AppData', 'Local', 'CapCut', 'User Data'),
  path.join(userProfile, 'AppData', 'Local', 'CapCut', 'User Data', 'CapCut Drafts'),
  path.join(userProfile, 'AppData', 'Local', 'CapCut', 'User Data', 'Projects', 'com.lveditor.draft'),
  'C:\\CapCut',
  'D:\\CapCut',
];

// Let's also check if there are any folders named "CapCut Drafts" in C:\Users\naube\AppData
function scanDirectory(dir, searchName) {
  try {
    const files = fs.readdirSync(dir);
    for (const file of files) {
      const fullPath = path.join(dir, file);
      try {
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
          if (file.toLowerCase() === searchName.toLowerCase()) {
            console.log('FOUND MATCHING FOLDER:', fullPath);
          } else if (!file.startsWith('.') && file !== 'node_modules' && file !== 'AppData') {
            // limit recursion to a few folders to avoid taking too long
            if (dir.split(path.sep).length < 6) {
              scanDirectory(fullPath, searchName);
            }
          }
        }
      } catch (e) {}
    }
  } catch (e) {}
}

console.log('Checking direct common paths...');
searchPaths.forEach(p => {
  if (fs.existsSync(p)) {
    console.log(`Exists: ${p}`);
    try {
      const children = fs.readdirSync(p);
      console.log(`  Contains ${children.length} items:`, children.slice(0, 10));
    } catch (e) {
      console.log('  Error reading:', e.message);
    }
  } else {
    console.log(`Not found: ${p}`);
  }
});

console.log('\nScanning User profile directories for "CapCut Drafts" or "com.lveditor.draft"...');
scanDirectory('C:\\Users\\naube', 'CapCut Drafts');
scanDirectory('C:\\Users\\naube', 'com.lveditor.draft');
scanDirectory('D:\\', 'CapCut Drafts');
console.log('Search finished.');
