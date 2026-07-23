const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\naube\\AppData\\Local\\CapCut\\User Data\\CapCut Drafts\\Fabrica V33\\draft_content.json';
console.log('Reading CapCut project from:', filePath);

try {
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const project = JSON.parse(fileContent);
  
  console.log('Top-level keys:', Object.keys(project));
  
  // Analyze tracks
  if (project.tracks) {
    console.log(`\nFound ${project.tracks.length} tracks.`);
    project.tracks.forEach((track, i) => {
      console.log(`Track ${i+1}: ID=${track.id}, Type=${track.type}, Segments Count=${track.segments ? track.segments.length : 0}`);
      if (track.segments && track.segments.length > 0) {
        console.log('  Sample Segment keys:', Object.keys(track.segments[0]));
        console.log('  Sample Segment:', JSON.stringify(track.segments[0], null, 2).slice(0, 400) + '...\n');
      }
    });
  }
  
  // Analyze materials
  if (project.materials) {
    console.log('\nMaterials keys:', Object.keys(project.materials));
    Object.keys(project.materials).forEach(mKey => {
      const matList = project.materials[mKey];
      console.log(`  Material [${mKey}] is Array:`, Array.isArray(matList), 'Length:', matList ? matList.length : 0);
      if (Array.isArray(matList) && matList.length > 0) {
        console.log(`    Sample [${mKey}] item keys:`, Object.keys(matList[0]));
        console.log(`    Sample [${mKey}] item:`, JSON.stringify(matList[0], null, 2).slice(0, 300) + '...\n');
      }
    });
  }
  
} catch (err) {
  console.error('Error:', err);
}
