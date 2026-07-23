const fs = require('fs');
const path = require('path');

console.log('Scanning C:\\Users for CapCut Drafts...');

try {
  const users = fs.readdirSync('C:\\Users');
  users.forEach(user => {
    const draftsPath = path.join('C:\\Users', user, 'AppData', 'Local', 'CapCut', 'User Data', 'CapCut Drafts');
    if (fs.existsSync(draftsPath)) {
      console.log(`FOUND drafts folder for user "${user}":`, draftsPath);
      try {
        const items = fs.readdirSync(draftsPath);
        console.log(`  Contains ${items.length} items.`);
        const match0608 = items.find(x => x === '0608');
        if (match0608) {
          console.log('  -> [0608] FOLDER EXISTS HERE!');
        }
      } catch (e) {
        console.log('  Error reading folder:', e.message);
      }
    }
  });
} catch (err) {
  console.error(err);
}
console.log('Scan finished.');
