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
  console.log(`Deduplicating and verifying theme ID ${themeId}...`);

  // 1. Query script_executions for the theme
  const { data: execs, error: fetchErr } = await supabase
    .from('script_executions')
    .select('id, theme_id, execution_snapshot, updated_at')
    .eq('theme_id', themeId)
    .order('updated_at', { ascending: false });

  if (fetchErr) {
    console.error('Error fetching:', fetchErr);
    return;
  }

  console.log(`Found ${execs.length} records in database.`);
  if (execs.length === 0) {
    console.log('No records found to deduplicate.');
    return;
  }

  // Pick the latest
  const latest = execs[0];
  console.log(`Latest Record ID: ${latest.id}`);
  console.log(`Latest Record Updated At: ${latest.updated_at}`);
  console.log(`Latest Has externalSrtPipeline:`, !!latest.execution_snapshot?.externalSrtPipeline);
  console.log(`Latest Has postScriptPackage:`, !!latest.execution_snapshot?.postScriptPackage);

  // 2. Delete duplicates if more than 1
  if (execs.length > 1) {
    const duplicateIds = execs.slice(1).map(item => item.id);
    console.log(`Deleting ${duplicateIds.length} duplicate records:`, duplicateIds);

    const { error: delErr } = await supabase
      .from('script_executions')
      .delete()
      .in('id', duplicateIds);

    if (delErr) {
      console.error('Error deleting duplicates:', delErr);
    } else {
      console.log('Duplicates deleted successfully.');
    }
  }

  // 3. Verify that querying again returns exactly 1 record and is single-like shape queryable
  console.log('\nVerifying single-like list query...');
  const { data: finalExecs, error: finalErr } = await supabase
    .from('script_executions')
    .select('execution_snapshot')
    .eq('theme_id', themeId)
    .order('updated_at', { ascending: false });

  if (finalErr) {
    console.error('Verification query failed:', finalErr);
  } else {
    console.log(`Verification: Found ${finalExecs.length} records remaining.`);
    if (finalExecs.length > 0) {
      const snap = finalExecs[0].execution_snapshot || {};
      console.log(`Has externalSrtPipeline:`, !!snap.externalSrtPipeline);
      if (snap.externalSrtPipeline) {
        console.log(`Rows count:`, snap.externalSrtPipeline.rows?.length);
      }
    }
  }
}
run();
