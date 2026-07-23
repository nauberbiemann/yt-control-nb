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

const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

async function run() {
  const projectId = '9d1b5e3d-c0bf-4931-a30e-0f297232ba89';
  console.log(`Querying themes for project ${projectId}...`);
  const { data: themes, error: tErr } = await supabase
    .from('themes')
    .select('*')
    .eq('project_id', projectId);
    
  if (tErr) {
    console.error('Error:', tErr);
    return;
  }
  
  console.log(`Found ${themes.length} themes.`);
  
  // Find the Necron theme
  const necronTheme = themes.find(t => t.title.toLowerCase().includes('necron') || t.title.toLowerCase().includes('despertar'));
  if (necronTheme) {
    console.log('\n=== FOUND THEME ===');
    console.log('ID:', necronTheme.id);
    console.log('Title:', necronTheme.title);
    
    // Now fetch the script execution snapshot
    console.log(`\nQuerying script_executions for theme ${necronTheme.id}...`);
    const { data: exec, error: eErr } = await supabase
      .from('script_executions')
      .select('*')
      .eq('theme_id', necronTheme.id)
      .maybeSingle();
      
    if (eErr) {
      console.error('Error fetching execution:', eErr);
      return;
    }
    
    if (exec) {
      console.log('Found script execution!');
      console.log('Created At:', exec.created_at);
      console.log('Snapshot keys:', Object.keys(exec.execution_snapshot || {}));
      
      // Save snapshot to a scratch file so we can view/inspect it
      const outPath = path.join(__dirname, 'necron_execution_snapshot.json');
      fs.writeFileSync(outPath, JSON.stringify(exec.execution_snapshot, null, 2), 'utf8');
      console.log('Saved execution snapshot to:', outPath);
    } else {
      console.log('No script execution found for this theme in Supabase.');
    }
  } else {
    console.log('Necron theme not found.');
    // List all theme titles just in case
    themes.forEach(t => console.log(`- ${t.title} (${t.id})`));
  }
}

run();
