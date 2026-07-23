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
    .select('id, title, status, production_assets')
    .eq('id', themeId)
    .single();
    
  if (error) {
    console.error('Error:', error);
    return;
  }
  
  console.log('Theme Title:', data.title);
  console.log('Type of production_assets:', typeof data.production_assets, Array.isArray(data.production_assets) ? '(Array)' : '(Object)');
  console.log('production_assets keys or keys of first item:', 
    Array.isArray(data.production_assets) ? Object.keys(data.production_assets[0] || {}) : Object.keys(data.production_assets || {})
  );
  if (Array.isArray(data.production_assets)) {
    console.log('First element source:', data.production_assets[0]?.source);
  } else {
    console.log('Object source:', data.production_assets?.source);
  }
}
run();
