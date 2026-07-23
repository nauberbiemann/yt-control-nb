const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = 'https://lprzecusqoeojjklsobc.supabase.co';
const supabaseKey = 'sb_publishable_QrmgBy5oT4djYBSffDrr5Q_98IdRUXa';
const supabase = createClient(supabaseUrl, supabaseKey);

async function check() {
  console.log('Querying Supabase themes with non-UUID id...');
  const { data, error } = await supabase
    .from('themes')
    .select('id')
    .eq('id', 'theme-1')
    .single();
    
  if (error) {
    console.error('Supabase query returned error:', error);
  } else {
    console.log('Data:', data);
  }
}

check();
