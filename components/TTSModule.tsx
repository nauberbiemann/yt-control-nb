"use client";

import React, { useState, useRef, useEffect, useCallback } from "react";
import {
  Mic,
  Library,
  Clock,
  Zap,
  Settings,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Play,
  Pause,
  Download,
  Save,
  RefreshCw,
  Volume2,
  ChevronDown,
  ChevronUp,
  Trash2,
  Copy,
  Activity,
  PlayCircle,
  AlertCircle,
  CheckCircle2
} from "lucide-react";

// ═══════════════════════════════════════════════════
// CONSTANTS & DATA
// ═══════════════════════════════════════════════════

const VOICES = [
  { name: "Achird", gender: "M", tone: "Grave e Sólido", use: "Narração de Documentários" },
  { name: "Charon", gender: "M", tone: "Profundo e Épico", use: "Trailers e Chamadas" },
  { name: "Fenrir", gender: "M", tone: "Áspero e Forte", use: "Personagens de Ação" },
  { name: "Kore", gender: "M", tone: "Jovem e Dinâmico", use: "Anúncios e Vlogs" },
  { name: "Orus", gender: "M", tone: "Formal e Confiável", use: "Corporativo e Suporte" },
  { name: "Puck", gender: "M", tone: "Leve e Humorístico", use: "Animações e Comédia" },
  { name: "Aoede", gender: "F", tone: "Cálida e Empática", use: "Audiolivros e Narração" },
  { name: "Callirrhoe", gender: "F", tone: "Elegante e Premium", use: "Marcas de Luxo" },
  { name: "Despina", gender: "F", tone: "Energética e Rápida", use: "YouTube e TikTok" },
  { name: "Leda", gender: "F", tone: "Suave e Relaxante", use: "Meditação e ASMR" },
  { name: "Schedar", gender: "F", tone: "Autoritária e Clara", use: "Notícias e E-learning" },
  { name: "Sulafat", gender: "F", tone: "Casual e Amigável", use: "Podcasts e Entrevistas" },
];

const ACCENTS = {
  Sudeste: [
    { id: "Neutro Brasileiro", text: "sotaque neutro do Brasil" },
    { id: "Paulistano (SP)", text: "sotaque paulistano de São Paulo, com r retroflexo marcado" },
    { id: "Carioca (RJ)", text: "sotaque carioca do Rio de Janeiro, com s chiado e entonação musical" },
    { id: "Mineiro (MG)", text: "sotaque mineiro de Minas Gerais, arrastado e cadenciado" },
    { id: "Capixaba (ES)", text: "sotaque capixaba do Espírito Santo" }
  ],
  Sul: [
    { id: "Gaúcho (RS)", text: "sotaque gaúcho do Rio Grande do Sul, com r forte e entonação característica" },
    { id: "Catarinense (SC)", text: "sotaque catarinense de Santa Catarina, com influência germânica suavizada" },
    { id: "Paranaense (PR)", text: "sotaque paranaense do Paraná, próximo ao neutro com toques sulistas" }
  ],
  Nordeste: [
    { id: "Nordestino Neutro", text: "sotaque nordestino neutro, com entonação aberta característica" },
    { id: "Baiano (BA)", text: "sotaque baiano da Bahia, cadenciado e com vogais abertas" },
    { id: "Pernambucano (PE)", text: "sotaque pernambucano do Recife, marcado e vibrante" },
    { id: "Cearense (CE)", text: "sotaque cearense do Ceará, com entonação rápida e cantada" },
    { id: "Maranhense (MA)", text: "sotaque maranhense do Maranhão, entonação próxima ao português europeu" },
    { id: "Paraibano (PB)", text: "sotaque paraibano da Paraíba" },
    { id: "Alagoano (AL)", text: "sotaque alagoano de Alagoas" },
    { id: "Potiguar (RN)", text: "sotaque potiguar do Rio Grande do Norte" },
    { id: "Sergipano (SE)", text: "sotaque sergipano de Sergipe" }
  ],
  Norte: [
    { id: "Paraense (PA)", text: "sotaque paraense de Belém do Pará, com entonação amazônica" },
    { id: "Manauara (AM)", text: "sotaque manauara de Manaus, com entonação amazônica característica" },
    { id: "Tocantinense (TO)", text: "sotaque tocantinense, mistura de centro-oeste e norte" }
  ],
  "Centro-Oeste": [
    { id: "Brasiliense (DF)", text: "sotaque brasiliense de Brasília, neutro e formal" },
    { id: "Goiano (GO)", text: "sotaque goiano de Goiânia, caipira suavizado" },
    { id: "Mato-grossense (MT/MS)", text: "sotaque mato-grossense, mistura de caipira e nordestino" }
  ],
  "Interior/Regional": [
    { id: "Caipira (Interior SP/MG)", text: "sotaque caipira do interior de São Paulo e Minas, com r retroflexo muito marcado" },
    { id: "Sertanejo (Sertão NE)", text: "sotaque sertanejo do sertão nordestino, arcaico e forte" }
  ]
};

const STYLES = [
  "Natural", "Conversacional", "Amigável", "Cálido", "Profissional", "Corporativo",
  "Premium", "Inspirador", "Emocional", "Íntimo", "Sério", "Elegante", "Storyteller",
  "Narração Documental", "Narração Cinematográfica", "Anúncio Publicitário",
  "Venda Persuasiva", "Tutorial Claro", "Educativo", "Podcast", "Entrevista",
  "Apresentador", "Rádio Noturna", "ASMR", "Sussurro", "Relaxamento/Meditação",
  "Épico", "Dramático", "Trailer", "Juvenil", "Energético", "Humor Leve",
  "Narrativo Infantil", "Autoridade Especialista", "Suporte ao Cliente", "Marca Premium"
];

const EMOTIONS = [
  { id: "Neutro", icon: "○" }, { id: "Alegria", icon: "😊" }, { id: "Tristeza", icon: "😢" },
  { id: "Calma", icon: "😌" }, { id: "Empatia", icon: "🤝" }, { id: "Entusiasmo", icon: "🔥" },
  { id: "Tensão", icon: "😰" }, { id: "Mistério", icon: "🌑" }, { id: "Ternura", icon: "💛" },
  { id: "Autoridade", icon: "💼" }, { id: "Urgência", icon: "⚡" }, { id: "Serenidade", icon: "🌊" }
];

const TAGS = [
  "[pausa]", "[risada]", "[sussurro]", "[ênfase]", "[respira]", "[silêncio]",
  "[emocionado]", "[lento]", "[rápido]", "[sério]", "[alegre]"
];

const TAG_MAP: Record<string, string> = {
  "[pausa]": ", faça uma pausa breve, ",
  "[risada]": ", dê uma risada leve, ",
  "[sussurro]": ", fale em voz muito baixa, ",
  "[ênfase]": ", enfatize bem a próxima palavra, ",
  "[respira]": ", faça uma respiração audível, ",
  "[silêncio]": ", pause em silêncio por um momento, ",
  "[emocionado]": ", fale com muita emoção, ",
  "[lento]": ", fale mais devagar agora, ",
  "[rápido]": ", fale mais rápido agora, ",
  "[sério]": ", adote um tom sério agora, ",
  "[alegre]": ", fale de forma alegre e animada agora, "
};

const PRESETS = [
  { name: "YouTube Narração", voice: "Despina", accent: "Neutro Brasileiro", styles: ["Natural", "Energético"], emotion: "Entusiasmo" },
  { name: "Audiolivro", voice: "Aoede", accent: "Neutro Brasileiro", styles: ["Storyteller"], emotion: "Empatia" },
  { name: "Anúncio Premium", voice: "Callirrhoe", accent: "Paulistano (SP)", styles: ["Anúncio Publicitário"], emotion: "Entusiasmo" },
  { name: "Podcast Casual", voice: "Sulafat", accent: "Carioca (RJ)", styles: ["Podcast"], emotion: "Alegria" },
  { name: "Meditação Guiada", voice: "Leda", accent: "Neutro Brasileiro", styles: ["Relaxamento/Meditação"], emotion: "Serenidade" },
  { name: "ASMR Íntimo", voice: "Leda", accent: "Neutro Brasileiro", styles: ["ASMR"], emotion: "Calma" },
  { name: "Suporte ao Cliente", voice: "Orus", accent: "Neutro Brasileiro", styles: ["Profissional"], emotion: "Empatia" },
  { name: "Trailer Épico", voice: "Charon", accent: "Neutro Brasileiro", styles: ["Épico"], emotion: "Autoridade" },
  { name: "Narração Doc.", voice: "Kore", accent: "Neutro Brasileiro", styles: ["Narração Documental"], emotion: "Calma" },
  { name: "Marca Premium", voice: "Callirrhoe", accent: "Neutro Brasileiro", styles: ["Premium", "Elegante"], emotion: "Neutro" }
];

const SLIDER_LABELS = {
  velocidade: ["Muito lenta", "Lenta", "Normal", "Rápida", "Muito rápida"],
  tom: ["Grave", "Levemente Grave", "Normal", "Levemente Agudo", "Agudo"],
  expressividade: ["Contida", "Pouco expressiva", "Normal", "Expressiva", "Muito expressiva"],
  intEmocional: ["Suave", "Moderada", "Normal", "Forte", "Intensa"],
  formalidade: ["Informal", "Casual", "Normal", "Formal", "Muito formal"],
  dramatismo: ["Neutro", "Leve", "Normal", "Dramático", "Muito dramático"],
  naturalidade: ["Robótico", "Mecânico", "Normal", "Natural", "Muito natural"],
  energia: ["Baixa", "Média-Baixa", "Normal", "Média-Alta", "Alta"]
};

// ═══════════════════════════════════════════════════
// TYPES & INTERFACES
// ═══════════════════════════════════════════════════

type View = "gerar" | "biblioteca" | "historico" | "presets" | "configuracoes";

interface HistoryItem {
  id: string;
  text: string;
  voice: string;
  accent: string;
  style: string;
  emotion: string;
  date: number;
  duration: number; // in seconds
  url: string;
  blob: Blob;
}

interface ToastMessage {
  id: number;
  message: string;
  type: "success" | "error" | "info";
}

// ═══════════════════════════════════════════════════
// MANDATORY PCM TO WAV FUNCTION
// ═══════════════════════════════════════════════════
function pcmToWav(base64Data: string, mimeType: string): Blob {
  const byteCharacters = atob(base64Data);
  const pcmBytes = new Uint8Array(byteCharacters.length);
  for (let i = 0; i < byteCharacters.length; i++) {
    pcmBytes[i] = byteCharacters.charCodeAt(i);
  }

  const rateMatch = mimeType.match(/rate=(\d+)/);
  const sampleRate = rateMatch ? parseInt(rateMatch[1]) : 24000;
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmBytes.length;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  // RIFF
  view.setUint8(0, 0x52); view.setUint8(1, 0x49);
  view.setUint8(2, 0x46); view.setUint8(3, 0x46);
  view.setUint32(4, 36 + dataSize, true);
  view.setUint8(8, 0x57); view.setUint8(9, 0x41);
  view.setUint8(10, 0x56); view.setUint8(11, 0x45);
  // fmt
  view.setUint8(12, 0x66); view.setUint8(13, 0x6D);
  view.setUint8(14, 0x74); view.setUint8(15, 0x20);
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitsPerSample, true);
  // data
  view.setUint8(36, 0x64); view.setUint8(37, 0x61);
  view.setUint8(38, 0x74); view.setUint8(39, 0x61);
  view.setUint32(40, dataSize, true);

  new Uint8Array(buffer).set(pcmBytes, 44);

  return new Blob([buffer], { type: "audio/wav" });
}

// ═══════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════

export default function TTSApp() {
  // Navigation
  const [currentView, setCurrentView] = useState<View>("gerar");
  const [darkMode, setDarkMode] = useState(true);

  // API State
  const [apiKey, setApiKey] = useState("MY_GEMINI_API_KEY");
  const [showApiKey, setShowApiKey] = useState(false);

  // Form State
  const [text, setText] = useState("");
  const [selectedVoice, setSelectedVoice] = useState("Aoede");
  const [selectedAccent, setSelectedAccent] = useState("Neutro Brasileiro");
  const [customAccent, setCustomAccent] = useState("");
  const [selectedStyles, setSelectedStyles] = useState<string[]>(["Natural"]);
  const [customStyle, setCustomStyle] = useState("");
  const [selectedEmotion, setSelectedEmotion] = useState("Neutro");

  // Accordions
  const [showSliders, setShowSliders] = useState(false);
  const [showToggles, setShowToggles] = useState(false);

  // Sliders State (0-4 mapping to labels)
  const [sliders, setSliders] = useState({
    velocidade: 2,
    tom: 2,
    expressividade: 2,
    intEmocional: 2,
    formalidade: 2,
    dramatismo: 2,
    naturalidade: 2,
    energia: 2
  });

  // Toggles State
  const [toggles, setToggles] = useState({
    inicioSuave: false,
    fimSuave: false,
    sorriso: false,
    aveludada: false,
    respiracoes: false
  });
  const [customPronunciation, setCustomPronunciation] = useState("");

  // Playback State
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [audioBlob, setAudioBlob] = useState<Blob | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);

  // History & Toasts
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastIdRef = useRef(0);

  const showToast = (message: string, type: "success" | "error" | "info" = "info") => {
    const id = ++toastIdRef.current;
    setToasts((prev) => [...prev, { id, message, type }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, type === "error" ? 4000 : 3000);
  };

  // ═══════════════════════════════════════════════════
  // AUDIO CONTROLS
  // ═══════════════════════════════════════════════════

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = volume;
    }
  }, [volume]);

  const togglePlay = () => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.pause();
    } else {
      audioRef.current.play();
    }
    setIsPlaying(!isPlaying);
  };

  const handleTimeUpdate = () => {
    if (!audioRef.current) return;
    setCurrentTime(audioRef.current.currentTime);
    setProgress((audioRef.current.currentTime / audioRef.current.duration) * 100 || 0);
  };

  const handleLoadedMetadata = () => {
    if (!audioRef.current) return;
    setDuration(audioRef.current.duration);
  };

  const handleEnded = () => {
    setIsPlaying(false);
    setProgress(0);
    setCurrentTime(0);
    if (audioRef.current) audioRef.current.currentTime = 0;
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      const newTime = (val / 100) * audioRef.current.duration;
      audioRef.current.currentTime = newTime;
      setCurrentTime(newTime);
      setProgress(val);
    }
  };

  const formatTime = (time: number) => {
    if (isNaN(time)) return "0:00";
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60);
    return \`\${m}:\${s < 10 ? "0" : ""}\${s}\`;
  };

  // ═══════════════════════════════════════════════════
  // GENERATION LOGIC
  // ═══════════════════════════════════════════════════

  const constructPrompt = (rawText: string) => {
    // 1. Accent
    let accentInstruction = "sotaque neutro do Brasil";
    if (selectedAccent === "Personalizado") {
      accentInstruction = customAccent || "sotaque neutro";
    } else {
      for (const region of Object.values(ACCENTS)) {
        const found = region.find((a) => a.id === selectedAccent);
        if (found) accentInstruction = found.text;
      }
    }

    // 2. Style
    let styleStr = selectedStyles.join(" combinado com ");
    if (selectedStyles.includes("Estilo Personalizado") && customStyle) {
      styleStr = \`\${styleStr} e \${customStyle}\`;
    }

    // 3. Emotion
    const emotionStr = selectedEmotion;

    // 4. Sliders
    const speedStr = SLIDER_LABELS.velocidade[sliders.velocidade];
    const pitchStr = SLIDER_LABELS.tom[sliders.tom];
    const exprStr = SLIDER_LABELS.expressividade[sliders.expressividade];
    const intEmoStr = SLIDER_LABELS.intEmocional[sliders.intEmocional];
    const formStr = SLIDER_LABELS.formalidade[sliders.formalidade];
    const dramStr = SLIDER_LABELS.dramatismo[sliders.dramatismo];
    const natStr = SLIDER_LABELS.naturalidade[sliders.naturalidade];
    const engStr = SLIDER_LABELS.energia[sliders.energia];

    let sliderInstruction = \`fale com velocidade \${speedStr}, tom \${pitchStr}, de forma \${exprStr}, com intensidade emocional \${intEmoStr}, \${formStr}, dramatismo \${dramStr}, \${natStr} e energia \${engStr}\`;

    // 5. Toggles
    const toggleStrs: string[] = [];
    if (toggles.inicioSuave) toggleStrs.push("comece a fala de forma gradual e suave");
    if (toggles.fimSuave) toggleStrs.push("termine a fala de forma gradual e suave");
    if (toggles.sorriso) toggleStrs.push("fale com um leve sorriso na voz");
    if (toggles.aveludada) toggleStrs.push("use uma voz aveludada e suave");
    if (toggles.respiracoes) toggleStrs.push("inclua respirações naturais ocasionais");
    if (customPronunciation) toggleStrs.push(\`pronuncie: \${customPronunciation}\`);

    const toggleInstruction = toggleStrs.length > 0 ? \`, \${toggleStrs.join(", ")}\` : "";

    // 6. Text Replacements
    let processedText = rawText;
    for (const [tag, replacement] of Object.entries(TAG_MAP)) {
      processedText = processedText.split(tag).join(replacement);
    }

    // Final Prompt
    return \`Leia o seguinte texto em voz alta em português brasileiro, com \${accentInstruction}, no estilo \${styleStr}, com emoção de \${emotionStr}, \${sliderInstruction}\${toggleInstruction}. O texto é: \${processedText}\`;
  };

  const generateAudio = async (textToGenerate: string, presetVoice?: string) => {
    if (!textToGenerate.trim()) {
      showToast("Digite algum texto para gerar o áudio.", "error");
      return;
    }
    if (!apiKey) {
      showToast("Insira a chave de API do Gemini.", "error");
      return;
    }

    setIsGenerating(true);
    if (audioUrl) {
      URL.revokeObjectURL(audioUrl);
      setAudioUrl(null);
      setAudioBlob(null);
    }

    const voiceToUse = presetVoice || selectedVoice;
    const finalPrompt = constructPrompt(textToGenerate);

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 20000);

    try {
      const response = await fetch(
        \`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-tts:generateContent?key=\${apiKey}\`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: finalPrompt }] }],
            generationConfig: {
              responseModalities: ["AUDIO"],
              speechConfig: {
                voiceConfig: {
                  prebuiltVoiceConfig: {
                    voiceName: voiceToUse
                  }
                }
              }
            }
          }),
          signal: controller.signal
        }
      );

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 429) throw new Error("⏳ Limite atingido. Aguarde alguns segundos e tente novamente.");
        if (response.status === 401 || response.status === 403) throw new Error("🔑 Chave de API inválida. Verifique sua chave.");
        throw new Error("❌ Erro ao gerar áudio. Tente novamente.");
      }

      const data = await response.json();
      
      if (!data.candidates?.[0]?.content?.parts?.[0]?.inlineData) {
        throw new Error("❌ Resposta inválida da API. Verifique os limites ou tente novamente.");
      }

      const inlineData = data.candidates[0].content.parts[0].inlineData;
      const base64Data = inlineData.data;
      const mimeType = inlineData.mimeType;

      // MANDATORY CONVERSION TO WAV
      const wavBlob = pcmToWav(base64Data, mimeType);
      const url = URL.createObjectURL(wavBlob);
      
      setAudioBlob(wavBlob);
      setAudioUrl(url);
      
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.load();
        audioRef.current.play();
        setIsPlaying(true);
      }

      showToast("Áudio gerado com sucesso!", "success");
      setCurrentView("gerar"); // Switch back if generated from somewhere else
    } catch (error: any) {
      if (error.name === 'AbortError') {
        showToast("⏱ Tempo limite atingido. Tente com um texto menor.", "error");
      } else {
        showToast(error.message || "❌ Erro ao gerar áudio. Tente novamente.", "error");
      }
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownload = (blob: Blob, voiceName: string) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = \`vozprime_\${voiceName}_\${Date.now()}.wav\`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const saveToHistory = () => {
    if (!audioBlob || !audioUrl) return;
    const newItem: HistoryItem = {
      id: Math.random().toString(36).substr(2, 9),
      text: text.substring(0, 80) + (text.length > 80 ? "..." : ""),
      voice: selectedVoice,
      accent: selectedAccent,
      style: selectedStyles.join(", "),
      emotion: selectedEmotion,
      date: Date.now(),
      duration: duration || 0,
      url: audioUrl,
      blob: audioBlob
    };
    
    setHistory(prev => {
      const newHistory = [newItem, ...prev].slice(0, 20); // Max 20 items
      return newHistory;
    });
    showToast("Salvo no histórico!", "success");
  };

  // ═══════════════════════════════════════════════════
  // HANDLERS
  // ═══════════════════════════════════════════════════

  const toggleStyle = (style: string) => {
    setSelectedStyles(prev => {
      if (prev.includes(style)) {
        const next = prev.filter(s => s !== style);
        return next.length > 0 ? next : prev; // Prevent empty selection
      }
      if (prev.length >= 2) return [prev[1], style]; // Keep max 2
      return [...prev, style];
    });
  };

  const insertTag = (tag: string) => {
    const textarea = document.getElementById('main-textarea') as HTMLTextAreaElement;
    if (textarea) {
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const newText = text.substring(0, start) + tag + text.substring(end);
      setText(newText);
      setTimeout(() => {
        textarea.focus();
        textarea.setSelectionRange(start + tag.length, start + tag.length);
      }, 0);
    } else {
      setText(text + tag);
    }
  };

  const applyPreset = (preset: any) => {
    setSelectedVoice(preset.voice);
    setSelectedAccent(preset.accent);
    setSelectedStyles(preset.styles);
    setSelectedEmotion(preset.emotion);
    showToast(\`Preset "\${preset.name}" aplicado!\`, "success");
    setCurrentView("gerar");
  };

  // ═══════════════════════════════════════════════════
  // THEME & STYLES (Tailwind Configuration via classes)
  // ═══════════════════════════════════════════════════

  // Applying Dark/Light mode wrapper classes
  const themeClass = darkMode ? "bg-[#0f0f13] text-[#e8e8f0]" : "bg-[#f4f4f8] text-[#1a1a24]";
  const panelClass = darkMode ? "bg-[#1a1a24]/80 backdrop-blur-md border-[#303040]" : "bg-white border-gray-200";
  const inputClass = darkMode ? "bg-[#0f0f13] border-[#303040] text-white" : "bg-gray-50 border-gray-300 text-black";
  const activeNavClass = darkMode ? "bg-gradient-to-r from-[#00d4aa]/10 to-transparent border-l-2 border-[#00d4aa] text-[#00d4aa]" : "bg-[#00a88a]/10 border-l-2 border-[#00a88a] text-[#00a88a]";
  const hoverNavClass = darkMode ? "hover:bg-[#303040]/50" : "hover:bg-gray-100";
  const buttonPrimaryClass = darkMode ? "bg-gradient-to-r from-[#00d4aa] to-[#0099ff] text-white hover:scale-[1.02] transition-transform" : "bg-gradient-to-r from-[#00a88a] to-[#007b66] text-white hover:scale-[1.02] transition-transform";
  const buttonOutlineClass = darkMode ? "border border-[#303040] hover:bg-[#303040] transition-colors" : "border border-gray-300 hover:bg-gray-100 transition-colors";
  
  // ═══════════════════════════════════════════════════
  // RENDER SECTIONS
  // ═══════════════════════════════════════════════════

  return (
    <div className={\`flex h-screen w-full font-sans overflow-hidden transition-colors duration-300 \${themeClass}\`}>
      <style dangerouslySetInnerHTML={{__html: \`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700&family=Syne:wght@500;600;700&display=swap');
        .font-head { font-family: 'Syne', sans-serif; }
        .font-body { font-family: 'DM Sans', sans-serif; }
        ::-webkit-scrollbar { width: 6px; height: 6px; }
        ::-webkit-scrollbar-track { background: transparent; }
        ::-webkit-scrollbar-thumb { background: \${darkMode ? '#303040' : '#d1d5db'}; border-radius: 10px; }
        ::-webkit-scrollbar-thumb:hover { background: \${darkMode ? '#00d4aa' : '#00a88a'}; }
      \`}} />

      {/* TOASTS */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map(toast => (
          <div key={toast.id} className={\`flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg transform transition-all duration-300 \${
            toast.type === 'error' ? 'bg-red-500 text-white' : 
            toast.type === 'success' ? 'bg-green-500 text-white' : 
            darkMode ? 'bg-[#303040] text-white' : 'bg-gray-800 text-white'
          }\`}>
            {toast.type === 'error' && <AlertCircle size={18} />}
            {toast.type === 'success' && <CheckCircle2 size={18} />}
            <span className="font-medium text-sm">{toast.message}</span>
          </div>
        ))}
      </div>

      {/* HIDDEN AUDIO ELEMENT */}
      <audio 
        ref={audioRef} 
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleEnded}
        className="hidden" 
      />

      {/* ═══════════════════════════════════════════════════ */}
      {/* LEFT SIDEBAR (240px) */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className={\`w-[240px] flex-shrink-0 flex flex-col border-r \${panelClass}\`}>
        <div className="p-6 flex items-center gap-3">
          <div className={\`w-10 h-10 rounded-xl flex items-center justify-center \${buttonPrimaryClass}\`}>
            <Activity className="text-white" size={24} />
          </div>
          <div>
            <h1 className="font-head text-xl font-bold tracking-tight">VozPrime</h1>
            <p className="text-[10px] uppercase tracking-wider opacity-60 font-bold">Studio Edition</p>
          </div>
        </div>

        <nav className="flex-1 px-4 py-4 flex flex-col gap-1 font-body">
          <button onClick={() => setCurrentView("gerar")} className={\`flex items-center gap-3 px-4 py-3 rounded-r-xl transition-all \${currentView === "gerar" ? activeNavClass : hoverNavClass}\`}>
            <Mic size={18} /> <span className="font-medium">Gerar Voz</span>
          </button>
          <button onClick={() => setCurrentView("biblioteca")} className={\`flex items-center gap-3 px-4 py-3 rounded-r-xl transition-all \${currentView === "biblioteca" ? activeNavClass : hoverNavClass}\`}>
            <Library size={18} /> <span className="font-medium">Biblioteca</span>
          </button>
          <button onClick={() => setCurrentView("historico")} className={\`flex items-center gap-3 px-4 py-3 rounded-r-xl transition-all \${currentView === "historico" ? activeNavClass : hoverNavClass}\`}>
            <Clock size={18} /> <span className="font-medium">Histórico</span>
          </button>
          <button onClick={() => setCurrentView("presets")} className={\`flex items-center gap-3 px-4 py-3 rounded-r-xl transition-all \${currentView === "presets" ? activeNavClass : hoverNavClass}\`}>
            <Zap size={18} /> <span className="font-medium">Presets</span>
          </button>
          <button onClick={() => setCurrentView("configuracoes")} className={\`flex items-center gap-3 px-4 py-3 rounded-r-xl transition-all \${currentView === "configuracoes" ? activeNavClass : hoverNavClass}\`}>
            <Settings size={18} /> <span className="font-medium">Configurações</span>
          </button>
        </nav>

        <div className="p-4 border-t border-inherit">
          <button 
            onClick={() => setDarkMode(!darkMode)}
            className={\`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl \${buttonOutlineClass}\`}
          >
            {darkMode ? <Sun size={16} /> : <Moon size={16} />}
            <span className="font-medium text-sm">{darkMode ? "Modo Claro" : "Modo Escuro"}</span>
          </button>
        </div>
      </div>

      {/* ═══════════════════════════════════════════════════ */}
      {/* CENTER & RIGHT CONTENT AREA */}
      {/* ═══════════════════════════════════════════════════ */}
      <div className="flex-1 flex overflow-hidden">

        {/* ================================================= */}
        {/* VIEW: GERAR (Main Editor) */}
        {/* ================================================= */}
        {currentView === "gerar" && (
          <>
            {/* CENTER FLEX */}
            <div className="flex-1 flex flex-col p-6 overflow-y-auto">
              
              {/* API KEY ROW */}
              <div className="mb-6 flex items-center gap-4">
                <div className="relative flex-1 max-w-md">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Zap size={16} className="text-gray-400" />
                  </div>
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Sua chave API do Google Gemini"
                    className={\`w-full pl-10 pr-10 py-2.5 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#00d4aa] transition-all text-sm \${inputClass}\`}
                  />
                  <button 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-200"
                  >
                    {showApiKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <p className="text-xs opacity-60">Obter chave gratuita em aistudio.google.com</p>
              </div>

              {/* EDITOR SECTION */}
              <div className={\`flex-1 flex flex-col rounded-2xl border overflow-hidden shadow-sm flex-shrink-0 \${panelClass}\`}>
                
                {/* TOOLBAR */}
                <div className="px-4 py-3 border-b border-inherit flex flex-wrap gap-2 items-center bg-black/5">
                  <span className="text-xs font-bold uppercase tracking-wider opacity-50 mr-2">Direções de Palco:</span>
                  {TAGS.map(tag => (
                    <button 
                      key={tag} 
                      onClick={() => insertTag(tag)}
                      className={\`text-xs px-2 py-1 rounded-md transition-colors \${buttonOutlineClass}\`}
                    >
                      {tag}
                    </button>
                  ))}
                </div>

                {/* TEXTAREA */}
                <textarea
                  id="main-textarea"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  maxLength={5000}
                  placeholder="Digite o texto que você deseja transformar em voz..."
                  className={\`flex-1 w-full p-6 bg-transparent resize-none focus:outline-none font-body text-base leading-relaxed \${darkMode ? 'text-gray-200' : 'text-gray-800'}\`}
                  style={{ minHeight: '180px' }}
                />

                {/* BOTTOM BAR */}
                <div className="px-4 py-3 border-t border-inherit flex items-center justify-between bg-black/5">
                  <span className={\`text-xs \${text.length > 4800 ? 'text-red-500' : 'opacity-50'}\`}>
                    {text.length} / 5000 caracteres
                  </span>
                  
                  <div className="flex gap-2">
                    <button className={\`px-6 py-2.5 rounded-xl font-medium text-sm flex items-center gap-2 \${buttonOutlineClass}\`}>
                      <PlayCircle size={16} /> Pré-visualizar
                    </button>
                    <button 
                      onClick={() => generateAudio(text)}
                      disabled={isGenerating || !text.trim()}
                      className={\`px-8 py-2.5 rounded-xl font-bold flex items-center gap-2 shadow-lg disabled:opacity-50 disabled:cursor-not-allowed \${buttonPrimaryClass}\`}
                    >
                      {isGenerating ? (
                        <><RefreshCw size={18} className="animate-spin" /> Gerando áudio...</>
                      ) : (
                        <><Mic size={18} /> Gerar Áudio</>
                      )}
                    </button>
                  </div>
                </div>
              </div>

              {/* QUICK PRESETS */}
              <div className="mt-6 flex flex-wrap gap-2">
                <span className="text-xs font-bold uppercase tracking-wider opacity-50 flex items-center mr-2">Presets Rápidos:</span>
                {PRESETS.map((p, i) => (
                  <button key={i} onClick={() => applyPreset(p)} className={\`text-xs px-3 py-1.5 rounded-full transition-colors \${buttonOutlineClass}\`}>
                    {p.name}
                  </button>
                ))}
              </div>

              {/* AUDIO PLAYER (Shows only when audio generated) */}
              <div className={\`mt-6 rounded-2xl border p-6 transition-all duration-500 \${audioUrl ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4 pointer-events-none hidden'} \${panelClass}\`}>
                <div className="flex justify-between items-start mb-4">
                  <div>
                    <h3 className="font-head font-bold text-lg">{selectedVoice}</h3>
                    <div className="flex gap-2 mt-1">
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-black/20">{selectedAccent}</span>
                      {selectedStyles.map(s => <span key={s} className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-black/20">{s}</span>)}
                      <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded-full bg-black/20">{selectedEmotion}</span>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={saveToHistory} className={\`p-2 rounded-lg \${buttonOutlineClass}\`} title="Salvar no Histórico"><Save size={16} /></button>
                    <button onClick={() => generateAudio(text)} className={\`p-2 rounded-lg \${buttonOutlineClass}\`} title="Regenerar"><RefreshCw size={16} /></button>
                    <button onClick={() => handleDownload(audioBlob!, selectedVoice)} className={\`p-2 rounded-lg flex items-center gap-2 bg-gradient-to-r from-[#00d4aa]/20 to-[#0099ff]/20 text-[#00d4aa] border border-[#00d4aa]/30 hover:bg-[#00d4aa]/30 transition-colors\`}>
                      <Download size={16} /> <span className="font-bold text-sm">Baixar WAV</span>
                    </button>
                  </div>
                </div>

                <div className="flex items-center gap-4">
                  <button 
                    onClick={togglePlay}
                    className={\`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 \${buttonPrimaryClass}\`}
                  >
                    {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
                  </button>
                  
                  <div className="flex-1 flex flex-col gap-1">
                    <input 
                      type="range" 
                      min="0" max="100" 
                      value={progress} 
                      onChange={handleSeek}
                      className="w-full h-2 bg-black/20 rounded-lg appearance-none cursor-pointer accent-[#00d4aa]"
                      style={{
                        background: \`linear-gradient(to right, #00d4aa \${progress}%, \${darkMode ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.1)'} \${progress}%)\`
                      }}
                    />
                    <div className="flex justify-between text-xs opacity-60 font-medium font-mono tracking-wider mt-1">
                      <span>{formatTime(currentTime)}</span>
                      <span>{formatTime(duration)}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Volume2 size={16} className="opacity-60" />
                    <input 
                      type="range" min="0" max="1" step="0.05" 
                      value={volume} onChange={(e) => setVolume(parseFloat(e.target.value))}
                      className="w-20 h-1.5 bg-black/20 rounded-lg appearance-none cursor-pointer accent-[#0099ff]"
                    />
                  </div>
                </div>
              </div>

            </div>

            {/* RIGHT PANEL (320px fixed) */}
            <div className={\`w-[320px] flex-shrink-0 border-l flex flex-col overflow-y-auto overflow-x-hidden \${panelClass}\`}>
              <div className="p-5 flex flex-col gap-6 font-body">
                
                {/* VOICE SELECTOR */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider opacity-50 mb-3">Voz</h3>
                  <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto pr-1">
                    {VOICES.map(v => (
                      <button 
                        key={v.name}
                        onClick={() => setSelectedVoice(v.name)}
                        className={\`p-3 rounded-xl border text-left transition-all relative overflow-hidden \${
                          selectedVoice === v.name 
                          ? (darkMode ? 'border-[#00d4aa] bg-[#00d4aa]/10' : 'border-[#00a88a] bg-[#00a88a]/10') 
                          : buttonOutlineClass
                        }\`}
                      >
                        <div className="flex justify-between items-start mb-1">
                          <span className="font-bold text-sm">{v.name}</span>
                          <span className={\`text-[10px] font-bold px-1.5 py-0.5 rounded \${v.gender === 'M' ? 'bg-blue-500/20 text-blue-500' : 'bg-pink-500/20 text-pink-500'}\`}>
                            {v.gender}
                          </span>
                        </div>
                        <p className="text-[10px] opacity-70 leading-tight">{v.tone}</p>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ACCENT SELECTOR */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider opacity-50 mb-3">Sotaque</h3>
                  <select 
                    value={selectedAccent} 
                    onChange={(e) => setSelectedAccent(e.target.value)}
                    className={\`w-full p-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#00d4aa] text-sm appearance-none \${inputClass}\`}
                  >
                    {Object.entries(ACCENTS).map(([region, accents]) => (
                      <optgroup key={region} label={region}>
                        {accents.map(a => <option key={a.id} value={a.id}>{a.id}</option>)}
                      </optgroup>
                    ))}
                    <option value="Personalizado">Personalizado...</option>
                  </select>
                  {selectedAccent === "Personalizado" && (
                    <input 
                      type="text" 
                      placeholder="Ex: sotaque açoriano forte..."
                      value={customAccent}
                      onChange={(e) => setCustomAccent(e.target.value)}
                      className={\`w-full mt-2 p-3 rounded-xl border text-sm \${inputClass}\`}
                    />
                  )}
                </div>

                {/* STYLE SELECTOR */}
                <div>
                  <div className="flex justify-between items-end mb-3">
                    <h3 className="text-sm font-bold uppercase tracking-wider opacity-50">Estilos</h3>
                    <span className="text-[10px] opacity-50">Máx 2</span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                    {STYLES.map(s => (
                      <button 
                        key={s}
                        onClick={() => toggleStyle(s)}
                        className={\`text-[11px] font-medium px-3 py-1.5 rounded-full border transition-colors \${
                          selectedStyles.includes(s)
                          ? (darkMode ? 'bg-[#0099ff]/20 border-[#0099ff] text-[#0099ff]' : 'bg-[#007b66]/20 border-[#007b66] text-[#007b66]')
                          : buttonOutlineClass
                        }\`}
                      >
                        {s}
                      </button>
                    ))}
                    <button 
                      onClick={() => toggleStyle("Estilo Personalizado")}
                      className={\`text-[11px] font-medium px-3 py-1.5 rounded-full border border-dashed \${selectedStyles.includes("Estilo Personalizado") ? 'border-[#00d4aa] text-[#00d4aa]' : buttonOutlineClass}\`}
                    >
                      + Personalizado
                    </button>
                  </div>
                  {selectedStyles.includes("Estilo Personalizado") && (
                    <input 
                      type="text" 
                      placeholder="Ex: estilo de narrador de rádio dos anos 50..."
                      value={customStyle}
                      onChange={(e) => setCustomStyle(e.target.value)}
                      className={\`w-full mt-2 p-3 rounded-xl border text-sm \${inputClass}\`}
                    />
                  )}
                </div>

                {/* EMOTION SELECTOR */}
                <div>
                  <h3 className="text-sm font-bold uppercase tracking-wider opacity-50 mb-3">Emoção</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {EMOTIONS.map(e => (
                      <button 
                        key={e.id}
                        onClick={() => setSelectedEmotion(e.id)}
                        className={\`flex flex-col items-center justify-center p-2 rounded-xl border transition-all \${
                          selectedEmotion === e.id 
                          ? (darkMode ? 'border-[#00d4aa] bg-[#00d4aa]/10 scale-105' : 'border-[#00a88a] bg-[#00a88a]/10 scale-105') 
                          : buttonOutlineClass
                        }\`}
                        title={e.id}
                      >
                        <span className="text-xl mb-1">{e.icon}</span>
                        <span className="text-[9px] font-bold truncate w-full text-center">{e.id}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* ACCORDION 1: SLIDERS */}
                <div className="border rounded-xl overflow-hidden border-inherit">
                  <button 
                    onClick={() => setShowSliders(!showSliders)}
                    className={\`w-full p-4 flex justify-between items-center text-sm font-bold bg-black/5 hover:bg-black/10 transition-colors\`}
                  >
                    Controles de Interpretação
                    {showSliders ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showSliders && (
                    <div className="p-4 flex flex-col gap-4 bg-black/2">
                      {Object.entries(SLIDER_LABELS).map(([key, labels]) => (
                        <div key={key}>
                          <div className="flex justify-between items-end mb-1">
                            <span className="text-xs font-bold capitalize">{key.replace(/([A-Z])/g, ' $1').trim()}</span>
                            <span className="text-[10px] text-[#00d4aa] font-bold">{labels[sliders[key as keyof typeof sliders]]}</span>
                          </div>
                          <input 
                            type="range" min="0" max="4" step="1"
                            value={sliders[key as keyof typeof sliders]}
                            onChange={(e) => setSliders({...sliders, [key]: parseInt(e.target.value)})}
                            className="w-full h-1.5 bg-black/20 rounded-lg appearance-none cursor-pointer accent-[#00d4aa]"
                          />
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* ACCORDION 2: TOGGLES */}
                <div className="border rounded-xl overflow-hidden border-inherit">
                  <button 
                    onClick={() => setShowToggles(!showToggles)}
                    className={\`w-full p-4 flex justify-between items-center text-sm font-bold bg-black/5 hover:bg-black/10 transition-colors\`}
                  >
                    Configurações Avançadas
                    {showToggles ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                  </button>
                  {showToggles && (
                    <div className="p-4 flex flex-col gap-3 bg-black/2 text-sm">
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={toggles.inicioSuave} onChange={e => setToggles({...toggles, inicioSuave: e.target.checked})} className="accent-[#00d4aa] w-4 h-4" />
                        <span>Início Suave</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={toggles.fimSuave} onChange={e => setToggles({...toggles, fimSuave: e.target.checked})} className="accent-[#00d4aa] w-4 h-4" />
                        <span>Fim Suave</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={toggles.sorriso} onChange={e => setToggles({...toggles, sorriso: e.target.checked})} className="accent-[#00d4aa] w-4 h-4" />
                        <span>Sorriso na Voz</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={toggles.aveludada} onChange={e => setToggles({...toggles, aveludada: e.target.checked})} className="accent-[#00d4aa] w-4 h-4" />
                        <span>Voz Aveludada</span>
                      </label>
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input type="checkbox" checked={toggles.respiracoes} onChange={e => setToggles({...toggles, respiracoes: e.target.checked})} className="accent-[#00d4aa] w-4 h-4" />
                        <span>Respirações Naturais</span>
                      </label>
                      <div className="mt-2">
                        <span className="text-xs font-bold opacity-70 block mb-1">Pronúncia Customizada</span>
                        <input 
                          type="text" 
                          placeholder="Ex: YouTube como 'Yutubi'" 
                          value={customPronunciation}
                          onChange={e => setCustomPronunciation(e.target.value)}
                          className={\`w-full p-2 text-xs rounded-lg border \${inputClass}\`}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <button className={\`w-full py-3 rounded-xl border border-dashed flex items-center justify-center gap-2 font-bold text-sm mt-2 \${buttonOutlineClass}\`}>
                  <Heart size={16} /> Salvar como Preset
                </button>

              </div>
            </div>
          </>
        )}

        {/* ================================================= */}
        {/* VIEW: BIBLIOTECA (Voices Library) */}
        {/* ================================================= */}
        {currentView === "biblioteca" && (
          <div className="flex-1 p-8 overflow-y-auto">
            <h2 className="font-head text-3xl font-bold mb-2">Biblioteca de Vozes</h2>
            <p className="opacity-60 mb-8 font-body">Explore as 12 vozes ultra-realistas disponíveis no motor Gemini TTS.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {VOICES.map(v => (
                <div key={v.name} className={\`rounded-2xl p-6 border flex flex-col \${panelClass} hover:-translate-y-1 transition-transform duration-300 shadow-sm\`}>
                  <div className="flex justify-between items-start mb-4">
                    <div className={\`w-14 h-14 rounded-full bg-gradient-to-br \${v.gender === 'M' ? 'from-blue-500 to-indigo-600' : 'from-pink-500 to-rose-600'} flex items-center justify-center text-white font-bold text-2xl shadow-lg\`}>
                      {v.name.charAt(0)}
                    </div>
                    <span className={\`text-xs font-bold px-2.5 py-1 rounded-full \${v.gender === 'M' ? 'bg-blue-500/10 text-blue-500' : 'bg-pink-500/10 text-pink-500'}\`}>
                      {v.gender === 'M' ? 'Masculino' : 'Feminino'}
                    </span>
                  </div>
                  <h3 className="font-head font-bold text-xl mb-1">{v.name}</h3>
                  <p className="font-body text-sm opacity-70 mb-4">{v.tone}</p>
                  
                  <div className="bg-black/5 rounded-xl p-3 mb-6 flex-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider opacity-50 block mb-1">Uso Recomendado</span>
                    <span className="text-sm font-medium">{v.use}</span>
                  </div>

                  <div className="flex gap-2 mt-auto">
                    <button 
                      onClick={() => generateAudio("Olá, eu sou uma demonstração de voz do sistema.", v.name)}
                      className={\`flex-1 py-2 rounded-xl flex items-center justify-center gap-2 text-sm font-bold \${buttonOutlineClass}\`}
                    >
                      <Play size={16} /> Demo
                    </button>
                    <button 
                      onClick={() => { setSelectedVoice(v.name); setCurrentView("gerar"); }}
                      className={\`flex-1 py-2 rounded-xl text-sm font-bold shadow-md \${buttonPrimaryClass}\`}
                    >
                      Usar Voz
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* VIEW: HISTÓRICO */}
        {/* ================================================= */}
        {currentView === "historico" && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="flex justify-between items-end mb-8">
              <div>
                <h2 className="font-head text-3xl font-bold mb-2">Histórico de Gerações</h2>
                <p className="opacity-60 font-body">Seus áudios gerados recentemente. Ficam salvos temporariamente na sessão.</p>
              </div>
              {history.length > 0 && (
                <button onClick={() => setHistory([])} className="text-red-500 hover:text-red-400 text-sm font-bold flex items-center gap-2">
                  <Trash2 size={16} /> Limpar Tudo
                </button>
              )}
            </div>

            {history.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 opacity-50">
                <Clock size={48} className="mb-4" />
                <p className="font-body text-lg">Nenhum áudio gerado ainda.</p>
                <button onClick={() => setCurrentView("gerar")} className="mt-4 text-[#00d4aa] font-bold hover:underline">
                  Crie seu primeiro áudio!
                </button>
              </div>
            ) : (
              <div className="flex flex-col gap-4">
                {history.map(item => (
                  <div key={item.id} className={\`p-4 rounded-2xl border flex items-center gap-4 \${panelClass}\`}>
                    <button 
                      onClick={() => {
                        if (audioRef.current) {
                          audioRef.current.src = item.url;
                          audioRef.current.play();
                          setIsPlaying(true);
                          setAudioBlob(item.blob);
                          setAudioUrl(item.url);
                        }
                      }}
                      className={\`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 bg-gradient-to-r from-[#00d4aa] to-[#0099ff] text-white hover:scale-105 transition-transform shadow-md\`}
                    >
                      <Play size={20} className="ml-1 fill-current" />
                    </button>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate mb-1" title={item.text}>"{item.text}"</p>
                      <div className="flex items-center gap-3 text-xs opacity-60">
                        <span className="font-bold text-[#00d4aa]">{item.voice}</span>
                        <span>•</span>
                        <span>{item.accent}</span>
                        <span>•</span>
                        <span>{item.emotion}</span>
                        <span>•</span>
                        <span>{new Date(item.date).toLocaleTimeString()}</span>
                      </div>
                    </div>

                    <div className="flex gap-2">
                      <button onClick={() => handleDownload(item.blob, item.voice)} className={\`p-2.5 rounded-xl \${buttonOutlineClass}\`} title="Baixar">
                        <Download size={18} />
                      </button>
                      <button onClick={() => {
                        setText(item.text);
                        setSelectedVoice(item.voice);
                        setSelectedAccent(item.accent);
                        setSelectedEmotion(item.emotion);
                        setCurrentView("gerar");
                        showToast("Configurações restauradas no editor", "success");
                      }} className={\`p-2.5 rounded-xl \${buttonOutlineClass}\`} title="Duplicar Configurações">
                        <Copy size={18} />
                      </button>
                      <button onClick={() => {
                        setHistory(h => h.filter(x => x.id !== item.id));
                      }} className={\`p-2.5 rounded-xl text-red-500 hover:bg-red-500/10 border border-transparent transition-colors\`} title="Excluir">
                        <Trash2 size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================= */}
        {/* VIEW: PRESETS */}
        {/* ================================================= */}
        {currentView === "presets" && (
          <div className="flex-1 p-8 overflow-y-auto">
            <h2 className="font-head text-3xl font-bold mb-2">Presets Profissionais</h2>
            <p className="opacity-60 mb-8 font-body">Modelos prontos otimizados para os casos de uso mais comuns.</p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {PRESETS.map(p => (
                <div key={p.name} className={\`p-6 rounded-2xl border \${panelClass} hover:border-[#00d4aa]/50 transition-colors\`}>
                  <div className="flex justify-between items-start mb-4">
                    <h3 className="font-head font-bold text-xl">{p.name}</h3>
                    <Zap className="text-[#00d4aa]" size={20} />
                  </div>
                  
                  <div className="space-y-3 mb-6 font-body text-sm">
                    <div className="flex justify-between border-b border-inherit pb-2">
                      <span className="opacity-60">Voz</span>
                      <span className="font-bold">{p.voice}</span>
                    </div>
                    <div className="flex justify-between border-b border-inherit pb-2">
                      <span className="opacity-60">Sotaque</span>
                      <span className="font-bold truncate max-w-[150px]" title={p.accent}>{p.accent}</span>
                    </div>
                    <div className="flex justify-between border-b border-inherit pb-2">
                      <span className="opacity-60">Estilos</span>
                      <span className="font-bold truncate max-w-[150px]" title={p.styles.join(", ")}>{p.styles.join(", ")}</span>
                    </div>
                    <div className="flex justify-between border-b border-inherit pb-2">
                      <span className="opacity-60">Emoção</span>
                      <span className="font-bold">{p.emotion}</span>
                    </div>
                  </div>

                  <button 
                    onClick={() => applyPreset(p)}
                    className={\`w-full py-3 rounded-xl font-bold flex items-center justify-center gap-2 shadow-md \${buttonPrimaryClass}\`}
                  >
                    <CheckCircle2 size={18} /> Aplicar Preset
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ================================================= */}
        {/* VIEW: CONFIGURAÇÕES */}
        {/* ================================================= */}
        {currentView === "configuracoes" && (
          <div className="flex-1 p-8 overflow-y-auto">
            <div className="max-w-2xl mx-auto">
              <h2 className="font-head text-3xl font-bold mb-2">Configurações</h2>
              <p className="opacity-60 mb-8 font-body">Gerencie suas chaves e preferências do sistema.</p>

              <div className={\`p-6 rounded-2xl border mb-6 \${panelClass}\`}>
                <h3 className="font-head text-xl font-bold mb-4 flex items-center gap-2"><Zap size={20} className="text-[#00d4aa]" /> Google Gemini API Key</h3>
                <p className="text-sm opacity-70 mb-4">A chave é armazenada apenas na memória local do seu navegador enquanto a aba estiver aberta. Nunca enviamos sua chave para nossos servidores.</p>
                
                <div className="relative">
                  <input
                    type={showApiKey ? "text" : "password"}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    className={\`w-full pl-4 pr-12 py-3 rounded-xl border focus:outline-none focus:ring-2 focus:ring-[#00d4aa] transition-all \${inputClass}\`}
                  />
                  <button 
                    onClick={() => setShowApiKey(!showApiKey)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-gray-400 hover:text-gray-200"
                  >
                    {showApiKey ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                <p className="text-xs text-red-500 mt-2 font-medium">Nota: O modelo Gemini TTS atualmente requer acesso beta/preview.</p>
              </div>

              <div className={\`p-6 rounded-2xl border \${panelClass}\`}>
                <h3 className="font-head text-xl font-bold mb-4 flex items-center gap-2"><AlertCircle size={20} className="text-[#00d4aa]" /> Sobre a Conversão de Áudio</h3>
                <p className="text-sm opacity-70 mb-4 leading-relaxed">
                  A API do Gemini TTS retorna áudio no formato <code>audio/L16;codec=pcm;rate=24000</code> bruto (base64). Navegadores não tocam esse formato nativamente. 
                  Este aplicativo inclui um conversor ArrayBuffer embutido que injeta o cabeçalho WAV de 44 bytes em tempo real, permitindo reprodução e download instantâneos sem depender de servidores ou de bibliotecas pesadas como FFmpeg.
                </p>
              </div>

            </div>
          </div>
        )}

      </div>
    </div>
  );
}
