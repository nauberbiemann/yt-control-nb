const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const projectId = '08124252-c007-48ee-81ba-d075e26a41ab';
  console.log('Querying Supabase for DevZen themes:', projectId);
  
  const { data, error } = await supabase
    .from('themes')
    .select('id, title, status, production_assets')
    .eq('project_id', projectId);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`Found ${data.length} themes in Supabase:`);
  data.forEach(t => {
    const hasAssets = !!t.production_assets;
    const hasSnapshot = !!t.production_assets?.execution_snapshot;
    const hasSrtPipeline = !!t.production_assets?.execution_snapshot?.externalSrtPipeline;
    const hasScriptBlocks = !!t.production_assets?.execution_snapshot?.scriptBlocks;
    
    console.log(`- Title: "${t.title}"`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Has production_assets: ${hasAssets}`);
    if (hasAssets) {
      console.log(`    Has execution_snapshot: ${hasSnapshot}`);
      if (hasSnapshot) {
        console.log(`      Has externalSrtPipeline: ${hasSrtPipeline}`);
        console.log(`      Has scriptBlocks: ${hasScriptBlocks}`);
      }
    }
  });
}
run();
