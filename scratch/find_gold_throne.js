const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  const themeId = '6547b940-d8ba-40a4-80af-af5c159007ca';
  const projectId = '2847bb4b-d009-4f03-a0b6-df86c10faa20';

  console.log('Querying Theme details...');
  const { data: theme, error: themeErr } = await supabase
    .from('themes')
    .select('id, title, status, project_id, production_assets')
    .eq('id', themeId)
    .single();

  if (themeErr) {
    console.error('Theme fetch error:', themeErr.message);
  } else {
    console.log(`Theme Title: "${theme.title}"`);
    console.log(`Theme ID: ${theme.id}`);
    console.log(`Status: ${theme.status}`);
    console.log(`Project ID: ${theme.project_id}`);
    console.log(`Has snapshot in themes:`, !!theme.production_assets?.execution_snapshot);
    if (theme.production_assets?.execution_snapshot) {
      console.log(`- snapshot keys:`, Object.keys(theme.production_assets.execution_snapshot));
      console.log(`- _hasSrtPipeline:`, theme.production_assets.execution_snapshot._hasSrtPipeline);
    }
  }

  console.log('\nQuerying script_executions for theme...');
  const { data: execs, error: execErr } = await supabase
    .from('script_executions')
    .select('id, theme_id, execution_snapshot, updated_at')
    .eq('theme_id', themeId);

  if (execErr) {
    console.error('Exec fetch error:', execErr.message);
  } else {
    console.log(`Found ${execs.length} executions for theme:`);
    execs.forEach((exec, idx) => {
      console.log(`\nExecution #${idx + 1}:`);
      console.log(`  ID: ${exec.id}`);
      console.log(`  Updated At: ${exec.updated_at}`);
      const snap = exec.execution_snapshot || {};
      console.log(`  Snapshot keys:`, Object.keys(snap));
      console.log(`  Has externalSrtPipeline:`, !!snap.externalSrtPipeline);
      if (snap.externalSrtPipeline) {
        console.log(`  - rows:`, snap.externalSrtPipeline.rows?.length);
        console.log(`  - generatedAt:`, snap.externalSrtPipeline.generatedAt);
      }
    });
  }
}
run();
