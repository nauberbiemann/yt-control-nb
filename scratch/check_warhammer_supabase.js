const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lprzecusqoeojjklsobc.supabase.co';
const supabaseKey = 'sb_publishable_QrmgBy5oT4djYBSffDrr5Q_98IdRUXa';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  const projectId = '9d1b5e3d-c0bf-4931-a30e-0f297232ba89';
  console.log('Querying Supabase themes for Warhammer project:', projectId);
  
  const { data: themes, error } = await supabase
    .from('themes')
    .select('id, title, status')
    .eq('project_id', projectId);
    
  if (error) {
    console.error('Error fetching Warhammer themes:', error);
  } else {
    console.log(`Found ${themes.length} themes in Supabase for Warhammer:`);
    themes.forEach(t => {
      console.log(`- [${t.id}] Title: "${t.title}", Status: ${t.status}`);
    });
  }
}

check();
