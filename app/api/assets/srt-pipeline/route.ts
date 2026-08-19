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
  type AssetAllocationMode,
  enforceTextoCooldown,
  applyHyperframeRules,
  applyHyperframeExclusionZone,
  finalizeFacelessRows,
  cleanHeyGenPrefixes,
  parseDnaBlocks,
  getProtagonistReplacement,
  sanitizeProperNames,
} from '@/lib/srt-asset-pipeline';

const BATCH_SIZE_DEFAULT = 10;
const BATCH_SIZE_REASONING = 6; // Reasoning models handle smaller batches more reliably
const SUPPORTED_PROMPT_ASSETS = new Set(['vídeo', 'imagem', 'texto', 'hyperframe']);
export const maxDuration = 300;
const getLanguageDirectives = (lang?: string) => {
  const l = (lang || 'Português').trim();
  if (l === 'English') {
    return {
      name: 'English',
      code: 'English',
      units: 'US Imperial system (e.g. Fahrenheit °F, miles, feet, inches, pounds, ounces, gallons, $ USD)'
    };
  }
  if (l === 'Español' || l === 'Spanish') {
    return {
      name: 'Spanish',
      code: 'Spanish',
      units: 'Metric system (e.g. Celsius °C, kilómetros, metros, gramos, kilogramos, litros, € / $)'
    };
  }
  if (l === 'Português' || l === 'Portuguese') {
    return {
      name: 'Brazilian Portuguese',
      code: 'PT-BR',
      units: 'Metric system (e.g. Celsius °C, quilômetros, metros, gramas, quilogramas, litros, R$ Reais)'
    };
  }
  return {
    name: l,
    code: l,
    units: 'Metric system (e.g. Celsius °C, kilometers, meters, grams, kilograms, liters)'
  };
};

const buildLanguageInstructions = (channelLanguage?: string) => {
  const { name: langName, code: langCode, units: langUnits } = getLanguageDirectives(channelLanguage);
  
  return `
================================================================================
CRITICAL MANDATORY INSTRUCTION - LANGUAGE OF ALL ON-SCREEN VISIBLE TEXT:
The target channel language configured by the user is: ${langName.toUpperCase()} (${langCode}).

1. The scenic/environmental prompt description itself MUST be in English (for AI image/video generators Midjourney, Leonardo, Runway, Kling, Luma, Stable Diffusion, etc.).
2. HOWEVER, ANY AND ALL VISIBLE ON-SCREEN TEXT, WORDS, HEADINGS, LABELS, CLIPBOARDS, INVOICES, ESTIMATES, SIGNS, WARNING BOARDS, NEWSPAPER HEADLINES, SPEECH BUBBLES, WHITEBOARDS, PRICE TAGS, PRODUCT PACKAGING, OR ON-SCREEN GRAPHICS VISIBLE IN THE SCENE MUST BE EXPLICITLY WRITTEN IN ${langName.toUpperCase()} INSIDE DOUBLE QUOTES!
3. STRICT PROHIBITION: NEVER, UNDER ANY CIRCUMSTANCE, WRITE ENGLISH TEXT INSIDE QUOTES FOR VISIBLE ON-SCREEN ASSETS (unless the channel language is explicitly English).
   - ❌ BAD (English on-screen text for Portuguese channel):
     - clipboard with text reading "STEERING RACK REPLACEMENT R$ 2.000"
     - red banner with bold text reading "SUSPENSION SYSTEM CONDEMNED! COMPLETE SHOCK ABSORBER FAILURE DETECTED. ALL COMPONENTS REQUIRE IMMEDIATE REPLACEMENT. WARNING: ESTIMATE PREPARED."
     - speech bubble reading "LOOK HERE! THIS METAL SHIELD IS DENTED"
     - document with text reading "ESTIMATE - VEHICLE REPAIR"
   - ✅ GOOD (Explicitly translated to ${langName.toUpperCase()}):
     - clipboard with text reading "ORÇAMENTO: TROCA DA CAIXA DE DIREÇÃO R$ 2.000"
     - red banner with bold text reading "SISTEMA DE SUSPENSÃO CONDENADO! REPARO IMEDIATO NECESSÁRIO"
     - speech bubble reading "OLHE AQUI! ESTE PROTETOR DE METAL ESTÁ AMASSADO"
     - document with text reading "ORÇAMENTO - REVISÃO AUTOMOTIVA"
4. Whenever a character holds a paper, clipboard, diagnostic tool, phone screen, invoice, receipt, or when a sign or label appears in the scene, always write the visible text in ${langName.toUpperCase()} using the formula: with text reading "${langName.toUpperCase()} TEXT HERE".
5. UNITS OF MEASUREMENT & CURRENCY: Use ${langUnits}. If currency or prices appear, format them appropriately (e.g. for Portuguese use R$ or Reais).
================================================================================`.trim();
};


const SYSTEM_INSTRUCTIONS = `
You generate production-ready visual prompts for subtitle-driven videos.

Return only valid JSON.
Write every visual prompt (video, image) in English (except for text styles which should match the provided list). Hyperframe title/subtitle/metrics fields must always be written in the exact same language as the subtitle text — never in English unless the subtitle itself is in English.

CRITICAL RULE - ON-SCREEN WRITTEN TEXT LANGUAGE (NO IMPLICIT TEXT):
Whenever a visual prompt describes or implies any written information, text, labels, chart axes, diagrams, slide titles, list points, or headings to be visible inside the video or image:
1. You MUST NEVER leave the text implicit (do NOT write generic prompts like "a card showing claims" or "a chart of study results" without specifying the labels). If the text is left implicit in English, the image/video generator will render English words or gibberish (e.g. "LADDED CLAIMS").
2. Instead, you MUST explicitly specify the text to be rendered on screen inside double quotes, and that text MUST be written exactly in the language of the script (usually Portuguese).
3. Example of BAD implicit prompt: "a centered rounded card showing a polished marketing storyboard of layered claims"
4. Example of GOOD explicit prompt: "a centered rounded card showing a polished marketing storyboard with bold text reading 'ALEGAÇÕES ACUMULADAS'"
5. Always keep the background and scenery description in English, but force all on-screen written text to be in the script's language by using the phrase: "text reading '...'" or "label reading '...'" or "title reading '...'".
Do not include markdown, subtitles, on-screen text, logos, watermarks, or UI overlays.
Keep prompts concise, vivid, and generator-friendly.
Use one sentence per prompt, usually between 18 and 40 words.

CRITICAL RULE: The subtitle text is the PRIMARY source of meaning. Every prompt MUST directly visualize what is being said at that specific moment. Generic scenes are not acceptable.

DYNAMIC THEMATIC CONTEXT & VISUAL DIVERSITY:
1. Analyze the subtitle text along with the provided "videoContext" (which contains the title, theme, and outline of the script, such as cruise ships, Warhammer, medical health, business). You MUST dynamically adapt the environment, scenery, and metaphors to match this specific theme. Never use out-of-context generic imagery (e.g. do not show space marines for a medical video, nor medical clinics for a cruise ship video).
2. Classify each scene into one of the following scale categories based on the narration flow, enforcing strict character and camera boundaries:
   - "WIDE_ESTABLISHING": Grand landscape, exterior, panoramic, or establishing shot matching the theme (e.g., a colossal luxury cruise ship sailing the open ocean; a massive gothic spaceship in starry deep space; a serene mountain landscape at sunset). CRITICAL RESTRICTION: This category MUST NOT contain any named characters in brackets, any cast members, or any human figures. Focus purely on environment, scale, structure, or vehicles.
   - "PROCESS_MACRO": Close-up of dynamic processes, components, or mechanics matching the theme (e.g., fuel oil flowing; water molecules passing through filtration membranes; glowing micro-nodes on a motherboard). CRITICAL RESTRICTION: This category MUST NOT contain any named characters in brackets or human faces. Only anonymous hands wearing theme-appropriate gloves (e.g., industrial safety gloves, lab gloves) are permitted if they are actively performing a manual action (such as turning a valve or holding a beaker).
   - "SCHEMATIC": A clean 3D graphic rendering, isometric/orthographic technical blueprint, map, database diagram, or visual flow chart. CRITICAL RESTRICTION: This category MUST NOT contain any human characters, faces, or hands whatsoever. It must be a clean graphic asset.
   - "JUXTAPOSITION": A visual comparison or split-screen representing contrasting concepts (e.g., upper deck luxury pool with tourists versus the dark wet machinery deck with waste pipes underneath).
   - "NARRATIVE_CAST": Scenes focusing on a character from the cast performing actions or expressing emotion. This is the ONLY category allowed to feature cast characters in brackets, e.g. [Character Name].
3. DYNAMIC ENVIRONMENT & LIGHTING ROTATION: Do not repeat the same setting or lighting across consecutive prompts. Dynamically infer the script theme and compile a mental list of 6+ distinct environments and 4+ lighting conditions logical for that theme. Actively cycle through these environments (e.g., for a ship theme, switch between open sea, quayside, engine room, piping decks; for a tech theme, switch between server racks, microchip level, developer workstation) and lighting setups (e.g., late afternoon sun, clinical neon, sodium lamps, mist/vapor with warning lights, rain) to prevent visual repetition.
4. Keep visual pacing diverse. Do not repeat the same scene type or characters continuously. Use the theme's broader scenery to break monotony.

Rules for asset types:
- asset == "video":
  - First, identify what is being described in the subtitle text: a character action, historical scene, feeling, concept, process, place, or personal moment.
  - STRUCTURE FOR IMAGE-TO-VIDEO AND HIGH CONSISTENCY:
    - CRITICAL RULE: Every single video prompt MUST be completely self-contained and describe a detailed visual scene. Even if the subtitle text is a short phrase, a continuation of a prior sentence, or an abstract concept, you MUST NOT omit the scene's visual composition. You are STRICTLY FORBIDDEN from starting the prompt directly with "Motion and lock directive:" or skipping the first frame composition.
    - You must write the prompt in two distinct parts:
      1. THE FIRST FRAME COMPOSITION: Describe the static scene in detail (e.g. subject, objects, cards, text labels, setting, clothing, lighting, camera position, background).
      2. THE MOTION AND LOCK DIRECTIVE: Instruct the animation engine exactly what moves and what stays locked. End with this exact formula phrase: "Use the supplied image as the exact first frame and visual authority. Preserve its identity, anatomy, wardrobe, props, lighting, texture, spatial layout and geometry. Keep the visible world coherent; animate only the planned motion. [Insert specific camera motion or character movement here]. No other changes."
  - CINEMATIC CAMERA ENGINE RULES:
    - You must choose one of the following operations and declare it in the motion section:
      - "Camera locked": Position, lens, and frame remain completely static. Use this for high-speed subject action, extreme close-ups, or when a human face is performing, preventing facial distortion.
      - "Rack focus": Focus shifts between two clearly visible depth planes.
      - "Pan / Tilt / Zoom": Camera rotates or adjusts focal length from a fixed point (no translation parallax).
      - "Push / Pull / Track": Camera travels physically through space, creating natural 3D parallax. Only use this when there are distinct foreground, midground, and background layers.
  - CRITICAL - NARRATIVE CHARACTERS VS PRESENTERS (HOSTS):
    - "Presenter/Host": This is the virtual speaker (e.g. a modern tech presenter, health mentor, or coach at a desk).
      - In FACELESS MODE, the Presenter/Host is completely BANNED. Never show a presenter reacting, pointing, or speaking to the camera.
      - In AVATAR MODE, the Synthesized Avatar is already speaking on screen during 'avatar' parts. Therefore, in B-rolls (video/image assets), the presenter/host MUST NEVER be shown or visualized. Keep them out of B-roll prompts entirely and focus purely on setting/narrative/concepts. Only in VLOG mode can the presenter be shown in a handheld camera setup.
    - "Narrative Characters": These are historical, epic, or fictional figures described in the story (e.g., "Fulgrim", "The Emperor", "soldiers", "knights", "primarchs"). In FACELESS or AVATAR modes, if the subtitle text describes actions, thoughts, or settings involving these story characters, you MUST actively visualize these characters in cinematic, dramatic, and high-fidelity action or environmental compositions aligned with the visual style! Never drop them.
  - CRITICAL - CAST INJECTION THRESHOLD:
    - Banish the cast characters from WIDE_ESTABLISHING, PROCESS_MACRO, and SCHEMATIC scenes. Only use character brackets (e.g. [Character Name]) when the scene is classified as "NARRATIVE_CAST" or when the text explicitly describes a person's direct actions, feelings, decisions, or dialogue.
  - CRITICAL - ANTI-LITERAL METAPHOR GUARD:
    - If the subtitle text uses corporate, technical, or structural metaphors (e.g. "machine", "gears", "mechanism", "cog", "architecture", "system", "vector", "corrosion"): Do NOT visualize these terms literally. NEVER generate generic factory cogs, mechanical brass gears, industrial robot arms, green digital matrix grids, or circuit boards unless the script is literally about mechanical clocks or computers.
    - Instead, translate these metaphors into grand, atmospheric visual symbols aligned with the aesthetic theme. For example, in a dark sci-fi/gothic (Grimdark) setting, "machine/system/architecture" should be visualized as colossal gothic spaceships, decaying cathedral structures in deep space, stone gargoyles crumbling under ash, or armor of ancient metal corroding under volumetric light.
  - If the text describes a TECHNICAL, SCIENTIFIC, or ABSTRACT concept (e.g., databases, calculations, files, processes, systems, networks):
    - If a character from the provided Cast has a role or description that fits the theme, and the action is human, you are encouraged to show that character interacting with the technical element in a dynamic, illustrative way (e.g., "[Character Name] operating a glowing terminal...", "[Character Name] installing nodes on a machine..."). Remember, this is only allowed if you classify the scene under the "NARRATIVE_CAST" category.
    - If no character fits the context, or if you choose to focus purely on the concept, use a 3D technical animation starting with "3D technical animation of".
  - For live-action / cinematic prompts WITH narrative characters or environments: begin with "Realistic cinematic video of" or "Cinematic epic shot of" and describe the scene with dynamic details. Always add ambient sound only, no dialogue, no voice-over.
  - For 3D/abstract prompts: begin with "3D technical animation of" and visualize the concept directly. Add ambient sound only, no dialogue, no voice-over.
  - For video prompts, include enquadramento e câmera details (e.g. volumetric dust, cinematic lighting, shallow depth of field, panning, macro shot, dramatic backlight).
  - CRITICAL PREFIX RULE: Do NOT include "📷HyperFrames by HeyGen" or any HeyGen tag/prefix in video prompts. HeyGen tags are strictly banned for regular video assets in all formats.
- asset == "image":
  - Always create a realistic still image prompt.
  - The image must directly and metaphorically illustrate the SPECIFIC concept, story character, object, emotion, or situation described in the subtitle text.
  - Follow the same NARRATIVE CHARACTER and ANTI-LITERAL rules as the video prompts.
  - The prompt must begin with "Photorealistic still image of".
  - CRITICAL PREFIX RULE: Do NOT include "📷HyperFrames by HeyGen" or any HeyGen tag/prefix in image prompts. HeyGen tags are strictly banned for regular image assets in all formats.
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
      - CRITICAL: Do NOT write "📷HyperFrames by HeyGen" or HeyGen tags inside the background_prompt or title/subtitle fields.
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
  - DYNAMIC ILLUSTRATIVE MAPPING: Only apply this mapping when you explicitly classify the scene under the "NARRATIVE_CAST" category. If the scene is technical, scientific, schematic, or environmental (focusing on scenery, vehicles, or macro details), characters are STRICTLY BANNED. Under no circumstances should you put a character in a WIDE_ESTABLISHING, PROCESS_MACRO, or SCHEMATIC shot.
  - NARRATOR IN FACELESS MODE: While standard talking-head presenters are banned in Faceless mode, a character defined as a "Narrator", "Analyst", or "Observer" in the Cast list is allowed to appear in B-rolls, but only in third-person scenes (e.g., studying a holographic screen, walking through archives, looking at terminals) and must never look at or speak to the camera.
  - Do NOT write out their full physical description in the prompt. The compiler will swap the brackets with their description later. Just output the short tag like "[Fulgrim] looking distraught" or "Close-up shot of [Fulgrim] drawing his glowing purple sword".
  - Only use character names from the provided Cast list in brackets. If a character is described but is NOT in the Cast list, describe them normally.
  - In FACELESS MODE, virtual presenters/hosts speaking to the camera are completely banned, but story characters from the Cast list (e.g. "[Fulgrim]") are welcome and must be visualized in action sequences or environmental scenes in brackets!
`.trim();

const ULTRA_CINEMATIC_INSTRUCTIONS_STR = `
CRITICAL SIZE & WORD COUNT:
You MUST generate detailed visual prompts between 80 and 150 words for every video or image asset. Never write short prompts.

MANDATORY PROMPT STRUCTURE:
For each prompt, you MUST follow this exact semantic order of fields, separated by spaces:
[Main subject/environment/character description] [Main action, process details, or camera movement] [Facial expression/emotion or environmental ambiance] [Location/setting details] [Context-specific details based on the video theme] [Lighting style] [Cinematic composition and framing] [Lens and camera specification matching the category] [Depth of field] [Photographic quality]

EDITORIAL SHOT ROLES (SELECT ONE BASED ON SUBTITLE):
- ESTABLISHING: Set geographical environment, weather, structures (strictly no characters allowed).
- MASTER: Setup full geography of actors/objects relative to each other.
- ACTION: Show physical events, movements, kinetic interactions.
- PROCESS: Detail work/transformation (e.g. gloved hands operating tool, macro details).
- INSERT: Focus on single clue, document, or key object.
- POV: Plausible height and angle matching character looking at something.
- OTS (Over-the-shoulder): Show spatial relationship and power balance (preserving axes and eyelines).
- REACTION: Emotional response facial/body framing.
- AFTERMATH: Pause/consequence, negative space, weathered environments.

TOPOLOGICAL RISK MITIGATION & STABILITY:
- Keep hands, fingers, and complex tool contacts in macro PROCESS shots or hidden/in gloves to mitigate TOPOLOGY risk.
- For faces and high-detail character performance, use CAMERA LOCKED or microscopic pan/tilt to prevent facial morphing and distortion.
- Limit camera travel distance (dolly/track) to avoid WORLD_EXPANSION errors where the model has to generate unseen geometry.

DYNAMIC AESTHETIC STYLE SUFFIX (SELECT THE SUFFIX MATCHING THE CHOSEN CATEGORY):
You MUST choose exactly one category for each prompt and append the corresponding suffix at the very end of the prompt:
- For WIDE_ESTABLISHING category (no characters allowed), append exactly: "cinematic wide-angle photography, panoramic drone view, 24mm lens, deep depth of field, realistic atmospheric lighting, movie frame, masterpiece, ultra detailed, 8K"
- For PROCESS_MACRO category (no characters allowed, anonymous gloved hands permitted), append exactly: "extreme close-up macro photography, high-speed camera details, 100mm lens, razor-thin depth of field, sharp details, volumetric lighting, movie frame, masterpiece, ultra detailed, 8K"
- For SCHEMATIC category (no characters, hands or faces allowed), append exactly: "3D clean technical rendering, clean graphic UI layout, orthographic view, sharp lines, glowing neon accents, minimalist design, masterpiece, ultra detailed, 8K"
- For JUXTAPOSITION category, append exactly: "cinematic photography, split-screen comparison composition, side-by-side contrast, movie frame, dramatic lighting, 35mm lens, masterpiece, ultra detailed, 8K"
- For NARRATIVE_CAST category (only for scenes featuring character brackets [Character Name]), append exactly: "ultra realistic cinematic photography, movie frame, authentic costumes, natural skin texture, realistic lighting, volumetric light, dramatic atmosphere, cinematic composition, shallow depth of field, Sony Alpha 7R V, 85mm lens, masterpiece, ultra detailed, 8K"

CRITICAL CATEGORY-SUFFIX ALIGNMENT: You MUST align the prompt content with the category suffix. Never mix a 24mm WIDE_ESTABLISHING suffix with a character description or an 85mm lens mention in the same prompt. If the prompt contains a character in brackets, it MUST be classified under NARRATIVE_CAST and use the NARRATIVE_CAST suffix.

NARRATIVE VISUAL RULES:
- Thought/Reflection: Focus on extreme facial detail, micro-expressions, looking away, reflecting light in eyes.
- Battle/Conflict: Focus on high-speed kinetic motion, flying debris, dust, sweat, physical clash.
- Travel/Displacement: Focus on panning camera, motion blur, tracking shot, landscape movement.
- Prayer/Devotion: Focus on soft backlight, closed eyes, folded hands, serene tilt, soft shadows.
- Sadness/Despair: Focus on slumped body language, casting shadows, downcast head, soft cold lighting.
- Fear/Tension: Focus on high-contrast lighting (chiaroscuro), sweat droplets, wide eyes, extreme close-up.
- Hope/Optimism: Focus on golden hour light, warm tones, bright background elements, upward gaze.
- Revelation/Emotional Impact: Focus on sudden expression shift, shallow depth of field, dramatic backlight.
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
  videoFormat?: 'avatar' | 'faceless' | 'vlog' | 'catalog';
  demographics?: string;
  visualIdentity?: string;
}

const resolveCharacterProfile = (input?: CharacterProfileInput | null) => {
  const customDescriptionRaw = String(input?.customDescription || '').trim();
  const visualIdentityRaw = String(input?.visualIdentity || '').trim();

  if (customDescriptionRaw.includes('STYLE_DNA:')) {
    return customDescriptionRaw;
  }
  if (visualIdentityRaw.includes('STYLE_DNA:')) {
    return visualIdentityRaw;
  }

  const mode = input?.mode === 'female' || input?.mode === 'custom' ? input.mode : 'male';
  const customDescription = customDescriptionRaw.replace(/\s+/g, ' ');

  if (mode === 'custom' && customDescription) {
    return customDescription;
  }

  const projectName = String(input?.projectName || '').trim();
  const videoFormat = input?.videoFormat || 'avatar';
  const demographics = String(input?.demographics || '').trim();
  const visualIdentity = String(input?.visualIdentity || '').trim();

  if (videoFormat === 'catalog') {
    return 'premium documentary presentation slide style, clean minimalist off-white textured stucco background, high-fidelity details, soft drop shadows, clean graphic layout';
  }

  // 1. Detect Gender & Pronoun
  const isFemaleVisual = visualIdentity.toLowerCase().includes('mulher') || 
                         visualIdentity.toLowerCase().includes('senhora') || 
                         visualIdentity.toLowerCase().includes('female') ||
                         demographics.toLowerCase().includes('mulher') ||
                         demographics.toLowerCase().includes('female');
  
  const finalMode = mode === 'custom' ? (isFemaleVisual ? 'female' : 'male') : mode;
  const pronoun = finalMode === 'female' ? 'her' : 'his';
  const noun = finalMode === 'female' ? 'female' : 'male';

  // 2. Detect Age
  let ageDescriptor = 'in early 30s';
  const ageLower = (demographics + ' ' + visualIdentity).toLowerCase();
  if (ageLower.includes('70') || ageLower.includes('setenta') || ageLower.includes('late 60s')) {
    ageDescriptor = 'in late 60s';
  } else if (ageLower.includes('60') || ageLower.includes('sessenta')) {
    ageDescriptor = 'in early 60s';
  } else if (ageLower.includes('50') || ageLower.includes('cinquenta') || ageLower.includes('45')) {
    ageDescriptor = 'in early 50s';
  } else if (ageLower.includes('40') || ageLower.includes('quarenta')) {
    ageDescriptor = 'in early 40s';
  } else if (ageLower.includes('30') || ageLower.includes('trinta')) {
    ageDescriptor = 'in early 30s';
  }

  // 3. Detect Role
  let roleDescriptor = 'presenter';
  const roleLower = (projectName + ' ' + demographics).toLowerCase();
  if (roleLower.includes('dev') || roleLower.includes('tech') || roleLower.includes('software') || roleLower.includes('code') || roleLower.includes('arquiteto')) {
    roleDescriptor = finalMode === 'female' ? 'senior software architect and technology expert' : 'senior software engineer and technology expert';
  } else if (roleLower.includes('metabolismo') || roleLower.includes('saude') || roleLower.includes('longevidade') || roleLower.includes('vitalidade') || roleLower.includes('nutri') || roleLower.includes('health')) {
    roleDescriptor = 'health mentor and longevity educator';
  } else if (roleLower.includes('finan') || roleLower.includes('negocio') || roleLower.includes('money') || roleLower.includes('invest') || roleLower.includes('lucro')) {
    roleDescriptor = 'financial advisor and business strategist';
  } else if (projectName) {
    roleDescriptor = `expert presenter and specialist in ${projectName}`;
  }

  // 4. Detect Attire / Appearance Style from visualIdentity
  let clothingDescriptor = 'professional attire';
  const visualLower = visualIdentity.toLowerCase();
  if (visualLower.includes('techwear')) {
    clothingDescriptor = 'premium casual techwear';
  } else if (visualLower.includes('linho') || visualLower.includes('linen') || visualLower.includes('organic') || visualLower.includes('natural')) {
    clothingDescriptor = 'elegant clothing made of organic linen and natural fabrics';
  } else if (visualLower.includes('quiet luxury') || visualLower.includes('luxo silencioso') || visualLower.includes('nobre')) {
    clothingDescriptor = 'elegant quiet luxury style clothing in neutral tones';
  } else if (visualLower.includes('casual')) {
    clothingDescriptor = 'casual stylish attire';
  }

  // 5. Detect Expression
  let expressionDescriptor = 'intelligent and friendly expression';
  if (visualLower.includes('concentrado') || visualLower.includes('foco') || visualLower.includes('focused')) {
    expressionDescriptor = 'focused and intelligent expression';
  } else if (visualLower.includes('serena') || visualLower.includes('serenidade') || visualLower.includes('serene')) {
    expressionDescriptor = 'elegant and serene expression with radiant skin';
  } else if (visualLower.includes('vital') || visualLower.includes('ativa') || visualLower.includes('active')) {
    expressionDescriptor = 'vital and active expression with radiant skin';
  }

  // 6. Detect Environment/Setting based on Format & Visual Identity
  let settingDescriptor = 'modern minimalist home studio, professional setting with soft cinematic lighting';
  if (videoFormat === 'vlog') {
    let vlogSetting = 'standing directly in the historical or natural setting, recording a high-quality educational vlog selfie';
    if (visualLower.includes('natural') || visualLower.includes('jardim') || visualLower.includes('natureza')) {
      vlogSetting = 'standing directly in the serene natural or outdoor setting, recording a high-quality educational vlog selfie';
    } else if (visualLower.includes('office') || visualLower.includes('escritorio')) {
      vlogSetting = 'standing in a premium home office, recording a high-quality vlog selfie';
    }
    settingDescriptor = vlogSetting;
  } else {
    // Studio Format
    if (visualLower.includes('home office escuro') || visualLower.includes('dark home office') || visualLower.includes('midnight')) {
      settingDescriptor = `modern dark home office with subtle glowing screens, cinematic depth of field`;
    } else if (visualLower.includes('luz natural') || visualLower.includes('sol suave') || visualLower.includes('sunlight')) {
      settingDescriptor = `sunlit minimalist room with wood textures and soft warm lighting`;
    } else if (visualLower.includes('clean') || visualLower.includes('claro') || visualLower.includes('minimalista')) {
      settingDescriptor = `bright minimalist workspace with clean white and wood textures`;
    }
  }

  // Compile final prompt string
  if (videoFormat === 'vlog') {
    return `same recurring Brazilian ${noun} ${roleDescriptor} ${ageDescriptor}, ${expressionDescriptor}, wearing ${clothingDescriptor}, ${settingDescriptor}`;
  } else {
    return `same recurring Brazilian ${noun} ${roleDescriptor} ${ageDescriptor}, ${expressionDescriptor}, ${settingDescriptor}, wearing ${clothingDescriptor}`;
  }
};

const chunk = <T,>(items: T[], size: number) => {
  const batches: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    batches.push(items.slice(index, index + size));
  }
  return batches;
};

const buildPromptItems = (rows: SrtAssetRow[], forceAllAsVideo?: boolean) =>
  rows.flatMap((row, index) => {
    const type = normalizeAssetType(row.asset);
    if (!SUPPORTED_PROMPT_ASSETS.has(type)) return [];

    const previousText = rows[index - 1]?.texto?.trim() || '';
    const nextText = rows[index + 1]?.texto?.trim() || '';
    const durationSeconds = Number(((parseSrtTimeToMs(row.endTime) - parseSrtTimeToMs(row.startTime)) / 1000).toFixed(3));

    return [{
      row_number: row.rowNumber,
      asset: forceAllAsVideo
        ? ('video' as const)
        : type === 'texto'
        ? ('text' as const)
        : type === 'hyperframe'
        ? ('hyperframe' as const)
        : type === 'vídeo'
        ? ('video' as const)
        : ('image' as const),
      template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
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

const validatePromptBatch = (
  items: PromptBatchItem[],
  payload: PromptResponseShape,
  localFallbackRows: Set<number>
) => {
  const expectedRows = new Set(items.map((item) => item.row_number));
  const promptMap = new Map<number, { 
    prompt: string; 
    texto_adicional?: any; 
    protagonista_presente?: boolean; 
    extras_presentes?: boolean; 
  }>();

  for (const promptItem of payload.prompts || []) {
    const rowNumber = Number(promptItem?.row_number);
    const prompt = sanitizePrompt(promptItem?.prompt || '');
    if (!expectedRows.has(rowNumber) || (!prompt && promptItem.texto_adicional === undefined)) continue;
    promptMap.set(rowNumber, { 
      prompt, 
      texto_adicional: promptItem.texto_adicional,
      protagonista_presente: (promptItem as any).protagonista_presente,
      extras_presentes: (promptItem as any).extras_presentes
    });
  }

  // If the AI returned fewer prompts than expected, fill missing ones with a safe fallback
  // instead of crashing the entire pipeline for a partial failure
  if (promptMap.size !== expectedRows.size) {
    console.warn(
      `[SRT Pipeline] ⚠️ AI returned ${promptMap.size}/${expectedRows.size} prompts. Filling missing with fallback.`
    );
    for (const item of items) {
      if (!promptMap.has(item.row_number)) {
        let fallback = 'Clean';
        if (item.asset === 'text') {
          fallback = 'Clean';
        } else if (item.asset === 'hyperframe') {
          fallback = item.template_name || 'hf_break';
        } else if (item.asset === 'image') {
          fallback = `Photorealistic cinematic still image representing the narrative scene, dramatic lighting, 8k resolution.`;
        } else {
          fallback = `Cinematic technical video animation of the system concept with volumetric lighting, ambient sound only, no dialogue, no voice-over.`;
        }
        promptMap.set(item.row_number, { 
          prompt: fallback,
          protagonista_presente: false,
          extras_presentes: false
        });
        localFallbackRows.add(item.row_number); // 🏷️ Track for UI feedback
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
  ultraCinematic,
  channelLanguage,
  dnaInstructions,
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
  ultraCinematic?: boolean;
  channelLanguage?: string;
  dnaInstructions?: string;
}) => {
  const languageInstructions = buildLanguageInstructions(channelLanguage);
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: isReasoningModel(model) ? 'developer' : 'system',
        content: (() => {
          let systemPrompt = ultraCinematic
            ? `${SYSTEM_INSTRUCTIONS}\n\n${languageInstructions}\n\nULTRA-CINEMATIC RULES:\n${ULTRA_CINEMATIC_INSTRUCTIONS_STR}`
            : `${SYSTEM_INSTRUCTIONS}\n\n${languageInstructions}`;
          if (dnaInstructions) {
            systemPrompt += `\n\n${dnaInstructions}`;
          }
          return systemPrompt;
        })()
      },
      {
        role: 'user',
        content: [
          dnaInstructions
            ? 'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"CENA...", "protagonista_presente":true/false, "extras_presentes":true/false, "texto_adicional":{}}]}.'
            : 'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"...", "texto_adicional":{}}]}.',
          'Include exactly one prompt per row_number.',
          `Requested Video Format: ${String(videoFormat || 'avatar').toUpperCase()}`,
          videoFormat === 'catalog'
            ? `Visual Style reference (APPLY this presentation design style to ALL video and image prompts in this batch): ${characterDescription}`
            : videoFormat === 'faceless'
            ? `Visual Identity and Aesthetic Style reference (APPLY this visual style, atmosphere, lighting, and art direction to ALL video and image prompts in this batch): ${characterDescription}`
            : videoFormat === 'vlog'
            ? `Recurring presenter character reference: ${characterDescription}`
            : `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment. CRITICAL: In AVATAR mode, only show the presenter if it's an extreme first-person personal story — otherwise, focus purely on scenic/conceptual B-rolls and NEVER show the presenter): ${characterDescription}`,
          visualBlueprint?.setting ? `Visual Art Direction & Setting Reference (APPLY this setting/art style to ALL video and image prompts): ${visualBlueprint.setting}` : '',
          visualBlueprint?.cast && visualBlueprint.cast.length > 0
            ? `Consistent Characters (Narrative Cast) - CRITICAL RULES FOR CONSISTENCY:
1. When any character listed below is mentioned in the subtitle text (by name, pronouns, or clear title like "the knight"), you MUST represent them in the prompt by enclosing their exact name in brackets, e.g. [Character Name] (such as [Grey Knight] or [Fulgrim]).
2. DYNAMIC ILLUSTRATIVE MAPPING: Even if a character is not explicitly named, if the text describes a concept, action, or theme that aligns with their description or role (e.g., tech, analysis, secrets, authority), you should feature them in brackets (e.g., [Character Name]). Their action MUST directly illustrate, complement, or serve as a visual metaphor for the narration (e.g., if the text is about security, show an investigator character locking a console; if the text is about data, show a tech character calibrating a holographic node). Banish static, idle, or purely contemplative poses; the character must be actively doing an action that visually explains the concept.
3. NARRATOR IN FACELESS MODE: While standard talking-head presenters are banned in Faceless mode, a character defined as a "Narrator", "Analyst", or "Observer" in the Cast list is allowed to appear in B-rolls, but only in third-person scenes (e.g., studying a holographic screen, walking through archives, looking at terminals) and must never look at or speak to the camera.
4. NEVER write the character's physical description or details in the prompt under any circumstance — output exactly the bracketed tag so our compiler can expand it later.
5. NEVER write the name of the character in plain text without brackets.
6. Translate any Portuguese mentions of these characters to their exact English name from this cast list inside brackets (e.g. if the text mentions "Cavaleiro Cinza", use "[Grey Knight]" in the prompt).
Here is the active cast list: \n${JSON.stringify(visualBlueprint.cast, null, 2)}`
            : '',
          `Available Text Styles: ${textStyles}`,
          visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
          videoContext ? `Video Context for this batch: ${videoContext}` : '',
          (() => {
            try {
              const trimmed = String(characterDescription || '').trim();
              if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                const parsed = JSON.parse(trimmed);
                if (parsed && typeof parsed === 'object') {
                  return `
CRITICAL STYLISTIC PARAMETERS (STRUCTURED STYLE JSON):
You MUST strictly apply the following style configurations to every video or image prompt:
- Art Type (tipo_de_arte): ${parsed.tipo_de_arte || ''}
- Color Palette (paleta_de_cores): ${parsed.paleta_de_cores || ''}
- Lighting (iluminacao): ${parsed.iluminacao || ''}
- Characters (personagens): ${parsed.personagens || ''}
- Setting/Background (cenario): ${parsed.cenario || ''}
- Composition (composicao): ${parsed.composicao || ''}
- Texture (textura): ${parsed.textura || ''}
- Atmosphere (atmosfera): ${parsed.atmosfera || ''}
- Mandatory Rules (regras_obrigatorias): ${Array.isArray(parsed.regras_obrigatorias) ? parsed.regras_obrigatorias.join(', ') : (parsed.regras_obrigatorias || '')}
- Negative Prompt (negative_prompt - EXCLUDE these elements entirely): ${parsed.negative_prompt || ''}

When constructing the prompt suffix, merge these details dynamically instead of using the standard suffix.
`;
                }
              }
            } catch (e) {}
            return '';
          })(),
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
  ultraCinematic,
  channelLanguage,
  dnaInstructions,
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
  ultraCinematic?: boolean;
  channelLanguage?: string;
  dnaInstructions?: string;
}) => {
  const languageInstructions = buildLanguageInstructions(channelLanguage);
  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [
              ultraCinematic
                ? `${SYSTEM_INSTRUCTIONS}\n\nULTRA-CINEMATIC RULES:\n${ULTRA_CINEMATIC_INSTRUCTIONS_STR}`
                : SYSTEM_INSTRUCTIONS,
              dnaInstructions
                ? 'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"CENA...", "protagonista_presente":true/false, "extras_presentes":true/false, "texto_adicional":{}}]}.'
                : 'Return a JSON object with the shape {"prompts":[{"row_number":1,"prompt":"...", "texto_adicional":{}}]}.',
              'Include exactly one prompt per row_number.',
              `Requested Video Format: ${String(videoFormat || 'avatar').toUpperCase()}`,
              videoFormat === 'catalog'
                ? `Visual Style reference (APPLY this presentation design style to ALL video and image prompts in this batch): ${characterDescription}`
                : videoFormat === 'faceless'
                ? `Visual Identity and Aesthetic Style reference (APPLY this visual style, atmosphere, lighting, and art direction to ALL video and image prompts in this batch): ${characterDescription}`
                : videoFormat === 'vlog'
                ? `Recurring presenter character reference: ${characterDescription}`
                : `Recurring character reference (use ONLY when the subtitle text is a first-person personal or emotional moment. CRITICAL: In AVATAR mode, only show the presenter if it's an extreme first-person personal story — otherwise, focus purely on scenic/conceptual B-rolls and NEVER show the presenter): ${characterDescription}`,
              visualBlueprint?.setting ? `Visual Art Direction & Setting Reference (APPLY this setting/art style to ALL video and image prompts): ${visualBlueprint.setting}` : '',
              visualBlueprint?.cast && visualBlueprint.cast.length > 0
                ? `Consistent Characters (Narrative Cast) - CRITICAL RULES FOR CONSISTENCY:
1. When any character listed below is mentioned in the subtitle text (by name, pronouns, or clear title like "the knight"), you MUST represent them in the prompt by enclosing their exact name in brackets, e.g. [Character Name] (such as [Grey Knight] or [Fulgrim]).
2. DYNAMIC ILLUSTRATIVE MAPPING: Even if a character is not explicitly named, if the text describes a concept, action, or theme that aligns with their description or role (e.g., tech, analysis, secrets, authority), you should feature them in brackets (e.g., [Character Name]). Their action MUST directly illustrate, complement, or serve as a visual metaphor for the narration (e.g., if the text is about security, show an investigator character locking a console; if the text is about data, show a tech character calibrating a holographic node). Banish static, idle, or purely contemplative poses; the character must be actively doing an action that visually explains the concept.
3. NARRATOR IN FACELESS MODE: While standard talking-head presenters are banned in Faceless mode, a character defined as a "Narrator", "Analyst", or "Observer" in the Cast list is allowed to appear in B-rolls, but only in third-person scenes (e.g., studying a holographic screen, walking through archives, looking at terminals) and must never look at or speak to the camera.
4. NEVER write the character's physical description or details in the prompt under any circumstance — output exactly the bracketed tag so our compiler can expand it later.
5. NEVER write the name of the character in plain text without brackets.
6. Translate any Portuguese mentions of these characters to their exact English name from this cast list inside brackets (e.g. if the text mentions "Cavaleiro Cinza", use "[Grey Knight]" in the prompt).
Here is the active cast list: \n${JSON.stringify(visualBlueprint.cast, null, 2)}`
                : '',
              `Available Text Styles: ${textStyles}`,
              visualIdentity ? `Channel Visual Identity: ${visualIdentity}` : '',
              videoContext ? `Video Context for this batch: ${videoContext}` : '',
              (() => {
                try {
                  const trimmed = String(characterDescription || '').trim();
                  if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
                    const parsed = JSON.parse(trimmed);
                    if (parsed && typeof parsed === 'object') {
                      return `
CRITICAL STYLISTIC PARAMETERS (STRUCTURED STYLE JSON):
You MUST strictly apply the following style configurations to every video or image prompt:
- Art Type (tipo_de_arte): ${parsed.tipo_de_arte || ''}
- Color Palette (paleta_de_cores): ${parsed.paleta_de_cores || ''}
- Lighting (iluminacao): ${parsed.iluminacao || ''}
- Characters (personagens): ${parsed.personagens || ''}
- Setting/Background (cenario): ${parsed.cenario || ''}
- Composition (composicao): ${parsed.composicao || ''}
- Texture (textura): ${parsed.textura || ''}
- Atmosphere (atmosfera): ${parsed.atmosfera || ''}
- Mandatory Rules (regras_obrigatorias): ${Array.isArray(parsed.regras_obrigatorias) ? parsed.regras_obrigatorias.join(', ') : (parsed.regras_obrigatorias || '')}
- Negative Prompt (negative_prompt - EXCLUDE these elements entirely): ${parsed.negative_prompt || ''}

When constructing the prompt suffix, merge these details dynamically instead of using the standard suffix.
`;
                    }
                  }
                } catch (e) {}
                return '';
              })(),
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
  characterMode,
  videoContext,
  videoFormat,
  visualBlueprint,
  ultraCinematic,
  channelLanguage,
}: {
  engine: 'openai' | 'gemini';
  model: string;
  apiKey: string;
  projectConfig?: Record<string, any>;
  items: PromptBatchItem[];
  characterDescription: string;
  characterMode?: string;
  videoContext?: string;
  videoFormat?: 'avatar' | 'faceless' | 'vlog' | 'catalog';
  visualBlueprint?: { setting: string; cast: Array<{ name: string; description: string; tag?: string; selected?: boolean }> } | null;
  ultraCinematic?: boolean;
  channelLanguage?: string;
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
  const dnaBlocks = parseDnaBlocks(characterDescription);
  const hasDna = dnaBlocks.hasDna;
  const activeCastList = (visualBlueprint?.cast || []).filter((c: any) => c && c.selected !== false);
  const hasActiveCast = activeCastList.length > 0;

  let dnaInstructions = '';
  if (hasDna) {
    const castTagInstructions = hasActiveCast
      ? `ACTIVE CAST BRACKET RULE: When any character from the active cast below appears or performs an action in the scene, you MUST refer to them using their EXACT bracket tag (e.g. ${activeCastList.map((c: any) => `[${(c.tag || c.name || '').replace(/^\[|\]$/g, '')}]`).join(', ')}). NEVER write their physical details in the prompt.`
      : 'In the CENA, refer to the protagonist strictly as "the protagonist" (e.g., "The protagonist sits at..."). Do NOT describe their face, clothing, hair, age, or glasses.';

    dnaInstructions = `
CRITICAL STYLE DRIFT GUARD (DNA ASSEMBLY MODE ACTIVE):
This batch of prompts is in DNA assembly mode. Follow these rules strictly:
1. DO NOT describe the general style, art medium, lighting, camera settings, colors, or character appearance in the prompt.
2. In the "prompt" property of each item, write ONLY the scenic action description (the unique action scene description in English, 25 to 50 words, present tense, describing a static scene).
3. ${castTagInstructions}
4. Set the field "protagonista_presente" to true if the protagonist/cast character appears in the scene (based on their action, emotion, or narrative role in the subtitle), or false if they are absent.
5. Set the field "extras_presentes" to true if secondary characters or other human figures are present, or false if absent.
6. The JSON output schema for each prompt MUST strictly be: {"row_number": X, "prompt": "Detailed action description in English...", "protagonista_presente": true/false, "extras_presentes": true/false, "texto_adicional": {}}
`;
  }

  // Dynamic hint based on video format (Faceless, Vlog, or Catalog)
  const facelessHint = videoFormat === 'catalog'
    ? 'CATALOG VIDEO MODE: You MUST generate visual prompts styled as clean, premium documentary presentation slides. Follow these guidelines strictly: \n' +
      '1. BACKGROUND: Every prompt must feature a consistent "minimalist off-white textured background" (or clean stucco/paper texture).\n' +
      '2. CARDS/PANELS: Describe subjects, products, maps, or figures as appearing inside "floating rounded-corner panels/cards with soft drop shadows".\n' +
      '3. LAYOUT VARIATIONS: Vary the layout based on the subtitle context: \n' +
      '   - Single center card for main focus (e.g. "a centered floating card showing...").\n' +
      '   - Two cards side-by-side for comparison or context (e.g. "two floating cards side-by-side: the left card showing the city facade, the right card showing a clean vector map of the region").\n' +
      '   - Three cards side-by-side for recipe ingredients or steps.\n' +
      '   - Focal emphasis: describe one central card in focus while surrounding cards are blurred.\n' +
      '4. TEXT OVERLAYS: If a key phrase, name, or date is prominent, describe it as bold black sans-serif text centered on the slide or above the cards (e.g. "bold black text reading [Name] at the top of the slide, above a floating card...").\n' +
      '5. COMMERCIAL BRANDS/PRODUCTS: If a commercially recognizable product (e.g. Coca-Cola, Nutella, Starbucks) is mentioned, do not write a generic prompt. Instead: \n' +
      '   - Start the prompt with a marker tag: "[Product Placeholder: Brand Name]"\n' +
      '   - Describe the product using its iconic packaging shapes and official brand colors (e.g. "classic red glass bottle with white ribbon design", "white paper cup with green circular mermaid logo") alongside the brand name, helping the generator render it accurately while leaving a clear signal for the editor to overlay a real asset if needed.\n' +
      '6. STRICT BAN ON HUMANS: Absolutely NO human characters, presenters, hosts, analysts, observers, or people of any kind should appear under any circumstances. Banish all human figures, faces, or hands from all prompts.\n' +
      '7. EXPLICIT TEXT LANGUAGE (NO IMPLICIT TEXT): Any text, titles, labels, or words that should appear written or rendered inside the image or video (such as card titles, labels on diagrams, list points, or slide headers) MUST be explicitly described in the prompt and MUST be written in the language of the script (Portuguese) inside double quotes. Do NOT leave text implicit (e.g. do NOT say "a card showing claims" as this results in English gibberish like "LADDED CLAIMS"; instead say "a card with text reading \'ALEGAÇÕES\'"). Keep the prompt description in English, but define all on-screen written words in Portuguese using: text/label/title reading "...".'
    : videoFormat === 'faceless'
    ? 'FACELESS VIDEO MODE: Banish all modern studio presenters, vloggers, or home office hosts speaking to the camera. However, if the subtitle describes actions or figures of the historical narrative (e.g. Fulgrim, soldiers, knights), you MUST actively represent these characters in your visual prompts in brackets, e.g. [Character Name]!'
    : videoFormat === 'vlog'
    ? `VLOG VIDEO MODE: The video is a dynamic educational vlog (hand-held camera, selfie style). For video or image prompts involving the presenter, ALWAYS place the recurring character inside the setting. Write the visual prompt in English as a handheld selfie video: "First-person vlog selfie video of ${characterDescription}, looking at the camera, talking dynamically, realistic handheld camera movement (shaky cam, selfie angle), [insert historical/situational background and dynamic actions described in the subtitle], atmospheric lighting." Adjust facial expressions (e.g. amazed, concerned, smiling, intense) to match the emotion of the subtitle text.`
    : '';

  const promptMap = new Map<number, string>();
  const textoAdicionalMap = new Map<number, any>();
  const localFallbackRows = new Set<number>();

  const batches = chunk(items, batchSize);
  const CONCURRENCY = 4;

  for (let i = 0; i < batches.length; i += CONCURRENCY) {
    const group = batches.slice(i, i + CONCURRENCY);
    const groupResults = await Promise.all(
      group.map(async (batch) => {
        try {
          const payload = engine === 'gemini'
            ? await generateBatchWithGemini({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '', facelessHint, videoFormat, visualBlueprint, ultraCinematic, channelLanguage, dnaInstructions })
            : await generateBatchWithOpenAI({ apiKey, model: resolvedModel, batchItems: batch, characterDescription, textStyles, visualIdentity, videoContext: videoContext || '', facelessHint, videoFormat, visualBlueprint, ultraCinematic, channelLanguage, dnaInstructions });
          return { batch, payload };
        } catch (err) {
          console.error('[SRT Pipeline Batch Error]', err);
          return { batch, payload: { prompts: [] } };
        }
      })
    );

    for (const { batch, payload } of groupResults) {
      const validatedBatch = validatePromptBatch(batch, payload, localFallbackRows);
      validatedBatch.forEach((val, rowNumber) => {
        const item = items.find((it) => it.row_number === rowNumber);
        const isVisualAsset = item && (item.asset === 'video' || item.asset === 'image');

        if (hasDna && isVisualAsset) {
          let cena = sanitizePrompt(val.prompt || '');
          const replacement = getProtagonistReplacement(characterMode, characterDescription);
          cena = cena.replace(/the protagonist/g, replacement);
          const capitalizedReplacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
          cena = cena.replace(/The protagonist/g, capitalizedReplacement);

          const protPresente = !!val.protagonista_presente;
          const extPresentes = !!val.extras_presentes;
          
          const sanitizedCharDna = sanitizeProperNames(dnaBlocks.characterDna);
          const sanitizedExtrasDna = sanitizeProperNames(dnaBlocks.extrasDna);
          const sanitizedStyleDna = sanitizeProperNames(dnaBlocks.styleDna);
          const activeTag = (activeCastList[0]?.tag || activeCastList[0]?.name || 'Velan').replace(/^[\[\]]+|[\[\]]+$/g, '').trim();
          const hasCharacter = protPresente || (hasActiveCast && (cena.includes(`[${activeTag}]`) || cena.toLowerCase().includes(activeTag.toLowerCase())));

          let assembledPrompt = '';
          if (item.asset === 'video') {
            if (hasCharacter && sanitizedCharDna) {
              assembledPrompt = `[${activeTag}] Use the two supplied character reference images as the sole visual identity authority for this character throughout the shot; preserve all defining features: identity, anatomy, proportions, ${sanitizedCharDna} — from first frame to last. Visual scene: ${cena}. Camera: static, locked, medium shot. Visual style: ${sanitizedStyleDna}. Ambient sound: mechanic workshop ambiance, distant tool clatter, compressor hum. No music, no spoken words. ${dnaBlocks.negativeDna || 'No talking, no text on screen, no 3D photorealism.'}`;
            } else {
              assembledPrompt = `Visual scene: ${cena}. Camera: static, locked, medium shot. Visual style: ${sanitizedStyleDna}. Ambient sound: mechanic workshop ambiance, distant tool clatter, compressor hum. No music, no spoken words. ${dnaBlocks.negativeDna || 'No talking, no text on screen, no 3D photorealism.'}`;
            }
          } else {
            // Image asset
            if (hasCharacter && sanitizedCharDna) {
              assembledPrompt = `[${activeTag}] Use the two supplied character reference images as the sole visual identity authority for this character; preserve all defining features while changing only scene-authorized pose, expression and placement. Visual scene: ${cena}. Visual style: ${sanitizedStyleDna}. Camera: static, locked.`;
            } else {
              assembledPrompt = `Visual scene: ${cena}. Visual style: ${sanitizedStyleDna}. Camera: static, locked.`;
            }
          }
          
          promptMap.set(rowNumber, assembledPrompt);
        } else {
          promptMap.set(rowNumber, val.prompt);
        }

        if (val.texto_adicional) {
          textoAdicionalMap.set(rowNumber, val.texto_adicional);
        }
      });
    }
  }

  return { promptMap, textoAdicionalMap, localFallbackRows };
};

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const engine = body?.engine === 'gemini' ? 'gemini' : 'openai';
    const model = String(body?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1'));
    const projectConfig = body?.projectConfig || {};
    const forceAllAsVideo = !!body?.forceAllAsVideo;
    const ultraCinematic = !!body?.ultraCinematic;
    const videoFormat: 'avatar' | 'faceless' | 'vlog' | 'catalog' =
      body?.videoFormat === 'vlog' ? 'vlog' :
      (body?.videoFormat === 'faceless' ? 'faceless' :
      (body?.videoFormat === 'catalog' ? 'catalog' : 'avatar'));
    const rawVisualBlueprint = body?.visualBlueprint || null;
    const visualBlueprint = videoFormat === 'catalog' && rawVisualBlueprint
      ? { ...rawVisualBlueprint, cast: [] }
      : rawVisualBlueprint;
    const characterDescription = resolveCharacterProfile({
      ...(body?.characterProfile || {}),
      projectName: projectConfig?.project_name || projectConfig?.name || '',
      demographics: projectConfig?.persona_matrix?.demographics || projectConfig?.target_persona?.audience || '',
      visualIdentity: projectConfig?.editing_sop?.visual_identity || projectConfig?.visual_identity || '',
      videoFormat,
    });
    const videoContext = String(body?.videoContext || '').trim();
    const channelLanguage = String(
      body?.channelLanguage ||
      projectConfig?.persona_matrix?.channel_language ||
      projectConfig?.language ||
      'Português'
    ).trim();
    
    // Batch Mode Branch
    if (Array.isArray(body?.batchItems) && body.batchItems.length > 0) {
      const apiKey = String(
        body?.apiKeyOverwrite || (engine === 'gemini' ? process.env.GEMINI_API_KEY : process.env.OPENAI_API_KEY) || ''
      ).trim();

      if (!apiKey) {
        return NextResponse.json({ error: `API Key para ${engine} nao configurada.` }, { status: 401 });
      }

      const promptItems = body.batchItems as PromptBatchItem[];
      const { promptMap, textoAdicionalMap, localFallbackRows } = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        characterMode: body?.characterProfile?.mode,
        videoContext,
        videoFormat,
        visualBlueprint,
        ultraCinematic,
        channelLanguage,
      });

      const prompts = promptItems.map((item) => {
        let finalPrompt = promptMap.get(item.row_number) || '';
        const isFacelessHf = item.asset === 'hyperframe' && videoFormat === 'faceless';
        if (!isFacelessHf) {
          finalPrompt = cleanHeyGenPrefixes(finalPrompt);
        }
        return {
          rowNumber: item.row_number,
          prompt: (forceAllAsVideo || item.asset === 'video')
            ? enforceVideoPromptGuards(finalPrompt, characterDescription)
            : finalPrompt,
          texto_adicional: textoAdicionalMap.get(item.row_number),
          isFallback: localFallbackRows.has(item.row_number), // 🏷️ Let UI know which rows need regeneration
        };
      });

      return NextResponse.json({ prompts, hasFallbacks: localFallbackRows.size > 0 });
    }

    // Legacy / Full-File Mode Branch
    const srtText = String(body?.srtText || '').trim();
    if (!srtText) {
      return NextResponse.json({ error: 'O conteudo do .srt ou o array batchItems e obrigatorio.' }, { status: 400 });
    }

    const enabledAssets = body?.enabledAssets || {
      video: true,
      image: true,
      text: true,
      hyperframe: true,
    };

    const parsedRows = parseSrtToRows(srtText, forceAllAsVideo);
    if (!parsedRows.length) {
      return NextResponse.json({ error: 'Nao foi possivel extrair blocos validos do .srt enviado.' }, { status: 400 });
    }

    const assetAllocationMode: AssetAllocationMode = body?.assetAllocationMode || (body?.forceAllAsVideo ? 'force_all_video' : 'hybrid_smart');

    const assetRows      = applyAssetRules(parsedRows, videoFormat, srtText, enabledAssets, assetAllocationMode);
    const cooledRows     = enforceTextoCooldown(assetRows);
    const hfRows         = applyHyperframeRules(cooledRows, videoFormat, enabledAssets);
    const excludedRows   = applyHyperframeExclusionZone(hfRows);
    const finalRows      = finalizeFacelessRows(excludedRows, videoFormat, enabledAssets, assetAllocationMode);
    const promptItems    = buildPromptItems(finalRows, forceAllAsVideo);

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

      const { promptMap, textoAdicionalMap, localFallbackRows } = await generatePromptMap({
        engine,
        model,
        apiKey,
        projectConfig,
        items: promptItems,
        characterDescription,
        videoContext,
        videoFormat,
        visualBlueprint,
        ultraCinematic,
        channelLanguage,
      });

      rowsWithPrompts = finalRows.map((row) => {
        let finalPrompt = promptMap.get(row.rowNumber) || row.prompt;
        const originalType = normalizeAssetType(row.asset);
        const shouldForce = forceAllAsVideo && (originalType === 'texto' || originalType === 'imagem' || originalType === 'hyperframe');
        const finalAsset = shouldForce ? ('vídeo' as const) : row.asset;

        const isFacelessHf = originalType === 'hyperframe' && videoFormat === 'faceless';
        if (!isFacelessHf) {
          finalPrompt = cleanHeyGenPrefixes(finalPrompt);
        }
        return {
          ...row,
          asset: finalAsset,
          prompt: (forceAllAsVideo || originalType === 'vídeo')
            ? enforceVideoPromptGuards(finalPrompt, characterDescription)
            : finalPrompt,
          texto_adicional: shouldForce ? '' : (textoAdicionalMap.get(row.rowNumber) || row.texto_adicional),
          isFallback: localFallbackRows.has(row.rowNumber),
        };
      });
    }

    return NextResponse.json(buildPipelineResult(rowsWithPrompts, null, videoFormat));
  } catch (error) {
    console.error('[SRT Pipeline] Error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Falha ao processar o SRT anexado.' },
      { status: 500 }
    );
  }
}
