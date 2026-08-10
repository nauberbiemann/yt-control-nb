export interface ThumbnailRef {
  id: string;
  title: string;
  image_url?: string;
  text_overlay?: string; // Texto curto da thumb (ex: "ELES SABIAM")
  visual_elements?: string; // Elementos focais (ex: "Rosto com expressão de choque + seta vermelha")
  color_palette?: string; // Ex: "Amarelo e Preto no fundo escuro"
  ai_prompt?: string; // Prompt Midjourney/FLUX
  created_at?: string;
}

export interface ViralScriptRef {
  id: string;
  title: string;
  url?: string;
  script_text: string; // Roteiro completo / Transcrição SALVO NO BANCO
  dna_summary?: {
    opening_hook?: string;
    tone?: string;
    tension_peaks?: number;
    vocabulary?: string[];
  };
  word_count?: number;
  created_at?: string;
}

export interface ReferenceChannel {
  id: string;
  name: string; // Ex: "Origin Decoder"
  url?: string; // Ex: "https://youtube.com/@originedecoder"
  niche_angle?: string; // Ex: "Lente do DNA / Ciência Sagrada"
  truth_arbiter?: string; // Ex: "Estudos Científicos e Genética"
  notes?: string;
  viral_scripts: ViralScriptRef[];
  thumbnail_refs: ThumbnailRef[];
  created_at?: string;
}
