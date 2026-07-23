const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lprzecusqoeojjklsobc.supabase.co';
const supabaseKey = 'sb_publishable_QrmgBy5oT4djYBSffDrr5Q_98IdRUXa';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Querying Supabase for Whey Protein script execution...');
  
  const { data: executions, error } = await supabase
    .from('script_executions')
    .select('id, theme_id, execution_snapshot, updated_at')
    .order('updated_at', { ascending: false })
    .limit(10);
    
  if (error) {
    console.error('Error fetching script executions:', error);
    return;
  }
  
  console.log(`Found ${executions.length} recent executions.`);
  for (const exec of executions) {
    const snap = exec.execution_snapshot;
    if (snap && (snap.approvedTheme || '').toLowerCase().includes('whey')) {
      console.log(`\n========================================`);
      console.log(`Theme: ${snap.approvedTheme}`);
      console.log(`ID: ${exec.id}`);
      console.log(`Theme ID: ${exec.theme_id}`);
      console.log(`Updated At: ${exec.updated_at}`);
      console.log(`Snapshot Keys:`, Object.keys(snap));
      console.log(`\n--- raw externalFactCheckReport ---`);
      console.log(snap.externalFactCheckReport);
      console.log(`\n--- raw externalHumanizeReport ---`);
      console.log(snap.externalHumanizeReport);
      console.log(`========================================\n`);
      break;
    }
  }
}

check();
