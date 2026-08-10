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
  const projId = 'dd5d5231-cb89-4cf6-824f-08e217b31704';
  const themeId = 'd7123db3-b33c-4a4b-87ac-111aaa8ff482'; // Valid theme from project
  
  console.log(`Testing query for theme_id: ${themeId}...`);
  const { data: selectData, error: sErr } = await supabase
    .from('script_executions')
    .select('id')
    .eq('theme_id', themeId);
    
  if (sErr) {
    console.error('Select error:', sErr);
    return;
  }
  console.log('Select success, rows found:', selectData.length);

  // Let's test update
  if (selectData.length > 0) {
    const targetId = selectData[0].id;
    console.log(`Testing update on execution ID: ${targetId}...`);
    const { data: updateData, error: uErr } = await supabase
      .from('script_executions')
      .update({ updated_at: new Date().toISOString() })
      .eq('id', targetId)
      .select();
      
    if (uErr) {
      console.error('Update error:', uErr);
    } else {
      console.log('Update success, returned rows:', updateData?.length);
    }
  }
}

run();
