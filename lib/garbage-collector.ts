/**
 * lib/garbage-collector.ts
 * 
 * Coletor de Lixo Automático e Inteligente (Garbage Collector - GC) para o Content OS.
 * Mantém o localStorage do navegador de forma silenciosa abaixo do limite crítico (3.0 MB),
 * garantindo integridade absoluta com o Supabase antes de liberar ou comprimir qualquer dado local.
 */

import { supabase } from '@/lib/supabase';

// Interface de log para monitoramento na UI
export interface GCLog {
  lastRun: string;
  bytesCleaned: number;
  status: 'idle' | 'success' | 'error';
  details: string[];
}

const GC_LOG_KEY = 'ws_gc_log';

// Função auxiliar para calcular o tamanho de uma string em bytes (UTF-16 usa 2 bytes por caractere)
const getStringSize = (str: string): number => {
  return str.length * 2;
};

// Retorna o tamanho total do localStorage em MB
export const getLocalStorageSizeMB = (): number => {
  if (typeof window === 'undefined') return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i) || '';
    total += (localStorage.getItem(k) || '').length * 2;
  }
  return total / (1024 * 1024);
};

// Recupera o último log de execução do GC
export const getGCLog = (): GCLog | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(GC_LOG_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

// Salva o log de execução do GC
const saveGCLog = (log: GCLog) => {
  try {
    localStorage.setItem(GC_LOG_KEY, JSON.stringify(log));
  } catch {}
};

// Limpa campos inexistentes ou mal formatados antes do Upsert de Temas (Sincronização de Segurança)
const sanitizeThemeForCloud = (item: Record<string, any>) => ({
  id: item.id,
  project_id: item.project_id,
  user_id: item.user_id || null,
  title: item.title || 'Tema sem título',
  description: item.description || '',
  editorial_pillar: item.editorial_pillar || '',
  status: item.status || 'backlog',
  hook_id: item.hook_id || null,
  title_structure: item.title_structure || '',
  priority: Number.isFinite(Number(item.priority)) ? Number(item.priority) : 0,
  notes: item.notes || '',
  target_publish_date: item.target_publish_date || null,
  production_assets: item.production_assets || {},
  created_at: item.created_at || new Date().toISOString(),
  updated_at: new Date().toISOString(),
});

/**
 * Motor Central do Garbage Collector (silencioso e em background)
 * Executa as verificações cruzadas e realiza o expurgo seguro.
 */
export const executeBackgroundGarbageCollection = async (force = false): Promise<GCLog> => {
  const logDetails: string[] = [];
  let totalBytesCleaned = 0;

  if (typeof window === 'undefined') {
    return { lastRun: new Date().toISOString(), bytesCleaned: 0, status: 'idle', details: ['Ignorado: Ambiente de servidor.'] };
  }

  const currentSizeMB = getLocalStorageSizeMB();
  
  // Só executa se o tamanho for > 3.0 MB ou se for forçado
  if (!force && currentSizeMB <= 3.0) {
    return {
      lastRun: new Date().toISOString(),
      bytesCleaned: 0,
      status: 'idle',
      details: [`Ignorado: localStorage está saudável (${currentSizeMB.toFixed(2)} MB). Limite de disparo é 3.0 MB.`]
    };
  }

  logDetails.push(`[GC] Iniciando limpeza. Tamanho atual: ${currentSizeMB.toFixed(2)} MB`);

  // 1. Verificações de Failsafe Críticas
  if (!supabase) {
    const err = 'Supabase não configurado. Abortando GC para evitar qualquer perda de dados.';
    logDetails.push(`[ERRO] ${err}`);
    const errLog: GCLog = { lastRun: new Date().toISOString(), bytesCleaned: 0, status: 'error', details: logDetails };
    saveGCLog(errLog);
    return errLog;
  }

  if (!navigator.onLine) {
    const err = 'Navegador offline. Abortando GC para evitar falhas de validação de backup.';
    logDetails.push(`[ERRO] ${err}`);
    const errLog: GCLog = { lastRun: new Date().toISOString(), bytesCleaned: 0, status: 'error', details: logDetails };
    saveGCLog(errLog);
    return errLog;
  }

  try {
    // -------------------------------------------------------------------------
    // FASE A: Limpeza Segura dos Logs de BI (bi_${projectId})
    // -------------------------------------------------------------------------
    logDetails.push('[GC] Fase A: Analisando logs de BI...');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('bi_')) {
        const projectId = key.slice(3);
        const localLogsRaw = localStorage.getItem(key);
        if (!localLogsRaw) continue;

        try {
          const localLogs = JSON.parse(localLogsRaw);
          if (!Array.isArray(localLogs) || localLogs.length === 0) continue;

          logDetails.push(`[GC] Encontrado ${localLogs.length} logs locais em ${key}`);
          const localLogIds = localLogs.map((log: any) => log.id).filter(Boolean);

          if (localLogIds.length === 0) continue;

          // Consulta quais destes IDs já estão salvos comprovadamente na nuvem
          const { data: remoteLogs, error: logError } = await supabase
            .from('composition_log')
            .select('id')
            .in('id', localLogIds);

          if (logError) {
            logDetails.push(`[Aviso] Falha ao consultar logs do projeto ${projectId}: ${logError.message}`);
            continue;
          }

          const remoteIdsSet = new Set((remoteLogs || []).map((l: any) => l.id));
          
          // Filtra mantendo localmente apenas os que NÃO estão na nuvem
          const logsToKeep = localLogs.filter((log: any) => !remoteIdsSet.has(log.id));
          
          if (logsToKeep.length < localLogs.length) {
            const cleanedCount = localLogs.length - logsToKeep.length;
            const updatedLogsRaw = JSON.stringify(logsToKeep);
            const bytesCleaned = getStringSize(localLogsRaw) - getStringSize(updatedLogsRaw);
            
            localStorage.setItem(key, updatedLogsRaw);
            totalBytesCleaned += bytesCleaned;
            logDetails.push(`[GC] Removidos ${cleanedCount} logs salvos na nuvem em ${key}. Espaço liberado: ${(bytesCleaned / 1024).toFixed(1)} KB`);
          }
        } catch (e: any) {
          logDetails.push(`[Aviso] Falha ao processar logs de BI para ${key}: ${e.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // FASE B: Limpeza Segura dos Snapshots de Edição (snapshot_${themeId})
    // -------------------------------------------------------------------------
    logDetails.push('[GC] Fase B: Analisando snapshots temporários...');
    const snapshotKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('snapshot_')) {
        snapshotKeys.push(key);
      }
    }

    for (const key of snapshotKeys) {
      const themeId = key.slice(9); // remove 'snapshot_'
      const localSnapshotRaw = localStorage.getItem(key);
      if (!localSnapshotRaw) continue;

      try {
        const localSnapshot = JSON.parse(localSnapshotRaw);
        
        // Verifica na nuvem se existe snapshot para esse tema
        const { data: remoteExecutions, error: execError } = await supabase
          .from('script_executions')
          .select('theme_id, updated_at, execution_snapshot')
          .eq('theme_id', themeId)
          .order('updated_at', { ascending: false });

        if (execError) {
          logDetails.push(`[Aviso] Erro ao buscar execução na nuvem para o tema ${themeId}: ${execError.message}`);
          continue;
        }

        const remoteExecution = remoteExecutions && remoteExecutions.length > 0 ? remoteExecutions[0] : null;

        if (remoteExecution) {
          const localTime = new Date(localSnapshot.updated_at || 0).getTime();
          const remoteTime = new Date(remoteExecution.updated_at || 0).getTime();

          // Se a nuvem estiver igual ou mais recente, podemos deletar o local com segurança absoluta
          if (remoteTime >= localTime) {
            const bytesCleaned = getStringSize(localSnapshotRaw);
            localStorage.removeItem(key);
            totalBytesCleaned += bytesCleaned;
            logDetails.push(`[GC] Snapshot ${themeId} removido. Cópia mais recente ou igual encontrada na nuvem. Liberado: ${(bytesCleaned / 1024).toFixed(1)} KB`);
          } else {
            // Sincronização Preventiva: O local é mais novo. Fazemos o push para a nuvem
            logDetails.push(`[GC] Snapshot local de ${themeId} é mais recente. Sincronizando com a nuvem antes de expurgar...`);
            
            const { error: upsertError } = await supabase
              .from('script_executions')
              .upsert({
                theme_id: themeId,
                execution_snapshot: localSnapshot,
                updated_at: new Date().toISOString()
              });

            if (!upsertError) {
              const bytesCleaned = getStringSize(localSnapshotRaw);
              localStorage.removeItem(key);
              totalBytesCleaned += bytesCleaned;
              logDetails.push(`[GC] Snapshot ${themeId} enviado com sucesso e expurgado localmente. Liberado: ${(bytesCleaned / 1024).toFixed(1)} KB`);
            } else {
              logDetails.push(`[Aviso] Falha ao auto-sincronizar snapshot de ${themeId}: ${upsertError.message}`);
            }
          }
        } else {
          // Registro não existe na nuvem! Fazemos o push preventivo.
          logDetails.push(`[GC] Snapshot ${themeId} não existe na nuvem. Enviando cópia de segurança antes do expurgo...`);
          
          // Para salvar na tabela de execuções precisamos do project_id correspondente
          // Vamos tentar deduzir ou buscar do próprio snapshot ou manter local se falhar
          const projectId = localSnapshot.approvedBriefing?.projectId || 
                            localSnapshot.approvedBriefing?.project_id || 
                            localSnapshot.project_id || 
                            localSnapshot.projectId;

          if (projectId) {
            const { error: insertError } = await supabase
              .from('script_executions')
              .insert({
                theme_id: themeId,
                project_id: projectId,
                execution_snapshot: localSnapshot
              });

            if (!insertError) {
              const bytesCleaned = getStringSize(localSnapshotRaw);
              localStorage.removeItem(key);
              totalBytesCleaned += bytesCleaned;
              logDetails.push(`[GC] Snapshot ${themeId} criado na nuvem com sucesso e expurgado localmente. Liberado: ${(bytesCleaned / 1024).toFixed(1)} KB`);
            } else {
              logDetails.push(`[Aviso] Falha ao enviar novo snapshot de ${themeId} para a nuvem: ${insertError.message}`);
            }
          } else {
            logDetails.push(`[Aviso] Não foi possível encontrar o project_id para o snapshot ${themeId}. Mantendo localmente.`);
          }
        }
      } catch (e: any) {
        logDetails.push(`[Aviso] Erro ao processar snapshot ${themeId}: ${e.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // FASE C: Compressão Híbrida de Temas (themes_${projectId})
    // -------------------------------------------------------------------------
    logDetails.push('[GC] Fase C: Executando Compressão Híbrida nos Temas...');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      // Evita chaves auxiliares e foca apenas em chaves de temas de projetos
      if (key.startsWith('themes_') && !key.includes('backup') && !key.includes('archive')) {
        const localThemesRaw = localStorage.getItem(key);
        if (!localThemesRaw) continue;

        try {
          const localThemes = JSON.parse(localThemesRaw);
          if (!Array.isArray(localThemes) || localThemes.length === 0) continue;

          let arrayChanged = false;
          let fileBytesSaved = 0;

          for (let j = 0; j < localThemes.length; j++) {
            const theme = localThemes[j];
            
            // Só comprime se tiver assets de produção pesados e ainda não estiver comprimido
            if (theme.production_assets && !theme.production_assets._compressed) {
              
              // Consulta se o tema já existe na nuvem e o status de seus assets
              const { data: remoteTheme, error: themeError } = await supabase
                .from('themes')
                .select('id, updated_at, production_assets')
                .eq('id', theme.id)
                .single();

              if (themeError && themeError.code !== 'PGRST116') {
                logDetails.push(`[Aviso] Erro ao validar tema ${theme.id} na nuvem: ${themeError.message}`);
                continue;
              }

              if (remoteTheme) {
                const localTime = new Date(theme.updated_at || 0).getTime();
                const remoteTime = new Date(remoteTheme.updated_at || 0).getTime();

                const isRemoteValid = remoteTheme.production_assets && 
                                     typeof remoteTheme.production_assets === 'object' &&
                                     Object.keys(remoteTheme.production_assets).length > 0;

                // Se a nuvem estiver sincronizada/mais atualizada E os assets estiverem íntegros na nuvem
                if (remoteTime >= localTime && isRemoteValid) {
                  const sizeBefore = getStringSize(JSON.stringify(theme.production_assets));
                  
                  // Executa a compressão híbrida
                  theme.production_assets = { _compressed: true };
                  arrayChanged = true;
                  
                  const sizeAfter = getStringSize(JSON.stringify(theme.production_assets));
                  fileBytesSaved += (sizeBefore - sizeAfter);
                  logDetails.push(`[GC] Tema "${theme.title}" comprimido com segurança (Assets salvos na nuvem).`);
                } else {
                  // O local é mais recente do que a nuvem. Realiza o upload preventivo
                  logDetails.push(`[GC] Tema local "${theme.title}" está mais recente. Sincronizando com a nuvem antes de comprimir...`);
                  
                  const sanitized = sanitizeThemeForCloud(theme);
                  const { error: upsertError } = await supabase
                    .from('themes')
                    .upsert(sanitized);

                  if (!upsertError) {
                    const sizeBefore = getStringSize(JSON.stringify(theme.production_assets));
                    theme.production_assets = { _compressed: true };
                    arrayChanged = true;
                    
                    const sizeAfter = getStringSize(JSON.stringify(theme.production_assets));
                    fileBytesSaved += (sizeBefore - sizeAfter);
                    logDetails.push(`[GC] Tema "${theme.title}" sincronizado e comprimido. Liberado: ${((sizeBefore - sizeAfter) / 1024).toFixed(1)} KB`);
                  } else {
                    logDetails.push(`[Aviso] Falha ao auto-sincronizar tema "${theme.title}": ${upsertError.message}`);
                  }
                }
              } else {
                // Tema não existe na nuvem de forma alguma! Pede push preventivo.
                logDetails.push(`[GC] Tema local "${theme.title}" não existe na nuvem. Inserindo na nuvem antes de comprimir...`);
                
                const sanitized = sanitizeThemeForCloud(theme);
                const { error: insertError } = await supabase
                  .from('themes')
                  .insert(sanitized);

                if (!insertError) {
                  const sizeBefore = getStringSize(JSON.stringify(theme.production_assets));
                  theme.production_assets = { _compressed: true };
                  arrayChanged = true;
                  
                  const sizeAfter = getStringSize(JSON.stringify(theme.production_assets));
                  fileBytesSaved += (sizeBefore - sizeAfter);
                  logDetails.push(`[GC] Tema "${theme.title}" inserido na nuvem e comprimido localmente.`);
                } else {
                  logDetails.push(`[Aviso] Falha ao criar tema "${theme.title}" na nuvem: ${insertError.message}`);
                }
              }
            }
          }

          if (arrayChanged) {
            const updatedThemesRaw = JSON.stringify(localThemes);
            localStorage.setItem(key, updatedThemesRaw);
            totalBytesCleaned += fileBytesSaved;
            logDetails.push(`[GC] Concluída compressão híbrida em ${key}. Economia da chave: ${(fileBytesSaved / 1024).toFixed(1)} KB`);
          }
        } catch (e: any) {
          logDetails.push(`[Aviso] Erro no fluxo de compressão híbrida de ${key}: ${e.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // FASE D: Limpeza do Histórico de Projetos (writer_studio_projects_archive)
    // -------------------------------------------------------------------------
    logDetails.push('[GC] Fase D: Analisando histórico de projetos...');
    try {
      const archiveRaw = localStorage.getItem('writer_studio_projects_archive');
      if (archiveRaw) {
        const size = getStringSize(archiveRaw);
        localStorage.removeItem('writer_studio_projects_archive');
        totalBytesCleaned += size;
        logDetails.push(`[GC] Histórico de projetos writer_studio_projects_archive expurgado por completo. Liberado: ${(size / 1024).toFixed(1)} KB`);
      }
    } catch (e: any) {
      logDetails.push(`[Aviso] Falha ao processar histórico de projetos: ${e.message}`);
    }

    // -------------------------------------------------------------------------
    // FASE E: Limpeza Segura de Pipelines, Ativos e Snapshots Principais
    // -------------------------------------------------------------------------
    logDetails.push('[GC] Fase E: Analisando pipelines, sub-chaves órfãs e snapshots de workspace...');
    
    // 1. Limpeza de sub-chaves órfãs (cujo wsMainKey correspondente não existe no navegador)
    const wsPipelineAndPackageKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('ws_script_execution_') && (key.endsWith('_srt_pipeline') || key.endsWith('_post_package'))) {
        wsPipelineAndPackageKeys.push(key);
      }
    }

    for (const subKey of wsPipelineAndPackageKeys) {
      const prefix = 'ws_script_execution_';
      let projectId = '';
      if (subKey.endsWith('_srt_pipeline')) {
        projectId = subKey.substring(prefix.length, subKey.length - '_srt_pipeline'.length);
      } else {
        projectId = subKey.substring(prefix.length, subKey.length - '_post_package'.length);
      }
      const wsMainKey = `${prefix}${projectId}`;
      if (!localStorage.getItem(wsMainKey)) {
        try {
          const val = localStorage.getItem(subKey);
          let freed = 0;
          if (val) {
            freed += getStringSize(val);
            localStorage.removeItem(subKey);
          }
          const postKey = `${wsMainKey}_post_package`;
          const srtKey = `${wsMainKey}_srt_pipeline`;
          const hfKey = `yt_hf_bg_${wsMainKey}`;

          const postVal = localStorage.getItem(postKey);
          if (postVal) {
            freed += getStringSize(postVal);
            localStorage.removeItem(postKey);
          }
          const srtVal = localStorage.getItem(srtKey);
          if (srtVal) {
            freed += getStringSize(srtVal);
            localStorage.removeItem(srtKey);
          }
          const hfVal = localStorage.getItem(hfKey);
          if (hfVal) {
            freed += getStringSize(hfVal);
            localStorage.removeItem(hfKey);
          }

          totalBytesCleaned += freed;
          logDetails.push(`[GC] Chaves órfãs para o projeto ${projectId} expurgadas por completo. Liberado: ${(freed / 1024).toFixed(1)} KB`);
        } catch (e: any) {
          logDetails.push(`[Aviso] Falha ao expurgar chaves órfãs para ${projectId}: ${e.message}`);
        }
      }
    }

    // 2. Limpeza de sub-chaves pesadas ativas cujo mainKey correspondente existe E está sincronizado
    const activeWsKeys: string[] = [];
    const mainWsKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('ws_script_execution_')) {
        if (key.endsWith('_srt_pipeline')) {
          // Só processa se o mainKey correspondente existir (se não existir, já foi limpo no passo 1)
          const prefix = 'ws_script_execution_';
          const projectId = key.substring(prefix.length, key.length - '_srt_pipeline'.length);
          if (localStorage.getItem(`${prefix}${projectId}`)) {
            activeWsKeys.push(key);
          }
        } else if (!key.endsWith('_post_package')) {
          mainWsKeys.push(key);
        }
      }
    }

    for (const srtKey of activeWsKeys) {
      const prefix = 'ws_script_execution_';
      const suffix = '_srt_pipeline';
      const projectId = srtKey.substring(prefix.length, srtKey.length - suffix.length);
      const wsMainKey = `${prefix}${projectId}`;
      const postKey = `${prefix}${projectId}_post_package`;

      const wsMainRaw = localStorage.getItem(wsMainKey);
      if (!wsMainRaw) continue;

      try {
        const wsMain = JSON.parse(wsMainRaw);
        const themeId = wsMain._themeId || wsMain.themeId;

        if (themeId) {
          const { data: remoteExecutions, error: execError } = await supabase
            .from('script_executions')
            .select('theme_id, execution_snapshot')
            .eq('theme_id', themeId)
            .order('updated_at', { ascending: false });

          const remoteExecution = remoteExecutions && remoteExecutions.length > 0 ? remoteExecutions[0] : null;

          if (remoteExecution && remoteExecution.execution_snapshot?.externalSrtPipeline) {
            const srtRaw = localStorage.getItem(srtKey);
            const postRaw = localStorage.getItem(postKey);

            let freed = 0;
            if (srtRaw) {
              freed += getStringSize(srtRaw);
              localStorage.removeItem(srtKey);
            }
            if (postRaw) {
              freed += getStringSize(postRaw);
              localStorage.removeItem(postKey);
            }

            totalBytesCleaned += freed;
            logDetails.push(`[GC] Pipeline de workspace para o tema ${themeId} já sincronizado. Removido localmente. Liberado: ${(freed / 1024).toFixed(1)} KB`);
          }
        }
      } catch (e: any) {
        logDetails.push(`[Aviso] Falha ao processar pipeline de workspace para ${projectId}: ${e.message}`);
      }
    }

    // 3. Limpeza de snapshots principais ws_script_execution_* finalizados (scheduled/published)
    for (const mainKey of mainWsKeys) {
      const wsMainRaw = localStorage.getItem(mainKey);
      if (!wsMainRaw) continue;

      try {
        const wsMain = JSON.parse(wsMainRaw);
        const themeId = wsMain._themeId || wsMain.themeId;
        const publishDate = wsMain.manualPublishDate;
        
        if (themeId && publishDate) {
          const { data: remoteExecutions, error: execError } = await supabase
            .from('script_executions')
            .select('theme_id, execution_snapshot')
            .eq('theme_id', themeId)
            .order('updated_at', { ascending: false });

          const remoteExecution = remoteExecutions && remoteExecutions.length > 0 ? remoteExecutions[0] : null;

          if (remoteExecution && remoteExecution.execution_snapshot) {
            const srtKey = `${mainKey}_srt_pipeline`;
            const postKey = `${mainKey}_post_package`;
            const hfKey = `yt_hf_bg_${mainKey}`;
            
            let freed = getStringSize(wsMainRaw);
            localStorage.removeItem(mainKey);
            
            const srtRaw = localStorage.getItem(srtKey);
            if (srtRaw) {
              freed += getStringSize(srtRaw);
              localStorage.removeItem(srtKey);
            }
            const postRaw = localStorage.getItem(postKey);
            if (postRaw) {
              freed += getStringSize(postRaw);
              localStorage.removeItem(postKey);
            }
            const hfRaw = localStorage.getItem(hfKey);
            if (hfRaw) {
              freed += getStringSize(hfRaw);
              localStorage.removeItem(hfKey);
            }
            const snapKey = `snapshot_${themeId}`;
            const snapRaw = localStorage.getItem(snapKey);
            if (snapRaw) {
              freed += getStringSize(snapRaw);
              localStorage.removeItem(snapKey);
            }

            totalBytesCleaned += freed;
            logDetails.push(`[GC] Workspace principal finalizado para o tema ${themeId} expurgado (dados salvos na nuvem). Liberado: ${(freed / 1024).toFixed(1)} KB`);
          }
        }
      } catch (e: any) {
        logDetails.push(`[Aviso] Falha ao processar snapshot principal para ${mainKey}: ${e.message}`);
      }
    }

    const finalSizeMB = getLocalStorageSizeMB();
    logDetails.push(`[GC] Limpeza concluída com sucesso! Tamanho final: ${finalSizeMB.toFixed(2)} MB. Total liberado: ${(totalBytesCleaned / 1024).toFixed(1)} KB`);
    
    const finalLog: GCLog = {
      lastRun: new Date().toISOString(),
      bytesCleaned: totalBytesCleaned,
      status: 'success',
      details: logDetails
    };
    saveGCLog(finalLog);
    return finalLog;
  } catch (err: any) {
    logDetails.push(`[ERRO CRÍTICO] Falha na execução do Garbage Collector: ${err.message || err}`);
    const errLog: GCLog = {
      lastRun: new Date().toISOString(),
      bytesCleaned: 0,
      status: 'error',
      details: logDetails
    };
    saveGCLog(errLog);
    return errLog;
  }
};

/**
 * Sincroniza todos os dados locais com o Supabase e realiza o expurgo com confirmação (Camada 2).
 * Exibido no painel de resgate como botão único de 1 clique.
 */
export const syncAndPurgeAll = async (): Promise<{
  success: boolean;
  bytesFreed: number;
  details: string[];
}> => {
  const logDetails: string[] = [];
  let totalBytesCleaned = 0;

  if (typeof window === 'undefined') {
    return { success: false, bytesFreed: 0, details: ['Ignorado: Ambiente de servidor.'] };
  }

  logDetails.push('[Sync & Purge] Iniciando sincronização e limpeza segura...');

  if (!supabase) {
    const err = 'Supabase não configurado. Abortando para evitar perda de dados.';
    logDetails.push(`[ERRO] ${err}`);
    return { success: false, bytesFreed: 0, details: logDetails };
  }

  if (!navigator.onLine) {
    const err = 'Navegador offline. A limpeza exige conexão com a nuvem.';
    logDetails.push(`[ERRO] ${err}`);
    return { success: false, bytesFreed: 0, details: logDetails };
  }

  try {
    // -------------------------------------------------------------------------
    // Passo 1: Sincronizar todos os ws_script_execution_* principais
    // -------------------------------------------------------------------------
    logDetails.push('[Sync & Purge] Passo 1: Analisando e enviando execuções de roteiros...');
    const wsKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('ws_script_execution_') && !key.endsWith('_srt_pipeline') && !key.endsWith('_post_package')) {
        wsKeys.push(key);
      }
    }

    for (const mainKey of wsKeys) {
      const wsMainRaw = localStorage.getItem(mainKey);
      if (!wsMainRaw) continue;

      try {
        const wsMain = JSON.parse(wsMainRaw);
        const themeId = wsMain._themeId || wsMain.themeId;
        const projectId = wsMain.projectId || wsMain.project_id || mainKey.replace('ws_script_execution_', '');

        if (themeId && projectId) {
          // Reunir srt_pipeline e post_package se existirem localmente
          const srtKey = `${mainKey}_srt_pipeline`;
          const postKey = `${mainKey}_post_package`;
          const srtRaw = localStorage.getItem(srtKey);
          const postRaw = localStorage.getItem(postKey);

          const fullSnapshot = {
            ...wsMain,
          };
          if (srtRaw && !fullSnapshot.externalSrtPipeline) {
            fullSnapshot.externalSrtPipeline = JSON.parse(srtRaw);
          }
          if (postRaw && !fullSnapshot.postScriptPackage) {
            fullSnapshot.postScriptPackage = JSON.parse(postRaw);
          }

          logDetails.push(`[Sync & Purge] Enviando snapshot completo para o tema ${themeId}...`);
          
          // Upsert no Supabase (resiliente a duplicatas com auto-deduplicação)
          const { data: existingList, error: checkError } = await supabase
            .from('script_executions')
            .select('id')
            .eq('theme_id', themeId)
            .order('updated_at', { ascending: false });

          let upsertResult;
          if (existingList && existingList.length > 0) {
            const existing = existingList[0];

            // Limpa duplicatas se existirem
            if (existingList.length > 1) {
              const duplicateIds = existingList.slice(1).map((item: any) => item.id);
              await supabase
                .from('script_executions')
                .delete()
                .in('id', duplicateIds);
              logDetails.push(`[Sync & Purge] Removidos ${duplicateIds.length} registros duplicados na nuvem para o tema ${themeId}`);
            }

            const { data, error } = await supabase
              .from('script_executions')
              .update({
                execution_snapshot: fullSnapshot,
                updated_at: new Date().toISOString()
              })
              .eq('id', existing.id)
              .select();

            upsertResult = { data: data?.[0] || null, error };
          } else {
            const { data, error } = await supabase
              .from('script_executions')
              .insert({
                project_id: projectId,
                theme_id: themeId,
                execution_snapshot: fullSnapshot
              })
              .select();

            upsertResult = { data: data?.[0] || null, error };
          }

          if (upsertResult.error) {
            logDetails.push(`[Aviso] Falha ao enviar execução do tema ${themeId}: ${upsertResult.error.message}`);
          } else if (upsertResult.data) {
            // Confirmado! Pode expurgar do localStorage
            const hfKey = `yt_hf_bg_${mainKey}`;
            const snapKey = `snapshot_${themeId}`;

            let freed = getStringSize(wsMainRaw);
            localStorage.removeItem(mainKey);

            if (srtRaw) {
              freed += getStringSize(srtRaw);
              localStorage.removeItem(srtKey);
            }
            if (postRaw) {
              freed += getStringSize(postRaw);
              localStorage.removeItem(postKey);
            }
            const hfRaw = localStorage.getItem(hfKey);
            if (hfRaw) {
              freed += getStringSize(hfRaw);
              localStorage.removeItem(hfKey);
            }
            const snapRaw = localStorage.getItem(snapKey);
            if (snapRaw) {
              freed += getStringSize(snapRaw);
              localStorage.removeItem(snapKey);
            }

            totalBytesCleaned += freed;
            logDetails.push(`[Sync & Purge] Roteiro do tema ${themeId} sincronizado e limpo. Liberado: ${(freed / 1024).toFixed(1)} KB`);
          }
        }
      } catch (e: any) {
        logDetails.push(`[Aviso] Erro no processamento de ${mainKey}: ${e.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // Passo 1.5: Limpeza de chaves órfãs (cujo mainKey correspondente não existe no navegador)
    // -------------------------------------------------------------------------
    logDetails.push('[Sync & Purge] Passo 1.5: Analisando e removendo sub-chaves órfãs...');
    const orphanSubKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('ws_script_execution_') && (key.endsWith('_srt_pipeline') || key.endsWith('_post_package'))) {
        orphanSubKeys.push(key);
      }
    }

    for (const subKey of orphanSubKeys) {
      const prefix = 'ws_script_execution_';
      let projectId = '';
      if (subKey.endsWith('_srt_pipeline')) {
        projectId = subKey.substring(prefix.length, subKey.length - '_srt_pipeline'.length);
      } else {
        projectId = subKey.substring(prefix.length, subKey.length - '_post_package'.length);
      }
      const wsMainKey = `${prefix}${projectId}`;
      if (!localStorage.getItem(wsMainKey)) {
        try {
          const val = localStorage.getItem(subKey);
          let freed = 0;
          if (val) {
            freed += getStringSize(val);
            localStorage.removeItem(subKey);
          }
          const postKey = `${wsMainKey}_post_package`;
          const srtKey = `${wsMainKey}_srt_pipeline`;
          const hfKey = `yt_hf_bg_${wsMainKey}`;

          const postVal = localStorage.getItem(postKey);
          if (postVal) {
            freed += getStringSize(postVal);
            localStorage.removeItem(postKey);
          }
          const srtVal = localStorage.getItem(srtKey);
          if (srtVal) {
            freed += getStringSize(srtVal);
            localStorage.removeItem(srtKey);
          }
          const hfVal = localStorage.getItem(hfKey);
          if (hfVal) {
            freed += getStringSize(hfVal);
            localStorage.removeItem(hfKey);
          }

          totalBytesCleaned += freed;
          logDetails.push(`[Sync & Purge] Sub-chaves órfãs do projeto ${projectId} expurgadas por completo. Liberado: ${(freed / 1024).toFixed(1)} KB`);
        } catch (e: any) {
          logDetails.push(`[Aviso] Falha ao expurgar chaves órfãs para ${projectId}: ${e.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // Passo 2: Sincronizar e comprimir temas de todos os projetos (themes_*)
    // -------------------------------------------------------------------------
    logDetails.push('[Sync & Purge] Passo 2: Sincronizando e comprimindo temas...');
    const themeKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('themes_') && !key.includes('backup') && !key.includes('archive')) {
        themeKeys.push(key);
      }
    }

    for (const key of themeKeys) {
      const localThemesRaw = localStorage.getItem(key);
      if (!localThemesRaw) continue;

      try {
        const localThemes = JSON.parse(localThemesRaw);
        if (!Array.isArray(localThemes) || localThemes.length === 0) continue;

        let arrayChanged = false;
        let fileBytesSaved = 0;

        for (let j = 0; j < localThemes.length; j++) {
          const theme = localThemes[j];
          if (theme.production_assets && !theme.production_assets._compressed) {
            logDetails.push(`[Sync & Purge] Enviando ativos do tema "${theme.title}"...`);
            
            const sanitized = sanitizeThemeForCloud(theme);
            const { error: upsertError } = await supabase
              .from('themes')
              .upsert(sanitized);

            if (!upsertError) {
              const sizeBefore = getStringSize(JSON.stringify(theme.production_assets));
              theme.production_assets = { _compressed: true };
              arrayChanged = true;

              const sizeAfter = getStringSize(JSON.stringify(theme.production_assets));
              fileBytesSaved += (sizeBefore - sizeAfter);
              logDetails.push(`[Sync & Purge] Tema "${theme.title}" salvo e comprimido localmente.`);
            } else {
              logDetails.push(`[Aviso] Falha ao enviar tema "${theme.title}": ${upsertError.message}`);
            }
          }
        }

        if (arrayChanged) {
          const updatedThemesRaw = JSON.stringify(localThemes);
          localStorage.setItem(key, updatedThemesRaw);
          totalBytesCleaned += fileBytesSaved;
        }
      } catch (e: any) {
        logDetails.push(`[Aviso] Erro nos temas de ${key}: ${e.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // Passo 3: Sincronizar e limpar logs de BI (bi_*)
    // -------------------------------------------------------------------------
    logDetails.push('[Sync & Purge] Passo 3: Sincronizando logs de BI...');
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('bi_')) {
        const localLogsRaw = localStorage.getItem(key);
        if (!localLogsRaw) continue;

        try {
          const localLogs = JSON.parse(localLogsRaw);
          if (!Array.isArray(localLogs) || localLogs.length === 0) continue;

          const localLogIds = localLogs.map((log: any) => log.id).filter(Boolean);
          if (localLogIds.length === 0) continue;

          const { data: remoteLogs, error: logError } = await supabase
            .from('composition_log')
            .select('id')
            .in('id', localLogIds);

          if (!logError) {
            const remoteIdsSet = new Set((remoteLogs || []).map((l: any) => l.id));
            const logsToKeep = localLogs.filter((log: any) => !remoteIdsSet.has(log.id));

            if (logsToKeep.length < localLogs.length) {
              const cleanedCount = localLogs.length - logsToKeep.length;
              const updatedLogsRaw = JSON.stringify(logsToKeep);
              const bytesCleaned = getStringSize(localLogsRaw) - getStringSize(updatedLogsRaw);

              localStorage.setItem(key, updatedLogsRaw);
              totalBytesCleaned += bytesCleaned;
              logDetails.push(`[Sync & Purge] Removidos ${cleanedCount} logs de BI sincronizados.`);
            }
          }
        } catch (e: any) {
          logDetails.push(`[Aviso] Erro nos logs de BI para ${key}: ${e.message}`);
        }
      }
    }

    // -------------------------------------------------------------------------
    // Passo 4: Limpar arquivo de projetos antigo (writer_studio_projects_archive)
    // -------------------------------------------------------------------------
    const archiveRaw = localStorage.getItem('writer_studio_projects_archive');
    if (archiveRaw) {
      try {
        const size = getStringSize(archiveRaw);
        localStorage.removeItem('writer_studio_projects_archive');
        totalBytesCleaned += size;
        logDetails.push(`[Sync & Purge] Histórico de projetos writer_studio_projects_archive limpo para economizar espaço. Liberado: ${(size / 1024).toFixed(1)} KB`);
      } catch {}
    }

    const finalSizeMB = getLocalStorageSizeMB();
    logDetails.push(`[Sync & Purge] Finalizado! Tamanho final: ${finalSizeMB.toFixed(2)} MB. Total liberado: ${(totalBytesCleaned / 1024 / 1024).toFixed(2)} MB`);

    return {
      success: true,
      bytesFreed: totalBytesCleaned,
      details: logDetails
    };
  } catch (err: any) {
    logDetails.push(`[ERRO CRÍTICO] Falha na limpeza forçada: ${err.message || err}`);
    return {
      success: false,
      bytesFreed: totalBytesCleaned,
      details: logDetails
    };
  }
};
