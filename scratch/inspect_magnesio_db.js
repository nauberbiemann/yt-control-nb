const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1]] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const themeId = 'dff763eb-6dd0-4e43-99f2-4ed08f9aed7c';
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
  console.log('Supabase externalSrtPipeline details:');
  console.log('- Is null/undefined:', !pipe);
  if (pipe) {
    console.log('- Rows length:', pipe.rows?.length);
    if (pipe.rows && pipe.rows.length > 0) {
      console.log('Sample rows around 21 to 33:');
      for (let i = 20; i <= 32; i++) {
        if (pipe.rows[i]) {
          console.log(`Row ${pipe.rows[i].rowNumber}: asset="${pipe.rows[i].asset}", prompt="${pipe.rows[i].prompt?.slice(0, 50)}..."`);
        }
      }
    }
  }
}
run();
