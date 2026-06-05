const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const { data, error } = await supabase.from('themes').select('id, title, production_assets').ilike('title', '%Preservação Muscular%');
  if (error) {
    console.error(error);
    return;
  }
  if (data && data.length > 0) {
    const t = data[0];
    console.log('Title:', t.title);
    console.log('Has production_assets:', !!t.production_assets);
    if (t.production_assets) {
      console.log('production_assets keys:', Object.keys(t.production_assets));
      if (t.production_assets.execution_snapshot) {
        console.log('execution_snapshot keys:', Object.keys(t.production_assets.execution_snapshot));
        console.log('has externalSrtPipeline in remote:', 'externalSrtPipeline' in t.production_assets.execution_snapshot);
        console.log('externalSrtPipeline value in remote:', t.production_assets.execution_snapshot.externalSrtPipeline);
        console.log('has scriptBlocks in remote:', 'scriptBlocks' in t.production_assets.execution_snapshot);
        console.log('scriptBlocks length in remote:', t.production_assets.execution_snapshot.scriptBlocks?.length);
      }
    }
  } else {
    console.log('No theme found matching "Preservação Muscular"');
  }
}
run();
