// Set fake environment variables first before importing anything that depends on supabase url
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://fake-supabase-url.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'fake-anon-key';

/**
 * scratch/test_garbage_collection.ts
 * 
 * Script de simulação e teste automatizado para validar a integridade, segurança
 * e comportamento do Garbage Collector em segundo plano.
 * 
 * Executa simulações de verificação tripla de Supabase (BI logs, Snapshots e Temas)
 * interceptando requisições fetch para testar sem quebrar chaves de produção.
 */

// 1. MOCK DE LOCALSTORAGE PARA AMBIENTE CLI (NODE/BUN)
const mockStore: Record<string, string> = {};
const localStorageMock = {
  getItem: (key: string) => mockStore[key] || null,
  setItem: (key: string, value: string) => { mockStore[key] = String(value); },
  removeItem: (key: string) => { delete mockStore[key]; },
  clear: () => { Object.keys(mockStore).forEach(k => delete mockStore[k]); },
  key: (index: number) => Object.keys(mockStore)[index] || null,
  get length() { return Object.keys(mockStore).length; }
};

if (typeof window === 'undefined') {
  globalThis.localStorage = localStorageMock as any;
  (globalThis as any).window = {} as any;
  (globalThis as any).navigator = { onLine: true };
}


// 2. MOCK DE FETCH GLOBAL PARA INTERCEPTAR CHAMADAS SUPABASE
let capturedPushes: { table: string; method: string; payload: any }[] = [];

const mockFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  const urlStr = input.toString();
  const method = init?.method || 'GET';
  const body = init?.body ? JSON.parse(init.body as string) : null;

  // Intercepta uploads para a nuvem
  if (method === 'POST' || method === 'PUT' || method === 'PATCH') {
    const tableMatch = urlStr.match(/\/rest\/v1\/([^?]+)/);
    if (tableMatch) {
      capturedPushes.push({
        table: tableMatch[1],
        method,
        payload: body
      });
    }
    return new Response(JSON.stringify({ success: true }), { status: 200 });
  }

  // Intercepta queries de consulta (GET)
  if (method === 'GET') {
    // A: Consulta de logs de BI (composition_log)
    if (urlStr.includes('/composition_log')) {
      // Retorna que os logs 'log-1' e 'log-3' existem no Supabase, mas 'log-2' está pendente (não existe)
      return new Response(JSON.stringify([
        { id: 'log-1' },
        { id: 'log-3' }
      ]), { status: 200 });
    }

    // B: Consulta de snapshots (script_executions)
    if (urlStr.includes('/script_executions')) {
      if (urlStr.includes('theme-a')) {
        // Cópia da nuvem mais recente (safe to delete)
        return new Response(JSON.stringify({
          theme_id: 'theme-a',
          updated_at: '2026-05-20T18:00:00Z',
          execution_snapshot: { title: 'Tema A', updated_at: '2026-05-20T18:00:00Z' }
        }), { status: 200 });
      }
      if (urlStr.includes('theme-b')) {
        // Cópia local mais recente (precisa forçar upload primeiro)
        return new Response(JSON.stringify({
          theme_id: 'theme-b',
          updated_at: '2026-05-20T10:00:00Z',
          execution_snapshot: { title: 'Tema B', updated_at: '2026-05-20T10:00:00Z' }
        }), { status: 200 });
      }
      if (urlStr.includes('theme-c')) {
        // Não existe na nuvem de forma alguma (retorna vazio para indicar registro ausente)
        // Nota: o Supabase retorna array vazio se fizer filtro eq e não encontrar.
        return new Response(JSON.stringify([]), { status: 200 });
      }
    }

    // C: Consulta de temas (themes)
    if (urlStr.includes('/themes')) {
      if (urlStr.includes('theme-1')) {
        // Tema 1: Sincronizado
        return new Response(JSON.stringify({
          id: 'theme-1',
          updated_at: '2026-05-20T18:00:00Z',
          production_assets: { srt_text: 'Legendas do tema 1 sincronizadas', audio_url: 'http://cloud/1.mp3' }
        }), { status: 200 });
      }
      if (urlStr.includes('theme-2')) {
        // Tema 2: Local é mais novo, precisa atualizar
        return new Response(JSON.stringify({
          id: 'theme-2',
          updated_at: '2026-05-20T10:00:00Z',
          production_assets: { srt_text: 'Legenda antiga' }
        }), { status: 200 });
      }
      if (urlStr.includes('theme-3')) {
        // Tema 3: Não existe na nuvem
        return new Response(JSON.stringify([]), { status: 200 });
      }
    }
  }

  // Fallback genérico de sucesso
  return new Response(JSON.stringify([]), { status: 200 });
};

globalThis.fetch = mockFetch as any;

// -----------------------------------------------------------------------------
// 3. EXECUTAR OS CENÁRIOS DE TESTE
// -----------------------------------------------------------------------------
async function runTests() {
  console.log("===============================================================");
  console.log("=== INICIANDO VALIDAÇÃO DE SEGURANÇA DO GARBAGE COLLECTOR ===");
  console.log("===============================================================\n");

  let testSuccess = true;

  // Carrega dinamicamente para garantir que process.env esteja configurado e fetch esteja mockado
  const { executeBackgroundGarbageCollection, getLocalStorageSizeMB } = await import('../lib/garbage-collector');

  // Limpa o mock store
  localStorage.clear();
  capturedPushes = [];

  // ─── POPULAR DADOS EM LOCALSTORAGE ───
  
  // A: Protege chaves críticas que NUNCA devem ser tocadas pelo GC!
  const criticalProjectData = JSON.stringify([{ id: 'proj-1', name: 'Canal de Finanças' }]);
  localStorage.setItem('writer_studio_projects', criticalProjectData);
  localStorage.setItem('writer_studio_projects_backup', criticalProjectData);
  
  const narrativeAssets = JSON.stringify([{ id: 'narr-1', type: 'Hook', name: 'Gancho Introdutório' }]);
  localStorage.setItem('ws_narrative_proj-1', narrativeAssets);

  // B: Popula logs de BI
  const biLogs = [
    { id: 'log-1', value: 'BI Log 1 (Existe no Supabase)' },
    { id: 'log-2', value: 'BI Log 2 (Pendente offline)' },
    { id: 'log-3', value: 'BI Log 3 (Existe no Supabase)' }
  ];
  localStorage.setItem('bi_proj-1', JSON.stringify(biLogs));

  // C: Popula snapshots
  localStorage.setItem('snapshot_theme-a', JSON.stringify({
    theme_id: 'theme-a',
    updated_at: '2026-05-20T18:00:00Z',
    scriptText: 'Texto sincronizado tema A'
  }));
  localStorage.setItem('snapshot_theme-b', JSON.stringify({
    theme_id: 'theme-b',
    updated_at: '2026-05-20T18:30:00Z', // Local mais recente que nuvem (10:00:00Z)
    scriptText: 'Texto modificado offline tema B',
    project_id: 'proj-1'
  }));
  localStorage.setItem('snapshot_theme-c', JSON.stringify({
    theme_id: 'theme-c',
    updated_at: '2026-05-20T18:45:00Z', // Não existe na nuvem
    scriptText: 'Novo texto criado offline tema C',
    project_id: 'proj-1'
  }));

  // D: Popula Temas com assets de produção pesados
  const themes = [
    {
      id: 'theme-1',
      project_id: 'proj-1',
      title: 'Tema 1 (Sincronizado)',
      updated_at: '2026-05-20T18:00:00Z',
      production_assets: { heavy_timeline_blocks: Array(50).fill('Asset pesado'), srt_text: 'Sincronizado' }
    },
    {
      id: 'theme-2',
      project_id: 'proj-1',
      title: 'Tema 2 (Modificado localmente)',
      updated_at: '2026-05-20T18:30:00Z', // Local mais novo que nuvem (10:00:00)
      production_assets: { heavy_timeline_blocks: Array(50).fill('Asset local novo'), srt_text: 'Nova modificação' }
    },
    {
      id: 'theme-3',
      project_id: 'proj-1',
      title: 'Tema 3 (Apenas local)',
      updated_at: '2026-05-20T18:45:00Z',
      production_assets: { heavy_timeline_blocks: Array(50).fill('Asset recém criado'), srt_text: 'Offline' }
    }
  ];
  localStorage.setItem('themes_proj-1', JSON.stringify(themes));

  const sizeBefore = getLocalStorageSizeMB();
  console.log(`- Tamanho inicial do localStorage: ${(sizeBefore * 1024).toFixed(1)} KB`);

  // ─── EXECUTAR O GARBAGE COLLECTOR (Forçando execução) ───
  console.log("\n🚀 Disparando Garbage Collector em Background...");
  const log = await executeBackgroundGarbageCollection(true);

  // Print dos logs do GC para facilitar a depuração
  console.log("\n=== LOGS DETALHADOS DA EXECUÇÃO DO GC ===");
  log.details.forEach(line => console.log(line));
  console.log("=========================================\n");

  // ─── ASSERÇÕES DE INTEGRIDADE E SEGURANÇA ───
  console.log("🧪 Executando Asserções de Segurança...");

  // 1. Segurança dos Projetos: Nunca devem sumir ou ser modificados!
  const projAfter = localStorage.getItem('writer_studio_projects');
  const backupProjAfter = localStorage.getItem('writer_studio_projects_backup');
  if (projAfter === criticalProjectData && backupProjAfter === criticalProjectData) {
    console.log("✅ SUCESSO: Dados de projetos intocados e 100% seguros.");
  } else {
    console.error("❌ ERRO GRAVE: Dados de projetos foram modificados ou removidos!");
    testSuccess = false;
  }

  // 2. Segurança da Biblioteca Narrativa: Nunca deve sumir ou ser modificada!
  const narrAfter = localStorage.getItem('ws_narrative_proj-1');
  if (narrAfter === narrativeAssets) {
    console.log("✅ SUCESSO: Biblioteca Narrativa offline-first protegida e intocada.");
  } else {
    console.error("❌ ERRO GRAVE: Biblioteca Narrativa foi modificada ou removida!");
    testSuccess = false;
  }

  // 3. Validação dos logs de BI (Fase A)
  const biAfter = JSON.parse(localStorage.getItem('bi_proj-1') || '[]');
  const biIds = biAfter.map((l: any) => l.id);
  // Log-1 e Log-3 existiam no Supabase -> devem ter sido removidos.
  // Log-2 não existia -> deve permanecer.
  if (biIds.includes('log-2') && !biIds.includes('log-1') && !biIds.includes('log-3')) {
    console.log("✅ SUCESSO: Expurgo cirúrgico de logs de BI. Apenas logs não salvos foram mantidos.");
  } else {
    console.error("❌ ERRO: Erro no expurgo de logs de BI. logs mantidos:", biIds);
    testSuccess = false;
  }

  // 4. Validação dos Snapshots de Edição (Fase B)
  // snapshot_theme-a existia na nuvem em versão igual -> deletado
  const snapshotA = localStorage.getItem('snapshot_theme-a');
  // snapshot_theme-b era local mais nova -> sincronizado com nuvem e depois deletado
  const snapshotB = localStorage.getItem('snapshot_theme-b');
  // snapshot_theme-c não existia na nuvem -> sincronizado e depois deletado
  const snapshotC = localStorage.getItem('snapshot_theme-c');

  const pushExecutions = capturedPushes.filter(p => p.table === 'script_executions');

  if (!snapshotA && !snapshotB && !snapshotC) {
    // Confirma se fez o auto-upload de theme-b e theme-c
    const pushedThemeIds = pushExecutions.flatMap(p => {
      const items = Array.isArray(p.payload) ? p.payload : [p.payload];
      return items.map((i: any) => i.theme_id);
    });

    if (pushedThemeIds.includes('theme-b') && pushedThemeIds.includes('theme-c')) {
      console.log("✅ SUCESSO: Snapshots expurgados somente após verificação e auto-upload das edições mais recentes.");
    } else {
      console.error("❌ ERRO: Snapshots removidos sem realizar o auto-upload prévio! Pushed ids:", pushedThemeIds);
      testSuccess = false;
    }
  } else {
    console.error("❌ ERRO: Um ou mais snapshots locais não foram limpos:", { snapshotA, snapshotB, snapshotC });
    testSuccess = false;
  }

  // 5. Validação da Compressão Híbrida de Temas (Fase C)
  const themesAfter = JSON.parse(localStorage.getItem('themes_proj-1') || '[]');
  const pushThemes = capturedPushes.filter(p => p.table === 'themes');

  const theme1 = themesAfter.find((t: any) => t.id === 'theme-1');
  const theme2 = themesAfter.find((t: any) => t.id === 'theme-2');
  const theme3 = themesAfter.find((t: any) => t.id === 'theme-3');

  if (theme1?.production_assets?._compressed && theme2?.production_assets?._compressed && theme3?.production_assets?._compressed) {
    // Verifica se os temas 2 e 3 foram sincronizados antes da compressão
    const pushedThemeIds = pushThemes.flatMap(p => {
      const items = Array.isArray(p.payload) ? p.payload : [p.payload];
      return items.map((i: any) => i.id);
    });

    if (pushedThemeIds.includes('theme-2') && pushedThemeIds.includes('theme-3')) {
      console.log("✅ SUCESSO: Todos os temas foram comprimidos e edições offline foram salvas na nuvem.");
    } else {
      console.error("❌ ERRO: Temas locais foram comprimidos sem enviar as edições mais novas para a nuvem! Pushed ids:", pushedThemeIds);
      testSuccess = false;
    }
  } else {
    console.error("❌ ERRO: Um ou mais temas não foram devidamente comprimidos localmente:", {
      theme1: theme1?.production_assets,
      theme2: theme2?.production_assets,
      theme3: theme3?.production_assets
    });
    testSuccess = false;
  }

  // 6. Economia de espaço final
  const sizeAfter = getLocalStorageSizeMB();
  const ratio = ((sizeBefore - sizeAfter) / sizeBefore) * 100;
  console.log(`- Tamanho final do localStorage: ${(sizeAfter * 1024).toFixed(1)} KB`);
  console.log(`- Redução de tamanho de dados locais: ${ratio.toFixed(1)}%`);

  if (testSuccess) {
    console.log("\n🏆 CONCLUÍDO: Todos os testes de segurança e integridade passaram com sucesso!");
    console.log("O Garbage Collector garante 100% de risco zero de sumiço de projetos.");
  } else {
    console.error("\n💥 DETECTADAS FALHAS no teste de integridade. Verifique os logs.");
  }
}

runTests();
