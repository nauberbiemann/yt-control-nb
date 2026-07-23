const fs = require('fs');
const path = require('path');

const filePath = 'C:\\Users\\naube\\AppData\\Local\\CapCut\\User Data\\CapCut Drafts\\Fabrica V33\\draft_content.json';

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const project = JSON.parse(content);
  
  console.log('--- TRACKS SUMMARY ---');
  project.tracks.forEach((track, idx) => {
    console.log(`Track ${idx}: Type=${track.type}, SegmentsCount=${track.segments ? track.segments.length : 0}`);
    if (track.type === 'video' && track.segments && track.segments.length > 0) {
      console.log('Sample Video Segment:', JSON.stringify(track.segments[0], null, 2));
    }
  });

  console.log('\n--- MATERIALS SUMMARY ---');
  if (project.materials.videos && project.materials.videos.length > 0) {
    console.log('Sample Video Material:', JSON.stringify(project.materials.videos[0], null, 2));
  }
} catch (e) {
  console.error(e);
}
