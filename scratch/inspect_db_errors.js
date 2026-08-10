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
  // Let's check themes for dd5d5231-cb89-4cf6-824f-08e217b31704
  const projId = 'dd5d5231-cb89-4cf6-824f-08e217b31704';
  const { data: themes, error: tErr } = await supabase
    .from('themes')
    .select('id, title, status')
    .eq('project_id', projId);

  if (tErr) {
    console.error('Error fetching themes:', tErr);
  } else {
    console.log(`Found ${themes.length} themes for project ${projId}:`);
    themes.forEach(t => {
      console.log(` - Theme ID: ${t.id}, Title: "${t.title}", Status: ${t.status}`);
    });
  }
}

run();
