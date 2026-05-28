import { NextRequest, NextResponse } from 'next/server';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';
import {
  applyAssetRules,
  buildPipelineResult,
  normalizeAssetType,
  parseSrtTimeToMs,
  parseSrtToRows,
  sanitizePrompt,
  type SrtAssetRow,
  enforceTextoCooldown,
  applyHyperframeRules,
  applyHyperframeExclusionZone,
  finalizeFacelessRows,
} from '@/lib/srt-asset-pipeline';

const BATCH_SIZE_DEFAULT = 4;
const BATCH_SIZE_REASONING = 2; // Reasoning models handle smaller batches more reliably
const SUPPORTED_PROMPT_ASSETS = new Set(['vídeo', 'imagem', 'texto', 'hyperframe']);

export const maxDuration = 60;
const SYSTEM_INSTRUCTIONS = `
You generate production-ready visual prompts for subtitle-driven videos.

Return only valid JSON.
Write every visual prompt (video, image) in English (except for text styles which should match the provided list). Hyperframe title/subtitle/metrics fields must always be written in the exact same language as the subtitle text — never in English unless the subtitle itself is in English.
Do not include markdown, subtitles, on-screen text, logos, watermarks, or UI overlays.
Keep prompts concise, vivid, and generator-friendly.
Use one sentence per prompt, usually between 18 and 40 words.

CRITICAL RULE: The subtitle text is the PRIMARY source of meaning. Every prompt MUST directly visualize what is being said at that specific moment. Generic scenes are not acceptable.

Rules for asset types:
- asset == "video":
  - First, identify what is being described in the subtitle text: a character action, historical scene, feeling, concept, process, place, or personal moment.
  - CRITICAL - NARRATIVE CHARACTERS VS PRESENTERS (HOSTS):
    - "Presenter/Host": This is the virtual speaker (e.g. a modern tech presenter, health mentor, or coach at a desk). In FACELESS MODE, the Presenter/Host is completely BANNED. Never show a presenter reacting, pointing, or speaking to the camera in home studio environments.
    - "Narrative Characters": These are historical, epic, or fictional figures described in the story (e.g., "Fulgrim", "The Emperor", "soldiers", "knights", "primarchs"). In FACELESS MODE, if the subtitle text describes actions, thoughts, or settings involving these story characters, you MUST actively visualize these characters in cinematic, dramatic, and high-fidelity action or environmental compositions aligned with the visual style! Never drop them.
  - CRITICAL - ANTI-LITERAL METAPHOR GUARD:
    - If the subtitle text uses corporate, technical, or structural metaphors (e.g. "machine", "gears", "mechanism", "cog", "architecture", "system", "vector", "corrosion"): Do NOT visualize these terms literally. NEVER generate generic factory cogs, mechanical brass gears, industrial robot arms, green digital matrix grids, or circuit boards unless the script is literally about mechanical clocks or computers.
    - Instead, translate these metaphors into grand, atmospheric visual symbols aligned with the aesthetic theme. For example, in a dark sci-fi/gothic (Grimdark) setting, "machine/system/architecture" should be visualized as colossal gothic spaceships, decaying cathedral structures in deep space, stone gargoyles crumbling under ash, or armor of ancient metal corroding under volumetric light.
  - If the text describes a TECHNICAL, SCIENTIFIC, or ABSTRACT concept WITHOUT story characters: ALWAYS use 3D technical animation. The prompt must begin with "3D technical animation of".
  - For live-action / cinematic prompts WITH narrative characters or environments: begin with "Realistic cinematic video of" or "Cinematic epic shot of" and describe the scene with dynamic details. Always add ambient sound only, no dialogue, no voice-over.
  - For 3D/abstract prompts: begin with "3D technical animation of" and visualize the concept directly. Add ambient sound only, no dialogue, no voice-over.
  - For video prompts, include enquadramento e câmera details (e.g. volumetric dust, cinematic lighting, shallow depth of field, panning, macro shot, dramatic backlight).
- asset == "image":
  - Always create a realistic still image prompt.
  - The image must directly and metaphorically illustrate the SPECIFIC concept, story character, object, emotion, or situation described in the subtitle text.
  - Follow the same NARRATIVE CHARACTER and ANTI-LITERAL rules as the video prompts.
  - The prompt must begin with "Photorealistic still image of".
- asset == "text":
  - Read the current subtitle text provided as context.
  - Determine the emotion, urgency, and tone of what is being said.
  - Based on your analysis, choose exactly ONE visual style from the 'Available Text Styles' list provided below that best matches the tone.
  - Your prompt MUST ONLY be the EXACT name of the chosen style as written in the list. Do not add any other words.
  - Vary your choices across the sequence to create visual diversity. Do not use the same style for every text entry.
  - Style guidance: Neon = tech/hacker/matrix energy. Clean = calm/reflective/minimal. Impact = urgency/alarm/strong statements. Frost = futuristic/analytical/cool. Gold = elegant/important/prestigious.
- asset == "hyperframe":
  - Check the requested Video Format:
    - If the format is NOT Faceless (e.g. Avatar or Vlog mode):
      - The template_name specifies the layout schema required.
      - Do NOT generate a visual prompt. Instead, extract the key message from the subtitle text and return structured JSON.
      - Return the JSON inside the 'texto_adicional' property. The 'prompt' property must echo just the template_name.
      - CRITICAL: The HTML templates read the fields 'title', 'subtitle', and 'metrics' from the JSON. Use exactly these keys.
      - ALL schemas must also include a 'background_prompt' field: a 1-sentence English image generation prompt for the background behind the overlay. This prompt MUST be aligned with the 'Channel Visual Identity' if provided, otherwise use a dark cinematic default. The background must be dark, have no readable text, and leave the overlay legible.
      - CRITICAL TEXT RULES (apply to ALL schemas):
        - NEVER copy the subtitle text verbatim into any field. Always reinterpret the idea in your own words.
        - 'title' must be a short, punchy phrase (3-7 words max) that captures the CORE IDEA — not the literal subtitle.
        - 'subtitle' must be a COMPLETE, standalone sentence that ADDS CONTEXT or REPHRASES the idea as a synonym. It must never be the same sentence as the subtitle text, never a fragment, and never end mid-word. Write at least one full verb-subject clause.
        - 'metrics' must be a specific KPI, number, or "—" if no data is present. Never leave it empty.
        - All text fields must be short enough to fit in one line of an overlay (title: max 40 chars, subtitle: max 80 chars, metrics: max 20 chars).
      - Schemas (use exact field names shown) (Only applies to Avatar/Vlog modes):
        - hf_break:       {"title": "2-3 word punchy idea", "subtitle": "—", "metrics": "—", "background_prompt": "..."}
        - hf_face_top:    {"title": "Impactful phrase max 6 words", "subtitle": "Complete context sentence in own words", "metrics": "KPI or —", "background_prompt": "..."}
        - hf_focus:       {"title": "Focus keyword or short phrase", "subtitle": "Complete supporting sentence rephrasing the idea", "metrics": "— or KPI", "background_prompt": "..."}
        - hf_double:      {"title": "Main concept (noun phrase)", "subtitle": "Complete analytical sentence in own words", "metrics": "— or data", "background_prompt": "..."}
        - hf_floating:    {"title": "Central keyword", "subtitle": "Complete side-point sentence as synonym", "metrics": "Side impact or —", "background_prompt": "..."}
        - hf_vertical:    {"title": "2-3 word insight", "subtitle": "Complete context sentence rephrasing the idea", "metrics": "— or data", "background_prompt": "..."}
        - hf_holo:        {"title": "Insight headline (noun phrase)", "subtitle": "Complete analysis sentence in own words", "metrics": "Numeric data or —", "background_prompt": "..."}
        - hf_documentary: {"title": "Investigation theme", "subtitle": "Complete context sentence as synonym phrase", "metrics": "Verified fact or —", "background_prompt": "..."}
        - hf_dynamic:     {"title": "Punchy headline", "subtitle": "— or complete short support sentence", "metrics": "—", "background_prompt": "..."}
        - hf_face_bottom: {"title": "Analytical headline (noun phrase)", "subtitle": "Complete detail sentence in own words", "metrics": "Measurable result or —", "background_prompt": "..."}
        - hf_x_post:       {"title": "Author Name / Channel", "subtitle": "Twitter @handle", "text": "Short punchy tweet message (1-2 sentences)", "metrics": "Likes count (e.g. 10.5K) or —", "background_prompt": "..."}
        - hf_notification: {"title": "App Name or Alert Type", "subtitle": "Notification bubble body message", "metrics": "Time (e.g. 'agora', '2m') or —", "background_prompt": "..."}
        - hf_world_map:    {"title": "Global network headline", "subtitle": "Short description of global/geographical connection", "metrics": "KPI percentage (e.g. '+320%') or —", "background_prompt": "..."}
        - hf_data_chart:   {"title": "Data / Growth title", "subtitle": "Analytical sentence describing the metric trend", "metrics": "Key metric value (e.g. '94.2% Eficiência') or —", "background_prompt": "..."}
        - hf_reddit:       {"title": "Subreddit / Community", "subtitle": "Thread Title or Topic", "text": "Reddit comment body (1-2 sentences)", "metrics": "Upvote count (e.g. 5.2K) or —", "background_prompt": "..."}
        - hf_spotify:      {"title": "Track Title", "subtitle": "Artist Name", "metrics": "Time duration (e.g. '3:45') or —", "background_prompt": "..."}
        - hf_code_terminal: {"title": "Terminal Title (e.g. bash, zsh, node)", "subtitle": "Directory path or —", "text": "Command or code segment to be typed out", "metrics": "—", "background_prompt": "..."}
        - hf_quote:        {"title": "Author of the Quote", "subtitle": "Description or role of author (or —)", "text": "The quotation body sentence", "metrics": "—", "background_prompt": "..."}
      - Write all title/subtitle/metrics text in the exact language of the subtitle (usually Portuguese). Write background_prompt in English only.
    - If the format is FACELESS:
      - CRITICAL OVERRIDE: Do NOT return layout JSON or any static HTML template overlay fields (do NOT output 'texto_adicional', keep it empty/undefined).
      - Instead, generate a highly detailed, cinematic, kinetic and professional video generation prompt in the 'prompt' property.
      - The prompt MUST be in English, highly detailed, and match the theme of the subtitle context.
      - Every prompt MUST start exactly with the HeyGen official tag: "📷HyperFrames by HeyGen" (or "use 📷HyperFrames by HeyGen and Image Gen if you need it for assets or like png images of assets without backround to make..." if it involves isolated/cutout graphical assets).
      - Choose and adapt one of these 10 premium blueprints based on the theme of the subtitle:
        1. "Visualização de crescimento / Finanças": "📷HyperFrames by HeyGen. Create a 7-second Apple-style motion graphic. A progress bar fills smoothly from 0% to 100%. Clean background (dark or white), bold typography, subtle shadows, premium motion design. As the bar reaches 100%, a green checkmark appears with a soft flash. Modern YouTube B-roll style, 1920x1080, 60fps." (Adapt values, background, text to context).
        2. "Timeline histórica animada": "📷HyperFrames by HeyGen. Create a cinematic historical timeline animation. A horizontal timeline draws itself across the screen. Key dates appear one by one with smooth Apple-style motion graphics. Camera slowly tracks along the timeline while dates and events fade in. Premium documentary style, dark background, glowing accents, 7 seconds." (Adapt exact dates/events to context).
        3. "Fluxo de dinheiro / Economia": "📷HyperFrames by HeyGen. Create a clean motion graphic showing money flowing from multiple users into a central company/concept icon. Animated arrows connect users to the business. Numbers increase in real time. Modern fintech style, Apple presentation quality, subtle zoom movement, 1920x1080, 60fps." (Adapt icon and background to context).
        4. "Arquitetura de sistemas / Fluxo técnico": "📷HyperFrames by HeyGen. Create a professional software architecture animation. Database, backend server, API gateway, and mobile app (or equivalent technology) icons appear one by one. Animated connection lines show data flow between components. Camera slowly zooms in. Clean dark theme, blue neon accents, enterprise SaaS style, 8 seconds." (Adapt names and icons to context).
        5. "Zoom em código / Programação": "📷HyperFrames by HeyGen. Create a cinematic code visualization. Camera slowly zooms into a dark code editor. Specific lines of code become highlighted with glowing effects. A bug icon appears, then transforms into a green checkmark after the code updates. Modern developer aesthetic, YouTube documentary style." (Adapt code lines and topic to context).
        6. "Anatomia simplificada / Saúde": "📷HyperFrames by HeyGen. Create a realistic medical visualization. A semi-transparent human body/organ (or specific body part) appears. The camera zooms in. Neural pathways or pathways light up in blue and gold. Labels animate in with premium typography. Documentary style, medical animation quality, 7 seconds." (Adapt organ, path, and text to context).
        7. "Comparação antes e depois": "📷HyperFrames by HeyGen. Create a split-screen transformation animation. Left side labeled BEFORE, right side labeled AFTER (or equivalents). Camera slowly pushes forward while metrics increase on the right side. Clean typography, premium YouTube educational style, 1920x1080." (Adapt labels and metrics to context).
        8. "Doodle explainer / Desenho manual": "📷HyperFrames by HeyGen. Create a hand-drawn doodle animation on a whiteboard/blackboard. Sketches appear as if drawn by hand in real time. Arrows, circles, and notes animate naturally. Educational YouTube style, smooth motion, 60fps." (Adapt doodle sketches and concept to context).
        9. "Dashboard de IA / Interface futurista": "📷HyperFrames by HeyGen. Create a futuristic AI dashboard animation. Floating panels show analytics, charts, and neural network visualizations. Camera slowly pans across the interface. Blue and cyan accents, cinematic lighting, modern AI startup aesthetic." (Adapt charts/data to context).
        10. "Mapa mundial com conexões / Geopolítica": "📷HyperFrames by HeyGen. Create a realistic satellite world map. Animated connection lines travel between major cities/locations around the globe. The camera smoothly zooms and rotates. Locations highlight with glowing markers and labels. Documentary-grade animation, premium motion graphics." (Adapt cities and markers to context).

Context rules:
- Use the current subtitle text as the main source of meaning. Interpret the ideas, actions, specific nouns, and deeper context of the narrative, and represent them visually in the prompt. Do not use generic scenes or repetitive placeholders.
- Use previous and next subtitle lines only to disambiguate.
- Avoid repeating the line literally.

- Prefer concrete subjects, environments, actions, materials, and mood.
- If 'Channel Visual Identity' is provided, align the visual style, atmosphere, and shot types with it.
- If 'Video Context' is provided, use it to inform the specific theme and visual direction of ALL prompts in this batch.
- If 'Visual Identity and Aesthetic Style reference' is provided, you MUST strictly apply this aesthetic direction, color palette, lighting, and thematic atmosphere to EVERY video and image prompt. Integrate these style elements seamlessly.
- CONSISTENT CHARACTERS BRACKET SYSTEM:
  - If a list of 'Consistent Characters' (Narrative Cast) is provided, scan the subtitle text. If the subtitle references any character by name (or clear pronoun/role), you MUST represent them in the prompt by writing their name in brackets, e.g. "[Fulgrim]" or "[The Emperor]".
  - Do NOT write out their full physical description in the prompt. The compiler will swap the brackets with their description later. Just output the short tag like "[Fulgrim] looking distraught" or "Close-up shot of [Fulgrim] drawing his glowing purple sword".
  - Only use character names from the provided Cast list in brackets. If a character is described but is NOT in the Cast list, describe them normally.
  - In FACELESS MODE, virtual presenters/hosts speaking to the camera are completely banned, but story characters from the Cast list (e.g. "[Fulgrim]") are welcome and must be visualized in action sequences or environmental scenes in brackets!
`.trim();

interface PromptBatchItem {
  row_number: number;
  asset: 'video' | 'image' | 'text' | 'hyperframe';
  template_name?: string;
  text: string;
  start_time: string;
  end_time: string;
  duration_seconds: number;
  previous_text: string;
  next_text: string;
}

interface PromptResponseShape {
  prompts?: Array<{
    row_number?: number;
    prompt?: string;
    texto_adicional?: any;
  }>;
}

interface CharacterProfileInput {
  mode?: 'male' | 'female' | 'custom';
  customDescription?: string;
  projectName?: string;
  videoFormat?: 'avatar' | 'faceless' | 'vlog';
}

const resolveCharacterProfile = (input?: CharacterProfileInput | null) => {
  const mode = input?.mode === 'female' || input?.mode === 'custom' ? input.mode : 'male';
  const customDescription = String(input?.customDescription || '').replace(/\s+/g, ' ').trim();

  if (mode === 'custom' && customDescription) {
    return customDescription;
  }

  const projectName = String(input?.projectName || '').trim();
  const videoFormat = input?.videoFormat || 'avatar';
  const isDevZen = projectName.toLowerCase().includes('dev') || projectName.toLowerCase().includes('tech');
  const isMetabolismo = projectName.toLowerCase().includes('metabolismo') || projectName.toLowerCase().includes('saude') || projectName.toLowerCase().includes('longevidade') || projectName.toLowerCase().includes('ouro');

  if (isDevZen) {
    if (videoFormat === 'vlog') {
      return mode === 'female'
        ? 'same recurring Brazilian female field researcher and software architect in her early 30s, intelligent and curious expression, wearing casual techwear travel jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie'
        : 'same recurring Brazilian male field researcher and software engineer in his early 30s, intelligent and curious expression, wearing casual techwear travel jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie';
    } else {
      return mode === 'female'
        ? 'same recurring Brazilian female senior software architect in her early 40s, focused expression, subtle signs of fatigue, modern dark home office, premium casual techwear'
        : 'same recurring Brazilian male senior software architect in his early 40s, focused expression, subtle signs of fatigue, modern dark home office, premium casual techwear';
    }
  }

  if (isMetabolismo) {
    if (videoFormat === 'vlog') {
      return mode === 'female'
        ? 'same recurring Brazilian female health mentor and longevity explorer in her late 60s, radiant skin, elegant active expression, wearing an organic linen travel shirt, recording an educational vlog selfie in the natural or historical setting'
        : 'same recurring Brazilian male health educator and longevity explorer in his late 60s, elegant active expression, wearing an organic linen travel shirt, recording an educational vlog selfie in the natural or historical setting';
    } else {
      return mode === 'female'
        ? 'same recurring Brazilian female health mentor in her late 60s, radiant skin, vital active expression, elegant look, modern minimalist home office with organic textures and soft sunlight, wearing elegant natural fabrics'
        : 'same recurring Brazilian male health mentor in his late 60s, healthy vital expression, elegant look, modern minimalist home office with natural wood and plants, soft lighting';
    }
  }

  // Generic fallback
  if (videoFormat === 'vlog') {
    return mode === 'female'
      ? 'same recurring Brazilian female field researcher and didactic educator in her early 30s, intelligent and curious expression, wearing a brown canvas explorer jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie'
      : 'same recurring Brazilian male field researcher and didactic educator in his early 30s, intelligent and curious expression, wearing a brown canvas explorer jacket, standing directly in the historical setting, recording a high-quality educational vlog selfie';
  } else {
    return mode === 'female'
      ? 'same recurring Brazilian female presenter in her early 30s, intelligent and friendly expression, modern dark home studio, professional attire'
      : 'same recurring Brazilian male presenter in his early 30s, intelligent and friendly expression, modern dark home studio, professional attire';
  }
};

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const buildPromptItems = (rows: SrtAssetRow[]) =>
  rows.flatMap((row, index) => {
    if (!SUPPORTED_PROMPT_ASSETS.has(normalizeAssetType(row.asset))) return [];

    const previousText = rows[index - 1]?.texto?.trim() || '';
    const nextText = rows[index + 1]?.texto?.trim() || '';
    const durationSeconds = Number(((parseSrtTimeToMs(row.endTime) - parseSrtTimeToMs(row.startTime)) / 1000).toFixed(3));

    return [{
      row_number: row.rowNumber,
      asset: normalizeAssetType(row.asset) === 'texto' ? ('text' as const) : (normalizeAssetType(row.asset) === 'hyperframe' ? ('hyperframe' as const) : (normalizeAssetType(row.asset) === 'vídeo' ? ('video' as const) : ('image' as const))),
      template_name: normalizeAssetType(row.asset) === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
      text: (row.texto || '').trim(),
      start_time: row.startTime,
      end_time: row.endTime,
      duration_seconds: durationSeconds,
      previous_text: previousText,
      next_text: nextText,
    }];
  });

const parseJsonResponse = (rawContent: string): PromptResponseShape => {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fencedMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      throw new Error('A IA nao retornou JSON valido para os prompts do SRT.');
    }
    return JSON.parse(fencedMatch[0]);
  }
};

// Map also tracks which rows used a fallback so the UI can offer regeneration
const fallbackRows = new Set<number>();

const validatePromptBatch = (items: PromptBatchItem[], payload: PromptResponseShape) => {
  const expectedRows = new Set(items.map((item) => item.row_number));
  const promptMap = new Map<number, { prompt: string; texto_adicional?: any }>();

  for (const promptItem of payload.prompts || []) {
    const rowNumber = Number(promptItem?.row_number);
    const prompt = sanitizePrompt(promptItem?.prompt || '');
    if (!expectedRows.has(rowNumber) || (!prompt && promptItem.texto_adicional === undefined)) continue;
    promptMap.set(rowNumber, { prompt, texto_adicional: promptItem.texto_adicional });
  }

  // If the AI returned fewer prompts than expected, fill missing ones with a safe fallback
  // instead of crashing the entire pipeline for a partial failure
  if (promptMap.size !== expectedRows.size) {
    console.warn(
      `[SRT Pipeline] ⚠️ AI returned ${promptMap.size}/${expectedRows.size} prompts. Filling missing with fallback.`
    );
    for (const item of items) {
      if (!promptMap.has(item.row_number)) {
        const fallback =
          item.asset === 'text'
            ? 'Clean'
            : item.asset === 'hyperframe'
            ? item.template_name || 'hf_break'
            : item.asset === 'image'
            ? `Photorealistic still image of ${item.text.slice(0, 60).trim()}.`
            : `3D technical animation of ${item.text.slice(0, 60).trim()}. Ambient sound only, no dialogue, no voice-over.`;
        promptMap.set(item.row_number, { prompt: fallback });
        fallbackRows.add(item.row_number); // 🏷️ Track for UI feedback
      }
    }
  }

  return promptMap;
};

const enforceVideoPromptGuards = (prompt: string, _characterDescription: string) => {
  // The character is NEVER force-injected here.
  // The AI decides contextually whether the character belongs in the scene.
  // This function only ensures the mandatory audio cue is present.
  const normalized = sanitizePrompt(prompt);
  const hasAmbientCue = /ambient sound only|no dialogue|no voice-over|no voiceover/i.test(normalized);
  const audioClause = hasAmbientCue ? '' : ' Ambient sound only, no dialogue, no voice-over.';
  return sanitizePrompt(`${normalized}${audioClause}`);
};

const generateBatchWithOpenAI = async ({
  apiKey,
  model,
  batchItems,
  characterDescription,
  textStyles,
  visualIdentity,
  videoContext,
  facelessHint,
  videoFormat,
  visualBlueprint,
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
  textStyles: string;
  visualIdentity: string;
  videoContext: string;
  facelessHint: string;
  videoFormat?: string;
  visualBlueprint?: { setting: string; cast: Array<{ name: string; description: string }> } | null;
}) => {
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      { role: 'system', content: SYSTEM_INSTRUCTIONS },
      {
        role: 'user',
        content: [
          'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"...", "texto_adicional":{}}]}.',
          'Include exactly one prompt per row_number.',
          videoFormat === 'faceless'
            ? `Visual Identity and Aesthetic Style reference (APPLY this visual style, atmosphere, lighting, and art direction to ALL video and image prompts in this batch): ${characterDescription}`
            : `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment): ${characterDescription}`,
          visualBlueprint?.setting ? `Visual Art Direction & Setting Reference (APPLY this setting/art style to ALL video and image prompts): ${visualBlueprint.setting}` : '',
          visualBlueprint?.cast && visualBlueprint.cast.length > 0
            ? `Consistent Characters (Narrative Cast) - When any character listed here is mentioned, you MUST represent them using their name in brackets [Character Name], e.g. [Fulgrim] doing something: \n${JSON.stringify(visualBlueprint.cast, null, 2)}`
            : '',
          `Available Text Styles: ${textStyles}`,
          visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
          videoContext ? `Video Context for this batch: ${videoContext}` : '',
          facelessHint || 'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
          'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
          JSON.stringify({ character_reference_optional: characterDescription, items: batchItems }, null, 2),
        ].filter(Boolean).join('\n\n'),
      },
    ],
    response_format: { type: 'json_object' },
  };

  if (!isReasoningModel(model)) {
    requestBody.temperature = 0.7;
  }

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(requestBody),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao gerar prompts com OpenAI.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu sem conteudo para o lote de prompts.');
  return parseJsonResponse(content);
};

const generateBatchWithGemini = async ({
  apiKey,
  model,
  batchItems,
  characterDescription,
  textStyles,
  visualIdentity,
  videoContext,
  facelessHint,
  videoFormat,
  visualBlueprint,
}: {
  apiKey: string;
  model: string;
  batchItems: PromptBatchItem[];
  characterDescription: string;
  textStyles: string;
  visualIdentity: string;
  videoContext: string;
  facelessHint: string;
  videoFormat?: string;
  visualBlueprint?: { setting: string; cast: Array<{ name: string; description: string }> } | null;
}) => {
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [
              SYSTEM_INSTRUCTIONS,
              'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"...", "texto_adicional":{}}]}.',
              'Include exactly one prompt per row_number.',
              videoFormat === 'faceless'
                ? `Visual Identity and Aesthetic Style reference (APPLY this visual style, atmosphere, lighting, and art direction to ALL video and image prompts in this batch): ${characterDescription}`
                : `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment): ${characterDescription}`,
              visualBlueprint?.setting ? `Visual Art Direction & Setting Reference (APPLY this setting/art style to ALL video and image prompts): ${visualBlueprint.setting}` : '',
              visualBlueprint?.cast && visualBlueprint.cast.length > 0
                ? `Consistent Characters (Narrative Cast) - When any character listed here is mentioned, you MUST represent them using their name in brackets [Character Name], e.g. [Fulgrim] doing something: \n${JSON.stringify(visualBlueprint.cast, null, 2)}`
                : '',
              `Available Text Styles: ${textStyles}`,
              visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
              videoContext ? `Video Context for this batch: ${videoContext}` : '',
              facelessHint || 'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
              'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
              JSON.stringify({ character_reference_optional: characterDescription, items: batchItems }, null, 2),
            ].filter(Boolean).join('\n\n'),
          }],
        }],
        generationConfig: {
          temperature: 0.7,
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao gerar prompts com Gemini.');
  }

  const content = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '';
  if (!content) throw new Error('O Gemini respondeu sem conteudo para o lote de prompts.');
  return parseJsonResponse(content);
};

const generatePromptMap = async ({
  engine,
  model,
  apiKey,
  projectConfig,
  items,
  characterDescription,
  videoContext,
  videoFormat,
  visualBlueprint,
}: {
  engine: 'openai' | 'gemini';
  model: string;
  apiKey: string;
  projectConfig?: Record<string, any>;
  items: PromptBatchItem[];
  characterDescription: string;
  videoContext?: string;
  videoFormat?: 'avatar' | 'faceless' | 'vlog';
  visualBlueprint?: { setting: string; cast: Array<{ name: string; description: string }> } | null;
}) => {
  const resolvedModel = engine === 'gemini'
    ? projectConfig?.gemini_api_model || resolveModel(model)
    : projectConfig?.openai_api_model || resolveModel(model);

  // Reasoning models handle smaller batches more reliably
  const batchSize = isReasoningModel(resolvedModel) ? BATCH_SIZE_REASONING : BATCH_SIZE_DEFAULT;

  const builtInStyles = 'Neon, Clean, Impact, Frost, Gold';
  const projectStyles = projectConfig?.editing_sop?.text_styles || projectConfig?.text_styles || '';
  const textStyles = projectStyles ? `${projectStyles}, ${builtInStyles}` : builtInStyles;

  const visualIdentity = projectConfig?.editing_sop?.visual_identity || '';
  const promptMap = new Map<number, string>();
  const textoAdicionalMap = new Map<number, any>();

  // Dynamic hint based on video format (Faceless, Vlog, or Avatar)
  const facelessHint = videoFormat === 'faceless'
    ? 'FACELESS VIDEO MODE: Banish all modern studio presenters, vloggers, or home office hosts speaking to the camera. However, if the subtitle describes actions or figures of the historical narrative (e.g. Fulgrim, soldiers, knights), you MUST actively represent these characters in your visual prompts in brackets, e.g. [Character Name]!'
    : videoFormat === 'vlog'
    ? `VLOG VIDEO MODE: The video is a dynamic educational vlog (hand-held camera, selfie style). For video or image prompts involving the presenter, ALWAYS place the recurring character inside the setting. Write the visual prompt in English as a handheld selfie video: "First-person vlog selfie video of ${characterDescription}, looking at the camera, talking dynamically, realistic handheld camera movement (shaky cam, selfie angle), [insert historical/situational background and dynamic actions described in the subtitle], atmospheric lighting." Adjust facial expressions (e.g. amazed, concerned, smiling, intense) to match the emotion of the subtitle text.`
    : '';

  for (const batch of chunk(items, batchSize)) {
    const payload = engine === 'gemini'
      ? await generateBatchWithGemini({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '', facelessHint, videoFormat, visualBlueprint })
      : await generateBatchWithOpenAI({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '', facelessHint, videoFormat, visualBlueprint });

    const validatedBatch = validatePromptBatch(batch, payload);
    validatedBatch.forEach((val, rowNumber) => {
      promptMap.set(rowNumber, val.prompt);
      if (val.texto_adicional) {
        textoAdicionalMap.set(rowNumber, val.texto_adicional);
      }
    });
  }

  return { promptMap, textoAdicionalMap };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const engine = body?.engine === 'gemini' ? 'gemini' : 'openai';
    const model = String(body?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1'));
    const projectConfig = body?.projectConfig || {};
    const videoFormat: 'avatar' | 'faceless' | 'vlog' = body?.videoFormat === 'vlog' ? 'vlog' : (body?.videoFormat === 'faceless' ? 'faceless' : 'avatar');
    const visualBlueprint = body?.visualBlueprint || null;
    const characterDescription = resolveCharacterProfile({
      ...(body?.characterProfile || {}),
      projectName: projectConfig?.project_name || '',
      videoFormat,
    });
    const videoContext = String(body?.videoContext || '').trim();
    
    // Batch Mode Branch
    if (Array.isArray(body?.batchItems) && body.batchItems.length > 0) {
      const apiKey = String(
        body?.apiKeyOverwrite || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || ''
      ).trim();

      if (!apiKey) {
        return NextResponse.json({ error: `API Key para ${engine} nao configurada.` }, { status: 401 });
      }

      const promptItems = body.batchItems as PromptBatchItem[];
      const { promptMap, textoAdicionalMap } = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        videoContext,
        videoFormat,
        visualBlueprint,
      });

      const prompts = promptItems.map((item) => ({
        rowNumber: item.row_number,
        prompt: item.asset === 'video'
          ? enforceVideoPromptGuards(promptMap.get(item.row_number) || '', characterDescription)
          : promptMap.get(item.row_number) || '',
        texto_adicional: textoAdicionalMap.get(item.row_number),
        isFallback: fallbackRows.has(item.row_number), // 🏷️ Let UI know which rows need regeneration
      }));

      return NextResponse.json({ prompts, hasFallbacks: fallbackRows.size > 0 });
    }

    // Legacy / Full-File Mode Branch
    const srtText = String(body?.srtText || '').trim();
    if (!srtText) {
      return NextResponse.json({ error: 'O conteudo do .srt ou o array batchItems e obrigatorio.' }, { status: 400 });
    }

    const parsedRows = parseSrtToRows(srtText);
    if (!parsedRows.length) {
      return NextResponse.json({ error: 'Nao foi possivel extrair blocos validos do .srt enviado.' }, { status: 400 });
    }

    const assetRows      = applyAssetRules(parsedRows, videoFormat, srtText);
    const cooledRows     = enforceTextoCooldown(assetRows);
    const hfRows         = applyHyperframeRules(cooledRows, videoFormat);
    const excludedRows   = applyHyperframeExclusionZone(hfRows);
    const finalRows      = finalizeFacelessRows(excludedRows, videoFormat);
    const promptItems    = buildPromptItems(finalRows);

    let rowsWithPrompts = finalRows;
    if (promptItems.length > 0) {
      const apiKey = String(
        body?.apiKeyOverwrite
        || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY)
        || ''
      ).trim();

      if (!apiKey) {
        return NextResponse.json(
          { error: `API Key para ${engine} nao configurada. Defina em Ajustes Globais ou no ambiente.` },
          { status: 401 }
        );
      }

      const { promptMap, textoAdicionalMap } = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        videoContext,
        videoFormat,
        visualBlueprint,
      });

      rowsWithPrompts = finalRows.map((row) => ({
        ...row,
        prompt: normalizeAssetType(row.asset) === 'vídeo'
          ? enforceVideoPromptGuards(promptMap.get(row.rowNumber) || row.prompt, characterDescription)
          : promptMap.get(row.rowNumber) || row.prompt,
        texto_adicional: textoAdicionalMap.get(row.rowNumber),
      }));
    }

    return NextResponse.json(buildPipelineResult(rowsWithPrompts));
  } catch (error) {
    console.error('[SRT Pipeline] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao processar o SRT anexado.' },
      { status: 500 }
    );
  }
}
