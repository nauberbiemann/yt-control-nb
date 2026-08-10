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
  const projectIds = [
    'dd5d5231-cb89-4cf6-824f-08e217b31704',
    '33998a3d-defb-4169-a6f1-dbceaeb5e9aa',
    '2847bb4b-d009-4f03-a0b6-df86c10faa20'
  ];

  for (const projId of projectIds) {
    console.log(`\n======================================================`);
    console.log(`Checking script executions for project: ${projId}`);
    console.log(`======================================================`);
    const { data: execs, error: eErr } = await supabase
      .from('script_executions')
      .select('id, project_id, theme_id, execution_snapshot')
      .eq('project_id', projId);

    if (eErr) {
      console.error('Error fetching executions:', eErr);
    } else {
      console.log(`Found ${execs.length} executions:`);
      execs.forEach(exec => {
        console.log(` - ID: ${exec.id}, Theme ID: ${exec.theme_id}`);
        console.log(`   Has externalSrtPipeline: ${!!exec.execution_snapshot?.externalSrtPipeline}`);
        console.log(`   Has postScriptPackage: ${!!exec.execution_snapshot?.postScriptPackage}`);
      });
    }
  }
}

run();
