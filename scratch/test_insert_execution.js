const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const projectId = '5c24efcd-098c-41f1-88b2-b3173fbeb5eb'; // Metabolismo
  const themeId = '1c8a70a4-6ba8-4621-ae7a-e54adc391562'; // Desmistificando Suplementos
  
  console.log('Testing insert into script_executions...');
  const { data, error } = await supabase
    .from('script_executions')
    .insert({
      project_id: projectId,
      theme_id: themeId,
      execution_snapshot: { test: true }
    })
    .select();
    
  if (error) {
    console.error('Insert Failed:', error);
  } else {
    console.log('Insert Succeeded! Data:', data);
    
    // Clean up
    console.log('Cleaning up test row...');
    const { error: delErr } = await supabase
      .from('script_executions')
      .delete()
      .eq('theme_id', themeId);
    if (delErr) console.error('Cleanup Failed:', delErr);
    else console.log('Cleanup Succeeded!');
  }
}
run();
