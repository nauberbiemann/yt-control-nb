const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lprzecusqoeojjklsobc.supabase.co';
const supabaseKey = 'sb_publishable_QrmgBy5oT4djYBSffDrr5Q_98IdRUXa';

const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Querying Supabase for ALL script executions...');
  
  const { data: executions, error: execErr } = await supabase
    .from('script_executions')
    .select('id, project_id, theme_id, status, created_at, execution_snapshot')
    .limit(100);
    
  if (execErr) {
    console.error('Error fetching script executions:', execErr);
  } else {
    console.log(`Found ${executions.length} script executions in database:`);
    executions.forEach(e => {
      const hasPipeline = !!e.execution_snapshot?.externalSrtPipeline;
      console.log(`- [${e.id}] Project ID: ${e.project_id}, Theme ID: ${e.theme_id}, Status: ${e.status}, Has externalSrtPipeline: ${hasPipeline}`);
    });
  }
}

check();
