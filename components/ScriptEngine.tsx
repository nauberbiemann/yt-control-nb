'use client';

import { useState, useEffect, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject, useProjectStore } from '@/lib/store/projectStore';
import { immutableInsert } from '@/lib/supabase-mutations';
import { Play, Save, Copy, Layout, Settings, MessageSquare, Sparkles, ChevronDown, Trash2, Plus, Database, PenTool, History, Zap, RotateCcw, ArrowLeft } from 'lucide-react';
import ProductionAssembler from './ProductionAssembler';

interface ScriptBlock {
  id: string;
  type: 'Hook' | 'Context' | 'Development' | 'CTA' | 'SOP';
  title: string;
  content: string;
  sop?: string; // New field for production guidelines
}

type ExecutionMode = 'internal' | 'external';

interface ExecutionSnapshot {
  approvedTheme: string;
  approvedBriefing: any;
  scriptBlocks: ScriptBlock[];
  assemblerActive: boolean;
  thumbnailDirective: { description: string; prompt: string } | null;
  showThumbnailPanel: boolean;
  thumbnailUrl: string;
  executionMode: ExecutionMode;
  externalScriptText: string;
  externalScriptFileName: string;
  externalSourceLabel: string;
}

interface ScriptEngineProps {
  activeProject?: any;
  pendingData?: any;
  onClearPending?: () => void;
}

const mergeNarrativeComponents = (localItems: any[], remoteItems: any[]) => {
  const merged = new Map<string, any>();
  localItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  remoteItems.forEach((item) => {
    if (item?.id) merged.set(item.id, item);
  });
  return Array.from(merged.values());
};

const componentSignature = (item: any) => {
  return [
    item?.type || '',
    item?.name || '',
    item?.description || '',
    item?.content_pattern || '',
    item?.category || '',
  ]
    .join('|')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
};

const dedupeNarrativeComponents = (items: any[]) => {
  const merged = new Map<string, any>();
  items.forEach((item) => {
    const key = componentSignature(item);
    if (!merged.has(key)) {
      merged.set(key, item);
    }
  });
  return Array.from(merged.values());
};

const describeNarrativeAssetReference = (
  label: string,
  asset?: { name?: string; description?: string; pattern?: string } | null
) => {
  if (!asset?.name && !asset?.description && !asset?.pattern) return '';

  const supportText = asset?.description || '';
  const assetName = asset?.name || label;

  return `${label}: preserve a funcao estrategica do ativo "${assetName}" e reinterprete com formulacao propria. Nao reutilize frases, slogans, exemplos ou estruturas literais da biblioteca.${supportText ? ` Intencao-base: ${supportText}` : ''}`;
};

const buildCommunityReferenceCatalog = (items: any[]) => {
  return items
    .map((item) => {
      const name = item?.name?.trim();
      const description = item?.description?.trim();
      if (name && description) return `${name}: ${description}`;
      return name || description || '';
    })
    .filter(Boolean)
    .join(' | ');
};

const describeNarrativeReference = (label: string, text?: string) => {
  if (!text) return '';
  return `${label}: use apenas como referencia funcional. Nao repita a formulacao literal do texto-base.`;
};

export default function ScriptEngine({ activeProject: propProject, pendingData, onClearPending }: ScriptEngineProps) {
  // Zustand store takes priority for data isolation
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;
  const activeAIConfig = (useProjectStore.getState() as any)?.activeAIConfig;

  const [selectedProject] = useState(activeProject?.name || 'Selecione um Projeto');
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [assemblerActive, setAssemblerActive] = useState(true);
  const [approvedTheme, setApprovedTheme] = useState('');
  const [approvedBriefing, setApprovedBriefing] = useState<any | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [mobileTab, setMobileTab] = useState<'context' | 'main'>('main');
  const [executionHydrated, setExecutionHydrated] = useState(false);
  const [thumbnailDirective, setThumbnailDirective] = useState<{description: string; prompt: string} | null>(null);
  const [showThumbnailPanel, setShowThumbnailPanel] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(activeProject?.default_execution_mode === 'external' ? 'external' : 'internal');
  const [externalScriptText, setExternalScriptText] = useState('');
  const [externalScriptFileName, setExternalScriptFileName] = useState('');
  const [externalSourceLabel, setExternalSourceLabel] = useState('');
  
  // BI Traceability States
  const [components, setComponents] = useState<any[]>([]);
  const [componentsHydrated, setComponentsHydrated] = useState(false);
  const [selectedHookId, setSelectedHookId] = useState<string>('h_S1');
  const [selectedCtaId, setSelectedCtaId] = useState<string>('cta_default');
  const executionStorageKey = activeProject?.id ? `ws_script_execution_${activeProject.id}` : null;
  const defaultExecutionMode: ExecutionMode = activeProject?.default_execution_mode === 'external' ? 'external' : 'internal';

  useEffect(() => {
    void fetchComponents();
  }, [activeProject?.id]);

  const readLocalNarrativeCache = (projectId?: string) => {
    if (!projectId) return [];

    const localData = localStorage.getItem(`ws_narrative_${projectId}`);
    if (!localData) return [];

    try {
      const parsed = JSON.parse(localData);
      return dedupeNarrativeComponents(Array.isArray(parsed) ? parsed : []);
    } catch (parseErr) {
      console.warn('[ScriptEngine] Local narrative cache invalid, ignoring cache.', parseErr);
      return [];
    }
  };

  const fetchComponents = async () => {
    if (!activeProject?.id) {
      setComponents([]);
      setComponentsHydrated(false);
      return;
    }

    const projectId = activeProject.id;
    const localItems = readLocalNarrativeCache(projectId);

    setComponents(localItems);
    setComponentsHydrated(true);

    try {
      if (supabase) {
        const { data, error } = await supabase.from('narrative_components').select('*').eq('project_id', projectId);
        if (error) throw error;
        if (data && data.length > 0) {
          const merged = dedupeNarrativeComponents(mergeNarrativeComponents(localItems, data));
          setComponents(merged);
          localStorage.setItem(`ws_narrative_${projectId}`, JSON.stringify(merged));
          return;
        }
      }

      return;
      
      if (false) {
        setComponents([
          { id: 'h_S1', type: 'Hook', name: 'ProvocaÃ§Ã£o S1', description: 'ComeÃ§a com um erro tÃ©cnico.' },
          { id: 'h_S5', type: 'Hook', name: 'Blueprint S5', description: 'Apresenta o mapa da soluÃ§Ã£o.' },
          { id: 'h_S3', type: 'Hook', name: 'InterrupÃ§Ã£o S3', description: 'Quebra de padrÃ£o agressiva.' },
          { id: 'cta_default', type: 'CTA', name: 'ConversÃ£o PUC', description: 'Chamada padrÃ£o alinhada Ã  matriz de conversÃ£o.' }
        ]);
      }
    } catch (e) {
      console.error(e);
      setComponents(localItems);
    }
  };

  const buildExecutionSnapshot = (overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
    approvedTheme,
    approvedBriefing,
    scriptBlocks,
    assemblerActive,
    thumbnailDirective,
    showThumbnailPanel,
    thumbnailUrl,
    executionMode,
    externalScriptText,
    externalScriptFileName,
    externalSourceLabel,
    ...overrides,
  });

  const saveManualThemeToBank = async (
    themeTitle: string,
    briefing: any,
    executionSnapshot?: ExecutionSnapshot
  ) => {
    if (!activeProject?.id || pendingData) return;

    const storageKey = `themes_${activeProject.id}`;
    const existingThemes = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const themeIndex = existingThemes.findIndex((item: any) =>
      item?.title?.trim().toLowerCase() === themeTitle.trim().toLowerCase()
    );

    const themePayload = {
      title: themeTitle,
      description: `Tema aprovado manualmente na Escrita Criativa para o projeto ${activeProject?.name || activeProject?.project_name || 'ativo'}.`,
      editorial_pillar: activeProject?.playlists?.tactical_journey?.[0]?.label || '',
      status: 'scripted',
      title_structure: briefing?.selectedTitleStructure?.name || '',
      selected_structure: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || '',
      title_structure_asset_id: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || null,
      pipeline_level: activeProject?.playlists?.tactical_journey?.[0]?.label || '',
      is_demand_vetted: true,
      is_persona_vetted: true,
      refined_title: themeTitle,
      priority: Number(existingThemes[themeIndex]?.priority || 0),
      notes: existingThemes[themeIndex]?.notes || 'Origem: tema manual aprovado na Escrita Criativa.',
      match_score: Number(briefing?.diagnostics?.noveltyScore || 0),
      demand_views: existingThemes[themeIndex]?.demand_views || '',
      production_assets: {
        source: 'script_engine_manual_approval',
        approved_at: new Date().toISOString(),
        hook_id: briefing?.assetLog?.hook || null,
        cta_id: briefing?.assetLog?.ctaFinal || null,
        title_structure_id: briefing?.assetLog?.titleStructure || null,
        narrative_curve_id: briefing?.selectedNarrativeCurve?.id || briefing?.assetLog?.narrativeCurve || null,
        argument_mode_id: briefing?.selectedArgumentMode?.id || briefing?.assetLog?.argumentMode || null,
        repetition_rule_ids: briefing?.selectedRepetitionRules?.map((rule: any) => rule.id) || [],
        block_count: briefing?.blockCount || briefing?.blocks?.length || null,
        duration_minutes: Number((briefing?.estimatedDuration || '').match(/\d+/)?.[0] || 0) || null,
        voice_pattern: briefing?.diagnostics?.locked?.voicePatternId || null,
        execution_mode: executionSnapshot?.executionMode || executionMode,
        external_script_text: executionSnapshot?.externalScriptText || '',
        external_file_name: executionSnapshot?.externalScriptFileName || '',
        external_source_label: executionSnapshot?.externalSourceLabel || '',
        execution_snapshot: executionSnapshot || null,
      },
      project_id: activeProject.id,
      user_id: activeProject?.user_id || null,
      updated_at: new Date().toISOString(),
    };

    const localThemePayload = {
      ...themePayload,
      execution_mode: executionSnapshot?.executionMode || executionMode,
    };

    const nextThemes = [...existingThemes];
    if (themeIndex >= 0) {
      nextThemes[themeIndex] = { ...nextThemes[themeIndex], ...localThemePayload };
    } else {
      nextThemes.unshift({
        ...localThemePayload,
        id: crypto.randomUUID(),
        created_at: new Date().toISOString(),
      });
    }
    localStorage.setItem(storageKey, JSON.stringify(nextThemes));

    if (!supabase) return;

    try {
      const existingRemote = await supabase
        .from('themes')
        .select('id')
        .eq('project_id', activeProject.id)
        .ilike('title', themeTitle)
        .limit(1);

      if (existingRemote.data && existingRemote.data[0]?.id) {
        await supabase.from('themes').update(themePayload).eq('id', existingRemote.data[0].id);
      } else {
        await supabase.from('themes').insert(themePayload);
      }
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao sincronizar tema manual com o Banco de Temas.', error);
    }
  };

  useEffect(() => {
    if (!executionStorageKey || pendingData) {
      setExecutionHydrated(true);
      return;
    }

    try {
      const raw = localStorage.getItem(executionStorageKey);
      if (!raw) {
        setExecutionHydrated(true);
        return;
      }

      const snapshot = JSON.parse(raw);
      if (snapshot?.approvedTheme) setApprovedTheme(snapshot.approvedTheme);
      if (snapshot?.approvedBriefing) setApprovedBriefing(snapshot.approvedBriefing);
      const normalizedSnapshotBlocks =
        snapshot?.approvedBriefing && Number(snapshot?.approvedBriefing?.blockCount || 0) > 0
          ? buildScriptBlocksFromBriefing(snapshot.approvedBriefing, snapshot?.approvedTheme || '')
          : Array.isArray(snapshot?.scriptBlocks) && snapshot.scriptBlocks.length > 0
            ? snapshot.scriptBlocks
            : [];
      if (normalizedSnapshotBlocks.length > 0) {
        setScriptBlocks(normalizedSnapshotBlocks);
      }
      if (typeof snapshot?.assemblerActive === 'boolean') setAssemblerActive(snapshot.assemblerActive);
      if (snapshot?.thumbnailDirective) setThumbnailDirective(snapshot.thumbnailDirective);
      if (typeof snapshot?.showThumbnailPanel === 'boolean') setShowThumbnailPanel(snapshot.showThumbnailPanel);
      if (typeof snapshot?.thumbnailUrl === 'string') setThumbnailUrl(snapshot.thumbnailUrl);
      if (snapshot?.executionMode === 'external' || snapshot?.executionMode === 'internal') setExecutionMode(snapshot.executionMode);
      if (typeof snapshot?.externalScriptText === 'string') setExternalScriptText(snapshot.externalScriptText);
      if (typeof snapshot?.externalScriptFileName === 'string') setExternalScriptFileName(snapshot.externalScriptFileName);
      if (typeof snapshot?.externalSourceLabel === 'string') setExternalSourceLabel(snapshot.externalSourceLabel);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao restaurar execucao salva.', error);
    } finally {
      setExecutionHydrated(true);
    }
  }, [executionStorageKey, pendingData]);

  useEffect(() => {
    if (!executionStorageKey || !executionHydrated) return;

    const shouldPersist = !!approvedBriefing || !assemblerActive || !!approvedTheme;
    if (!shouldPersist) return;

    const snapshot = {
      ...buildExecutionSnapshot(),
      updated_at: new Date().toISOString(),
    };

    localStorage.setItem(executionStorageKey, JSON.stringify(snapshot));
  }, [
    executionStorageKey,
    executionHydrated,
    approvedTheme,
    approvedBriefing,
    scriptBlocks,
    assemblerActive,
    thumbnailDirective,
    showThumbnailPanel,
    thumbnailUrl,
    executionMode,
    externalScriptText,
    externalScriptFileName,
    externalSourceLabel,
  ]);

  useEffect(() => {
    if (!executionHydrated) return;
    if (approvedBriefing || approvedTheme || externalScriptText || !assemblerActive) return;
    setExecutionMode(defaultExecutionMode);
  }, [
    defaultExecutionMode,
    executionHydrated,
    approvedBriefing,
    approvedTheme,
    externalScriptText,
    assemblerActive,
  ]);
  
  useEffect(() => {
    if (!executionHydrated) return;
    if (pendingData) {
      console.log('--- Assembler V4 Initializing from Content OS Kernel ---');
      
      const metaphorsStr = activeProject?.metaphor_library || '';
      const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
      const randomM = metaphors[Math.floor(Math.random() * metaphors.length)] || 'Conceito Central';
      
      const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
      const persona = activeProject?.persona_matrix || { demographics: 'PÃºblico', pain_alignment: 'Problema' };
      const tactical_journey = activeProject?.playlists?.tactical_journey || [];

      const v4Blocks: ScriptBlock[] = [
        { 
          id: 'h1', 
          type: 'Hook', 
          title: `Hook EstratÃ©gico [${pendingData.title_structure || pendingData.selected_structure || 'S1'}]`, 
          content: pendingData.refined_title || pendingData.title || '',
          sop: `Estilo: ${sop.zoom_style}. Ritmo: ${sop.cut_rhythm}. Impacto visual imediato no gancho.` 
        },
        { 
          id: 'c1', 
          type: 'Context', 
          title: 'ConexÃ£o com a Persona', 
          content: `Vincular o tema [${pendingData.title || pendingData.raw_theme || ''}] com o perfil [${persona.demographics}] e a dor central: ${persona.pain_alignment}.`,
          sop: `Trilha: ${sop.soundtrack}. Tom empÃ¡tico. CÃ¢mera focada para gerar conexÃ£o.`
        }
      ];

      // Dynamic Funnel Ingestion (T1-T3)
      tactical_journey.forEach((module: any, idx: number) => {
        v4Blocks.push({
          id: `module-${idx}`,
          type: 'Development',
          title: `Bloco ${module.label}: ${module.title}`,
          content: `Injetar metÃ¡fora: ${randomM}. Desenvolver ${module.title}: ${module.value || 'Focar na soluÃ§Ã£o tÃ©cnica'}.`,
          sop: `Ritmo: ${sop.cut_rhythm}. Use overlays de texto para os termos da Metaphor Library.`
        });
      });

      v4Blocks.push({ 
        id: 'cta1', 
        type: 'CTA', 
        title: 'ConversÃ£o PUC', 
        content: `CTA EstratÃ©gico: TransiÃ§Ã£o para a Promessa Ãšnica (PUC) - ${activeProject?.puc}. Chamar para a aÃ§Ã£o especÃ­fica do projeto.`,
        sop: 'Split screen ou CTA visual. Encerramento com a trilha em crescendo.'
      });

      setScriptBlocks(v4Blocks);
      onClearPending?.();
      setAssemblerActive(false); // Move to editor once pending data arrives
    } else if (scriptBlocks.length === 0 && !approvedBriefing) {
      setScriptBlocks([
        { id: 'h0', type: 'Hook', title: 'Gancho EstratÃ©gico', content: 'Inicie com uma promessa tÃ©cnica...', sop: 'Corte seco.' },
        { id: 'c0', type: 'Context', title: 'ContextualizaÃ§Ã£o', content: 'Conecte com a dor do pÃºblico...', sop: 'B-roll de contexto.' }
      ]);
    }
  }, [pendingData, activeProject?.id, executionHydrated, approvedBriefing, scriptBlocks.length]);

  const formatCharsLabel = (value?: number | null) => {
    if (!value || value <= 0) return 'Nao definido';
    return `~${Math.round(value).toLocaleString('pt-BR')} caracteres`;
  };

  const buildExternalWritingPrompt = () => {
    if (!approvedBriefing) return '';

    const minutes = Number((approvedBriefing.estimatedDuration || '').match(/\d+/)?.[0] || 0);
    const totalChars = Number(approvedBriefing.estimatedChars || (minutes ? minutes * 1200 : 0)) || 0;
    const hookChars = Number(approvedBriefing.hookChars || Math.floor(totalChars * 0.08)) || 0;
    const ctaBudget = Number(approvedBriefing.ctaChars || Math.floor(totalChars * 0.06)) || 0;
    const hasMidCta = !!approvedBriefing?.midCta;
    const midCtaChars = hasMidCta ? Math.max(160, Math.floor(ctaBudget * 0.45)) : 0;
    const finalCtaChars = hasMidCta ? Math.max(220, ctaBudget - midCtaChars) : ctaBudget;
    const bodyBlocks = Array.isArray(approvedBriefing?.blocks) ? approvedBriefing.blocks : [];
    const promptBlocks = scriptBlocks.filter((block) => block.type === 'Development');
    const centralDevelopmentBlocks = bodyBlocks.length || promptBlocks.length;
    const totalOutputBlocks = centralDevelopmentBlocks;
    const communityReferenceCatalog = buildCommunityReferenceCatalog(uniqueCommunityTemplates);
    const projectName = activeProject?.name || activeProject?.project_name || 'Projeto ativo';
    const persona = activeProject?.persona_matrix?.demographics || '';
    const pain = activeProject?.persona_matrix?.pain_alignment || '';
    const metaphors = activeProject?.metaphor_library || '';
    const sop = activeProject?.editing_sop || {};
    const selectedNarrativeCurve = approvedBriefing?.selectedNarrativeCurve;
    const selectedArgumentMode = approvedBriefing?.selectedArgumentMode;
    const selectedRepetitionRules = (approvedBriefing?.selectedRepetitionRules || []) as Array<{ id?: string; name?: string; pattern?: string; description?: string }>;
    const hookTensionMap = {
      tensionLevel: 'Alta',
      narrativeRole: 'Ruptura',
      transitionMode: 'Contraste',
    };
    const ctaTensionMap = {
      tensionLevel: 'Media',
      narrativeRole: 'Fechamento',
      transitionMode: 'Convocacao',
    };

    const narrativeArcSummary = bodyBlocks
      .map((block: any, index: number) => `Desenvolvimento ${index + 1}: ${block.tensionLevel || 'Media'} / ${block.narrativeRole || 'Diagnostico'} / ${block.transitionMode || 'Consequencia'}`)
      .join('\n');

    const extractPrimaryDirective = (content?: string) => {
      if (!content) return 'Nao definido';
      const filtered = content
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !/^(Desenvolver:|Elemento de comunidade:|Estrutura de titulo|Hook de referencia:|CTA de referencia:|Objetivo:|Conecte com a PUC:)/i.test(line));
      return filtered[0] || content.trim();
    };

    const buildAlignedBridgeInstruction = (
      nextBlock?: ScriptBlock,
      nextNarrativeBlock?: { narrativeRole?: string } | null
    ) => {
      if (!nextBlock) {
        return 'Transicao obrigatoria: feche com sensacao de conclusao natural, sem corte brusco e sem parecer encerramento apressado.';
      }

      const roleKey = (nextNarrativeBlock?.narrativeRole || '').toLowerCase();
      const roleGuidance =
        roleKey === 'espelho'
          ? 'abrindo espaco para identificacao, intimidade ou reconhecimento sem reiniciar o tema'
          : roleKey === 'diagnostico'
            ? 'transformando o que veio antes em mecanismo, leitura causal ou clareza estrutural'
            : roleKey === 'virada'
              ? 'criando uma mudanca perceptivel de eixo, revelacao ou decisao'
              : roleKey === 'aplicacao'
                ? 'convertendo insight em acao pratica, experimento ou protocolo'
                : roleKey === 'fechamento'
                  ? 'condensando o raciocinio em compromisso, sintese e convocacao'
                  : 'fazendo o proximo bloco parecer continuidade natural, e nao um novo comeco';

      return `Transicao obrigatoria: termine este bloco preparando a entrada de "${nextBlock.title}" como evolucao direta do raciocinio atual, ${roleGuidance}.`;
    };

    let developmentIndex = 0;
    const blockSpecifications = promptBlocks.map((block, index) => {
      const previousBlock = promptBlocks[index - 1];
      const nextBlock = promptBlocks[index + 1];
      const connectionLines = [
        previousBlock
          ? `Conexao de entrada: este bloco deve continuar naturalmente o raciocinio de "${previousBlock.title}", sem reiniciar o assunto nem repetir a mesma promessa.`
          : 'Conexao de entrada: este e o bloco de abertura e precisa iniciar o roteiro com impacto imediato, sem preambulo generico.',
      ];

      const currentDevelopmentIndex = developmentIndex++;
      const orchestratedBlock = bodyBlocks[currentDevelopmentIndex];
      const nextNarrativeBlock = nextBlock ? bodyBlocks[currentDevelopmentIndex + 1] : null;
      const blockLines = [
        `BLOCO ${index + 1} - DESENVOLVIMENTO`,
        `Titulo interno: ${block.title}`,
        `Meta de caracteres: ${formatCharsLabel((orchestratedBlock?.blockChars || 0) + (index === 0 ? hookChars : 0) + (index === promptBlocks.length - 1 ? finalCtaChars : 0) + (hasMidCta && index === Number(approvedBriefing?.midCta?.position || -1) ? midCtaChars : 0))}`,
        `Voz dominante: ${orchestratedBlock?.voiceStyle || approvedBriefing?.dominantVoice || 'Nao definida'}`,
        `Mapa de tensao: ${orchestratedBlock?.tensionLevel || 'Media'} | Papel: ${orchestratedBlock?.narrativeRole || 'Diagnostico'} | Transicao: ${orchestratedBlock?.transitionMode || 'Consequencia'}`,
        `Funcao narrativa: ${orchestratedBlock?.missionNarrative || block.content}`,
        `Diretriz estrutural: ${extractPrimaryDirective(block.content)}`,
        `SOP / entonacao: ${block.sop || 'Nao definido'}`,
        ...connectionLines,
        buildAlignedBridgeInstruction(nextBlock, nextNarrativeBlock),
      ];

      if (orchestratedBlock?.communityElement) {
        blockLines.push('Elemento de comunidade: use apenas como gatilho de pertencimento e identificacao coletiva, sem repetir a formulacao literal da biblioteca.');
      }

      if (orchestratedBlock?.isNarrativeTwist) {
        blockLines.push('Observacao: este e o bloco de virada narrativa e precisa marcar mudanca perceptivel de tensao ou perspectiva.');
      }

      return blockLines.join('\n');
    });

    const midCtaSection = hasMidCta
      ? [
          'INTERVENCAO INTERMEDIARIA OBRIGATORIA',
          `Insercao: embuta esta microchamada na passagem apos o bloco de desenvolvimento ${Number(approvedBriefing?.midCta?.position || 0) + 1}, sem criar um novo bloco numerado.`,
          `Meta de caracteres: ${formatCharsLabel(midCtaChars)}`,
          'Mapa de tensao: Media | Papel: Aplicacao | Transicao: Alivio',
          `Funcao narrativa: inserir uma microchamada baseada no ativo "${approvedBriefing?.midCta?.name || 'CTA intermediario'}", curta, organica e sem soar comercial demais.`,
          `Referencia funcional: ${approvedBriefing?.midCta?.pattern || 'Nao definida'}`,
          'Regra operacional: isso faz parte da engenharia do roteiro, mas nao conta como bloco adicional na numeracao final.',
        ].join('\n')
      : '';

    const lockedCompositionSection = approvedBriefing?.diagnostics ? [
      `Hook selecionado: ${approvedBriefing?.openingHook?.name || 'Nao definido'}`,
      `CTA selecionado: ${approvedBriefing?.selectedCta?.name || 'Nao definido'}`,
      `Estrutura selecionada: ${approvedBriefing?.selectedTitleStructure?.name || 'Nao definida'}`,
      `Curva selecionada: ${selectedNarrativeCurve?.name || 'Nao definida'}`,
      `Modo de argumentacao: ${selectedArgumentMode?.name || 'Nao definido'}`,
      `Padrao de voz dominante: ${approvedBriefing?.diagnostics?.locked?.voicePatternId || 'Nao definido'}`,
      `Duracao alvo: ${approvedBriefing?.diagnostics?.locked?.durationMinutes || minutes || 'N/A'} min`,
      `Total de blocos na saida final: ${totalOutputBlocks || 'N/A'}`,
      `Blocos centrais de desenvolvimento: ${centralDevelopmentBlocks || 'N/A'}`,
    ].join('\n') : 'Composicao guiada pelo projeto ativo, sem diagnostico adicional disponivel.';

    const repetitionRulesSection = selectedRepetitionRules.length > 0
      ? selectedRepetitionRules
          .map((rule) => `- ${rule.name}: ${rule.pattern || 'Sem detalhe operacional.'}`)
          .join('\n')
      : '- Nenhuma regra adicional cadastrada.';

    return `Voce vai escrever um roteiro completo fora desta plataforma, mas precisa obedecer fielmente ao blueprint abaixo.

OBJETIVO
- Produzir um roteiro final humano, natural e variado.
- Respeitar a engenharia narrativa definida pelo orquestrador.
- Tratar hook, CTA, estrutura de titulo e elementos de comunidade apenas como referencia funcional e semantica.
- Nunca copiar literalmente frases, slogans, quotes, patterns ou construcoes reconheciveis vindas da biblioteca narrativa.
- Fazer os blocos soarem como uma fala continua de um humano, nao como pecas coladas.
- Tratar a curva narrativa como progressao macro obrigatoria do roteiro.
- Tratar o modo de argumentacao como a postura dominante de persuasao, sem soar mecanico.
- Obedecer as regras de repeticao ativas como restricoes duras de escrita.

CONTEXTO ESSENCIAL
- Projeto ativo: ${projectName}
- Tema do video: ${approvedBriefing.title}
- PUC: ${activeProject?.puc || 'Nao definida'}
- Persona: ${persona || 'Nao definida'}
- Dor central: ${pain || 'Nao definida'}
- Estrutura de titulo selecionada: ${approvedBriefing?.selectedTitleStructure?.name || 'Nao definida'}
- Pattern estrutural da estrutura: ${approvedBriefing?.selectedTitleStructure?.pattern || 'Nao definido'}
- Duracao alvo: ${minutes || 'N/A'} minutos
- Meta total de caracteres: ${formatCharsLabel(totalChars)}
- SOP base: corte ${sop.cut_rhythm || 'Nao definido'}, zoom ${sop.zoom_style || 'Nao definido'}, trilha ${sop.soundtrack || 'Nao definido'}
- Metaforas do projeto: ${metaphors || 'Nao definidas'}
- Elementos de comunidade disponiveis: ${communityReferenceCatalog || 'Nao definidos'}

DIRECAO ORQUESTRADA
${lockedCompositionSection}
- Blueprint macro da curva: ${selectedNarrativeCurve?.pattern || 'Nao definido'}
- Diretriz do argumento: ${selectedArgumentMode?.pattern || 'Nao definida'}
- O total de blocos acima ja inclui Hook e CTA final.
${hasMidCta ? '- Se houver intervencao intermediaria, ela deve ser embutida na passagem indicada, sem virar bloco extra.\n' : ''}
RESTRICOES DE REPETICAO
${repetitionRulesSection}
- Os nomes dos ativos, blocos e conceitos neste briefing funcionam como rotulos operacionais internos.
- Nao reutilize esses nomes no corpo do roteiro so porque eles aparecem aqui.
- Se precisar usar um conceito canonico pelo nome, faca isso no maximo uma vez no roteiro inteiro; depois continue por parafrase, efeito narrativo ou exemplo concreto.
- Priorize cenas, linguagem oral, contraste humano e observacoes concretas acima do jargao do sistema.

MAPA DE TENSAO NARRATIVA
- Cada bloco recebe uma funcao de energia e progressao.
- Tensao Alta: ruptura, choque, desafio, virada, confronto ou revelacao forte.
- Tensao Media: aprofundamento, explicacao, espelho emocional, desenvolvimento e aplicacao.
- Tensao Baixa: respiro controlado, estabilizacao ou preparacao de fechamento.
- Papel narrativo: define o trabalho do bloco dentro da curva dramatica.
- Transicao: define como o bloco deve empurrar o proximo, evitando texto compartimentado.

CURVA DEFINIDA PELO ORQUESTRADOR
${centralDevelopmentBlocks > 0 ? '- A curva abaixo vale para os blocos centrais de desenvolvimento, nao para Hook e CTA final.\n' : ''}${narrativeArcSummary || 'Curva narrativa nao definida.'}

REGRAS GERAIS DE ESCRITA
- Preserve a funcao de cada bloco exatamente na ordem fornecida.
- Respeite a meta de caracteres de cada bloco com tolerancia maxima de 8%.
- O texto final deve soar humano, nao robotico, nem excessivamente polido.
- Nao repetir textualmente as referencias narrativas.
- Manter conexoes naturais entre blocos.
- Cada bloco deve herdar o impulso do anterior e entregar uma ponte real para o proximo.
- Evite abertura redundante no inicio de cada bloco. O leitor nao pode sentir reinicio entre as partes.
- Nao use os titulos internos dos blocos como frases prontas do texto final.
- Use transicoes humanas: consequencia, contraste, aprofundamento, confissao, diagnostico, objecao respondida ou preparacao pratica.
- Se um bloco trouxer vulnerabilidade, o proximo precisa aproveitar essa emocao e converte-la em raciocinio, nao trocar abruptamente de tom.
- Se um bloco trouxer diagnostico, o proximo precisa parecer resposta ou evolucao natural desse diagnostico.
- Sempre que possivel, transforme abstracao em cena, sintoma observavel, metrica simples ou decisao concreta.
- O roteiro completo precisa parecer escrito de uma vez so, com progressao, cadencia e memoria interna.
- Nao devolver explicacoes, rotulos tecnicos, markdown ou comentarios sobre o processo.
- Entregar o roteiro final separado por blocos, na mesma ordem abaixo.

BLUEPRINT BLOCO A BLOCO
${blockSpecifications.join('\n\n')}${midCtaSection ? `\n\n${midCtaSection}` : ''}

FORMATO DE SAIDA
- A saida final deve conter exatamente ${totalOutputBlocks || 'N/A'} blocos numerados, na ordem abaixo.
- Entregue um bloco por vez, na mesma sequencia especificada.
- Use o titulo interno de cada bloco apenas como cabecalho operacional.
- Em cada bloco, escreva somente o texto final correspondente.
- Nao omita nenhum bloco.
- Nao fundir blocos.
- Nao mudar a ordem.
- Nao criar bloco extra fora da numeracao definida.
- Nao reduzir a ambicao dos caracteres sem justificativa estrutural.`;
  };

  const getCommandContext = () => {
    const theme = approvedBriefing?.title || approvedTheme || pendingData?.title || pendingData?.raw_theme || '';
    const variation = approvedBriefing?.selectedTitleStructure?.name || pendingData?.title_structure || pendingData?.selected_structure || 'S1';
    return { theme, variation };
  };

  const syncApprovedThemeSnapshot = async (overrides: Partial<ExecutionSnapshot> = {}) => {
    if (!approvedBriefing || !approvedTheme) return;
    try {
      await saveManualThemeToBank(
        approvedTheme,
        approvedBriefing,
        buildExecutionSnapshot(overrides)
      );
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao atualizar snapshot do tema aprovado.', error);
    }
  };

  const buildScriptBlocksFromBriefing = (briefing: any, theme: string): ScriptBlock[] => {
    const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
    const hookReference = describeNarrativeAssetReference('Hook de referencia', briefing.openingHook);
    const ctaReference = describeNarrativeAssetReference('CTA de referencia', briefing.selectedCta);
    const structureReference = describeNarrativeAssetReference('Estrutura de titulo', briefing.selectedTitleStructure);
    const midCtaPosition = Number(briefing?.midCta?.position ?? -1);

    return (briefing?.blocks || []).map((b: any, i: number) => {
      const openingLayer = i === 0
        ? `Abra este primeiro bloco com a funcao narrativa do hook abaixo, sem copiar a formulacao original.\n\n${hookReference}\n`
        : '';
      const midCtaLayer = briefing?.midCta && i === midCtaPosition
        ? `\n\nIntervencao intermediaria obrigatoria: embuta uma microchamada organicamente na passagem deste bloco, sem criar novo bloco numerado.\nReferencia funcional: ${briefing.midCta.pattern || 'Nao definida'}`
        : '';
      const closingLayer = i === ((briefing?.blocks?.length || 1) - 1)
        ? `\n\nFechamento obrigatorio: encerre este ultimo bloco incorporando a funcao do CTA final, sem separar em um bloco adicional.\n\n${ctaReference}\n\nConecte com a PUC: ${activeProject?.puc || 'DNA do projeto'}`
        : '';

      return {
        id: `block_${i}_${b.id}`,
        type: 'Development' as const,
        title: `${b.name} [${b.voiceStyle}]`,
        content: `${openingLayer}${b.missionNarrative}\n\nDesenvolver: ${b.name}.\n${b.communityElement ? 'Elemento de comunidade: use apenas como gatilho de identificacao coletiva e pertencimento, sem repetir a frase-base cadastrada.\n' : ''}${structureReference}${midCtaLayer}${closingLayer}`,
        sop: `Voz: ${b.voiceStyle}. Trilha: ${sop.soundtrack}. Use sobreposiÃ§Ã£o de texto tÃ©cnico.`,
      };
    });
  };

  const parseExternalScriptSections = (text: string) => {
    const normalized = text.replace(/\r\n/g, '\n').trim();
    if (!normalized) return [];

    const explicitSections = normalized
      .split(/(?=^\s*(?:\*\*)?BLOCO\s+\d+)/gim)
      .map((section) => section.replace(/^\s*(?:\*\*)?BLOCO\s+\d+[^\n]*\n?/i, '').trim())
      .filter(Boolean);

    if (explicitSections.length > 0) return explicitSections;

    return normalized
      .split(/\n{2,}/)
      .map((section) => section.trim())
      .filter(Boolean);
  };

  const applyExternalScriptToBlocks = async (text: string, fileName?: string) => {
    const sections = parseExternalScriptSections(text);
    if (sections.length === 0) {
      alert('Nao encontrei blocos ou secoes suficientes no texto externo.');
      return;
    }

    const nextBlocks = scriptBlocks.map((block, index) => ({
      ...block,
      content: sections[index] || block.content,
    }));

    setScriptBlocks(nextBlocks);
    setExternalScriptText(text);
    if (fileName) setExternalScriptFileName(fileName);

    await syncApprovedThemeSnapshot({
      scriptBlocks: nextBlocks,
      externalScriptText: text,
      externalScriptFileName: fileName || externalScriptFileName,
      executionMode: 'external',
    });

    alert('Roteiro externo aplicado aos blocos atuais.');
  };

  const handleExternalScriptUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setExecutionMode('external');
      setExternalScriptFileName(file.name);
      setExternalScriptText(text);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao ler arquivo externo.', error);
      alert('Nao foi possivel ler o arquivo .txt enviado.');
    } finally {
      event.target.value = '';
    }
  };

  const restoreExecutionState = () => {
    if (!executionStorageKey) return;

    try {
      const raw = localStorage.getItem(executionStorageKey);
      if (!raw) {
        alert('Nenhuma execuÃ§Ã£o salva para esta instÃ¢ncia.');
        return;
      }

      const snapshot = JSON.parse(raw);
      setApprovedTheme(snapshot?.approvedTheme || '');
      setApprovedBriefing(snapshot?.approvedBriefing || null);
      const normalizedSnapshotBlocks =
        snapshot?.approvedBriefing && Number(snapshot?.approvedBriefing?.blockCount || 0) > 0
          ? buildScriptBlocksFromBriefing(snapshot.approvedBriefing, snapshot?.approvedTheme || '')
          : Array.isArray(snapshot?.scriptBlocks) ? snapshot.scriptBlocks : [];
      setScriptBlocks(normalizedSnapshotBlocks);
      setAssemblerActive(typeof snapshot?.assemblerActive === 'boolean' ? snapshot.assemblerActive : false);
      setThumbnailDirective(snapshot?.thumbnailDirective || null);
      setShowThumbnailPanel(!!snapshot?.showThumbnailPanel);
      setThumbnailUrl(snapshot?.thumbnailUrl || '');
      setExecutionMode(snapshot?.executionMode === 'external' ? 'external' : 'internal');
      setExternalScriptText(snapshot?.externalScriptText || '');
      setExternalScriptFileName(snapshot?.externalScriptFileName || '');
      setExternalSourceLabel(snapshot?.externalSourceLabel || '');
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao restaurar execucao manualmente.', error);
      alert('Nao foi possivel restaurar a execuÃ§Ã£o salva.');
    }
  };

  const clearExecutionState = () => {
    if (executionStorageKey) localStorage.removeItem(executionStorageKey);
    setApprovedTheme('');
    setApprovedBriefing(null);
    setThumbnailDirective(null);
    setShowThumbnailPanel(false);
    setThumbnailUrl('');
    setExecutionMode(defaultExecutionMode);
    setExternalScriptText('');
    setExternalScriptFileName('');
    setExternalSourceLabel('');
    setScriptBlocks([
      { id: 'h0', type: 'Hook', title: 'Gancho EstratÃ©gico', content: 'Inicie com uma promessa tÃ©cnica...', sop: 'Corte seco.' },
      { id: 'c0', type: 'Context', title: 'ContextualizaÃ§Ã£o', content: 'Conecte com a dor do pÃºblico...', sop: 'B-roll de contexto.' }
    ]);
    setAssemblerActive(true);
  };

  const returnToAssembler = () => {
    setAssemblerActive(true);
  };

  const projectPillars = activeProject?.playlists?.tactical_journey || [];
  const projectPersona = activeProject?.persona_matrix || {};
  const projectSop = activeProject?.editing_sop || {};
  const projectNarrativeSummary = {
    puC: activeProject?.puc || activeProject?.puc_promise || 'Sem PUC cadastrada',
    persona: projectPersona.demographics || activeProject?.target_persona?.audience || 'Persona nÃ£o cadastrada',
    pain: projectPersona.pain_alignment || activeProject?.target_persona?.pain_point || 'Dor central nÃ£o cadastrada',
    metaphors: (activeProject?.metaphor_library || activeProject?.ai_engine_rules?.metaphors?.join(', ') || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    pillars: projectPillars,
    cutRhythm: projectSop.cut_rhythm || '3s',
    zoomStyle: projectSop.zoom_style || 'Dynamic',
    soundtrack: projectSop.soundtrack || 'Reflexive',
    thumbStyle: activeProject?.thumb_strategy?.style || activeProject?.thumb_strategy?.layout || 'NÃ£o configurado',
  };

  const generateThumbnailDirective = () => {
    if (!activeProject) return;
    const { theme, variation } = getCommandContext();
    if (!theme) return alert('Selecione/compile um tema antes de gerar a diretriz.');

    const persona = activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'o pÃºblico-alvo';
    const puc = activeProject?.puc || activeProject?.puc_promise || 'a transformaÃ§Ã£o central do projeto';
    const layouts = activeProject?.thumb_strategy?.layouts || (activeProject?.thumb_strategy?.layout ? [activeProject.thumb_strategy.layout] : []);
    const layoutHint = Array.isArray(layouts) && layouts.length > 0 ? layouts.join(' + ') : 'layout de alto contraste';
    const accent = activeProject?.accent_color || '#9BB0A5';

    const directive = {
      description: `CONCEITO VISUAL: Traduza o tema em tensÃ£o + resoluÃ§Ã£o. Layout: ${layoutHint}. Paleta: fundo escuro com acento ${accent}. ExpressÃ£o: impacto/revelaÃ§Ã£o. Texto curto (mÃ¡x 5 palavras) com promessa ligada Ã  PUC. PÃºblico: ${persona}. Estrutura: ${variation}.`,
      prompt: `Create a YouTube thumbnail for a video about: "${theme}". Style: dramatic, high contrast, dark background with vivid accent color (${accent}). Layout: ${layoutHint}. Feature: close-up of person with revelatory expression OR a single symbolic object. Bold text overlay (max 5 words) aligned to this promise: "${puc}". Professional studio lighting, 4K quality. No watermarks. Aspect ratio 16:9. Photorealistic.`
    };
    setThumbnailDirective(directive);
    setShowThumbnailPanel(true);
  };

  const handleDeploy = async () => {
    if (!activeProject) return;

    const { theme, variation } = getCommandContext();
    const editorialPillar = activeProject?.playlists?.tactical_journey?.[0]?.label || 'T1';

    // Collect narrative asset UUIDs â€” filter out mock/non-UUID IDs
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    const assetLogIds = [
      pendingData?.selected_structure,
      approvedBriefing?.assetLog?.hook,
      approvedBriefing?.assetLog?.ctaMid,
      approvedBriefing?.assetLog?.ctaFinal,
      approvedBriefing?.assetLog?.titleStructure,
      approvedBriefing?.selectedNarrativeCurve?.id,
      approvedBriefing?.selectedArgumentMode?.id,
      ...(approvedBriefing?.selectedRepetitionRules?.map((rule: any) => rule.id) || []),
    ].filter(Boolean);
    const narrativeAssetIds = assetLogIds.filter((id: string) => uuidRegex.test(id));

    // Estimate prompt tokens based on current script blocks content
    const promptTokens = Math.round(
      scriptBlocks.reduce((acc, b) => acc + (b.content?.length || 0), 0) / 4
    );

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';

    // â”€â”€ Composition Log DNA (ImutÃ¡vel) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const compositionLogPayload = {
      llm_model_id: `${engine}:${model}`,
      narrative_asset_ids: narrativeAssetIds,
      selected_variation: approvedBriefing?.openingHook?.id || 'ASSEMBLER',
      title_structure_asset_id: pendingData?.selected_structure || approvedBriefing?.assetLog?.titleStructure || null,
      prompt_tokens: promptTokens,
      editorial_pillar: editorialPillar,
      theme_title: theme,
      puc_snapshot: activeProject?.puc || '',
      outcome_status: 'pending' as const,
      thumbnail_url: thumbnailUrl || null,
    };

    const localCompositionSnapshot = {
      ...compositionLogPayload,
      selectedHookId: approvedBriefing?.assetLog?.hook || null,
      selectedCtaId: approvedBriefing?.assetLog?.ctaFinal || null,
      selectedTitleStructureId: pendingData?.selected_structure || approvedBriefing?.assetLog?.titleStructure || null,
      selectedCurveId: approvedBriefing?.selectedNarrativeCurve?.id || approvedBriefing?.assetLog?.narrativeCurve || null,
      selectedArgumentModeId: approvedBriefing?.selectedArgumentMode?.id || approvedBriefing?.assetLog?.argumentMode || null,
      selectedRepetitionRuleIds: (approvedBriefing?.selectedRepetitionRules as Array<{ id?: string }> | undefined)?.map((rule) => rule.id).filter(Boolean) || [],
      blockCount: approvedBriefing?.blockCount || approvedBriefing?.blocks?.length || scriptBlocks.filter((block) => block.type === 'Development').length || null,
      durationMinutes: Number((approvedBriefing?.estimatedDuration || '').match(/\d+/)?.[0] || 0) || null,
      voicePattern: approvedBriefing?.blocks?.map((block: any) => block.voiceStyle).join('>') || null,
      executionMode,
    };

    try {
      // Write immutable DNA log to Supabase (auto-injects project_id)
      const { error: logError } = await immutableInsert('composition_log', compositionLogPayload);
      if (logError) console.warn('[Composition Log] Supabase unavailable, saving locally:', logError.message);

      // Always save locally as backup
      const existingBI = JSON.parse(localStorage.getItem(`bi_${activeProject.id}`) || '[]');
      existingBI.push({
        ...localCompositionSnapshot,
        project_id: activeProject.id,
        created_at: new Date().toISOString(),
      });
      localStorage.setItem(`bi_${activeProject.id}`, JSON.stringify(existingBI));

      alert(`âœ… DNA Registrado!\n\nMotor: ${compositionLogPayload.llm_model_id}\nEstrutura: ${variation}\nTokens: ~${promptTokens}\nAssets: ${narrativeAssetIds.length} vinculados\n\nMÃ©tricas de performance podem ser inseridas manualmente no painel de Analytics.`);
    } catch (err) {
      console.error('[handleDeploy]', err);
    }
  };

  // â”€â”€â”€ Assembler Approval Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleAssemblerApprove = (briefing: any, theme: string) => {
    setApprovedTheme(theme);
    setApprovedBriefing(briefing);
    const newBlocks = buildScriptBlocksFromBriefing(briefing, theme);

    void saveManualThemeToBank(theme, briefing, {
      approvedTheme: theme,
      approvedBriefing: briefing,
      scriptBlocks: newBlocks,
      assemblerActive: false,
      thumbnailDirective: null,
      showThumbnailPanel: false,
      thumbnailUrl: '',
      executionMode,
      externalScriptText: '',
      externalScriptFileName: '',
      externalSourceLabel: '',
    });

    setScriptBlocks(newBlocks);
    setAssemblerActive(false);
    setExternalScriptText('');
    setExternalScriptFileName('');
    setExternalSourceLabel('');
  };

  const hookTemplates      = components.filter(c => c.type === 'Hook');
  const ctaTemplates       = components.filter(c => c.type === 'CTA');
  const communityTemplates = components.filter(c => c.type === 'Community');
  const titleStructureTemplates = components.filter(c => c.type === 'Title Structure');
  const uniqueHookTemplates = dedupeNarrativeComponents(hookTemplates);
  const uniqueCtaTemplates = dedupeNarrativeComponents(ctaTemplates);
  const uniqueCommunityTemplates = dedupeNarrativeComponents(communityTemplates);
  const uniqueTitleStructureTemplates = dedupeNarrativeComponents(titleStructureTemplates);
  const sampleNarrativeAssets = [
    uniqueHookTemplates[0],
    uniqueCtaTemplates[0],
    uniqueCommunityTemplates[0],
    uniqueTitleStructureTemplates[0],
  ].filter(Boolean);

  // â”€â”€â”€ ASSEMBLER MODE â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (assemblerActive && !pendingData) {
    const MobileTabs = (
      <div className="flex lg:hidden mb-4 bg-white/5 rounded-xl p-1 border border-white/10">
        {[{ id: 'context', label: 'Contexto' }, { id: 'main', label: 'Assembler' }].map(tab => (
          <button
            key={tab.id}
            onClick={() => setMobileTab(tab.id as any)}
            className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
              mobileTab === tab.id ? 'bg-sage text-midnight' : 'text-white/40 hover:text-white'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    );

    return (
      <div className="flex flex-col h-[calc(100vh-160px)] overflow-hidden w-full">
        {MobileTabs}
        <div className="flex flex-col lg:flex-row gap-6 flex-1 overflow-hidden">
          {/* Left Panel: Context â€” hidden on mobile when main tab active */}
          <section className={`w-full lg:w-1/3 flex-col gap-6 overflow-y-auto pr-2 pb-6 ${mobileTab === 'context' ? 'flex' : 'hidden lg:flex'}`}>
          <div className="glass-card p-6 flex flex-col gap-4 border-sage/20 bg-sage/[0.02]">
            <label className="text-[10px] uppercase tracking-widest font-black text-sage">Instância Ativa</label>
            <div className="flex items-center justify-between p-4 bg-midnight/40 border border-white/10 rounded-2xl">
              <div className="flex flex-col gap-1">
                <span className="font-black text-sm text-white">{selectedProject}</span>
                <span className="text-[9px] text-sage font-black uppercase tracking-widest">V4 Kernel Operational</span>
              </div>
              <div className="p-2 bg-sage/10 rounded-full"><Sparkles size={14} className="text-sage" /></div>
            </div>
          </div>

          <div className="glass-card p-6 flex flex-col gap-4 border-white/5 bg-white/[0.02]">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-black uppercase tracking-[3px] text-white/30">DNA do projeto</p>
              <span className="text-[9px] font-black uppercase tracking-widest text-sage">Fonte ativa</span>
            </div>
            <div className="space-y-3">
              <div className="p-3 rounded-xl bg-midnight/40 border border-white/5">
                <span className="text-[8px] uppercase font-black tracking-[3px] text-white/25 block mb-1">PUC</span>
                <p className="text-[11px] text-white/80 leading-relaxed">{projectNarrativeSummary.puC}</p>
              </div>
              <div className="grid grid-cols-1 gap-3">
                <div className="p-3 rounded-xl bg-midnight/40 border border-white/5">
                  <span className="text-[8px] uppercase font-black tracking-[3px] text-white/25 block mb-1">Persona</span>
                  <p className="text-[11px] text-white/70 leading-relaxed">{projectNarrativeSummary.persona}</p>
                </div>
                <div className="p-3 rounded-xl bg-midnight/40 border border-white/5">
                  <span className="text-[8px] uppercase font-black tracking-[3px] text-white/25 block mb-1">Dor central</span>
                  <p className="text-[11px] text-white/70 leading-relaxed">{projectNarrativeSummary.pain}</p>
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                <div className="p-3 rounded-xl bg-midnight/40 border border-white/5 text-center">
                  <span className="block text-[8px] uppercase font-black tracking-[3px] text-white/25">Corte</span>
                  <span className="text-[11px] font-black text-white">{projectNarrativeSummary.cutRhythm}</span>
                </div>
                <div className="p-3 rounded-xl bg-midnight/40 border border-white/5 text-center">
                  <span className="block text-[8px] uppercase font-black tracking-[3px] text-white/25">Zoom</span>
                  <span className="text-[11px] font-black text-white">{projectNarrativeSummary.zoomStyle}</span>
                </div>
                <div className="p-3 rounded-xl bg-midnight/40 border border-white/5 text-center">
                  <span className="block text-[8px] uppercase font-black tracking-[3px] text-white/25">Trilha</span>
                  <span className="text-[11px] font-black text-white">{projectNarrativeSummary.soundtrack}</span>
                </div>
              </div>
              <div className="p-3 rounded-xl bg-midnight/40 border border-white/5">
                <span className="text-[8px] uppercase font-black tracking-[3px] text-white/25 block mb-2">Pilares da jornada</span>
                <div className="flex flex-wrap gap-2">
                  {projectNarrativeSummary.pillars.length > 0 ? (
                    projectNarrativeSummary.pillars.map((pillar: any, idx: number) => (
                      <span key={pillar.id || pillar.label || pillar.title || idx} className="px-2 py-1 rounded-full bg-white/5 border border-white/10 text-[9px] font-black uppercase tracking-widest text-white/60">
                        {pillar.label || pillar.title || pillar.name}
                      </span>
                    ))
                  ) : (
                    <span className="text-[10px] text-white/30">Nenhum pilar cadastrado</span>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Library Status Card */}
          <div className="glass-card p-6 space-y-4">
            <p className="text-[9px] font-black uppercase tracking-[3px] text-white/30">Biblioteca de Assets</p>
            <div className="space-y-2">
              {[ 
                { label: 'Hooks',      count: uniqueHookTemplates.length,      detail: 'openers disponíveis', color: 'text-sage' },
                { label: 'CTAs',       count: uniqueCtaTemplates.length,       detail: 'chamadas disponÃ­veis', color: 'text-blue-400' },
                { label: 'Comunidade', count: uniqueCommunityTemplates.length, detail: 'elementos ativos',      color: 'text-purple-400' },
                { label: 'Estruturas', count: uniqueTitleStructureTemplates.length, detail: 'títulos rastreáveis', color: 'text-purple-400' },
                { label: 'Pilares',    count: (activeProject?.playlists?.tactical_journey || []).length, detail: 'na jornada tática', color: 'text-orange-400' },
              ].map(({ label, count, detail, color }) => (
                <div key={label} className="flex items-center justify-between py-2 border-b border-white/5 last:border-0">
                  <span className={`text-[10px] font-black uppercase tracking-widest ${color}`}>{label}</span>
                  <div className="text-right">
                    <span className="text-sm font-black text-white">{componentsHydrated ? count : '...'}</span>
                    <span className="text-[9px] text-white/30 ml-2 font-black uppercase">
                      {componentsHydrated ? detail : 'carregando'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="pt-2 border-t border-white/5 space-y-2">
            <p className="text-[8px] font-black uppercase tracking-[3px] text-white/25">Amostra dos ativos</p>
            {(componentsHydrated && sampleNarrativeAssets.length > 0) ? (
                <div className="space-y-2">
                  {sampleNarrativeAssets.map((asset: any) => (
                    <div key={asset.id} className="p-2 rounded-lg bg-midnight/30 border border-white/5">
                      <p className="text-[10px] font-black text-white">{asset.name}</p>
                      <p className="text-[9px] text-white/30 leading-relaxed">{asset.description || asset.content_pattern}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-[10px] text-white/30 leading-relaxed">Sem ativos cadastrados ainda. A biblioteca narrativa alimenta esta área.</p>
            )}
          </div>

          <div className="glass-card p-6 border-blue-500/20 bg-blue-500/[0.02] space-y-3">
            <p className="text-[9px] font-black uppercase tracking-[3px] text-blue-400">PUC do Projeto</p>
            <p className="text-[11px] text-white/70 italic leading-relaxed">
              "{activeProject?.puc || 'DNA não definido. Configure o projeto.'}"
            </p>
          </div>
          </section>

          {/* Right Panel: Assembler â€” hidden on mobile when context tab active */}
          <section className={`flex-1 min-w-0 overflow-y-auto overflow-x-hidden pb-6 ${mobileTab === 'main' ? 'flex flex-col' : 'hidden lg:flex lg:flex-col'}`}>
          <ProductionAssembler
            components={components}
            componentsHydrated={componentsHydrated}
            onApprove={handleAssemblerApprove}
          />
          </section>
        </div>
      </div>
    );
  }

  const ScriptMobileTabs = (
    <div className="flex lg:hidden mb-4 bg-white/5 rounded-xl p-1 border border-white/10">
      {[{ id: 'context', label: 'Contexto' }, { id: 'main', label: 'Roteiro' }].map(tab => (
        <button
          key={tab.id}
          onClick={() => setMobileTab(tab.id as any)}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
            mobileTab === tab.id ? 'bg-sage text-midnight' : 'text-white/40 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-160px)]">
      {ScriptMobileTabs}
      <div className="flex flex-col lg:flex-row gap-6 flex-1 min-h-0 animate-in">
        {/* Left: Building Blocks â€” hidden on mobile when main tab active */}
        <section className={`w-full lg:w-[300px] xl:w-[340px] lg:shrink-0 flex-col gap-6 overflow-y-auto pr-2 pb-6 custom-scrollbar ${mobileTab === 'context' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="glass-card p-6 flex flex-col gap-4 border-sage/20 bg-sage/[0.02] shadow-xl">
          <label className="text-[10px] uppercase tracking-widest font-black text-sage">Instância Content OS</label>
          <div className="flex items-center justify-between p-4 bg-midnight/40 border border-white/10 rounded-2xl ring-1 ring-white/5">
            <div className="flex flex-col gap-1">
              <span className="font-black text-sm text-white">{selectedProject}</span>
              <span className="text-[9px] text-sage font-black uppercase tracking-widest">V4 Kernel Operational</span>
            </div>
            <div className="p-2 bg-sage/10 rounded-full">
              <Sparkles size={14} className="text-sage" />
            </div>
          </div>
        </div>

        {/* Modular Pieces */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between px-2">
            <h3 className="text-xs font-black uppercase tracking-widest text-white/40">Blueprint Modular</h3>
            <Settings size={14} className="text-white/20" />
          </div>

          {/* SOP Visualizer */}
          <div className="glass-card p-6 border-blue-500/30 bg-blue-500/10 shadow-lg shadow-blue-500/5">
            <div className="flex items-center gap-3 mb-4">
              <Zap className="text-blue-400" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Diretrizes SOP</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-3 bg-midnight/40 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] text-white/40 uppercase font-black block mb-1">Corte</span>
                <span className="text-sm font-black text-white">{activeProject?.editing_sop?.cut_rhythm || '3s'}</span>
              </div>
              <div className="p-3 bg-midnight/40 rounded-xl border border-white/10 text-center">
                <span className="text-[9px] text-white/40 uppercase font-black block mb-1">Zoom</span>
                <span className="text-sm font-black text-white">{activeProject?.editing_sop?.zoom_style || 'Dynamic'}</span>
              </div>
            </div>
          </div>

          {/* Hooks Selection */}
          <div className="glass-card p-6 flex flex-col gap-3">
            <div className="flex items-center gap-3 mb-3">
              <Sparkles className="text-sage" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Openers Estratégicos</span>
            </div>
            <div className="flex flex-col gap-2">
              {uniqueHookTemplates.map(h => (
                <button 
                  key={h.id} 
                  onClick={() => setSelectedHookId(h.id)}
                  className={`w-full p-4 rounded-xl text-left transition-all flex items-center justify-between group border ${
                    selectedHookId === h.id 
                    ? 'bg-sage/10 border-sage/40 ring-1 ring-sage/20' 
                    : 'bg-white/5 hover:bg-white/10 border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="flex flex-col gap-1">
                    <span className={`font-black text-xs ${selectedHookId === h.id ? 'text-sage' : 'text-white/80 group-hover:text-white'}`}>{h.name}</span>
                    <span className="text-[9px] uppercase font-bold text-white/30 group-hover:text-white/50">{h.description}</span>
                  </div>
                  {selectedHookId === h.id ? <Zap size={14} className="text-sage" /> : <ChevronDown size={14} className="text-white/20 group-hover:text-white/40 transition-transform" /> }
                </button>
              ))}
            </div>
          </div>

          {/* D.I.O Journey */}
          <div className="glass-card p-6 flex flex-col gap-3 border-orange-400/30 bg-orange-400/5">
            <div className="flex items-center gap-3 mb-3">
              <Layout className="text-orange-400" size={18} />
              <span className="text-xs font-black uppercase tracking-widest text-white">Jornada Tática</span>
            </div>
            <div className="flex flex-col gap-2">
              {(activeProject?.playlists?.tactical_journey || []).map((m: any) => (
                <div key={m.id} className="p-3 bg-midnight/40 rounded-xl border border-white/10 flex items-center justify-between group/item">
                  <span className="text-[10px] font-black text-white/70">{m.label}: <span className="text-white/40">{m.title}</span></span>
                  <Plus size={12} className="text-white/20 cursor-pointer hover:text-orange-400 transition-all hover:scale-125" />
                </div>
              ))}
            </div>
          </div>
        </div>
        </section>

        {/* Right: Script Workspace â€” hidden on mobile when context tab active */}
        <section className={`flex-1 min-w-0 min-h-0 glass-card flex-col shadow-2xl border-white/10 ring-1 ring-white/5 ${mobileTab === 'main' ? 'flex' : 'hidden lg:flex'}`}>
        <div className="p-6 xl:p-8 border-b border-white/5 flex flex-col gap-6 xl:flex-row xl:justify-between xl:items-start bg-midnight/40 backdrop-blur-md">
          <div className="max-w-3xl">
            <h3 className="font-bold flex items-center gap-3 text-lg">
              <Database className="text-sage" size={20} /> Production Assembler
            </h3>
            <p className="text-[11px] text-white/60 mt-1 font-bold leading-relaxed max-w-2xl break-words">
              Validado pela PUC: <span className="font-black text-sage drop-shadow-[0_0_8px_rgba(155,176,165,0.4)]">"{activeProject?.puc || 'DNA não definido'}"</span>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full xl:w-[640px]">
            <button
              onClick={restoreExecutionState}
              className="px-4 py-3 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-white/10"
              title="Recarregar a última execução salva desta instância"
            >
              <RotateCcw size={14} /> RETOMAR EXECUÇÃO
            </button>
            <button
              onClick={returnToAssembler}
              className="px-4 py-3 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-white/10"
              title="Voltar para o assembler sem perder o estado salvo"
            >
              <ArrowLeft size={14} /> VOLTAR AO ASSEMBLER
            </button>
            <button
              onClick={clearExecutionState}
              className="px-4 py-3 bg-red-500/10 text-red-300 hover:bg-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-red-500/20"
              title="Limpar a execução atual desta instância e recomeçar"
            >
              <Trash2 size={14} /> LIMPAR EXECUÇÃO
            </button>
            <button 
              onClick={generateThumbnailDirective}
              className="px-6 py-3 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-purple-500/20"
              title="Gerar Diretriz de Thumbnail para ferramenta externa"
            >
              <Layout size={14} /> DIRETRIZ DE THUMB
            </button>
            <button 
              onClick={handleDeploy}
              className="px-6 py-3 bg-sage/10 text-sage hover:bg-sage hover:text-midnight rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-sage/20"
              title="Registrar Log de Composição e Deploy na BI"
            >
              <Save size={14} /> REGISTRAR DNA
            </button>
            <button
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de copiar o prompt externo.');
                const externalPrompt = buildExternalWritingPrompt();
                await navigator.clipboard.writeText(externalPrompt);
                alert('âœ… Prompt externo copiado com blueprint detalhado do roteiro.');
              }}
              className="px-6 py-3 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-blue-500/20"
              title="Copiar prompt completo para usar em plataforma externa"
            >
              <MessageSquare size={14} /> COPIAR PROMPT EXTERNO
            </button>
            <button
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de copiar/gerar versÃ£o.');
                const snapshot = {
                  project_id: activeProject?.id,
                  theme: approvedBriefing.title || approvedTheme,
                  briefing: approvedBriefing,
                  blocks: scriptBlocks,
                  created_at: new Date().toISOString(),
                };
                const key = `ws_assemblies_${activeProject?.id}`;
                const existing = JSON.parse(localStorage.getItem(key) || '[]');
                localStorage.setItem(key, JSON.stringify([snapshot, ...existing]));

                const text = JSON.stringify(snapshot, null, 2);
                await navigator.clipboard.writeText(text);
                alert('âœ… Briefing copiado + versÃ£o salva localmente.');
              }}
              className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10"
              title="Copiar briefing (JSON) e salvar versÃ£o local"
            >
              <Copy size={20} />
            </button>
            <button 
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de gerar o roteiro.');
                setIsGeneratingScript(true);
                try {
                  const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
                  const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
                  const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
                  if (!apiKey) {
                    setIsGeneratingScript(false);
                    return alert('Configure sua chave de API em Ajustes Globais para gerar o roteiro.');
                  }

                  const minutes = Number((approvedBriefing.estimatedDuration || '').match(/\d+/)?.[0] || 0);
                  const targetChars = Number(approvedBriefing.estimatedChars || (minutes ? minutes * 1200 : 0)) || 0;
                  const hookReference = describeNarrativeAssetReference('Hook de referencia', approvedBriefing?.openingHook);
                  const ctaReference = describeNarrativeAssetReference('CTA de referencia', approvedBriefing?.selectedCta);
                  const structureReference = describeNarrativeAssetReference('Estrutura de titulo de referencia', approvedBriefing?.selectedTitleStructure);
                  const curveReference = describeNarrativeAssetReference('Curva narrativa de referencia', approvedBriefing?.selectedNarrativeCurve);
                  const argumentReference = describeNarrativeAssetReference('Modo de argumentacao de referencia', approvedBriefing?.selectedArgumentMode);
                  const repetitionRulesReference = (approvedBriefing?.selectedRepetitionRules || [])
                    .map((rule: any) => `${rule.name}: ${rule.pattern || rule.description || ''}`)
                    .join(' | ');
                  const communityReferenceCatalog = buildCommunityReferenceCatalog(uniqueCommunityTemplates);

                  for (let i = 0; i < scriptBlocks.length; i++) {
                    const block = scriptBlocks[i];
                    const prompt = `VocÃª Ã© um roteirista tÃ©cnico sÃªnior. Gere o TEXTO FINAL do bloco abaixo.

REGRAS:
- Linguagem direta, pragmÃ¡tica.
- Voz coerente com o tipo do bloco.
- Use metÃ¡foras do projeto quando fizer sentido.
- Use hook, CTA, estrutura e elementos de comunidade apenas como referencia funcional e semantica.
- NÃ£o copie literalmente frases, slogans, exemplos ou patterns vindos da biblioteca narrativa.
- Reescreva com linguagem humana, natural e variada, preservando a funÃ§Ã£o estratÃ©gica do asset.
- NÃ£o escreva markdown.

CONTEXTO DO PROJETO:
PUC: ${activeProject?.puc || ''}
Persona: ${activeProject?.persona_matrix?.demographics || ''}
Dor Central: ${activeProject?.persona_matrix?.pain_alignment || ''}
MetÃ¡foras: ${activeProject?.metaphor_library || ''}
Elementos de Comunidade: ${(uniqueCommunityTemplates || []).map((c: any) => c.content_pattern || c.name).filter(Boolean).join(' | ')}
Hook de referÃªncia: ${describeNarrativeReference('Hook', approvedBriefing?.openingHook?.pattern)}
CTA de referÃªncia: ${describeNarrativeReference('CTA', approvedBriefing?.selectedCta?.pattern)}
Estrutura de tÃ­tulo de referÃªncia: ${describeNarrativeReference('Estrutura', approvedBriefing?.selectedTitleStructure?.pattern)}

TEMA: ${approvedBriefing.title}
DURAÃ‡ÃƒO ALVO (min): ${minutes || 'N/A'}
CHARS ALVO (aprox): ${targetChars || 'N/A'}

BLOCO:
Tipo: ${block.type}
TÃ­tulo: ${block.title}
InstruÃ§Ãµes atuais: ${block.content}
SOP: ${block.sop || ''}

RETORNE APENAS O TEXTO FINAL DO BLOCO.`;

                    const promptForGeneration = `VocÃƒÂª ÃƒÂ© um roteirista tÃƒÂ©cnico sÃƒÂªnior. Gere o TEXTO FINAL do bloco abaixo.

REGRAS:
- Linguagem direta, pragmÃƒÂ¡tica.
- Voz coerente com o tipo do bloco.
- Use metÃƒÂ¡foras do projeto quando fizer sentido.
- Use hook, CTA, estrutura e elementos de comunidade apenas como referencia funcional e semantica.
- NÃƒÂ£o copie literalmente frases, slogans, exemplos, quotes, patterns ou sequencias de palavras vindas da biblioteca narrativa.
- Reescreva com linguagem humana, natural e variada, preservando a funÃƒÂ§ÃƒÂ£o estratÃƒÂ©gica do asset.
- Quando receber referencias narrativas, extraia apenas a intencao, o papel do bloco e o efeito desejado.
- Evite bordÃƒÂµes e formulacoes reconheciveis entre videos do mesmo projeto.
- NÃƒÂ£o escreva markdown.

CONTEXTO DO PROJETO:
PUC: ${activeProject?.puc || ''}
Persona: ${activeProject?.persona_matrix?.demographics || ''}
Dor Central: ${activeProject?.persona_matrix?.pain_alignment || ''}
MetÃƒÂ¡foras: ${activeProject?.metaphor_library || ''}
Elementos de Comunidade de referencia: ${communityReferenceCatalog || 'Nao ha elementos comunitarios cadastrados.'}
${hookReference}
${ctaReference}
${structureReference}
${curveReference}
${argumentReference}
Regras de repeticao ativas: ${repetitionRulesReference || 'Nenhuma'}

TEMA: ${approvedBriefing.title}
DURAÃƒâ€¡ÃƒÆ’O ALVO (min): ${minutes || 'N/A'}
CHARS ALVO (aprox): ${targetChars || 'N/A'}

BLOCO:
Tipo: ${block.type}
TÃƒÂ­tulo: ${block.title}
InstruÃƒÂ§ÃƒÂµes atuais: ${block.content}
SOP: ${block.sop || ''}

RETORNE APENAS O TEXTO FINAL DO BLOCO.`;

                    const res = await fetch('/api/ai/generate', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        engine,
                        model,
                        prompt: promptForGeneration,
                        apiKeyOverwrite: apiKey,
                        projectConfig: activeProject?.ai_engine_rules,
                        responseType: 'text'
                      })
                    });

                    if (!res.ok) {
                      const errBody = await res.text();
                      throw new Error(`Falha IA (${res.status}): ${errBody}`);
                    }

                    const data = await res.json();
                    let text = '';
                    if (engine === 'gemini') {
                      text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
                    } else {
                      text = data.choices?.[0]?.message?.content || '';
                    }

                    const nextBlocks = [...scriptBlocks];
                    nextBlocks[i] = { ...nextBlocks[i], content: (text || nextBlocks[i].content).trim() };
                    setScriptBlocks(nextBlocks);
                  }

                  alert('âœ… Roteiro IA gerado nos blocos.');
                } catch (e: any) {
                  alert(`Erro ao gerar roteiro: ${e.message || e}`);
                } finally {
                  setIsGeneratingScript(false);
                }
              }}
              disabled={isGeneratingScript || executionMode === 'external'}
              className="px-8 py-3 bg-sage text-midnight rounded-xl font-black text-[10px] uppercase tracking-[2px] shadow-lg shadow-sage/20 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
              title={executionMode === 'external' ? 'Mude para producao no aplicativo se quiser gerar os blocos por IA aqui.' : 'Gerar texto final para cada bloco via IA'}
            >
              {isGeneratingScript ? 'GERANDO...' : executionMode === 'external' ? 'MODO EXTERNO ATIVO' : 'GERAR ROTEIRO IA'} <Play size={14} fill="currentColor" />
            </button>
          </div>
        </div>

        <div className="mx-6 xl:mx-8 mt-4 p-5 xl:p-6 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-sage">Modo de Producao</span>
              <p className="text-[11px] text-white/45 mt-1 leading-relaxed">
                O orquestrador continua montando o blueprint. Aqui voce decide se o texto final sera produzido no app ou em plataforma externa.
              </p>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 xl:w-[420px]">
              {[
                { value: 'internal', title: 'Produzir no aplicativo', description: 'Gera o texto final por IA dentro do app.' },
                { value: 'external', title: 'Produzir externamente', description: 'Copia o prompt e recebe o roteiro final por texto ou .txt.' },
              ].map((option) => {
                const isActive = executionMode === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setExecutionMode(option.value as ExecutionMode)}
                    className={`rounded-2xl border px-4 py-4 text-left transition-all ${
                      isActive
                        ? 'bg-sage/10 border-sage/40 shadow-lg shadow-sage/10'
                        : 'bg-white/5 border-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className={`block text-[10px] font-black uppercase tracking-[2px] ${isActive ? 'text-sage' : 'text-white/80'}`}>
                      {option.title}
                    </span>
                    <span className="block mt-2 text-[10px] text-white/40 leading-relaxed">
                      {option.description}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {executionMode === 'external' && (
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1.2fr)_320px]">
              <div className="space-y-3">
                <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Roteiro externo recebido</label>
                <textarea
                  value={externalScriptText}
                  onChange={(e) => setExternalScriptText(e.target.value)}
                  placeholder="Cole aqui o roteiro final gerado fora do aplicativo. Se ele vier separado em BLOCO 1, BLOCO 2, etc., o app aplica automaticamente nos blocos atuais."
                  className="w-full min-h-[220px] bg-midnight/40 border border-white/10 rounded-2xl px-4 py-4 text-[12px] text-white/85 leading-relaxed outline-none focus:border-blue-400/40 resize-y placeholder:text-white/15"
                />
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Plataforma externa</label>
                  <input
                    value={externalSourceLabel}
                    onChange={(e) => setExternalSourceLabel(e.target.value)}
                    placeholder="Ex: ChatGPT, Claude, Gemini..."
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-blue-400/40 placeholder:text-white/20"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Subir .txt</label>
                  <label className="flex items-center justify-center w-full px-4 py-3 rounded-xl border border-dashed border-white/15 bg-white/[0.03] text-[10px] font-black uppercase tracking-[2px] text-white/70 hover:border-blue-400/30 hover:text-white transition-all cursor-pointer">
                    Enviar roteiro .txt
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      className="hidden"
                      onChange={handleExternalScriptUpload}
                    />
                  </label>
                  <p className="text-[10px] text-white/35 leading-relaxed">
                    {externalScriptFileName ? `Arquivo carregado: ${externalScriptFileName}` : 'Nenhum arquivo enviado ainda.'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void applyExternalScriptToBlocks(externalScriptText, externalScriptFileName)}
                  disabled={!externalScriptText.trim()}
                  className="w-full px-5 py-3 rounded-xl bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 border border-blue-500/20 font-black text-[10px] uppercase tracking-[2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Aplicar roteiro externo aos blocos
                </button>
                <button
                  type="button"
                  onClick={() => void syncApprovedThemeSnapshot()}
                  disabled={!approvedBriefing}
                  className="w-full px-5 py-3 rounded-xl bg-white/5 text-white/70 hover:bg-white/10 border border-white/10 font-black text-[10px] uppercase tracking-[2px] transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  Atualizar snapshot do tema
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Thumbnail Directive Panel */}
        {showThumbnailPanel && thumbnailDirective && (
          <div className="mx-6 xl:mx-8 my-4 p-5 xl:p-6 bg-purple-500/5 border border-purple-500/20 rounded-2xl space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-purple-400">ðŸŽ¨ Diretriz de Thumbnail</span>
              <button onClick={() => setShowThumbnailPanel(false)} className="text-white/20 hover:text-white text-sm">âœ•</button>
            </div>
            <div className="space-y-3">
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1">â€” CONCEITO VISUAL</span>
                <p className="text-[11px] text-white/70 leading-relaxed bg-midnight/40 p-3 rounded-xl border border-white/5 whitespace-pre-wrap break-words">{thumbnailDirective.description}</p>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1">â€” PROMPT PARA MIDJOURNEY / DALL-E</span>
                <div className="relative">
                  <p className="text-[11px] text-white/80 leading-relaxed bg-midnight/40 p-3 rounded-xl border border-white/5 font-mono pr-10 whitespace-pre-wrap break-words">{thumbnailDirective.prompt}</p>
                  <button 
                    onClick={() => navigator.clipboard.writeText(thumbnailDirective.prompt)}
                    className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/20 rounded-lg text-white/30 hover:text-white transition-all"
                  ><Copy size={12} /></button>
                </div>
              </div>
              <div>
                <span className="text-[9px] font-black uppercase tracking-widest text-white/30 block mb-1">â€” LINK DA THUMBNAIL GERADA</span>
                <input
                  value={thumbnailUrl}
                  onChange={e => setThumbnailUrl(e.target.value)}
                  placeholder="Cole aqui a URL da imagem gerada externamente..."
                  className="w-full bg-midnight/40 border border-white/10 rounded-xl px-4 py-2 text-[11px] text-white placeholder-white/20 outline-none focus:border-purple-500/40 font-bold"
                />
              </div>
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto overflow-x-hidden p-6 xl:p-8 flex flex-col gap-8 custom-scrollbar bg-gradient-to-b from-transparent to-midnight/20">
          {scriptBlocks.map((block, index) => (
            <div key={block.id} className="relative group animate-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="flex items-center gap-3 mb-3 pl-1">
                <div className="text-[11px] font-black text-white/20 tracking-[3px] uppercase">
                  STG_{String(index + 1).padStart(2, '0')}
                </div>
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              <div className="flex flex-col gap-6 bg-white/[0.01] border border-white/[0.05] rounded-[32px] p-6 xl:p-8 hover:border-white/10 hover:bg-white/[0.03] transition-all shadow-inner relative group/block">
                
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <span className={`inline-flex w-fit max-w-full flex-wrap text-[10px] font-black uppercase tracking-[3px] px-4 py-2 rounded-full border shadow-sm whitespace-normal break-words ${
                    block.type === 'Hook' ? 'text-sage border-sage/60 bg-sage/10' : 
                    block.type === 'Context' ? 'text-blue-400 border-blue-400/60 bg-blue-400/10' : 
                    block.type === 'Development' ? 'text-orange-400 border-orange-400/60 bg-orange-400/10' :
                    'text-white/60 border-white/20 bg-white/5'
                  }`}>
                    {block.type} {'\u00BB'} {block.title}
                  </span>
                  <div className="opacity-100 xl:opacity-0 group-hover/block:opacity-100 transition-opacity flex gap-2 self-end">
                    <button className="p-2 text-white/20 hover:text-white transition-colors"><Plus size={14} /></button>
                    <button className="p-2 text-white/20 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
                  </div>
                </div>
                
                <div className="grid grid-cols-1 2xl:grid-cols-[minmax(0,1.7fr)_300px] gap-6 xl:gap-8 items-start">
                  <div className="min-w-0">
                    <textarea 
                      ref={(el) => {
                        if (!el) return;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      className="w-full bg-midnight/20 border border-white/5 rounded-2xl px-5 py-4 text-white/90 leading-8 outline-none transition-all resize-none overflow-hidden min-h-[120px] text-[15px] font-medium placeholder:text-white/10"
                      value={block.content}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].content = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                    />
                  </div>
                  <div className="bg-midnight/40 rounded-3xl p-5 xl:p-6 border border-white/5 flex flex-col gap-4 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-[2px] text-sage">
                      <PenTool size={14} className="animate-pulse" /> SOP DE EDIÃ‡ÃƒO
                    </div>
                    <textarea 
                      ref={(el) => {
                        if (!el) return;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      onInput={(e) => {
                        const el = e.currentTarget;
                        el.style.height = '0px';
                        el.style.height = `${el.scrollHeight}px`;
                      }}
                      className="w-full bg-transparent text-[13px] text-white/70 font-medium leading-7 outline-none resize-none overflow-hidden min-h-[96px] italic border-t border-white/5 pt-4 mt-2"
                      value={block.sop}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].sop = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                      placeholder="InstruÃ§Ãµes para o editor..."
                    />
                  </div>
                </div>
              </div>
            </div>
          ))}

          <button className="w-full border-2 border-dashed border-white/5 hover:border-sage/20 rounded-[50px] py-16 flex flex-col items-center gap-3 text-white/10 hover:text-sage transition-all group bg-white/[0.01]">
            <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
            <div className="text-center">
              <span className="text-[11px] uppercase font-black tracking-[0.4em]">Injetar Bloco Modular</span>
              <p className="text-[9px] opacity-40 mt-1 uppercase tracking-widest font-bold">DNA Content OS Kernel</p>
            </div>
          </button>
        </div>
        </section>
      </div>
    </div>
  );
}

