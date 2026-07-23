const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const projectId = '5c24efcd-098c-41f1-88b2-b3173fbeb5eb';
  console.log('Querying Supabase themes for project:', projectId);
  
  const { data, error } = await supabase
    .from('themes')
    .select('id, title, status, production_assets')
    .eq('project_id', projectId);
    
  if (error) {
    console.error(error);
    return;
  }
  
  console.log(`\nFound ${data.length} themes in Supabase:`);
  data.forEach(t => {
    const assets = t.production_assets || {};
    const hasSnapshot = !!assets.execution_snapshot;
    const hasPipeline = !!assets.execution_snapshot?.externalSrtPipeline;
    const rowsLength = assets.execution_snapshot?.externalSrtPipeline?.rows?.length || 0;
    
    console.log(`- Theme: "${t.title}"`);
    console.log(`  ID: ${t.id}`);
    console.log(`  Status: ${t.status}`);
    console.log(`  Has snapshot: ${hasSnapshot}`);
    console.log(`  Has pipeline: ${hasPipeline} (rows: ${rowsLength})`);
  });
}
run();
