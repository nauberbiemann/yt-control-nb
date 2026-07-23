const fs = require('fs');
const path = require('path');

const paths = [
  'C:\\Users\\naube\\AppData\\Local\\CapCut\\User Data\\CapCut Drafts\\War BR V127\\draft_content.json',
  'C:\\Users\\naube\\AppData\\Local\\CapCut\\User Data\\CapCut Drafts\\0608\\draft_content.json'
];

paths.forEach(filePath => {
  console.log(`\nReading path: ${filePath}`);
  if (fs.existsSync(filePath)) {
    try {
      const stats = fs.statSync(filePath);
      console.log(`  File size: ${stats.size} bytes`);
      const content = fs.readFileSync(filePath, 'utf8');
      const project = JSON.parse(content);
      console.log('  Top-level keys:', Object.keys(project));
      
      if (project.tracks) {
        console.log(`  Tracks count: ${project.tracks.length}`);
        project.tracks.forEach((track, i) => {
          console.log(`    Track ${i+1}: Type=${track.type}, Segments=${track.segments ? track.segments.length : 0}`);
        });
      }
    } catch (err) {
      console.error('  Error parsing/reading:', err.message);
    }
  } else {
    console.log('  File does not exist.');
  }
});
