import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  formatDbError,
  loadChannels,
  loadVideos,
  saveChannel,
  saveVideoStructure,
} from "./api";
import "./styles.css";

const clone = (value) => JSON.parse(JSON.stringify(value));

const DEFAULT_BASE = {
  duracao: {
    media: "20 minutos",
    minimo: "15 min",
    maximo: "25 min",
  },
  variacaoBlocos: {
    minimo: 7,
    maximo: 12,
  },
  personalidadeNarrador:
    "Curioso, prático e construtor. Explica tecnologia desmontando conceitos, conectando teoria com aplicação real e conduzindo o público com clareza técnica sem arrogância.",
  tiposAbertura: [
    {
      nome: "Polêmica",
      descricao: "Confronta uma crença comum ou um erro repetido pelo público.",
      funcao: "Prender pela discordância ou curiosidade.",
      gatilho: "Isso não pode ser verdade.",
      instrucoes: "Aumentar a tensão, mostrar consequência real e prometer a correção.",
    },
    {
      nome: "Promessa",
      descricao: "Mostra o benefício claro que o vídeo entrega.",
      funcao: "Alinhar expectativa e dar motivo para assistir.",
      gatilho: "Ganho claro.",
      instrucoes: "Expandir a promessa, mostrar o que será dominado e listar rapidamente o caminho.",
    },
    {
      nome: "Narrativa 1",
      descricao: "História observacional com o narrador como personagem.",
      funcao: "Criar conexão emocional e curiosidade progressiva.",
      gatilho: "Quero saber o que aconteceu.",
      instrucoes: "Situação inicial, problema crescente, revelação parcial e gancho para aprendizado.",
    },
    {
      nome: "Pergunta",
      descricao: "Pergunta estratégica que ativa autoavaliação no espectador.",
      funcao: "Engajar e criar lacuna mental.",
      gatilho: "Será que eu sei mesmo isso?",
      instrucoes: "Fazer pergunta inicial, aprofundar a dúvida e mostrar que a resposta não é óbvia.",
    },
  ],
  ctas: [
    {
      nome: "Kit ferramentas iniciante",
      descricao: "Remove fricção de compra para quem quer começar na prática.",
      variacoes: [
        "Se você quer sair da teoria e começar a testar isso de verdade, eu montei um kit com as ferramentas básicas.",
        "O maior erro de quem começa é comprar coisa aleatória e perder tempo. Esse kit elimina essa etapa.",
      ],
    },
    {
      nome: "Kit Arduino / Projetos",
      descricao: "Leva o espectador do conceito para um projeto real.",
      variacoes: [
        "Se você quer transformar isso em projeto real, o Arduino é o caminho mais direto.",
        "Aprender eletrônica sem montar nada não adianta. Esse kit é para sair do conceito e construir.",
      ],
    },
    {
      nome: "PDF componentes",
      descricao: "Isca digital para consulta recorrente.",
      variacoes: [
        "Se você quiser ter isso organizado e consultar rápido enquanto estuda, deixei um guia completo na descrição.",
      ],
    },
    {
      nome: "Inscrição / continuidade",
      descricao: "CTA de comunidade e retorno ao canal.",
      variacoes: ["Se você quer evoluir junto com o canal, se inscreve e acompanha os próximos vídeos."],
    },
  ],
  comunidade: [
    {
      tipo: "Bordão",
      nome: "Não é mágica",
      itens: ["Não é mágica. Só ninguém te explicou desse jeito ainda."],
    },
    {
      tipo: "Bordão",
      nome: "Entendido, não decorado",
      itens: ["Vamos tirar isso da categoria decorado e colocar em entendido."],
    },
    {
      tipo: "Personagem",
      nome: "Faisquinha",
      itens: ["Personagem que sugere gambiarra, atalho e erro comum."],
    },
    {
      tipo: "Piada",
      nome: "Zé-faísca",
      itens: ["É isso que você precisa entender para deixar de ser um zé-faísca."],
    },
    {
      tipo: "Apelido",
      nome: "Condutores",
      itens: ["Apelido para o público do canal."],
    },
  ],
};

const emptyChannel = () => ({
  nome: "",
  nicho: "",
  publico: "",
  dores: [],
  desejos: [],
  conexao: "",
  estrutura_base: clone(DEFAULT_BASE),
});

const exampleChannel = () => ({
  nome: "Condutores em Série",
  nicho: "Tecnologia - Eletrônica",
  publico:
    "Homens de 27 a 31 anos, hobbystas de eletrônica/tecnologia, em fase de crescimento profissional e familiar, buscando evoluir tecnicamente com pouco tempo disponível.",
  dores: ["Falta de progresso real", "Excesso de informação", "Medo de não sair do nível intermediário"],
  desejos: ["Domínio técnico prático", "Criar projetos próprios", "Ser reconhecido como alguém que entende"],
  conexao:
    "Linguagem técnica acessível, referências nerd/geek, autoridade sem arrogância e sensação de evolução conjunta.",
  estrutura_base: clone(DEFAULT_BASE),
});

const emptyVideo = () => ({
  titulo: "",
  status: "Ideia",
  duracaoAlvo: "",
  blocosPlanejados: "",
  tema: "",
  thumbnail: "",
  tipoAbertura: "",
  blocos: [
    {
      titulo: "Abertura",
      duracao: "0:45",
      tipoAbertura: "",
      conteudo: "Gancho inicial, promessa ou tensão principal do vídeo.",
      cta: { referencia: "", texto: "" },
      comunidade: { referencia: "", texto: "" },
    },
  ],
});

function normalizeBase(base) {
  const fallback = clone(DEFAULT_BASE);
  if (!base || typeof base !== "object") return fallback;

  return {
    duracao: { ...fallback.duracao, ...(base.duracao || {}) },
    variacaoBlocos: { ...fallback.variacaoBlocos, ...(base.variacaoBlocos || {}) },
    personalidadeNarrador: base.personalidadeNarrador || fallback.personalidadeNarrador,
    tiposAbertura: Array.isArray(base.tiposAbertura) ? base.tiposAbertura : fallback.tiposAbertura,
    ctas: Array.isArray(base.ctas) ? base.ctas : fallback.ctas,
    comunidade: Array.isArray(base.comunidade) ? base.comunidade : fallback.comunidade,
  };
}

function channelToDraft(channel) {
  if (!channel) return emptyChannel();
  return {
    nome: channel.nome || "",
    nicho: channel.nicho || "",
    publico: channel.publico || "",
    dores: Array.isArray(channel.dores) ? channel.dores : [],
    desejos: Array.isArray(channel.desejos) ? channel.desejos : [],
    conexao: channel.conexao || "",
    estrutura_base: normalizeBase(channel.estrutura_base),
  };
}

function linesToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function textToLines(value) {
  return String(value || "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function compactOptions(values) {
  return values.map((value) => String(value || "").trim()).filter(Boolean);
}

function App() {
  const [channels, setChannels] = useState([]);
  const [videos, setVideos] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [channelDraft, setChannelDraft] = useState(emptyChannel);
  const [videoDraft, setVideoDraft] = useState(emptyVideo);
  const [notice, setNotice] = useState({ type: "info", text: "Carregando bancada...", data: null });
  const [busy, setBusy] = useState({ channels: true, videos: false, channel: false, video: false });

  const activeChannel = channels.find((channel) => channel.id === activeId) || null;
  const base = channelDraft.estrutura_base;
  const openingOptions = compactOptions(base.tiposAbertura.map((item) => item.nome));
  const ctaOptions = compactOptions(base.ctas.map((item) => item.nome));
  const communityOptions = compactOptions(base.comunidade.map((item) => `${item.tipo}: ${item.nome}`));

  useEffect(() => {
    refreshChannels();
  }, []);

  async function refreshChannels(preferredId = activeId) {
    setBusy((current) => ({ ...current, channels: true }));

    try {
      const data = await loadChannels();
      const selected = data.find((channel) => channel.id === preferredId) || data[0] || null;
      setChannels(data);
      setActiveId(selected?.id || null);
      setChannelDraft(channelToDraft(selected));
      setNotice({
        type: "success",
        text: selected ? "Canais carregados. Estrutura pronta para edição." : "Nenhum canal salvo ainda.",
        data: null,
      });

      if (selected) {
        await refreshVideos(selected.id);
      } else {
        setVideos([]);
      }
    } catch (error) {
      setNotice({ type: "error", text: `Erro ao carregar canais: ${formatDbError(error)}`, data: error });
    } finally {
      setBusy((current) => ({ ...current, channels: false }));
    }
  }

  async function refreshVideos(channelId = activeId) {
    if (!channelId) {
      setVideos([]);
      return;
    }

    setBusy((current) => ({ ...current, videos: true }));
    try {
      const data = await loadVideos(channelId);
      setVideos(data);
    } catch (error) {
      setNotice({ type: "error", text: `Erro ao carregar vídeos: ${formatDbError(error)}`, data: error });
    } finally {
      setBusy((current) => ({ ...current, videos: false }));
    }
  }

  async function selectChannel(channelId) {
    const selected = channels.find((channel) => channel.id === channelId) || null;
    setActiveId(selected?.id || null);
    setChannelDraft(channelToDraft(selected));
    setVideoDraft(emptyVideo());
    await refreshVideos(selected?.id || null);
  }

  function startNewChannel() {
    setActiveId(null);
    setChannelDraft(emptyChannel());
    setVideoDraft(emptyVideo());
    setVideos([]);
    setNotice({ type: "info", text: "Novo canal iniciado. Salve o DNA do canal antes de criar vídeos.", data: null });
  }

  function applyExample() {
    setChannelDraft(exampleChannel());
    setNotice({ type: "info", text: "Modelo aplicado. Revise o DNA e salve no Supabase.", data: null });
  }

  function updateChannel(field, value) {
    setChannelDraft((draft) => ({ ...draft, [field]: value }));
  }

  function updateBase(path, value) {
    setChannelDraft((draft) => {
      const next = clone(draft);
      const segments = path.split(".");
      let cursor = next.estrutura_base;
      segments.slice(0, -1).forEach((segment) => {
        cursor = cursor[segment];
      });
      cursor[segments.at(-1)] = value;
      return next;
    });
  }

  function updateBaseItem(collection, index, patch) {
    setChannelDraft((draft) => {
      const next = clone(draft);
      next.estrutura_base[collection][index] = {
        ...next.estrutura_base[collection][index],
        ...patch,
      };
      return next;
    });
  }

  function addBaseItem(collection, item) {
    setChannelDraft((draft) => {
      const next = clone(draft);
      next.estrutura_base[collection].push(item);
      return next;
    });
  }

  function removeBaseItem(collection, index) {
    setChannelDraft((draft) => {
      const next = clone(draft);
      next.estrutura_base[collection].splice(index, 1);
      return next;
    });
  }

  async function persistChannel() {
    if (!channelDraft.nome.trim()) {
      setNotice({ type: "error", text: "Informe o nome do canal antes de salvar.", data: null });
      return;
    }

    const payload = {
      nome: channelDraft.nome.trim(),
      nicho: channelDraft.nicho.trim() || null,
      publico: channelDraft.publico.trim() || null,
      dores: channelDraft.dores,
      desejos: channelDraft.desejos,
      conexao: channelDraft.conexao.trim() || null,
      estrutura_base: channelDraft.estrutura_base,
    };

    setBusy((current) => ({ ...current, channel: true }));
    try {
      const saved = await saveChannel(payload, activeId);
      setActiveId(saved.id);
      setNotice({ type: "success", text: "Canal e estrutura base salvos no Supabase.", data: saved });
      await refreshChannels(saved.id);
    } catch (error) {
      setNotice({ type: "error", text: `Erro ao salvar canal: ${formatDbError(error)}`, data: error });
    } finally {
      setBusy((current) => ({ ...current, channel: false }));
    }
  }

  function updateVideo(field, value) {
    setVideoDraft((draft) => ({ ...draft, [field]: value }));
  }

  function updateBlock(index, patch) {
    setVideoDraft((draft) => {
      const next = clone(draft);
      next.blocos[index] = { ...next.blocos[index], ...patch };
      return next;
    });
  }

  function updateBlockNested(index, key, patch) {
    setVideoDraft((draft) => {
      const next = clone(draft);
      next.blocos[index][key] = { ...next.blocos[index][key], ...patch };
      return next;
    });
  }

  function addBlock() {
    setVideoDraft((draft) => ({
      ...draft,
      blocos: [
        ...draft.blocos,
        {
          titulo: "",
          duracao: "",
          tipoAbertura: "",
          conteudo: "",
          cta: { referencia: "", texto: "" },
          comunidade: { referencia: "", texto: "" },
        },
      ],
    }));
  }

  function removeBlock(index) {
    setVideoDraft((draft) => ({
      ...draft,
      blocos: draft.blocos.filter((_, currentIndex) => currentIndex !== index),
    }));
  }

  async function persistVideo() {
    if (!activeId) {
      setNotice({ type: "error", text: "Salve ou selecione um canal antes de criar um vídeo.", data: null });
      return;
    }

    if (!videoDraft.titulo.trim()) {
      setNotice({ type: "error", text: "Informe o título de trabalho do vídeo.", data: null });
      return;
    }

    const blocks = videoDraft.blocos.map((block, index) => ({
      ordem: index + 1,
      titulo: block.titulo.trim(),
      duracao: block.duracao.trim(),
      tipoAbertura: block.tipoAbertura,
      conteudo: block.conteudo.trim(),
      topicos: textToLines(block.conteudo),
      cta: block.cta,
      comunidade: block.comunidade,
    }));

    const video = {
      titulo: videoDraft.titulo.trim(),
      status: videoDraft.status,
      duracaoAlvo: videoDraft.duracaoAlvo.trim(),
      blocosPlanejados: Number(videoDraft.blocosPlanejados) || blocks.length || null,
      tema: videoDraft.tema.trim(),
      thumbnail: videoDraft.thumbnail.trim(),
      tipoAbertura: videoDraft.tipoAbertura,
    };

    const estruturaUnica = {
      canal: {
        id: activeId,
        nome: channelDraft.nome,
        nicho: channelDraft.nicho,
        publico: channelDraft.publico,
        dores: channelDraft.dores,
        desejos: channelDraft.desejos,
        conexao: channelDraft.conexao,
      },
      estruturaBaseSnapshot: channelDraft.estrutura_base,
      video,
      blocos: blocks,
    };

    setBusy((current) => ({ ...current, video: true }));
    try {
      const saved = await saveVideoStructure(activeId, video, blocks, estruturaUnica);
      setNotice({
        type: "success",
        text: `Vídeo salvo no Supabase. Código: ${saved.code}`,
        data: {
          ...saved.video,
          blocos_salvos: saved.blocosSalvos,
          estrutura_unica: estruturaUnica,
        },
      });
      await refreshVideos(activeId);
    } catch (error) {
      setNotice({ type: "error", text: `Erro ao salvar vídeo: ${formatDbError(error)}`, data: error });
    } finally {
      setBusy((current) => ({ ...current, video: false }));
    }
  }

  function showVideoJson(video) {
    setNotice({
      type: "info",
      text: `Estrutura única salva para ${video.codigo_video}`,
      data: video.estrutura_unica,
    });
  }

  return (
    <main className="app">
      <SideRail
        activeId={activeId}
        busy={busy}
        channels={channels}
        videos={videos}
        onApplyExample={applyExample}
        onNewChannel={startNewChannel}
        onRefresh={() => refreshChannels(activeId)}
        onSelectChannel={selectChannel}
        onShowVideo={showVideoJson}
      />

      <section className="desk">
        <Hero channels={channels} videos={videos} activeChannel={activeChannel} />

        <div className="workbench">
          <ChannelEditor
            busy={busy.channel}
            draft={channelDraft}
            base={base}
            onAddBaseItem={addBaseItem}
            onRemoveBaseItem={removeBaseItem}
            onSave={persistChannel}
            onUpdateBase={updateBase}
            onUpdateBaseItem={updateBaseItem}
            onUpdateChannel={updateChannel}
          />

          <VideoEditor
            activeChannel={activeChannel}
            busy={busy.video}
            ctaOptions={ctaOptions}
            communityOptions={communityOptions}
            draft={videoDraft}
            openingOptions={openingOptions}
            onAddBlock={addBlock}
            onRemoveBlock={removeBlock}
            onSave={persistVideo}
            onUpdateBlock={updateBlock}
            onUpdateBlockNested={updateBlockNested}
            onUpdateVideo={updateVideo}
          />
        </div>

        <ConsolePanel notice={notice} />
      </section>
    </main>
  );
}

function SideRail({
  activeId,
  busy,
  channels,
  videos,
  onApplyExample,
  onNewChannel,
  onRefresh,
  onSelectChannel,
  onShowVideo,
}) {
  return (
    <aside className="rail">
      <div className="brand-block">
        <span className="brand-kicker">Bancada OS</span>
        <strong>Planner de Roteiros</strong>
        <small>DNA de canal + arquitetura por vídeo.</small>
      </div>

      <div className="rail-actions">
        <button className="button secondary" type="button" onClick={onNewChannel}>
          Novo canal
        </button>
        <button className="button ghost" type="button" onClick={onApplyExample}>
          Usar modelo
        </button>
        <button className="button ghost" type="button" onClick={onRefresh} disabled={busy.channels}>
          {busy.channels ? "Sincronizando..." : "Recarregar"}
        </button>
      </div>

      <section className="rail-section">
        <div className="rail-heading">
          <span>Canais</span>
          <b>{channels.length}</b>
        </div>
        <div className="channel-stack">
          {channels.length === 0 && <p className="empty">Nenhum canal salvo.</p>}
          {channels.map((channel) => (
            <button
              className={`channel-chip ${activeId === channel.id ? "is-active" : ""}`}
              key={channel.id}
              type="button"
              onClick={() => onSelectChannel(channel.id)}
            >
              <span>{channel.nome}</span>
              <small>{channel.nicho || "Sem nicho"}</small>
            </button>
          ))}
        </div>
      </section>

      <section className="rail-section">
        <div className="rail-heading">
          <span>Vídeos do canal</span>
          <b>{videos.length}</b>
        </div>
        <div className="video-stack">
          {videos.length === 0 && <p className="empty">Salve o primeiro vídeo deste canal.</p>}
          {videos.map((video) => (
            <article className="video-chip" key={video.id}>
              <strong>{video.titulo_trabalho}</strong>
              <span>{video.codigo_video} · {video.status}</span>
              <small>{video.blocos_planejados || 0} blocos</small>
              <button type="button" onClick={() => onShowVideo(video)}>
                Ver JSON
              </button>
            </article>
          ))}
        </div>
      </section>
    </aside>
  );
}

function Hero({ channels, videos, activeChannel }) {
  return (
    <header className="hero">
      <div className="hero-copy">
        <span className="eyebrow">Mesa de arquitetura narrativa</span>
        <h1>Transforme cada canal em um sistema de roteiro.</h1>
        <p>
          Salve a estrutura base como DNA reutilizável e monte vídeos únicos com blocos, CTAs,
          comunidade e snapshot completo do canal.
        </p>
      </div>
      <div className="signal-board">
        <Metric label="canais" value={channels.length} />
        <Metric label="vídeos ativos" value={videos.length} />
        <Metric label="canal atual" value={activeChannel ? "ON" : "OFF"} />
      </div>
    </header>
  );
}

function Metric({ label, value }) {
  return (
    <div className="metric">
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function ChannelEditor({
  busy,
  draft,
  base,
  onAddBaseItem,
  onRemoveBaseItem,
  onSave,
  onUpdateBase,
  onUpdateBaseItem,
  onUpdateChannel,
}) {
  return (
    <section className="module-card">
      <ModuleTitle
        step="01"
        title="DNA do canal"
        description="Guarde público, linguagem e os 6 blocos estruturais que todo vídeo poderá herdar."
      />

      <div className="field-grid two">
        <Field
          label="Nome do canal"
          value={draft.nome}
          onChange={(value) => onUpdateChannel("nome", value)}
          placeholder="Ex: Condutores em Série"
        />
        <Field
          label="Nicho"
          value={draft.nicho}
          onChange={(value) => onUpdateChannel("nicho", value)}
          placeholder="Ex: Tecnologia - Eletrônica"
        />
      </div>

      <div className="field-grid two">
        <TextArea
          label="Público"
          value={draft.publico}
          onChange={(value) => onUpdateChannel("publico", value)}
          placeholder="Quem assiste esse canal?"
        />
        <TextArea
          label="Conexão e linguagem"
          value={draft.conexao}
          onChange={(value) => onUpdateChannel("conexao", value)}
          placeholder="Como o canal se conecta com a audiência?"
        />
      </div>

      <div className="field-grid two">
        <TextArea
          label="Dores do público"
          value={linesToText(draft.dores)}
          onChange={(value) => onUpdateChannel("dores", textToLines(value))}
          placeholder="Uma dor por linha"
          compact
        />
        <TextArea
          label="Desejos do público"
          value={linesToText(draft.desejos)}
          onChange={(value) => onUpdateChannel("desejos", textToLines(value))}
          placeholder="Um desejo por linha"
          compact
        />
      </div>

      <div className="bus-label">Estrutura base reutilizável</div>

      <div className="field-grid four">
        <Field
          label="Duração média"
          value={base.duracao.media}
          onChange={(value) => onUpdateBase("duracao.media", value)}
          placeholder="20 minutos"
        />
        <Field
          label="Mínima"
          value={base.duracao.minimo}
          onChange={(value) => onUpdateBase("duracao.minimo", value)}
          placeholder="15 min"
        />
        <Field
          label="Máxima"
          value={base.duracao.maximo}
          onChange={(value) => onUpdateBase("duracao.maximo", value)}
          placeholder="25 min"
        />
        <div className="split-field">
          <label>Variação de blocos</label>
          <div>
            <input
              min="1"
              type="number"
              value={base.variacaoBlocos.minimo || ""}
              onChange={(event) => onUpdateBase("variacaoBlocos.minimo", Number(event.target.value) || "")}
              placeholder="7"
            />
            <input
              min="1"
              type="number"
              value={base.variacaoBlocos.maximo || ""}
              onChange={(event) => onUpdateBase("variacaoBlocos.maximo", Number(event.target.value) || "")}
              placeholder="12"
            />
          </div>
        </div>
      </div>

      <TextArea
        label="Personalidade do narrador"
        value={base.personalidadeNarrador}
        onChange={(value) => onUpdateBase("personalidadeNarrador", value)}
        placeholder="Descreva a persona principal do narrador."
      />

      <OpeningRepeater
        items={base.tiposAbertura}
        onAdd={() =>
          onAddBaseItem("tiposAbertura", {
            nome: "",
            descricao: "",
            funcao: "",
            gatilho: "",
            instrucoes: "",
          })
        }
        onRemove={(index) => onRemoveBaseItem("tiposAbertura", index)}
        onUpdate={(index, patch) => onUpdateBaseItem("tiposAbertura", index, patch)}
      />

      <CtaRepeater
        items={base.ctas}
        onAdd={() => onAddBaseItem("ctas", { nome: "", descricao: "", variacoes: [] })}
        onRemove={(index) => onRemoveBaseItem("ctas", index)}
        onUpdate={(index, patch) => onUpdateBaseItem("ctas", index, patch)}
      />

      <CommunityRepeater
        items={base.comunidade}
        onAdd={() => onAddBaseItem("comunidade", { tipo: "", nome: "", itens: [] })}
        onRemove={(index) => onRemoveBaseItem("comunidade", index)}
        onUpdate={(index, patch) => onUpdateBaseItem("comunidade", index, patch)}
      />

      <div className="action-row">
        <button className="button primary" type="button" onClick={onSave} disabled={busy}>
          {busy ? "Soldando no banco..." : "Salvar canal e estrutura base"}
        </button>
      </div>
    </section>
  );
}

function VideoEditor({
  activeChannel,
  busy,
  ctaOptions,
  communityOptions,
  draft,
  openingOptions,
  onAddBlock,
  onRemoveBlock,
  onSave,
  onUpdateBlock,
  onUpdateBlockNested,
  onUpdateVideo,
}) {
  return (
    <section className="module-card video-module">
      <ModuleTitle
        step="02"
        title="Roteiro único"
        description="Cada vídeo herda o DNA do canal, mas salva sua própria sequência de blocos."
      />

      {!activeChannel && (
        <div className="inline-alert">Salve ou selecione um canal para liberar a gravação de vídeos.</div>
      )}

      <div className="field-grid two">
        <Field
          label="Título de trabalho"
          value={draft.titulo}
          onChange={(value) => onUpdateVideo("titulo", value)}
          placeholder="Ex: Você realmente entende como o ferro de solda funciona?"
        />
        <Select
          label="Status"
          value={draft.status}
          onChange={(value) => onUpdateVideo("status", value)}
          options={["Ideia", "Em Roteirização", "Para Gravar", "Editando", "Publicado"]}
        />
      </div>

      <div className="field-grid four">
        <Field
          label="Duração alvo"
          value={draft.duracaoAlvo}
          onChange={(value) => onUpdateVideo("duracaoAlvo", value)}
          placeholder="15, 20 ou 25 min"
        />
        <Field
          label="Blocos"
          type="number"
          value={draft.blocosPlanejados}
          onChange={(value) => onUpdateVideo("blocosPlanejados", value)}
          placeholder="10"
        />
        <Select
          label="Tipo de abertura"
          value={draft.tipoAbertura}
          onChange={(value) => onUpdateVideo("tipoAbertura", value)}
          options={openingOptions}
          placeholder="Selecione um tipo"
          wide
        />
      </div>

      <div className="field-grid two">
        <TextArea
          label="Tema"
          value={draft.tema}
          onChange={(value) => onUpdateVideo("tema", value)}
          placeholder="Explique o objetivo, contexto e recorte do vídeo."
          compact
        />
        <TextArea
          label="Thumbnail"
          value={draft.thumbnail}
          onChange={(value) => onUpdateVideo("thumbnail", value)}
          placeholder="Descreva a composição visual da thumbnail."
          compact
        />
      </div>

      <div className="block-board">
        <div className="block-board-head">
          <div>
            <strong>Sequência de blocos</strong>
            <span>{draft.blocos.length} módulos no barramento do vídeo</span>
          </div>
          <button className="button secondary" type="button" onClick={onAddBlock}>
            + Bloco
          </button>
        </div>

        {draft.blocos.map((block, index) => (
          <BlockCard
            block={block}
            ctaOptions={ctaOptions}
            communityOptions={communityOptions}
            index={index}
            key={index}
            openingOptions={openingOptions}
            onRemove={() => onRemoveBlock(index)}
            onUpdate={(patch) => onUpdateBlock(index, patch)}
            onUpdateNested={(key, patch) => onUpdateBlockNested(index, key, patch)}
          />
        ))}
      </div>

      <div className="action-row">
        <button className="button primary" type="button" onClick={onSave} disabled={busy || !activeChannel}>
          {busy ? "Gravando estrutura..." : "Salvar vídeo no Supabase"}
        </button>
      </div>
    </section>
  );
}

function OpeningRepeater({ items, onAdd, onRemove, onUpdate }) {
  return (
    <RepeaterFrame
      title="Tipos de abertura"
      description="Gatilhos reutilizáveis para iniciar vídeos e blocos."
      action="+ Abertura"
      onAdd={onAdd}
    >
      {items.map((item, index) => (
        <article className="repeater-card" key={index}>
          <div className="repeater-top">
            <Field
              label="Nome"
              value={item.nome}
              onChange={(value) => onUpdate(index, { nome: value })}
              placeholder="Polêmica, Promessa..."
            />
            <button className="button danger" type="button" onClick={() => onRemove(index)}>
              Remover
            </button>
          </div>
          <div className="field-grid two">
            <Field label="Função" value={item.funcao} onChange={(value) => onUpdate(index, { funcao: value })} />
            <Field label="Gatilho" value={item.gatilho} onChange={(value) => onUpdate(index, { gatilho: value })} />
          </div>
          <TextArea
            compact
            label="Descrição"
            value={item.descricao}
            onChange={(value) => onUpdate(index, { descricao: value })}
          />
          <TextArea
            compact
            label="Instruções"
            value={item.instrucoes}
            onChange={(value) => onUpdate(index, { instrucoes: value })}
          />
        </article>
      ))}
    </RepeaterFrame>
  );
}

function CtaRepeater({ items, onAdd, onRemove, onUpdate }) {
  return (
    <RepeaterFrame
      title="Tipos de CTA"
      description="Ofertas, iscas, inscrição, comentário e continuidade de jornada."
      action="+ CTA"
      onAdd={onAdd}
    >
      {items.map((item, index) => (
        <article className="repeater-card" key={index}>
          <div className="repeater-top">
            <Field label="Nome" value={item.nome} onChange={(value) => onUpdate(index, { nome: value })} />
            <button className="button danger" type="button" onClick={() => onRemove(index)}>
              Remover
            </button>
          </div>
          <TextArea
            compact
            label="Descrição"
            value={item.descricao}
            onChange={(value) => onUpdate(index, { descricao: value })}
          />
          <TextArea
            compact
            label="Variações"
            value={linesToText(item.variacoes)}
            onChange={(value) => onUpdate(index, { variacoes: textToLines(value) })}
            placeholder="Uma variação por linha"
          />
        </article>
      ))}
    </RepeaterFrame>
  );
}

function CommunityRepeater({ items, onAdd, onRemove, onUpdate }) {
  return (
    <RepeaterFrame
      title="Elementos de comunidade"
      description="Bordões, personagens, apelidos e códigos internos."
      action="+ Elemento"
      onAdd={onAdd}
    >
      {items.map((item, index) => (
        <article className="repeater-card" key={index}>
          <div className="repeater-top">
            <Field
              label="Tipo"
              value={item.tipo}
              onChange={(value) => onUpdate(index, { tipo: value })}
              placeholder="Bordão, personagem..."
            />
            <button className="button danger" type="button" onClick={() => onRemove(index)}>
              Remover
            </button>
          </div>
          <Field
            label="Nome / referência"
            value={item.nome}
            onChange={(value) => onUpdate(index, { nome: value })}
          />
          <TextArea
            compact
            label="Itens"
            value={linesToText(item.itens)}
            onChange={(value) => onUpdate(index, { itens: textToLines(value) })}
            placeholder="Um item por linha"
          />
        </article>
      ))}
    </RepeaterFrame>
  );
}

function BlockCard({
  block,
  ctaOptions,
  communityOptions,
  index,
  openingOptions,
  onRemove,
  onUpdate,
  onUpdateNested,
}) {
  return (
    <article className="block-card">
      <div className="block-index">
        <span>{String(index + 1).padStart(2, "0")}</span>
      </div>
      <div className="block-content">
        <div className="block-head">
          <Field
            label="Título do bloco"
            value={block.titulo}
            onChange={(value) => onUpdate({ titulo: value })}
            placeholder="Abertura, virada, prova..."
          />
          <button className="button danger" type="button" onClick={onRemove}>
            Remover
          </button>
        </div>

        <div className="field-grid two">
          <Field
            label="Duração"
            value={block.duracao}
            onChange={(value) => onUpdate({ duracao: value })}
            placeholder="0:45"
          />
          <Select
            label="Abertura / lógica do bloco"
            value={block.tipoAbertura}
            onChange={(value) => onUpdate({ tipoAbertura: value })}
            options={openingOptions}
            placeholder="Herdar do vídeo"
          />
        </div>

        <TextArea
          label="Conteúdo principal"
          value={block.conteudo}
          onChange={(value) => onUpdate({ conteudo: value })}
          placeholder="Tópicos, raciocínios, exemplos e progressão."
        />

        <div className="field-grid two">
          <Select
            label="CTA de referência"
            value={block.cta.referencia}
            onChange={(value) => onUpdateNested("cta", { referencia: value })}
            options={ctaOptions}
            placeholder="Nenhum CTA"
          />
          <Select
            label="Elemento de comunidade"
            value={block.comunidade.referencia}
            onChange={(value) => onUpdateNested("comunidade", { referencia: value })}
            options={communityOptions}
            placeholder="Nenhum elemento"
          />
        </div>

        <div className="field-grid two">
          <TextArea
            compact
            label="CTA usado no bloco"
            value={block.cta.texto}
            onChange={(value) => onUpdateNested("cta", { texto: value })}
          />
          <TextArea
            compact
            label="Como a comunidade entra"
            value={block.comunidade.texto}
            onChange={(value) => onUpdateNested("comunidade", { texto: value })}
          />
        </div>
      </div>
    </article>
  );
}

function RepeaterFrame({ action, children, description, onAdd, title }) {
  return (
    <section className="repeater-frame">
      <div className="subhead">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <button className="button secondary" type="button" onClick={onAdd}>
          {action}
        </button>
      </div>
      <div className="repeater-grid">{children}</div>
    </section>
  );
}

function ModuleTitle({ description, step, title }) {
  return (
    <div className="module-title">
      <span>{step}</span>
      <div>
        <h2>{title}</h2>
        <p>{description}</p>
      </div>
    </div>
  );
}

function Field({ label, onChange, placeholder = "", type = "text", value }) {
  return (
    <label className="control">
      <span>{label}</span>
      <input
        min={type === "number" ? "1" : undefined}
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
}

function TextArea({ compact = false, label, onChange, placeholder = "", value }) {
  return (
    <label className={`control ${compact ? "is-compact" : ""}`}>
      <span>{label}</span>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />
    </label>
  );
}

function Select({ label, onChange, options, placeholder = "", value, wide = false }) {
  return (
    <label className={`control ${wide ? "wide-control" : ""}`}>
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">{placeholder || "Selecione"}</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </label>
  );
}

function ConsolePanel({ notice }) {
  return (
    <section className={`console-panel ${notice.type}`}>
      <div>
        <span>Console da bancada</span>
        <strong>{notice.text}</strong>
      </div>
      {notice.data && <pre>{JSON.stringify(notice.data, null, 2)}</pre>}
    </section>
  );
}

createRoot(document.getElementById("root")).render(<App />);
