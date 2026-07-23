const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lprzecusqoeojjklsobc.supabase.co';
const supabaseKey = 'sb_publishable_QrmgBy5oT4djYBSffDrr5Q_98IdRUXa';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Querying Supabase for ALL projects...');
  const { data: projects, error } = await supabase
    .from('projects')
    .select('id, name');
    
  if (error) {
    console.error('Error fetching projects:', error);
  } else {
    console.log(`Found ${projects.length} projects:`);
    projects.forEach(p => {
      console.log(`- [${p.id}] Name: ${p.name}`);
    });
  }
}

check();
