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
  console.log(`Checking theme: ${themeId}`);
  
  const { data: theme, error: tErr } = await supabase
    .from('themes')
    .select('*')
    .eq('id', themeId)
    .single();
    
  if (tErr) {
    console.error('Error fetching theme:', tErr);
  } else {
    console.log('Theme from DB:', {
      id: theme.id,
      title: theme.title,
      status: theme.status,
      target_publish_date: theme.target_publish_date,
      has_assets: !!theme.production_assets,
      assets_source: theme.production_assets?.source,
      has_compact_snapshot: !!theme.production_assets?.execution_snapshot
    });
  }

  console.log(`\nChecking script execution for theme: ${themeId}`);
  const { data: exec, error: eErr } = await supabase
    .from('script_executions')
    .select('*')
    .eq('theme_id', themeId)
    .single();
    
  if (eErr) {
    console.error('Error fetching execution:', eErr);
  } else {
    console.log('Execution row found:', {
      id: exec.id,
      project_id: exec.project_id,
      theme_id: exec.theme_id,
      has_snapshot: !!exec.execution_snapshot,
      has_srt_pipeline: !!exec.execution_snapshot?.externalSrtPipeline,
      has_post_package: !!exec.execution_snapshot?.postScriptPackage
    });
  }
}

run();
