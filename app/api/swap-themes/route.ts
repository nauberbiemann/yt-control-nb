import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, projectA, projectB } = body;
    const supabase = createClient(supabaseUrl, supabaseKey);

    if (action === 'diagnose') {
      const { data: projects } = await supabase.from('projects').select('id, name, project_name');
      
      const result: any = { projects: [] };
      
      for (const p of (projects || [])) {
        const { data: themes } = await supabase
          .from('themes')
          .select('id, title, project_id')
          .eq('project_id', p.id)
          .order('created_at', { ascending: false });
        
        result.projects.push({
          id: p.id,
          name: p.name || p.project_name,
          themes: (themes || []).map((t: any) => ({ id: t.id, title: t.title })),
        });
      }
      
      return NextResponse.json(result);
    }

    if (action === 'swap') {
      if (!projectA || !projectB) {
        return NextResponse.json({ error: 'projectA and projectB required' }, { status: 400 });
      }

      const { data: themesA } = await supabase.from('themes').select('id').eq('project_id', projectA);
      const { data: themesB } = await supabase.from('themes').select('id').eq('project_id', projectB);

      const idsA = (themesA || []).map((t: any) => t.id);
      const idsB = (themesB || []).map((t: any) => t.id);

      const tempId = 'TEMP_SWAP_' + Date.now();

      if (idsA.length > 0) {
        await supabase.from('themes').update({ project_id: tempId }).in('id', idsA);
      }
      if (idsB.length > 0) {
        await supabase.from('themes').update({ project_id: projectA }).in('id', idsB);
      }
      if (idsA.length > 0) {
        await supabase.from('themes').update({ project_id: projectB }).eq('project_id', tempId);
      }

      return NextResponse.json({
        ok: true,
        swapped: { fromAtoB: idsA.length, fromBtoA: idsB.length }
      });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
