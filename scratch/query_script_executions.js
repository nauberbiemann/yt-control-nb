const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Manually parse .env.local
const envPath = path.join(__dirname, '..', '.env.local');
const envContent = fs.readFileSync(envPath, 'utf8');
const env = {};
envContent.split('\n').forEach(line => {
  const match = line.match(/^\s*([^#=]+)\s*=\s*(.*)$/);
  if (match) {
    const key = match[1].trim();
    let val = match[2].trim();
    // strip quotes if present
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
});

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('Supabase credentials missing.');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  console.log('Querying projects...');
  const { data: projects, error: pErr } = await supabase
    .from('projects')
    .select('*');
    
  if (pErr) {
    console.error('Error fetching projects:', pErr);
    return;
  }
  
  console.log(`Found ${projects.length} projects:`);
  for (const proj of projects) {
    console.log(`- Project ID: ${proj.id}, Name: ${proj.name}`);
  }
  
  console.log('\nQuerying script executions...');
  const { data: execs, error: eErr } = await supabase
    .from('script_executions')
    .select('id, project_id, theme_id, created_at, updated_at');
    
  if (eErr) {
    console.error('Error fetching script_executions:', eErr);
  } else {
    console.log(`Found ${execs.length} executions:`);
    for (const ex of execs) {
      console.log(`- Exec ID: ${ex.id}, Proj ID: ${ex.project_id}, Theme ID: ${ex.theme_id}`);
    }
  }
  
  // Let's also check themes
  console.log('\nQuerying themes...');
  const { data: themes, error: tErr } = await supabase
    .from('themes')
    .select('id, project_id, title, status');
  if (tErr) {
    console.error('Error fetching themes:', tErr);
  } else {
    console.log(`Found ${themes.length} themes:`);
    for (const th of themes) {
      console.log(`- Theme ID: ${th.id}, Proj ID: ${th.project_id}, Title: ${th.title}`);
    }
  }
}

run();
