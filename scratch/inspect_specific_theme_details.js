const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const themeId = 'd7123db3-b33c-4a4b-87ac-111aaa8ff482';
  
  const { data: theme, error: tErr } = await supabase
    .from('themes')
    .select('production_assets')
    .eq('id', themeId)
    .single();
    
  if (tErr) {
    console.error('Error:', tErr);
    return;
  }

  const assets = theme.production_assets || {};
  const snapshot = assets.execution_snapshot || {};
  
  console.log('--- Themes Table production_assets ---');
  console.log('Keys in production_assets:', Object.keys(assets));
  console.log('Keys in execution_snapshot:', Object.keys(snapshot));
  console.log('has externalSrtPipeline in execution_snapshot:', 'externalSrtPipeline' in snapshot);
  console.log('has postScriptPackage in execution_snapshot:', 'postScriptPackage' in snapshot);
  
  console.log('\nexternalSrtPipeline:', snapshot.externalSrtPipeline);
  console.log('postScriptPackage:', snapshot.postScriptPackage);
  console.log('scriptBlocks:', snapshot.scriptBlocks);
}

run();
