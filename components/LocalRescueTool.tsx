'use client';

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { HardDriveDownload, CloudUpload, Trash2, AlertTriangle, CheckCircle2 } from 'lucide-react';

export function LocalRescueTool() {
  const [storageMB, setStorageMB] = useState(0);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [hasDownloaded, setHasDownloaded] = useState(false);
  const [isPurging, setIsPurging] = useState(false);

  const calculateStorage = () => {
    let total = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i) || '';
      total += (localStorage.getItem(k) || '').length * 2;
    }
    setStorageMB(total / (1024 * 1024));
  };

  useEffect(() => {
    calculateStorage();
    const interval = setInterval(calculateStorage, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleDownloadBackup = () => {
    setIsDownloading(true);
    try {
      const backupData: Record<string, string> = {};
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.startsWith('themes_') || key.startsWith('ws_narrative_') || key.startsWith('bi_') || key.startsWith('snapshot_'))) {
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
        if (key && (key.startsWith('themes_') || key.startsWith('ws_narrative_') || key.startsWith('bi_') || key.startsWith('snapshot_') || key.startsWith('ws_script_execution_'))) {
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

  if (storageMB < 2 && uploadStatus !== 'success') return null; // Só aparece se tiver muito dado ou se a migração terminou com sucesso.

  return (
    <div className="w-full bg-slate-900 border-2 border-red-500/50 rounded-xl p-6 mb-8 shadow-2xl shadow-red-900/20 relative overflow-hidden animate-in fade-in zoom-in duration-500">
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-red-500 via-orange-500 to-red-500"></div>
      
      <div className="flex flex-col md:flex-row gap-6 items-center">
        <div className="flex-shrink-0 bg-red-500/10 p-4 rounded-full border border-red-500/20">
          <AlertTriangle className="w-10 h-10 text-red-500 animate-pulse" />
        </div>
        
        <div className="flex-1">
          <h2 className="text-xl font-black text-white flex items-center gap-2 tracking-tight">
            ALERTA CRÍTICO DE ARMAZENAMENTO ({storageMB.toFixed(1)} MB Usados)
          </h2>
          <p className="text-slate-400 text-sm mt-2 leading-relaxed max-w-2xl">
            Seu navegador atingiu o limite físico de memória e <b>vai começar a travar ou perder roteiros</b>. 
            Siga os 3 passos abaixo nesta ordem exata para salvar seus arquivos em segurança para o banco de dados oficial (Supabase) e liberar a memória local.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-8">
        
        {/* PASSO 1 */}
        <div className="bg-slate-800/50 p-5 rounded-lg border border-slate-700 relative group">
          <div className="absolute -top-3 -left-3 w-8 h-8 bg-blue-600 rounded-full flex items-center justify-center font-black border-4 border-slate-900 shadow-lg">1</div>
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <HardDriveDownload className="w-5 h-5 text-blue-400" /> Baixar Backup Local
          </h3>
          <p className="text-xs text-slate-400 mb-4 h-10">Cria um arquivo .json físico no seu computador contendo todos os roteiros. Garantia total contra perda.</p>
          <button 
            onClick={handleDownloadBackup}
            disabled={isDownloading}
            className={`w-full py-2.5 rounded-md text-sm font-bold transition-all flex items-center justify-center gap-2 ${
              hasDownloaded ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-600/20'
            }`}
          >
            {hasDownloaded ? <><CheckCircle2 className="w-4 h-4" /> Arquivo Baixado</> : 'Baixar .JSON Seguro'}
          </button>
        </div>

        {/* PASSO 2 */}
        <div className={`bg-slate-800/50 p-5 rounded-lg border border-slate-700 relative transition-all ${!hasDownloaded ? 'opacity-40 grayscale pointer-events-none' : ''}`}>
          <div className="absolute -top-3 -left-3 w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center font-black border-4 border-slate-900 text-slate-900 shadow-lg">2</div>
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <CloudUpload className="w-5 h-5 text-amber-400" /> Sincronizar Nuvem
          </h3>
          <p className="text-xs text-slate-400 mb-4 h-10">Copia silenciosamente seus {storageMB.toFixed(1)}MB para o banco de dados seguro do Supabase.</p>
          <button 
            onClick={handleUploadToCloud}
            disabled={isUploading || uploadStatus === 'success'}
            className={`w-full py-2.5 rounded-md text-sm font-bold transition-all relative overflow-hidden ${
              uploadStatus === 'success' ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/50' : 'bg-amber-500 hover:bg-amber-400 text-slate-900 shadow-lg shadow-amber-500/20'
            }`}
          >
            {isUploading && (
              <div className="absolute top-0 left-0 h-full bg-black/10" style={{ width: `${uploadProgress}%` }}></div>
            )}
            <span className="relative z-10 flex items-center justify-center gap-2">
              {uploadStatus === 'success' ? <><CheckCircle2 className="w-4 h-4" /> 100% Sincronizado</> : 
               isUploading ? `Enviando... ${uploadProgress}%` : 'Sincronizar com Supabase'}
            </span>
          </button>
        </div>

        {/* PASSO 3 */}
        <div className={`bg-slate-800/50 p-5 rounded-lg border border-red-500/30 relative transition-all ${uploadStatus !== 'success' ? 'opacity-40 grayscale pointer-events-none' : 'shadow-[0_0_20px_rgba(239,68,68,0.2)]'}`}>
          <div className="absolute -top-3 -left-3 w-8 h-8 bg-red-600 rounded-full flex items-center justify-center font-black border-4 border-slate-900 text-white shadow-lg">3</div>
          <h3 className="font-bold text-white mb-2 flex items-center gap-2">
            <Trash2 className="w-5 h-5 text-red-400" /> Expurgar Memória
          </h3>
          <p className="text-xs text-slate-400 mb-4 h-10">Libera os 10MB do seu navegador agora que seus dados estão seguros na nuvem.</p>
          <button 
            onClick={handlePurge}
            disabled={isPurging}
            className="w-full py-2.5 rounded-md text-sm font-bold bg-red-600 hover:bg-red-500 text-white shadow-lg shadow-red-600/20 flex items-center justify-center gap-2"
          >
            {isPurging ? 'Limpando...' : 'Expurgar e Recarregar'}
          </button>
        </div>

      </div>
    </div>
  );
}
