'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  HardDriveDownload, 
  CloudUpload, 
  Trash2, 
  AlertTriangle, 
  CheckCircle2,
  ShieldCheck,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Database,
  Sparkles,
  Check,
  Info,
  Server,
  Zap
} from 'lucide-react';
import { executeBackgroundGarbageCollection, getGCLog, GCLog, syncAndPurgeAll } from '@/lib/garbage-collector';

export function LocalRescueTool() {
  const [storageMB, setStorageMB] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  // Estados do Garbage Collector Seguro
  const [gcLog, setGcLog] = useState<GCLog | null>(null);
  const [isRunningGc, setIsRunningGc] = useState(false);
  const [showGcLogs, setShowGcLogs] = useState(false);
  const [gcActionFeedback, setGcActionFeedback] = useState<string | null>(null);
  const [showAdvancedRescue, setShowAdvancedRescue] = useState(false);

  // Estados do Fluxo de Sincronização Unificada (Camada 2)
  const [isSyncingAndPurging, setIsSyncingAndPurging] = useState(false);
  const [syncAndPurgeLog, setSyncAndPurgeLog] = useState<string[] | null>(null);

  const calculateStorage = () => {
    if (typeof window === 'undefined') return;
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      total += (localStorage.getItem(k) || '').length * 2;
    }
    setStorageMB(total / (1024 * 1024));
  };

  useEffect(() => {
    calculateStorage();
    setGcLog(getGCLog());

    const interval = setInterval(() => {
      calculateStorage();
      setGcLog(getGCLog());
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);

  const handleDownloadBackup = () => {
    setIsDownloading(true);
    try {
      const backupData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('themes_') || 
          key.startsWith('ws_narrative_') || 
          key.startsWith('bi_') || 
          key.startsWith('snapshot_') ||
          key.startsWith('ws_script_execution_') ||
          key.startsWith('ws_assemblies_') ||
          key === 'writer_studio_projects'
        )) {
          backupData[key] = localStorage.getItem(key) || '';
        }
      }
      
      const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `yt_control_backup_${new Date().toISOString().split('T')[0]}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      
      setHasDownloaded(true);
    } catch (e) {
      alert('Erro ao gerar backup: ' + e);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleUploadToCloud = async () => {
    if (!supabase) {
      alert('Supabase não configurado. Impossível migrar.');
      return;
    }
    setIsUploading(true);
    setUploadStatus('idle');
    setUploadProgress(10);
    
    try {
      // Coletar todos os dados
      let allThemes: any[] = [];
      let allNarratives: any[] = [];
      let allLogs: any[] = [];
      
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.startsWith('themes_')) {
          try { allThemes.push(...JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
        }
        if (key && key.startsWith('ws_narrative_')) {
          try { allNarratives.push(...JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
        }
        if (key && key.startsWith('bi_')) {
          try { allLogs.push(...JSON.parse(localStorage.getItem(key) || '[]')); } catch {}
        }
      }

      setUploadProgress(30);

      // Limpar campos inexistentes ou mal formatados antes do Upsert
      const validThemeKeys = [
        'id', 'project_id', 'user_id', 'title', 'description', 'editorial_pillar', 
        'status', 'hook_id', 'title_structure', 'priority', 'notes', 'created_at', 
        'updated_at', 'title_structure_asset_id', 'origin_mode', 'execution_mode', 
        'composition_log_id', 'script_execution_id', 'target_publish_date', 
        'production_assets', 'selected_structure'
      ];
      
      const cleanThemes = allThemes.map(t => {
        const cleaned: any = {};
        validThemeKeys.forEach(key => {
          if (t[key] !== undefined) {
            cleaned[key] = t[key];
          }
        });
        return cleaned;
      });

      // DEDUPLICAR para evitar erro "ON CONFLICT DO UPDATE command cannot affect row a second time"
      const uniqueThemes = Array.from(new Map(cleanThemes.map(t => [t.id, t])).values());

      // Upsert Themes em Lotes (Supabase limite de payload)
      const batchSize = 50;
      for (let i = 0; i < uniqueThemes.length; i += batchSize) {
        const batch = uniqueThemes.slice(i, i + batchSize);
        const { error } = await supabase.from('themes').upsert(batch, { onConflict: 'id' });
        if (error) throw new Error('Erro ao salvar temas: ' + error.message);
      }
      setUploadProgress(60);

      const validNarrativeKeys = [
        'id', 'project_id', 'type', 'name', 'description', 'content_pattern',
        'is_active', 'created_at', 'category', 'behavior_flag', 'usage_mode',
        'tags', 'compatibility_notes', 'active'
      ];
      
      const cleanNarratives = allNarratives.map(n => {
        const cleaned: any = {};
        validNarrativeKeys.forEach(key => {
          if (n[key] !== undefined) cleaned[key] = n[key];
        });
        return cleaned;
      });

      const uniqueNarratives = Array.from(new Map(cleanNarratives.map(n => [n.id, n])).values());

      // Upsert Narratives
      for (let i = 0; i < uniqueNarratives.length; i += batchSize) {
        const batch = uniqueNarratives.slice(i, i + batchSize);
        const { error } = await supabase.from('narrative_components').upsert(batch, { onConflict: 'id' });
        if (error) throw new Error('Erro ao salvar ativos de narrativa: ' + error.message);
      }
      setUploadProgress(80);

      const validLogKeys = [
        'id', 'project_id', 'theme_id', 'created_at', 'title_structure_asset_id',
        'selected_curve_id', 'selected_argument_mode_id', 'selected_closing_style_id',
        'selected_language_signature_ids', 'selected_humanization_device_ids',
        'selected_repetition_rule_ids', 'execution_mode', 'block_count',
        'duration_minutes', 'voice_pattern', 'novelty_score', 'selection_diagnostics'
      ];
      
      const cleanLogs = allLogs.map(l => {
        const cleaned: any = {};
        validLogKeys.forEach(key => {
          if (l[key] !== undefined) cleaned[key] = l[key];
        });
        return cleaned;
      });

      const uniqueLogs = Array.from(new Map(cleanLogs.map(l => [l.id, l])).values());

      // Upsert BI logs
      for (let i = 0; i < uniqueLogs.length; i += batchSize) {
        const batch = uniqueLogs.slice(i, i + batchSize);
        await supabase.from('composition_log').upsert(batch, { onConflict: 'id' }).catch(() => {});
      }
      
      setUploadProgress(100);
      setUploadStatus('success');
      
    } catch (e: any) {
      console.error(e);
      alert('Falha na migração: ' + e.message);
      setUploadStatus('error');
    } finally {
      setIsUploading(false);
    }
  };

  const handlePurge = () => {
    if (!confirm('ATENÇÃO: Você tem certeza absoluta que o backup foi concluído ou baixado? Isso vai limpar sua memória local!')) return;
    setIsPurging(true);
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (
          key.startsWith('themes_') || 
          key.startsWith('ws_narrative_') || 
          key.startsWith('bi_') || 
          key.startsWith('snapshot_') || 
          key.startsWith('ws_script_execution_') ||
          key.startsWith('ws_assemblies_') ||
          key === 'writer_studio_projects'
        )) {
          keysToRemove.push(key);
        }
      }
      keysToRemove.forEach(k => localStorage.removeItem(k));
      calculateStorage();
      alert('Memória limpa com sucesso! Pressione OK para recarregar.');
      window.location.reload();
    } catch (e) {
      alert('Erro ao limpar cache.');
    } finally {
      setIsPurging(false);
    }
  };

  const handleRunGcManually = async () => {
    if (isRunningGc) return;
    setIsRunningGc(true);
    setGcActionFeedback("Validando backups no Supabase e comprimindo...");
    try {
      const log = await executeBackgroundGarbageCollection(true);
      setGcLog(log);
      calculateStorage();
      
      if (log.status === 'success') {
        const cleanedKB = (log.bytesCleaned / 1024).toFixed(1);
        setGcActionFeedback(`Sucesso! ${cleanedKB} KB liberados em cache local.`);
      } else {
        setGcActionFeedback("Concluído. localStorage saudável, nenhum projeto precisou de compressão.");
      }
      setTimeout(() => setGcActionFeedback(null), 5000);
    } catch (err: any) {
      setGcActionFeedback(`Erro no coletor: ${err.message || err}`);
      setTimeout(() => setGcActionFeedback(null), 5000);
    } finally {
      setIsRunningGc(false);
    }
  };

  const formatGCDate = (dateStr?: string) => {
    if (!dateStr) return 'Nunca';
    try {
      return new Date(dateStr).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    } catch {
      return 'Nunca';
    }
  };

  const renderLargestKeys = () => {
    if (typeof window === 'undefined') return null;
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      const size = (localStorage.getItem(k) || '').length * 2;
      keys.push({ key: k, sizeMB: size / (1024 * 1024) });
    }
    return keys.sort((a, b) => b.sizeMB - a.sizeMB).slice(0, 5).map((item, idx) => (
      <div key={idx} className="flex justify-between items-center text-slate-400 py-1.5 border-b border-slate-900/40 last:border-0">
        <span className="truncate max-w-[70%] text-slate-400" title={item.key}>{item.key}</span>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span className="font-bold text-slate-300">{item.sizeMB.toFixed(3)} MB</span>
          <button 
            onClick={() => {
              if (confirm(`Atenção: Excluir a chave "${item.key}" removerá as legendas e marcações locais correspondentes. Se você já sincronizou com a nuvem ou se o roteiro já foi publicado, é totalmente seguro prosseguir. Deseja excluir mesmo assim?`)) {
                localStorage.removeItem(item.key);
                calculateStorage();
              }
            }}
            className="p-1 hover:text-red-400 text-slate-600 transition-colors"
            title="Excluir esta chave permanentemente"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    ));
  };

  const handleSyncAndPurgeAll = async () => {
    if (isSyncingAndPurging) return;
    setIsSyncingAndPurging(true);
    setShowGcLogs(true);
    setSyncAndPurgeLog([
      '[Interface] Iniciando fluxo de sincronização unificado...',
      '[Interface] Testando conectividade com Supabase e status da rede...'
    ]);

    try {
      const res = await syncAndPurgeAll();
      setSyncAndPurgeLog(res.details);

      if (res.success) {
        const freedMB = (res.bytesFreed / 1024 / 1024).toFixed(2);
        setGcActionFeedback(`Limpeza concluída! ${freedMB} MB liberados.`);
        alert(`Sincronização e limpeza concluídas com sucesso!\n\nEspaço liberado: ${freedMB} MB.\nO aplicativo será recarregado.`);
        window.location.reload();
      } else {
        alert('Falha na sincronização segura. Verifique os logs e sua conexão.');
      }
    } catch (e: any) {
      setSyncAndPurgeLog(prev => [...(prev || []), `[ERRO] Falha no processo: ${e.message || e}`]);
      alert('Erro ao executar sincronização segura: ' + e.message);
    } finally {
      setIsSyncingAndPurging(false);
      calculateStorage();
    }
  };

  // Cálculo da percentagem de espaço ocupado (limite de alerta 1.8MB)
  const storagePercentage = Math.min((storageMB / 3.5) * 100, 100);

  // SE O ARMAZENAMENTO ESTIVER CRÍTICO (>= 4 MB), SE O UPLOAD FOR CONCLUÍDO OU SE O USUÁRIO ABRIR O MODO MANUAL
  if (storageMB >= 4 || uploadStatus === 'success' || showAdvancedRescue) {
    const isEmergency = storageMB >= 4 && uploadStatus !== 'success';

    return (
      <div className={`w-full bg-slate-900 border-2 rounded-xl p-6 mb-8 shadow-2xl relative overflow-hidden animate-in fade-in zoom-in duration-500 ${
        isEmergency ? 'border-red-500/50 shadow-red-900/20' : 'border-slate-800 shadow-slate-950/50'
      }`}>
        <div className={`absolute top-0 left-0 w-full h-1 bg-gradient-to-r ${
          isEmergency ? 'from-red-500 via-orange-500 to-red-500' : 'from-blue-500 via-indigo-500 to-purple-600'
        }`}></div>
        
        {/* Botão de Fechar no Modo Manual */}
        {!isEmergency && (
          <button 
            onClick={() => setShowAdvancedRescue(false)}
            className="absolute top-4 right-4 text-[10px] font-extrabold uppercase tracking-wider text-slate-400 hover:text-white px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 hover:border-slate-600 transition-all shadow-sm z-20"
          >
            Voltar ao Painel
          </button>
        )}

        <div className="flex flex-col md:flex-row gap-6 items-center">
          <div className={`flex-shrink-0 p-4 rounded-full border ${
            isEmergency ? 'bg-red-500/10 border-red-500/20' : 'bg-blue-500/10 border-blue-500/20'
          }`}>
            {isEmergency ? (
              <AlertTriangle className="w-10 h-10 text-red-500 animate-pulse" />
            ) : (
              <CloudUpload className="w-10 h-10 text-blue-400" />
            )}
          </div>
          
          <div className="flex-1">
            <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
              {isEmergency 
                ? `ALERTA CRÍTICO DE ARMAZENAMENTO (${storageMB.toFixed(2)} MB Usados)`
                : `CONSOLE DE SINCRONIZAÇÃO E EXPURGO SEGURO (${storageMB.toFixed(2)} MB Usados)`
              }
            </h2>
            <p className="text-slate-400 text-sm mt-2 leading-relaxed max-w-2xl">
              {isEmergency 
                ? 'Seu navegador atingiu o limite físico de memória e pode começar a travar ou perder roteiros. Clique no botão de Sincronização Unificada abaixo para salvar tudo com segurança na nuvem (Supabase) e liberar espaço local imediatamente.'
                : 'Use esta área para transferir com segurança todos os dados temporários do navegador para a nuvem e liberar armazenamento local em 1 único clique.'
              }
            </p>
          </div>
        </div>

        <div className="flex flex-col gap-6 mt-8 items-center max-w-2xl mx-auto text-center w-full">
          {/* BOTÃO PRINCIPAL PROMINENTE */}
          <div className="w-full bg-slate-800/40 p-6 rounded-xl border border-slate-700 shadow-lg flex flex-col items-center gap-4">
            <h3 className="text-lg font-black text-white flex items-center gap-2">
              <Zap className="w-5 h-5 text-yellow-400 animate-pulse" /> Sincronização e Limpeza Segura em 1 Clique
            </h3>
            <p className="text-xs text-slate-400 max-w-md leading-relaxed">
              Envia todos os roteiros, temas e logs pendentes para o banco de dados oficial e limpa o cache do navegador instantaneamente.
            </p>

            <button
              onClick={handleSyncAndPurgeAll}
              disabled={isSyncingAndPurging}
              className="w-full px-8 py-4 rounded-xl text-base font-black transition-all bg-gradient-to-r from-emerald-500 via-teal-500 to-emerald-600 hover:from-emerald-400 hover:to-teal-500 text-white shadow-xl shadow-emerald-900/30 flex items-center justify-center gap-3 active:scale-[0.99] disabled:opacity-50"
            >
              <RefreshCw className={`w-5 h-5 ${isSyncingAndPurging ? 'animate-spin' : ''}`} />
              {isSyncingAndPurging ? 'Sincronizando e Limpando...' : '🔄 Sincronizar e Limpar com Segurança'}
            </button>

            {isSyncingAndPurging && (
              <div className="w-full bg-slate-950/60 rounded-full h-1.5 overflow-hidden mt-2">
                <div className="bg-emerald-500 h-full animate-pulse" style={{ width: '85%' }}></div>
              </div>
            )}
          </div>

          {/* OPÇÕES SECUNDÁRIAS DE BACKUP E PURGA */}
          <div className="flex flex-col sm:flex-row items-center gap-4 w-full justify-center">
            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Ou, se preferir um backup físico antes:</span>
              <button 
                onClick={handleDownloadBackup}
                disabled={isDownloading}
                className="w-full sm:w-auto px-5 py-2 rounded-lg text-xs font-bold bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <HardDriveDownload className="w-3.5 h-3.5 text-blue-400" />
                {hasDownloaded ? '✓ JSON Baixado' : '⬇ Baixar JSON de Segurança'}
              </button>
            </div>

            <div className="flex flex-col items-center gap-1.5">
              <span className="text-[10px] text-slate-500 uppercase font-bold">Forçar limpeza local sem sincronizar:</span>
              <button 
                onClick={handlePurge}
                disabled={isPurging}
                className="w-full sm:w-auto px-5 py-2 rounded-lg text-xs font-bold bg-red-950/35 hover:bg-red-900/50 text-red-300 hover:text-white border border-red-900/40 hover:border-red-700/60 transition-all flex items-center justify-center gap-2 shadow-sm"
              >
                <Trash2 className="w-3.5 h-3.5 text-red-400" />
                {isPurging ? 'Limpando...' : 'Forçar Limpeza Local Completa'}
              </button>
            </div>
          </div>
        </div>

        {/* DIAGNÓSTICO DE TAMANHO DE CHAVES */}
        <div className="mt-6 p-4 bg-slate-950/40 rounded-lg border border-slate-800 text-xs">
          <h4 className="font-bold text-slate-300 mb-2 uppercase tracking-wider text-[10px]">Maiores Chaves na Memória do Navegador:</h4>
          <div className="flex flex-col gap-1.5 font-mono text-[10px]">
            {renderLargestKeys()}
          </div>
        </div>

        {gcActionFeedback && (
          <div className="mt-4 text-xs font-bold text-blue-400 bg-blue-500/5 border border-blue-500/20 px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse">
            <Info className="w-4 h-4 flex-shrink-0" />
            {gcActionFeedback}
          </div>
        )}

        {/* LOGS DO PROCESSO */}
        <div className="mt-4 flex justify-between items-center text-[10px] text-slate-500">
          <span>Último Ciclo de GC: {gcLog ? new Date(gcLog.lastRun).toLocaleTimeString() : 'Nunca'}</span>
          <button 
            onClick={() => setShowGcLogs(!showGcLogs)}
            className="text-blue-400 hover:text-blue-300 font-bold"
          >
            {showGcLogs ? 'Ocultar Logs Detalhados' : 'Mostrar Logs Detalhados'}
          </button>
        </div>

        {showGcLogs && (
          <div className="mt-3 bg-slate-950/80 p-3 rounded-lg border border-slate-800 font-mono text-[10px] text-slate-400 max-h-48 overflow-y-auto flex flex-col gap-1 shadow-inner">
            <p className="text-emerald-500 font-bold mb-1">// LOGS DE SINCRONIZAÇÃO E EXPURGO SEGURO</p>
            {syncAndPurgeLog && syncAndPurgeLog.length > 0 ? (
              syncAndPurgeLog.map((detail, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 select-none">[{idx + 1}]</span>
                  <span className={
                    detail.includes('[ERRO]') ? 'text-red-400 font-bold' :
                    detail.includes('[Sync & Purge]') ? 'text-blue-300' :
                    detail.includes('sincronizado') || detail.includes('limpo') || detail.includes('comprimido') ? 'text-emerald-400' :
                    'text-slate-300'
                  }>{detail}</span>
                </div>
              ))
            ) : gcLog && gcLog.details && gcLog.details.length > 0 ? (
              gcLog.details.map((detail, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 select-none">[{idx + 1}]</span>
                  <span className={
                    detail.includes('[ERRO]') ? 'text-red-400' :
                    detail.includes('[GC]') && detail.includes('sincronizado') ? 'text-blue-300' :
                    detail.includes('comprimido') || detail.includes('removido') ? 'text-emerald-400/90' :
                    'text-slate-300'
                  }>{detail}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-500 italic">Nenhum log gravado no cache local até o momento.</p>
            )}
          </div>
        )}

        {/* SUB-SEÇÃO INFORMATIVA DO COLETOR AUTOMÁTICO SEGURO */}
        <div className="mt-6 pt-4 border-t border-slate-800/60 flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-950/20 p-4 rounded-lg">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-full bg-emerald-500/10 flex items-center justify-center border border-emerald-500/30">
              <ShieldCheck className="w-4 h-4 text-emerald-400 animate-pulse" />
            </div>
            <div>
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                Defesa Automática Ativa <span className="text-[10px] bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 px-1.5 py-0.5 rounded">Risco Zero</span>
              </p>
              <p className="text-[10px] text-slate-500">O Coletor de Lixo em background está ativo. Ele sincroniza tudo na nuvem antes de comprimir dados.</p>
            </div>
          </div>
          <button
            onClick={handleRunGcManually}
            disabled={isRunningGc}
            className="px-4 py-2 rounded-md bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white border border-slate-700 hover:border-slate-600 transition-all text-xs font-bold flex items-center gap-2"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isRunningGc ? 'animate-spin text-blue-400' : ''}`} />
            Forçar Coleta Segura
          </button>
        </div>
      </div>
    );
  }

  // SE O ARMAZENAMENTO ESTIVER SAUDÁVEL (ABAIXO DE 2 MB) - RENDERIZA PAINEL DISCRETO DE INFORMAÇÃO & SEGURANÇA
  return (
    <div className="w-full bg-slate-950/40 backdrop-blur-md border border-slate-800/80 rounded-xl p-4 flex flex-col gap-4 shadow-xl hover:border-slate-700/80 transition-all duration-300 max-w-7xl animate-in fade-in slide-in-from-top-4 duration-300">
      
      {/* HEADER PRINCIPAL */}
      <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        
        {/* Status com Indicador Pulsante */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-10 h-10 rounded-xl bg-slate-900 border border-slate-800 flex items-center justify-center text-emerald-400 shadow-inner">
              <ShieldCheck className="w-5.5 h-5.5" />
            </div>
            {/* Ponto Pulsante */}
            <span className="absolute -top-1 -right-1 flex h-3 w-3">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500 border border-slate-950"></span>
            </span>
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-black text-white uppercase tracking-tight">Coletor de Lixo em Background</h4>
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center gap-1 shadow-sm">
                <Check className="w-2.5 h-2.5" /> Risco Zero
              </span>
            </div>
            <p className="text-[11px] text-slate-400 leading-normal">
              Seus projetos locais estão 100% protegidos contra perdas. Limpezas ocorrem apenas após confirmação e hash na nuvem.
            </p>
          </div>
        </div>

        {/* Informações de Métricas + Ação */}
        <div className="flex flex-wrap items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 border-slate-800/50 pt-3 md:pt-0">
          
          {/* Métrica: Espaço Local */}
          <div className="text-left md:text-right pr-2">
            <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Armazenamento Local</p>
            <p className="text-xs font-black text-slate-300">
              {storageMB.toFixed(2)} MB <span className="text-[10px] text-slate-500 font-medium">/ 3.50 MB recom.</span>
            </p>
          </div>

          {/* Métrica: Poupado */}
          <div className="text-left md:text-right px-2 border-l md:border-r border-slate-800/80">
            <p className="text-[9px] uppercase font-bold text-slate-500 tracking-wider">Espaço Poupado</p>
            <p className="text-xs font-black text-emerald-400">
              {gcLog ? `${(gcLog.bytesCleaned / 1024).toFixed(1)} KB` : '0.0 KB'}
            </p>
          </div>

          {/* Ação manual discreta */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAdvancedRescue(true)}
              title="Abrir painel de sincronização em nuvem e expurgo completo"
              className="px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800/80 text-slate-300 hover:text-blue-400 border border-slate-800 hover:border-slate-700 transition-all text-xs font-extrabold flex items-center gap-1.5 shadow-sm"
            >
              <CloudUpload className="w-3 h-3 text-slate-400" />
              Sincronização Completa
            </button>

            <button
              onClick={handleRunGcManually}
              disabled={isRunningGc}
              title="Executa a verificação e compressão manual dos dados sincronizados"
              className="px-3 py-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 hover:border-slate-700 transition-all text-xs font-extrabold flex items-center gap-2 shadow-sm disabled:opacity-50"
            >
              <RefreshCw className={`w-3 h-3 ${isRunningGc ? 'animate-spin text-blue-400' : ''}`} />
              {isRunningGc ? 'Analisando...' : 'Rodar Limpeza'}
            </button>

            {/* Expandir logs */}
            <button
              onClick={() => setShowGcLogs(!showGcLogs)}
              className="p-1.5 rounded-lg bg-slate-900/60 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-white transition-all"
              title="Visualizar logs detalhados do coletor"
            >
              {showGcLogs ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

        </div>

      </div>

      {/* FEEDBACK DE AÇÃO DIRECTA */}
      {gcActionFeedback && (
        <div className="text-xs font-bold text-blue-400 bg-blue-500/5 border border-blue-500/20 px-3 py-2 rounded-lg flex items-center gap-2 animate-pulse">
          <Info className="w-4 h-4 flex-shrink-0" />
          {gcActionFeedback}
        </div>
      )}

      {/* BARRA DE PROGRESSO DO LOCALSTORAGE (Limite de disparo = 3.5MB) */}
      <div className="w-full bg-slate-900/30 p-3 rounded-lg border border-slate-800/50">
        <div className="flex justify-between items-center mb-2">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
            <Database className="w-3.5 h-3.5 text-slate-500" /> Uso do Limite Recomendado
          </span>
          <div className="flex items-center gap-2">
            <span className={`inline-block w-1.5 h-1.5 rounded-full ${
              storageMB >= 3.5 ? 'bg-rose-500 animate-pulse' : storageMB > 2.5 ? 'bg-amber-500' : 'bg-emerald-500'
            }`} />
            <span className={`text-[10px] font-extrabold uppercase tracking-wider ${
              storageMB >= 3.5 ? 'text-rose-400' : storageMB > 2.5 ? 'text-amber-400' : 'text-emerald-400'
            }`}>
              {storageMB >= 3.5 ? 'Limite Recomendado Excedido' : storageMB > 2.5 ? 'Atenção' : 'Excelente'} ({((storageMB / 3.5) * 100).toFixed(0)}%)
            </span>
          </div>
        </div>
        <div className="w-full h-1.5 bg-slate-950 rounded-full overflow-hidden border border-slate-800/60 relative">
          <div 
            className={`h-full rounded-full transition-all duration-500 ${
              storageMB >= 3.5
                ? 'bg-gradient-to-r from-rose-500 to-red-600 shadow-[0_0_8px_rgba(244,63,94,0.5)]'
                : storageMB > 2.5
                ? 'bg-gradient-to-r from-amber-500 to-orange-500 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                : 'bg-gradient-to-r from-emerald-500 to-teal-500 shadow-[0_0_8px_rgba(16,185,129,0.3)]'
            }`}
            style={{ width: `${storagePercentage}%` }}
          />
        </div>
        <div className="flex justify-between items-center mt-1.5 text-[9px] text-slate-500">
          <span>0.00 MB (Vazio)</span>
          <span className="font-medium text-slate-400">Limite Recomendado: 3.50 MB</span>
          <span>3.50+ MB</span>
        </div>
      </div>

      {/* DETALHES EXPANDÍVEIS E TERMINAL DE LOGS */}
      {showGcLogs && (
        <div className="mt-2 pt-3 border-t border-slate-800/50 flex flex-col gap-3 animate-in slide-in-from-top-2 duration-300">
          
          {/* Informações detalhadas da última execução */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
            <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900 flex flex-col gap-1.5">
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                <Server className="w-3.5 h-3.5 text-slate-400" /> Diagnóstico do Coletor
              </span>
              <p className="text-slate-300"><b>Último Ciclo:</b> {formatGCDate(gcLog?.lastRun)}</p>
              <p className="text-slate-300"><b>Status:</b> {
                gcLog?.status === 'success' ? <span className="text-emerald-400 font-bold">Sucesso</span> :
                gcLog?.status === 'error' ? <span className="text-red-400 font-bold">Erro de Execução</span> :
                <span className="text-slate-400">Aguardando Limpeza</span>
              }</p>
            </div>
            
            {/* Informações de Risco Zero */}
            <div className="bg-slate-900/40 p-3 rounded-lg border border-slate-900 flex flex-col gap-1">
              <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
                <Sparkles className="w-3.5 h-3.5 text-emerald-400 animate-pulse" /> Certificado de Integridade
              </span>
              <p className="text-[11px] text-slate-400 leading-normal">
                Todas as operações no cache local são precedidas por um upload e verificação de integridade no Supabase. 
                Os identificadores de temas, roteiros e logs de BI são salvos de forma redundante e rehidratados sob demanda (lazy loading) instantaneamente.
              </p>
            </div>
          </div>

          {/* DIAGNÓSTICO DE TAMANHO DE CHAVES */}
          <div className="p-4 bg-slate-900/40 rounded-lg border border-slate-900 text-xs">
            <h4 className="font-bold text-slate-300 mb-2 uppercase tracking-wider text-[10px]">Maiores Chaves na Memória do Navegador:</h4>
            <div className="flex flex-col gap-1.5 font-mono text-[10px] mt-2">
              {renderLargestKeys()}
            </div>
          </div>

          {/* Terminal de Logs */}
          <div className="bg-slate-950/80 p-3 rounded-lg border border-slate-900 font-mono text-[10px] text-slate-400 max-h-48 overflow-y-auto flex flex-col gap-1 shadow-inner relative">
            <div className="absolute top-2 right-2 text-[9px] bg-slate-900 px-2 py-0.5 rounded border border-slate-800 text-slate-500 select-none">
              Console de Sincronização
            </div>
            <p className="text-emerald-500 font-bold mb-1">// COLETOR DE LIXO SEGURO - LOGS DE EXECUÇÃO EM BACKGROUND</p>
            {gcLog && gcLog.details && gcLog.details.length > 0 ? (
              gcLog.details.map((detail, idx) => (
                <div key={idx} className="flex gap-2">
                  <span className="text-slate-600 select-none">[{idx + 1}]</span>
                  <span className={
                    detail.includes('[ERRO]') ? 'text-red-400' :
                    detail.includes('[GC]') && detail.includes('sincronizado') ? 'text-blue-300' :
                    detail.includes('comprimido') || detail.includes('removido') ? 'text-emerald-400/90' :
                    'text-slate-300'
                  }>{detail}</span>
                </div>
              ))
            ) : (
              <p className="text-slate-500 italic">Nenhum log gravado no cache local até o momento.</p>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

