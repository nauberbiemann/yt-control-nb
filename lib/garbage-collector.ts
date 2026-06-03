/**
 * lib/garbage-collector.ts
 * 
 * Coletor de Lixo Automático e Inteligente (Garbage Collector - GC) para o Content OS.
 * Mantém o localStorage do navegador de forma silenciosa abaixo do limite crítico (2.5 MB),
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
  
  // Só executa se o tamanho for > 2.5 MB ou se for forçado
  if (!force && currentSizeMB <= 2.5) {
    return {
      lastRun: new Date().toISOString(),
      bytesCleaned: 0,
      status: 'idle',
      details: [`Ignorado: localStorage está saudável (${currentSizeMB.toFixed(2)} MB). Limite de disparo é 2.5 MB.`]
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
        const { data: remoteExecution, error: execError } = await supabase
          .from('script_executions')
          .select('theme_id, updated_at, execution_snapshot')
          .eq('theme_id', themeId)
          .single();

        if (execError && execError.code !== 'PGRST116') { // PGRST116 é registro não encontrado
          logDetails.push(`[Aviso] Erro ao buscar execução na nuvem para o tema ${themeId}: ${execError.message}`);
          continue;
        }

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
    const archiveRaw = localStorage.getItem('writer_studio_projects_archive');
    if (archiveRaw) {
      try {
        const archive = JSON.parse(archiveRaw);
        if (Array.isArray(archive) && archive.length > 1) {
          const trimmed = archive.slice(0, 1); // Mantém apenas o snapshot mais recente
          const trimmedRaw = JSON.stringify(trimmed);
          const bytesCleaned = getStringSize(archiveRaw) - getStringSize(trimmedRaw);
          localStorage.setItem('writer_studio_projects_archive', trimmedRaw);
          totalBytesCleaned += bytesCleaned;
          logDetails.push(`[GC] Histórico de projetos reduzido de ${archive.length} para 1 snapshot. Liberado: ${(bytesCleaned / 1024).toFixed(1)} KB`);
        }
      } catch (e: any) {
        logDetails.push(`[Aviso] Falha ao processar histórico de projetos: ${e.message}`);
      }
    }

    // -------------------------------------------------------------------------
    // FASE E: Limpeza Segura de Pipelines e Ativos do Workspace Sincronizados
    // -------------------------------------------------------------------------
    logDetails.push('[GC] Fase E: Analisando pipelines de workspace ativos...');
    const wsKeys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) || '';
      if (key.startsWith('ws_script_execution_') && key.endsWith('_srt_pipeline')) {
        wsKeys.push(key);
      }
    }

    for (const srtKey of wsKeys) {
      // ws_script_execution_${projectId}_srt_pipeline
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
          // Verifica na nuvem se a execução com o pipeline já está salva
          const { data: remoteExecution, error: execError } = await supabase
            .from('script_executions')
            .select('theme_id, execution_snapshot')
            .eq('theme_id', themeId)
            .single();

          if (remoteExecution && remoteExecution.execution_snapshot?.externalSrtPipeline) {
            // Já está na nuvem! Podemos remover com segurança absoluta
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
