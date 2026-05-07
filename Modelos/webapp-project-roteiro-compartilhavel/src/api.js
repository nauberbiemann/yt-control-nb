const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || "";
const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || "";

const baseHeaders = {
  apikey: SUPABASE_KEY,
  Authorization: `Bearer ${SUPABASE_KEY}`,
  "Content-Type": "application/json",
};

function eq(value) {
  return `eq.${encodeURIComponent(value)}`;
}

async function request(path, options = {}) {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      "Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em um arquivo .env antes de usar o banco de dados."
    );
  }

  const { method = "GET", body = null, prefer = null } = options;
  const headers = { ...baseHeaders };
  if (prefer) headers.Prefer = prefer;

  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method,
    headers,
    body: body === null ? null : JSON.stringify(body),
  });

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(data?.message || text || `Erro HTTP ${response.status}`);
    Object.assign(error, data || {});
    error.status = response.status;
    throw error;
  }

  return data;
}

export function formatDbError(error) {
  if (error?.code === "23505") {
    return "Já existe um registro com esse valor único. Verifique o nome do canal ou tente novamente.";
  }

  if (error?.code === "PGRST202") {
    return "A função do banco ainda não está disponível no cache da API. Recarregue a página e tente novamente.";
  }

  return error?.message || "Erro desconhecido ao comunicar com o Supabase.";
}

export async function loadChannels() {
  return request("roteiro_canais?select=*&order=updated_at.desc");
}

export async function saveChannel(payload, channelId = null) {
  const path = channelId ? `roteiro_canais?id=${eq(channelId)}` : "roteiro_canais";
  const rows = await request(path, {
    method: channelId ? "PATCH" : "POST",
    body: payload,
    prefer: "return=representation",
  });

  const saved = Array.isArray(rows) ? rows[0] : rows;
  if (!saved) throw new Error("O banco não retornou o canal salvo.");
  return saved;
}

export async function loadVideos(channelId) {
  if (!channelId) return [];
  return request(
    `roteiro_videos?select=id,codigo_video,titulo_trabalho,status,duracao_alvo,blocos_planejados,tipo_abertura,tema,estrutura_unica,created_at&canal_id=${eq(channelId)}&order=created_at.desc`
  );
}

export async function saveVideoStructure(channelId, video, blocks, estruturaUnica) {
  const code = `VID-${Date.now().toString(36).toUpperCase()}-${Math.floor(1000 + Math.random() * 9000)}`;

  const result = await request("rpc/salvar_roteiro_video", {
    method: "POST",
    body: {
      p_canal_id: channelId,
      p_codigo_video: code,
      p_titulo_trabalho: video.titulo,
      p_status: video.status,
      p_duracao_alvo: video.duracaoAlvo || null,
      p_blocos_planejados: video.blocosPlanejados,
      p_tema: video.tema || null,
      p_thumbnail: video.thumbnail || null,
      p_tipo_abertura: video.tipoAbertura || null,
      p_estrutura_unica: estruturaUnica,
      p_blocos: blocks,
    },
  });

  return {
    code,
    video: result?.video || {},
    blocosSalvos: result?.blocos_salvos ?? blocks.length,
  };
}
