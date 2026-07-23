const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const env = fs.readFileSync('.env.local', 'utf8').split('\n').reduce((acc, line) => {
  const match = line.match(/^([^=]+)=(.*)$/);
  if (match) acc[match[1].trim()] = match[2].trim().replace(/^"(.*)"$/, '$1');
  return acc;
}, {});

const supabase = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

async function run() {
  console.log('Querying all projects...');
  const { data: projects, error: projErr } = await supabase
    .from('projects')
    .select('id, name');

  if (projErr) {
    console.error('Error fetching projects:', projErr);
    return;
  }

  console.log(`Found ${projects.length} projects in Supabase:`);
  projects.forEach(p => console.log(`- ID: ${p.id}, Name: ${p.name}`));
}
run();
