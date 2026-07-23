const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const themeId = 'd0dafbe7-6adb-49b4-b175-ca020206fbd4';
  const { data, error } = await supabase
    .from('themes')
    .select('production_assets')
    .eq('id', themeId)
    .single();
    
  if (error) {
    console.error(error);
    return;
  }
  
  const pipe = data.production_assets?.execution_snapshot?.externalSrtPipeline;
  console.log('Remote externalSrtPipeline details:');
  console.log('- Is null/undefined:', !pipe);
  if (pipe) {
    console.log('- Keys:', Object.keys(pipe));
    console.log('- Rows type:', typeof pipe.rows, Array.isArray(pipe.rows) ? '(Array)' : '(Not Array)');
    console.log('- Rows length:', pipe.rows?.length);
    if (pipe.rows && pipe.rows.length > 0) {
      console.log('- First row sample:', pipe.rows[0]);
    }
  }
}
run();
