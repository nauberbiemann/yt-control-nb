import { GoogleGenAI } from "@google/genai";
import { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Music, 
  Sparkles, 
  Copy, 
  Check, 
  Loader2, 
  BookOpen, 
  Clock, 
  Globe, 
  ListMusic,
  ChevronDown,
  ChevronUp,
  Info,
  Mic
} from 'lucide-react';

// Initialize Gemini API
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

// System Instruction from the user's prompt
const SYSTEM_INSTRUCTION = `
Você é um produtor musical especializado em música católica místico-contemplativa e um engenheiro avançado de prompts para a ferramenta Suno AI (V5.5+). Sua missão é gerar pacotes completos de composição para o canal do YouTube "Som que Reza".

## DIRETRIZES TEOLÓGICAS E DE ESTILO (O SEU DIFERENCIAL)
1.  **Jornada Emocional:** Suas composições NUNCA devem seguir o padrão de "Culpa -> Perdão -> Exaltação barulhenta". Você deve focar estritamente na jornada mística católica: **Silêncio -> Escuta -> Intimidade -> Entrega.**
2.  **Tom e Atmosfera:** Menos dramático, mais contemplativo, sacramental e eucarístico. A música deve soar como uma adoração silenciosa numa capela vazia, profunda e reverente.
3.  **Temas Centrais:** Priorize a Eucaristia, Adoração Silenciosa, Maria como colo de mãe, vida dos Santos e Liturgia. Use termos como "altar", "ostensório", "hóstia sagrada", "silêncio", "sacrário", "manto".
4.  **Regra de Idioma:** A LETRA (Lyrics) e o TÍTULO DA MÚSICA (Song Title) devem ser gerados EXATAMENTE no idioma escolhido pelo usuário na variável [Idioma]. TODOS os demais comandos (Styles, tags de estrutura musical como [Verse], e configurações) DEVEM permanecer obrigatoriamente em INGLÊS.

**REGRAS DE OURO PARA LETRA E ESTRUTURA (APLICÁVEIS A QUALQUER TEMA):**
1. **Naturalidade nas Rimas:** NUNCA force rimas usando palavras difíceis, robóticas ou incomuns (como "sutil", "sacro ponto", "jaz"). Priorize uma linguagem natural, vulnerável e de oração sincera. É melhor não rimar do que quebrar o clima de intimidade com palavras artificiais.
2. **Tags Estruturais 100% em Inglês:** Tudo o que for instrução de arranjo, instrumentos ou estrutura dentro dos colchetes \`[]\` na letra DEVE ser escrito EXCLUSIVAMENTE em INGLÊS. Nunca misture o idioma da letra dentro dos colchetes. 
3. **VULNERABILIDADE E CONFLITO (A REGRA DA DOR REAL):** A música NUNCA deve ser "perfeita" ou genérica logo de início. Ela OBRIGATORIAMENTE deve ser construída em torno da emoção ou fraqueza escolhida pelo usuário na variável [Vulnerabilidade]. Mostre a dor humana antes do alívio divino. Use o contraste íntimo. 
4. **O REFRÃO MEMORÁVEL (A REGRA DO REPLAY):** O refrão (Chorus) DEVE ser a parte mais simples, curta e repetível de toda a música. Ele precisa conter uma "frase icônica" e uma imagem mental muito clara que "grude" na cabeça. NUNCA faça refrões com frases longas, complexas ou excessivamente descritivas. O refrão deve ser direto, relacional e fácil de cantar de olhos fechados.
5. **Aprimoramento de Metatags (Voice e Dinâmica):**
   - **Tags Combinadas:** Não use apenas [Intro]. Combine com instrumentos curtos (máximo de 3 palavras). Exemplo: [Intro: solo piano].
   - **Voz e Dinâmica:** Adicione tags de voz (ex: [Whispered vocals], [Belting], [Soft-spoken]) ou dinâmica (ex: [Building intensity]) ANTES dos versos para guiar a emoção.
   - **Finalização Obrigatória:** A música DEVE terminar OBRIGATORIAMENTE com a tag [Outro] e/ou [Fade Out] no final da letra para evitar cortes abruptos.

## DIRETRIZES AVANÇADAS PARA O "STYLE PROMPT"
A criação do estilo da música deve seguir estas 4 regras rigorosamente:
1. **A Regra dos 4 Componentes:** O Style DEVE incluir sempre: Gênero/Era, Humor/Emoção, Instrumentos/Produção e Preferências Vocais.
2. **Quantidade e Tamanho:** Use APENAS de 4 a 7 descritores. Menos que 4 gera músicas genéricas, mais que 7 confunde a IA. O campo "Styles" DEVE ter no MÁXIMO entre 120 e 200 caracteres no total.
3. **O Método Sanduíche:** Coloque os elementos mais importantes (Tipo de voz e Gênero principal) no INÍCIO e no FINAL do prompt, pois o Suno foca nas bordas. O vocal DEVE ser o começo (Ex: "Female angelic vocalist, ethereal catholic acoustic...").
4. **Prompts Negativos:** Inclua restrições no estilo se necessário (ex: "no autotune", "no acoustic instruments").

## FORMATO DE SAÍDA EXIGIDO
O usuário fornecerá os seguintes parâmetros: [Tema], [Vulnerabilidade], [Quantidade], [Minutagem] e [Idioma].
Você deve exibir uma mensagem indicando qual música está sendo gerada (ex: "⏳ Gerando Música 1 de X...") e usar uma linha divisória \`---\` entre elas.

Para cada música gerada, você DEVE usar o formato exato abaixo. Os conteúdos DEVEM estar dentro de blocos de código (Markdown com três crases) indicando "text" (para criar os botões de "Copiar"). Separe a Letra e o Style perfeitamente, conforme o modelo abaixo:

### Música [Número] - [Nome do Tema Abordado]
**Tema:** [Breve explicação de 1 linha sobre como o tema foi abordado]

**Song Title:**
\`\`\`text
[Gerar um título curto e poético no IDIOMA ESCOLHIDO]
\`\`\`

Configurações Avançadas Recomendadas no Suno:

Vocal Gender: [Sugerir Male, Female ou Choir em inglês]

Lyrics Mode: Manual

Weirdness: [Sugerir entre 10% e 30%]

Style Influence: [Sugerir entre 50% e 70%]

Styles (120-200 caracteres, 4-7 descritores, Sanduíche, Negativos):
\`\`\`text
[Comandos em INGLÊS. Ex: Female clear vocal, ethereal ambient worship, gentle piano, gregorian influence, no autotune]
\`\`\`

Lyrics:
\`\`\`text
[Gerar a letra no IDIOMA ESCOLHIDO.
CRÍTICO: TUDO que não for letra cantada DEVE estar entre colchetes [ ].
Use tags ESTRUTURAIS COMBINADAS em INGLÊS (Ex: [Verse 1: soft cello]).
Aplique tags de Dinâmica/Voz antes dos versos (Ex: [Whispered vocals], [Building intensity]).
Se a minutagem pedida for longa (ex: 6-8 min), inclua tags como [Extended Instrumental Adoration] e escreva letras mais longas.
OBRIGATÓRIO INCLUIR [Outro] ou [Fade Out] NO FINAL.]
\`\`\`

### Prompts para Vídeo (Veo3)
Gere 12 prompts visuais altamente detalhados, cinematográficos e fotorrealistas para acompanhar esta música. Eles devem capturar a atmosfera mística e católica. Use termos como "cinematic lighting", "8k", "slow motion", "ethereal", "sacred atmosphere".

**Lista de 12 Prompts (Prontos para Copiar):**
\`\`\`text
[Prompt 1 em INGLÊS]

[Prompt 2 em INGLÊS]

... (Gere até o Prompt 12)

[Prompt 12 em INGLÊS]
\`\`\`
(IMPORTANTE: Gere exatamente 12 prompts. Separe cada prompt com uma linha em branco. Não use numeração ou títulos dentro do bloco de código, apenas os textos dos prompts).
`;

// Pre-defined themes for inspiration
const PREDEFINED_THEMES = [
  "O Silêncio de Nazaré",
  "Adoro Te Devote (Eucaristia)",
  "Noite Escura da Alma (São João da Cruz)",
  "O Manto de Guadalupe",
  "Jardim Fechado (Hortus Conclusus)",
  "Suspiro da Alma (Santa Teresa D'Ávila)",
  "Luz da Tabor (Transfiguração)",
  "Vaso Espiritual",
  "Cântico das Criaturas (São Francisco)",
  "A Doce Chama de Amor",
  "O Pelicano Eucarístico",
  "A Pequena Via (Santa Teresinha)",
  "O Deserto da Quaresma",
  "Chagas de Amor (São Francisco)",
  "O Olhar da Misericórdia",
  "Tarde Te Amei (Santo Agostinho)",
  "O Castelo Interior",
  "A Nuvem do Não-Saber",
  "O Esposo de Sangue",
  "Via Sacra Contemplativa",
  "O Fiat de Maria",
  "A Gruta de Belém",
  "O Coração Traspassado",
  "A Voz do Amado",
  "O Bom Pastor",
  "A Videira Verdadeira",
  "O Óleo da Unção",
  "O Incenso da Oração",
  "A Porta Estreita",
  "O Rio de Água Viva"
];

const VULNERABILITIES = [
  "Cansaço Mental / Exaustão",
  "Aridez Espiritual (Deus distante)",
  "Medo do Silêncio",
  "Sentimento de Indignidade",
  "Ansiedade / Coração Agitado",
  "Distração na Oração",
  "Solidão Profunda",
  "Medo do Futuro",
  "Apego às Coisas do Mundo",
  "Dúvida na Fé"
];

const CopyButton = ({ text, className = "" }: { text: string, className?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className={`p-1.5 rounded-md hover:bg-slate-700/50 text-slate-400 hover:text-slate-200 transition-colors ${className}`}
      title="Copiar"
    >
      {copied ? <Check size={16} className="text-emerald-400" /> : <Copy size={16} />}
    </button>
  );
};

// Custom renderer for code blocks to add copy button
const CodeBlock = ({ children, className }: any) => {
  // Safely extract text content for copying
  const getTextContent = (content: any): string => {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) return content.map(getTextContent).join('');
    return String(content);
  };

  const text = getTextContent(children).replace(/\n$/, '');

  return (
    <div className="relative group my-6">
      <div className="bg-slate-950/50 rounded-lg border border-slate-800/60 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-4 py-2 bg-slate-900/80 border-b border-slate-800/60">
          <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
            {className?.replace('language-', '') || 'Text'}
          </span>
          <CopyButton text={text} />
        </div>
        <div className="p-4 font-mono text-sm text-slate-300 whitespace-pre-wrap overflow-x-auto bg-slate-950/30">
          {children}
        </div>
      </div>
    </div>
  );
};

const CopyAllVideosButton = ({ content }: { content: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyAll = async () => {
    // Extract prompts using regex based on the markdown structure
    // Looking for content inside the code blocks under "Prompts para Vídeo" section
    const videoSection = content.split('### Prompts para Vídeo (Veo3)')[1];
    if (!videoSection) return;

    const codeBlockRegex = /```text\n([\s\S]*?)```/g;
    const matches = [...videoSection.matchAll(codeBlockRegex)];
    
    // Get the first 12 matches
    const prompts = matches.slice(0, 12).map(m => m[1].trim());
    
    if (prompts.length > 0)
    {
        const textToCopy = prompts.join('\n\n');
        await navigator.clipboard.writeText(textToCopy);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <button
      onClick={handleCopyAll}
      className="w-full mt-4 py-3 px-4 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded-xl text-slate-300 hover:text-white transition-all flex items-center justify-center space-x-2 group"
    >
      {copied ? (
        <>
          <Check className="w-4 h-4 text-emerald-400" />
          <span className="text-emerald-400">Prompts Copiados!</span>
        </>
      ) : (
        <>
          <Copy className="w-4 h-4 group-hover:text-amber-400 transition-colors" />
          <span>Copiar Todos os Prompts de Vídeo</span>
        </>
      )}
    </button>
  );
};

export default function App() {
  const [theme, setTheme] = useState('');
  const [vulnerability, setVulnerability] = useState('Outra');
  const [customVulnerability, setCustomVulnerability] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [duration, setDuration] = useState('3-4 min');
  const [language, setLanguage] = useState('Português');
  const [generations, setGenerations] = useState<string[]>([]);
  const [includeSpokenIntro, setIncludeSpokenIntro] = useState(false);
  const [loading, setLoading] = useState(false);
  const chatRef = useRef<any>(null);
  const resultsTopRef = useRef<HTMLDivElement>(null);
  
  // Dynamic suggestions state
  const [suggestions, setSuggestions] = useState<string[]>([]);

  // Shuffle suggestions on mount and on demand
  const shuffleSuggestions = () => {
    const shuffled = [...PREDEFINED_THEMES].sort(() => 0.5 - Math.random());
    setSuggestions(shuffled.slice(0, 4));
  };

  useEffect(() => {
    shuffleSuggestions();
  }, []);

  const generatePrompts = async (isNewVariation = false) => {
    if (!theme) return;
    
    setLoading(true);
    if (!isNewVariation) {
      setGenerations([]);
      chatRef.current = null;
    } else {
      resultsTopRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
    
    try {
      const finalVulnerability = vulnerability === 'Outra' ? customVulnerability : vulnerability;
      
      const spokenIntroPrompt = includeSpokenIntro 
        ? "\n        - Introdução Falada: INCLUIR OBRIGATORIAMENTE no início da letra uma tag [Spoken Intro] com uma mensagem falada de exatas 4 linhas, profunda e conectada ao tema/vulnerabilidade, antes de iniciar o canto."
        : "";

      const userPrompt = isNewVariation 
        ? `Gere mais ${quantity} música(s) seguindo o mesmo tema (${theme}) e vulnerabilidade (${finalVulnerability}), mas com variações significativas nos estilos, melodias e letras para que não pareçam as mesmas músicas anteriores. Mantenha exatamente a mesma estrutura de resposta.${spokenIntroPrompt}`
        : `
        Por favor, gere os prompts com base nos seguintes parâmetros:
        - Tema: ${theme}
        - Vulnerabilidade/Dor Humana: ${finalVulnerability || "Não especificada (escolha uma adequada ao tema)"}
        - Quantidade: ${quantity}
        - Minutagem: ${duration}
        - Idioma: ${language}${spokenIntroPrompt}
      `;

      if (!chatRef.current) {
        chatRef.current = ai.chats.create({
          model: "gemini-2.5-flash",
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            temperature: 0.8,
          },
        });
      }

      const response = await chatRef.current.sendMessage({ message: userPrompt });
      const text = response.text;
      
      if (isNewVariation) {
        setGenerations(prev => [text || "Erro ao gerar variações.", ...prev]);
      } else {
        setGenerations([text || "Nenhum conteúdo gerado. Tente novamente."]);
        // Limpar campos para novas tarefas
        setTheme('');
        setCustomVulnerability('');
        setIncludeSpokenIntro(false);
      }
    } catch (error) {
      console.error("Erro ao gerar:", error);
      if (!isNewVariation) {
        setGenerations(["Ocorreu um erro ao gerar os prompts. Por favor, tente novamente."]);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans selection:bg-amber-900/30">
      <div className="max-w-5xl mx-auto p-4 md:p-8">
        
        {/* Header */}
        <header className="mb-12 text-center space-y-4">
          <motion.div 
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center justify-center p-3 bg-slate-900/50 rounded-full border border-slate-800 mb-4"
          >
            <Music className="w-6 h-6 text-amber-500 mr-2" />
            <span className="text-sm font-medium text-slate-400 tracking-wide uppercase">Som que Reza</span>
          </motion.div>
          
          <motion.h1 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="text-4xl md:text-5xl font-serif font-medium text-slate-100 tracking-tight"
          >
            Gerador de Prompts <span className="text-amber-500 italic">Místicos</span>
          </motion.h1>
          
          <motion.p 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
            className="text-slate-400 max-w-2xl mx-auto text-lg font-light"
          >
            Crie composições contemplativas para Suno AI com profundidade teológica e sensibilidade artística.
          </motion.p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar / Form */}
          <div className="lg:col-span-4 space-y-6">
            <motion.div 
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.3 }}
              className="bg-slate-900/50 backdrop-blur-sm border border-slate-800 rounded-2xl p-6 shadow-xl"
            >
              <div className="space-y-6">
                
                {/* Theme Input & Suggestions */}
                <div className="space-y-3">
                  <label className="flex items-center justify-between text-sm font-medium text-slate-300">
                    <div className="flex items-center">
                      <Sparkles className="w-4 h-4 mr-2 text-amber-500" />
                      Tema da Composição
                    </div>
                  </label>
                  
                  <textarea
                    value={theme}
                    onChange={(e) => setTheme(e.target.value)}
                    placeholder="Escreva seu tema ou escolha uma sugestão abaixo..."
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 placeholder:text-slate-600 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all resize-none h-24"
                  />

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span>Sugestões de Inspiração</span>
                      <button 
                        onClick={shuffleSuggestions}
                        className="flex items-center hover:text-amber-400 transition-colors"
                      >
                        <Sparkles size={12} className="mr-1" />
                        Novas Ideias
                      </button>
                    </div>
                    
                    <div className="grid grid-cols-1 gap-2">
                      <AnimatePresence mode="popLayout">
                        {suggestions.map((t) => (
                          <motion.button
                            key={t}
                            initial={{ opacity: 0, scale: 0.95 }}
                            animate={{ opacity: 1, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.95 }}
                            onClick={() => setTheme(t)}
                            className="text-left text-xs p-2.5 rounded-lg bg-slate-800/40 hover:bg-slate-800 text-slate-400 hover:text-amber-200 transition-colors border border-slate-800 hover:border-slate-700 truncate"
                          >
                            {t}
                          </motion.button>
                        ))}
                      </AnimatePresence>
                    </div>
                  </div>
                </div>

                {/* Vulnerability Selection */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <div className="w-4 h-4 mr-2 text-rose-500 flex items-center justify-center font-serif italic">!</div>
                    Vulnerabilidade / Dor Humana
                  </label>
                  <select
                    value={vulnerability}
                    onChange={(e) => setVulnerability(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/50"
                  >
                    <option value="" disabled>Selecione uma emoção...</option>
                    {VULNERABILITIES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                    <option value="Outra">Outra (Personalizar)</option>
                  </select>
                  
                  <AnimatePresence>
                    {vulnerability === 'Outra' && (
                      <motion.div
                        initial={{ opacity: 0, height: 0, marginTop: 0 }}
                        animate={{ opacity: 1, height: 'auto', marginTop: 8 }}
                        exit={{ opacity: 0, height: 0, marginTop: 0 }}
                        className="overflow-hidden"
                      >
                        <input
                          type="text"
                          value={customVulnerability}
                          onChange={(e) => setCustomVulnerability(e.target.value)}
                          placeholder="Descreva a vulnerabilidade ou dor humana..."
                          className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-rose-500/50 placeholder:text-slate-600"
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <p className="text-xs text-slate-500 italic mt-2">
                    A "Regra da Dor Real": a música começará por esta fraqueza antes de encontrar o alívio.
                  </p>
                  
                  <div className="flex items-center space-x-3 mt-4 pt-3 border-t border-slate-800/50">
                    <input
                      type="checkbox"
                      id="spokenIntro"
                      checked={includeSpokenIntro}
                      onChange={(e) => setIncludeSpokenIntro(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-700 bg-slate-900 text-amber-500 focus:ring-amber-500/50 accent-amber-500 cursor-pointer"
                    />
                    <label htmlFor="spokenIntro" className="text-sm font-medium text-slate-300 cursor-pointer flex items-center select-none">
                      <Mic className="w-4 h-4 mr-1.5 text-amber-500/70" />
                      Incluir introdução falada (4 linhas)
                    </label>
                  </div>
                </div>

                {/* Quantity */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <ListMusic className="w-4 h-4 mr-2 text-slate-500" />
                    Quantidade
                  </label>
                  <select
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    {Array.from({ length: 10 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n} {n === 1 ? 'Música' : 'Músicas'}</option>
                    ))}
                  </select>
                </div>

                {/* Duration */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <Clock className="w-4 h-4 mr-2 text-slate-500" />
                    Minutagem Estimada
                  </label>
                  <select
                    value={duration}
                    onChange={(e) => setDuration(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="2-3 min">Curta (2-3 min)</option>
                    <option value="3-4 min">Média (3-4 min)</option>
                    <option value="4-5 min">Longa (4-5 min)</option>
                    <option value="6-8 min">Estendida (6-8 min)</option>
                  </select>
                </div>

                {/* Language */}
                <div className="space-y-2">
                  <label className="flex items-center text-sm font-medium text-slate-300">
                    <Globe className="w-4 h-4 mr-2 text-slate-500" />
                    Idioma da Letra
                  </label>
                  <select
                    value={language}
                    onChange={(e) => setLanguage(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-700 rounded-xl p-3 text-slate-200 focus:outline-none focus:ring-2 focus:ring-amber-500/50"
                  >
                    <option value="Português">Português</option>
                    <option value="Inglês">Inglês</option>
                    <option value="Espanhol">Espanhol</option>
                    <option value="Latim">Latim</option>
                    <option value="Italiano">Italiano</option>
                  </select>
                </div>

                {/* Generate Button */}
                <button
                  onClick={generatePrompts}
                  disabled={loading || !theme}
                  className={`w-full py-4 px-6 rounded-xl font-medium text-slate-900 transition-all flex items-center justify-center space-x-2
                    ${loading || !theme 
                      ? 'bg-slate-800 text-slate-500 cursor-not-allowed' 
                      : 'bg-amber-500 hover:bg-amber-400 shadow-lg shadow-amber-900/20 hover:shadow-amber-900/40'
                    }`}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Gerando...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-5 h-5" />
                      <span>Gerar Prompts</span>
                    </>
                  )}
                </button>

              </div>
            </motion.div>
          </div>

          {/* Main Content / Results */}
          <div className="lg:col-span-8" ref={resultsTopRef}>
            <AnimatePresence mode="wait">
              {generations.length > 0 ? (
                <motion.div
                  key="results"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-6 md:p-8 shadow-2xl"
                >
                  <div className="space-y-12">
                    {/* ALERTA DE ITERAÇÃO */}
                    <div className="bg-amber-900/10 border border-amber-500/20 rounded-xl p-5 mb-8 flex items-start space-x-4">
                      <div className="p-2 bg-amber-500/10 rounded-lg shrink-0">
                        <Info className="w-5 h-5 text-amber-500" />
                      </div>
                      <div>
                        <h4 className="text-amber-400 font-medium mb-1">Dica de Ouro para o Suno</h4>
                        <p className="text-slate-300 text-sm leading-relaxed">
                          É perfeitamente normal precisar gerar a música de <strong>3 a 6 vezes (ou mais)</strong> até que a IA acerte a métrica, a emoção e respeite todas as <em>metatags</em> de voz e estrutura. Copie o <strong className="text-slate-200">Style</strong> e a <strong className="text-slate-200">Letra</strong> nos campos separados do modo manual do Suno e tenha paciência na geração!
                        </p>
                      </div>
                    </div>

                    {loading && (
                      <div className="flex items-center justify-center py-8 border-b border-slate-800/50">
                        <Loader2 className="w-6 h-6 animate-spin text-amber-500 mr-3" />
                        <span className="text-slate-400 font-medium">Gerando novas variações...</span>
                      </div>
                    )}

                    {generations.map((content, genIndex) => (
                      <div key={genIndex} className="relative">
                        <div className="prose prose-invert prose-slate max-w-none prose-headings:font-serif prose-headings:text-amber-100 prose-a:text-amber-400 prose-strong:text-amber-200">
                          <ReactMarkdown
                            components={{
                              code({node, inline, className, children, ...props}: any) {
                                return !inline ? (
                                  <CodeBlock className={className} {...props}>
                                    {children}
                                  </CodeBlock>
                                ) : (
                                  <code className="bg-slate-800 px-1.5 py-0.5 rounded text-amber-200 font-mono text-sm" {...props}>
                                    {children}
                                  </code>
                                )
                              },
                              hr: ({node, ...props}) => (
                                <hr className="my-8 border-slate-800" {...props} />
                              ),
                              strong: ({node, children, ...props}) => {
                                const text = String(children);
                                if (text.includes('[Botão para Copiar Todos os Prompts de Vídeo]')) {
                                  return <CopyAllVideosButton content={content} />;
                                }
                                return <strong className="text-amber-200 font-medium" {...props}>{children}</strong>;
                              }
                            }}
                          >
                            {content}
                          </ReactMarkdown>
                        </div>

                        {genIndex === 0 && !loading && (
                          <motion.div 
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            className="mt-12 pt-8 border-t border-slate-800 flex flex-col items-center space-y-4"
                          >
                            <p className="text-slate-400 text-sm">Deseja gerar novos prompts mantendo este histórico?</p>
                            <button
                              onClick={() => generatePrompts(true)}
                              className="flex items-center space-x-2 bg-amber-500 hover:bg-amber-400 text-slate-900 px-8 py-3 rounded-xl font-medium transition-all shadow-lg shadow-amber-900/20"
                            >
                              <Sparkles className="w-5 h-5" />
                              <span>Gerar Novas Variações</span>
                            </button>
                          </motion.div>
                        )}
                        
                        {genIndex < generations.length - 1 && (
                          <div className="mt-16 pt-16 border-t border-slate-800/50 relative">
                            <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-slate-950 px-4 text-xs font-mono text-slate-600 uppercase tracking-widest">
                              Geração Anterior
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </motion.div>
              ) : (
                <motion.div
                  key="empty"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="h-full min-h-[400px] flex flex-col items-center justify-center text-slate-600 border-2 border-dashed border-slate-800 rounded-2xl p-8 text-center"
                >
                  <BookOpen className="w-16 h-16 mb-4 opacity-20" />
                  <h3 className="text-xl font-serif font-medium text-slate-500 mb-2">Aguardando Inspiração</h3>
                  <p className="max-w-md mx-auto text-sm">
                    Preencha os parâmetros ao lado e clique em "Gerar Prompts" para receber suas composições místicas.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
        
        <footer className="mt-16 text-center border-t border-slate-800/50 pt-8 pb-4">
          <p className="text-slate-600 text-sm font-light">
            Desenvolvido para o canal <span className="text-amber-500/80 font-medium">Som que Reza</span>
          </p>
        </footer>
      </div>
    </div>
  );
}
