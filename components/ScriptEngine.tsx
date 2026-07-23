'use client';

import React, { useState, useEffect, useRef, type ChangeEvent } from 'react';
import { supabase } from '@/lib/supabase';
import { useActiveProject, useProjectStore } from '@/lib/store/projectStore';
import { immutableInsert, upsertScriptExecution, getScriptExecution, syncAndFreeTheme } from '@/lib/supabase-mutations';
import { Play, Save, Copy, Layout, Settings, MessageSquare, Sparkles, ChevronDown, Trash2, Plus, Database, PenTool, History, Zap, RotateCcw, ArrowLeft, Octagon, FileText, FolderOpen, Check, Loader2 } from 'lucide-react';
import {
  applyAssetRules,
  applyHyperframeRules,
  applyHyperframeExclusionZone,
  buildAssetStats,
  enforceTextoCooldown,
  parseSrtToRows,
  sanitizeDownloadFileStem,
  buildPipelineResult,
  normalizeAssetType,
  parseSrtTimeToMs,
  type SrtAssetPipelineResult,
  type AssetAllocationMode,
  finalizeFacelessRows,
  buildFcpxmlTimeline,
  buildCapCutDraft,
  sanitizePrompt,
  cleanHeyGenPrefixes,
  parseDnaBlocks,
  getProtagonistReplacement,
  sanitizeProperNames,
} from '@/lib/srt-asset-pipeline';
import { buildHyperframesBat } from '@/lib/hyperframes-overlay';
import { downloadTemplateZip } from '@/lib/template-studio-zip';
import { buildSfxBatFromTimeline } from '@/lib/sfx-generator';
import {
  buildPostScriptTimelineContext,
  buildSeoChapterPlan,
  sanitizePostScriptPackage,
  buildScriptTranscript,
  buildSfxAnchorPlan,
  type PostScriptPackage,
} from '@/lib/post-script-package';
import { isReasoningModel, resolveModel } from '@/lib/ai-config';
import ProductionAssembler from './ProductionAssembler';
import ScrollToTopButton from './ScrollToTopButton';

type TitleCriterionResult = true | 'parcial' | false;
interface TitleValidationResult {
  title: string;
  score: number;
  verdict: 'Aprovado' | 'Ajustes' | 'Fraco';
  breakdown: {
    tensao: TitleCriterionResult;
    relevancia: TitleCriterionResult;
    curiosidade: TitleCriterionResult;
    valor: TitleCriterionResult;
    saturacao: TitleCriterionResult;
    singularidade: TitleCriterionResult;
  };
}

interface ScriptBlock {
  id: string;
  type: 'Hook' | 'Context' | 'Development' | 'CTA' | 'SOP';
  title: string;
  content: string;
  sop?: string; // New field for production guidelines
}

type ExecutionMode = 'internal' | 'external';
type ScriptStage = 'blueprint' | 'final';
type SrtPipelineStepStatus = 'pending' | 'running' | 'done' | 'error';
type VideoCharacterMode = 'male' | 'female' | 'custom';
type VideoFormat = 'avatar' | 'faceless' | 'vlog' | 'avatar_flow' | 'catalog';

const resolveErrorMessage = (errPayload: any, fallback: string): string => {
  if (!errPayload) return fallback;
  if (typeof errPayload === 'string') return errPayload;
  if (typeof errPayload === 'object') {
    return errPayload.message || errPayload.code || JSON.stringify(errPayload);
  }
  return fallback;
};

  const renderMarkdown = (mdText: string | null | undefined) => {
    if (!mdText) return null;

    const lines = mdText.split('\n');
    const elements: React.ReactNode[] = [];

    let inTable = false;
    let tableHeaders: string[] = [];
    let tableRows: string[][] = [];

    const parseInlineMarkdown = (text: string) => {
      const parts = text.split(/\*\*([^*]+)\*\*/g);
      return parts.map((part, idx) => {
        const isBold = idx % 2 === 1;
        const linkParts = part.split(/\[([^\]]+)\]\(([^)]+)\)/g);
        
        const content = linkParts.length > 1 ? (
          linkParts.map((subPart, subIdx) => {
            if (subIdx % 3 === 1) {
              const linkText = subPart;
              const linkUrl = linkParts[subIdx + 1];
              return (
                <a 
                  key={`link-${subIdx}`} 
                  href={linkUrl} 
                  target="_blank" 
                  rel="noopener noreferrer" 
                  className="text-blue-400 hover:underline font-bold"
                >
                  {linkText}
                </a>
              );
            }
            if (subIdx % 3 === 2) return null;
            return subPart;
          })
        ) : part;

        if (isBold) {
          return <strong key={idx} className="font-bold text-white">{content}</strong>;
        }
        return <span key={idx}>{content}</span>;
      });
    };

    const flushTable = (key: number) => {
      if (tableHeaders.length === 0 && tableRows.length === 0) return null;
      const headerRow = tableHeaders.length > 0 ? (
        <tr className="border-b border-white/10 bg-white/5">
          {tableHeaders.map((h, i) => (
            <th key={i} className="px-3 py-2 text-left font-black uppercase tracking-wider text-[10px] text-white/50">
              {h}
            </th>
          ))}
        </tr>
      ) : null;

      const bodyRows = tableRows.map((row, rowIndex) => (
        <tr key={rowIndex} className="border-b border-white/5 hover:bg-white/[0.02] transition-colors">
          {row.map((cell, cellIndex) => {
            let cellStyle = "px-3 py-2 text-[10px] text-white/80 align-top";
            const trimmed = cell.trim();
            if (trimmed.includes('✅ PRECISO')) {
              return (
                <td key={cellIndex} className={cellStyle}>
                  <span className="px-2 py-0.5 rounded bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 font-bold text-[9px]">
                    ✅ PRECISO
                  </span>
                </td>
              );
            } else if (trimmed.includes('⚠️ ALERTA')) {
              return (
                <td key={cellIndex} className={cellStyle}>
                  <span className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-500/30 text-amber-400 font-bold text-[9px]">
                    ⚠️ ALERTA
                  </span>
                </td>
              );
            } else if (trimmed.includes('❌ INCORRETO')) {
              return (
                <td key={cellIndex} className={cellStyle}>
                  <span className="px-2 py-0.5 rounded bg-red-500/15 border border-red-500/30 text-red-400 font-bold text-[9px]">
                    ❌ INCORRETO
                  </span>
                </td>
              );
            }
            return (
              <td key={cellIndex} className={cellStyle}>
                {parseInlineMarkdown(cell)}
              </td>
            );
          })}
        </tr>
      ));

      inTable = false;
      tableHeaders = [];
      tableRows = [];

      return (
        <div key={`table-${key}`} className="my-4 overflow-x-auto rounded-xl border border-white/10 bg-midnight/35">
          <table className="w-full text-[10px] border-collapse">
            <thead>{headerRow}</thead>
            <tbody>{bodyRows}</tbody>
          </table>
        </div>
      );
    };

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trimmed = line.trim();

      const hasPipe = line.includes('|');
      if (hasPipe) {
        inTable = true;
        let cols = line.split('|').map(c => c.trim());
        if (cols.length > 0 && cols[0] === '') cols.shift();
        if (cols.length > 0 && cols[cols.length - 1] === '') cols.pop();

        const isSeparator = cols.every(c => c.match(/^:?-+:?$/));

        if (isSeparator) {
          continue;
        }

        if (tableHeaders.length === 0 && tableRows.length === 0) {
          tableHeaders = cols;
        } else {
          tableRows.push(cols);
        }
        continue;
      } else if (inTable) {
        const tbl = flushTable(i);
        if (tbl) elements.push(tbl);
      }

      if (trimmed.startsWith('###')) {
        elements.push(
          <h4 key={i} className="text-[12px] font-black uppercase tracking-wider text-blue-300 mt-4 mb-2">
            {parseInlineMarkdown(trimmed.replace(/^###\s*/, ''))}
          </h4>
        );
        continue;
      }
      if (trimmed.startsWith('##')) {
        elements.push(
          <h3 key={i} className="text-[13px] font-extrabold uppercase tracking-widest text-blue-100 mt-5 mb-3 pb-1 border-b border-white/5">
            {parseInlineMarkdown(trimmed.replace(/^##\s*/, ''))}
          </h3>
        );
        continue;
      }
      if (trimmed.startsWith('#')) {
        elements.push(
          <h2 key={i} className="text-[14px] font-black uppercase text-white mt-6 mb-4">
            {parseInlineMarkdown(trimmed.replace(/^#\s*/, ''))}
          </h2>
        );
        continue;
      }

      if (trimmed.startsWith('>')) {
        const content = trimmed.replace(/^>\s*/, '');
        const isWarning = content.includes('⚠️') || content.includes('Aviso');
        const bgStyle = isWarning
          ? "border-l-4 border-amber-500 bg-amber-500/10 text-amber-200/90"
          : "border-l-4 border-blue-500 bg-blue-500/10 text-blue-200/90";
        
        elements.push(
          <div key={i} className={`p-3 rounded-r-xl my-3 text-[10px] leading-relaxed ${bgStyle}`}>
            {parseInlineMarkdown(content)}
          </div>
        );
        continue;
      }

      if (trimmed.startsWith('*') || trimmed.startsWith('-')) {
        elements.push(
          <div key={i} className="flex gap-2 pl-2 py-0.5 text-[10px] text-white/70">
            <span className="text-blue-400 select-none">•</span>
            <div className="flex-1">
              {parseInlineMarkdown(trimmed.replace(/^[*+-]\s*/, ''))}
            </div>
          </div>
        );
        continue;
      }

      if (trimmed === '') {
        continue;
      }

      elements.push(
        <p key={i} className="text-[10.5px] text-white/75 leading-relaxed my-2">
          {parseInlineMarkdown(trimmed)}
        </p>
      );
    }

    if (inTable) {
      const tbl = flushTable(lines.length);
      if (tbl) elements.push(tbl);
    }

    return <div className="space-y-1.5">{elements}</div>;
  };

const getLanguageDirectives = (lang?: string) => {
  const l = (lang || 'Português').trim();
  if (l === 'English') {
    return { 
      name: 'English', 
      code: 'English', 
      units: 'US Imperial system (e.g. Fahrenheit °F, miles, feet, inches, pounds, ounces, gallons)' 
    };
  }
  if (l === 'Español' || l === 'Spanish') {
    return { 
      name: 'Spanish', 
      code: 'Spanish', 
      units: 'Metric system (e.g. Celsius °C, kilometers, meters, grams, kilograms, liters)' 
    };
  }
  if (l === 'Português' || l === 'Portuguese') {
    return { 
      name: 'Brazilian Portuguese', 
      code: 'PT-BR', 
      units: 'Metric system (e.g. Celsius °C, quilômetros, metros, gramas, quilogramas, litros)' 
    };
  }
  return { 
    name: l, 
    code: l, 
    units: 'Metric system (e.g. Celsius °C, kilometers, meters, grams, kilograms, liters)' 
  };
};

const SRT_PIPELINE_SYSTEM_INSTRUCTIONS = `
You generate production-ready visual prompts for subtitle-driven videos.

Return only valid JSON.
Write every visual prompt (video, image) in English (except for text styles which should match the provided list). Hyperframe title/subtitle/metrics fields must always be written in the exact same language as the subtitle text — never in English unless the subtitle itself is in English.
Do not include markdown, subtitles, on-screen text, logos, watermarks, or UI overlays.
Keep prompts concise, vivid, and generator-friendly.
Use one sentence per prompt, usually between 18 and 40 words.

CRITICAL RULE - ON-SCREEN WRITTEN TEXT LANGUAGE (NO IMPLICIT TEXT):
Whenever a visual prompt describes or implies any written information, text, labels, chart axes, diagrams, slide titles, list points, or headings to be visible inside the video or image:
1. You MUST NEVER leave the text implicit (do NOT write generic prompts like "a card showing claims" or "a chart of study results" without specifying the labels). If the text is left implicit in English, the image/video generator will render English words or gibberish (e.g. "LADDED CLAIMS").
2. Instead, you MUST explicitly specify the text to be rendered on screen inside double quotes, and that text MUST be written exactly in the language of the script (usually Portuguese).
3. Example of BAD implicit prompt: "a centered rounded card showing a polished marketing storyboard of layered claims"
4. Example of GOOD explicit prompt: "a centered rounded card showing a polished marketing storyboard with bold text reading 'ALEGAÇÕES ACUMULADAS'"
5. Always keep the background and scenery description in English, but force all on-screen written text to be in the script's language by using the phrase: "text reading '...'" or "label reading '...'" or "title reading '...'".

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
    - You must write the prompt in two distinct parts:
      1. THE FIRST FRAME COMPOSITION: Describe the static scene (subject, setting, clothing, lighting, camera position).
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
`;

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




const POST_SCRIPT_SYSTEM_INSTRUCTIONS = `
You generate a post-script production package for a Brazilian Portuguese YouTube video.

Return only valid JSON with this exact shape:
{
  "titles": ["...", "...", "...", "...", "..."],
  "seoDescription": "...",
  "sunoPrompt": "...",
  "sunoSuggestedTitle": "...",
  "hfContextTitles": [
    {
      "timestamp": "[02:15]",
      "headline": "Custo Invisível",
      "subtitle": "Como pequenas perdas acumulam sem que você perceba.",
      "metrics": "—",
      "bgPrompt": "Dimly lit office desk with scattered papers and glowing monitor, shallow depth of field, cinematic teal tones."
    },
    {
      "timestamp": "[07:30]",
      "headline": "Esgotamento Silencioso",
      "subtitle": "O que seu corpo tenta te dizer antes do colapso.",
      "metrics": "—",
      "bgPrompt": "Warm amber light in an empty living room at dusk, soft bokeh, emotional and intimate atmosphere."
    },
    {
      "timestamp": "[13:05]",
      "headline": "Virada de Chave",
      "subtitle": "O momento que separa quem avança de quem estagna.",
      "metrics": "3x",
      "bgPrompt": "Abstract dark corridor with a single beam of light breaking through, dramatic contrast, cinematic wide angle."
    }
  ],
  "sfxTimelineTxt": "..."
}

Rules:
- "titles" must contain distinct title options in PT-BR, matching the exact number of titles requested in the user prompt (defaulting to 5 if not specified).
- If specific "ESTRUTURAS DE TITULO DA BIBLIOTECA NARRATIVA" (Narrative Library Title Structures) are provided in the user prompt:
  * Every generated title option MUST strictly follow one of those patterns.
  * Replace all bracketed placeholders (e.g. [TEMA], [METAFORA], [TARGET], [Elemento Pequeno/Frágil], [Objeto], etc.) with specific, contextual details related to the video topic and script.
  * CRITICAL RE-THEMING RULE: If any Title Structure pattern is a concrete sentence/example (e.g., it contains specific subjects/nouns like "Magnésio-Quelato" or "alimento fit" instead of bracketed placeholders), you MUST identify these concrete subjects/nouns and adapt/replace them with the current video topic (e.g. "Creatina") and script context. Under no circumstances should you copy the original subjects/nouns of the pattern if they do not match the current video's topic.
  * The final output titles must NOT contain any bracketed placeholders and must be written fully in PT-BR.
  * Distribute the titles across the provided structures (e.g., if there are 5 structures, generate at least one variation matching each structure).
- If NO narrative library title structures are provided:
  * Each title must organically combine these 5 structural components:
    1. Tensão inicial (hook): cria desequilíbrio ou lacuna mental.
    2. Promessa emocional: mostra o que o público vai descobrir, resolver ou entender.
    3. Contraste: opõe duas ideias, criando tensionamento semântico.
    4. Transformação: revela uma virada de entendimento.
    5. Fechamento de recompensa: entrega o valor final ou insight.
- Use emotional, curious and intense language. Avoid technical jargon.
- Mix formats: questions ("Por que..."), paradoxical statements ("A verdade brutal sobre..."), comparative phrases ("O lado oculto de...").
- Maximum 12 words per title.
- Vary tones across titles: provocative, philosophical, inspirational, narrative.
- Titles must feel clickable and relevant to the specific video topic.
- "seoDescription" must be in PT-BR and should focus on writing only the human opening paragraph of the YouTube description.
- Use correct Brazilian Portuguese spelling and accentuation in every PT-BR field.
- The SEO description must follow this formatting:
  1. One short opening paragraph with 2 to 4 sentences introducing the promise of the video.
  2. Do not write timestamp lines yourself.
  3. Do not write the AVISO DE IA yourself.
- The app will normalize timestamps and the AI notice after your response.
- Keep the opening paragraph natural, human and useful, not robotic.
- Avoid quotation marks around technical metaphors unless absolutely necessary.
- "sunoPrompt" must be written in English and must be rich, thematic, and detailed — reflecting the specific emotional arc, subject matter, and atmosphere of this video.
- The Suno prompt MUST reference the theme of the video (e.g. if the video is about developer burnout, the prompt should evoke that feeling through musical language).
- Structure the prompt as a layered description covering: genre/subgenre, mood and atmosphere, key instruments, dynamic evolution (how the music builds or shifts), and any thematic or textural references.
- Use comma-separated descriptors, but write multiple layers — not just one line. Think of it as a production brief that a composer would use to score a short film.
- Maximum length: 800 characters. Stay under this limit but use as much of it as needed to be specific and evocative.
- Do NOT use generic phrases like "epic cinematic orchestral" without grounding them in the specific theme.
- Avoid BPM numbers, key signatures, stem breakdowns, or technical production jargon.
- "sunoSuggestedTitle" should be short and in English.
- "sfxTimelineTxt" must be in PT-BR and formatted as a clean plain-text timeline, not JSON.
- In "sfxTimelineTxt", keep labels EFEITO/FUNCAO/TRECHO/OBS in PT-BR, but the value after EFEITO must be an English searchable sound effect name for CapCut PC.
- Prefer simple English SFX names such as "Digital Glitch", "Low Rumble", "Cinematic Whoosh", "Keyboard Clicks", "Sub Bass Hit", "Notification Ping", "Metallic Impact", "Tension Riser", "Ambient Room Tone".
- The SFX timeline must respect a minimum interval of 25 seconds between events.
- Use the suggested SFX anchors as the primary map, but you may skip weak points if they would feel artificial.
- In SFX timeline, use this format repeatedly:
  [MM:SS]
  EFEITO: ...
  FUNCAO: ...
  TRECHO: ...
  OBS: ...
- For "hfContextTitles", generate a contextual title array based on the provided hyperframe anchors.
  DO NOT include a "visualState" field — the template is assigned automatically by the app.
  For each anchor generate ONLY:
  1. "timestamp": The anchor timestamp in [MM:SS] format.
  2. "headline": Short impact title (3-6 words, e.g. "Presença Fragmentada", "O Custo Oculto").
  3. "subtitle": Contextual phrase (max 15 words) that reflects what is being said at that moment.
  4. "metrics": Optional support metric (e.g. "10x", "+85%"). Use an em dash "—" if not applicable.
  5. "bgPrompt": A cinematic image/video generation prompt in English for the background behind the avatar.
     - Must be visually descriptive, environment-based, and match the emotional tone of that specific narrative moment.
     - Do NOT describe the person or avatar. Describe only the scene, setting, textures, and atmosphere.
     - Examples: "Soft morning light filtering through kitchen window, organic produce on marble counter, shallow depth of field", "Dark laboratory with glowing chemical flasks, blue neon reflections on glass surfaces, cinematic wide shot"
     - Write 1-2 sentences. Maximum 200 characters.
     - This prompt will be used with AI image/video generators (Midjourney, Kling, RunwayML). Make it generator-ready.
- Do not include markdown fences.
- Do not explain the process.
`.trim();

const parseJsonResponse = (rawContent: string): any => {
  try {
    return JSON.parse(rawContent);
  } catch {
    const fencedMatch = rawContent.match(/\{[\s\S]*\}/);
    if (!fencedMatch) {
      throw new Error('A IA nao retornou JSON valido.');
    }
    return JSON.parse(fencedMatch[0]);
  }
};

const validatePromptBatch = (
  items: any[],
  payload: any,
  localFallbackRows: Set<number>
) => {
  const expectedRows = new Set(items.map((item) => item.row_number));
  const promptMap = new Map<number, { 
    prompt: string; 
    texto_adicional?: any; 
    protagonista_presente?: boolean; 
    extras_presentes?: boolean; 
  }>();

  for (const promptItem of payload?.prompts || []) {
    const rowNumber = Number(promptItem?.row_number || promptItem?.rowNumber);
    const prompt = sanitizePrompt(promptItem?.prompt || '');
    if (!expectedRows.has(rowNumber) || (!prompt && promptItem.texto_adicional === undefined)) continue;
    promptMap.set(rowNumber, { 
      prompt, 
      texto_adicional: promptItem.texto_adicional,
      protagonista_presente: promptItem.protagonista_presente,
      extras_presentes: promptItem.extras_presentes,
    });
  }

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
          extras_presentes: false,
        });
        localFallbackRows.add(item.row_number);
      }
    }
  }

  return promptMap;
};

const enforceVideoPromptGuards = (prompt: string) => {
  const normalized = sanitizePrompt(prompt);
  const hasAmbientCue = /ambient sound only|no dialogue|no voice-over|no voiceover/i.test(normalized);
  const audioClause = hasAmbientCue ? '' : ' Ambient sound only, no dialogue, no voice-over.';
  return sanitizePrompt(`${normalized}${audioClause}`);
};

const directGenerateBatchOpenAI = async ({
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
  batchItems: any[];
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
  const resolvedModel = resolveModel(model);
  const { name: langName, units: langUnits } = getLanguageDirectives(channelLanguage);
  
  const dynamicSrtInstructions = `${SRT_PIPELINE_SYSTEM_INSTRUCTIONS}\n\nCRITICAL UNIT OF MEASUREMENT RULE:\nAll units of measurement in titles, subtitle overlays, list points, charts, or any text visible in video/image assets MUST strictly use the: ${langUnits}. If the subtitle text mentions standard metric units (like Celsius or meters) but the target system is Imperial, you MUST dynamically convert them to the equivalent values (e.g. convert 25-40°C to 77-104°F, or 2 meters to 6 feet/yards) inside the 'text reading "..."' visual prompt directive.`
    .replaceAll('(usually Portuguese)', `(usually ${langName})`)
    .replaceAll('(Portuguese)', `(${langName})`)
    .replaceAll('in Portuguese', `in ${langName}`)
    .replaceAll('usually Portuguese', `usually ${langName}`);

  const dynamicFacelessHint = facelessHint
    .replaceAll('(usually Portuguese)', `(usually ${langName})`)
    .replaceAll('(Portuguese)', `(${langName})`)
    .replaceAll('in Portuguese', `in ${langName}`)
    .replaceAll('usually Portuguese', `usually ${langName}`);

  const requestBody: Record<string, unknown> = {
    model: resolvedModel,
    messages: [
      { 
        role: isReasoningModel(resolvedModel) ? 'developer' : 'system', 
        content: (() => {
          let systemPrompt = ultraCinematic 
            ? `${dynamicSrtInstructions}\n\nULTRA-CINEMATIC RULES:\n${ULTRA_CINEMATIC_INSTRUCTIONS_STR}`
            : dynamicSrtInstructions;
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
          dynamicFacelessHint || 'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
          'For every video prompt, include ambient sound only and explicitly exclude dialogue and voice-over.',
          JSON.stringify({ character_reference_optional: characterDescription, items: batchItems }, null, 2),
        ].filter(Boolean).join('\n\n'),
      },
    ],
    response_format: { type: 'json_object' },
  };

  if (!isReasoningModel(resolvedModel)) {
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

const directGenerateBatchGemini = async ({
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
  batchItems: any[];
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
  const resolvedModel = resolveModel(model);
  const { name: langName, units: langUnits } = getLanguageDirectives(channelLanguage);
  
  const dynamicSrtInstructions = `${SRT_PIPELINE_SYSTEM_INSTRUCTIONS}\n\nCRITICAL UNIT OF MEASUREMENT RULE:\nAll units of measurement in titles, subtitle overlays, list points, charts, or any text visible in video/image assets MUST strictly use the: ${langUnits}. If the subtitle text mentions standard metric units (like Celsius or meters) but the target system is Imperial, you MUST dynamically convert them to the equivalent values (e.g. convert 25-40°C to 77-104°F, or 2 meters to 6 feet/yards) inside the 'text reading "..."' visual prompt directive.`
    .replaceAll('(usually Portuguese)', `(usually ${langName})`)
    .replaceAll('(Portuguese)', `(${langName})`)
    .replaceAll('in Portuguese', `in ${langName}`)
    .replaceAll('usually Portuguese', `usually ${langName}`);

  const dynamicFacelessHint = facelessHint
    .replaceAll('(usually Portuguese)', `(usually ${langName})`)
    .replaceAll('(Portuguese)', `(${langName})`)
    .replaceAll('in Portuguese', `in ${langName}`)
    .replaceAll('usually Portuguese', `usually ${langName}`);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [
              ultraCinematic 
                ? (() => {
                    let systemPrompt = `${dynamicSrtInstructions}\n\nULTRA-CINEMATIC RULES:\n${ULTRA_CINEMATIC_INSTRUCTIONS_STR}`;
                    if (dnaInstructions) systemPrompt += `\n\n${dnaInstructions}`;
                    return systemPrompt;
                  })()
                : (() => {
                    let systemPrompt = dynamicSrtInstructions;
                    if (dnaInstructions) systemPrompt += `\n\n${dnaInstructions}`;
                    return systemPrompt;
                  })(),
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
              dynamicFacelessHint || 'IMPORTANT: Do NOT include the character in technical, abstract, or conceptual video prompts. The character is optional and contextual.',
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

const directGeneratePostScriptOpenAI = async ({
  apiKey,
  model,
  prompt,
  channelLanguage,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  channelLanguage?: string;
}) => {
  const resolvedModel = resolveModel(model);
  const { name: langName, code: langCode, units: langUnits } = getLanguageDirectives(channelLanguage);
  const dynamicInstructions = `${POST_SCRIPT_SYSTEM_INSTRUCTIONS}\n\nCRITICAL UNIT OF MEASUREMENT RULE:\nAll units of measurement in titles, subtitle overlays, list points, charts, or any text visible in video/image assets MUST strictly use the: ${langUnits}. If the subtitle text mentions standard metric units (like Celsius or meters) but the target system is Imperial, you MUST dynamically convert them to the equivalent values (e.g. convert 25-40°C to 77-104°F, or 2 meters to 6 feet/yards) inside the 'text reading "..."' visual prompt directive.`
    .replaceAll('Brazilian Portuguese', langName)
    .replaceAll('PT-BR', langCode);

  const requestBody: Record<string, unknown> = {
    model: resolvedModel,
    messages: [
      { role: isReasoningModel(resolvedModel) ? 'developer' : 'system', content: dynamicInstructions },
      { role: 'user', content: prompt },
    ],
    response_format: { type: 'json_object' },
  };

  if (!isReasoningModel(resolvedModel)) {
    requestBody.temperature = 0.8;
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
    throw new Error(data?.error?.message || 'Falha ao gerar pacote pos-roteiro com OpenAI.');
  }

  const content = data?.choices?.[0]?.message?.content;
  if (!content) throw new Error('A OpenAI respondeu sem conteudo para o pacote pos-roteiro.');
  return parseJsonResponse(content);
};

const directGeneratePostScriptGemini = async ({
  apiKey,
  model,
  prompt,
  channelLanguage,
}: {
  apiKey: string;
  model: string;
  prompt: string;
  channelLanguage?: string;
}) => {
  const resolvedModel = resolveModel(model);
  const { name: langName, code: langCode, units: langUnits } = getLanguageDirectives(channelLanguage);
  const dynamicInstructions = `${POST_SCRIPT_SYSTEM_INSTRUCTIONS}\n\nCRITICAL UNIT OF MEASUREMENT RULE:\nAll units of measurement in titles, subtitle overlays, list points, charts, or any text visible in video/image assets MUST strictly use the: ${langUnits}. If the subtitle text mentions standard metric units (like Celsius or meters) but the target system is Imperial, you MUST dynamically convert them to the equivalent values (e.g. convert 25-40°C to 77-104°F, or 2 meters to 6 feet/yards) inside the 'text reading "..."' visual prompt directive.`
    .replaceAll('Brazilian Portuguese', langName)
    .replaceAll('PT-BR', langCode);

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${resolvedModel}:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{
            text: [dynamicInstructions, prompt].join('\n\n'),
          }],
        }],
        generationConfig: {
          temperature: 0.8,
          response_mime_type: 'application/json',
        },
      }),
    }
  );

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data?.error?.message || 'Falha ao gerar pacote pos-roteiro com Gemini.');
  }

  const content = data?.candidates?.[0]?.content?.parts?.map((part: { text?: string }) => part.text || '').join('\n') || '';
  if (!content) throw new Error('O Gemini respondeu sem conteudo para o pacote pos-roteiro.');
  return parseJsonResponse(content);
};

const buildUserPrompt = ({
  approvedTheme,
  approvedBriefing,
  scriptBlocks,
  chapterAnchors,
  hfAnchors,
  timelineSource,
  projectContext,
  sfxPlan,
  titleCountHint,
  titleStructures,
}: {
  approvedTheme: string;
  approvedBriefing: any;
  scriptBlocks: any[];
  chapterAnchors: any[];
  hfAnchors: Array<{ timestamp: string; texto: string }>;
  timelineSource: 'srt' | 'estimated';
  projectContext?: any;
  sfxPlan: any;
  titleCountHint?: number;
  titleStructures?: any[];
}) => {
  const transcript = buildScriptTranscript(scriptBlocks);
  const titleStructuresStr = Array.isArray(titleStructures) && titleStructures.length > 0
    ? titleStructures.map(t => `- [${t.name}]: "${t.content_pattern}"`).join('\n')
    : '';

  const channelLanguage = projectContext?.channelLanguage || 'Português';
  const { code: langCode } = getLanguageDirectives(channelLanguage);

  return [
    'Build the complete post-script package for this approved video.',
    '',
    `TEMA: ${approvedTheme}`,
    `TITULO APROVADO: ${approvedBriefing?.title || approvedTheme}`,
    `VOZ DOMINANTE: ${approvedBriefing?.dominantVoice || 'Nao definida'}`,
    `FONTE DOS TIMESTAMPS: ${timelineSource === 'srt' ? 'timestamps derivados do SRT anexado' : 'timestamps estimados pelo roteiro aprovado'}`,
    '',
    'CONTEXTO DO PROJETO:',
    JSON.stringify(projectContext || {}, null, 2),
    '',
    titleStructuresStr ? 'ESTRUTURAS DE TITULO DA BIBLIOTECA NARRATIVA (MANDATORIO SE DISPONIVEIS):' : '',
    titleStructuresStr ? `${titleStructuresStr}\n` : '',
    `CAPITULOS EDITORIAIS DISPONIVEIS PARA A DESCRICAO SEO (use somente estes, em ordem crescente, com no maximo ${chapterAnchors.length} linhas):`,
    JSON.stringify(chapterAnchors, null, 2),
    '',
    'HYPERFRAME ANCHORS (Gere um hfContextTitles para CADA um destes timestamps exatos):',
    '-- Para cada anchor abaixo, o campo "bgPrompt" DEVE retratar visualmente o que esta sendo falado no campo "texto".',
    '-- O bgPrompt e um prompt cinematic em ingles para gerador de imagem/video (Midjourney, Kling, etc.).',
    '-- Descreva o CENARIO, AMBIENTE, LUZ e TEXTURA — nunca a pessoa ou avatar.',
    '-- IMPORTANTE: use o timestamp exatamente como aparece abaixo (formato [MM:SS]) — nao converta nem abrevie.',
    hfAnchors.length > 0 ? JSON.stringify(hfAnchors, null, 2) : 'Nenhum hyperframe detectado neste roteiro.',
    '',
    'PLANO DE SFX (Obrigatorio seguir a logica abaixo):',
    JSON.stringify({
      targetCount: sfxPlan.targetCount,
      minSpacingSeconds: sfxPlan.minSpacingSeconds,
      anchors: sfxPlan.anchors.map((anchor: any) => ({
        timestamp: anchor.timestamp,
        layer: anchor.layer,
        rationale: anchor.rationale,
        excerpt: anchor.excerpt,
      })),
    }, null, 2),
    '',
    'ROTEIRO FINAL:',
    transcript,
    '',
    'Important output expectations:',
    `- Generate exactly ${titleCountHint ?? 5} title options.`,
    titleStructuresStr
      ? `- CRITICAL: Each generated title MUST strictly follow one of the patterns listed in the ESTRUTURAS DE TITULO DA BIBLIOTECA NARRATIVA. Do not use generic patterns. Replace all bracketed placeholders (like [TEMA], [METAFORA], [TARGET], [Elemento Pequeno/Frágil], [Objeto], etc.) with specific, contextual details from the script and theme. RE-THEMING RULE: If a pattern is a concrete sentence/example (e.g. references "Magnésio-Quelato" or "alimento fit"), you MUST adapt and replace these subjects/nouns with the current video topic (e.g. "Creatina"). The output titles must be fully written in ${langCode} and must NOT contain any bracketed placeholders or unrelated subjects.`
      : `- Each title must organically combine these 5 structural components: hook tension + emotional promise + contrast + transformation + reward. Mix formats: questions, paradoxical affirmations, comparative phrases. Vary tones: provocative, philosophical, inspirational, narrative.`,
    '- Maximum 12 words per title. No technical jargon. Emotional, curious and intense language only.',
    '- SEO description should be only the opening paragraph, written in a human editorial voice.',
    '- Do not output timestamps or the AI notice; the app will add them after generation.',
    '- Make the opening paragraph sound like a real YouTube description, not like a system summary.',
    '- Suno prompt MUST be rich, specific, and thematic — directly referencing the emotional journey, subject matter, and atmosphere of this video.',
    '- Describe genre, mood, instruments, dynamics/evolution, and thematic references. Write multiple layers of description, not just one phrase.',
    '- The Suno prompt must not exceed 800 characters. Use as much of that space as needed to be evocative and specific.',
    '- AVOID generic openers like "Epic cinematic orchestral" unless grounded in the specific theme of this video.',
    '- SFX timeline should feel editorially useful for a human video editor.',
    '- In every EFEITO line, write only an English SFX name that is easy to search in CapCut PC.',
    '- In every TRECHO line, you MUST copy the exact text snippet provided in the "excerpt" field of the SFX plan. DO NOT summarize, paraphrase, or invent new text.',
    '- Use the three decision layers: structural anchors, semantic anchors and rhythmic anchors.',
    '- Do not create SFX events closer than 25 seconds from each other.',
    '- IMPORTANT: You MUST generate SFX events spanning the ENTIRE video duration, from the first anchor to the very last anchor. Do not stop early. Process all proposed anchors.',
    '- CRITICAL: Every hfContextTitles entry MUST include a non-empty "bgPrompt" field. This field must visually translate the "texto" excerpt of that anchor into a cinematic scene description in English. It must describe only environment, setting, light, and texture — never the person or avatar. Length: 1-2 sentences, max 200 chars.',
  ].join('\n');
};

const resolveCharacterProfileInFrontend = (
  mode: VideoCharacterMode,
  format: VideoFormat,
  projectName?: string,
  customDescription?: string,
  demographics?: string,
  visualIdentity?: string
): string => {
  if (format === 'catalog') {
    return 'premium documentary presentation slide style, clean minimalist off-white textured stucco background, high-fidelity details, soft drop shadows, clean graphic layout';
  }
  const resolvedCustomDescriptionRaw = String(customDescription || '').trim();
  const resolvedVisualIdentityRaw = String(visualIdentity || '').trim();

  if (resolvedCustomDescriptionRaw.includes('STYLE_DNA:')) {
    return resolvedCustomDescriptionRaw;
  }
  if (resolvedVisualIdentityRaw.includes('STYLE_DNA:')) {
    return resolvedVisualIdentityRaw;
  }

  const resolvedMode = mode === 'female' || mode === 'custom' ? mode : 'male';
  const resolvedCustomDescription = resolvedCustomDescriptionRaw.replace(/\s+/g, ' ');

  if (resolvedMode === 'custom' && resolvedCustomDescription) {
    return resolvedCustomDescription;
  }

  const resolvedProjectName = String(projectName || '').trim();
  const videoFormat = format || 'avatar';
  const resolvedDemographics = String(demographics || '').trim();
  const resolvedVisualIdentity = String(visualIdentity || '').trim();

  // 1. Detect Gender & Pronoun
  const isFemaleVisual = resolvedVisualIdentity.toLowerCase().includes('mulher') || 
                         resolvedVisualIdentity.toLowerCase().includes('senhora') || 
                         resolvedVisualIdentity.toLowerCase().includes('female') ||
                         resolvedDemographics.toLowerCase().includes('mulher') ||
                         resolvedDemographics.toLowerCase().includes('female');
  
  const finalMode = mode === 'custom' ? (isFemaleVisual ? 'female' : 'male') : mode;
  const pronoun = finalMode === 'female' ? 'her' : 'his';
  const noun = finalMode === 'female' ? 'female' : 'male';

  // 2. Detect Age
  let ageDescriptor = 'in early 30s';
  const ageLower = (resolvedDemographics + ' ' + resolvedVisualIdentity).toLowerCase();
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
  const roleLower = (resolvedProjectName + ' ' + resolvedDemographics).toLowerCase();
  if (roleLower.includes('dev') || roleLower.includes('tech') || roleLower.includes('software') || roleLower.includes('code') || roleLower.includes('arquiteto')) {
    roleDescriptor = finalMode === 'female' ? 'senior software architect and technology expert' : 'senior software engineer and technology expert';
  } else if (roleLower.includes('metabolismo') || roleLower.includes('saude') || roleLower.includes('longevidade') || roleLower.includes('vitalidade') || roleLower.includes('nutri') || roleLower.includes('health')) {
    roleDescriptor = 'health mentor and longevity educator';
  } else if (roleLower.includes('finan') || roleLower.includes('negocio') || roleLower.includes('money') || roleLower.includes('invest') || roleLower.includes('lucro')) {
    roleDescriptor = 'financial advisor and business strategist';
  } else if (resolvedProjectName) {
    roleDescriptor = `expert presenter and specialist in ${resolvedProjectName}`;
  }

  // 4. Detect Attire / Appearance Style from visualIdentity
  let clothingDescriptor = 'professional attire';
  const visualLower = resolvedVisualIdentity.toLowerCase();
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

interface SrtPipelineObserverStep {
  key: 'upload' | 'csv' | 'assets' | 'prompts' | 'render' | 'persist';
  label: string;
  status: SrtPipelineStepStatus;
  detail: string;
}

interface ExecutionSnapshot {
  approvedTheme: string;
  approvedBriefing: any;
  scriptBlocks: ScriptBlock[];
  scriptStage: ScriptStage;
  assemblerActive: boolean;
  thumbnailDirective: {
    visualConcept: string;
    viralTitle: string;
    thumbnailPromptNoText: string;
    thumbnailPromptWithPtBrText: string;
    thumbnailTextPtBr: string;
    tags: string[];
  } | null;
  showThumbnailPanel: boolean;
  thumbnailUrl: string;
  executionMode: ExecutionMode;
  externalScriptText: string;
  externalScriptFileName: string;
  externalSourceLabel: string;
  externalSrtText: string;
  externalSrtFileName: string;
  videoCharacterMode: VideoCharacterMode;
  videoCharacterCustom: string;
  videoFormat?: VideoFormat;
  manualPublishDate: string;
  externalSrtPipeline: SrtAssetPipelineResult | null;
  externalSrtObserver: SrtPipelineObserverStep[];
  postScriptPackage: PostScriptPackage | null;
  hfBgPrompts?: Array<{ rowNumber: number; prompt: string }> | null;
  visualBlueprintSetting?: string;
  visualBlueprintCast?: Array<{ name: string; description: string }>;
  forceAllAsVideo?: boolean;
  useHybridAssets?: boolean;
  assetAllocationMode?: AssetAllocationMode;
  ultraCinematic?: boolean;
  preserveBrackets?: boolean;
  promptPrefix?: string;
  pipelineVideos?: boolean;
  pipelineImages?: boolean;
  pipelineTexts?: boolean;
  pipelineHyperframes?: boolean;
  _themeId?: string; // stable ID to find the theme even after a title rename
  useAdvancedRetention?: boolean;
  selectedThumbnailStyle?: string;
  writingStyleSample?: string;
  externalFactCheckReport?: string | null;
  externalHumanizeReport?: string | null;
  pendingHumanizedText?: string | null;
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

  // Prefer content_pattern (structural template) over description (general summary)
  const supportText = asset?.pattern || asset?.description || '';
  const assetName = asset?.name || label;

  return `${label}: preserve a funcao estrategica do ativo "${assetName}" e reinterprete com formulacao propria. Nao reutilize frases, slogans, exemplos ou estruturas literais da biblioteca.${supportText ? ` Diretriz estrutural do ativo: ${supportText}` : ''}`;
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

const buildInitialSrtObserver = (): SrtPipelineObserverStep[] => [
  { key: 'upload', label: 'SRT anexado', status: 'pending', detail: 'Aguardando upload do arquivo de legendas.' },
  { key: 'csv', label: 'CSV base', status: 'pending', detail: 'A timeline CSV ainda nao foi derivada do .srt.' },
  { key: 'assets', label: 'Marcacao de assets', status: 'pending', detail: 'As linhas ainda nao foram classificadas em texto, avatar, video ou imagem.' },
  { key: 'prompts', label: 'Prompts visuais', status: 'pending', detail: 'Os prompts para imagem e video ainda nao foram gerados.' },
  { key: 'render', label: 'Render de texto', status: 'pending', detail: 'A etapa 5 ainda nao renderizou os assets marcados como texto.' },
  { key: 'persist', label: 'Persistencia', status: 'pending', detail: 'Nada salvo ainda no snapshot desta execucao.' },
];

const inferScriptStageFromSnapshot = (snapshot: any): ScriptStage => {
  if (snapshot?.scriptStage === 'final' || snapshot?.scriptStage === 'blueprint') {
    return snapshot.scriptStage;
  }

  if (typeof snapshot?.externalScriptText === 'string' && snapshot.externalScriptText.trim()) {
    return 'final';
  }

  const joined = Array.isArray(snapshot?.scriptBlocks)
    ? snapshot.scriptBlocks.map((block: { content?: string }) => String(block?.content || '')).join('\n')
    : '';

  if (!joined) return 'blueprint';

  const blueprintMarkers = /funcao narrativa|postura obrigatoria|diretriz estrutural|camada de abertura de referencia|transicao obrigatoria/i;
  return blueprintMarkers.test(joined) ? 'blueprint' : 'final';
};

export default function ScriptEngine({ activeProject: propProject, pendingData, onClearPending }: ScriptEngineProps) {
  // Zustand store takes priority for data isolation
  const storeProject = useActiveProject();
  const activeProject = storeProject || propProject;
  const activeAIConfig = (useProjectStore.getState() as any)?.activeAIConfig;

  const [selectedProject] = useState(activeProject?.name || 'Selecione um Projeto');
  const [scriptBlocks, setScriptBlocks] = useState<ScriptBlock[]>([]);
  const [scriptStage, setScriptStage] = useState<ScriptStage>('blueprint');
  const [thumbnailDirective, setThumbnailDirective] = useState<ExecutionSnapshot['thumbnailDirective']>(null);
  const [approvedTheme, setApprovedTheme] = useState('');
  const [approvedBriefing, setApprovedBriefing] = useState<any | null>(null);
  const [isGeneratingScript, setIsGeneratingScript] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<{
    currentIndex: number;
    completedCount: number;
    total: number;
    currentTitle: string;
    status: string;
  } | null>(null);
  const [mobileTab, setMobileTab] = useState<'context' | 'main'>('main');
  const [executionHydrated, setExecutionHydrated] = useState(false);
  const [assemblerActive, setAssemblerActive] = useState(true);
  const [showThumbnailPanel, setShowThumbnailPanel] = useState(false);
  const [thumbnailUrl, setThumbnailUrl] = useState('');
  const [executionMode, setExecutionMode] = useState<ExecutionMode>(activeProject?.default_execution_mode === 'external' ? 'external' : 'internal');
  const [externalScriptText, setExternalScriptText] = useState('');
  const [externalScriptFileName, setExternalScriptFileName] = useState('');
  const [externalSourceLabel, setExternalSourceLabel] = useState('');
  const [externalSrtText, setExternalSrtText] = useState('');
  const [externalSrtFileName, setExternalSrtFileName] = useState('');
  const [videoCharacterMode, setVideoCharacterMode] = useState<VideoCharacterMode>('custom');
  const [videoCharacterCustom, setVideoCharacterCustom] = useState('');
  const [videoFormat, setVideoFormat] = useState<VideoFormat>('avatar');
  const [preserveBrackets, setPreserveBrackets] = useState<boolean>(false);
  const [promptPrefix, setPromptPrefix] = useState<string>('none');
  const [forceAllAsVideo, setForceAllAsVideo] = useState<boolean>(false);
  const [useHybridAssets, setUseHybridAssets] = useState<boolean>(false);
  const [assetAllocationMode, setAssetAllocationMode] = useState<AssetAllocationMode>('hybrid_smart');
  const [ultraCinematic, setUltraCinematic] = useState<boolean>(false);
  const [pipelineVideos, setPipelineVideos] = useState<boolean>(true);
  const [pipelineImages, setPipelineImages] = useState<boolean>(true);
  const [pipelineTexts, setPipelineTexts] = useState<boolean>(true);
  const [pipelineHyperframes, setPipelineHyperframes] = useState<boolean>(true);
  const [isSuggestingStyle, setIsSuggestingStyle] = useState<boolean>(false);
  // Consistent Characters (Visual Blueprint & Cast)
  const [visualBlueprintSetting, setVisualBlueprintSetting] = useState<string>('');
  const [visualBlueprintCast, setVisualBlueprintCast] = useState<Array<{ name: string; description: string }>>([]);
  const [isExtractingVisuals, setIsExtractingVisuals] = useState<boolean>(false);
  const [textStyleMode, setTextStyleMode] = useState('auto');
  const [customTextStyle, setCustomTextStyle] = useState('');
  const [manualPublishDate, setManualPublishDate] = useState('');
  const [manualPublishDraftDate, setManualPublishDraftDate] = useState('');
  const [manualPublishDraftTime, setManualPublishDraftTime] = useState('');
  const [externalSrtPipeline, setExternalSrtPipeline] = useState<SrtAssetPipelineResult | null>(null);
  const [externalSrtObserver, setExternalSrtObserver] = useState<SrtPipelineObserverStep[]>(buildInitialSrtObserver);
  const [postScriptPackage, setPostScriptPackage] = useState<PostScriptPackage | null>(null);
  const [isProcessingSrtPipeline, setIsProcessingSrtPipeline] = useState(false);
  const [isRenderingTextAssets, setIsRenderingTextAssets] = useState(false);
  const [isGeneratingPostScriptPackage, setIsGeneratingPostScriptPackage] = useState(false);
  const [isRegeneratingFallbacks, setIsRegeneratingFallbacks] = useState(false);
  // HyperFrame Background Prompts
  const [hfBgPrompts, setHfBgPrompts] = useState<Array<{ rowNumber: number; prompt: string }> | null>(null);
  const [isGeneratingHfBg, setIsGeneratingHfBg] = useState(false);
  // Pipeline orquestrado (botão único)
  const [isPipelineRunning, setIsPipelineRunning] = useState(false);
  const [pipelineCurrentStep, setPipelineCurrentStep] = useState<string | null>(null);
  const _isPipelineMode = useRef(false);          // quando true, handlers lancam erro em vez de alert()
  const _pipelineResultRef  = useRef<any>(null);  // captura pipeline SRT entre setState assíncronos
  const _postScriptResultRef = useRef<any>(null); // captura pacote pós-roteiro entre setState assíncronos
  const [pipelineWarnings, setPipelineWarnings] = useState<string[]>([]); // avisos não-fatais
  // Template Studio
  const [isTemplateStudioExpanded, setIsTemplateStudioExpanded] = useState(false);
  const [isGeneratingTemplates, setIsGeneratingTemplates] = useState(false);
  const [templatePrimaryColor, setTemplatePrimaryColor] = useState('#00C8FF');
  const [templateSecondaryColor, setTemplateSecondaryColor] = useState('#00FF88');
  const [templateFontFamily, setTemplateFontFamily] = useState('Inter');
  const [templateStyleProfile, setTemplateStyleProfile] = useState('Tech');
  const [templateGenResult, setTemplateGenResult] = useState<{ total: number; missing: string[] } | null>(null);

  // Load Template Studio settings from localStorage
  useEffect(() => {
    if (activeProject?.id) {
      const saved = localStorage.getItem(`template_studio_${activeProject.id}`);
      if (saved) {
        try {
          const parsed = JSON.parse(saved);
          if (parsed.primaryColor) setTemplatePrimaryColor(parsed.primaryColor);
          if (parsed.secondaryColor) setTemplateSecondaryColor(parsed.secondaryColor);
          if (parsed.fontFamily) setTemplateFontFamily(parsed.fontFamily);
          if (parsed.styleProfile) setTemplateStyleProfile(parsed.styleProfile);
        } catch (e) { /* ignore */ }
      }
    }
  }, [activeProject?.id]);

  // Save Template Studio settings to localStorage
  useEffect(() => {
    if (activeProject?.id && templatePrimaryColor) {
      localStorage.setItem(`template_studio_${activeProject.id}`, JSON.stringify({
        primaryColor: templatePrimaryColor,
        secondaryColor: templateSecondaryColor,
        fontFamily: templateFontFamily,
        styleProfile: templateStyleProfile,
      }));
    }
  }, [templatePrimaryColor, templateSecondaryColor, templateFontFamily, templateStyleProfile, activeProject?.id]);
  const [isValidatingTitles, setIsValidatingTitles] = useState(false);
  const [titleValidations, setTitleValidations] = useState<(TitleValidationResult | null)[] | null>(null);
  const [isRegeneratingTitles, setIsRegeneratingTitles] = useState(false);
  const [srtPipelineStatus, setSrtPipelineStatus] = useState('');
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [pendingTitleUpdate, setPendingTitleUpdate] = useState<{ newTitle: string; oldTitle: string } | null>(null);
  const [storageUsageMB, setStorageUsageMB] = useState(0);

  const STORAGE_LIMIT_MB = 5;
  const STORAGE_WARN_THRESHOLD = 0.78; // warn at 78% (~3.9 MB)

  const checkStorageUsage = () => {
    try {
      let total = 0;
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        total += (localStorage.getItem(k) || '').length * 2; // UTF-16: 2 bytes per char
      }
      setStorageUsageMB(total / (1024 * 1024));
    } catch { /* ignore */ }
  };

  const showToast = (message: string) => {
    setToastMessage(message);
    setTimeout(() => setToastMessage(null), 2000);
  };
  const [expandedStageId, setExpandedStageId] = useState<string | null>(null);
  const [isTimelineExpanded, setIsTimelineExpanded] = useState(false);
  const [isCapcutExpanded, setIsCapcutExpanded] = useState(false);
  const [isStep5Expanded, setIsStep5Expanded] = useState(false);
  const [fcpxmlBaseDir, setFcpxmlBaseDir] = useState('D:/ContentFlow/assets/');
  const [fcpxmlNaming, setFcpxmlNaming] = useState<'index_prompt56' | 'index_only' | 'index_prompt_full'>('index_prompt56');
  const [fcpxmlVidDuration, setFcpxmlVidDuration] = useState(8.0);
  const [fcpxmlImgDuration, setFcpxmlImgDuration] = useState(5.0);
  const [fcpxmlAspectRatio, setFcpxmlAspectRatio] = useState<'horizontal' | 'vertical'>('horizontal');
  const [cutMode, setCutMode] = useState<'middle' | 'start' | 'end'>('middle');
  const [smartSpeedUp, setSmartSpeedUp] = useState(true);
  const [targetMinDuration, setTargetMinDuration] = useState(7.5);
  const [smartSlowDown, setSmartSlowDown] = useState(true);
  const [targetMaxDuration, setTargetMaxDuration] = useState(10.0);
  const [mainFolderHandle, setMainFolderHandle] = useState<any>(null);
  const [extraFolderHandle, setExtraFolderHandle] = useState<any>(null);
  const [scannedFilesMap, setScannedFilesMap] = useState<Record<number, { name: string; realDuration: number }>>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isPostPackageExpanded, setIsPostPackageExpanded] = useState(false);
  const mainScrollRef = useRef<HTMLDivElement | null>(null);
  const thumbnailPanelRef = useRef<HTMLDivElement | null>(null);
  const generationAbortRef = useRef<AbortController | null>(null);
  const generationStoppedRef = useRef(false);
  const hasHydratedRef = useRef(false);
  
  // BI Traceability States
  const [components, setComponents] = useState<any[]>([]);
  const [componentsHydrated, setComponentsHydrated] = useState(false);
  const [selectedHookId, setSelectedHookId] = useState<string>('h_S1');
  const [selectedCtaId, setSelectedCtaId] = useState<string>('cta_default');
  const [useAdvancedRetention, setUseAdvancedRetention] = useState<boolean>(false);
  const [selectedThumbnailStyle, setSelectedThumbnailStyle] = useState<string>('Default');
  const [isMobilePreview, setIsMobilePreview] = useState<boolean>(false);
  const [isHumanizingExternal, setIsHumanizingExternal] = useState<boolean>(false);
  const [isFactCheckingExternal, setIsFactCheckingExternal] = useState<boolean>(false);
  const [externalFactCheckReport, setExternalFactCheckReport] = useState<string | null>(null);
  const [isFactCheckReportExpanded, setIsFactCheckReportExpanded] = useState<boolean>(false);
  const [externalHumanizeReport, setExternalHumanizeReport] = useState<string | null>(null);
  const [pendingHumanizedText, setPendingHumanizedText] = useState<string | null>(null);
  const [isHumanizeReportExpanded, setIsHumanizeReportExpanded] = useState<boolean>(false);
  const [writingStyleSample, setWritingStyleSample] = useState<string>('');
  const executionStorageKey = activeProject?.id ? `ws_script_execution_${activeProject.id}` : null;
  const defaultExecutionMode: ExecutionMode = activeProject?.default_execution_mode === 'external' ? 'external' : 'internal';

  const resolveThemeStatusFromPublishDate = (dateValue: string, fallbackStatus = 'scripted') => {
    if (!dateValue) return fallbackStatus;

    const selected = new Date(dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`);
    if (Number.isNaN(selected.getTime())) return fallbackStatus;

    const today = new Date();

    if (dateValue.includes('T')) {
      return selected.getTime() <= today.getTime() ? 'published' : 'scheduled';
    }

    const selectedDay = new Date(selected);
    selectedDay.setHours(0, 0, 0, 0);

    const todayStart = new Date(today);
    todayStart.setHours(0, 0, 0, 0);

    if (selectedDay.getTime() < todayStart.getTime()) return 'published';
    if (selectedDay.getTime() > todayStart.getTime()) return 'scheduled';
    return 'scripted';
  };

  const getManualPublishDateParts = (dateValue: string) => {
    if (!dateValue) {
      return {
        date: '',
        time: '',
      };
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dateValue)) {
      return {
        date: dateValue.slice(0, 10),
        time: dateValue.slice(11, 16),
      };
    }

    if (/^\d{4}-\d{2}-\d{2}$/.test(dateValue)) {
      return {
        date: dateValue,
        time: '',
      };
    }

    return {
      date: '',
      time: '',
    };
  };

  const updateManualPublishDate = (nextDate: string, nextTime: string) => {
    if (!nextDate) {
      setManualPublishDate('');
      return;
    }

    if (nextTime) {
      setManualPublishDate(`${nextDate}T${nextTime}`);
      return;
    }

    setManualPublishDate(nextDate);
  };

  const composeManualPublishDate = (nextDate: string, nextTime: string) => {
    if (!nextDate) return '';
    if (nextTime) return `${nextDate}T${nextTime}`;
    return nextDate;
  };

  const formatManualPublishTrace = (dateValue: string) => {
    if (!dateValue) return 'Sem agendamento manual definido.';

    const parsed = new Date(dateValue.includes('T') ? dateValue : `${dateValue}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return dateValue;

    if (dateValue.includes('T')) {
      return parsed.toLocaleString('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
      });
    }

    return parsed.toLocaleDateString('pt-BR');
  };

  useEffect(() => {
    void fetchComponents();
  }, [activeProject?.id]);

  useEffect(() => {
    if (activeProject && (!videoCharacterCustom || videoCharacterCustom.trim() === '')) {
      const channelStyle = activeProject?.editing_sop?.visual_identity || activeProject?.visual_identity || '';
      const resolved = resolveCharacterProfileInFrontend(
        'custom',
        videoFormat,
        activeProject?.name || activeProject?.project_name,
        undefined,
        activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience,
        channelStyle
      );
      setVideoCharacterCustom(resolved);
    }
  }, [activeProject?.id, videoFormat]);

  useEffect(() => {
    const parts = getManualPublishDateParts(manualPublishDate);
    setManualPublishDraftDate(parts.date);
    setManualPublishDraftTime(parts.time);
  }, [manualPublishDate]);

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
        const THEME_CLOUD_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        if (!THEME_CLOUD_ID_PATTERN.test(projectId)) {
             console.warn('⚠️ O ID deste projeto não é compatível com a Nuvem (não é um UUID). O Sincronizador Backend está desativado para esta instância.', projectId);
             return;
        }

        const fetchPromise = supabase.from('narrative_components').select('*').eq('project_id', projectId);
        const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Supabase Timeout')), 8000));
        
        const response: any = await Promise.race([fetchPromise, timeoutPromise]);
        
        if (response.error) throw response.error;
        
        const cloudData = response.data || [];
        const merged = dedupeNarrativeComponents(mergeNarrativeComponents(localItems, cloudData));
        
        // ⬆️ AUTO-PUSH UNSYNCED ITEMS TO CLOUD
        const cloudIds = new Set(cloudData.map((c: any) => c.id));
        const unsyncedItems = localItems.filter(l => l.id && !cloudIds.has(l.id));
        
        if (unsyncedItems.length > 0) {
          console.log(`[ScriptEngine] ⬆️ Auto-syncing ${unsyncedItems.length} pending local items to cloud...`);
          supabase.from('narrative_components').upsert(
            unsyncedItems.map(item => ({
              id: item.id || crypto.randomUUID(),
              project_id: projectId,
              type: item.type,
              name: item.name,
              description: item.description,
              content_pattern: item.content_pattern,
              category: item.category || item.type,
              behavior_flag: item.behavior_flag || 'rotative',
              usage_mode: item.usage_mode || 'when_compatible',
              is_active: item.is_active !== false,
              tags: item.tags || [],
              compatibility_notes: item.compatibility_notes || ''
            }))
          ).then(({ error: upsertError }: { error: any }) => {
            if (upsertError) {
              console.warn('⚠️ Falha no auto-sync ScriptEngine (em background):', upsertError.message || upsertError);
            } else {
              console.log('✅ Auto-sync concluído.');
            }
          });
        }

        const mergedStr = JSON.stringify(merged);
        if (mergedStr !== JSON.stringify(localItems)) {
          setComponents(merged);
          localStorage.setItem(`ws_narrative_${projectId}`, mergedStr);
          console.log(`[ScriptEngine] ☁️ Background Sync applied: ${cloudData.length} cloud, ${merged.length} merged`);
        }
      }
    } catch (e: any) {
      console.warn('[ScriptEngine] Erro ao buscar/sincronizar componentes:', e.message);
      // keeps using localItems without resetting them
    }
  };

  const suggestVisualStyleWithAI = async () => {
    const channelStyle = activeProject?.editing_sop?.visual_identity || activeProject?.visual_identity || '';
    const videoTheme = approvedBriefing?.title || approvedTheme || pendingData?.title || pendingData?.raw_theme || '';

    const fallbackSuggest = () => {
      const resolved = resolveCharacterProfileInFrontend(
        'custom',
        videoFormat,
        activeProject?.name || activeProject?.project_name,
        undefined,
        activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience,
        channelStyle
      );
      setVideoCharacterCustom(resolved);
      persistExecutionSnapshotLocally({ videoCharacterCustom: resolved });
      showToast('⚠️ Usando sugestão heurística local (configure sua chave de API nos Ajustes Globais para a sugestão com IA).');
    };

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    if (!apiKey) {
      fallbackSuggest();
      return;
    }

    setIsSuggestingStyle(true);
    try {
      const prompt = `Dada a identidade visual base do canal e o tema específico do vídeo atual, gere um objeto JSON estruturado de direção de arte reutilizável para a criação de prompts visuais consistentes.

Identidade Visual Base do Canal:
"${channelStyle || 'Estilo cinematográfico realista'}"

Tema do Vídeo Atual:
"${videoTheme || 'Vídeo educativo informativo'}"

Retorne APENAS um objeto JSON válido contendo exatamente as seguintes chaves (as chaves devem ser escritas exatamente como listadas abaixo):
{
  "tipo_de_arte": "...",
  "paleta_de_cores": "...",
  "iluminacao": "...",
  "personagens": "...",
  "cenario": "...",
  "composicao": "...",
  "textura": "...",
  "atmosfera": "...",
  "regras_obrigatorias": ["...", "..."],
  "negative_prompt": "..."
}

Adapte e enriqueça os detalhes em inglês para o tema atual. Não adicione explicações ou markdown fora do JSON.`;

      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          prompt,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject?.ai_engine_rules,
          responseType: 'json'
        })
      });

      if (!res.ok) {
        throw new Error(`Erro na API: ${res.status}`);
      }

      const data = await res.json();
      let text = '';
      if (engine === 'gemini') {
        text = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        text = data.choices?.[0]?.message?.content || '';
      }

      // Validação de JSON básico antes de setar
      const cleanText = text.trim().replace(/^```json\s*/i, '').replace(/```$/, '').trim();
      JSON.parse(cleanText); // verifica se lança exceção

      setVideoCharacterCustom(cleanText);
      persistExecutionSnapshotLocally({ videoCharacterCustom: cleanText });
      showToast('✨ Estilo visual em JSON gerado com sucesso por IA!');
    } catch (err) {
      console.warn('[ScriptEngine] Erro ao sugerir estilo com IA, usando fallback:', err);
      fallbackSuggest();
    } finally {
      setIsSuggestingStyle(false);
    }
  };

  const buildExecutionSnapshot = (overrides: Partial<ExecutionSnapshot> = {}): ExecutionSnapshot => ({
    approvedTheme,
    approvedBriefing,
    scriptBlocks,
    scriptStage,
    assemblerActive,
    thumbnailDirective,
    showThumbnailPanel,
    thumbnailUrl,
    executionMode,
    externalScriptText,
    externalScriptFileName,
    externalSourceLabel,
    externalSrtText,
    externalSrtFileName,
    videoCharacterMode,
    videoCharacterCustom,
    videoFormat,
    manualPublishDate,
    externalSrtPipeline,
    externalSrtObserver,
    postScriptPackage,
    hfBgPrompts,
    visualBlueprintSetting,
    visualBlueprintCast,
    forceAllAsVideo,
    useHybridAssets,
    assetAllocationMode,
    ultraCinematic,
    preserveBrackets,
    promptPrefix,
    useAdvancedRetention,
    pipelineVideos,
    pipelineImages,
    pipelineTexts,
    pipelineHyperframes,
    selectedThumbnailStyle,
    writingStyleSample,
    externalFactCheckReport,
    externalHumanizeReport,
    pendingHumanizedText,
    _themeId: overrides._themeId || (typeof window !== 'undefined' && activeProject?.id ? sessionStorage.getItem(`active_script_theme_${activeProject.id}`) || undefined : undefined) || (approvedBriefing as any)?.id || (approvedBriefing as any)?.themeId || undefined,
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
    // Primary search: by title. Fallback: by theme ID stored in the snapshot (handles renamed themes)
    const snapshotThemeId = (executionSnapshot as any)?._themeId || null;
    let themeIndex = existingThemes.findIndex((item: any) =>
      item?.title?.trim().toLowerCase() === themeTitle.trim().toLowerCase()
    );
    if (themeIndex < 0 && snapshotThemeId) {
      themeIndex = existingThemes.findIndex((item: any) => item?.id === snapshotThemeId);
    }
    const targetPublishDate = (executionSnapshot?.manualPublishDate ?? manualPublishDate) || '';
    const scheduleStatus = resolveThemeStatusFromPublishDate(targetPublishDate, 'scripted');

    const existingTheme = themeIndex >= 0 ? existingThemes[themeIndex] : null;

    // Resolve pipeline_level: preserva o valor existente do tema no banco;
    // lê do briefing (agora preenchido pelo Assembler V16) e randomiza da
    // jornada tática como fallback — evitando que todos fiquem fixos em T1.
    const tacticalJourneys = activeProject?.playlists?.tactical_journey || [];
    const resolvedPipelineLevel =
      existingTheme?.pipeline_level ||
      briefing?.pipelineLevel ||
      (tacticalJourneys.length > 0
        ? tacticalJourneys[Math.floor(Math.random() * tacticalJourneys.length)]?.label
        : '') ||
      '';

    // Resolve editorial_pillar: lê do briefing (agora preenchido pelo Assembler V16
    // a partir de editorial_line.pillars) com fallback para randomização local.
    const rawPillars = activeProject?.editorial_line?.pillars
      || activeProject?.editorial_pillars
      || [];
    const pillarList: string[] = (Array.isArray(rawPillars) ? rawPillars : [])
      .map((p: any) => typeof p === 'string' ? p : p?.name || p?.label || '')
      .filter(Boolean);
    const resolvedEditorialPillar =
      existingTheme?.editorial_pillar ||
      briefing?.editorialPillar ||
      (pillarList.length > 0
        ? pillarList[Math.floor(Math.random() * pillarList.length)]
        : '') ||
      '';

    // Resolve title_structure: prefere o nome da estrutura selecionada no briefing;
    // cai para o valor que já estava gravado no tema, nunca sobrescreve com vazio.
    const resolvedTitleStructure =
      briefing?.selectedTitleStructure?.name ||
      existingTheme?.title_structure ||
      '';

    // Description rastreável: inclui estrutura e pilar para diferenciar cada tema.
    const structureLabel = briefing?.selectedTitleStructure?.name
      ? ` · Estrutura: ${briefing.selectedTitleStructure.name}`
      : '';
    const pillarLabel = resolvedEditorialPillar ? ` · Pilar: ${resolvedEditorialPillar}` : '';
    const resolvedDescription =
      existingTheme?.description ||
      `Tema aprovado manualmente na Escrita Criativa para o projeto ${activeProject?.name || activeProject?.project_name || 'ativo'}${structureLabel}${pillarLabel}.`;

    const themeId = existingTheme?.id || crypto.randomUUID();

    // 1. Prepare the full production_assets
    const fullProductionAssets = {
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
      // Only store file NAMES, not full text content — text is stored in ws_script_execution_* keys to avoid filling localStorage
      external_script_text: '',    // stripped to save space; lives in ws_script_execution_*
      external_file_name: executionSnapshot?.externalScriptFileName || '',
      external_source_label: executionSnapshot?.externalSourceLabel || '',
      external_srt_text: '',       // stripped to save space; lives in ws_script_execution_*
      external_srt_file_name: executionSnapshot?.externalSrtFileName || '',
      target_publish_date: targetPublishDate || null,
      schedule_status: scheduleStatus,
      execution_snapshot: executionSnapshot || null,
    };

    // 2. Strip ALL large fields from execution_snapshot for the themes list.
    //    Large texts (script, SRT, script blocks) only need to live in the workspace key.
    //    The themes index is for metadata and resume navigation, not for storing full content.
    const compactExecutionSnapshot = executionSnapshot ? {
      approvedTheme: executionSnapshot.approvedTheme,
      approvedBriefing: executionSnapshot.approvedBriefing,
      scriptStage: executionSnapshot.scriptStage,
      assemblerActive: executionSnapshot.assemblerActive,
      thumbnailDirective: executionSnapshot.thumbnailDirective,
      showThumbnailPanel: executionSnapshot.showThumbnailPanel,
      thumbnailUrl: executionSnapshot.thumbnailUrl,
      executionMode: executionSnapshot.executionMode,
      externalScriptFileName: executionSnapshot.externalScriptFileName,
      externalSourceLabel: executionSnapshot.externalSourceLabel,
      externalSrtFileName: executionSnapshot.externalSrtFileName,
      videoCharacterMode: executionSnapshot.videoCharacterMode,
      videoCharacterCustom: executionSnapshot.videoCharacterCustom,
      videoFormat: executionSnapshot.videoFormat,
      manualPublishDate: executionSnapshot.manualPublishDate,
      visualBlueprintSetting: executionSnapshot.visualBlueprintSetting,
      visualBlueprintCast: executionSnapshot.visualBlueprintCast,
      forceAllAsVideo: executionSnapshot.forceAllAsVideo,
      useHybridAssets: executionSnapshot.useHybridAssets,
      assetAllocationMode: executionSnapshot.assetAllocationMode,
      ultraCinematic: executionSnapshot.ultraCinematic,
      preserveBrackets: executionSnapshot.preserveBrackets,
      promptPrefix: executionSnapshot.promptPrefix,
      pipelineVideos: executionSnapshot.pipelineVideos,
      pipelineImages: executionSnapshot.pipelineImages,
      pipelineTexts: executionSnapshot.pipelineTexts,
      pipelineHyperframes: executionSnapshot.pipelineHyperframes,
      // Stripped: externalScriptText, externalSrtText, scriptBlocks, externalSrtPipeline, postScriptPackage, externalSrtObserver
      scriptBlocks: [],     // stripped - regenerated from briefing when needed
      externalScriptText: '',  // stripped
      externalSrtText: '',     // stripped
      externalSrtPipeline: undefined,
      postScriptPackage: undefined,
      externalSrtObserver: [],
      _hasSrtPipeline: !!executionSnapshot.externalSrtPipeline,
      _hasPostPackage: !!executionSnapshot.postScriptPackage,
      _themeId: themeId,
      _isCompact: true,
    } : null;

    const compactProductionAssets = {
      ...fullProductionAssets,
      execution_snapshot: compactExecutionSnapshot,
    };

    // 3. Save the COMPACT execution snapshot in a dedicated key for this theme.
    //    The large objects (SRT pipeline, post-script) live in _srt_pipeline / _post_package keys
    //    and don't need to be duplicated here — that was causing QuotaExceededErrors.
    if (compactExecutionSnapshot) {
      try {
        localStorage.setItem(`snapshot_${themeId}`, JSON.stringify(compactExecutionSnapshot));
      } catch (e) {
        console.warn(`[ScriptEngine] Failed to save dedicated snapshot for theme ${themeId}`, e);
      }
    }

    const themePayload = {
      id: themeId,
      title: themeTitle,
      description: resolvedDescription,
      editorial_pillar: resolvedEditorialPillar,
      status: scheduleStatus,
      title_structure: resolvedTitleStructure,
      selected_structure: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || existingTheme?.selected_structure || '',
      title_structure_asset_id: briefing?.selectedTitleStructure?.id || briefing?.assetLog?.titleStructure || existingTheme?.title_structure_asset_id || null,
      pipeline_level: resolvedPipelineLevel,
      is_demand_vetted: true,
      is_persona_vetted: true,
      refined_title: themeTitle,
      priority: Number(existingTheme?.priority || 0),
      notes: existingTheme?.notes || 'Origem: tema manual aprovado na Escrita Criativa.',
      target_publish_date: targetPublishDate || null,
      match_score: Number(briefing?.diagnostics?.noveltyScore || 0),
      demand_views: existingTheme?.demand_views || '',
      production_assets: compactProductionAssets,
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
        created_at: new Date().toISOString(),
      });
    }
    
    // Storage cloud-only
    try {
      // Local caching of themes disabled to avoid 10MB quota limit
    } catch (e) {
      console.warn('[ScriptEngine] Quota exceeded saving themes locally.', e);
    }

    if (!supabase) return;

    try {
      const cloudThemePayload = {
        project_id: themePayload.project_id,
        user_id: themePayload.user_id,
        title: themePayload.title,
        description: themePayload.description,
        editorial_pillar: themePayload.editorial_pillar,
        status: themePayload.status,
        hook_id: null,
        title_structure: themePayload.title_structure,
        priority: themePayload.priority,
        notes: themePayload.notes,
        target_publish_date: themePayload.target_publish_date ?? null,
        updated_at: themePayload.updated_at,
        production_assets: compactProductionAssets,
      };

      let remoteId = existingTheme?.id;

      if (remoteId) {
        const existingRemoteById = await supabase
          .from('themes')
          .select('id')
          .eq('id', remoteId)
          .limit(1);
          
        if (!existingRemoteById.data || !existingRemoteById.data[0]) {
           remoteId = undefined; // ID not found in remote, fallback to title
        }
      }

      if (!remoteId) {
        const existingRemoteByTitle = await supabase
          .from('themes')
          .select('id')
          .eq('project_id', activeProject.id)
          .ilike('title', themeTitle)
          .limit(1);
          
        if (existingRemoteByTitle.data && existingRemoteByTitle.data[0]) {
          remoteId = existingRemoteByTitle.data[0].id;
        }
      }

      if (remoteId) {
        await supabase.from('themes').update(cloudThemePayload).eq('id', remoteId);
      } else {
        await supabase.from('themes').insert({
          ...cloudThemePayload,
          id: existingTheme?.id || crypto.randomUUID(),
          created_at: new Date().toISOString(),
        });
      }

      if (themeId && executionSnapshot) {
        await upsertScriptExecution(themeId, executionSnapshot);
        console.log('[ScriptEngine] Sincronizado snapshot completo do tema em script_executions na nuvem.');
      }
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao sincronizar tema manual com o Banco de Temas.', error);
    }
  };

  const isFinishedTheme = (tId?: string, title?: string): boolean => {
    if (!activeProject?.id) return false;
    try {
      const themesKey = `themes_${activeProject.id}`;
      const themes = JSON.parse(localStorage.getItem(themesKey) || '[]');
      
      let t = null;
      if (tId) {
        t = themes.find((theme: any) => theme?.id === tId);
      }
      if (!t && title) {
        t = themes.find((theme: any) => 
          theme?.title?.trim().toLowerCase() === title.trim().toLowerCase()
        );
      }
      if (!t) return false;

      const dateValue = t.target_publish_date || t.production_assets?.target_publish_date || null;
      const status = t.status || '';
      
      // If status is published or scheduled, it is finished
      if (status === 'published' || status === 'scheduled') return true;

      if (dateValue) {
        const selected = new Date(dateValue.includes("T") ? dateValue : `${dateValue}T00:00:00`);
        if (!Number.isNaN(selected.getTime())) {
          const today = new Date();
          if (dateValue.includes("T")) {
            return true;
          }
          const selectedDay = new Date(selected);
          selectedDay.setHours(0, 0, 0, 0);
          const todayStart = new Date(today);
          todayStart.setHours(0, 0, 0, 0);
          if (selectedDay.getTime() <= todayStart.getTime()) return true; // published
          return true; // scheduled
        }
      }
    } catch (e) {
      console.warn('[ScriptEngine] Error checking if theme is finished:', e);
    }
    return false;
  };

  useEffect(() => {
    hasHydratedRef.current = false;
    setExecutionHydrated(false);
  }, [executionStorageKey]);

  useEffect(() => {
    if (!executionStorageKey) {
      setExecutionHydrated(true);
      return;
    }

    if (hasHydratedRef.current) return;
    hasHydratedRef.current = true;

    try {
      let snapshot: any = null;
      
      // If we received pendingData that has an approvedTheme, it's a resume from ThemeBank.
      // We should hydrate directly from it instead of localStorage.
      if (pendingData && pendingData.approvedTheme) {
        snapshot = pendingData;
      } else if (!pendingData) {
        // Otherwise, if there is no pendingData (e.g. F5 reload), load from localStorage
        const raw = localStorage.getItem(executionStorageKey);
        if (raw) snapshot = JSON.parse(raw);
      }

      // Check if the loaded snapshot is a finished theme in the bank
      if (snapshot && !pendingData && !snapshot._isResume) {
        const themeIdForCheck = snapshot._themeId || snapshot.themeId || snapshot.id;
        const titleForCheck = snapshot.approvedTheme || snapshot.approvedBriefing?.title || snapshot.title || snapshot.raw_theme || '';
        if (isFinishedTheme(themeIdForCheck, titleForCheck)) {
          console.log('[ScriptEngine] Snapshot represents an already finished/published theme. Auto-syncing and clearing state.');
          
          const autoSyncAndClear = async () => {
            if (themeIdForCheck && supabase) {
              try {
                let fullSnapshot = { ...snapshot };
                const srtPipelineKey = `${executionStorageKey}_srt_pipeline`;
                const postPackageKey = `${executionStorageKey}_post_package`;
                const hfKey = `yt_hf_bg_${executionStorageKey}`;
                
                const localSrt = localStorage.getItem(srtPipelineKey);
                if (localSrt) {
                  fullSnapshot.externalSrtPipeline = JSON.parse(localSrt);
                }
                const localPost = localStorage.getItem(postPackageKey);
                if (localPost) {
                  fullSnapshot.postScriptPackage = JSON.parse(localPost);
                }
                const localHf = localStorage.getItem(hfKey);
                if (localHf) {
                  fullSnapshot.hfBgPrompts = JSON.parse(localHf);
                }

                await upsertScriptExecution(themeIdForCheck, fullSnapshot);
                console.log('[ScriptEngine] Auto-synced finished theme heavy assets to Supabase.');
              } catch (e) {
                console.warn('[ScriptEngine] Failed to auto-sync heavy assets before clear:', e);
              }
            }
            clearExecutionState();
          };

          autoSyncAndClear();
          snapshot = null;
        }
      }

      // If there is still pendingData (but no approvedTheme), it's a new generation. 
      // We skip hydration and let the Assembler V4 effect handle it.
      if (!snapshot && pendingData) {
        setExecutionHydrated(true);
        return;
      }

      // NEW: Check if the snapshot represents a finished (scheduled/published) script
      if (snapshot && snapshot.manualPublishDate && !pendingData) {
        const activeSessionThemeId = sessionStorage.getItem(`active_script_theme_${activeProject.id}`);
        const isCurrentlyActiveSession = activeSessionThemeId && (activeSessionThemeId === snapshot._themeId || activeSessionThemeId === snapshot.themeId || activeSessionThemeId === snapshot.id);

        if (snapshot._isResume || isCurrentlyActiveSession) {
          // Deliberate resume or active session refresh: allow hydration
          console.log('[ScriptEngine] Resuming/hydrating scheduled script in active session.');
          if (snapshot._themeId) {
            sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot._themeId);
          } else if (snapshot.themeId) {
            sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot.themeId);
          }

          if (snapshot._isResume) {
            delete snapshot._isResume;
            try {
              localStorage.setItem(executionStorageKey, JSON.stringify(snapshot));
            } catch { /* ignore */ }
          }
        } else {
          // Navigating via sidebar: bypass hydration of finished script to keep workspace clean
          console.log('[ScriptEngine] Bypassing hydration of finished/scheduled script for a clean workspace.');
          clearExecutionState();
          setExecutionHydrated(true);
          return;
        }
      }

      if (snapshot) {
        if (snapshot._themeId) {
          sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot._themeId);
        } else if (snapshot.themeId) {
          sessionStorage.setItem(`active_script_theme_${activeProject.id}`, snapshot.themeId);
        }
      }

      if (!snapshot) {
        if (supabase) {
          const loadFromCloud = async () => {
            try {
              const activeSessionThemeId = sessionStorage.getItem(`active_script_theme_${activeProject.id}`);
              console.log(`[ScriptEngine] Nenhum snapshot local para o projeto ${activeProject.id}. Tentando carregar execução da nuvem... activeSessionThemeId: ${activeSessionThemeId}`);
              
              let query = supabase
                .from('script_executions')
                .select('*');
                
              if (activeSessionThemeId) {
                query = query.eq('theme_id', activeSessionThemeId);
              } else {
                query = query.eq('project_id', activeProject.id).order('updated_at', { ascending: false });
              }
              
              const { data, error } = await query.limit(1);
              
              if (error) throw error;
              if (data && data[0] && data[0].execution_snapshot) {
                const cloudSnapshot = data[0].execution_snapshot;
                
                // NEW: Bypass cloud hydration if the script has already been scheduled/published
                // (Only bypass if we are NOT in an active session refresh for a specific theme)
                const cloudThemeId = cloudSnapshot._themeId || cloudSnapshot.themeId || cloudSnapshot.id;
                const cloudTitle = cloudSnapshot.approvedTheme || cloudSnapshot.approvedBriefing?.title || cloudSnapshot.title || cloudSnapshot.raw_theme || '';
                const isCloudThemeFinished = isFinishedTheme(cloudThemeId, cloudTitle);
                if ((cloudSnapshot.manualPublishDate || isCloudThemeFinished) && !activeSessionThemeId) {
                  console.log('[ScriptEngine] Cloud snapshot is already scheduled/published or finished. Bypassing cloud hydration.');
                  clearExecutionState();
                  setExecutionHydrated(true);
                  return;
                }

                console.log(`[ScriptEngine] Encontrado snapshot de execução na nuvem para o tema: ${cloudSnapshot.approvedTheme}. Reidratando workspace...`);
                
                if (cloudSnapshot.approvedTheme) setApprovedTheme(cloudSnapshot.approvedTheme);
                if (cloudSnapshot.approvedBriefing) setApprovedBriefing(cloudSnapshot.approvedBriefing);
                const normalizedSnapshotBlocks = resolveSnapshotBlocks(cloudSnapshot);
                if (normalizedSnapshotBlocks.length > 0) {
                  setScriptBlocks(normalizedSnapshotBlocks);
                }
                setScriptStage(inferScriptStageFromSnapshot(cloudSnapshot));
                if (typeof cloudSnapshot.assemblerActive === 'boolean') setAssemblerActive(cloudSnapshot.assemblerActive);
                if (cloudSnapshot.thumbnailDirective) setThumbnailDirective(cloudSnapshot.thumbnailDirective);
                if (typeof cloudSnapshot.showThumbnailPanel === 'boolean') setShowThumbnailPanel(cloudSnapshot.showThumbnailPanel);
                if (typeof cloudSnapshot.thumbnailUrl === 'string') setThumbnailUrl(cloudSnapshot.thumbnailUrl);
                if (cloudSnapshot.executionMode === 'external' || cloudSnapshot.executionMode === 'internal') setExecutionMode(cloudSnapshot.executionMode);
                if (typeof cloudSnapshot.externalScriptText === 'string') setExternalScriptText(cloudSnapshot.externalScriptText);
                if (typeof cloudSnapshot.externalScriptFileName === 'string') setExternalScriptFileName(cloudSnapshot.externalScriptFileName);
                if (typeof cloudSnapshot.externalSourceLabel === 'string') setExternalSourceLabel(cloudSnapshot.externalSourceLabel);
                if (typeof cloudSnapshot.externalSrtText === 'string') setExternalSrtText(cloudSnapshot.externalSrtText);
                if (typeof cloudSnapshot.externalSrtFileName === 'string') setExternalSrtFileName(cloudSnapshot.externalSrtFileName);
                if (['male', 'female', 'custom'].includes(cloudSnapshot.videoCharacterMode)) setVideoCharacterMode(cloudSnapshot.videoCharacterMode);
                if (typeof cloudSnapshot.videoCharacterCustom === 'string') setVideoCharacterCustom(cloudSnapshot.videoCharacterCustom);
                if (['faceless', 'avatar', 'vlog', 'avatar_flow', 'catalog'].includes(cloudSnapshot.videoFormat)) setVideoFormat(cloudSnapshot.videoFormat);
                if (typeof cloudSnapshot.manualPublishDate === 'string') setManualPublishDate(cloudSnapshot.manualPublishDate);
                if (typeof cloudSnapshot.visualBlueprintSetting === 'string') setVisualBlueprintSetting(cloudSnapshot.visualBlueprintSetting);
                if (Array.isArray(cloudSnapshot.visualBlueprintCast)) setVisualBlueprintCast(cloudSnapshot.visualBlueprintCast);
                if (typeof cloudSnapshot.forceAllAsVideo === 'boolean') setForceAllAsVideo(cloudSnapshot.forceAllAsVideo);
                if (typeof cloudSnapshot.useHybridAssets === 'boolean') setUseHybridAssets(cloudSnapshot.useHybridAssets);
                if (['hybrid_smart', 'force_all_video', 'alternating', 'all_image'].includes(cloudSnapshot.assetAllocationMode)) setAssetAllocationMode(cloudSnapshot.assetAllocationMode);
                if (typeof cloudSnapshot.ultraCinematic === 'boolean') setUltraCinematic(cloudSnapshot.ultraCinematic);
                if (typeof cloudSnapshot.preserveBrackets === 'boolean') setPreserveBrackets(cloudSnapshot.preserveBrackets);
                if (typeof cloudSnapshot.promptPrefix === 'string') setPromptPrefix(cloudSnapshot.promptPrefix);
                if (typeof cloudSnapshot.pipelineVideos === 'boolean') setPipelineVideos(cloudSnapshot.pipelineVideos);
                if (typeof cloudSnapshot.pipelineImages === 'boolean') setPipelineImages(cloudSnapshot.pipelineImages);
                if (typeof cloudSnapshot.pipelineTexts === 'boolean') setPipelineTexts(cloudSnapshot.pipelineTexts);
                if (typeof cloudSnapshot.pipelineHyperframes === 'boolean') setPipelineHyperframes(cloudSnapshot.pipelineHyperframes);
                if (typeof cloudSnapshot.useAdvancedRetention === 'boolean') setUseAdvancedRetention(cloudSnapshot.useAdvancedRetention);
                if (typeof cloudSnapshot.selectedThumbnailStyle === 'string') setSelectedThumbnailStyle(cloudSnapshot.selectedThumbnailStyle);
                if (typeof cloudSnapshot.writingStyleSample === 'string') setWritingStyleSample(cloudSnapshot.writingStyleSample);
                if (typeof cloudSnapshot.externalFactCheckReport === 'string' || cloudSnapshot.externalFactCheckReport === null) setExternalFactCheckReport(cloudSnapshot.externalFactCheckReport);
                if (typeof cloudSnapshot.externalHumanizeReport === 'string' || cloudSnapshot.externalHumanizeReport === null) setExternalHumanizeReport(cloudSnapshot.externalHumanizeReport);
                if (typeof cloudSnapshot.pendingHumanizedText === 'string' || cloudSnapshot.pendingHumanizedText === null) setPendingHumanizedText(cloudSnapshot.pendingHumanizedText);
                
                if (cloudSnapshot.externalSrtPipeline) setExternalSrtPipeline(cloudSnapshot.externalSrtPipeline);
                if (cloudSnapshot.postScriptPackage) setPostScriptPackage(cloudSnapshot.postScriptPackage);
                if (Array.isArray(cloudSnapshot.externalSrtObserver)) setExternalSrtObserver(cloudSnapshot.externalSrtObserver);
                if (Array.isArray(cloudSnapshot.hfBgPrompts)) setHfBgPrompts(cloudSnapshot.hfBgPrompts);

                localStorage.setItem(executionStorageKey, JSON.stringify(cloudSnapshot));
              }
            } catch (err) {
              console.warn('[ScriptEngine] Falha ao tentar carregar última execução do Supabase:', err);
            } finally {
              setExecutionHydrated(true);
            }
          };
          loadFromCloud();
        } else {
          setExecutionHydrated(true);
        }
        return;
      }
      if (snapshot?.approvedTheme) setApprovedTheme(snapshot.approvedTheme);
      if (snapshot?.approvedBriefing) setApprovedBriefing(snapshot.approvedBriefing);
      const normalizedSnapshotBlocks = resolveSnapshotBlocks(snapshot);
      if (normalizedSnapshotBlocks.length > 0) {
        setScriptBlocks(normalizedSnapshotBlocks);
      }
      setScriptStage(inferScriptStageFromSnapshot(snapshot));
      if (typeof snapshot?.assemblerActive === 'boolean') setAssemblerActive(snapshot.assemblerActive);
      if (snapshot?.thumbnailDirective) setThumbnailDirective(snapshot.thumbnailDirective);
      if (typeof snapshot?.showThumbnailPanel === 'boolean') setShowThumbnailPanel(snapshot.showThumbnailPanel);
      if (typeof snapshot?.thumbnailUrl === 'string') setThumbnailUrl(snapshot.thumbnailUrl);
      if (snapshot?.executionMode === 'external' || snapshot?.executionMode === 'internal') setExecutionMode(snapshot.executionMode);
      if (typeof snapshot?.externalScriptText === 'string') setExternalScriptText(snapshot.externalScriptText);
      if (typeof snapshot?.externalScriptFileName === 'string') setExternalScriptFileName(snapshot.externalScriptFileName);
      if (typeof snapshot?.externalSourceLabel === 'string') setExternalSourceLabel(snapshot.externalSourceLabel);
      if (typeof snapshot?.externalSrtText === 'string') setExternalSrtText(snapshot.externalSrtText);
      if (typeof snapshot?.externalSrtFileName === 'string') setExternalSrtFileName(snapshot.externalSrtFileName);
      if (['male', 'female', 'custom'].includes(snapshot?.videoCharacterMode)) setVideoCharacterMode(snapshot.videoCharacterMode);
      if (typeof snapshot?.videoCharacterCustom === 'string') setVideoCharacterCustom(snapshot.videoCharacterCustom);
      if (['faceless', 'avatar', 'vlog', 'avatar_flow', 'catalog'].includes(snapshot?.videoFormat)) setVideoFormat(snapshot.videoFormat);
      if (typeof snapshot?.manualPublishDate === 'string') setManualPublishDate(snapshot.manualPublishDate);
      if (typeof snapshot?.visualBlueprintSetting === 'string') setVisualBlueprintSetting(snapshot.visualBlueprintSetting);
      if (typeof snapshot?.visualBlueprintCast === 'object') setVisualBlueprintCast(snapshot.visualBlueprintCast);
      if (typeof snapshot?.forceAllAsVideo === 'boolean') setForceAllAsVideo(snapshot.forceAllAsVideo);
      if (typeof snapshot?.useHybridAssets === 'boolean') setUseHybridAssets(snapshot.useHybridAssets);
      if (['hybrid_smart', 'force_all_video', 'alternating', 'all_image'].includes(snapshot?.assetAllocationMode)) setAssetAllocationMode(snapshot.assetAllocationMode);
      if (typeof snapshot?.ultraCinematic === 'boolean') setUltraCinematic(snapshot.ultraCinematic);
      if (typeof snapshot?.preserveBrackets === 'boolean') setPreserveBrackets(snapshot.preserveBrackets);
      if (typeof snapshot?.promptPrefix === 'string') setPromptPrefix(snapshot.promptPrefix);
      if (typeof snapshot?.pipelineVideos === 'boolean') setPipelineVideos(snapshot.pipelineVideos);
      if (typeof snapshot?.pipelineImages === 'boolean') setPipelineImages(snapshot.pipelineImages);
      if (typeof snapshot?.pipelineTexts === 'boolean') setPipelineTexts(snapshot.pipelineTexts);
      if (typeof snapshot?.pipelineHyperframes === 'boolean') setPipelineHyperframes(snapshot.pipelineHyperframes);
      if (typeof snapshot?.useAdvancedRetention === 'boolean') setUseAdvancedRetention(snapshot.useAdvancedRetention);
      if (typeof snapshot?.selectedThumbnailStyle === 'string') setSelectedThumbnailStyle(snapshot.selectedThumbnailStyle);
      if (typeof snapshot?.writingStyleSample === 'string') setWritingStyleSample(snapshot.writingStyleSample);
      if (typeof snapshot?.externalFactCheckReport === 'string' || snapshot?.externalFactCheckReport === null) setExternalFactCheckReport(snapshot.externalFactCheckReport);
      if (typeof snapshot?.externalHumanizeReport === 'string' || snapshot?.externalHumanizeReport === null) setExternalHumanizeReport(snapshot.externalHumanizeReport);
      if (typeof snapshot?.pendingHumanizedText === 'string' || snapshot?.pendingHumanizedText === null) setPendingHumanizedText(snapshot.pendingHumanizedText);
      // Detect pending title update injected by ThemeBank on resume
      if (snapshot?._pendingTitleUpdate && snapshot?._originalApprovedTitle) {
        setPendingTitleUpdate({ newTitle: snapshot._pendingTitleUpdate, oldTitle: snapshot._originalApprovedTitle });
      }
      // Read large objects (Cloud First, fallback to LocalStorage split-storage pattern)
      const srtPipelineKey = `${executionStorageKey}_srt_pipeline`;
      const postPackageKey = `${executionStorageKey}_post_package`;

      const loadHeavyAssets = async () => {
        let loadedSrt = null;
        let loadedPost = null;
        const themeId = snapshot?._themeId || snapshot?.themeId || snapshot?.id;

        if (supabase && themeId) {
          const { data } = await getScriptExecution(themeId);
          if (data?.execution_snapshot) {
            loadedSrt = data.execution_snapshot.externalSrtPipeline;
            loadedPost = data.execution_snapshot.postScriptPackage;

            const cloudSnapshot = data.execution_snapshot;

            // 1. External Script Text
            if ((!snapshot?.externalScriptText || snapshot.externalScriptText === '') && cloudSnapshot.externalScriptText) {
              setExternalScriptText(cloudSnapshot.externalScriptText);
              console.log('[ScriptEngine] Hydrated externalScriptText from cloud.');
            }
            // 2. External Srt Text
            if ((!snapshot?.externalSrtText || snapshot.externalSrtText === '') && cloudSnapshot.externalSrtText) {
              setExternalSrtText(cloudSnapshot.externalSrtText);
              console.log('[ScriptEngine] Hydrated externalSrtText from cloud.');
            }
            // 3. Script Blocks
            const localBlocks = resolveSnapshotBlocks(snapshot);
            if (localBlocks.length === 0 && Array.isArray(cloudSnapshot.scriptBlocks) && cloudSnapshot.scriptBlocks.length > 0) {
              setScriptBlocks(cloudSnapshot.scriptBlocks);
              console.log('[ScriptEngine] Hydrated scriptBlocks from cloud.');
            }
            // 4. Background Prompts (hfBgPrompts)
            const localHfKey = `yt_hf_bg_${executionStorageKey}`;
            let hasLocalHf = false;
            try {
              const hfRaw = localStorage.getItem(localHfKey);
              if (hfRaw) {
                const parsed = JSON.parse(hfRaw);
                if (Array.isArray(parsed) && parsed.length > 0) hasLocalHf = true;
              }
            } catch {}
            if (!hasLocalHf && (!snapshot?.hfBgPrompts || snapshot.hfBgPrompts.length === 0) && Array.isArray(cloudSnapshot.hfBgPrompts) && cloudSnapshot.hfBgPrompts.length > 0) {
              setHfBgPrompts(cloudSnapshot.hfBgPrompts);
              console.log('[ScriptEngine] Hydrated hfBgPrompts from cloud.');
              try {
                localStorage.setItem(localHfKey, JSON.stringify(cloudSnapshot.hfBgPrompts));
              } catch {}
            }
            // 5. External Srt Observer
            if ((!snapshot?.externalSrtObserver || snapshot.externalSrtObserver.length === 0) && Array.isArray(cloudSnapshot.externalSrtObserver) && cloudSnapshot.externalSrtObserver.length > 0) {
              setExternalSrtObserver(cloudSnapshot.externalSrtObserver);
              console.log('[ScriptEngine] Hydrated externalSrtObserver from cloud.');
            }
            // 6. Reports (Fact check, Humanize, Pending humanized text)
            if (!snapshot?.externalFactCheckReport && cloudSnapshot.externalFactCheckReport) {
              setExternalFactCheckReport(cloudSnapshot.externalFactCheckReport);
              console.log('[ScriptEngine] Hydrated externalFactCheckReport from cloud.');
            }
            if (!snapshot?.externalHumanizeReport && cloudSnapshot.externalHumanizeReport) {
              setExternalHumanizeReport(cloudSnapshot.externalHumanizeReport);
              console.log('[ScriptEngine] Hydrated externalHumanizeReport from cloud.');
            }
            if (!snapshot?.pendingHumanizedText && cloudSnapshot.pendingHumanizedText) {
              setPendingHumanizedText(cloudSnapshot.pendingHumanizedText);
              console.log('[ScriptEngine] Hydrated pendingHumanizedText from cloud.');
            }
          }
        }

        // Fallback to local if cloud didn't have it (or offline)
        if (!loadedSrt) {
          try {
            const srtRaw = localStorage.getItem(srtPipelineKey);
            if (srtRaw) loadedSrt = JSON.parse(srtRaw);
          } catch { /* ignore */ }
          if (!loadedSrt && snapshot?.externalSrtPipeline) loadedSrt = snapshot.externalSrtPipeline; // old compat
        }

        // Fallback to local themes list if still missing (useful for restored backups with inline assets)
        if (!loadedSrt && themeId) {
          try {
            const themesStorageKey = `themes_${activeProject.id}`;
            const localThemesRaw = localStorage.getItem(themesStorageKey);
            if (localThemesRaw) {
              const localThemes = JSON.parse(localThemesRaw);
              const foundTheme = localThemes.find((t: any) => t.id === themeId);
              const themeSnapshot = foundTheme?.production_assets?.execution_snapshot;
              if (themeSnapshot?.externalSrtPipeline) {
                loadedSrt = themeSnapshot.externalSrtPipeline;
                console.log(`[ScriptEngine] Fallback: carregou SRT pipeline da lista de temas para o tema ${themeId}`);
              }
            }
          } catch (e) {
            console.warn('[ScriptEngine] Erro no fallback de carregar SRT pipeline da lista de temas:', e);
          }
        }

        if (!loadedPost) {
          try {
            const pkgRaw = localStorage.getItem(postPackageKey);
            if (pkgRaw) loadedPost = JSON.parse(pkgRaw);
          } catch { /* ignore */ }
          if (!loadedPost && snapshot?.postScriptPackage) loadedPost = snapshot.postScriptPackage; // old compat
        }

        // Fallback to local themes list for post package if still missing
        if (!loadedPost && themeId) {
          try {
            const themesStorageKey = `themes_${activeProject.id}`;
            const localThemesRaw = localStorage.getItem(themesStorageKey);
            if (localThemesRaw) {
              const localThemes = JSON.parse(localThemesRaw);
              const foundTheme = localThemes.find((t: any) => t.id === themeId);
              const themeSnapshot = foundTheme?.production_assets?.execution_snapshot;
              if (themeSnapshot?.postScriptPackage) {
                loadedPost = themeSnapshot.postScriptPackage;
                console.log(`[ScriptEngine] Fallback: carregou post package da lista de temas para o tema ${themeId}`);
              }
            }
          } catch (e) {
            console.warn('[ScriptEngine] Erro no fallback de carregar post package da lista de temas:', e);
          }
        }

        if (loadedSrt) {
          setExternalSrtPipeline(loadedSrt);
          // Auto-repair local storage key if it was missing
          if (themeId) {
            const localKey = `${executionStorageKey}_srt_pipeline`;
            if (!localStorage.getItem(localKey)) {
              try {
                localStorage.setItem(localKey, JSON.stringify(loadedSrt));
              } catch {}
            }
            // Auto-repair/sync to cloud table (script_executions) if missing
            if (supabase) {
              getScriptExecution(themeId).then(({ data }) => {
                if (!data || !data.execution_snapshot || !data.execution_snapshot.externalSrtPipeline) {
                  console.log(`[ScriptEngine] Auto-sync: salvando SRT pipeline e post package em script_executions na nuvem...`);
                  upsertScriptExecution(themeId, {
                    externalSrtPipeline: loadedSrt || undefined,
                    postScriptPackage: loadedPost || undefined,
                  }).catch(err => console.warn('[ScriptEngine] Falha ao upsertar heavy assets em script_executions:', err));
                }
              });
            }
          }
        }
        
        if (loadedPost) {
          setPostScriptPackage(loadedPost);
          // Auto-repair local storage key if it was missing
          if (themeId) {
            const localKey = `${executionStorageKey}_post_package`;
            if (!localStorage.getItem(localKey)) {
              try {
                localStorage.setItem(localKey, JSON.stringify(loadedPost));
              } catch {}
            }
          }
        }
      };

      // Fire and forget: load heavy assets in background
      loadHeavyAssets();

      if (Array.isArray(snapshot?.externalSrtObserver) && snapshot.externalSrtObserver.length > 0) setExternalSrtObserver(snapshot.externalSrtObserver);
      // Restore HF background prompts — dedicated key is primary, snapshot is fallback
      try {
        const hfKey = `yt_hf_bg_${executionStorageKey}`;
        const hfRaw = localStorage.getItem(hfKey);
        const hfSource = hfRaw ? JSON.parse(hfRaw) : snapshot?.hfBgPrompts;
        if (Array.isArray(hfSource) && hfSource.length > 0) {
          const validHf = hfSource.filter((p: any) => p.rowNumber > 0 && p.prompt);
          if (validHf.length > 0) setHfBgPrompts(validHf);
        }
      } catch { /* ignore */ }
      
      if (pendingData && pendingData.approvedTheme) {
        onClearPending?.();
      }
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

    persistExecutionSnapshotLocally();
  }, [
    executionStorageKey,
    executionHydrated,
    approvedTheme,
    approvedBriefing,
    scriptBlocks,
    scriptStage,
    assemblerActive,
    thumbnailDirective,
    showThumbnailPanel,
    thumbnailUrl,
    executionMode,
    externalScriptText,
    externalScriptFileName,
    externalSourceLabel,
    externalSrtText,
    externalSrtFileName,
    videoCharacterMode,
    videoCharacterCustom,
    manualPublishDate,
    externalSrtPipeline,
    externalSrtObserver,
    postScriptPackage,
    hfBgPrompts,
    visualBlueprintSetting,
    visualBlueprintCast,
    externalFactCheckReport,
    externalHumanizeReport,
    pendingHumanizedText,
  ]);

  // Check storage usage on mount so the badge shows immediately if already high
  useEffect(() => { checkStorageUsage(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!executionHydrated) return;
    if (approvedBriefing || approvedTheme || externalScriptText || externalSrtText || !assemblerActive) return;
    setExecutionMode(defaultExecutionMode);
  }, [
    defaultExecutionMode,
    executionHydrated,
    approvedBriefing,
    approvedTheme,
    externalScriptText,
    externalSrtText,
    assemblerActive,
  ]);
  
  useEffect(() => {
    if (!executionHydrated) return;
    // Only initialize Assembler V4 if it's a NEW theme (no approvedTheme)
    if (pendingData && !pendingData.approvedTheme) {
      console.log('--- Assembler V4 Initializing from Content OS Kernel ---');
      
      const metaphorsStr = activeProject?.metaphor_library || '';
      const metaphors = metaphorsStr.split(',').map((s: string) => s.trim()).filter(Boolean);
      const randomM = metaphors[Math.floor(Math.random() * metaphors.length)] || 'Conceito Central';
      
      const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
      const persona = activeProject?.persona_matrix || { demographics: 'Publico', pain_alignment: 'Problema' };
      const tactical_journey = activeProject?.playlists?.tactical_journey || [];

      const v4Blocks: ScriptBlock[] = [
        { 
          id: 'h1', 
          type: 'Hook', 
          title: `Hook Estrategico [${pendingData.title_structure || pendingData.selected_structure || 'S1'}]`, 
          content: pendingData.refined_title || pendingData.title || '',
          sop: `Estilo: ${sop.zoom_style}. Ritmo: ${sop.cut_rhythm}. Impacto visual imediato no gancho.` 
        },
        { 
          id: 'c1', 
          type: 'Context', 
          title: 'Conexao com a Persona', 
          content: `Vincular o tema [${pendingData.title || pendingData.raw_theme || ''}] com o perfil [${persona.demographics}] e a dor central: ${persona.pain_alignment}.`,
          sop: `Trilha: ${sop.soundtrack}. Tom empatico. Camera focada para gerar conexao.`
        }
      ];

      // Dynamic Funnel Ingestion (T1-T3)
      tactical_journey.forEach((module: any, idx: number) => {
        v4Blocks.push({
          id: `module-${idx}`,
          type: 'Development',
          title: `Bloco ${module.label}: ${module.title}`,
          content: `Injetar metafora: ${randomM}. Desenvolver ${module.title}: ${module.value || 'Focar na solucao tecnica'}.`,
          sop: `Ritmo: ${sop.cut_rhythm}. Use overlays de texto para os termos da Metaphor Library.`
        });
      });

      v4Blocks.push({ 
        id: 'cta1', 
        type: 'CTA', 
        title: 'Conversao PUC', 
        content: `CTA Estrategico: transicao para a Promessa Unica (PUC) - ${activeProject?.puc}. Chamar para a acao especifica do projeto.`,
        sop: 'Split screen ou CTA visual. Encerramento com a trilha em crescendo.'
      });

      setApprovedTheme(pendingData.refined_title || pendingData.title || '');
      setApprovedBriefing(null);
      setScriptBlocks(v4Blocks);
      setScriptStage('blueprint');
      setPostScriptPackage(null);
      
      const themeDate = pendingData.target_publish_date || pendingData.production_assets?.target_publish_date || '';
      setManualPublishDate(themeDate);
      const dateParts = getManualPublishDateParts(themeDate);
      setManualPublishDraftDate(dateParts.date);
      setManualPublishDraftTime(dateParts.time);

      onClearPending?.();
      setAssemblerActive(false); // Move to editor once pending data arrives
    } else if (scriptBlocks.length === 0 && !approvedBriefing) {
      setScriptBlocks([
        { id: 'h0', type: 'Hook', title: 'Gancho Estrategico', content: 'Inicie com uma promessa tecnica...', sop: 'Corte seco.' },
        { id: 'c0', type: 'Context', title: 'Contextualizacao', content: 'Conecte com a dor do publico...', sop: 'B-roll de contexto.' }
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

    // Split community elements into Specific (bordões, apelidos, piadas curtas) and Open (posicionamentos, críticas, opiniões)
    const specificCommunityItems = uniqueCommunityTemplates.filter((item: any) => {
      const text = ((item?.name || '') + ' ' + (item?.description || '')).toLowerCase();
      return text.length < 60 && !text.includes('posicionamento') && !text.includes('critica') && !text.includes('critico') && !text.includes('opiniao');
    });
    const openCommunityItems = uniqueCommunityTemplates.filter((item: any) => {
      const text = ((item?.name || '') + ' ' + (item?.description || '')).toLowerCase();
      return text.length >= 60 || text.includes('posicionamento') || text.includes('critica') || text.includes('critico') || text.includes('opiniao');
    });

    const specificCommunityCatalog = buildCommunityReferenceCatalog(specificCommunityItems) || 'Nenhum cadastrado';
    const openCommunityCatalog = buildCommunityReferenceCatalog(openCommunityItems) || 'Nenhum cadastrado';

    const projectName = activeProject?.name || activeProject?.project_name || 'Projeto ativo';
    const persona = activeProject?.persona_matrix?.demographics || '';
    const pain = activeProject?.persona_matrix?.pain_alignment || '';
    const metaphors = activeProject?.metaphor_library || '';
    const sop = activeProject?.editing_sop || {};
    const selectedNarrativeCurve = approvedBriefing?.selectedNarrativeCurve;
    const selectedArgumentMode = approvedBriefing?.selectedArgumentMode;
    const selectedRepetitionRules = (approvedBriefing?.selectedRepetitionRules || []) as Array<{ id?: string; name?: string; pattern?: string; description?: string }>;

    // Strategic project variables (currently neglected fields in prompting)
    const languageStyle = activeProject?.persona_matrix?.language || '';
    const desiredOutcome = activeProject?.persona_matrix?.desired_outcome || '';
    const proofPoints = activeProject?.persona_matrix?.proof_points || '';
    const positioningAngle = activeProject?.editorial_line?.positioning_angle || '';
    const contentBoundaries = activeProject?.editorial_line?.content_boundaries || '';
    const passion = activeProject?.phd_strategy?.passion || '';
    const skill = activeProject?.phd_strategy?.skill || '';
    const demand = activeProject?.phd_strategy?.demand || '';
    const baseSystemInstruction = activeProject?.base_system_instruction || '';

    // Narrator identity: combine positioning, tone, active voice and PHD strategies
    const narratorPositioning = activeProject?.narrative_voice?.positioning?.trim() || '';
    const atmosphereList = (activeProject?.narrative_voice?.atmosphere || []).join(', ');
    const dominantVoiceLabel = approvedBriefing?.dominantVoice || approvedBriefing?.diagnostics?.locked?.voicePatternId || '';
    const narratorIdentity = [
      narratorPositioning ? `Posicionamento de Autoridade: ${narratorPositioning}` : '',
      dominantVoiceLabel === 'Vulnerabilidade'
        ? 'Estilo de fala ativo: Primeira pessoa, a partir da propria experiencia. Nao como especialista externo, mas como alguem que passou pelo mesmo problema e tem cicatriz para mostrar.'
        : dominantVoiceLabel === 'Desafio Direto'
        ? 'Estilo de fala ativo: Par senior que confronta sem agredir. Nao suaviza, nao enrola. Da o diagnostico e vai embora.'
        : 'Estilo de fala ativo: Distancia tecnica analitica. Mostra o mecanismo, nao a emocao. A autoridade vem da clareza, nao da intensidade.',
      atmosphereList ? `Atmosfera/Tom de voz predominante: ${atmosphereList}.` : '',
      activeProject?.puc ? `Posicionamento Unico do Canal (PUC): ${activeProject.puc}.` : '',
      passion ? `Paixao do criador (diretriz energetica): ${passion}` : '',
      skill ? `Habilidade/Autoridade do criador: ${skill}` : '',
    ].filter(Boolean).join('\n');

    const languageSection = languageStyle || desiredOutcome || proofPoints
      ? [
          '\nESTILO LINGUISTICO E TONE OF VOICE',
          languageStyle ? `- Diretriz de linguagem: ${languageStyle}` : '',
          desiredOutcome ? `- Desfecho desejado a prometer no roteiro: ${desiredOutcome}` : '',
          proofPoints ? `- Fatos/Pontos de prova a incorporar: ${proofPoints}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const boundariesSection = positioningAngle || contentBoundaries
      ? [
          '\nDIRETRIZES DE CONTEUDO E LIMITES (BOUNDARIES)',
          positioningAngle ? `- Angulo de posicionamento editorial: ${positioningAngle}` : '',
          contentBoundaries ? `- Limites de conteudo (O que entra e o que NAO entra):\n${contentBoundaries}` : '',
        ].filter(Boolean).join('\n')
      : '';

    const customSystemSection = baseSystemInstruction
      ? `\nINSTRUCOES ADICIONAIS DO SISTEMA DO PROJETO\n- Aplique estritamente estas regras de sistema do canal:\n${baseSystemInstruction}`
      : '';

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
        .filter((line) => !/^(Desenvolver:|Elemento de comunidade:|Estrutura de titulo|Camada de abertura de referencia:|Camada final de conversao de referencia:|Hook de referencia:|CTA de referencia:|Objetivo:|Conecte com a PUC:)/i.test(line));
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

    const buildExecutionPosture = (
      voiceStyle?: string,
      narrativeRole?: string,
      argumentMode?: { name?: string; pattern?: string; description?: string } | null
    ) => {
      const voiceGuidance =
        voiceStyle === 'Desafio Direto'
          ? 'fale em segunda pessoa, com urgencia clara, comando pratico e confronto sem agressividade vazia'
          : voiceStyle === 'Vulnerabilidade'
            ? 'fale em primeira pessoa, com cena concreta, vulnerabilidade real e intimidade sem melodrama'
            : 'fale em terceira pessoa tecnica, mostrando mecanismo, criterio observavel e impacto mensuravel';

      const roleGuidance =
        narrativeRole === 'Ruptura'
          ? 'abra quebrando a inercia e expondo a tensao central logo no primeiro paragrafo'
          : narrativeRole === 'Espelho'
            ? 'priorize identificacao, reconhecimento e proximidade emocional antes de ampliar a explicacao'
            : narrativeRole === 'Diagnostico'
              ? 'priorize causa, mecanismo e leitura estrutural antes de prescrever'
              : narrativeRole === 'Virada'
                ? 'introduza uma mudanca perceptivel de eixo, verdade contraintuitiva ou decisao irreversivel'
                : narrativeRole === 'Aplicacao'
                  ? 'converta o raciocinio em experimento, checklist, protocolo ou decisao executavel'
                  : 'sintetize, convoque e conclua com sensacao de fechamento natural';

      // Inject argument mode pattern as active persuasion directive for this block
      const argumentPattern = argumentMode?.pattern || argumentMode?.description || '';
      const argumentGuidance = argumentPattern
        ? ` Modo de persuasao ativo ("${argumentMode?.name || 'Argumento'}") — aplique neste bloco: ${argumentPattern}`
        : '';

      return `Postura obrigatoria: ${voiceGuidance}; ${roleGuidance}.${argumentGuidance}`;
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

      // Distribute curve stages proportionally across blocks (avoids repeating last stage)
      const curveStages = selectedNarrativeCurve?.pattern
        ? selectedNarrativeCurve.pattern.split(/\s*>\s*/).map((s: string) => s.trim()).filter(Boolean)
        : [];
      const curveStageForBlock = curveStages.length > 0
        ? (() => {
            const totalBlocks = promptBlocks.length;
            const stageIndex = totalBlocks <= 1
              ? 0
              : Math.round((index / (totalBlocks - 1)) * (curveStages.length - 1));
            return curveStages[Math.min(stageIndex, curveStages.length - 1)];
          })()
        : null;

      // Calculate progress relative to the entire script (from 0 to 1)
      const relativeProgress = index / (promptBlocks.length - 1 || 1);
      const isUnder30Percent = relativeProgress <= 0.3;
      
      const ctaType = isUnder30Percent ? 'Nativa/Engajamento' : 'Conversao/Externa';
      const ctaGuidance = isUnder30Percent
        ? `- CAMADA CTA (${ctaType} - ate 30% do video): Insira uma chamada sutil de engajamento nativo (ex: curtir, comentar usando piada ou apelido do canal, ou se inscrever) de forma extremamente integrada e sem parecer comercial.`
        : `- CAMADA CTA (${ctaType} - apos 30% do video): Insira uma transicao/chamada focada em conversao para acao externa (ex: mentoria, produto, link na descricao). O convite deve ser uma evolucao obvia da entrega tecnica do bloco.`;

      const communityReference = orchestratedBlock?.communityElement
        ? orchestratedBlock.communityElement.replace(/[\p{Emoji}]/gu, '').replace(/\s{2,}/g, ' ').trim()
        : '';

      const cadenciaRhythmSpec = index === 0
        ? [
            `[ESTRUTURA DE CADENCIA - PORTAL DE ENTRADA]`,
            `- Abertura: Inicie com impacto usando a Voz Dominante. PROIBIDO jargoes como 'Voce ja se perguntou...', 'Imagine que...'.`,
            `- CTA: Insira uma chamada de engajamento nativo (baixo atrito) no fluxo de contextualizacao.`,
            communityReference ? `- Elemento de Comunidade Ativo: "${communityReference}". Reinterprete de forma natural.` : '',
            `- Informacao/Conteudo: Entregue a tese central inicial.`
          ].filter(Boolean).join('\n')
        : [
            `[ESTRUTURA DE CADENCIA NARRATIVA EM 3 TEMPOS]`,
            `Voce DEVE tecer este bloco intercalando estritamente estas 3 camadas de forma natural:`,
            `1. CAMADA CTA:`,
            `   ${ctaGuidance}`,
            `2. CAMADA DE COMUNIDADE:`,
            `   - Use e reinterprete ativos da comunidade.`,
            communityReference ? `   - Ativo especifico selecionado para este bloco: "${communityReference}". Use-o como gatilho de pertencimento.` : '   - Integre referencias de identidade ou jargoes de forma leve.',
            `3. CAMADA DE INFORMAÇÃO/CONTEÚDO:`,
            `   - Entregue o nucleo tecnico e a tese de "${block.title}".`
          ].join('\n');

      const blockLines = [
        `BLOCO ${index + 1} - DESENVOLVIMENTO`,
        `Titulo interno: ${block.title}`,
        `Meta de caracteres: ${formatCharsLabel((orchestratedBlock?.blockChars || 0) + (index === 0 ? hookChars : 0) + (index === promptBlocks.length - 1 ? finalCtaChars : 0) + (hasMidCta && index === Number(approvedBriefing?.midCta?.position || -1) ? midCtaChars : 0))}`,
        `Voz dominante: ${orchestratedBlock?.voiceStyle || approvedBriefing?.dominantVoice || 'Nao definida'}`,
        `Mapa de tensao: ${orchestratedBlock?.tensionLevel || 'Media'} | Papel: ${orchestratedBlock?.narrativeRole || 'Diagnostico'} | Transicao: ${orchestratedBlock?.transitionMode || 'Consequencia'}`,
        `Funcao narrativa: ${orchestratedBlock?.missionNarrative || block.content}`,
        buildExecutionPosture(orchestratedBlock?.voiceStyle, orchestratedBlock?.narrativeRole, selectedArgumentMode),
        `Diretriz estrutural: ${extractPrimaryDirective(block.content)}`,
        `SOP / entonacao: ${block.sop || 'Nao definido'}`,
        cadenciaRhythmSpec,
        // Inject only the specific stage for this block position
        ...(curveStageForBlock
          ? [`Estagio atual da curva narrativa para este bloco: ${curveStageForBlock}`]
          : []),
        // For block 0: translate the hook into a writing directive — orientation, not text to copy
        ...(index === 0 && videoFormat !== 'catalog' && (approvedBriefing?.openingHook?.name || approvedBriefing?.openingHook?.pattern || approvedBriefing?.openingHook?.description)
          ? (() => {
              const hookName = approvedBriefing.openingHook?.name || '';
              const hookRef = approvedBriefing.openingHook?.pattern || approvedBriefing.openingHook?.description || '';
              const lines = [
                `DIRETRIZ DE ENTRADA DO ROTEIRO — orienta apenas o primeiro paragrafo, sobrepoe a voz dominante nesse ponto:`,
                `Ativo de abertura selecionado: "${hookName}"`,
                hookRef ? `Orientacao funcional do ativo (bussola de escrita, nao texto a copiar): ${hookRef}` : '',
                `Como aplicar: identifique a pessoa gramatical, o angulo de tensao e a sensacao concreta que o ativo evoca. Abra o roteiro com linguagem propria que capture essa mesma energia e esse ponto de entrada. O primeiro paragrafo deve soar como se esse ativo tivesse sido escrito especificamente para este tema — com palavras completamente diferentes.`,
              ].filter(Boolean).join('\n');
              return [lines];
            })()
          : []),
        ...connectionLines,
        buildAlignedBridgeInstruction(nextBlock, nextNarrativeBlock),
      ];

      return blockLines.join('\n');
    });

    const midCtaBlockNum = Number(approvedBriefing?.midCta?.position || 0) + 1;
    const midCtaSection = hasMidCta
      ? [
          'INTERVENCAO INTERMEDIARIA OBRIGATORIA',
          `Insercao: esta microchamada DEVE aparecer imediatamente apos a ultima frase do bloco de desenvolvimento ${midCtaBlockNum}. Nao crie um bloco separado. Nao omita esta instrucao. Nao mova para outro ponto do roteiro. O texto deve fluir como continuacao natural do bloco ${midCtaBlockNum} e transicao organica para o bloco ${midCtaBlockNum + 1}.`,
          `Meta de caracteres: ${formatCharsLabel(midCtaChars)}`,
          'Mapa de tensao: Media | Papel: Aplicacao | Transicao: Alivio',
          `Funcao narrativa: inserir uma microchamada baseada no ativo "${approvedBriefing?.midCta?.name || 'CTA intermediario'}", curta, organica e sem soar comercial demais.`,
          `Referencia funcional: ${approvedBriefing?.midCta?.pattern || 'Nao definida'}`,
          'Regra operacional: esta intervencao e obrigatoria e nao pode ser omitida, resumida ou deslocada. Nao conta como bloco adicional na numeracao final.',
        ].join('\n')
      : '';

    const lockedCompositionSection = approvedBriefing?.diagnostics ? [
      ...(videoFormat === 'catalog'
        ? [`Camada de abertura selecionada: Nenhuma (Formato Catálogo começa diretamente no primeiro item)`]
        : [
            `Camada de abertura selecionada: ${approvedBriefing?.openingHook?.name || 'Nao definida'}`,
            // Translate opening hook into a functional writing directive — orientation, not text to copy
            ...(approvedBriefing?.openingHook?.pattern || approvedBriefing?.openingHook?.description
              ? [`Diretriz de abertura (orientacao funcional — nao copie, use como bussola de escrita): ${approvedBriefing.openingHook.pattern || approvedBriefing.openingHook.description}`]
              : [])
          ]
      ),
      `Camada final de conversao selecionada: ${approvedBriefing?.selectedCta?.name || 'Nao definida'}`,
      `Estrutura selecionada: ${approvedBriefing?.selectedTitleStructure?.name || 'Nao definida'}`,
      `Curva selecionada: ${selectedNarrativeCurve?.name || 'Nao definida'}`,
      // Inject curve pattern as macro progression directive
      ...(selectedNarrativeCurve?.pattern
        ? [`Progressao macro da curva (aplique nos blocos em sequencia): ${selectedNarrativeCurve.pattern}`]
        : []),
      `Modo de argumentacao: ${selectedArgumentMode?.name || 'Nao definido'}`,
      // Inject argument mode pattern as persuasion posture directive
      ...(selectedArgumentMode?.pattern || selectedArgumentMode?.description
        ? [`Diretriz do modo de argumentacao (postura dominante de persuasao): ${selectedArgumentMode.pattern || selectedArgumentMode.description}`]
        : []),
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

    const catalogOverride = videoFormat === 'catalog'
      ? `[ATENÇÃO: INSTRUÇÃO DE PRECEDÊNCIA MÁXIMA - FORMATO CATÁLOGO]
Você está escrevendo um roteiro no formato de CATÁLOGO (estilo documentário enciclopédico direto ao ponto). No canal de referência, não há nenhuma introdução, enrolação, ou história de vulnerabilidade pessoal longa. O vídeo começa diretamente apresentando o primeiro item.

Desta forma, você DEVE seguir rigorosamente as seguintes regras:
1. DESCONSIDERE COMPLETAMENTE os títulos internos, funções narrativas, sentimentos de vulnerabilidade e diretrizes de abertura se eles sugerirem ganchos pessoais ou narrativas longas fora do item técnico.
2. CADA BLOCO (BLOCO 1, BLOCO 2, etc.) do blueprint abaixo representa um item técnico real. Você DEVE escrever todos os blocos na ordem exata e NUNCA pular, mesclar ou ignorar nenhum item do blueprint (ex: se o Bloco 3 for Creatina HCl, você deve obrigatoriamente escrever o bloco de Creatina HCl).
3. O início de CADA bloco de item deve obrigatoriamente começar com o nome do item em destaque como a primeira frase (ex: "Creatina Monohidratada. ...", "Creatina HCl. ...", "Creatina Micronizada. ..."). É terminantemente proibido iniciar qualquer bloco com verbos ou histórias como "Eu comprei...", "Já caí na...", "Vamos falar de...". A primeiríssima frase do bloco deve ser o rótulo do item seguido de ponto final.
4. NÃO escreva nenhuma introdução, gancho, história pessoal ou parágrafo geral de transição no início do roteiro. A primeira frase do roteiro inteiro (Bloco 1) deve ser diretamente o nome do primeiro item (ex: "Creatina Monohidratada. ...").
5. Siga a explicação técnica estruturada em 3 beats para cada item: Definição do item, Origem/Bioquímica, Distinção em relação aos outros.
\n\n`
      : '';

    return `${catalogOverride}Voce vai escrever um roteiro completo fora desta plataforma, mas precisa obedecer fielmente ao blueprint abaixo.

OBJETIVO
- Produzir um roteiro final humano, natural e variado.
- Respeitar a engenharia narrativa definida pelo orquestrador.
- Executar toda a geracao do roteiro em uma unica thread/fluxo continuo de geracao. E terminantemente proibido processar por meio de requisicoes independentes, prompts separados ou fragmentados para cada bloco.
- Tratar a camada de abertura, a camada final de conversao, a estrutura de titulo e os elementos de comunidade apenas como referencia funcional e semantica.
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
- Elementos de comunidade ESPECIFICOS (bordoes, piadas, apelidos): ${specificCommunityCatalog}
- Elementos de comunidade ABERTOS (posicionamentos, criticas, opinioes): ${openCommunityCatalog}

IDENTIDADE DO NARRADOR
${narratorIdentity}
- Esta identidade deve ser sentida na escolha de palavras, no nivel de intimidade, na postura diante do assunto e no ponto de entrada de cada bloco.
- O narrador deve ser uma presenca constante e ativa ao longo de todo o video. Ele nao e apenas um locutor passivo de informacoes, mas sim uma personalidade que se manifesta, comenta, reage e expressa suas opinioes e vivencias de forma natural e integrada ao longo de todo o roteiro.
- Nao declare a identidade do narrador no texto. Apenas encarne-a com presenca marcante.
${languageSection}${boundariesSection}${customSystemSection}

[DIRETRIZ DE CONTROLE NARRATIVO - CUIDADO COM A IA]
1. EVITE O EFEITO BARNUM: Nao use adjetivos ou descricoes genericas que se anulam (ex: ser 'acolhedora, firme, pratica e contemplativa' ao mesmo tempo). Assuma uma postura narrativa consistente, clara e sem contradiccoes vagas.
2. EVITE A SUBMISSAO AO NICHO: As caracteristicas, habitos e gostos do narrador devem ser de uma pessoa real e NAO podem ser apenas redundancias do nicho do canal. Se o canal fala sobre emagrecimento, o habito do narrador nao deve ser apenas 'tomar shake', e sim traços cotidianos independentes (como colecionar vinil, praticar marcenaria ou ouvir lofi de madrugada). Isso gera tridimensionalidade autentica.

DIRECAO ORQUESTRADA
${lockedCompositionSection}
- Blueprint macro da curva: ${selectedNarrativeCurve?.pattern || 'Nao definido'}
- Diretriz do argumento: ${selectedArgumentMode?.pattern || 'Nao definida'}
${videoFormat === 'catalog' ? '- O roteiro começa diretamente no primeiro item (sem camada de abertura), e a camada final de conversao deve fechar o ultimo bloco, sem criar blocos extras.' : '- A camada de abertura deve viver no inicio do primeiro bloco, e a camada final de conversao deve fechar o ultimo bloco, sem criar blocos extras.'}
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
${centralDevelopmentBlocks > 0 ? '- A curva abaixo vale para os blocos centrais de desenvolvimento; a abertura e o fechamento funcionam como camadas narrativas acopladas ao primeiro e ao ultimo bloco.\n' : ''}${narrativeArcSummary || 'Curva narrativa nao definida.'}

MECANICAS DE RETENCAO OBRIGATORIAS
${videoFormat === 'catalog' ? '- O roteiro deve começar imediatamente na primeira palavra do primeiro item (ex: "Creatina Monohidratada..."), sem qualquer tipo de introdução ou gancho geral.' : '- Os primeiros 5 segundos devem gerar impacto imediato, sem preambulo, apresentacao ou contexto. O tipo de abertura deve ser guiado pela voz dominante declarada e pelo ativo de abertura selecionado no briefing, nao por uma formula padrao.'}
- Voz Vulnerabilidade: abra com cena concreta de falha, tensao pessoal ou momento de decisao. Nao use pergunta retorica como entrada padrao.
- Voz Desafio Direto: abra com afirmacao polarizadora, diagnostico provocativo ou problema imediato sem introducao. Nao use "Imagine que..." ou "Voce ja se perguntou..." como primeiro movimento.
- Voz Tecnica: abra com dado surpreendente, contradicao observavel ou mecanismo revelado. Nao use narrativa pessoal como ponto de entrada.
- Proibido como primeira frase de qualquer roteiro: "Voce ja se perguntou...", "Imagine que...", "Hoje vou te falar sobre...", "Neste video...", "Ola [nome]...". Essas construcoes sinalizam roteiro generico antes de qualquer conteudo real.
- Varie o ponto de entrada gramatical entre roteiros: ora comece com uma acao ("Ele abriu o computador e..."), ora com uma contradicao ("Todo mundo faz X. Ninguem percebe que Y."), ora com um dado concreto ("487 dias."), ora com uma cena direta ("3h da manha. Notificacao."). A abertura deste roteiro nao deve usar o mesmo padrao gramatical da abertura-tipo do projeto.
- Crie pelo menos um curiosity gap nos primeiros blocos: plante uma tensao ou duvida que so sera respondida nos blocos finais. O viewer nao pode antecipar como o assunto sera resolvido desde o inicio.
- Em momentos de alta probabilidade de saida (apos entrega de insight relevante ou no meio do roteiro), use escalacao ou revelacao parcial para manter a progressao ativa.
- Cada bloco deve parecer uma etapa necessaria da jornada. O viewer que pulasse qualquer parte precisaria sentir que perdeu algo essencial.

REGRAS DE HUMANIZACAO
- Cada bloco deve conter pelo menos uma sensacao fisica ou sensorial concreta. Nao use abstracoes: nao "voce sente medo", mas "aquela tensao no peito antes de abrir o Slack de manha e ver mensagens nao lidas do gestor".
- Use frases fragmentadas intencionalmente em momentos de revelacao ou tensao maxima. Exemplo: "Isso nao e sorte. E processo. Processo. Todo. Dia."
- Use autocorrecao ou hesitacao natural em momentos de vulnerabilidade ou diagnostico pesado. Exemplo: "O resultado foi... cara... tipo surpreendente mesmo."
- Use repeticao enfatica para impacto em frases-chave. Exemplo: "Ele fez isso. Todo dia. TODO. DIA."
- Vocabulario proibido por soar formal ou robotico: "portanto", "ademais", "e necessario", "individuos", "outrossim", "destarte", "neste sentido", "no que tange". Use: "entao", "dai", "voce precisa", "pessoas", "gente".
- Cada paragrafo deve passar no teste da conversa: seria falado naturalmente para um amigo proximo? Se soar como relatorio ou apresentacao formal, reescreva.
- Nunca inicie um bloco com nome canonico de conceito, rotulo operacional ou jargao do sistema. Inicie com cena, sensacao, pergunta concreta ou observacao direta.

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
- Quando houver qualquer ambiguidade entre a funcao narrativa e a redacao bruta do bloco, obedeca primeiro a postura obrigatoria e a voz dominante declarada.
- Marcadores explicitos de narracao devem ser tratados como prioridade maxima: primeira pessoa para vulnerabilidade, segunda pessoa para desafio direto e terceira pessoa para diagnostico tecnico.
- Sempre que possivel, transforme abstracao em cena, sintoma observavel, metrica simples ou decisao concreta.
- O roteiro completo precisa parecer escrito de uma vez so, com progressao, cadencia e memoria interna, mantendo a coerencia de uma unica thread de pensamento e narracao.
- Nao devolver explicacoes, rotulos tecnicos, markdown, numeracoes, titulos de secao ou qualquer comentario fora da narracao.

BLUEPRINT BLOCO A BLOCO
${blockSpecifications.join('\n\n')}${midCtaSection ? `\n\n${midCtaSection}` : ''}
${videoFormat === 'avatar_flow' ? `
[ESTILO DE NARRATIVA OBRIGATÓRIO — AVATAR FLOW]
- VOCÊ DEVE DIVIDIR RÍGIDAMENTE A NARRAÇÃO EM TRECHOS DE CERCA DE 24 A 26 PALAVRAS POR BLOCO. Cada bloco do blueprint deve conter estritamente essa quantidade de palavras.
- NUNCA, SOB QUALQUER HIPÓTESE, ABREVIE "Inteligência Artificial" ou qualquer sigla/número que possa causar erro na narração de voz. Escreva tudo POR EXTENSO (ex: escreva "Inteligência Artificial", NUNCA "IA"; "cinquenta por cento" em vez de "50%"; "quinze dias" em vez de "15 dias"; etc.).
- NÃO INSIRA SUBTÍTULOS SOLTOS. Como isso é uma narração contínua de cena por cena, qualquer subtítulo ou cabeçalho deve ser transformado em fala natural de transição (exemplo: transforme "Por que essa oportunidade não dura para sempre" em algo como "Agora deixa eu te explicar por que essa oportunidade não vai durar para sempre.").` : ''}
${videoFormat === 'catalog' ? `
[ESTILO DE NARRATIVA OBRIGATÓRIO — CATÁLOGO]
- NARRATIVA MODULAR ENCICLOPÉDICA: O roteiro deve ser estruturado em micro-capítulos ou módulos temáticos autônomos. Cada entrada (ex: tipo de produto, raça, estilo) funciona como uma cápsula narrativa autônoma com início, meio e fim.
- PRECEDÊNCIA ABSOLUTA DO CATÁLOGO SOBRE O BLUEPRINT: Se o blueprint contiver blocos com títulos ou missões de conteúdo abstrato (como "Carboidrato", "Proteína", "Nootrópicos") que não condizem diretamente com o tema específico do catálogo ("Cada Tipo de Creatina"), você DEVE obrigatoriamente ignorar/adaptar esses títulos e missões genéricas para focar 100% dos blocos de desenvolvimento nos itens reais da lista do catálogo (ex: Creatina Monohidratada, Creatina HCL, Micronizada, Alcalina, etc.). O roteiro final deve ser um catálogo de itens real e linear.
- ABERTURA ULTRA DIRETA E CONCISA: No formato de catálogo, a introdução (Voz Vulnerabilidade do Bloco 1) NÃO deve conter histórias ou narrativas longas de múltiplos parágrafos. A abertura deve ser curta, contendo no máximo 1 ou 2 parágrafos pequenos (máximo de 120 a 150 palavras para a introdução inteira), partindo de uma confissão pessoal rápida e conectando imediatamente ao link do comentário fixado e ao primeiro item do catálogo.
- SEM TRANSIÇÕES ARTIFICIAIS: Evite introduções demoradas ou frases como "antes de entrar no catálogo", "vamos ao que interessa". Comece o roteiro gerando curiosidade sobre a substância do tema e entre diretamente na descrição do primeiro item do catálogo de forma contínua.
- CURVA NARRATIVA OBRIGATÓRIA: Siga estritamente esta progressão de curva narrativa ao longo do roteiro:
  1. Âncora Inicial (Hook/Abertura): Apresentação do tema sob uma ótica surpreendente ou intrigante.
  2. Camadas de Complexidade Crescente: Aprofundamento em ordem progressiva de mistério, complexidade ou valor.
  3. Ponto de Virada no Meio / Mito de Origem: Uma história de origem fascinante, lenda ou reviravolta no meio do vídeo.
  4. Tensão Ética ou Histórica: Apresentação de um dilema, conflito ético, proibição ou mistério não resolvido sobre o tema.
  5. Retorno Circular / Fechamento: Conexão com o ponto inicial, amarrando a tese do vídeo com uma frase final de impacto.
- RITMO MODULAR INTERNO (ESTRUTURA DE 3 BEATS POR MÓDULO): Cada item/entrada do catálogo no roteiro deve seguir um micro-roteiro interno de 3 beats:
  1. Definição: O que é o item, sua característica mais chamativa ou única.
  2. Origem/Contexto: História, de onde veio, quem criou ou como surgiu.
  3. Distinção: O que o diferencia completamente de todos os outros.
- RIGOR HISTÓRICO E FATOS REAIS: É expressamente proibido alucinar ou inventar qualquer dado. Todas as datas, nomes, localizações, dados científicos e históricos devem ser estritamente reais, precisos, documentados e verificáveis. Se não tiver certeza absoluta de um fato, use um fato real conhecido semelhante.
- FORMATO DE IMAGEM/VÍDEO CLEAN BRANDING: O roteiro fará referências a marcas comerciais ou produtos consagrados de forma puramente descritiva ou usando placeholders como "[Product Placeholder: Nome do Produto/Marca]", facilitando a identificação visual.` : ''}

- Nao omita nenhuma parte, nao una secoes, nao altere a ordem narrativa interna.

${useAdvancedRetention ? `[DIRETRIZES DE RETENÇÃO AVANÇADA - PDF 2026-2027]
1. ENTRADA "OUTCOME-FIRST" (RESULTADO PRIMEIRO):
   - O primeiro bloco de desenvolvimento (Abertura/Hook) deve ser escrito entregando o resultado final, a revelação principal ou o ápice do tema nos primeiros 2 segundos.
   - É terminantemente proibido iniciar com preâmbulo histórico ou cronológico. Mostre o "depois" antes do "antes".
2. ALINHAMENTO COM TIMING GATES:
   - Estruture a cadência de forma que a revelação ou aprofundamento mais intrigante seja posicionado entre os segundos 13 e 16 (Gate 2).
   - O primeiro bloco deve fixar a atenção e a promessa em até 3 segundos (Gate 1).
3. INCOMPLETUDE ESTRATÉGICA (COMMENTS BAIT):
   - Ao escrever o roteiro, apresente 80% do raciocínio com clareza cristalina, mas deliberadamente deixe um gap de 20% que force o espectador a fazer perguntas no campo de comentários (exemplo: "duas dessas razões eu explico agora, a terceira poucas pessoas estão prontas para ouvir...").
4. REWATCH BAIT (REPLAY FORÇADO):
   - Incorpore micro-informações densas, como números específicos, fatos surpreendentes e dados complexos rápidos para incentivar o replay dos primeiros blocos.
${videoFormat !== 'catalog' ? `5. MECANISMO STOP STACK (SHORTS/REELS):
   - Se for formato Shorts/Reels, o primeiro frame deve ter uma interrupção física de padrão (STOP) sonora ou textual abrupta para frear o scroll do polegar, acumulando significado intelectual (STACK) logo no primeiro segundo.` : ''}
` : ''}
FORMATO DE SAIDA
- Escreva o roteiro inteiro como texto corrido de narrador, sem nenhuma divisao visual.
- Toda a geracao deve acontecer em um único turno de resposta continuo (thread unica). Nao use ou simule requisicoes independentes.
- Nao use cabecalhos, numeracao de blocos, titulos de secao, marcadores de markdown, colchetes ou qualquer elemento estrutural no texto entregue.
- PROIBIDO: emojis, icones ou simbolos graficos de qualquer tipo (ex: 🟢 🔴 ✅ ⚠️). Este roteiro sera narrado em voz — apenas palavras escritas por extenso. Se quiser convidar o publico a reagir, descreva a acao por extenso ("responda com verde ou vermelho"), nunca com simbolo.
- Certifique-se de que siglas, abreviações ou letras isoladas sejam escritas por extenso no arquivo final (ex: escrever 'ípsilon' em vez de 'Y', ou 'Estados Unidos' em vez de 'EUA') para garantir a leitura perfeita pelo motor de voz.
- O roteiro deve fluir do inicio ao fim como uma unica fala continua. A ordem e funcao interna de cada bloco devem ser respeitadas, mas nao devem ser visiveis no texto final.
- Nao adicione notas ao editor, indicacoes de tom, parenteses explicativos ou qualquer comentario fora da narracao.
- ENCERRAMENTO ABSOLUTO: o roteiro termina na ultima palavra da narracao. Nao adicione perguntas ao produtor ("Quer que eu ajuste..."), sugestoes de revisao, comentarios pos-roteiro ou qualquer texto apos o fechamento narrativo. O modelo nao deve comunicar nada ao leitor apos o fim do roteiro.
- O resultado deve ser um texto pronto para leitura de narrador, do primeiro ao ultimo caractere, sem nenhum ajuste adicional de formatacao.
- Respeite a meta total de ${formatCharsLabel(totalChars)} e a distribuicao de caracteres por bloco com tolerancia maxima de 8%.
- Nao omita nenhuma parte, nao una secoes, nao altere a ordem narrativa interna.`;
  };

  const buildInternalWritingPrompt = () => {
    const externalPrompt = buildExternalWritingPrompt();
    if (!externalPrompt) return '';

    return `${externalPrompt}

MODO DE RETORNO PARA PRODUCAO NO APLICATIVO
- Retorne o roteiro completo em texto puro.
- Preserve exatamente a mesma quantidade de blocos do blueprint.
- Use os cabecalhos BLOCO 1, BLOCO 2, BLOCO 3... ate o ultimo bloco.
- Em cada bloco, entregue apenas o texto final daquele bloco.
- Nao adicione comentarios, observacoes, introducao extra, notas ao editor ou explicacoes fora dos blocos.
- O resultado precisa ser facilmente separavel por bloco dentro do aplicativo.`;
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

  const applyManualPublishRegistration = async () => {
    const nextValue = composeManualPublishDate(manualPublishDraftDate, manualPublishDraftTime);
    const newStatus = resolveThemeStatusFromPublishDate(nextValue, 'scripted');
    const isSchedulingOrPublishing = newStatus === 'scheduled' || newStatus === 'published';

    setManualPublishDate(nextValue);

    const activeSessionThemeId = typeof window !== 'undefined' && activeProject?.id
      ? sessionStorage.getItem(`active_script_theme_${activeProject.id}`)
      : null;
    const resolvedThemeId = approvedBriefing?.id || approvedBriefing?.themeId || activeSessionThemeId || buildExecutionSnapshot()._themeId;

    if (isSchedulingOrPublishing && resolvedThemeId && executionStorageKey) {
      // 1. Build the full snapshot containing current script blocks/text and heavy assets
      const fullSnapshot = buildExecutionSnapshot({
        manualPublishDate: nextValue,
      });

      try {
        const { success, bytesFreed } = await syncAndFreeTheme(
          resolvedThemeId,
          activeProject.id,
          fullSnapshot,
          executionStorageKey
        );

        if (success) {
          showToast(`✅ Sincronizado com a nuvem e espaço local liberado (${(bytesFreed / 1024 / 1024).toFixed(2)} MB).`);
          
          // Clear states locally as they are safely in Supabase now
          setExternalScriptText('');
          setExternalSrtText('');
          setExternalSrtObserver(buildInitialSrtObserver());
          setExternalSrtPipeline(null);
          setPostScriptPackage(null);

          // Remove the active theme ID from sessionStorage because it's now finished/scheduled
          if (typeof window !== 'undefined' && activeProject?.id) {
            sessionStorage.removeItem(`active_script_theme_${activeProject.id}`);
          }

          // Update theme status in theme bank table to represent compact scheduled/published
          if (approvedBriefing && approvedTheme) {
            await syncApprovedThemeSnapshot({
              manualPublishDate: nextValue,
              externalScriptText: '',
              externalSrtText: '',
              externalSrtObserver: [],
              externalSrtPipeline: null,
              postScriptPackage: null,
            });
          }
          return;
        } else {
          showToast('⚠️ Sincronização automática falhou. Mantendo dados locais por segurança.');
          return;
        }
      } catch (err) {
        console.warn('[ScriptEngine] syncAndFreeTheme failed:', err);
        showToast('⚠️ Erro ao conectar ao banco. Dados mantidos localmente.');
        return;
      }
    }

    // Normal path or fallback if not scheduling/publishing or if sync failed
    if (approvedBriefing && approvedTheme) {
      await syncApprovedThemeSnapshot({
        manualPublishDate: nextValue,
        ...(isSchedulingOrPublishing ? {
          externalScriptText: '',
          externalSrtText: '',
          externalSrtObserver: [],
        } : {}),
      });
    }

    persistExecutionSnapshotLocally({
      manualPublishDate: nextValue,
      ...(isSchedulingOrPublishing ? {
        externalScriptText: '',
        externalSrtText: '',
        externalSrtObserver: [],
      } : {}),
    });

    if (isSchedulingOrPublishing) {
      showToast('Conteúdo de texto liberado. Espaço de armazenamento otimizado.');
      // Remove the active theme ID from sessionStorage because it's now finished/scheduled
      if (typeof window !== 'undefined' && activeProject?.id) {
        sessionStorage.removeItem(`active_script_theme_${activeProject.id}`);
      }
    }
  };

  const clearPublishDate = async () => {
    setManualPublishDate('');
    setManualPublishDraftDate('');
    setManualPublishDraftTime('');
    persistExecutionSnapshotLocally({ manualPublishDate: '' });
    if (approvedBriefing && approvedTheme) {
      await syncApprovedThemeSnapshot({ manualPublishDate: '' });
    }
    showToast('Data de postagem removida. Status voltou para Produção.');
  };

  const resolveSnapshotBlocks = (snapshot: any): ScriptBlock[] => {
    if (Array.isArray(snapshot?.scriptBlocks) && snapshot.scriptBlocks.length > 0) {
      return snapshot.scriptBlocks;
    }

    if (snapshot?.approvedBriefing && Number(snapshot?.approvedBriefing?.blockCount || 0) > 0) {
      return buildScriptBlocksFromBriefing(snapshot.approvedBriefing, snapshot?.approvedTheme || '');
    }

    return [];
  };

  const persistExecutionSnapshotLocally = (overrides: Partial<ExecutionSnapshot> = {}) => {
    if (!executionStorageKey) return;

    const snapshot = {
      ...buildExecutionSnapshot(overrides),
      updated_at: new Date().toISOString(),
    };

    // Split large objects into separate localStorage keys to avoid QuotaExceededError
    // The main snapshot stores a sentinel instead of the full object
    const srtPipelineKey = `${executionStorageKey}_srt_pipeline`;
    const postPackageKey = `${executionStorageKey}_post_package`;

    const { externalSrtPipeline: srtPipeline, postScriptPackage: postPkg, ...snapshotWithoutLargeObjects } = snapshot as any;

    const compactSnapshot = {
      ...snapshotWithoutLargeObjects,
      _hasSrtPipeline: !!srtPipeline,
      _hasPostPackage: !!postPkg,
      _themeId: (snapshot as any)._themeId,
    };

    // Pre-emptive cleanup: remove stale snapshot_ keys only (safe — these are small, per-theme compact snapshots)
    try {
      const toClean: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i) || '';
        if (k.startsWith('snapshot_')) toClean.push(k);
      }
      toClean.forEach(k => localStorage.removeItem(k));
    } catch { /* ignore */ }

    try {
      // Save large objects only when truthy.
      // IMPORTANT: when null, we intentionally leave the existing key intact.
      // Explicit deletion of these keys happens only in clearExecutionState().
      if (srtPipeline || postPkg) {
        const currentThemeId = (snapshot as any)._themeId;
        if (supabase && currentThemeId) {
          // CLOUD FIRST: Save heavy assets to script_executions table to avoid QuotaExceededError
          upsertScriptExecution(currentThemeId, {
            externalSrtPipeline: srtPipeline || undefined,
            postScriptPackage: postPkg || undefined,
          }).catch(err => console.warn('[ScriptEngine] Failed to save heavy assets to Supabase', err));
        } else {
          // OFFLINE FALLBACK: Save to localStorage (may throw QuotaExceededError)
          if (srtPipeline) {
            try {
              localStorage.setItem(srtPipelineKey, JSON.stringify(srtPipeline));
            } catch (quotaErr) {
              console.warn('[ScriptEngine] SRT pipeline too large for localStorage, skipping persistence of that field.', quotaErr);
              compactSnapshot._hasSrtPipeline = false;
            }
          }
          if (postPkg) {
            try {
              localStorage.setItem(postPackageKey, JSON.stringify(postPkg));
            } catch (quotaErr) {
              console.warn('[ScriptEngine] Post-script package too large for localStorage, skipping persistence of that field.', quotaErr);
              compactSnapshot._hasPostPackage = false;
            }
          }
        }
      }

      // Save the compact snapshot (always small enough)
      localStorage.setItem(executionStorageKey, JSON.stringify(compactSnapshot));
      // Update storage usage indicator after every write
      checkStorageUsage();
    } catch (err) {
      console.warn('[ScriptEngine] Falha ao persistir snapshot localmente.', err);
    }
  };

  const syncSnapshotToCloud = async (overrides: Partial<ExecutionSnapshot> = {}) => {
    const activeSessionThemeId = typeof window !== 'undefined' && activeProject?.id
      ? sessionStorage.getItem(`active_script_theme_${activeProject.id}`)
      : null;
    const currentThemeId = overrides._themeId || activeSessionThemeId || (approvedBriefing as any)?.id || (approvedBriefing as any)?.themeId || undefined;
    
    if (supabase && currentThemeId) {
      const fullSnap = buildExecutionSnapshot(overrides);
      const { externalSrtPipeline, postScriptPackage, ...compactSnap } = fullSnap as any;
      try {
        await upsertScriptExecution(currentThemeId, compactSnap);
        console.log('[ScriptEngine] Synced compact snapshot to cloud successfully.');
      } catch (err) {
        console.warn('[ScriptEngine] Failed to sync snapshot to cloud:', err);
      }
    }
  };

  const buildScriptBlocksFromBriefing = (briefing: any, theme: string): ScriptBlock[] => {
    const sop = activeProject?.editing_sop || { cut_rhythm: '3s', zoom_style: 'Dynamic', soundtrack: 'Reflexive' };
    const hookReference = describeNarrativeAssetReference('Camada de abertura de referencia', briefing.openingHook);
    const ctaReference = describeNarrativeAssetReference('Camada final de conversao de referencia', briefing.selectedCta);
    const structureReference = describeNarrativeAssetReference('Estrutura de titulo', briefing.selectedTitleStructure);
    const midCtaPosition = Number(briefing?.midCta?.position ?? -1);

    const currentFormat = briefing?.videoFormat || videoFormat;
    return (briefing?.blocks || []).map((b: any, i: number) => {
      const openingLayer = i === 0 && currentFormat !== 'catalog'
        ? `Abra este primeiro bloco incorporando a camada de abertura abaixo, sem copiar a formulacao original e sem transformar isso em um bloco separado.\n\n${hookReference}\n`
        : '';
      const midCtaLayer = briefing?.midCta && i === midCtaPosition
        ? `\n\nIntervencao intermediaria obrigatoria: embuta uma microchamada organicamente na passagem deste bloco, sem criar novo bloco numerado.\nReferencia funcional: ${briefing.midCta.pattern || 'Nao definida'}`
        : '';
      const closingLayer = i === ((briefing?.blocks?.length || 1) - 1)
        ? `\n\nFechamento obrigatorio: encerre este ultimo bloco incorporando a camada final de conversao abaixo, sem separar isso em um bloco adicional.\n\n${ctaReference}\n\nConecte com a PUC: ${activeProject?.puc || 'DNA do projeto'}`
        : '';

      return {
        id: `block_${i}_${b.id}`,
        type: 'Development' as const,
        title: `${b.name} [${b.voiceStyle}]`,
        content: `${openingLayer}${b.missionNarrative}\n\nDesenvolver: ${b.name}.\n${b.communityElement ? 'Elemento de comunidade: use apenas como gatilho de identificacao coletiva e pertencimento, sem repetir a frase-base cadastrada.\n' : ''}${structureReference}${midCtaLayer}${closingLayer}`,
        sop: `Voz: ${b.voiceStyle}. Trilha: ${sop.soundtrack}. Use sobreposicao de texto tecnico.`,
      };
    });
  };

  const parseExternalScriptSections = (text: string) => {
    const normalized = text.replace(/\n/g, '\n').trim();
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

  const segmentExternalScriptForBlocks = (text: string, targetCount: number) => {
    const normalized = text.replace(/\n/g, '\n').trim();
    if (!normalized) return [];

    const sections = parseExternalScriptSections(normalized);
    if (sections.length >= Math.min(2, targetCount) || targetCount <= 1) {
      return sections;
    }

    const sentences =
      normalized
        .match(/[^.!?]+[.!?]+|[^.!?]+$/g)
        ?.map((sentence) => sentence.trim())
        .filter(Boolean) || [normalized];

    const desiredCount = Math.min(Math.max(1, targetCount), sentences.length);
    if (desiredCount <= 1) return [normalized];

    const chunkSize = Math.ceil(sentences.length / desiredCount);
    return Array.from({ length: desiredCount }, (_, index) =>
      sentences
        .slice(index * chunkSize, (index + 1) * chunkSize)
        .join(' ')
        .trim()
    ).filter(Boolean);
  };

  const applyExternalScriptToBlocks = async (text: string, fileName?: string) => {
    const targetCount = Math.max(1, scriptBlocks.length || approvedBriefing?.blocks?.length || 1);
    const sections = segmentExternalScriptForBlocks(text, targetCount);
    if (sections.length === 0) {
      alert('Nao encontrei blocos ou secoes suficientes no texto externo.');
      return;
    }

    const nextBlocks = scriptBlocks.map((block, index) => ({
      ...block,
      content: sections[index] || block.content,
    }));

    setScriptBlocks(nextBlocks);
    setScriptStage('final');
    setPostScriptPackage(null);
    setExternalScriptText(text);
    if (fileName) setExternalScriptFileName(fileName);
    persistExecutionSnapshotLocally({
      scriptBlocks: nextBlocks,
      scriptStage: 'final',
      externalScriptText: text,
      externalScriptFileName: fileName || externalScriptFileName,
      executionMode: 'external',
      externalSrtText,
      externalSrtFileName,
      postScriptPackage: null,
    });

    await syncApprovedThemeSnapshot({
      scriptBlocks: nextBlocks,
      scriptStage: 'final',
      externalScriptText: text,
      externalScriptFileName: fileName || externalScriptFileName,
      executionMode: 'external',
      externalSrtText,
      externalSrtFileName,
      postScriptPackage: null,
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
      setExternalFactCheckReport(null);
      setExternalHumanizeReport(null);
      setPendingHumanizedText(null);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText: text,
        externalScriptFileName: file.name,
        externalSrtText,
        externalSrtFileName,
        externalFactCheckReport: null,
        externalHumanizeReport: null,
        pendingHumanizedText: null,
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao ler arquivo externo.', error);
      alert('Nao foi possivel ler o arquivo .txt enviado.');
    } finally {
      event.target.value = '';
    }
  };

  const compilePromptText = (text: string) => {
    if (!text) return '';
    let compiled = text;
    if (!preserveBrackets && videoFormat !== 'catalog') {
      visualBlueprintCast.forEach((char) => {
        if (!char.name || !char.description) return;
        const escapedName = char.name.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
        const regex = new RegExp(`\\[${escapedName}\\]`, 'gi');
        compiled = compiled.replace(regex, `(${char.description.trim()})`);
      });
    }

    if (promptPrefix && promptPrefix !== 'none') {
      const lines = compiled.split('\n');
      const processedLines = lines.map(line => {
        if (!line.trim()) return line;
        return `${promptPrefix} ${line}`;
      });
      compiled = processedLines.join('\n');
    }

    return compiled;
  };

  const compileUnifiedImagePrompts = (): string => {
    if (!externalSrtPipeline) return '';
    const baseText = compilePromptText(externalSrtPipeline.imagePromptsTxt);
    
    // In faceless and catalog modes, we don't append HyperFrame background image prompts.
    if (videoFormat === 'faceless' || videoFormat === 'catalog') {
      return baseText;
    }

    const hfRows = externalSrtPipeline.rows.filter((r: any) => normalizeAssetType(r.asset) === 'hyperframe');
    if (!hfRows.length) return baseText;

    const hfLines = hfRows.map((r: any) => {
      const generated = hfBgPrompts?.find((p) => p.rowNumber === r.rowNumber && p.rowNumber !== -1);
      const promptText = generated?.prompt || `Photorealistic still image of a dark cinematic background representing ${r.texto.slice(0, 60).trim()}, high quality YouTube B-roll style.`;
      return `HF${r.rowNumber}: ${compilePromptText(promptText)}`;
    });

    const separator = baseText.trim() ? '\n' : '';
    return `${baseText}${separator}${hfLines.join('\n')}`;
  };

  const getCharacterSheetPrompt = (char: { name: string; description: string }) => {
    const styleBlock = char.description.toLowerCase().includes('anime') || 
                       char.description.toLowerCase().includes('cartoon') || 
                       char.description.toLowerCase().includes('illustrated') ||
                       char.description.toLowerCase().includes('stylized')
      ? "Stylized digital art style rendering. Clean, consistent line work with uniform weight. Professional animation/game studio production quality."
      : "Ultra-photorealistic rendering. Hyper-detailed as if captured by a high-end full-frame DSLR camera (Canon EOS R5, 85mm portrait lens, f/2.8, ISO 100). Skin with natural pores, subtle micro-imperfections, fine peach fuzz, and realistic subsurface scattering. Hair with individual strand-level detail, natural sheen, and volume. Eyes with realistic moisture, light reflection, and iris detail. Fabric textures clearly distinguishable — cotton weave, denim texture, leather grain, knit patterns. RAW photo quality, 8K resolution detail.";

    return [
      `Create a professional character reference sheet presented as a technical model turnaround of ${char.name}. Clean, neutral, solid plain gray background — no gradients, no environments, no props. Professional concept art turnaround used in film, game development, or animation production.`,
      styleBlock,
      `Character details: ${char.description.trim()}`,
      `The image is composed of exactly two horizontal rows with clean panel separation and even spacing:`,
      `Top row — four full-body standing views side by side, left to right:\nPanel 1: Front view — character standing facing the camera directly, feet slightly apart in a relaxed A-pose, arms slightly away from the body with hands relaxed at sides, fingers naturally open, full body visible head to feet, camera at chest height straight on.\nPanel 2: Left profile view — character rotated exactly 90 degrees facing left, same A-pose, full body visible head to feet, camera at chest height perpendicular to the side, showing left side of face, left arm forward, right arm behind.\nPanel 3: Right profile view — character rotated exactly 90 degrees facing right, same A-pose, full body visible head to feet, camera at chest height perpendicular to the side, showing right side of face, right arm forward, left arm behind, perfect mirror of panel 2.\nPanel 4: Back view — character rotated 180 degrees facing directly away from camera, same A-pose, full body visible head to feet, camera at chest height straight on, showing back of head, back of outfit, shoe heels.`,
      `Bottom row — three close-up portrait views centered beneath the full-body row, left to right:\nPanel 5: Front portrait — head, neck, and upper shoulders visible, character facing camera directly, neutral expression, highly detailed facial features, skin texture, hair, upper clothing neckline, camera at eye level straight on.\nPanel 6: Left profile portrait — head, neck, and upper shoulders visible, head rotated 90 degrees facing left, showing left ear, left jawline, left side of nose, left brow, same neutral expression, camera at eye level perpendicular, highly detailed.\nPanel 7: Right profile portrait — head, neck, and upper shoulders visible, head rotated 90 degrees facing right, showing right ear, right jawline, right side of nose, right brow, same neutral expression, camera at eye level perpendicular, perfect mirror of panel 6, highly detailed.`,
      `Absolute identity consistency across all 7 panels. Same face with identical bone structure, eye spacing, nose, lips, and chin in every view. Same body with identical height, proportions, build, and posture. Same outfit with every detail matching perfectly from every angle — same wrinkles, pocket placement, color, fit, material appearance. Same hair color, length, volume, and styling from every angle, anatomically consistent when viewed from front, side, and back. Same skin tone and marks across all panels. Same accessories in the same position from every angle. No variation in age, weight, or any physical attribute between panels. The turnaround must look like the same subject captured from different angles in the same session.`,
      `Three-point studio lighting identical across all 7 panels. Key light positioned upper-right at 45 degrees with medium-soft intensity. Fill light positioned left, softer than key light. Subtle rim light from behind for edge separation from background. Same shadow direction, softness, and highlight intensity in every panel. Neutral daylight color temperature. Crisp, print-ready output. Sharp details throughout with no softness, blur, or artifacts. Professional production quality. Clean panel edges, even spacing. No text, labels, watermarks, or annotations. Landscape orientation for the overall sheet. High resolution.`
    ].join('\n\n');
  };

  const copyAllCharacterPrompts = () => {
    if (visualBlueprintCast.length === 0) return;
    
    const combinedPrompts = visualBlueprintCast.map((char) => {
      const prompt = getCharacterSheetPrompt(char);
      return `==================================================\nFICHA DE PERSONAGEM: ${char.name.toUpperCase()}\n==================================================\n\n${prompt}`;
    }).join('\n\n\n');

    void copyTextToClipboard(combinedPrompts, 'Todos os prompts de personagens foram copiados!');
  };

  const extractVisualBlueprintAndCast = async () => {
    const textToAnalyze = externalScriptText || '';
    if (!textToAnalyze.trim()) {
      alert('Nao ha roteiro para analisar. Carregue um roteiro .txt primeiro.');
      return;
    }

    const engine = activeProject?.ai_engine_rules?.engine || 'openai';
    const model = activeProject?.ai_engine_rules?.model || (engine === 'gemini' ? 'gemini-2.5-flash' : 'gpt-5.1');
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    if (!apiKey) {
      alert(`Por favor, configure sua chave de API para ${engine} em Ajustes Globais ou no navegador.`);
      return;
    }

    setIsExtractingVisuals(true);
    try {
      const response = await fetch('/api/assets/analyze-script-visuals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scriptText: textToAnalyze,
          engine,
          model,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject?.ai_engine_rules,
          videoFormat,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao analisar o roteiro.'));
      }

      const setting = data.setting || '';
      const characters = Array.isArray(data.characters) ? data.characters : [];

      setVisualBlueprintSetting(setting);
      setVisualBlueprintCast(characters);

      persistExecutionSnapshotLocally({
        visualBlueprintSetting: setting,
        visualBlueprintCast: characters,
      });
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao extrair visuais: ${err.message}`);
    } finally {
      setIsExtractingVisuals(false);
    }
  };

  const handleExternalHumanize = async () => {
    const textToAnalyze = externalScriptText || '';
    if (!textToAnalyze.trim()) {
      alert('Não há roteiro para humanizar.');
      return;
    }

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    if (!apiKey) {
      alert(`Por favor, configure sua chave de API para ${engine} em Ajustes Globais.`);
      return;
    }

    setIsHumanizingExternal(true);
    try {
      const systemPrompt = `Você é um editor de escrita sênior especialista em remover traços de redação de IA (slop) e tornar textos naturais, fluidos e humanos.
Você deve analisar o roteiro enviado e produzir obrigatoriamente um objeto JSON contendo exatamente duas chaves:
- "audit": Um relatório detalhado estruturado em Markdown listando quais pontos ou expressões específicas do texto original foram ajustados/polidos (identificando vícios de IA removidos ou melhorias de tom) e a justificativa para cada ajuste. Use uma tabela Markdown ou tópicos organizados.
- "humanizedText": O texto completo do roteiro reescrito de forma natural, fluida e humanizada, sem introduções, comentários externos ou tags.

Diretrizes estritas de escrita (não ignore nenhuma):
1. NUNCA use travessões (— ou –). Substitua por vírgula, parênteses ou quebre em frases curtas.
2. NUNCA use clichês de IA (delve, tapestry, testament, moreover, align, crucial, interplay, key, vibrant, etc.).
3. Prefira sempre voz ativa e frases diretas.
4. Varie o ritmo do texto, misturando frases curtas e diretas com frases maiores.

O retorno deve ser estritamente no formato JSON, sem marcações ou textos adicionais fora do JSON, contendo as propriedades "audit" e "humanizedText".`;

      const humanizePrompt = `${systemPrompt}

${writingStyleSample ? `[AMOSTRA DE ESTILO DE VOZ DO APRESENTADOR (SIGA ESTA CADÊNCIA/ESTILO COPIANDO-O)]:\n${writingStyleSample}\n\n` : ''}
[ROTEIRO PARA HUMANIZAR]:
${textToAnalyze}`;

      const response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          prompt: humanizePrompt,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject?.ai_engine_rules,
          responseType: 'json'
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Erro na chamada de humanização.'));
      }

      let resultText = '';
      if (engine === 'gemini') {
        resultText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
      } else {
        resultText = data.choices?.[0]?.message?.content || '';
      }

      resultText = resultText.trim();
      if (resultText.startsWith('```')) {
        resultText = resultText.replace(/^```(json)?/i, '').replace(/```$/, '').trim();
      }

      let parsed;
      try {
        parsed = JSON.parse(resultText);
      } catch (parseErr) {
        const jsonMatch = resultText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          try {
            parsed = JSON.parse(jsonMatch[0]);
          } catch (e) {
            throw new Error('Falha ao parsear o JSON retornado pelo assistente.');
          }
        } else {
          throw new Error('Retorno do assistente não continha um objeto JSON válido.');
        }
      }

      const audit = parsed.audit || '';
      const humanizedText = parsed.humanizedText || '';

      if (!humanizedText) {
        throw new Error('O retorno não possui o roteiro humanizado ("humanizedText").');
      }

      setExternalHumanizeReport(audit || 'Texto ajustado com sucesso.');
      setPendingHumanizedText(humanizedText);
      setIsHumanizeReportExpanded(false);
      persistExecutionSnapshotLocally({
        externalHumanizeReport: audit || 'Texto ajustado com sucesso.',
        pendingHumanizedText: humanizedText
      });
      await syncSnapshotToCloud({
        externalHumanizeReport: audit || 'Texto ajustado com sucesso.',
        pendingHumanizedText: humanizedText
      });
      showToast('✨ Auditoria de humanização gerada! Revise abaixo.');
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao humanizar: ${err.message || err}`);
    } finally {
      setIsHumanizingExternal(false);
    }
  };

  const handleApplyHumanizedText = async () => {
    if (!pendingHumanizedText) return;
    setExternalScriptText(pendingHumanizedText);
    setPendingHumanizedText(null);
    setExternalHumanizeReport(null);
    persistExecutionSnapshotLocally({
      externalScriptText: pendingHumanizedText,
      pendingHumanizedText: null,
      externalHumanizeReport: null
    });
    await syncSnapshotToCloud({
      externalScriptText: pendingHumanizedText,
      pendingHumanizedText: null,
      externalHumanizeReport: null
    });
    showToast('✨ Texto humanizado aplicado com sucesso!');
  };

  const handleDiscardHumanizedText = async () => {
    setPendingHumanizedText(null);
    setExternalHumanizeReport(null);
    persistExecutionSnapshotLocally({
      pendingHumanizedText: null,
      externalHumanizeReport: null
    });
    await syncSnapshotToCloud({
      pendingHumanizedText: null,
      externalHumanizeReport: null
    });
    showToast('Alterações humanizadas descartadas.');
  };

  const handleExternalFactCheck = async () => {
    const textToAnalyze = externalScriptText || '';
    if (!textToAnalyze.trim()) {
      alert('Não há roteiro para verificar.');
      return;
    }

    const geminiKey = (typeof window !== 'undefined' && localStorage.getItem('yt_gemini_key')) || '';
    if (!geminiKey) {
      alert('Por favor, configure sua chave da API do Google Gemini em Ajustes Globais para usar o Fact-Checker com busca integrada.');
      return;
    }

    setIsFactCheckingExternal(true);
    try {
      const factCheckPrompt = `Você é um verificador de fatos (Fact-Checker) jornalístico profissional e detalhado.
Analise o roteiro a seguir e identifique afirmações que envolvam fatos, estatísticas, datas, dados científicos, eventos históricos ou nomes de produtos/marcas.

Faça uma checagem com o motor de busca e produza um relatório estruturado no seguinte formato:
1. Resumo Geral (Total de fatos checados, quantos corretos, alertas e incorretos).
2. Tabela de Verificação Focada em Ajustes:
   - IMPORTANTE: Para evitar que a tabela seja cortada por limite de tamanho, liste detalhadamente na tabela APENAS as afirmações que receberem o status ⚠️ ALERTA ou ❌ INCORRETO.
   - Colunas da tabela: Fato citado | Status (⚠️ ALERTA ou ❌ INCORRETO) | Correção/Ajuste sugerido e fonte (URL clicável se houver).
3. Lista de Fatos Confirmados (✅ PRECISO):
   - Apresente apenas uma lista simples ou parágrafo compacto citando de forma resumida os fatos que foram confirmados e estão corretos (para não inflar o tamanho do texto).

Seja rigoroso e preciso. Se o fato for fictício ou alucinado, marque como incorreto.
Retorne APENAS o relatório estruturado em Markdown limpo.

[ROTEIRO PARA VERIFICAÇÃO]:
${textToAnalyze}`;

      let response = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine: 'gemini',
          model: 'gemini-3.5-flash',
          prompt: factCheckPrompt,
          apiKeyOverwrite: geminiKey,
          projectConfig: activeProject?.ai_engine_rules,
          responseType: 'text',
          useSearchGrounding: true
        }),
      });

      let data = await response.json();
      
      // Normaliza o erro para string independente se vier como objeto ou string
      const rawError = data?.error;
      const errorMessage = typeof rawError === 'string'
        ? rawError.toLowerCase()
        : (typeof rawError === 'object' && rawError !== null
            ? (rawError.message || rawError.status || JSON.stringify(rawError)).toLowerCase()
            : '');

      // Fallback sem Search Grounding para: quota, billing, grounding não disponível,
      // modelo não encontrado, sem permissão ou serviço indisponível
      const isQuotaOrGroundingError = !response.ok && (
        errorMessage.includes('quota') ||
        errorMessage.includes('billing') ||
        errorMessage.includes('grounding') ||
        errorMessage.includes('limit') ||
        errorMessage.includes('not_found') ||
        errorMessage.includes('not found') ||
        errorMessage.includes('permission_denied') ||
        errorMessage.includes('permission denied') ||
        errorMessage.includes('unavailable') ||
        errorMessage.includes('api_key_invalid') ||
        response.status === 404 ||
        response.status === 403
      );

      if (isQuotaOrGroundingError) {
        console.warn('Erro na 1ª tentativa do fact-check (modelo/grounding/quota). Tentando novamente com gemini-2.5-flash sem Search Grounding...', { errorMessage, status: response.status });
        // Fallback: usa gemini-2.5-flash sem search grounding (100% compatível com free tier)
        response = await fetch('/api/ai/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engine: 'gemini',
            model: 'gemini-2.5-flash',
            prompt: factCheckPrompt,
            apiKeyOverwrite: geminiKey,
            projectConfig: null, // ignora config do projeto para usar o modelo de fallback
            responseType: 'text',
            useSearchGrounding: false
          }),
        });
        data = await response.json();
      }

      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Erro na chamada de fact-checking.'));
      }

      let resultText = (data.candidates?.[0]?.content?.parts?.[0]?.text || '').trim();
      if (!resultText) throw new Error('Nenhum relatório foi retornado pelo verificador.');

      if (isQuotaOrGroundingError) {
        const errorDetail = rawError && typeof rawError === 'object' && rawError.message 
          ? rawError.message 
          : (typeof rawError === 'string' ? rawError : errorMessage || 'desconhecido');
        resultText = `> ⚠️ **Aviso (Fallback Automático):** A primeira tentativa com busca em tempo real falhou (Motivo: *${errorDetail}*). A verificação foi realizada com **Gemini 2.5 Flash** usando apenas o conhecimento nativo do modelo, sem busca em tempo real.\n\n${resultText}`;
      }

      setExternalFactCheckReport(resultText);
      setIsFactCheckReportExpanded(false); // sempre inicia colapsado
      persistExecutionSnapshotLocally({ externalFactCheckReport: resultText });
      await syncSnapshotToCloud({ externalFactCheckReport: resultText });
      showToast('🔍 Fact-check concluído com sucesso!');
    } catch (err: any) {
      console.error(err);
      alert(`Erro ao rodar fact-check: ${err.message || err}`);
    } finally {
      setIsFactCheckingExternal(false);
    }
  };

  const handleExternalSrtUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      setExecutionMode('external');
      setExternalSrtFileName(file.name);
      setExternalSrtText(text);
      setExternalSrtPipeline(null);
      const nextObserver = buildInitialSrtObserver().map((step) =>
        step.key === 'upload'
          ? { ...step, status: 'done' as const, detail: `Arquivo ${file.name} anexado e persistido nesta execucao.` }
          : step
      );
      setExternalSrtObserver(nextObserver);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText: text,
        externalSrtFileName: file.name,
        externalSrtPipeline: null,
        externalSrtObserver: nextObserver,
      });
      void syncApprovedThemeSnapshot({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText: text,
        externalSrtFileName: file.name,
        externalSrtPipeline: null,
        externalSrtObserver: nextObserver,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar SRT externo.', error);
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao ler arquivo .srt.', error);
      alert('Nao foi possivel ler o arquivo .srt enviado.');
    } finally {
      event.target.value = '';
    }
  };

  const copyTextToClipboard = async (value: string, successMessage: string) => {
    if (!value.trim()) {
      showToast('Nenhum conteudo disponivel para copiar.');
      return;
    }

    try {
      await navigator.clipboard.writeText(value);
      showToast(successMessage);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao copiar conteudo.', error);
      showToast('Nao foi possivel copiar o conteudo.');
    }
  };

  const updateSrtObserverStep = (
    key: SrtPipelineObserverStep['key'],
    status: SrtPipelineStepStatus,
    detail: string
  ) => {
    setExternalSrtObserver((current) =>
      current.map((step) => (step.key === key ? { ...step, status, detail } : step))
    );
  };

  const downloadTextArtifact = (
    stem: string,
    suffix: string,
    content: string,
    options?: { extension?: 'txt' | 'csv' | 'bat' | 'fcpxml'; mimeType?: string }
  ) => {
    if (!content.trim()) {
      alert('Nao ha conteudo disponivel para exportar.');
      return;
    }

    const safeStem = sanitizeDownloadFileStem(stem);
    const extension = options?.extension || 'txt';
    const mimeType = options?.mimeType || 'text/plain;charset=utf-8';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeStem}_${suffix}.${extension}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleExportFcpxml = () => {
    if (!externalSrtPipeline?.rows?.length) {
      alert('Não há pipeline de legenda (.srt) carregado ou processado para exportar.');
      return;
    }

    try {
      const fcpxmlContent = buildFcpxmlTimeline(
        externalSrtPipeline.rows,
        approvedBriefing?.title || approvedTheme || 'ContentOS_CapCut',
        {
          baseDirectory: fcpxmlBaseDir,
          namingTemplate: fcpxmlNaming,
          defaultVideoDuration: fcpxmlVidDuration,
          defaultImageDuration: fcpxmlImgDuration,
          videoExtension: 'mp4',
          imageExtension: 'png',
          projectStem: srtArtifactStem,
          videoFormat: videoFormat,
        }
      );

      downloadTextArtifact(
        srtArtifactStem,
        'capcut_timeline',
        fcpxmlContent,
        { extension: 'fcpxml', mimeType: 'application/xml;charset=utf-8' }
      );
    } catch (err) {
      console.error('[ScriptEngine] Erro ao exportar FCPXML:', err);
      alert('Erro ao gerar arquivo da timeline FCPXML.');
    }
  };

  const handleScanFolder = async (isExtra = false) => {
    if (typeof window === 'undefined' || !(window as any).showDirectoryPicker) {
      alert('Seu navegador não suporta a API File System Access. Por favor, utilize o Google Chrome, Microsoft Edge ou outro navegador compatível.');
      return;
    }

    try {
      const handle = await (window as any).showDirectoryPicker();
      if (isExtra) {
        setExtraFolderHandle(handle);
      } else {
        setMainFolderHandle(handle);
      }

      setIsScanning(true);
      const newFilesMap = { ...scannedFilesMap };
      let matchedCount = 0;

      // Helper to read video duration using temporary video element
      const getVideoDuration = (file: File): Promise<number> => {
        return new Promise((resolve) => {
          const video = document.createElement('video');
          video.preload = 'metadata';
          const objectUrl = URL.createObjectURL(file);
          video.src = objectUrl;
          video.onloadedmetadata = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(video.duration);
          };
          video.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(0);
          };
        });
      };

      for await (const entry of handle.values()) {
        if (entry.kind === 'file') {
          const name = entry.name;
          const match = name.match(/^(\d+)/);
          if (match) {
            const rowNum = parseInt(match[1], 10);
            const file = await entry.getFile();
            const isVideo = file.type.startsWith('video/') || 
                            /\.(mp4|mov|m4v|mkv|avi|webm)$/i.test(name);
            
            let duration = 0;
            if (isVideo) {
              duration = await getVideoDuration(file);
            }

            newFilesMap[rowNum] = {
              name,
              realDuration: duration
            };
            matchedCount++;
          }
        }
      }

      setScannedFilesMap(newFilesMap);
      setIsScanning(false);
      showToast(`Pasta escaneada com sucesso! ${matchedCount} arquivos correspondentes adicionados ao mapa.`);
    } catch (err: any) {
      setIsScanning(false);
      if (err.name !== 'AbortError') {
        console.error('[ScriptEngine] Erro ao escanear pasta:', err);
        alert(`Erro ao escanear pasta: ${err.message}`);
      }
    }
  };

  const handleExportCapcutZip = async () => {
    if (!externalSrtPipeline?.rows?.length) {
      alert('Não há pipeline de legenda (.srt) carregado ou processado para exportar.');
      return;
    }

    try {
      const projectName = approvedBriefing?.title || approvedTheme || 'ContentOS_CapCut';
      const safeStem = sanitizeDownloadFileStem(srtArtifactStem);
      const audioFilename = `${safeStem}.mp3`;

      const JSZip = (await import('jszip')).default;
      const zip = new JSZip();

      const result = buildCapCutDraft(
        externalSrtPipeline.rows,
        projectName,
        {
          baseDirectory: fcpxmlBaseDir,
          namingTemplate: fcpxmlNaming,
          defaultVideoDuration: fcpxmlVidDuration,
          defaultImageDuration: fcpxmlImgDuration,
          videoExtension: 'mp4',
          imageExtension: 'png',
          projectStem: srtArtifactStem,
          videoFormat: videoFormat,
          audioFilename: audioFilename,
          aspectRatio: fcpxmlAspectRatio,
          cutMode: cutMode,
          smartSpeedUp: smartSpeedUp,
          targetMinDuration: targetMinDuration,
          smartSlowDown: smartSlowDown,
          targetMaxDuration: targetMaxDuration,
          scannedFilesMap: scannedFilesMap
        }
      );

      const folderName = safeStem;
      const folder = zip.folder(folderName);
      if (folder) {
        folder.file('draft_content.json', result.draftContent);
        folder.file('draft_meta_info.json', result.draftMetaInfo);
        folder.file('draft_settings', '{"is_work_space_changed":false,"ver_num":"1.0"}');
        
        const readmeContent = `PROJETO NATIVO CAPCUT PC (WINDOWS)
Este arquivo ZIP contem a estrutura nativa do rascunho do CapCut.

COMO USAR NO WINDOWS:
1. Feche o CapCut PC.
2. Extraia esta pasta inteira (${folderName}) diretamente dentro da sua pasta de rascunhos do CapCut:
   Padrao: C:\\Users\\<SeuUsuario>\\AppData\\Local\\CapCut\\User Data\\CapCut Drafts\\
   Ou na sua pasta OneDrive: D:\\onedrive\\Downloads\\Capcut\\CapCut Drafts\\
3. Certifique-se de que a estrutura ficou assim:
   ...\\CapCut Drafts\\${folderName}\\draft_content.json
   ...\\CapCut Drafts\\${folderName}\\draft_meta_info.json
   ...\\CapCut Drafts\\${folderName}\\draft_settings
4. Abra o CapCut PC. O projeto "${projectName}" aparecera automaticamente na lista de projetos recentes.
5. Ao abrir, se o CapCut nao encontrar os arquivos de midia automaticamente, use a opcao de "Vincular Midia" (Link Media) apontando para o seu diretorio:
   ${fcpxmlBaseDir}
`;
        folder.file('COMO_USAR.txt', readmeContent);
      }

      const blob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${safeStem}_CapCut_Projeto_Nativo.zip`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

    } catch (err) {
      console.error('[ScriptEngine] Erro ao exportar CapCut ZIP:', err);
      alert('Erro ao gerar arquivo ZIP do projeto nativo.');
    }
  };

  const handleExportCapcutJson = () => {
    if (!externalSrtPipeline?.rows?.length) {
      alert('Não há pipeline de legenda (.srt) carregado ou processado para exportar.');
      return;
    }

    try {
      const projectName = approvedBriefing?.title || approvedTheme || 'ContentOS_CapCut';
      const safeStem = sanitizeDownloadFileStem(srtArtifactStem);
      const audioFilename = `${safeStem}.mp3`;

      const result = buildCapCutDraft(
        externalSrtPipeline.rows,
        projectName,
        {
          baseDirectory: fcpxmlBaseDir,
          namingTemplate: fcpxmlNaming,
          defaultVideoDuration: fcpxmlVidDuration,
          defaultImageDuration: fcpxmlImgDuration,
          videoExtension: 'mp4',
          imageExtension: 'png',
          projectStem: srtArtifactStem,
          videoFormat: videoFormat,
          audioFilename: audioFilename,
          aspectRatio: fcpxmlAspectRatio,
          cutMode: cutMode,
          smartSpeedUp: smartSpeedUp,
          targetMinDuration: targetMinDuration,
          smartSlowDown: smartSlowDown,
          targetMaxDuration: targetMaxDuration,
          scannedFilesMap: scannedFilesMap
        }
      );

      // Download draft_content.json
      const blob = new Blob([result.draftContent], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = 'draft_content.json';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);

      // Download draft_meta_info.json
      const blobMeta = new Blob([result.draftMetaInfo], { type: 'application/json;charset=utf-8' });
      const urlMeta = URL.createObjectURL(blobMeta);
      const linkMeta = document.createElement('a');
      linkMeta.href = urlMeta;
      linkMeta.download = 'draft_meta_info.json';
      document.body.appendChild(linkMeta);
      linkMeta.click();
      document.body.removeChild(linkMeta);
      URL.revokeObjectURL(urlMeta);

    } catch (err) {
      console.error('[ScriptEngine] Erro ao exportar draft_content.json:', err);
      alert('Erro ao gerar arquivo draft_content.json.');
    }
  };


  /**
   * Builds a rich narrative context string to anchor image/video prompt generation.
   *
   * Strategy: per-block summary (first 150 chars per block) so the LLM sees the
   * FULL narrative structure (Hook → Context → Dev → CTA) regardless of which
   * part of the SRT is in the current batch.
   *
   * Why not truncate by total chars? Cutting at 800 chars loses all blocks after
   * the first one or two, leaving the LLM blind to the rest of the video.
   * Why not first-N-blocks? Loses later blocks (Dev, CTA) which cover 60%+ of the SRT.
   * Per-block summary: ~150 chars × 5-8 blocks ≈ 250-400 tokens — covers everything.
   */
  const buildVideoContext = (): string => {
    const parts: string[] = [];

    // 1. Approved theme (primary anchor)
    if (approvedTheme) {
      parts.push(`Video title: ${approvedTheme}`);
    }

    // 2. Strategic pain point from briefing
    if (approvedBriefing?.pain_point) {
      parts.push(`Strategic pain point: ${approvedBriefing.pain_point}`);
    } else if (approvedBriefing?.theme_title && approvedBriefing.theme_title !== approvedTheme) {
      parts.push(`Theme: ${approvedBriefing.theme_title}`);
    }

    // 3. Narrative structure — internal mode: use scriptBlocks (source of truth)
    //    Since the SRT is the script with timing, every row in the SRT corresponds
    //    to content from these blocks. Giving the LLM the full block structure lets
    //    it contextualize any batch regardless of where in the timeline it falls.
    if (executionMode === 'internal' && scriptBlocks.length > 0) {
      const blockSummaries = scriptBlocks
        .filter((b) => b.type !== 'SOP' && b.content?.trim())
        .map((b) => {
          const summary = b.content.trim().slice(0, 150);
          return `[${b.type}: ${b.title}] ${summary}${b.content.trim().length > 150 ? '...' : ''}`;
        })
        .join(' | ');

      if (blockSummaries) {
        parts.push(`Full script structure: ${blockSummaries}`);
      }
    }

    // 4. External mode: use the script text directly (SRT == script with timing)
    if (executionMode === 'external') {
      const scriptSource = externalScriptText?.trim() || externalSrtText?.trim() || '';
      if (scriptSource) {
        parts.push(`Script context: ${scriptSource.slice(0, 500)}${scriptSource.length > 500 ? '...' : ''}`);
      }
    }

    return parts.filter(Boolean).join('\n');
  };

    const characterDescription = resolveCharacterProfileInFrontend(
      videoCharacterMode,
      videoFormat,
      activeProject?.name,
      videoCharacterCustom,
      activeProject?.persona_matrix?.demographics,
      activeProject?.editing_sop?.visual_identity || activeProject?.visual_identity
    );

    const generatePromptBatchDirectOrAPI = async (batch: any[], isDirect: boolean, apiKey: string, engine: 'openai' | 'gemini', model: string) => {
    const builtInStyles = 'Neon, Clean, Impact, Frost, Gold';
    const projectStyles = activeProject?.ai_engine_rules?.editing_sop?.text_styles || activeProject?.ai_engine_rules?.text_styles || '';
    const textStyles = projectStyles ? `${projectStyles}, ${builtInStyles}` : builtInStyles;
    const visualIdentity = activeProject?.ai_engine_rules?.editing_sop?.visual_identity || '';
    const characterDescription = resolveCharacterProfileInFrontend(
      videoCharacterMode,
      videoFormat,
      activeProject?.name,
      videoCharacterCustom,
      activeProject?.persona_matrix?.demographics,
      activeProject?.editing_sop?.visual_identity || activeProject?.visual_identity
    );

    const channelLanguage = activeProject?.persona_matrix?.channel_language || 'Português';
    const { name: langName } = getLanguageDirectives(channelLanguage);

    const dnaBlocks = parseDnaBlocks(characterDescription);
    const hasDna = dnaBlocks.hasDna;

    let dnaInstructions = '';
    if (hasDna) {
      dnaInstructions = `
CRITICAL STYLE DRIFT GUARD (DNA ASSEMBLY MODE ACTIVE):
This batch of prompts is in DNA assembly mode. Follow these rules strictly:
1. DO NOT describe the general style, art medium, lighting, camera settings, colors, or character appearance in the prompt.
2. In the "prompt" property of each item, write ONLY the "CENA" (the unique action scene description in English, 25 to 50 words, present tense, describing a static scene).
3. In the CENA, refer to the protagonist strictly as "the protagonist" (e.g., "The protagonist sits at..."). Do NOT describe their face, clothing, hair, age, or glasses.
4. Set the field "protagonista_presente" to true if the protagonist appears in the scene (based on their action, emotion, or narrative role in the subtitle), or false if they are absent.
5. Set the field "extras_presentes" to true if secondary characters or other human figures are present, or false if absent.
6. NEVER use proper names of individuals (such as "Agnes", "Claire" or "Fulgrim") in the CENA. Translate proper names to visual descriptions or generic roles (e.g., instead of "Agnes's rosary", write "a wooden rosary"; instead of "Claire", write "the protagonist").
7. The JSON output schema for each prompt MUST strictly be: {"row_number": X, "prompt": "CENA...", "protagonista_presente": true/false, "extras_presentes": true/false, "texto_adicional": {}}
`;
    }

    if (isDirect) {
      let rawFacelessHint = videoFormat === 'catalog'
        ? `CATALOG VIDEO MODE: This format is styled like a premium presentation slide or documentary collage. Banish all modern studio presenters, talking heads, or hosts speaking to the camera. Follow these layout structure rules for every scene:
1. LAYOUT VISUALS: All image and video prompts MUST describe a clean slide composition. Specifically state: "a minimalist off-white textured stucco background with smooth drop shadows" to ensure style consistency.
2. CONTENT CARDS: Visualize the narrative concepts, historical objects, maps, or portraits inside floating cards or boards with rounded corners (e.g. "a floating rounded card showing...").
3. CARD VARIATIONS: Use diverse card composition styles based on context:
   - Single center card for main focus (e.g. "a centered floating card showing...").
   - Two cards side-by-side for comparison or context (e.g. "two floating cards side-by-side: the left card showing the city facade, the right card showing a clean vector map of the region").
   - Three cards side-by-side for recipe ingredients or steps.
   - Focal emphasis: describe one central card in focus while surrounding cards are blurred.
4. TEXT OVERLAYS: If a key phrase, name, or date is prominent, describe it as bold black text centered on the slide or above the cards (e.g. "bold black text reading [Name] at the top of the slide, above a floating card...").
5. COMMERCIAL BRANDS/PRODUCTS: If a commercially recognizable product (e.g. Coca-Cola, Nutella, Starbucks) is mentioned, do not write a generic prompt. Instead: 
   - Start the prompt with a marker tag: "[Product Placeholder: Brand Name]"
   - Describe the product using its iconic packaging shapes and official brand colors (e.g. "classic red glass bottle with white ribbon design", "white paper cup with green circular mermaid logo") alongside the brand name, helping the generator render it accurately while leaving a clear signal for the editor to overlay a real asset if needed.
6. STRICT BAN ON HUMANS: Absolutely NO human characters, presenters, hosts, analysts, observers, or people of any kind should appear under any circumstances. Banish all human figures, faces, or hands from all prompts.
7. EXPLICIT TEXT LANGUAGE (NO IMPLICIT TEXT): Any text, titles, labels, or words that should appear written or rendered inside the image or video (such as card titles, labels on diagrams, list points, or slide headers) MUST be explicitly described in the prompt and MUST be written in the language of the script (Portuguese) inside double quotes. Do NOT leave text implicit (e.g. do NOT say "a card showing claims" as this results in English gibberish like "LADDED CLAIMS"; instead say "a card with text reading 'ALEGAÇÕES'"). Keep the prompt description in English, but define all on-screen written words in Portuguese using: text/label/title reading "...".`
        : videoFormat === 'faceless'
        ? 'FACELESS VIDEO MODE: Banish all modern studio presenters, vloggers, or home office hosts speaking to the camera. However, if the subtitle describes actions or figures of the historical narrative (e.g. Fulgrim, soldiers, knights), you MUST actively represent these characters in your visual prompts in brackets, e.g. [Character Name]!'
        : videoFormat === 'vlog'
        ? `VLOG VIDEO MODE: The video is a dynamic educational vlog (hand-held camera, selfie style). For video or image prompts involving the presenter, ALWAYS place the recurring character inside the setting. Write the visual prompt in English as a handheld selfie video: "First-person vlog selfie video of ${characterDescription}, looking at the camera, talking dynamically, realistic handheld camera movement (shaky cam, selfie angle), [insert historical/situational background and dynamic actions described in the subtitle], atmospheric lighting." Adjust facial expressions (e.g. amazed, concerned, smiling, intense) to match the emotion of the subtitle text.`
        : '';

      const facelessHint = rawFacelessHint
        .replaceAll('(Portuguese)', `(${langName})`)
        .replaceAll('in Portuguese', `in ${langName}`)
        .replaceAll('words in Portuguese', `words in ${langName}`)
        .replaceAll('reading \'ALEGAÇÕES\'', `reading text in ${langName} (e.g. 'CLAY POTS' if English or the equivalent in the script language)`);

      const payload = engine === 'gemini'
        ? await directGenerateBatchGemini({
            apiKey,
            model,
            batchItems: batch,
            characterDescription,
            textStyles,
            visualIdentity,
            videoContext: buildVideoContext(),
            facelessHint,
            videoFormat,
            visualBlueprint: { setting: visualBlueprintSetting, cast: videoFormat === 'catalog' ? [] : visualBlueprintCast },
            ultraCinematic,
            channelLanguage,
            dnaInstructions,
          })
        : await directGenerateBatchOpenAI({
            apiKey,
            model,
            batchItems: batch,
            characterDescription,
            textStyles,
            visualIdentity,
            videoContext: buildVideoContext(),
            facelessHint,
            videoFormat,
            visualBlueprint: { setting: visualBlueprintSetting, cast: videoFormat === 'catalog' ? [] : visualBlueprintCast },
            ultraCinematic,
            channelLanguage,
            dnaInstructions,
          });

      const localFallbackRowsObj = new Set<number>();
      const validatedBatch = validatePromptBatch(batch, payload, localFallbackRowsObj);
      const prompts = batch.map((item) => {
        let finalPrompt = validatedBatch.get(item.row_number)?.prompt || '';
        const isFacelessHf = item.asset === 'hyperframe' && (videoFormat === 'faceless' || videoFormat === 'catalog');
        if (!isFacelessHf) {
          finalPrompt = cleanHeyGenPrefixes(finalPrompt);
        }

        const isVisualAsset = item.asset === 'video' || item.asset === 'image';
        if (hasDna && isVisualAsset) {
          const val = validatedBatch.get(item.row_number);
          if (val) {
            let cena = val.prompt || '';
            const replacement = getProtagonistReplacement(videoCharacterMode, characterDescription);
            cena = cena.replace(/the protagonist/g, replacement);
            const capitalizedReplacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
            cena = cena.replace(/The protagonist/g, capitalizedReplacement);

            const protPresente = !!val.protagonista_presente;
            const extPresentes = !!val.extras_presentes;
            
            const sanitizedCharDna = sanitizeProperNames(dnaBlocks.characterDna);
            const sanitizedExtrasDna = sanitizeProperNames(dnaBlocks.extrasDna);
            const sanitizedStyleDna = sanitizeProperNames(dnaBlocks.styleDna);

            let assembledPrompt = cena;
            // Concat CHARACTER_DNA
            if (protPresente && sanitizedCharDna) {
              assembledPrompt = `${assembledPrompt.replace(/\.$/, '')}. ${sanitizedCharDna}`;
            }
            // Concat EXTRAS_DNA
            if (extPresentes && sanitizedExtrasDna) {
              assembledPrompt = `${assembledPrompt.replace(/\.$/, '')}. ${sanitizedExtrasDna}`;
            }
            // Concat STYLE_DNA
            if (sanitizedStyleDna) {
              assembledPrompt = `${assembledPrompt.replace(/\.$/, '')}. ${sanitizedStyleDna}`;
            }
            // Concat NEGATIVE_DNA
            if (dnaBlocks.negativeDna) {
              assembledPrompt = `${assembledPrompt.replace(/\.$/, '')}. ${dnaBlocks.negativeDna}`;
            }
            finalPrompt = assembledPrompt;
          }
        }

        return {
          rowNumber: item.row_number,
          prompt: item.asset === 'video'
            ? enforceVideoPromptGuards(finalPrompt)
            : finalPrompt,
          texto_adicional: validatedBatch.get(item.row_number)?.texto_adicional,
          isFallback: localFallbackRowsObj.has(item.row_number),
        };
      });

      return { prompts, hasFallbacks: localFallbackRowsObj.size > 0 };
    } else {
      const res = await fetch('/api/assets/srt-pipeline', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          batchItems: batch,
          engine,
          model,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject,
          videoContext: buildVideoContext(),
          videoFormat,
          textStyleOverride: textStyleMode === 'custom' ? customTextStyle : (textStyleMode === 'auto' ? '' : textStyleMode),
          characterProfile: {
            mode: videoCharacterMode,
            customDescription: videoCharacterCustom,
          },
          visualBlueprint: { setting: visualBlueprintSetting, cast: videoFormat === 'catalog' ? [] : visualBlueprintCast },
          ultraCinematic,
          assetAllocationMode: forceAllAsVideo ? 'force_all_video' : assetAllocationMode,
        }),
      });

      const responseText = await res.text();

      if (res.status === 429) {
        throw new Error('429');
      }

      if (!res.ok) {
        let errData: any = {};
        try { errData = JSON.parse(responseText); } catch { /* ignore */ }
        throw new Error(resolveErrorMessage(errData?.error, `Falha do servidor (Status ${res.status})`));
      }

      return JSON.parse(responseText);
    }
  };

  const processAttachedSrtAssets = async () => {
    if (!externalSrtText.trim()) {
      alert('Anexe um arquivo .srt antes de processar os assets.');
      return;
    }

    if (videoFormat !== 'faceless' && videoCharacterMode === 'custom' && !videoCharacterCustom.trim()) {
      alert('Descreva o personagem personalizado antes de processar os prompts de video.');
      return;
    }

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    setHfBgPrompts(null);           // limpa fundos HF do tema anterior (bug fix contaminação)
    _pipelineResultRef.current = null;
    setIsProcessingSrtPipeline(true);
    setSrtPipelineStatus('Lendo o .srt anexado e preparando a timeline base...');
    updateSrtObserverStep('upload', 'done', externalSrtFileName ? `Arquivo ${externalSrtFileName} pronto para processamento.` : 'Arquivo .srt anexado e pronto para processamento.');
    updateSrtObserverStep('csv', 'running', 'Convertendo o .srt em linhas estruturadas da timeline CSV...');
    updateSrtObserverStep('assets', 'pending', 'Aguardando a classificacao heuristica dos assets.');
    updateSrtObserverStep('prompts', 'pending', 'Aguardando a geracao dos prompts visuais.');
    updateSrtObserverStep('render', 'pending', 'Aguardando a etapa 5 para renderizar os assets de texto.');
    updateSrtObserverStep('persist', 'pending', 'Aguardando persistencia local do resultado.');

    try {
      const parsedRows = parseSrtToRows(externalSrtText, forceAllAsVideo);
      if (!parsedRows.length) {
        throw new Error('Nao foi possivel extrair blocos validos do .srt enviado.');
      }

      updateSrtObserverStep('csv', 'done', `${parsedRows.length} linha(s) derivadas do .srt e prontas para o CSV base.`);
      setSrtPipelineStatus('CSV base derivado. Aplicando a heuristica de marcacao de assets...');

      updateSrtObserverStep('assets', 'running', 'Marcando as linhas como texto, avatar, video, imagem ou hyperframe...');
      const enabledAssetsObj = {
        video: pipelineVideos,
        image: pipelineImages,
        text: pipelineTexts,
        hyperframe: pipelineHyperframes,
      };

      const effectiveAllocationMode: AssetAllocationMode = forceAllAsVideo ? 'force_all_video' : assetAllocationMode;
      const assetRows      = applyAssetRules(parsedRows, videoFormat, externalSrtText, enabledAssetsObj, effectiveAllocationMode);
      const cooledRows     = enforceTextoCooldown(assetRows);             // cooldown 20s entre textos
      const hfRows         = applyHyperframeRules(cooledRows, videoFormat, enabledAssetsObj); // injeta até 6 hyperframes narrativos (adaptado ao formato)
      const excludedRows   = applyHyperframeExclusionZone(hfRows);        // remove textos dentro de 30s de um HF
      const finalRows      = finalizeFacelessRows(excludedRows, videoFormat, enabledAssetsObj, effectiveAllocationMode);
      const assetStats     = buildAssetStats(finalRows);
      const assetDesc      = videoFormat === 'faceless'
        ? `${assetStats.texto} texto, ${assetStats.video} video e ${assetStats.image} imagem (modo Faceless).`
        : videoFormat === 'vlog'
        ? `${assetStats.texto} texto, ${assetStats.avatar} avatar (VLOG), ${assetStats.video} video, ${assetStats.image} imagem e ${assetStats.hyperframe} hyperframe.`
        : `${assetStats.texto} texto, ${assetStats.avatar} avatar, ${assetStats.video} video, ${assetStats.image} imagem e ${assetStats.hyperframe} hyperframe.`;
      updateSrtObserverStep('assets', 'done', assetDesc);
      setSrtPipelineStatus('Assets marcados. Enviando as linhas elegiveis para gerar prompts visuais...');

      updateSrtObserverStep('prompts', 'running', 'Aguardando o envio do primeiro lote...');

      const promptItems = finalRows.flatMap((row, index) => {
        const type = normalizeAssetType(row.asset);
        const isEligible = forceAllAsVideo
          ? (type === 'vídeo' || type === 'imagem' || type === 'hyperframe' || type === 'texto')
          : (type === 'vídeo' || type === 'imagem' || type === 'hyperframe' || (type === 'texto' && textStyleMode === 'auto'));
        if (!isEligible) return [];

        const previousText = assetRows[index - 1]?.texto?.trim() || '';
        const nextText = assetRows[index + 1]?.texto?.trim() || '';
        const startMs = parseSrtTimeToMs(row.startTime);
        const endMs = parseSrtTimeToMs(row.endTime);
        const durationSeconds = Number(((endMs - startMs) / 1000).toFixed(3));
  
        return [{
          row_number: row.rowNumber,
          asset: forceAllAsVideo ? 'video' : (type === 'texto' ? 'text' : (type === 'hyperframe' ? 'hyperframe' : (type === 'vídeo' ? 'video' : 'image'))),
          template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
          text: row.texto.trim(),
          start_time: row.startTime,
          end_time: row.endTime,
          duration_seconds: durationSeconds,
          previous_text: previousText,
          next_text: nextText,
        }];
      });

      const promptMap = new Map<number, string>();
      const textoAdicionalMap = new Map<number, string>();
      const fallbackRowNumbers = new Set<number>(); // 🏷️ Track rows that used a fallback
      const isDirect = !!apiKey;
      const chunkSize = isDirect ? 10 : 8; // Lotes maiores no browser direto
      const chunks: any[][] = [];
      for (let i = 0; i < promptItems.length; i += chunkSize) {
        chunks.push(promptItems.slice(i, i + chunkSize));
      }

      let completedCount = 0;
      let currentConcurrency = isDirect ? 4 : 2; // Maior concorrência se for direto no browser
      let activeWorkers = 0;
      const results: any[] = new Array(chunks.length);
      let nextChunkIdx = 0;

      updateSrtObserverStep(
        'prompts',
        'running',
        `Gerando prompts visuais: processando ${chunks.length} lotes com concorrência auto-ajustável...`
      );

      const processNext = async (): Promise<void> => {
        // Se a concorrência diminuiu e este worker exceder o limite ativo, finaliza-se.
        if (activeWorkers > currentConcurrency) {
          activeWorkers--;
          return;
        }

        if (nextChunkIdx >= chunks.length) {
          activeWorkers--;
          return;
        }

        const currentIdx = nextChunkIdx++;
        const batch = chunks[currentIdx];

        let success = false;
        let data: any = {};
        const maxRetries = 2;

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
          try {
            data = await generatePromptBatchDirectOrAPI(batch, isDirect, apiKey, engine as 'openai' | 'gemini', model);
            success = true;
            break;
          } catch (err: any) {
            console.warn(`[Lote ${currentIdx + 1}] Tentativa ${attempt + 1} falhou:`, err.message || err);
            
            if (err.message === '429') {
              if (currentConcurrency > 1) {
                currentConcurrency = 1;
                updateSrtObserverStep(
                  'prompts',
                  'running',
                  `[Limite de IA] Rate limit detectado. Reduzindo velocidade para modo sequencial seguro...`
                );
              }
              console.warn(`Lote ${currentIdx + 1} recebeu 429 (Rate Limit). Reduzindo concorrência para 1 e aguardando respiro...`);
              await new Promise((resolve) => setTimeout(resolve, 3000));
              continue;
            }

            // Em caso de falha de rede ou timeout, também reduz a velocidade de forma preventiva
            if (currentConcurrency > 1) {
              currentConcurrency = 1;
              updateSrtObserverStep(
                'prompts',
                'running',
                `[Aviso] Falha de conexão. Ajustando automaticamente para concorrência segura...`
              );
            }

            if (attempt === maxRetries) {
              console.error(`[Lote ${currentIdx + 1}] Falha persistente após ${maxRetries + 1} tentativas. Aplicando fallback local.`);
              
              const localFallbackRowsObj = new Set<number>();
              const fallbackMap = validatePromptBatch(batch, { prompts: [] }, localFallbackRowsObj);
              const fallbackPrompts: any[] = [];
              fallbackMap.forEach((v, k) => {
                fallbackPrompts.push({
                  rowNumber: k,
                  prompt: v.prompt,
                  texto_adicional: v.texto_adicional,
                  isFallback: true
                });
              });

              data = { prompts: fallbackPrompts };
              success = true;
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
          }
        }

        results[currentIdx] = data;
        completedCount++;

        const statusMsg = currentConcurrency === 1
          ? `Gerando prompts: processados ${completedCount} de ${chunks.length} lotes (modo seguro)...`
          : `Gerando prompts: processados ${completedCount} de ${chunks.length} lotes...`;

        updateSrtObserverStep('prompts', 'running', statusMsg);

        await processNext();
      };

      const workers = [];
      const numWorkers = Math.min(currentConcurrency, chunks.length);
      activeWorkers = numWorkers;

      for (let i = 0; i < numWorkers; i++) {
        workers.push(processNext());
      }
      await Promise.all(workers);

      // Processa e insere todos os resultados nos mapas ordenadamente
      results.forEach((data) => {
        (data?.prompts || []).forEach((p: { rowNumber: number; prompt: string; isFallback?: boolean; texto_adicional?: string }) => {
          if (p.rowNumber && p.prompt) {
            promptMap.set(p.rowNumber, p.prompt);
            if (p.texto_adicional) {
              textoAdicionalMap.set(p.rowNumber, typeof p.texto_adicional === 'string' ? p.texto_adicional : JSON.stringify(p.texto_adicional));
            }
            if (p.isFallback) fallbackRowNumbers.add(p.rowNumber);
          }
        });
      });

      const rowsWithPrompts = finalRows.map((row) => {
        let finalPrompt = promptMap.get(row.rowNumber) || row.prompt;
        const originalType = normalizeAssetType(row.asset);
        const shouldForce = forceAllAsVideo && (originalType === 'texto' || originalType === 'imagem' || originalType === 'hyperframe');
        const finalAsset = shouldForce ? ('vídeo' as const) : row.asset;

        if (originalType === 'texto' && textStyleMode !== 'auto' && !forceAllAsVideo) {
          finalPrompt = textStyleMode === 'custom' ? customTextStyle : textStyleMode;
        }
        return {
          ...row,
          asset: finalAsset,
          prompt: finalPrompt,
          texto_adicional: shouldForce ? '' : (textoAdicionalMap.get(row.rowNumber) || row.texto_adicional),
          isFallback: fallbackRowNumbers.has(row.rowNumber), // 🏷️ Used for regeneration UI
        };
      });

      const generatedData = buildPipelineResult(rowsWithPrompts, null, videoFormat);

      updateSrtObserverStep(
        'prompts',
        'done',
        `${generatedData.stats?.video || 0} prompt(s) de video e ${generatedData.stats?.image || 0} prompt(s) de imagem preparados.`
      );
      updateSrtObserverStep('persist', 'running', 'Salvando CSV, prompts e preview dentro do snapshot desta execucao...');
      const persistedAt = new Date().toISOString();
      const pipelineResult = {
        ...generatedData,
        generatedAt: persistedAt,
      };
      setExternalSrtPipeline(pipelineResult);
      _pipelineResultRef.current = pipelineResult; // captura para uso no pipeline orquestrado
      setSrtPipelineStatus('Pipeline concluido. CSV base, marcacao de assets e prompts visuais atualizados.');
      const finalizedObserver: SrtPipelineObserverStep[] = [
        {
          key: 'upload',
          label: 'SRT anexado',
          status: 'done',
          detail: externalSrtFileName ? `Arquivo ${externalSrtFileName} pronto para processamento.` : 'Arquivo .srt anexado e pronto para processamento.',
        },
        {
          key: 'csv',
          label: 'CSV base',
          status: 'done',
          detail: `${parsedRows.length} linha(s) derivadas do .srt e prontas para o CSV base.`,
        },
        {
          key: 'assets',
          label: 'Marcacao de assets',
          status: 'done',
          detail: `${assetStats.texto} texto, ${assetStats.avatar} avatar, ${assetStats.video} video e ${assetStats.image} imagem.`,
        },
        {
          key: 'prompts',
          label: 'Prompts visuais',
          status: 'done',
          detail: `${generatedData?.stats?.video || 0} prompt(s) de video e ${generatedData?.stats?.image || 0} prompt(s) de imagem preparados.`,
        },
        {
          key: 'render',
          label: 'Render de texto',
          status: 'pending',
          detail: 'Etapa 5 aguardando disparo. Os assets marcados como texto ainda nao foram renderizados em video.',
        },
        {
          key: 'persist',
          label: 'Persistencia',
          status: 'done',
          detail: `Resultado salvo localmente em ${new Date(persistedAt).toLocaleString('pt-BR')}. Use Exportar para baixar arquivos no computador.`,
        },
      ];
      setExternalSrtObserver(finalizedObserver);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
      await syncApprovedThemeSnapshot({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao processar pipeline do SRT.', error);
      updateSrtObserverStep('prompts', 'error', 'A geracao dos prompts falhou ou foi interrompida.');
      updateSrtObserverStep('persist', 'error', 'A execucao falhou antes de salvar o pipeline completo.');
      setSrtPipelineStatus('');
      if (_isPipelineMode.current) throw error;
      alert(error instanceof Error ? error.message : 'Nao foi possivel processar o SRT anexado.');
    } finally {
      setIsProcessingSrtPipeline(false);
    }
  };

  const regenerateFallbackPrompts = async () => {
    if (!externalSrtPipeline?.rows?.length) return;

    const fallbackRows = externalSrtPipeline.rows.filter((row) => row.isFallback);
    if (fallbackRows.length === 0) return;

    setIsRegeneratingFallbacks(true);
    try {
      const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
      const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
      const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

      const batchItems = fallbackRows.flatMap((row, index) => {
        const type = normalizeAssetType(row.asset);
        const isEligible = type === 'vídeo' || type === 'imagem' || type === 'texto' || type === 'hyperframe';
        if (!isEligible) return [];
        const allRows = externalSrtPipeline.rows;
        const idx = allRows.findIndex((r) => r.rowNumber === row.rowNumber);
        const previousText = allRows[idx - 1]?.texto?.trim() || '';
        const nextText = allRows[idx + 1]?.texto?.trim() || '';
        const startMs = parseSrtTimeToMs(row.startTime);
        const endMs = parseSrtTimeToMs(row.endTime);
        return [{
          row_number: row.rowNumber,
          asset: forceAllAsVideo ? ('video' as const) : (type === 'texto' ? ('text' as const) : (type === 'hyperframe' ? ('hyperframe' as const) : (type === 'vídeo' ? ('video' as const) : ('image' as const)))),
          template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
          text: row.texto.trim(),
          start_time: row.startTime,
          end_time: row.endTime,
          duration_seconds: Number(((endMs - startMs) / 1000).toFixed(3)),
          previous_text: previousText,
          next_text: nextText,
        }];
      });

      if (batchItems.length === 0) return;

      const isDirect = !!apiKey;
      let data: any = {};
      const maxRetries = 2;

      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          data = await generatePromptBatchDirectOrAPI(batchItems, isDirect, apiKey, engine as 'openai' | 'gemini', model);
          break;
        } catch (err: any) {
          if (attempt === maxRetries) {
            throw new Error(err.message || 'Falha persistente na regeneração de prompts.');
          }
          await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
        }
      }

      // Merge: replace fallback rows with the new prompts.
      const newPromptMap = new Map<number, string>();
      (data?.prompts || []).forEach((p: { rowNumber: number; prompt: string; isFallback?: boolean }) => {
        if (p.rowNumber && p.prompt?.trim()) newPromptMap.set(p.rowNumber, p.prompt.trim());
      });

      if (newPromptMap.size === 0) {
        alert('A IA não retornou nenhum prompt para os itens selecionados. Tente novamente.');
        return;
      }

      const updatedRows = externalSrtPipeline.rows.map((row) => {
        const newPrompt = newPromptMap.get(row.rowNumber);
        if (!newPrompt) return row;
        return { ...row, prompt: newPrompt, isFallback: false };
      });

      const { buildPipelineResult: rebuild } = await import('@/lib/srt-asset-pipeline');
      const updatedPipeline = { ...rebuild(updatedRows, null, videoFormat), generatedAt: externalSrtPipeline.generatedAt };
      _pipelineResultRef.current = updatedPipeline;
      setExternalSrtPipeline(updatedPipeline);
      persistExecutionSnapshotLocally({ externalSrtPipeline: updatedPipeline });
      showToast(`✅ ${newPromptMap.size} prompt(s) regenerado(s) com sucesso.`);
    } catch (err) {
      console.error('[ScriptEngine] Falha ao regenerar fallbacks:', err);
      alert(err instanceof Error ? err.message : 'Erro ao regenerar prompts incompletos.');
    } finally {
      setIsRegeneratingFallbacks(false);
    }
  };

  // ─── Regeneração de Fallbacks para Pipeline (usa ref, não estado) ─────────────
  const regenerateFallbacksForPipeline = async (): Promise<number> => {
    const pipeline = _pipelineResultRef.current;
    if (!pipeline?.rows?.length) return 0;
    const fallbackRows = pipeline.rows.filter((r: any) => r.isFallback);
    if (!fallbackRows.length) return 0;

    const engine  = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model   = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey  = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    const batchItems = fallbackRows.flatMap((row: any) => {
      const type = normalizeAssetType(row.asset);
      if (type !== 'vídeo' && type !== 'imagem' && type !== 'texto' && type !== 'hyperframe') return [];
      const allRows = pipeline.rows;
      const idx = allRows.findIndex((r: any) => r.rowNumber === row.rowNumber);
      const startMs = parseSrtTimeToMs(row.startTime);
      const endMs   = parseSrtTimeToMs(row.endTime);
      return [{
        row_number: row.rowNumber,
        asset: forceAllAsVideo ? ('video' as const) : (type === 'texto' ? ('text' as const) : (type === 'hyperframe' ? ('hyperframe' as const) : (type === 'vídeo' ? ('video' as const) : ('image' as const)))),
        template_name: type === 'hyperframe' ? String(row.prompt || '').replace('hf:', '') : undefined,
        text: row.texto.trim(),
        start_time: row.startTime,
        end_time: row.endTime,
        duration_seconds: Number(((endMs - startMs) / 1000).toFixed(3)),
        previous_text: allRows[idx - 1]?.texto?.trim() || '',
        next_text: allRows[idx + 1]?.texto?.trim() || '',
      }];
    });
    if (!batchItems.length) return 0;

    const isDirect = !!apiKey;
    const data = await generatePromptBatchDirectOrAPI(batchItems, isDirect, apiKey, engine as 'openai' | 'gemini', model);

    const newPromptMap = new Map<number, string>();
    (data?.prompts || []).forEach((p: any) => {
      if (p.rowNumber && p.prompt?.trim()) newPromptMap.set(p.rowNumber, p.prompt.trim());
    });

    // Merge resultado no ref (não depende de setState)
    const updatedRows = pipeline.rows.map((row: any) => {
      const np = newPromptMap.get(row.rowNumber);
      return np ? { ...row, prompt: np, isFallback: false } : row;
    });
    const { buildPipelineResult: rebuild } = await import('@/lib/srt-asset-pipeline');
    const updated = { ...rebuild(updatedRows, null, videoFormat), generatedAt: pipeline.generatedAt };
    _pipelineResultRef.current = updated;
    setExternalSrtPipeline(updated);
    persistExecutionSnapshotLocally({ externalSrtPipeline: updated });

    // Retorna quantos ainda estão incompletos
    return updatedRows.filter((r: any) => r.isFallback).length;
  };

  const renderTextAssetsFromPipeline = async () => {
    // Em modo pipeline, usa _pipelineResultRef para evitar stale closure do estado React
    const activePipeline = (_isPipelineMode.current && _pipelineResultRef.current)
      ? _pipelineResultRef.current
      : externalSrtPipeline;
    // Mesmo padrão para postScriptPackage (stale closure)
    const activePackage = (_isPipelineMode.current && _postScriptResultRef.current)
      ? _postScriptResultRef.current
      : postScriptPackage;

    if (!activePipeline?.rows?.length) {
      if (_isPipelineMode.current) throw new Error('Pipeline: SRT não processado corretamente. Verifique a Etapa 1.');
      alert('Processe o SRT nas etapas 2, 3 e 4 antes de disparar a etapa 5.');
      return;
    }

    const isLocalhost = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (!isLocalhost) {
      const pythonDir = "D:\\onedrive\\Downloads\\Produção em Massa\\1-ContentFlow\\assets\\ferramenta-legendas";
      const csvName = `${sanitizeDownloadFileStem(srtArtifactStem)}_pipeline_assets.csv`;
      const batLines = [
        '@echo off',
        'chcp 65001 >nul',
        'color 0A',
        '',
        ':: 1. Detectando o Python dinamicamente',
        'python --version >nul 2>&1',
        'if %errorlevel% neq 0 (',
        '    color 0C',
        '    echo ERRO CRITICO: Python nao encontrado no sistema!',
        '    echo Certifique-se de que o instalou e adicionou nas Variaveis de Ambiente PATH.',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        ':: 2. Validando a presenca do arquivo CSV Base',
        `set "CSV_PATH=%~dp0${csvName}"`,
        'if not exist "%CSV_PATH%" (',
        '    color 0C',
        '    echo ERRO CRITICO: Arquivo CSV base nao encontrado!',
        '    echo O script estava procurando por:',
        '    echo "%CSV_PATH%"',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        ':: 3. Mudando de diretorio e apontando pro pipeline local',
        `set "PYTHON_DIR=${pythonDir}"`,
        'if not exist "%PYTHON_DIR%\\renderizar_textos.py" (',
        '    color 0C',
        '    echo ERRO CRITICO: Conector principal renderizar_textos.py nao mapeado!',
        '    echo Local esperado: "%PYTHON_DIR%"',
        '    pause',
        '    exit /b 1',
        ')',
        '',
        'cd /d "%PYTHON_DIR%"',
        'echo --- PROCESSO DE RENDERIZACAO DE TEXTOS ---',
        'echo CSV Alvo: %CSV_PATH%',
        'echo.',
        'python renderizar_textos.py --file "%CSV_PATH%"',
        '',
        ':: 4. Evitando fechamentos impetuosos por erro',
        'if %errorlevel% neq 0 (',
        '    color 0C',
        '    echo.',
        '    echo ALERTA: A renderizacao retornou falhas.',
        '    echo Avalie o log do terminal acima para correcoes.',
        '    pause',
        '    exit /b %errorlevel%',
        ')',
        '',
        'color 0A',
        'echo.',
        'echo --- TUDO PRONTO! Renderizacao em lote completa.',
        'pause',
      ];
      const batContent = batLines.join('\r\n');
      
      downloadTextArtifact(srtArtifactStem, 'pipeline_assets', buildSfxEnrichedCsvContent(activePipeline.csvContent, activePackage?.sfxTimelineTxt), { extension: 'csv', mimeType: 'text/csv;charset=utf-8' });
      
      setTimeout(() => {
      downloadTextArtifact(srtArtifactStem, '1_renderizar_textos', batContent, { extension: 'bat', mimeType: 'text/plain;charset=utf-8' });
      }, 500);

      // Bat 2 — HyperFrames overlays (only if hyperframe rows exist)
      const hfRows = activePipeline.rows.filter(
        (r: any) => normalizeAssetType(r.asset) === 'hyperframe',
      );
      if (hfRows.length > 0 && videoFormat !== 'faceless') {
        const batHyperframes = buildHyperframesBat(hfRows, srtArtifactStem, undefined, activePackage?.hfContextTitles, videoFormat);
        setTimeout(() => {
          downloadTextArtifact(
            srtArtifactStem,
            '2_hyperframes',
            batHyperframes,
            { extension: 'bat', mimeType: 'text/plain;charset=utf-8' },
          );
        }, 1000);
      }

      const sfxTimeline = activePackage?.sfxTimelineTxt || '';
      const batSfx = buildSfxBatFromTimeline(sfxTimeline, srtArtifactStem, activePipeline.rows);
      if (batSfx) {
        setTimeout(() => {
          downloadTextArtifact(
            srtArtifactStem,
            '3_sfx',
            batSfx,
            { extension: 'bat', mimeType: 'text/plain;charset=utf-8' },
          );
        }, 1500);
      }

      const persistedAt = new Date().toISOString();
      const pipelineResult = {
        ...activePipeline,
        generatedAt: persistedAt,
        textRender: activePipeline.textRender || {
          csvPath: `${sanitizeDownloadFileStem(srtArtifactStem)}_pipeline_assets.csv`,
          outputDir: `remotion-renderer/renders/${sanitizeDownloadFileStem(srtArtifactStem)}`,
          renderedCount: activePipeline.rows.filter((r: any) => normalizeAssetType(r.asset) === 'texto').length,
          reusedCount: 0,
          log: 'Download do script .bat e do CSV realizado para execução offline.',
          lastRenderedAt: persistedAt
        }
      };
      setExternalSrtPipeline(pipelineResult);
      setSrtPipelineStatus('Etapa 5 (Nuvem) concluída. Os arquivos .bat e .csv foram baixados para execução manual.');
      
      const finalizedObserver = externalSrtObserver.map((step) => {
        if (step.key === 'render') {
          return { ...step, status: 'done' as const, detail: 'Download do script .bat e do CSV realizado para execução offline.' };
        }
        if (step.key === 'persist') {
          return { ...step, status: 'done' as const, detail: `Exportação gerada em ${new Date(persistedAt).toLocaleString('pt-BR')}.` };
        }
        return step.status === 'pending' ? { ...step, status: 'done' as const, detail: step.detail } : step;
      });

      setExternalSrtObserver(finalizedObserver);
      
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
      return;
    }

    setIsRenderingTextAssets(true);
    setSrtPipelineStatus('Preparando o CSV persistido e disparando a etapa 5 para os assets de texto...');
    updateSrtObserverStep('render', 'running', 'Sincronizando o CSV no pipeline externo e renderizando os assets marcados como texto...');
    updateSrtObserverStep('persist', 'pending', 'Aguardando persistencia do resultado da etapa 5.');

    try {
      const res = await fetch('/api/assets/srt-render-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipeline: activePipeline,
          themeTitle: approvedTheme,
          srtFileName: externalSrtFileName,
          artifactStem: srtArtifactStem,
        }),
      });

      const responseText = await res.text();
      let data: any = {};
      try {
        data = JSON.parse(responseText);
      } catch (parseError) {
        if (res.status === 504) {
          throw new Error('Timeout (Erro 504): O servidor levou muito tempo para renderizar os assets de texto. Reduza o volume ou rode localmente.');
        }
        throw new Error(`Erro inesperado (${res.status}): A Vercel não retornou um JSON válido. Resposta: ${responseText.slice(0, 80)}...`);
      }

      if (!res.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao executar a etapa 5 do pipeline SRT.'));
      }

      const persistedAt = new Date().toISOString();
      const pipelineResult = {
        ...data,
        generatedAt: persistedAt,
      };
      setExternalSrtPipeline(pipelineResult);
      setSrtPipelineStatus('Etapa 5 concluida. Os assets marcados como texto foram renderizados e os caminhos ficaram persistidos.');

      const renderInfo = pipelineResult?.textRender;
      const finalizedObserver = externalSrtObserver.map((step) => {
        if (step.key === 'render') {
          return {
            ...step,
            status: 'done' as const,
            detail: renderInfo
              ? `${renderInfo.renderedCount} render(s) novo(s), ${renderInfo.reusedCount} reutilizado(s). Saida em ${renderInfo.outputDir}.`
              : 'Etapa 5 concluida e caminhos dos assets de texto atualizados.',
          };
        }

        if (step.key === 'persist') {
          return {
            ...step,
            status: 'done' as const,
            detail: `Resultado da etapa 5 salvo em ${new Date(persistedAt).toLocaleString('pt-BR')} e no snapshot do tema aprovado.`,
          };
        }

        return step.status === 'pending'
          ? { ...step, status: 'done' as const, detail: step.detail }
          : step;
      });

      setExternalSrtObserver(finalizedObserver);
      persistExecutionSnapshotLocally({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
      await syncApprovedThemeSnapshot({
        executionMode: 'external',
        externalScriptText,
        externalScriptFileName,
        externalSrtText,
        externalSrtFileName,
        externalSrtPipeline: pipelineResult,
        externalSrtObserver: finalizedObserver,
      });
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao executar a etapa 5 do SRT.', error);
      updateSrtObserverStep('render', 'error', 'A etapa 5 falhou antes de devolver os caminhos dos assets de texto.');
      updateSrtObserverStep('persist', 'error', 'A execucao falhou antes de persistir o resultado da etapa 5.');
      setSrtPipelineStatus('');
      if (_isPipelineMode.current) throw error;
      alert(error instanceof Error ? error.message : 'Nao foi possivel renderizar os assets de texto.');
    } finally {
      setIsRenderingTextAssets(false);
    }
  };

  const restoreExecutionState = () => {
    if (!executionStorageKey) return;

    try {
      const raw = localStorage.getItem(executionStorageKey);
      if (!raw) {
        alert('Nenhuma execucao salva para esta instancia.');
        return;
      }

      const snapshot = JSON.parse(raw);
      setApprovedTheme(snapshot?.approvedTheme || '');
      setApprovedBriefing(snapshot?.approvedBriefing || null);
      const normalizedSnapshotBlocks = resolveSnapshotBlocks(snapshot);
      setScriptBlocks(normalizedSnapshotBlocks);
      setScriptStage(inferScriptStageFromSnapshot(snapshot));
      setAssemblerActive(typeof snapshot?.assemblerActive === 'boolean' ? snapshot.assemblerActive : false);
      setThumbnailDirective(snapshot?.thumbnailDirective || null);
      setShowThumbnailPanel(!!snapshot?.showThumbnailPanel);
      setThumbnailUrl(snapshot?.thumbnailUrl || '');
      setExecutionMode(snapshot?.executionMode === 'external' ? 'external' : 'internal');
      setExternalScriptText(snapshot?.externalScriptText || '');
      setExternalScriptFileName(snapshot?.externalScriptFileName || '');
      setExternalSourceLabel(snapshot?.externalSourceLabel || '');
      setExternalSrtText(snapshot?.externalSrtText || '');
      setExternalSrtFileName(snapshot?.externalSrtFileName || '');
      setExternalSrtPipeline(snapshot?.externalSrtPipeline || null);
      setExternalSrtObserver(Array.isArray(snapshot?.externalSrtObserver) && snapshot.externalSrtObserver.length > 0 ? snapshot.externalSrtObserver : buildInitialSrtObserver());
      setPostScriptPackage(snapshot?.postScriptPackage || null);
      setVisualBlueprintSetting(snapshot?.visualBlueprintSetting || '');
      setVisualBlueprintCast(Array.isArray(snapshot?.visualBlueprintCast) ? snapshot.visualBlueprintCast : []);
      setPipelineVideos(typeof snapshot?.pipelineVideos === 'boolean' ? snapshot.pipelineVideos : true);
      setPipelineImages(typeof snapshot?.pipelineImages === 'boolean' ? snapshot.pipelineImages : true);
      setPipelineTexts(typeof snapshot?.pipelineTexts === 'boolean' ? snapshot.pipelineTexts : true);
      setPipelineHyperframes(typeof snapshot?.pipelineHyperframes === 'boolean' ? snapshot.pipelineHyperframes : true);
    } catch (error) {
      console.warn('[ScriptEngine] Falha ao restaurar execucao manualmente.', error);
      alert('Nao foi possivel restaurar a execucao salva.');
    }
  };

  function clearExecutionState() {
    if (executionStorageKey) {
      localStorage.removeItem(executionStorageKey);
      // Also clear the split-storage keys for large objects
      localStorage.removeItem(`${executionStorageKey}_srt_pipeline`);
      localStorage.removeItem(`${executionStorageKey}_post_package`);
    }
    if (typeof window !== 'undefined' && activeProject?.id) {
      sessionStorage.removeItem(`active_script_theme_${activeProject.id}`);
    }

    setApprovedTheme('');
    setApprovedBriefing(null);
    setScriptStage('blueprint');
    setThumbnailDirective(null);
    setShowThumbnailPanel(false);
    setThumbnailUrl('');
    setExecutionMode(defaultExecutionMode);
    setExternalScriptText('');
    setExternalScriptFileName('');
    setExternalSourceLabel('');
    setExternalSrtText('');
    setExternalSrtFileName('');
    setExternalSrtPipeline(null);
    setExternalSrtObserver(buildInitialSrtObserver());
    setPostScriptPackage(null);
    setManualPublishDate('');
    setVisualBlueprintSetting('');
    setVisualBlueprintCast([]);
    setPipelineVideos(true);
    setPipelineImages(true);
    setPipelineTexts(true);
    setPipelineHyperframes(true);
    setExternalFactCheckReport(null);
    setExternalHumanizeReport(null);
    setPendingHumanizedText(null);
    setManualPublishDraftDate('');
    setManualPublishDraftTime('');
    setScriptBlocks([
      { id: 'h0', type: 'Hook', title: 'Gancho Estrategico', content: 'Inicie com uma promessa tecnica...', sop: 'Corte seco.' },
      { id: 'c0', type: 'Context', title: 'Contextualizacao', content: 'Conecte com a dor do publico...', sop: 'B-roll de contexto.' }
    ]);
    setAssemblerActive(true);
  }

  const returnToAssembler = () => {
    setAssemblerActive(true);
  };

  const stopScriptGeneration = () => {
    generationStoppedRef.current = true;
    generationAbortRef.current?.abort();
    setGenerationProgress((current) =>
      current
        ? {
            ...current,
            status: 'Interrompendo a geracao e preservando os blocos concluidos...',
          }
        : null
    );
  };

  const downloadScriptAsTxt = () => {
    if (!scriptBlocks.length) {
      alert('Ainda nao ha blocos suficientes para exportar.');
      return;
    }

    const themeTitle = approvedBriefing?.title || approvedTheme || 'roteiro-content-os';
    const safeFileName = themeTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s/g, '_')
      .slice(0, 80) || 'roteiro-content-os';

    const txtContent = scriptBlocks
      .map((block, index) => `BLOCO ${index + 1} - ${block.title}\n\n${block.content.trim()}`)
      .join('\n\n');

    const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeFileName}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const downloadAvatarFlowPackage = () => {
    if (!scriptBlocks.length) {
      alert('Ainda não há blocos para exportar.');
      return;
    }

    const themeTitle = approvedBriefing?.title || approvedTheme || 'roteiro-avatar-flow';
    const safeFileName = themeTitle
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\s/g, '_')
      .slice(0, 80) || 'roteiro-avatar-flow';

    const falasLines = scriptBlocks
      .map((block) => block.content.trim())
      .filter(Boolean);

    if (falasLines.length === 0) {
      alert('Os blocos de roteiro estão vazios.');
      return;
    }

    const falasContent = falasLines.join('\n');
    const videoLines: string[] = [];
    const AVATAR_FLOW_ANGLES = [
      '3/4 view lado esquerdo',
      '3/4 view lado direito',
      'perfil lado esquerdo',
      'perfil lado direito',
      'over the shoulder',
      'over view (de cima)',
      'low angle',
      'high angle',
      'close-up frontal'
    ];
    let lastAngleUsed = '';

    falasLines.forEach((text, index) => {
      const rowNum = index + 1;
      const isOdd = rowNum % 2 !== 0;

      if (isOdd) {
        const line = `Cena${String(rowNum).padStart(3, '0')} 4k. Camera fixa, Personagem001 falando: "${text}"`;
        videoLines.push(line);
      } else {
        const availableAngles = AVATAR_FLOW_ANGLES.filter((angle) => angle !== lastAngleUsed);
        const chosenAngle = availableAngles[rowNum % availableAngles.length];
        lastAngleUsed = chosenAngle;

        const line = `Cena${String(rowNum).padStart(3, '0')} 4k. Camera fixa, Personagem001 ${chosenAngle} falando: "${text}"`;
        videoLines.push(line);
      }
    });

    const videoPromptsContent = videoLines.join('\n');

    const blobVideo = new Blob([videoPromptsContent], { type: 'text/plain;charset=utf-8' });
    const urlVideo = URL.createObjectURL(blobVideo);
    const linkVideo = document.createElement('a');
    linkVideo.href = urlVideo;
    linkVideo.download = `${safeFileName}_prompts_video.txt`;
    document.body.appendChild(linkVideo);
    linkVideo.click();
    document.body.removeChild(linkVideo);
    URL.revokeObjectURL(urlVideo);

    setTimeout(() => {
      const blobFalas = new Blob([falasContent], { type: 'text/plain;charset=utf-8' });
      const urlFalas = URL.createObjectURL(blobFalas);
      const linkFalas = document.createElement('a');
      linkFalas.href = urlFalas;
      linkFalas.download = `${safeFileName}_falas.txt`;
      document.body.appendChild(linkFalas);
      linkFalas.click();
      document.body.removeChild(linkFalas);
      URL.revokeObjectURL(urlFalas);
    }, 150);
  };

  const generateSceneSvgPreview = (row: any, format: string): string => {
    const promptLower = (row.prompt || '').toLowerCase();
    const isProduct = promptLower.includes('product placeholder') || (row.prompt && row.prompt.trim().startsWith('['));
    const isChart = promptLower.includes('chart') || promptLower.includes('graph') || promptLower.includes('analytics') || promptLower.includes('growth') || promptLower.includes('percentage') || promptLower.includes('kpi') || promptLower.includes('dashboard') || promptLower.includes('grafico');
    const isCode = promptLower.includes('code') || promptLower.includes('terminal') || promptLower.includes('console') || promptLower.includes('programming') || promptLower.includes('developer') || promptLower.includes('lines of code') || promptLower.includes('script') || promptLower.includes('editor');
    const isTimeline = promptLower.includes('timeline') || promptLower.includes('history') || promptLower.includes('evolution') || promptLower.includes('chronology') || promptLower.includes('sequencia');
    const isDoc = promptLower.includes('document') || promptLower.includes('paper') || promptLower.includes('pdf') || promptLower.includes('research') || promptLower.includes('sheet') || promptLower.includes('article') || promptLower.includes('contract');
    const isNetwork = promptLower.includes('network') || promptLower.includes('nodes') || promptLower.includes('neural') || promptLower.includes('particles') || promptLower.includes('ai') || promptLower.includes('brain') || promptLower.includes('connection');
    const isSocial = promptLower.includes('tweet') || promptLower.includes('x-post') || promptLower.includes('reddit') || promptLower.includes('comment') || promptLower.includes('facebook') || promptLower.includes('post') || promptLower.includes('quote') || promptLower.includes('quotation');
    const isVs = promptLower.includes('before and after') || promptLower.includes('vs') || promptLower.includes('versus') || promptLower.includes('split screen') || promptLower.includes('left and right');
    const isMap = promptLower.includes('map') || promptLower.includes('mapa');
    const isTwoCards = promptLower.includes('two cards') || promptLower.includes('2 cards') || promptLower.includes('side-by-side') || promptLower.includes('lado a lado') || promptLower.includes('comparison');
    const isThreeCards = promptLower.includes('three cards') || promptLower.includes('3 cards') || promptLower.includes('recipe') || promptLower.includes('steps');
    const isPortrait = promptLower.includes('portrait') || promptLower.includes('person') || promptLower.includes('man') || promptLower.includes('woman') || promptLower.includes('narrator');

    let productName = 'PRODUTO COMERCIAL';
    if (isProduct && row.prompt) {
      const match = row.prompt.match(/\[Product Placeholder:\s*([^\]]+)\]/i);
      if (match && match[1]) {
        productName = match[1].trim().toUpperCase();
      }
    }

    if (format === 'avatar') {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <!-- Office background -->
          <rect width="480" height="270" fill="#1e1b4b" />
          <path d="M 0 200 L 480 200 L 480 270 L 0 270 Z" fill="#111827" opacity="0.4" />
          <!-- presenter silhouette -->
          <ellipse cx="240" cy="170" rx="55" ry="75" fill="#312e81" stroke="#4338ca" stroke-width="2" />
          <circle cx="240" cy="95" r="28" fill="#312e81" stroke="#4338ca" stroke-width="2" />
          <!-- overlay screen B-roll preview if present -->
          ${row.asset !== 'avatar' ? `
            <rect x="290" y="30" width="160" height="90" rx="8" fill="#1f2937" stroke="#4b5563" stroke-width="2" />
            <text x="370" y="80" font-family="sans-serif" font-size="10" fill="#9ca3af" text-anchor="middle">B-Roll: ${row.asset}</text>
          ` : `
            <text x="240" y="240" font-family="sans-serif" font-size="11" fill="#818cf8" text-anchor="middle" font-weight="bold">APRESENTADOR FALANDO</text>
          `}
        </svg>
      `;
    }
    if (format === 'vlog') {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <!-- Vlog scenic background -->
          <rect width="480" height="270" fill="#064e3b" />
          <circle cx="120" cy="160" r="80" fill="#047857" opacity="0.5" />
          <circle cx="380" cy="100" r="120" fill="#047857" opacity="0.3" />
          <!-- presenter holding camera silhouette -->
          <circle cx="240" cy="120" r="45" fill="#022c22" stroke="#064e3b" stroke-width="2" />
          <path d="M 170 270 Q 240 200 310 270 Z" fill="#022c22" />
          <!-- Camera Rec overlay UI -->
          <rect x="20" y="20" width="12" height="12" fill="#ef4444" rx="6" />
          <text x="38" y="30" font-family="monospace" font-size="10" font-weight="bold" fill="#ef4444">REC</text>
          <text x="420" y="30" font-family="monospace" font-size="10" fill="#ffffff">4K</text>
          <path d="M 20 230 L 20 250 L 40 250" fill="none" stroke="#ffffff" stroke-width="2" />
          <path d="M 460 230 L 460 250 L 440 250" fill="none" stroke="#ffffff" stroke-width="2" />
          <path d="M 20 70 L 20 50 L 40 50" fill="none" stroke="#ffffff" stroke-width="2" />
          <path d="M 460 70 L 460 50 L 440 50" fill="none" stroke="#ffffff" stroke-width="2" />
        </svg>
      `;
    }
    if (format === 'faceless') {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <!-- Cinematic B-Roll mockup -->
          <rect width="480" height="270" fill="#18181b" />
          <path d="M 0 180 L 120 100 L 280 220 L 480 150 L 480 270 L 0 270 Z" fill="#27272a" />
          <path d="M 0 220 L 180 160 L 320 240 L 480 190 L 480 270 L 0 270 Z" fill="#3f3f46" />
          <circle cx="380" cy="70" r="30" fill="#facc15" opacity="0.9" />
          <text x="240" y="140" font-family="sans-serif" font-size="12" font-weight="bold" fill="#a1a1aa" text-anchor="middle" letter-spacing="1">CINEMATIC B-ROLL</text>
        </svg>
      `;
    }

    if (isProduct) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="170" y="40" width="140" height="190" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <path d="M 220 90 Q 220 80 230 80 L 250 80 Q 260 80 260 90 L 255 120 L 265 180 Q 265 190 255 190 L 225 190 Q 215 190 215 180 L 225 120 Z" fill="#b91c1c" opacity="0.85" />
          <rect x="223" y="130" width="34" height="20" rx="2" fill="#facc15" />
          <text x="240" y="215" font-family="'DM Sans', sans-serif" font-size="9" font-weight="700" fill="#1f2937" text-anchor="middle">
            [${productName}]
          </text>
          <rect x="180" y="10" width="120" height="18" rx="9" fill="#ef4444" opacity="0.9" />
          <text x="240" y="22" font-family="'Space Mono', monospace" font-size="7" font-weight="700" fill="#ffffff" text-anchor="middle">
            EDITOR OVERRIDE
          </text>
        </svg>
      `;
    }

    if (isChart) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
            <linearGradient id="chart-grad" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="#3b82f6" />
              <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
            </linearGradient>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="50" y="45" width="380" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <line x1="80" y1="180" x2="400" y2="180" stroke="#e2e8f0" stroke-width="2" />
          <line x1="80" y1="140" x2="400" y2="140" stroke="#f1f5f9" stroke-width="1" />
          <line x1="80" y1="100" x2="400" y2="100" stroke="#f1f5f9" stroke-width="1" />
          <line x1="80" y1="65" x2="400" y2="65" stroke="#f1f5f9" stroke-width="1" />
          
          <path d="M 80 160 Q 140 170 180 120 T 280 110 T 340 75 L 400 70" fill="none" stroke="#3b82f6" stroke-width="4" stroke-linecap="round" />
          <path d="M 80 160 Q 140 170 180 120 T 280 110 T 340 75 L 400 70 L 400 180 L 80 180 Z" fill="url(#chart-grad)" opacity="0.15" />
          
          <circle cx="340" cy="75" r="5" fill="#3b82f6" />
          <circle cx="400" cy="70" r="6" fill="#10b981" />
          <circle cx="400" cy="70" r="3" fill="#ffffff" />
          
          <rect x="95" y="60" width="90" height="30" rx="6" fill="#eff6ff" />
          <text x="140" y="78" font-family="'DM Sans', sans-serif" font-size="9" font-weight="700" fill="#1e3a8a" text-anchor="middle">METRICS +84%</text>
        </svg>
      `;
    }

    if (isCode) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="60" y="45" width="360" height="180" rx="12" fill="#1e1e24" filter="url(#shadow)" />
          <rect x="60" y="45" width="360" height="25" rx="12" fill="#121214" />
          <circle cx="80" cy="57" r="4" fill="#ef4444" />
          <circle cx="92" cy="57" r="4" fill="#f59e0b" />
          <circle cx="104" cy="57" r="4" fill="#10b981" />
          <text x="240" y="61" font-family="'Space Mono', monospace" font-size="8" fill="#6b7280" text-anchor="middle">terminal - node</text>
          
          <text x="80" y="95" font-family="'Space Mono', monospace" font-size="9" font-weight="bold" fill="#f43f5e">const</text>
          <text x="120" y="95" font-family="'Space Mono', monospace" font-size="9" fill="#e2e8f0">engine = </text>
          <text x="180" y="95" font-family="'Space Mono', monospace" font-size="9" font-weight="bold" fill="#3b82f6">require</text>
          <text x="230" y="95" font-family="'Space Mono', monospace" font-size="9" fill="#10b981">("orchestrator");</text>
          
          <text x="80" y="115" font-family="'Space Mono', monospace" font-size="9" font-weight="bold" fill="#f59e0b">await</text>
          <text x="120" y="115" font-family="'Space Mono', monospace" font-size="9" fill="#e2e8f0">engine.</text>
          <text x="165" y="115" font-family="'Space Mono', monospace" font-size="9" font-weight="bold" fill="#a855f7">compile</text>
          <text x="215" y="115" font-family="'Space Mono', monospace" font-size="9" fill="#e2e8f0">({</text>
          
          <text x="100" y="135" font-family="'Space Mono', monospace" font-size="9" fill="#60a5fa">format: </text>
          <text x="150" y="135" font-family="'Space Mono', monospace" font-size="9" fill="#10b981">"catalog"</text>
          <text x="205" y="135" font-family="'Space Mono', monospace" font-size="9" fill="#e2e8f0">,</text>
          
          <text x="100" y="155" font-family="'Space Mono', monospace" font-size="9" fill="#60a5fa">cost: </text>
          <text x="138" y="155" font-family="'Space Mono', monospace" font-size="9" fill="#f59e0b">0</text>
          
          <text x="80" y="175" font-family="'Space Mono', monospace" font-size="9" fill="#e2e8f0">});</text>
          
          <text x="80" y="200" font-family="'Space Mono', monospace" font-size="9" fill="#10b981">$</text>
          <rect x="95" y="190" width="6" height="11" fill="#10b981" opacity="0.8" />
        </svg>
      `;
    }

    if (isTimeline) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="50" y="45" width="380" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <line x1="80" y1="135" x2="400" y2="135" stroke="#cbd5e1" stroke-width="4" stroke-linecap="round" />
          <line x1="80" y1="135" x2="280" y2="135" stroke="#6366f1" stroke-width="4" stroke-linecap="round" />
          
          <circle cx="120" cy="135" r="10" fill="#ffffff" stroke="#6366f1" stroke-width="3" />
          <circle cx="120" cy="135" r="4" fill="#6366f1" />
          <text x="120" y="105" font-family="'Space Mono', monospace" font-size="8" font-weight="700" fill="#6366f1" text-anchor="middle">FASE 01</text>
          <text x="120" y="170" font-family="'DM Sans', sans-serif" font-size="8" font-weight="700" fill="#374151" text-anchor="middle">Origem</text>
          
          <circle cx="240" cy="135" r="10" fill="#ffffff" stroke="#6366f1" stroke-width="3" />
          <circle cx="240" cy="135" r="4" fill="#6366f1" />
          <text x="240" y="105" font-family="'Space Mono', monospace" font-size="8" font-weight="700" fill="#6366f1" text-anchor="middle">FASE 02</text>
          <text x="240" y="170" font-family="'DM Sans', sans-serif" font-size="8" font-weight="700" fill="#374151" text-anchor="middle">Evolução</text>
          
          <circle cx="360" cy="135" r="8" fill="#ffffff" stroke="#94a3b8" stroke-width="2" />
          <text x="360" y="105" font-family="'Space Mono', monospace" font-size="8" font-weight="700" fill="#94a3b8" text-anchor="middle">FASE 03</text>
          <text x="360" y="170" font-family="'DM Sans', sans-serif" font-size="8" font-weight="700" fill="#6b7280" text-anchor="middle">Ápice</text>
        </svg>
      `;
    }

    if (isDoc) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="195" y="45" width="115" height="155" rx="8" fill="#ffffff" stroke="#e2e8f0" stroke-width="2" filter="url(#shadow)" transform="rotate(-6 250 120)" />
          <rect x="175" y="55" width="120" height="160" rx="8" fill="#ffffff" stroke="#cbd5e1" stroke-width="2" filter="url(#shadow)" />
          
          <rect x="190" y="75" width="90" height="10" rx="2" fill="#1e3a8a" opacity="0.8" />
          <rect x="190" y="100" width="90" height="5" rx="1.5" fill="#e2e8f0" />
          <rect x="190" y="115" width="90" height="5" rx="1.5" fill="#e2e8f0" />
          <rect x="190" y="130" width="75" height="5" rx="1.5" fill="#e2e8f0" />
          <rect x="190" y="145" width="90" height="5" rx="1.5" fill="#e2e8f0" />
          <rect x="190" y="160" width="60" height="5" rx="1.5" fill="#e2e8f0" />
          
          <circle cx="265" cy="180" r="16" fill="#3b82f6" opacity="0.15" />
          <circle cx="265" cy="180" r="12" fill="none" stroke="#3b82f6" stroke-width="1.5" stroke-dasharray="3,2" />
          <path d="M 259 180 L 263 184 L 272 175" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          
          <text x="240" y="238" font-family="'DM Sans', sans-serif" font-size="9" font-weight="700" fill="#4b5563" text-anchor="middle">
            DOCUMENTO CIENTÍFICO VERIFICADO
          </text>
        </svg>
      `;
    }

    if (isNetwork) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="50" y="45" width="380" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          
          <line x1="120" y1="90" x2="240" y2="70" stroke="#a78bfa" stroke-width="1.5" />
          <line x1="120" y1="90" x2="160" y2="160" stroke="#a78bfa" stroke-width="1.5" />
          <line x1="240" y1="70" x2="320" y2="100" stroke="#a78bfa" stroke-width="1.5" />
          <line x1="240" y1="70" x2="260" y2="180" stroke="#a78bfa" stroke-width="1.5" />
          <line x1="160" y1="160" x2="260" y2="180" stroke="#a78bfa" stroke-width="1.5" />
          <line x1="320" y1="100" x2="260" y2="180" stroke="#a78bfa" stroke-width="1.5" />
          <line x1="320" y1="100" x2="360" y2="160" stroke="#a78bfa" stroke-width="1.5" />
          
          <circle cx="120" cy="90" r="8" fill="#8b5cf6" />
          <circle cx="120" cy="90" r="3" fill="#ffffff" />
          
          <circle cx="240" cy="70" r="10" fill="#3b82f6" />
          <circle cx="240" cy="70" r="4" fill="#ffffff" />
          
          <circle cx="320" cy="100" r="8" fill="#8b5cf6" />
          <circle cx="320" cy="100" r="3" fill="#ffffff" />
          
          <circle cx="160" cy="160" r="6" fill="#ec4899" />
          <circle cx="260" cy="180" r="12" fill="#ffffff" stroke="#ec4899" stroke-width="3" />
          <circle cx="260" cy="180" r="5" fill="#ec4899" />
          
          <circle cx="360" cy="160" r="6" fill="#ec4899" />
          
          <text x="240" y="212" font-family="'DM Sans', sans-serif" font-size="9" font-weight="700" fill="#6b7280" text-anchor="middle">
            REDE DE DADOS &amp; NEURÔNIOS
          </text>
        </svg>
      `;
    }

    if (isSocial) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="60" y="55" width="360" height="160" rx="16" fill="#ffffff" filter="url(#shadow)" />
          
          <circle cx="100" cy="95" r="18" fill="#e2e8f0" />
          <circle cx="100" cy="88" r="7" fill="#cbd5e1" />
          <path d="M 88 107 C 88 100 93 99 100 99 C 107 99 112 100 112 107 Z" fill="#cbd5e1" />
          
          <rect x="130" y="80" width="80" height="8" rx="2" fill="#1f2937" />
          <rect x="130" y="94" width="50" height="6" rx="2" fill="#9ca3af" />
          
          <rect x="375" y="75" width="20" height="20" rx="10" fill="#1da1f2" />
          <path d="M 381 85 L 384 88 L 391 81" fill="none" stroke="#ffffff" stroke-width="2" stroke-linecap="round" />
          
          <rect x="80" y="130" width="320" height="8" rx="2" fill="#e5e7eb" />
          <rect x="80" y="145" width="320" height="8" rx="2" fill="#e5e7eb" />
          <rect x="80" y="160" width="200" height="8" rx="2" fill="#e5e7eb" />
          
          <circle cx="95" cy="195" r="4" fill="#9ca3af" />
          <rect x="105" y="193" width="20" height="4" rx="2" fill="#cbd5e1" />
          
          <circle cx="195" cy="195" r="4" fill="#9ca3af" />
          <rect x="205" y="193" width="20" height="4" rx="2" fill="#cbd5e1" />
          
          <circle cx="295" cy="195" r="4" fill="#9ca3af" />
          <rect x="305" y="193" width="20" height="4" rx="2" fill="#cbd5e1" />
        </svg>
      `;
    }

    if (isVs) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="50" y="45" width="180" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <rect x="65" y="60" width="150" height="70" rx="8" fill="#fef2f2" />
          <text x="140" y="102" font-family="'DM Sans', sans-serif" font-size="20" font-weight="700" fill="#ef4444" text-anchor="middle">ANTERIOR</text>
          <rect x="80" y="150" width="120" height="8" rx="2" fill="#ef4444" opacity="0.3" />
          <rect x="80" y="165" width="120" height="8" rx="2" fill="#ef4444" opacity="0.3" />
          <rect x="80" y="180" width="90" height="8" rx="2" fill="#ef4444" opacity="0.3" />
          
          <rect x="250" y="45" width="180" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <rect x="265" y="60" width="150" height="70" rx="8" fill="#f0fdf4" />
          <text x="340" y="102" font-family="'DM Sans', sans-serif" font-size="20" font-weight="700" fill="#22c55e" text-anchor="middle">EVOLUÍDO</text>
          <rect x="280" y="150" width="120" height="8" rx="2" fill="#22c55e" opacity="0.3" />
          <rect x="280" y="165" width="120" height="8" rx="2" fill="#22c55e" opacity="0.3" />
          <rect x="280" y="180" width="100" height="8" rx="2" fill="#22c55e" opacity="0.3" />
          
          <circle cx="240" cy="135" r="18" fill="#1e293b" />
          <text x="240" y="141" font-family="'Space Mono', monospace" font-size="10" font-weight="700" fill="#ffffff" text-anchor="middle">VS</text>
        </svg>
      `;
    }

    if (isMap) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="80" y="45" width="320" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <path d="M 110 90 Q 140 80 160 110 Q 180 80 210 100 Q 230 130 200 150 Q 150 170 110 140 Z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.5" />
          <path d="M 280 130 Q 310 100 340 120 Q 370 140 350 170 Q 320 180 290 160 Z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.5" />
          <path d="M 150 120 Q 200 100 240 140 T 320 140" fill="none" stroke="#818cf8" stroke-width="3" stroke-dasharray="6,4" />
          <circle cx="320" cy="140" r="6" fill="#ef4444" />
          <circle cx="320" cy="140" r="2" fill="#ffffff" />
          <text x="240" y="210" font-family="'DM Sans', sans-serif" font-size="10" font-weight="700" fill="#4b5563" text-anchor="middle">
            VETOR DE MAPA &amp; ROTA
          </text>
        </svg>
      `;
    }

    if (isTwoCards) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="50" y="55" width="175" height="160" rx="14" fill="#ffffff" filter="url(#shadow)" />
          <rect x="70" y="80" width="135" height="70" rx="6" fill="#f3f4f6" />
          <circle cx="100" cy="115" r="15" fill="#c084fc" opacity="0.7" />
          <rect x="75" y="170" width="125" height="8" rx="2" fill="#e5e7eb" />
          <rect x="75" y="185" width="80" height="8" rx="2" fill="#e5e7eb" />
          
          <rect x="255" y="55" width="175" height="160" rx="14" fill="#ffffff" filter="url(#shadow)" />
          <rect x="275" y="80" width="135" height="70" rx="6" fill="#f3f4f6" />
          <path d="M 310 130 L 340 100 L 370 120" fill="none" stroke="#60a5fa" stroke-width="3" stroke-linecap="round" />
          <rect x="280" y="170" width="125" height="8" rx="2" fill="#e5e7eb" />
          <rect x="280" y="185" width="100" height="8" rx="2" fill="#e5e7eb" />
        </svg>
      `;
    }

    if (isThreeCards) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="35" y="65" width="125" height="140" rx="12" fill="#ffffff" filter="url(#shadow)" />
          <circle cx="97" cy="105" r="18" fill="#fca5a5" opacity="0.6" />
          <rect x="50" y="145" width="95" height="6" rx="2" fill="#e5e7eb" />
          <rect x="50" y="160" width="65" height="6" rx="2" fill="#e5e7eb" />
          <text x="97" y="188" font-family="'Space Mono', monospace" font-size="10" font-weight="700" fill="#b91c1c" text-anchor="middle">01</text>
          
          <rect x="177" y="65" width="125" height="140" rx="12" fill="#ffffff" filter="url(#shadow)" />
          <rect x="220" y="87" width="40" height="36" rx="4" fill="#fef08a" opacity="0.7" />
          <rect x="192" y="145" width="95" height="6" rx="2" fill="#e5e7eb" />
          <rect x="192" y="160" width="80" height="6" rx="2" fill="#e5e7eb" />
          <text x="239" y="188" font-family="'Space Mono', monospace" font-size="10" font-weight="700" fill="#a16207" text-anchor="middle">02</text>
          
          <rect x="320" y="65" width="125" height="140" rx="12" fill="#ffffff" filter="url(#shadow)" />
          <polygon points="382,87 362,123 402,123" fill="#93c5fd" opacity="0.7" />
          <rect x="335" y="145" width="95" height="6" rx="2" fill="#e5e7eb" />
          <rect x="335" y="160" width="55" height="6" rx="2" fill="#e5e7eb" />
          <text x="382" y="188" font-family="'Space Mono', monospace" font-size="10" font-weight="700" fill="#1d4ed8" text-anchor="middle">03</text>
        </svg>
      `;
    }

    if (isPortrait) {
      return `
        <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
          <defs>
            <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
              <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
            </filter>
            <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
              <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
            </pattern>
          </defs>
          <rect width="480" height="270" fill="#f6f5f0" />
          <rect width="480" height="270" fill="url(#grid)" />
          
          <rect x="165" y="45" width="150" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
          <circle cx="240" cy="110" r="28" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.5" />
          <path d="M 205 175 C 205 150 220 145 240 145 C 260 145 275 150 275 175 Z" fill="#e2e8f0" stroke="#cbd5e1" stroke-width="1.5" />
          <rect x="185" y="195" width="110" height="6" rx="2" fill="#e5e7eb" />
        </svg>
      `;
    }

    return `
      <svg viewBox="0 0 480 270" width="100%" height="100%" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <filter id="shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="2" dy="4" stdDeviation="4" flood-opacity="0.1" />
          </filter>
          <pattern id="grid" width="30" height="30" patternUnits="userSpaceOnUse">
            <path d="M 30 0 L 0 0 0 30" fill="none" stroke="rgba(0,0,0,0.02)" stroke-width="1"/>
          </pattern>
        </defs>
        <rect width="480" height="270" fill="#f6f5f0" />
        <rect width="480" height="270" fill="url(#grid)" />
        
        <rect x="100" y="45" width="280" height="180" rx="16" fill="#ffffff" filter="url(#shadow)" />
        <circle cx="240" cy="120" r="30" fill="none" stroke="#cbd5e1" stroke-width="2" />
        <circle cx="240" cy="120" r="20" fill="none" stroke="#818cf8" stroke-width="3" />
        <line x1="200" y1="120" x2="280" y2="120" stroke="#cbd5e1" stroke-width="1.5" />
        <line x1="240" y1="80" x2="240" y2="160" stroke="#cbd5e1" stroke-width="1.5" />
        <rect x="130" y="195" width="220" height="6" rx="2" fill="#e5e7eb" />
      </svg>
    `;
  };

  const generateStoryboardHtmlString = (pipeline: any): string => {
    if (!pipeline || !pipeline.rows || !pipeline.rows.length) return '';
    const themeTitle = approvedBriefing?.title || approvedTheme || 'Roteiro de Vídeo';
    const rows = pipeline.rows;
    
    const gridItems = rows.map((row: any) => {
      const svgCode = generateSceneSvgPreview(row, videoFormat);
      const isFallback = !!row.isFallback;
      
      let assetBadgeColor = 'bg-gray-800 text-gray-400 border-gray-700';
      let timeColorClass = 'text-zinc-400';
      if (row.asset === 'vídeo') {
        assetBadgeColor = 'bg-green-500/10 text-green-400 border-green-500/30';
        timeColorClass = 'text-green-400';
      } else if (row.asset === 'imagem') {
        assetBadgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        timeColorClass = 'text-blue-400';
      } else if (row.asset === 'hyperframe') {
        assetBadgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
        timeColorClass = 'text-cyan-400';
      } else if (row.asset === 'texto') {
        assetBadgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        timeColorClass = 'text-amber-400';
      } else if (row.asset === 'avatar') {
        assetBadgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
        timeColorClass = 'text-purple-400';
      }

      return `
        <div id="card-row-${row.rowNumber}" class="scene-card bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl flex flex-col transition-all hover:border-zinc-700">
          <div class="w-full bg-zinc-950 aspect-video relative flex items-center justify-center border-b border-zinc-800 overflow-hidden">
            ${svgCode}
            <div class="absolute top-3 left-3 flex items-center gap-2 bg-black/60 backdrop-blur-md px-3 py-1 rounded-full text-[10px] font-black border border-purple-500/20 uppercase tracking-widest text-purple-300 select-none">
              <input type="checkbox" id="card-chk-${row.rowNumber}" onchange="toggleRowSelection(${row.rowNumber}, this.checked)" class="w-3.5 h-3.5 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500 cursor-pointer" checked>
              <span>CENA #${row.rowNumber}</span>
            </div>
          </div>
          
          <div class="p-5 flex-1 flex flex-col space-y-4">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border ${assetBadgeColor}">
                  ${(row.asset || 'SEM ASSET').toUpperCase()}
                </span>
                <span class="text-[12px] font-bold ${timeColorClass} font-mono tracking-tight">
                  ${row.startTime} - ${row.endTime}
                </span>
              </div>
              ${isFallback ? '<span class="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border bg-orange-500/10 text-orange-400 border-orange-500/30">FALLBACK (IA)</span>' : ''}
            </div>
            
            <div class="space-y-1.5">
              <h4 class="text-[9px] font-black uppercase tracking-widest text-zinc-500">Legenda (Locução)</h4>
              <p class="text-[12px] text-zinc-200 leading-relaxed font-medium bg-zinc-950/45 border border-zinc-800/40 rounded-xl p-3 select-all italic">&quot;${row.texto}&quot;</p>
            </div>
            
            <div class="space-y-1.5 flex-1 flex flex-col">
              <div class="flex items-center justify-between">
                <h4 class="text-[9px] font-black uppercase tracking-widest text-zinc-500">Prompt Visual (Inglês)</h4>
                <button 
                  onclick="navigator.clipboard.writeText(decodeURIComponent('${encodeURIComponent(row.prompt || '')}')); this.textContent = 'COPIADO!'; setTimeout(() => this.textContent = 'COPIAR', 1000);" 
                  class="text-[9px] font-bold text-purple-400 hover:text-purple-300 uppercase tracking-wider"
                >
                  Copiar
                </button>
              </div>
              <p class="text-[11px] text-zinc-300 leading-relaxed font-mono bg-zinc-950/80 border border-zinc-800/60 rounded-xl p-3 flex-1 select-all">${row.prompt || '<span class="text-zinc-600">Sem prompt visual</span>'}</p>
            </div>
          </div>
        </div>
      `;
    }).join('\n');

    const spreadsheetRows = rows.map((row: any) => {
      let assetBadgeColor = 'bg-gray-800 text-gray-400 border-gray-700';
      let timeColorClass = 'text-zinc-400';
      if (row.asset === 'vídeo') {
        assetBadgeColor = 'bg-green-500/10 text-green-400 border-green-500/30';
        timeColorClass = 'text-green-400';
      } else if (row.asset === 'imagem') {
        assetBadgeColor = 'bg-blue-500/10 text-blue-400 border-blue-500/30';
        timeColorClass = 'text-blue-400';
      } else if (row.asset === 'hyperframe') {
        assetBadgeColor = 'bg-cyan-500/10 text-cyan-400 border-cyan-500/30';
        timeColorClass = 'text-cyan-400';
      } else if (row.asset === 'texto') {
        assetBadgeColor = 'bg-amber-500/10 text-amber-400 border-amber-500/30';
        timeColorClass = 'text-amber-400';
      } else if (row.asset === 'avatar') {
        assetBadgeColor = 'bg-purple-500/10 text-purple-400 border-purple-500/30';
        timeColorClass = 'text-purple-400';
      }

      return `
        <tr id="tr-row-${row.rowNumber}" class="hover:bg-zinc-800/30 border-b border-zinc-800/60 transition-colors">
          <td class="px-6 py-4 whitespace-nowrap text-center no-print">
            <input type="checkbox" id="chk-${row.rowNumber}" onchange="toggleRowSelection(${row.rowNumber}, this.checked)" class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500 cursor-pointer" checked>
          </td>
          <td class="px-6 py-4 whitespace-nowrap font-mono text-xs font-bold text-purple-300">
            #${row.rowNumber}
          </td>
          <td class="px-6 py-4 whitespace-nowrap">
            <span class="px-2.5 py-1 text-[9px] font-black uppercase tracking-wider rounded-lg border ${assetBadgeColor}">
              ${(row.asset || 'SEM ASSET').toUpperCase()}
            </span>
          </td>
          <td class="px-6 py-4 whitespace-nowrap font-mono font-bold ${timeColorClass}">
            ${row.startTime} - ${row.endTime}
          </td>
          <td class="px-6 py-4 text-zinc-200 font-medium italic">
            &quot;${row.texto}&quot;
          </td>
        </tr>
      `;
    }).join('\n');

    return `
      <!DOCTYPE html>
      <html lang="pt-BR">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Storyboard — ${themeTitle}</title>
        <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;700&family=Space+Mono:wght@400;700&display=swap" rel="stylesheet">
        <script src="https://cdn.tailwindcss.com"></script>
        <script>
          tailwind.config = {
            theme: {
              extend: {
                fontFamily: {
                  sans: ['"DM Sans"', 'sans-serif'],
                  mono: ['"Space Mono"', 'monospace'],
                }
              }
            }
          }
        </script>
        <style>
          body {
            background-color: #0e0e10;
            color: #e4e4e7;
          }
          input[type="checkbox"] {
            accent-color: #9333ea;
          }
          .filtered-out {
            display: none !important;
          }
          @media print {
            body {
              background-color: #ffffff !important;
              color: #000000 !important;
            }
            .no-print, input[type="checkbox"] {
              display: none !important;
            }
            .scene-card {
              break-inside: avoid;
              background-color: #ffffff !important;
              border-color: #d4d4d8 !important;
              box-shadow: none !important;
              color: #000000 !important;
            }
            .scene-card p {
              color: #18181b !important;
              background-color: #f4f4f5 !important;
              border-color: #e4e4e7 !important;
            }
            .scene-card text {
              fill: #000000 !important;
            }
            .scene-card rect[fill="#ffffff"] {
              stroke: #cbd5e1 !important;
              stroke-width: 1px !important;
            }
            .scene-card rect[fill="#f6f5f0"] {
              fill: #f8fafc !important;
            }
            /* Spreadsheet print overrides */
            #spreadsheet-view {
              background-color: #ffffff !important;
              border-color: #d4d4d8 !important;
              box-shadow: none !important;
              display: block !important;
            }
            #spreadsheet-view table {
              border-color: #d4d4d8 !important;
            }
            #spreadsheet-view tr {
              border-bottom-color: #cbd5e1 !important;
              background-color: #ffffff !important;
            }
            #spreadsheet-view th {
              background-color: #f1f5f9 !important;
              color: #000000 !important;
              border-bottom-color: #cbd5e1 !important;
            }
            #spreadsheet-view td {
              color: #18181b !important;
            }
          }
        </style>
      </head>
      <body class="font-sans antialiased min-h-screen pb-16">
        <header class="no-print sticky top-0 z-50 bg-zinc-950/80 backdrop-blur-md border-b border-zinc-800/80 px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div class="space-y-0.5">
            <div class="flex items-center gap-2">
              <span class="bg-purple-500/10 text-purple-400 border border-purple-500/20 px-2 py-0.5 text-[8px] font-black uppercase tracking-widest rounded">STORYBOARD GENERATOR</span>
              <span class="bg-zinc-800 text-zinc-300 px-2 py-0.5 text-[8px] font-semibold uppercase tracking-widest rounded">${videoFormat.toUpperCase()}</span>
            </div>
            <h1 id="header-theme-title" class="text-base font-bold text-zinc-100 uppercase tracking-wide truncate max-w-xl">${themeTitle}</h1>
          </div>
          
          <div class="flex items-center gap-3">
            <button 
              id="toggle-view-btn"
              onclick="toggleViewMode()" 
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 active:scale-95 transition-all text-xs font-bold text-zinc-200 rounded-xl flex items-center gap-2"
            >
              <span id="toggle-view-text">📊 EXIBIR PLANILHA</span>
            </button>
            <button 
              onclick="window.print()" 
              class="px-4 py-2 bg-purple-600 hover:bg-purple-700 active:scale-95 transition-all text-xs font-bold text-white rounded-xl shadow-lg shadow-purple-600/15 flex items-center gap-2"
            >
              <span>🖨️ IMPRIMIR / PDF</span>
            </button>
            <button 
              onclick="downloadSelfHTML()" 
              class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 active:scale-95 transition-all text-xs font-bold text-zinc-200 rounded-xl border border-zinc-700 flex items-center gap-2"
            >
              <span>💾 SALVAR HTML</span>
            </button>
          </div>
        </header>

        <main class="max-w-7xl mx-auto px-6 py-8">
          <div class="bg-zinc-900/40 border border-zinc-800/80 rounded-2xl p-6 mb-8 grid grid-cols-2 md:grid-cols-4 gap-6">
            <div>
              <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Total de Cenas</span>
              <span class="text-2xl font-bold text-zinc-100" id="stat-total">${rows.length}</span>
            </div>
            <div>
              <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Formato Ativo</span>
              <span class="text-2xl font-bold text-purple-400 uppercase">${videoFormat}</span>
            </div>
            <div>
              <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Duração Estimada</span>
              <span class="text-2xl font-bold text-zinc-100">${rows[rows.length - 1]?.endTime || '00:00'}</span>
            </div>
            <div>
              <span class="text-[9px] font-black uppercase tracking-widest text-zinc-500 block">Gerado em</span>
              <span class="text-xs font-semibold text-zinc-400 mt-2 block">${new Date().toLocaleDateString('pt-BR')} ${new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
            </div>
          </div>

          <div id="grid-view" class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
            ${gridItems}
          </div>

          <div id="spreadsheet-view" class="hidden bg-zinc-900 border border-zinc-800 rounded-2xl shadow-xl overflow-hidden">
            <!-- Filter Bar -->
            <div class="no-print p-6 border-b border-zinc-800 bg-zinc-950/40 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
              <div class="flex flex-wrap items-center gap-3">
                <span class="text-xs font-bold text-zinc-400 uppercase tracking-wider">Filtrar Asset:</span>
                <div class="flex flex-wrap gap-1.5" id="asset-filter-buttons">
                  <!-- Dynamic JS buttons -->
                </div>
              </div>

              <!-- Selection Options -->
              <div class="flex flex-wrap items-center gap-4">
                <button onclick="setSelectedAll(true)" class="text-xs font-semibold text-purple-400 hover:text-purple-300 transition-colors">
                  ✓ Selecionar Todos
                </button>
                <button onclick="setSelectedAll(false)" class="text-xs font-semibold text-zinc-500 hover:text-zinc-400 transition-colors">
                  ✕ Limpar Seleção
                </button>
                <div class="h-4 w-px bg-zinc-800"></div>
                <label class="flex items-center gap-2 cursor-pointer select-none">
                  <input type="checkbox" id="chk-only-selected" onchange="toggleOnlySelected(this.checked)" class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500">
                  <span class="text-xs font-bold text-zinc-300">Mostrar Apenas Selecionados</span>
                </label>
              </div>
            </div>

            <div class="overflow-x-auto">
              <table class="w-full text-left border-collapse">
                <thead>
                  <tr class="bg-zinc-950/60 border-b border-zinc-800 text-[10px] font-black uppercase tracking-widest text-zinc-400">
                    <th class="px-6 py-4 w-16 text-center no-print">
                      <input type="checkbox" id="th-chk-all" onchange="toggleSelectAllRows(this.checked)" class="w-4 h-4 rounded border-zinc-700 bg-zinc-950 text-purple-600 focus:ring-purple-500" checked>
                    </th>
                    <th class="px-6 py-4 w-28">Cena</th>
                    <th class="px-6 py-4 w-40">Asset</th>
                    <th class="px-6 py-4 w-60">Posição Temporal</th>
                    <th class="px-6 py-4">Legenda (Locução)</th>
                  </tr>
                </thead>
                <tbody class="divide-y divide-zinc-800/60 text-sm">
                  ${spreadsheetRows}
                </tbody>
              </table>
            </div>
          </div>
        </main>

        <script id="scenes-data" type="application/json">
          ${JSON.stringify(rows.map((r: any) => ({ rowNumber: r.rowNumber, asset: r.asset || 'SEM ASSET', selected: true })))}
        </script>

        <script>
          let currentViewMode = 'grid';

          function toggleViewMode() {
            const gridView = document.getElementById('grid-view');
            const spreadsheetView = document.getElementById('spreadsheet-view');
            const toggleBtnText = document.getElementById('toggle-view-text');

            if (currentViewMode === 'grid') {
              gridView.classList.remove('grid');
              gridView.classList.add('hidden');
              spreadsheetView.classList.remove('hidden');
              toggleBtnText.textContent = '🎬 EXIBIR QUADRICULADO';
              currentViewMode = 'spreadsheet';
            } else {
              gridView.classList.remove('hidden');
              gridView.classList.add('grid');
              spreadsheetView.classList.add('hidden');
              toggleBtnText.textContent = '📊 EXIBIR PLANILHA';
              currentViewMode = 'grid';
            }
          }

          function downloadSelfHTML() {
            const docSource = '<!DOCTYPE html>\\n' + document.documentElement.outerHTML;
            const blob = new Blob([docSource], { type: 'text/html;charset=utf-8' });
            const url = URL.createObjectURL(blob);
            const link = document.createElement('a');
            link.href = url;
            const themeTitle = document.getElementById('header-theme-title')?.innerText || 'Roteiro_de_Video';
            const sanitized = themeTitle
              .normalize('NFD')
              .replace(/[\\u0300-\\u036f]/g, '')
              .replace(/[<>:"/\\\\|?*\\u0000-\\u001F]/g, '')
              .replace(/\\s+/g, ' ')
              .trim()
              .replace(/\\s/g, '_')
              .slice(0, 80) || 'storyboard';
            link.download = 'storyboard_' + sanitized + '.html';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            URL.revokeObjectURL(url);
          }

          // Dynamic filters and selection state
          const scenes = JSON.parse(document.getElementById('scenes-data').textContent);
          let selectedAssetFilter = 'all';
          let onlySelected = false;

          function initFilters() {
            const assetFilterContainer = document.getElementById('asset-filter-buttons');
            if (!assetFilterContainer) return;
            
            const assetCounts = {};
            scenes.forEach(s => {
              const asset = s.asset.toLowerCase();
              assetCounts[asset] = (assetCounts[asset] || 0) + 1;
            });
            
            assetFilterContainer.innerHTML = '';
            
            const allBtn = document.createElement('button');
            allBtn.id = 'btn-filter-all';
            allBtn.onclick = () => filterAsset('all');
            allBtn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 active:scale-95 transition-all';
            allBtn.innerText = 'Todos (' + scenes.length + ')';
            assetFilterContainer.appendChild(allBtn);
            
            Object.keys(assetCounts).sort().forEach(asset => {
              const btn = document.createElement('button');
              btn.id = 'btn-filter-' + asset;
              btn.onclick = () => filterAsset(asset);
              btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-all uppercase';
              btn.innerText = asset + ' (' + assetCounts[asset] + ')';
              assetFilterContainer.appendChild(btn);
            });
          }

          function filterAsset(assetType) {
            selectedAssetFilter = assetType;
            
            const buttons = document.querySelectorAll('#asset-filter-buttons button');
            buttons.forEach(btn => {
              btn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-zinc-700 bg-zinc-800 text-zinc-300 hover:bg-zinc-700 active:scale-95 transition-all';
            });
            
            const activeBtn = document.getElementById('btn-filter-' + assetType);
            if (activeBtn) {
              activeBtn.className = 'px-3 py-1.5 text-xs font-bold rounded-lg border border-purple-500/30 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 active:scale-95 transition-all';
            }
            
            applyFilters();
          }

          function toggleOnlySelected(isChecked) {
            onlySelected = isChecked;
            applyFilters();
          }

          function toggleRowSelection(rowNumber, isChecked) {
            const scene = scenes.find(s => s.rowNumber === rowNumber);
            if (scene) {
              scene.selected = isChecked;
            }
            
            const tblChk = document.getElementById('chk-' + rowNumber);
            if (tblChk) tblChk.checked = isChecked;
            
            const cardChk = document.getElementById('card-chk-' + rowNumber);
            if (cardChk) cardChk.checked = isChecked;
            
            const allChecked = scenes.every(s => s.selected);
            const noneChecked = scenes.every(s => !s.selected);
            const thChkAll = document.getElementById('th-chk-all');
            if (thChkAll) {
              thChkAll.checked = allChecked;
              thChkAll.indeterminate = (!allChecked && !noneChecked);
            }
            
            applyFilters();
          }

          function toggleSelectAllRows(isChecked) {
            scenes.forEach(scene => {
              scene.selected = isChecked;
              const tblChk = document.getElementById('chk-' + scene.rowNumber);
              if (tblChk) tblChk.checked = isChecked;
              const cardChk = document.getElementById('card-chk-' + scene.rowNumber);
              if (cardChk) cardChk.checked = isChecked;
            });
            
            applyFilters();
          }

          function setSelectedAll(isChecked) {
            const thChkAll = document.getElementById('th-chk-all');
            if (thChkAll) {
              thChkAll.checked = isChecked;
              thChkAll.indeterminate = false;
            }
            toggleSelectAllRows(isChecked);
          }

          function applyFilters() {
            scenes.forEach(scene => {
              const tr = document.getElementById('tr-row-' + scene.rowNumber);
              const card = document.getElementById('card-row-' + scene.rowNumber);
              
              const matchesAsset = (selectedAssetFilter === 'all' || scene.asset.toLowerCase() === selectedAssetFilter.toLowerCase());
              const matchesSelection = (!onlySelected || scene.selected);
              const isVisible = matchesAsset && matchesSelection;
              
              if (isVisible) {
                tr?.classList.remove('filtered-out');
                card?.classList.remove('filtered-out');
              } else {
                tr?.classList.add('filtered-out');
                card?.classList.add('filtered-out');
              }
            });

            updateCounters();
          }

          function updateCounters() {
            const visibleScenes = scenes.filter(s => {
              const matchesAsset = (selectedAssetFilter === 'all' || s.asset.toLowerCase() === selectedAssetFilter.toLowerCase());
              const matchesSelection = (!onlySelected || s.selected);
              return matchesAsset && matchesSelection;
            });
            
            const statTotal = document.getElementById('stat-total');
            if (statTotal) {
              statTotal.innerText = visibleScenes.length + ' / ' + scenes.length;
            }
          }

          // Initial load
          initFilters();
          updateCounters();
        </script>
      </body>
      </html>
    `;
  };

  const openStoryboardInNewTab = () => {
    if (!externalSrtPipeline || !externalSrtPipeline.rows || !externalSrtPipeline.rows.length) {
      alert('Não há dados do pipeline para visualizar no storyboard.');
      return;
    }
    try {
      const htmlContent = generateStoryboardHtmlString(externalSrtPipeline);
      const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
      const blobUrl = URL.createObjectURL(blob);
      window.open(blobUrl, '_blank');
    } catch (err) {
      console.error('Erro ao abrir o storyboard:', err);
      alert('Falha ao abrir storyboard: ' + (err instanceof Error ? err.message : String(err)));
    }
  };

  const hasFinalScript = scriptStage === 'final' && scriptBlocks.some((block) => String(block.content || '').trim());
  const hasExternalScriptSource = !!externalScriptText.trim();
  const canProcessPostScriptPackage = hasFinalScript || hasExternalScriptSource;
  const packageArtifactStem = sanitizeDownloadFileStem(approvedBriefing?.title || approvedTheme || externalScriptFileName || 'roteiro-content-os');

  const resolvePostScriptSourceBlocks = (): ScriptBlock[] => {
    if (hasFinalScript) return scriptBlocks;

    const targetCount = Math.max(1, approvedBriefing?.blocks?.length || scriptBlocks.length || 1);
    const sections = segmentExternalScriptForBlocks(externalScriptText, targetCount);
    if (sections.length === 0) return [];

    return sections.map((section, index) => ({
      id: scriptBlocks[index]?.id || `external_${index + 1}`,
      type: scriptBlocks[index]?.type || 'Development',
      title: scriptBlocks[index]?.title || approvedBriefing?.blocks?.[index]?.title || `Bloco ${index + 1}`,
      content: section.trim(),
      sop: scriptBlocks[index]?.sop || '',
    }));
  };

  const generatePostScriptPackage = async () => {
    if (!approvedBriefing || !approvedTheme || !canProcessPostScriptPackage) {
      alert('Finalize o roteiro ou anexe um .txt externo antes de gerar o pacote pos-roteiro.');
      return;
    }

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';

    const sourceBlocks = resolvePostScriptSourceBlocks();
    if (!sourceBlocks.length) {
      alert('Nao encontrei blocos suficientes no roteiro atual para processar o pacote pos-roteiro.');
      return;
    }

    // Em pipeline mode, usa _pipelineResultRef para evitar stale closure (externalSrtPipeline ainda null)
    const srtRows = (_isPipelineMode.current && _pipelineResultRef.current?.rows)
      ? _pipelineResultRef.current.rows
      : (externalSrtPipeline?.rows || (externalSrtText.trim() ? parseSrtToRows(externalSrtText, forceAllAsVideo) : []));
    const hfCount = (srtRows as any[]).filter((r: any) => r.asset === 'hyperframe').length;
      console.log(`[HF] Enviando para API: ${hfCount} HF rows de ${(srtRows as any[]).length} total (fonte: ${_isPipelineMode.current ? 'pipeline' : 'externo'})`);
    if (_isPipelineMode.current) setSrtPipelineStatus(`Etapa 3: Pacote pós-roteiro — ${hfCount} anchors HF enviados à IA...`);
    const timelineContext = buildPostScriptTimelineContext({
      scriptBlocks: sourceBlocks,
      estimatedDuration: approvedBriefing?.estimatedDuration,
      srtRows,
    });
    const fallbackSeoPlan = buildSeoChapterPlan({
      scriptBlocks: sourceBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
    });

    let titleStructures: any[] = [];
    if (typeof window !== 'undefined' && activeProject?.id) {
      const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed)) {
            titleStructures = parsed
              .filter((c: any) => c.type === 'Title Structure')
              .map((c: any) => ({
                id: c.id,
                name: c.name,
                content_pattern: c.content_pattern || c.description || '',
              }));
          }
        } catch (e) {
          console.warn('[ScriptEngine] Erro ao ler titleStructures do localStorage:', e);
        }
      }
    }

    setIsGeneratingPostScriptPackage(true);
    try {
      let data: any = {};
      if (apiKey) {
        // Direct browser calling
        const seoChapterPlan = buildSeoChapterPlan({
          scriptBlocks: sourceBlocks,
          totalDurationSeconds: timelineContext.totalDurationSeconds,
          srtRows,
        });
        const sfxPlan = buildSfxAnchorPlan({
          scriptBlocks: sourceBlocks,
          totalDurationSeconds: timelineContext.totalDurationSeconds,
          minSpacingSeconds: 25,
          srtRows,
        });

        const srtToMinSec = (t: string): string => {
          if (!t) return '';
          const parts = t.replace(',', '.').trim().split(':');
          if (parts.length === 3) {
            const h = parseInt(parts[0], 10);
            const m = parseInt(parts[1], 10) + h * 60;
            const s = Math.floor(parseFloat(parts[2]));
            return `[${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}]`;
          }
          return t;
        };

        const hfAnchors = (srtRows || [])
          .filter((row: any) => row.asset === 'hyperframe')
          .map((row: any) => ({
            timestamp: srtToMinSec(row.startTime || ''),
            texto: row.texto || '',
          }));

        const projectContext = {
          projectName: activeProject?.name || activeProject?.project_name || '',
          puc: activeProject?.puc || activeProject?.puc_promise || '',
          persona: activeProject?.persona || activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || '',
          soundtrack: activeProject?.editing_sop?.soundtrack || activeProject?.editing_sop?.trilha || '',
          channelLanguage: activeProject?.persona_matrix?.channel_language || 'Português',
        };

        const prompt = buildUserPrompt({
          approvedTheme,
          approvedBriefing,
          scriptBlocks: sourceBlocks,
          chapterAnchors: seoChapterPlan.anchors,
          hfAnchors,
          timelineSource: timelineContext.source,
          projectContext,
          sfxPlan,
          titleCountHint: 5,
          titleStructures,
        });

        data = engine === 'gemini'
          ? await directGeneratePostScriptGemini({ apiKey, model, prompt, channelLanguage: projectContext.channelLanguage })
          : await directGeneratePostScriptOpenAI({ apiKey, model, prompt, channelLanguage: projectContext.channelLanguage });
      } else {
        // Server fallback calling
        const response = await fetch('/api/post-script-package', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            engine,
            model,
            apiKeyOverwrite: apiKey,
            projectConfig: activeProject?.ai_engine_rules,
            approvedTheme,
            approvedBriefing,
            scriptBlocks: sourceBlocks,
            srtRows,
            titleStructures,
            projectContext: {
              projectName: activeProject?.name || activeProject?.project_name || '',
              puc: activeProject?.puc || activeProject?.puc_promise || '',
              persona: activeProject?.persona || activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || '',
              soundtrack: activeProject?.editing_sop?.soundtrack || activeProject?.editing_sop?.trilha || '',
              channelLanguage: activeProject?.persona_matrix?.channel_language || 'Português',
            },
          }),
        });

        data = await response.json();
        if (!response.ok) {
          throw new Error(resolveErrorMessage(data?.error, 'Falha ao gerar o pacote pos-roteiro.'));
        }
      }

      const channelLanguage = activeProject?.persona_matrix?.channel_language || 'Português';
      const nextPackage = sanitizePostScriptPackage(data, fallbackSeoPlan.anchors, timelineContext.source, channelLanguage);

      // ── Diagnóstico: o que a IA realmente devolveu? ──────────────────────────
      const aiCtx: any[] = nextPackage.hfContextTitles ?? [];
      console.log('[HF] hfContextTitles da IA:', JSON.stringify(aiCtx, null, 2));
      if (_isPipelineMode.current) {
        setSrtPipelineStatus(`Etapa 3: Pacote pós-roteiro ✓ — IA devolveu ${aiCtx.length} hfContextTitles (esperado: ${hfCount})`);
      }

      // ── Shuffle dos templates com seed do tema (Opção A) ─────────────────────
      // Cada tema gera uma ordem única mas reproduzível dos 10 templates.
      // Mesmo tema re-executado → mesma ordem. Tema diferente → ordem diferente.
      const HF_ALL_TEMPLATES = [
        'hf_focus', 'hf_face_bottom', 'hf_vertical', 'hf_double', 'hf_break',
        'hf_documentary', 'hf_floating', 'hf_face_top', 'hf_dynamic', 'hf_holo',
      ];
      const themeSeed = (approvedTheme || 'default')
        .split('').reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0);
      const seededShuffle = (arr: string[], seed: number): string[] => {
        const copy = [...arr];
        let s = seed;
        for (let i = copy.length - 1; i > 0; i--) {
          s = ((s * 1664525 + 1013904223) & 0xffffffff) >>> 0;
          const j = s % (i + 1);
          [copy[i], copy[j]] = [copy[j], copy[i]];
        }
        return copy;
      };
      const hfTemplateOrder = seededShuffle(HF_ALL_TEMPLATES, themeSeed);
      console.log('[HF] ordem dos templates para este tema:', hfTemplateOrder);

      const hfSrtRows = (srtRows as any[]).filter((r: any) => r.asset === 'hyperframe');
      const guaranteed = hfSrtRows.map((row: any, i: number) => {
        const ai = aiCtx[i] ?? {};
        return {
          timestamp:   ai.timestamp || row.startTime || '',
          visualState: hfTemplateOrder[i % hfTemplateOrder.length],
          headline:    ai.headline  || 'Destaque',  // placeholder neutro se IA não retornar
          subtitle:    ai.subtitle  || '',
          metrics:     ai.metrics   || '—',
          bgPrompt:    ai.bgPrompt  || '',
        };
      });
      const enrichedPackage = guaranteed.length > 0
        ? { ...nextPackage, hfContextTitles: guaranteed }
        : nextPackage;

      setPostScriptPackage(enrichedPackage);
      _postScriptResultRef.current = enrichedPackage;

      setTitleValidations(null);
      persistExecutionSnapshotLocally({
        postScriptPackage: enrichedPackage,
        scriptStage,
      });
      void syncApprovedThemeSnapshot({
        postScriptPackage: enrichedPackage,
        scriptStage,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar o pacote pos-roteiro.', error);
      });

      if (!_isPipelineMode.current) alert('Pacote pos-roteiro gerado e salvo nesta execucao.');
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao gerar pacote pos-roteiro.', error);
      if (_isPipelineMode.current) throw error;
      alert(`Erro ao gerar pacote pos-roteiro: ${error?.message || error}`);
    } finally {
      setIsGeneratingPostScriptPackage(false);
    }
  };

  // ─── HF Background Prompts (extraído do inline onClick para uso no pipeline) ─
  const generateHfBgPromptsInternal = async (pipelineOverride?: any): Promise<Array<{rowNumber: number; prompt: string}> | null> => {
    const pipeline = pipelineOverride ?? externalSrtPipeline;
    if (!pipeline) return null;
    const hfRows = (pipeline.rows ?? []).filter((r: any) => normalizeAssetType(r.asset) === 'hyperframe');
    if (!hfRows.length) return null;
    setIsGeneratingHfBg(true);
    setHfBgPrompts(null);
    try {
      const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
      const model  = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-4.1';
      const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
      const res = await fetch('/api/hf-bg-prompts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine, model, apiKeyOverwrite: apiKey,
          theme: approvedTheme || externalSrtFileName || 'video',
          hfRows: hfRows.map((r: any) => ({
            rowNumber: r.rowNumber,
            startTime: r.startTime,
            texto: r.texto,
            visualState: postScriptPackage?.hfContextTitles?.find((c: any) => {
              if (!c?.timestamp) return false;
              const clean = String(c.timestamp).replace(/[\[\]]/g, '');
              const parts = clean.split(':').map(Number);
              const cSec = parts.length === 2 ? parts[0]*60+parts[1] : parts[0]*3600+parts[1]*60+(parts[2]||0);
              const [rh, rm, rs] = r.startTime.split(':');
              const rSec = Number(rh)*3600 + Number(rm)*60 + Number((rs||'0').split(',')[0]);
              return Math.abs(cSec - rSec) <= 12;
            })?.visualState || 'hf_focus',
          })),
        }),
      });
      const data = await res.json();
      if (!res.ok || data?.error) throw new Error(resolveErrorMessage(data?.error, `Erro ${res.status}`));
      if (!data?.prompts?.length) throw new Error('IA retornou lista de prompts vazia.');
      setHfBgPrompts(data.prompts);
      try { localStorage.setItem(`yt_hf_bg_${executionStorageKey}`, JSON.stringify(data.prompts)); } catch { /* ignore */ }
      persistExecutionSnapshotLocally({ hfBgPrompts: data.prompts });
      return data.prompts;
    } catch (err: any) {
      setHfBgPrompts([{ rowNumber: -1, prompt: err?.message || 'Falha desconhecida' }]);
      if (_isPipelineMode.current) throw err;
      return null;
    } finally {
      setIsGeneratingHfBg(false);
    }
  };

  // ─── Pipeline Orquestrado (botão único) ─────────────────────────────────────
  const PIPELINE_STEP_LABELS: Record<string, string> = {
    srt:        'Etapa 1 — SRT → Assets',
    hf:         'Etapa 2 — Fundos HF',
    postscript: 'Etapa 3 — Pacote Pós-Roteiro',
    bats:       'Etapa 4 — Render + BATs',
    done:       'Concluído!',
  };

  // ─── Reset de Resultados (mantém .srt e roteiro, limpa outputs) ──────────────
  const resetPipelineResults = () => {
    setExternalSrtPipeline(null);
    setPostScriptPackage(null);
    setHfBgPrompts(null);
    setExternalSrtObserver(buildInitialSrtObserver());
    setSrtPipelineStatus('');
    setPipelineCurrentStep(null);
    _pipelineResultRef.current   = null;
    _postScriptResultRef.current = null;
    // Remove dados processados do snapshot local (mantém .srt e roteiro)
    try {
      if (executionStorageKey) {
        const raw = localStorage.getItem(executionStorageKey);
        if (raw) {
          const snap = JSON.parse(raw);
          const cleaned = {
            ...snap,
            externalSrtPipeline:  null,
            postScriptPackage:    null,
            externalSrtObserver:  buildInitialSrtObserver(),
            hfBgPrompts:          null,
          };
          localStorage.setItem(executionStorageKey, JSON.stringify(cleaned));
        }
        // Remove HF bg prompts do storage dedicado
        const hfKey = `yt_hf_bg_${executionStorageKey}`;
        localStorage.removeItem(hfKey);
      }
    } catch { /* ignore */ }
  };

  const _pipelineStepRef = useRef<string>('?');

  const runFullPipeline = async () => {
    if (!canProcessPostScriptPackage) {
      alert('O pipeline completo requer o roteiro.\n\nCarregue o arquivo .txt do roteiro ou finalize o roteiro no app antes de continuar.');
      return;
    }
    if (!externalSrtText.trim()) { alert('Anexe um arquivo .srt antes de iniciar o pipeline.'); return; }
    if (videoFormat !== 'faceless' && videoCharacterMode === 'custom' && !videoCharacterCustom.trim()) {
      alert('Descreva o personagem personalizado antes de iniciar o pipeline.');
      return;
    }
    setIsPipelineRunning(true);
    _isPipelineMode.current   = true;
    _pipelineResultRef.current   = null;
    _postScriptResultRef.current = null;
    _pipelineStepRef.current = 'srt';
    setPipelineWarnings([]);
    try {
      setPipelineCurrentStep('srt');
      try {
        await processAttachedSrtAssets();
      } catch (err: any) {
        throw new Error(`[Etapa 1 — SRT] ${err?.message || err}`);
      }
      if (!_pipelineResultRef.current) throw new Error('[Etapa 1 — SRT] Não retornou resultado. Verifique o arquivo .srt.');

      // ── Auto-retry de prompts incompletos (até 2 tentativas) ─────────────────
      let fallbackCount = (_pipelineResultRef.current.rows ?? []).filter((r: any) => r.isFallback).length;
      if (fallbackCount > 0) {
        for (let attempt = 1; attempt <= 2 && fallbackCount > 0; attempt++) {
          setSrtPipelineStatus(`🔄 Regenerando ${fallbackCount} prompt(s) incompleto(s) — tentativa ${attempt}/2...`);
          try {
            fallbackCount = await regenerateFallbacksForPipeline();
          } catch (retryErr: any) {
            console.warn('[Pipeline] Falha ao regenerar fallbacks:', retryErr);
            break; // Não bloqueia — continua o pipeline
          }
        }
        if (fallbackCount > 0) {
          const remaining = (_pipelineResultRef.current.rows ?? [])
            .filter((r: any) => r.isFallback)
            .map((r: any) => `Linha ${r.rowNumber} (${r.startTime.slice(0,8)}): ${r.texto.slice(0, 40)}...`);
          setPipelineWarnings(remaining);
          setSrtPipelineStatus(`⚠️ ${fallbackCount} prompt(s) permaneceram incompletos após 2 tentativas. Pipeline continua.`);
        }
      }

      _pipelineStepRef.current = 'hf';
      setPipelineCurrentStep('hf');
      const hfCount = (_pipelineResultRef.current.rows ?? [])
        .filter((r: any) => normalizeAssetType(r.asset) === 'hyperframe').length;
      if (hfCount > 0 && videoFormat !== 'faceless') {
        try {
          await generateHfBgPromptsInternal(_pipelineResultRef.current);
        } catch (err: any) {
          throw new Error(`[Etapa 2 — Fundos HF] ${err?.message || err}`);
        }
      }

      _pipelineStepRef.current = 'postscript';
      setPipelineCurrentStep('postscript');
      _postScriptResultRef.current = null;
      try {
        await generatePostScriptPackage();
      } catch (err: any) {
        throw new Error(`[Etapa 3 — Pós-Roteiro] ${err?.message || err}`);
      }
      if (!_postScriptResultRef.current) throw new Error('[Etapa 3 — Pós-Roteiro] Falhou. Verifique o roteiro e a API key.');

      _pipelineStepRef.current = 'bats';
      setPipelineCurrentStep('bats');
      try {
        await renderTextAssetsFromPipeline();
      } catch (err: any) {
        throw new Error(`[Etapa 4 — BATs] ${err?.message || err}`);
      }

      _pipelineStepRef.current = 'done';
      setPipelineCurrentStep('done');
      setSrtPipelineStatus('✅ Pipeline completo concluído com sucesso. BATs e CSV prontos.');
    } catch (err: any) {
      console.error('[Pipeline Completo]', err);
      alert(`Pipeline interrompido:\n\n${err?.message || 'Erro desconhecido'}`);
    } finally {
      _isPipelineMode.current = false;
      setIsPipelineRunning(false);
      setTimeout(() => setPipelineCurrentStep(null), 4000);
    }
  };

  const validateViralTitles = async () => {
    if (!postScriptPackage?.titles?.length || !approvedTheme) return;

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
    if (!apiKey) {
      alert('Configure sua chave de API em Ajustes Globais para validar os títulos.');
      return;
    }

    // Only validate null slots (unscored). If all are scored, nothing to do.
    const indicesToValidate: number[] = titleValidations
      ? titleValidations.map((v, i) => (v === null ? i : -1)).filter((i) => i >= 0)
      : postScriptPackage.titles.map((_, i) => i); // all when no validation exists yet

    if (indicesToValidate.length === 0) return;

    const titlesToValidate = indicesToValidate.map((i) => postScriptPackage.titles[i]);

    setIsValidatingTitles(true);
    try {
      const response = await fetch('/api/post-script-titles', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          apiKeyOverwrite: apiKey,
          approvedTheme,
          titles: titlesToValidate,
          projectContext: {
            channelLanguage: activeProject?.persona_matrix?.channel_language || 'Português',
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao validar os títulos.'));
      }

      if (Array.isArray(data?.results)) {
        // Merge results back into the correct positions
        const nextValidations: (TitleValidationResult | null)[] = titleValidations
          ? [...titleValidations]
          : postScriptPackage.titles.map(() => null);
        indicesToValidate.forEach((titleIndex, resultIndex) => {
          nextValidations[titleIndex] = data.results[resultIndex] ?? null;
        });
        setTitleValidations(nextValidations);
      }
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao validar títulos.', error);
      alert(`Erro ao validar títulos: ${error?.message || error}`);
    } finally {
      setIsValidatingTitles(false);
    }
  };

  const regenerateViralTitles = async () => {
    if (!approvedTheme || !canProcessPostScriptPackage || !postScriptPackage) return;

    const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
    const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
    const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
    if (!apiKey) {
      alert('Configure sua chave de API em Ajustes Globais para regerar os títulos.');
      return;
    }

    // Determine which slots need replacement: those with explicit weak verdict
    // (null = unscored/new, we don't auto-regenerate those)
    const weakIndices: number[] = titleValidations
      ? titleValidations
          .map((v, i) => (v !== null && v.verdict !== 'Aprovado' ? i : -1))
          .filter((i) => i >= 0)
      : postScriptPackage.titles.map((_, i) => i); // no validation → replace all

    if (weakIndices.length === 0) {
      alert('Todos os títulos já estão aprovados! Não há nada para regerar.');
      return;
    }

    const titleCountHint = weakIndices.length;

    const sourceBlocks = resolvePostScriptSourceBlocks();
    if (!sourceBlocks.length) return;

    const srtRows = externalSrtPipeline?.rows || (externalSrtText.trim() ? parseSrtToRows(externalSrtText, forceAllAsVideo) : []);
    const timelineContext = buildPostScriptTimelineContext({
      scriptBlocks: sourceBlocks,
      estimatedDuration: approvedBriefing?.estimatedDuration,
      srtRows,
    });
    const fallbackSeoPlan = buildSeoChapterPlan({
      scriptBlocks: sourceBlocks,
      totalDurationSeconds: timelineContext.totalDurationSeconds,
    });

    let titleStructures: any[] = [];
    if (typeof window !== 'undefined' && activeProject?.id) {
      const localData = localStorage.getItem(`ws_narrative_${activeProject.id}`);
      if (localData) {
        try {
          const parsed = JSON.parse(localData);
          if (Array.isArray(parsed)) {
            titleStructures = parsed
              .filter((c: any) => c.type === 'Title Structure')
              .map((c: any) => ({
                id: c.id,
                name: c.name,
                content_pattern: c.content_pattern || c.description || '',
              }));
          }
        } catch (e) {
          console.warn('[ScriptEngine] Erro ao ler titleStructures do localStorage:', e);
        }
      }
    }

    setIsRegeneratingTitles(true);
    // Preserve approved scores; null out the slots being replaced so they show as unscored
    const partialValidations: (TitleValidationResult | null)[] | null = titleValidations
      ? titleValidations.map((v, i) => (weakIndices.includes(i) ? null : v))
      : null;
    setTitleValidations(partialValidations);
    try {
      const response = await fetch('/api/post-script-package', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          engine,
          model,
          apiKeyOverwrite: apiKey,
          projectConfig: activeProject?.ai_engine_rules,
          approvedTheme,
          approvedBriefing,
          scriptBlocks: sourceBlocks,
          srtRows,
          titleCountHint,
          titleStructures,
          projectContext: {
            projectName: activeProject?.name || activeProject?.project_name || '',
            puc: activeProject?.puc || activeProject?.puc_promise || '',
            persona: activeProject?.persona || activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || '',
            soundtrack: activeProject?.editing_sop?.soundtrack || activeProject?.editing_sop?.trilha || '',
            channelLanguage: activeProject?.persona_matrix?.channel_language || 'Português',
          },
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(resolveErrorMessage(data?.error, 'Falha ao regerar os títulos.'));
      }

      const channelLanguage = activeProject?.persona_matrix?.channel_language || 'Português';
      const newPackage = sanitizePostScriptPackage(data, fallbackSeoPlan.anchors, timelineContext.source, channelLanguage);

      // Smart merge: keep approved titles, insert new ones at weak positions
      const updatedTitles = [...postScriptPackage.titles];
      weakIndices.forEach((slotIndex, newTitleIndex) => {
        if (newPackage.titles[newTitleIndex] !== undefined) {
          updatedTitles[slotIndex] = newPackage.titles[newTitleIndex];
        }
      });

      const mergedPackage: PostScriptPackage = {
        ...postScriptPackage,
        titles: updatedTitles,
        generatedAt: new Date().toISOString(),
      };
      setPostScriptPackage(mergedPackage);
      persistExecutionSnapshotLocally({
        postScriptPackage: mergedPackage,
        scriptStage,
      });
      void syncApprovedThemeSnapshot({
        postScriptPackage: mergedPackage,
        scriptStage,
      }).catch((error) => {
        console.warn('[ScriptEngine] Falha ao sincronizar títulos regerados.', error);
      });
    } catch (error: any) {
      console.warn('[ScriptEngine] Falha ao regerar títulos.', error);
      alert(`Erro ao regerar títulos: ${error?.message || error}`);
    } finally {
      setIsRegeneratingTitles(false);
    }
  };

  const buildSfxEnrichedCsvContent = (baseCsvContent: string, sfxTimelineTxt?: string | null): string => {
    if (!sfxTimelineTxt?.trim()) return baseCsvContent;

    const sfxEntries = parseSfxTimelineEntries(sfxTimelineTxt);
    if (!sfxEntries.length) return baseCsvContent;

    // Get SRT rows for snapping timestamps
    const srtRows = externalSrtPipeline?.rows || [];

    // Convert AI timestamp to seconds for nearest-match
    const toSec = (ts: string): number => {
      const clean = String(ts || '').replace(',', '.');
      const parts = clean.split(':').map(Number);
      if (parts.length === 2) return parts[0] * 60 + parts[1];
      return parts[0] * 3600 + parts[1] * 60 + (parts[2] || 0);
    };

    // Snap to nearest SRT row start time
    const snapTs = (aiTs: string): string => {
      if (!srtRows.length) {
        const parts = aiTs.split(':').map((p: string) => p.padStart(2, '0'));
        const formatted = parts.length === 2 ? `00:${parts[0]}:${parts[1]}` : `${parts[0]}:${parts[1]}:${parts[2] || '00'}`;
        return `${formatted},000`;
      }
      const aiSec = toSec(aiTs);
      let best = srtRows[0];
      let bestDiff = Math.abs(toSec(best.startTime) - aiSec);
      for (const row of srtRows) {
        const diff = Math.abs(toSec(row.startTime) - aiSec);
        if (diff < bestDiff) { bestDiff = diff; best = row; }
      }
      return best.startTime;
    };

    const csvEsc = (v: string) => {
      const s = String(v ?? '');
      return /[,"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };

    const sfxLines = sfxEntries.map((entry) => {
      const exactTs = snapTs(entry.timestamp);
      const promptSummary = [entry.effect, entry.purpose, entry.notes].filter((x) => x && x !== '—').join(' | ');
      return [
        csvEsc(exactTs),
        csvEsc(exactTs),
        csvEsc(entry.excerpt !== '—' ? entry.excerpt : ''),
        'sfx',
        csvEsc(promptSummary),
        '',
      ].join(',');
    });

    const base = baseCsvContent.trimEnd();
    return `${base}\n${sfxLines.join('\n')}`;
  };

  const parseSfxTimelineEntries = (value: string) => {
    const normalized = String(value || '').replace(/\n/g, '\n').trim();
    if (!normalized) return [];

    const blockRegex = /(?:^|\n)\s*(?:\*\*)?\[?(\d{2}:\d{2}(?::\d{2})?)\]?(?:\*\*)?[\s\S]*?(?=(?:\n\s*(?:\*\*)?\[?\d{2}:\d{2}(?::\d{2})?\]?(?:\*\*)?)|$)/g;
    const matches = normalized.match(blockRegex);
    if (!matches) return [];

    const entries = matches.map((match) => match.trim()).filter(Boolean);

    return entries.map((entry, index) => {
      const tsMatch = entry.match(/(?:\*\*)?\[?(\d{2}:\d{2}(?::\d{2})?)\]?(?:\*\*)?/);
      const timestamp = tsMatch ? tsMatch[1] : '';

      const lines = entry.split('\n').map((line) => line.trim()).filter(Boolean);
      
      const effectMatch = entry.match(/EFEITO:\s*([^\n]+)/i);
      const purposeMatch = entry.match(/FUNC(?:A|Ã)O:\s*([^\n]+)/i);
      const excerptMatch = entry.match(/TRECHO:\s*([^\n]+)/i);
      const notesMatch = entry.match(/OBS:\s*([^\n]+)/i);

      const effect = effectMatch ? effectMatch[1].trim().replace(/\*\*|["']/g, '') : '—';
      const purpose = purposeMatch ? purposeMatch[1].trim().replace(/\*\*|["']/g, '') : '—';
      const excerpt = excerptMatch ? excerptMatch[1].trim().replace(/\*\*|["']/g, '') : '—';
      const notes = notesMatch ? notesMatch[1].trim().replace(/\*\*|["']/g, '') : '—';

      return {
        id: `${timestamp}-${index}`,
        timestamp,
        effect,
        purpose,
        excerpt,
        notes,
      };
    });
  };

  const parseSeoDescriptionSections = (value: string) => {
    const normalized = String(value || '').replace(/\n/g, '\n').trim();
    if (!normalized) {
      return {
        intro: '',
        chapters: [] as Array<{ timestamp: string; label: string }>,
        notice: '',
      };
    }

    const lines = normalized.split('\n').map((line) => line.trimEnd());
    const timestampPattern = /^\d{2}:\d{2}(?::\d{2})?\s*[—-]\s+/;
    const firstTimestampIndex = lines.findIndex((line) => timestampPattern.test(line.trim()));
    const noticeIndex = lines.findIndex((line) => line.trim().toUpperCase().startsWith('AVISO DE IA:'));

    const introLines = lines.slice(0, firstTimestampIndex >= 0 ? firstTimestampIndex : noticeIndex >= 0 ? noticeIndex : lines.length);
    const chapterLines =
      firstTimestampIndex >= 0
        ? lines.slice(firstTimestampIndex, noticeIndex >= 0 ? noticeIndex : lines.length).filter((line) => timestampPattern.test(line.trim()))
        : [];
    const noticeLines = noticeIndex >= 0 ? lines.slice(noticeIndex) : [];

    return {
      intro: introLines.join('\n').trim(),
      chapters: chapterLines.map((line) => {
        const match = line.trim().match(/^(\d{2}:\d{2}(?::\d{2})?)\s*[—-]\s*(.+)$/);
        return {
          timestamp: match?.[1] || '',
          label: match?.[2] || line.trim(),
        };
      }),
      notice: noticeLines.join('\n').trim(),
    };
  };

  const seoDescriptionSections = parseSeoDescriptionSections(postScriptPackage?.seoDescription || '');
  const sfxTimelinePreview = parseSfxTimelineEntries(postScriptPackage?.sfxTimelineTxt || '');
  const manualPublishParts = getManualPublishDateParts(manualPublishDate);
  const pendingManualPublishValue = composeManualPublishDate(manualPublishDraftDate, manualPublishDraftTime);
  const hasPendingManualPublishChange = pendingManualPublishValue !== manualPublishDate;
  const activeStageBlockId = scriptBlocks.some((block) => block.id === expandedStageId)
    ? expandedStageId
    : scriptBlocks[0]?.id || null;
  const getBlockGenerationState = (index: number) =>
    isGeneratingScript && generationProgress
      ? index < generationProgress.completedCount
        ? 'completed'
        : index === generationProgress.currentIndex
          ? 'generating'
          : 'pending'
      : null;

  const getStylePrompts = (
    styleName: string,
    theme: string,
    thumbnailTextPtBr: string,
    accent: string,
    layoutHint: string,
    environmentCue: string,
    heroExpression: string,
    symbolicLine: string,
    puc: string
  ) => {
    switch (styleName) {
      case 'Neo-Minimalism':
        return {
          noText: `Create a minimalist YouTube thumbnail in a Neo-Minimalism style, photorealistic, 16:9. Accent color ${accent}, ${layoutHint}. Show a single central object or visual subject related to "${theme}" with pure white background or extremely clean monochrome background, having at least 50% empty negative space. Maximum of 2 main colors, high contrast visual focus on the center, clean design, premium aesthetic, no watermarks, 4K.`,
          withText: `Create a minimalist YouTube thumbnail in a Neo-Minimalism style, photorealistic, 16:9. Accent color ${accent}, ${layoutHint}. Show a single central object or visual subject related to "${theme}" with pure white background or extremely clean monochrome background, having at least 50% empty negative space. Maximum of 2 main colors, high contrast visual focus on the center, clean design. Include a short, bold, clean headline of maximum 3 words in Brazilian Portuguese: "${thumbnailTextPtBr}". Keep the typography extremely clean, legible, premium, no watermarks, 4K.`
        };
      case 'Whiteboard':
        return {
          noText: `Create a YouTube thumbnail in a Whiteboard style, 16:9. Show handwritten diagrams, technical schemas, drawings, arrows, and technical annotations written in a real whiteboard about "${theme}", technical and educational, premium, authentic, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail in a Whiteboard style, 16:9. Show handwritten diagrams, technical schemas, drawings, arrows, and technical annotations written in a real whiteboard about "${theme}". Include a short, bold handwritten headline of maximum 4 words in Brazilian Portuguese: "${thumbnailTextPtBr}". Keep the style authentic and technical, premium, no watermark, 4K.`
        };
      case 'Interface Hijacking':
        return {
          noText: `Create a YouTube thumbnail mimicking a recognizable website or application interface card (such as a verified tweet, Amazon review cards, Reddit listing, or app store card) related to "${theme}". Replicate the visual style, spacing, fonts, and clean layout of the platform faithfully, high contrast, clean composition, 16:9, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail mimicking a recognizable website or application interface card (such as a verified tweet, Amazon review cards, Reddit listing, or app store card) related to "${theme}". Replicate the visual style, spacing, fonts, and clean layout of the platform faithfully. Include a short, bold headline of maximum 5 words in Brazilian Portuguese: "${thumbnailTextPtBr}" as if it were a post or review. 16:9, no watermark, 4K.`
        };
      case 'Cinematic Text':
        return {
          noText: `Create a cinematic YouTube thumbnail in a film still style, photorealistic, 16:9. Show a cinematic frame with negative space related to "${theme}" in a ${environmentCue}, dramatic studio lighting, strong contrast, clean composition, premium tech senior aesthetic, no watermark, 4K.`,
          withText: `Create a cinematic YouTube thumbnail in a film still style, photorealistic, 16:9. Show a cinematic frame with negative space related to "${theme}" in a ${environmentCue}, dramatic studio lighting, strong contrast, clean composition. Include a short, bold headline of maximum 3 words in yellow text that lives inside the scene, interacting organically with the scene's ambient lighting and shadows: "${thumbnailTextPtBr}". Premium tech senior aesthetic, no watermark, 4K.`
        };
      case 'Warped Faces':
        return {
          noText: `Create a psychological YouTube thumbnail in a Warped Faces style, photorealistic, 16:9. Show a person with subtle, intentional digital distortion, double exposure or ghostly overlay related to "${theme}". High contrast, clean blend, representing dualism, identity crisis or a hard truth, no text, no watermark, 4K.`,
          withText: `Create a psychological YouTube thumbnail in a Warped Faces style, photorealistic, 16:9. Show a person with subtle, intentional digital distortion, double exposure or ghostly overlay related to "${theme}". High contrast, clean blend, representing dualism, identity crisis or a hard truth. Include a short, bold, clean text overlay of maximum 3 words in Brazilian Portuguese: "${thumbnailTextPtBr}". No watermark, 4K.`
        };
      case 'Rainbow Ranking':
        return {
          noText: `Create a YouTube thumbnail in a Rainbow Ranking style, 16:9. Show a comparison ranking of 3, 5, or 7 items related to "${theme}" side-by-side. Apply a distinct color gradient from red (worst/lowest) to blue (best/highest) across the items, creating a clear visual classification. High contrast, clean, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail in a Rainbow Ranking style, 16:9. Show a comparison ranking of 3, 5, or 7 items related to "${theme}" side-by-side. Apply a distinct color gradient from red (worst) to blue (best) across the items. Add a simple, bold ranking text/number label or a headline of maximum 3 words in Brazilian Portuguese: "${thumbnailTextPtBr}". No watermark, 4K.`
        };
      case 'Surround':
        return {
          noText: `Create a YouTube thumbnail in a Surround style, photorealistic, 16:9. Show the main creator or product in the absolute center, surrounded by an organized collection of elements, icons or objects related to "${theme}" arranged in a circle or neat grid. High contrast, clean composition, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail in a Surround style, photorealistic, 16:9. Show the main creator or product in the absolute center, surrounded by an organized collection of elements, icons or objects related to "${theme}" arranged in a circle or neat grid. Include a short, bold headline of maximum 4 words in Brazilian Portuguese: "${thumbnailTextPtBr}". No watermark, 4K.`
        };
      case 'Collection Maximalism':
        return {
          noText: `Create a YouTube thumbnail in a Collection Maximalism style, photorealistic, 16:9. The entire frame is filled with a meticulously organized and detailed collection of objects, tools, or items related to "${theme}". The collection itself is the star. High contrast, premium layout, no watermarks, 4K.`,
          withText: `Create a YouTube thumbnail in a Collection Maximalism style, photorealistic, 16:9. The entire frame is filled with a meticulously organized and detailed collection of objects, tools, or items related to "${theme}". Include a short, bold headline of maximum 3 words in Brazilian Portuguese: "${thumbnailTextPtBr}". No watermarks, 4K.`
        };
      case 'Encyclopedia':
        return {
          noText: `Create a YouTube thumbnail in an Encyclopedia Grid style, 16:9. Replicate a clean grid of simple, consistent flat icons (all circles or all squares) related to "${theme}". Neutral background, high contrast, clean educational explainer layout, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail in an Encyclopedia Grid style, 16:9. Replicate a clean grid of simple, consistent flat icons (all circles or all squares) related to "${theme}". Include 1 or 2 words label under each icon in Brazilian Portuguese, and a short overall title of maximum 3 words: "${thumbnailTextPtBr}". No watermark, 4K.`
        };
      case 'Candid Fakes':
        return {
          noText: `Create a YouTube thumbnail in a Candid Fakes style, photorealistic, 16:9. Show a candid-looking scene that looks spontaneously captured at the perfect moment, but is slightly impossible or intriguing, related to "${theme}". No text, no arrows, no red circles. High realism, narrative-driven frame, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail in a Candid Fakes style, photorealistic, 16:9. Show a candid-looking scene that looks spontaneously captured at the perfect moment, but is slightly impossible or intriguing, related to "${theme}". Include a short, bold headline of maximum 3 words in Brazilian Portuguese: "${thumbnailTextPtBr}". No watermark, 4K.`
        };
      case 'Anti-Thumbnail':
        return {
          noText: `Create a YouTube thumbnail in an Anti-Thumbnail style, photorealistic, 16:9. Clean dark minimalist background, a single serious person looking directly into the camera making eye contact. Zero decorations, dramatic, dark, premium tech senior aesthetic, no watermark, 4K.`,
          withText: `Create a YouTube thumbnail in an Anti-Thumbnail style, photorealistic, 16:9. Clean dark minimalist background, a single serious person looking directly into the camera making eye contact. Include a simple overlay indicating a specific, non-rounded time limit (such as "54s" or "59s") and a simple text of maximum 3 words in Brazilian Portuguese: "${thumbnailTextPtBr}". No watermark, 4K.`
        };
      default:
        return null;
    }
  };

  const projectPillars = activeProject?.playlists?.tactical_journey || [];
  const projectPersona = activeProject?.persona_matrix || {};
  const projectSop = activeProject?.editing_sop || {};
  const projectNarrativeSummary = {
    puC: activeProject?.puc || activeProject?.puc_promise || 'Sem PUC cadastrada',
    persona: projectPersona.demographics || activeProject?.target_persona?.audience || 'Persona nao cadastrada',
    pain: projectPersona.pain_alignment || activeProject?.target_persona?.pain_point || 'Dor central nao cadastrada',
    metaphors: (activeProject?.metaphor_library || activeProject?.ai_engine_rules?.metaphors?.join(', ') || '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
    pillars: projectPillars,
    cutRhythm: projectSop.cut_rhythm || '3s',
    zoomStyle: projectSop.zoom_style || 'Dynamic',
    soundtrack: projectSop.soundtrack || 'Reflexive',
    thumbStyle: activeProject?.thumb_strategy?.style || activeProject?.thumb_strategy?.layout || 'Nao configurado',
  };
  const srtArtifactStem =
    approvedBriefing?.title
    || approvedTheme
    || String(externalSrtFileName || '').replace(/\.[^.]+$/, '')
    || 'assets-srt';

  const generateThumbnailDirective = (forcedStyle?: string) => {
    if (!activeProject) return;
    const { theme, variation } = getCommandContext();
    if (!theme) return alert('Selecione/compile um tema antes de gerar a diretriz.');

    const styleToUse = forcedStyle || selectedThumbnailStyle || 'Default';
    const themeLower = String(theme || '').toLowerCase();
    const persona = activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience || 'o publico-alvo';
    const puc = activeProject?.puc || activeProject?.puc_promise || 'a transformacao central do projeto';
    const layouts = activeProject?.thumb_strategy?.layouts || (activeProject?.thumb_strategy?.layout ? [activeProject.thumb_strategy.layout] : []);
    const layoutHint = Array.isArray(layouts) && layouts.length > 0 ? layouts.join(' + ') : 'layout de alto contraste';
    const accent = activeProject?.accent_color || '#9BB0A5';

    const viralTitle = (() => {
      const raw = String(theme || '').replace(/["'“”‘’]/g, '').trim();
      if (!raw) return 'Estado Zen';
      const candidate = raw.split(':').pop()?.trim() || raw;
      return candidate
        .replace(/^pare de\s+/i, '')
        .replace(/^como\s+/i, '')
        .replace(/^o erro de\s+/i, '')
        .replace(/^por que\s+/i, '')
        .replace(/^a\s+/i, '')
        .split(/\s+/)
        .filter(Boolean)
        .slice(0, 5)
        .join(' ');
    })();

    const thumbnailTextPtBr = viralTitle.toUpperCase();
    const symbolicElements = [
      themeLower.includes('divida') || themeLower.includes('debito') ? 'painel financeiro vermelho' : null,
      themeLower.includes('crash') || themeLower.includes('pane') ? 'tela com alerta critico' : null,
      themeLower.includes('burnout') || themeLower.includes('sobrecarga') ? 'cpu superaquecida' : null,
      themeLower.includes('memoria') || themeLower.includes('foco') ? 'abas abertas e notificacoes vazando' : null,
      themeLower.includes('review') || themeLower.includes('ego') ? 'markup de correcao sobre o rosto' : null,
      themeLower.includes('kernel') ? 'nucleo luminoso protegido no peito' : null,
      themeLower.includes('prioridade') || themeLower.includes('sla') ? 'fila visual de tarefas criticas' : null,
      themeLower.includes('sono') ? 'janela noturna azul profunda' : null,
      themeLower.includes('rotina') || themeLower.includes('refactor') ? 'blocos modulares reorganizados' : null,
    ].filter(Boolean) as string[];

    const heroExpression =
      themeLower.includes('crash') || themeLower.includes('burnout') || themeLower.includes('sobrecarga')
        ? 'expressao de alerta contido, como quem percebe que chegou ao limite'
        : themeLower.includes('review') || themeLower.includes('ego')
          ? 'expressao de confronto lucido, orgulho sendo quebrado por clareza'
          : 'expressao de descoberta e controle recuperado';

    const environmentCue =
      themeLower.includes('memoria') || themeLower.includes('foco')
        ? 'workspace noturno com monitores, tabs e notificacoes pairando ao redor'
        : themeLower.includes('divida') || themeLower.includes('debito')
          ? 'ambiente premium de escritorio com overlays de custo, juros e desgaste'
          : 'set cinematografico escuro com interface tecnologica sutil ao fundo';

    const visualTags = [
      themeLower.includes('divida') || themeLower.includes('debito') ? 'divida biologica' : null,
      themeLower.includes('crash') || themeLower.includes('pane') ? 'colapso mental' : null,
      themeLower.includes('burnout') || themeLower.includes('sobrecarga') ? 'burnout' : null,
      themeLower.includes('memoria') || themeLower.includes('foco') ? 'foco profundo' : null,
      themeLower.includes('review') || themeLower.includes('ego') ? 'maturidade senior' : null,
      themeLower.includes('kernel') ? 'nucleo interno' : null,
      themeLower.includes('prioridade') || themeLower.includes('sla') ? 'priorizacao' : null,
      'alta performance',
      'carreira sustentavel',
      'arquitetura pessoal',
      'dev senior',
    ].filter(Boolean) as string[];

    const tags = Array.from(new Set(visualTags)).slice(0, 8);
    const symbolicLine = symbolicElements.length > 0
      ? symbolicElements.join(', ')
      : 'alertas sutis de sistema, contraste entre controle e desgaste, detalhes tecnicos que traduzem alta pressao';

    const customStylePrompts = getStylePrompts(styleToUse, theme, thumbnailTextPtBr, accent, layoutHint, environmentCue, heroExpression, symbolicLine, puc);

    const directive = {
      visualConcept: customStylePrompts 
        ? `Estilo Visual: ${styleToUse}. Traduzir o tema em uma cena simbolica de tensao contra controle. Layout ${layoutHint}. Fundo escuro premium com acento ${accent}. Persona visual: ${persona}. Elementos-chave: ${symbolicLine}. Estrutura narrativa: ${variation}.`
        : `Traduzir o tema em uma cena simbolica de tensao contra controle. Layout ${layoutHint}. Fundo escuro premium com acento ${accent}. Persona visual: ${persona}. Elementos-chave: ${symbolicLine}. Estrutura narrativa: ${variation}.`,
      viralTitle,
      thumbnailPromptNoText: customStylePrompts?.noText || `Create a cinematic YouTube thumbnail, dark premium background, vivid accent color ${accent}, ${layoutHint}, photorealistic, 16:9. Show a senior tech professional in a ${environmentCue}, with ${heroExpression}. Add symbolic visual cues such as ${symbolicLine}. The image must communicate hidden cost, overload, recovery or regained control through symbolism, expression, lighting and composition, without adding any artificial headline, caption or phrase over the image. Do not render big title text, callout text or promotional wording. Only allow natural text that would already exist inside the scene, such as small interface labels on monitors, subtle dashboard readouts or ambient screen details. Use dramatic studio lighting, strong contrast, clean composition, one dominant focal point, subtle UI overlays, premium tech aesthetic, no watermark, 4K.`,
      thumbnailPromptWithPtBrText: customStylePrompts?.withText || `Create a cinematic YouTube thumbnail, dark premium background, vivid accent color ${accent}, ${layoutHint}, photorealistic, 16:9. Show a senior tech professional in a ${environmentCue}, with ${heroExpression}. Add symbolic visual cues such as ${symbolicLine}. Include a short, bold headline with a maximum of 5 words, and the headline must be written in Brazilian Portuguese only. Do not use English words in the headline. Make the typography clean, legible, premium and high contrast. Suggested headline direction: "${thumbnailTextPtBr}". The text must feel native for a Brazilian audience and should visually support this promise: "${puc}". Use dramatic studio lighting, strong contrast, clean composition, one dominant focal point, subtle UI overlays, premium tech aesthetic, no watermark, 4K.`,
      thumbnailTextPtBr,
      tags,
    };
    setThumbnailDirective(directive);
    setShowThumbnailPanel(true);
    requestAnimationFrame(() => {
      thumbnailPanelRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const handleDeploy = async () => {
    if (!activeProject) return;

    const { theme, variation } = getCommandContext();
    const editorialPillar = approvedBriefing?.editorialPillar
      || (() => {
        const rp = activeProject?.editorial_line?.pillars || activeProject?.editorial_pillars || [];
        const pl: string[] = (Array.isArray(rp) ? rp : [])
          .map((p: any) => typeof p === 'string' ? p : p?.name || p?.label || '')
          .filter(Boolean);
        return pl.length > 0 ? pl[Math.floor(Math.random() * pl.length)] : 'T1';
      })();

    // Collect narrative asset UUIDs ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚Â filter out mock/non-UUID IDs
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

    // ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ Composition Log DNA (ImutÃÆ’Ã†â€™Ãâ€ ââ‚¬â„¢ÃÆ’ââ‚¬Å¡Ãâ€šÃ‚Â¡vel) ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬
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

      alert(`DNA registrado.\n\nMotor: ${compositionLogPayload.llm_model_id}\nEstrutura: ${variation}\nTokens: ~${promptTokens}\nAssets: ${narrativeAssetIds.length} vinculados\n\nMetricas de performance podem ser inseridas manualmente no painel de Analytics.`);
    } catch (err) {
      console.error('[handleDeploy]', err);
    }
  };

  // ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ Assembler Approval Handler ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬
  const handleAssemblerApprove = (briefing: any, theme: string) => {
    setApprovedTheme(theme);
    setApprovedBriefing(briefing);
    if (briefing?.videoFormat) {
      setVideoFormat(briefing.videoFormat);
    }
    const newBlocks = buildScriptBlocksFromBriefing(briefing, theme);

    void saveManualThemeToBank(theme, briefing, {
      approvedTheme: theme,
      approvedBriefing: briefing,
      scriptBlocks: newBlocks,
      scriptStage: 'blueprint',
      assemblerActive: false,
      thumbnailDirective: null,
      showThumbnailPanel: false,
      thumbnailUrl: '',
      executionMode,
      externalScriptText: '',
      externalScriptFileName: '',
      externalSourceLabel: '',
      externalSrtText: '',
      externalSrtFileName: '',
      videoCharacterMode,
      videoCharacterCustom,
      manualPublishDate,
      externalSrtPipeline: null,
      externalSrtObserver: buildInitialSrtObserver(),
      postScriptPackage: null,
    });

    setScriptBlocks(newBlocks);
    setScriptStage('blueprint');
    setAssemblerActive(false);
    setExternalScriptText('');
    setExternalScriptFileName('');
    setExternalSourceLabel('');
    setExternalSrtText('');
    setExternalSrtFileName('');
    setExternalSrtPipeline(null);
    setExternalSrtObserver(buildInitialSrtObserver());
    setPostScriptPackage(null);
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

  const thumbnailDirectivePanel = showThumbnailPanel && thumbnailDirective ? (
    <div
      ref={thumbnailPanelRef}
      className="mx-6 xl:mx-8 mt-4 rounded-2xl border border-purple-500/20 bg-purple-500/5 p-5 xl:p-6 space-y-5 shadow-[0_0_30px_rgba(168,85,247,0.08)]"
    >
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-purple-300">Diretriz de Thumbnail</p>
          <p className="mt-1 text-[11px] text-white/50 leading-relaxed">Baseada no tema aprovado e nas camadas narrativas selecionadas.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-[9px] font-black uppercase text-white/40">Estilo:</span>
            <select
              value={selectedThumbnailStyle}
              onChange={(e) => {
                const nextStyle = e.target.value;
                setSelectedThumbnailStyle(nextStyle);
                persistExecutionSnapshotLocally({ selectedThumbnailStyle: nextStyle });
                generateThumbnailDirective(nextStyle);
              }}
              className="bg-midnight border border-white/10 rounded-lg px-2.5 py-1 text-[9px] uppercase font-black tracking-widest text-white outline-none focus:border-purple-500/40"
            >
              <option value="Default">Padrão</option>
              <option value="Neo-Minimalism">Neo-Minimalismo</option>
              <option value="Whiteboard">Quadro Branco</option>
              <option value="Interface Hijacking">Sequestro de Interface</option>
              <option value="Cinematic Text">Texto Cinemático</option>
              <option value="Warped Faces">Rostos Distorcidos</option>
              <option value="Rainbow Ranking">Ranking de Arco-Íris</option>
              <option value="Surround">Cercado</option>
              <option value="Collection Maximalism">Maximalismo de Coleção</option>
              <option value="Encyclopedia">Enciclopédia</option>
              <option value="Candid Fakes">Falsos Cândidos</option>
              <option value="Anti-Thumbnail">Anti-Miniatura</option>
            </select>
          </div>

          <button
            onClick={() => setIsMobilePreview(!isMobilePreview)}
            className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-widest transition-all ${
              isMobilePreview 
                ? 'bg-purple-500/20 border-purple-400 text-purple-200 shadow-[0_0_10px_rgba(168,85,247,0.2)]' 
                : 'bg-white/5 border-white/10 text-white/55 hover:border-white/20'
            }`}
            title="Simular tamanho de polegar no feed mobile (160px)"
          >
            Feed Mobile (160px)
          </button>
          
          <button onClick={() => setShowThumbnailPanel(false)} className="text-white/20 hover:text-white text-sm pl-2">x</button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        <div className="grid grid-cols-1 lg:grid-cols-[1.15fr_0.85fr] gap-4">
          <div className="space-y-3">
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-1">LEITURA VISUAL</span>
              <p className="text-sm font-black text-white leading-relaxed break-words">{thumbnailDirective.visualConcept}</p>
            </div>
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-1">TITULO VIRAL</span>
              <p className="text-[12px] font-black text-white leading-relaxed whitespace-pre-wrap break-words">{thumbnailDirective.viralTitle}</p>
            </div>
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-1">TEXTO PARA THUMBNAIL EM PT-BR</span>
              <p className="text-[12px] font-black tracking-[0.2em] text-blue-300 leading-relaxed whitespace-pre-wrap break-words">{thumbnailDirective.thumbnailTextPtBr}</p>
            </div>
          </div>

          <div className="space-y-3">
            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30">TAGS</span>
                <button
                  onClick={() => navigator.clipboard.writeText(thumbnailDirective.tags.join(', '))}
                  className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-white/5 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.15em] text-white/55 transition-all hover:border-white/20 hover:text-white"
                >
                  <Copy size={10} />
                  Copiar
                </button>
              </div>
              <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-3">
                <p className="text-[11px] text-purple-200/90 leading-relaxed break-words">
                  {thumbnailDirective.tags.join(', ')}
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-midnight/40 border border-white/5 p-4 flex flex-col items-center">
              <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-2 self-start">SIMULAÇÃO DE FEED</span>
              
              <div 
                className="relative bg-gradient-to-br from-purple-950/20 to-midnight rounded-xl border flex flex-col justify-between p-4 aspect-video transition-all duration-300 shadow-lg overflow-hidden group w-full"
                style={{ 
                  maxWidth: isMobilePreview ? '160px' : '360px',
                  borderColor: activeProject?.accent_color || '#9BB0A5',
                }}
              >
                {/* Visual Accent Cue */}
                <div className="absolute top-0 right-0 w-20 h-20 rounded-full filter blur-xl opacity-20 pointer-events-none" style={{ backgroundColor: activeProject?.accent_color || '#9BB0A5' }} />
                
                {/* Style Badge */}
                <span className="text-[7px] font-black uppercase bg-black/40 border border-white/10 px-1.5 py-0.5 rounded text-white/60 w-max leading-none">
                  {selectedThumbnailStyle === 'Default' ? 'Padrão' : selectedThumbnailStyle}
                </span>

                {/* Simulated Visual Subject */}
                <div className="flex-1 flex items-center justify-center py-1">
                  <div className="text-center space-y-1">
                    <p className="text-[8px] font-bold text-white/40 group-hover:text-white/60 transition-colors capitalize">
                      {selectedThumbnailStyle === 'Whiteboard' ? '✏️ Desenho Técnico' : 
                       selectedThumbnailStyle === 'Neo-Minimalism' ? '🔍 Foco Único' : 
                       selectedThumbnailStyle === 'Interface Hijacking' ? '📱 Mock Interface' : '🎬 Still de Vídeo'}
                    </p>
                  </div>
                </div>

                {/* Text overlay simulation */}
                <p 
                  className="font-black text-center text-white break-words drop-shadow-md uppercase tracking-wider leading-none"
                  style={{
                    fontSize: isMobilePreview ? '7px' : '13px',
                    color: selectedThumbnailStyle === 'Cinematic Text' ? '#FBBF24' : '#FFFFFF',
                  }}
                >
                  {thumbnailDirective.thumbnailTextPtBr || 'TÍTULO'}
                </p>
              </div>
            </div>
          </div>
        </div>

        <div className="rounded-xl bg-midnight/40 border border-white/5 p-4 space-y-4">
          <div>
            <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-2">PROMPT 1 · SEM FRASE ARTIFICIAL</span>
            <div className="relative">
              <p className="text-[11px] text-white/80 leading-relaxed font-mono pr-10 whitespace-pre-wrap break-words">{thumbnailDirective.thumbnailPromptNoText}</p>
              <button
                onClick={() => navigator.clipboard.writeText(thumbnailDirective.thumbnailPromptNoText)}
                className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/20 rounded-lg text-white/30 hover:text-white transition-all"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>

          <div className="border-t border-white/5 pt-4">
            <span className="block text-[9px] font-black uppercase tracking-[3px] text-white/30 mb-2">PROMPT 2 · TEXTO CURTO EM PT-BR</span>
            <div className="relative">
              <p className="text-[11px] text-white/80 leading-relaxed font-mono pr-10 whitespace-pre-wrap break-words">{thumbnailDirective.thumbnailPromptWithPtBrText}</p>
              <button
                onClick={() => navigator.clipboard.writeText(thumbnailDirective.thumbnailPromptWithPtBrText)}
                className="absolute top-2 right-2 p-1.5 bg-white/5 hover:bg-white/20 rounded-lg text-white/30 hover:text-white transition-all"
              >
                <Copy size={12} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  ) : null;

  // ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ ASSEMBLER MODE ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬ÃÆ’Ã†â€™Ãâ€šÃ‚Â¢ÃÆ’Ã‚Â¢ÃÂ¢ââ‚¬Å¡Ã‚Â¬Ãâ€šÃ‚ÂÃÆ’Ã‚Â¢ÃÂ¢ââ€šÂ¬Ã…Â¡Ãâ€šÃ‚Â¬
  const ScriptMobileTabs = (
    <div className="flex lg:hidden mb-4 bg-white/5 rounded-xl p-1 border border-white/10">
      {[{ id: 'context', label: 'Contexto' }, { id: 'main', label: 'Roteiro' }].map(tab => (
        <button
          key={tab.id}
          onClick={() => setMobileTab(tab.id as any)}
          className={`flex-1 py-2 text-xs font-black uppercase tracking-widest rounded-lg transition-all ${
            mobileTab === tab.id ? 'bg-blue-500 text-white' : 'text-white/40 hover:text-white'
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col min-h-[calc(100vh-160px)]">
      <div className="flex flex-1 min-h-0 animate-in">

        {/* Full-width Script Workspace */}
        <section className="flex-1 min-w-0 min-h-0 glass-card flex-col shadow-2xl border-white/10 ring-1 ring-white/5 flex">
        {assemblerActive ? (
          <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-4 xl:p-6">
            <ProductionAssembler
              components={components}
              componentsHydrated={componentsHydrated}
              onApprove={handleAssemblerApprove}
            />
          </div>
        ) : (
          <>
        <div className="p-6 xl:p-8 border-b border-white/5 flex flex-col gap-6 xl:flex-row xl:justify-between xl:items-start bg-midnight/40 backdrop-blur-md">
          <div className="max-w-3xl">
            <h3 className="font-bold flex items-center gap-3 text-lg text-white">
              <Database className="text-blue-500" size={20} /> Production Assembler
            </h3>
            <p className="text-[11px] text-white/60 mt-1 font-bold leading-relaxed max-w-2xl break-words uppercase tracking-widest">
              Validado pela PUC: <span className="font-black text-blue-400 drop-shadow-[0_0_8px_rgba(59,130,246,0.3)]">"{activeProject?.puc || 'DNA nao definido'}"</span>
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3 w-full xl:w-[640px]">
            <button
              onClick={restoreExecutionState}
              className="px-4 py-3 bg-white/5 text-white/70 hover:bg-white/10 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-white/10"
              title="Recarregar a ultima execucao salva desta instancia"
            >
              <RotateCcw size={14} /> RETOMAR EXECUCAO
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
              title="Limpar a execucao atual desta instancia e recomecar"
            >
              <Trash2 size={14} /> LIMPAR EXECUCAO
            </button>
            <button 
              onClick={() => generateThumbnailDirective()}
              className="px-6 py-3 bg-purple-500/10 text-purple-400 hover:bg-purple-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-purple-500/20"
              title="Gerar Diretriz de Thumbnail para ferramenta externa"
            >
              <Layout size={14} /> DIRETRIZ DE THUMB
            </button>
            <button 
              onClick={handleDeploy}
              className="px-6 py-3 bg-blue-500/10 text-blue-400 hover:bg-blue-600 hover:text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-blue-500/20 shadow-lg shadow-blue-900/10"
              title="Registrar log de composicao e deploy na BI"
            >
              <Save size={14} /> REGISTRAR DNA
            </button>
            <button
              onClick={async () => {
                if (!approvedBriefing) { showToast('Aprove um assembly antes de copiar o prompt externo.'); return; }
                const externalPrompt = buildExternalWritingPrompt();
                await navigator.clipboard.writeText(externalPrompt);
                showToast('Prompt externo copiado com blueprint detalhado do roteiro.');
              }}
              className="px-6 py-3 bg-blue-500/10 text-blue-300 hover:bg-blue-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-blue-500/20"
              title="Copiar prompt completo para usar em plataforma externa"
            >
              <MessageSquare size={14} /> COPIAR PROMPT EXTERNO
            </button>
            <button
              onClick={() => {
                const nextVal = !useAdvancedRetention;
                setUseAdvancedRetention(nextVal);
                persistExecutionSnapshotLocally({ useAdvancedRetention: nextVal });
              }}
              className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border ${
                useAdvancedRetention
                  ? "bg-purple-500/20 text-purple-400 border-purple-500/40 shadow-[0_0_15px_rgba(168,85,247,0.15)]"
                  : "bg-white/5 text-white/50 border-white/10 hover:border-white/20 hover:text-white"
              }`}
              title="Aplicar diretrizes de retenção avançada (Outcome-First, timing gates, incompletude estratégica e Stop Stack)"
            >
              <Zap size={14} className={useAdvancedRetention ? "fill-purple-400/20" : ""} />
              Retenção PDF: {useAdvancedRetention ? "ON" : "OFF"}
            </button>
            <div className="flex gap-2 w-full">
              <button
                onClick={async () => {
                  if (!approvedBriefing) return alert('Aprove um assembly antes de copiar ou gerar versao.');
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
                  showToast('Briefing copiado e versao salva localmente.');
                }}
                className="p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10 flex items-center justify-center aspect-square"
                title="Copiar briefing (JSON) e salvar versao local"
              >
                <Copy size={18} />
              </button>
              {videoFormat === 'avatar_flow' ? (
                <button
                  onClick={downloadAvatarFlowPackage}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-3 bg-violet-600/25 text-violet-200 rounded-xl hover:bg-violet-600/45 hover:text-white transition-all border border-violet-500/30 font-bold uppercase tracking-wider text-[9px]"
                  title="Exportar Pacote Avatar Flow (Prompts de Vídeo + Falas Limpas para Produção Sem SRT)"
                >
                  🎬 Exportar Flow
                </button>
              ) : (
                <button
                  onClick={downloadScriptAsTxt}
                  className="flex-1 p-3 bg-white/5 rounded-xl hover:bg-white/10 transition-colors text-white/50 hover:text-white border border-white/10 flex items-center justify-center"
                  title="Baixar todos os blocos atuais em um unico arquivo .txt"
                >
                  <FileText size={18} />
                </button>
              )}
            </div>
            <button 
              onClick={async () => {
                if (!approvedBriefing) return alert('Aprove um assembly antes de gerar o roteiro.');
                setIsGeneratingScript(true);
                generationStoppedRef.current = false;
                setGenerationProgress({
                  currentIndex: 0,
                  completedCount: 0,
                  total: scriptBlocks.length,
                  currentTitle: 'Preparando blueprint para geracao',
                  status: 'Inicializando a geracao dos blocos no aplicativo...',
                });
                try {
                  const engine = (typeof window !== 'undefined' && localStorage.getItem('yt_active_engine')) || 'openai';
                  const model = (typeof window !== 'undefined' && localStorage.getItem('yt_selected_model')) || 'gpt-5.1';
                  const apiKey = (typeof window !== 'undefined' && localStorage.getItem(engine === 'openai' ? 'yt_openai_key' : 'yt_gemini_key')) || '';
                  if (!apiKey) {
                    setIsGeneratingScript(false);
                    setGenerationProgress(null);
                    return alert('Configure sua chave de API em Ajustes Globais para gerar o roteiro.');
                  }

                  const promptForGeneration = buildInternalWritingPrompt();
                  if (!promptForGeneration) {
                    setIsGeneratingScript(false);
                    setGenerationProgress(null);
                    return alert('Aprove um assembly completo antes de gerar o roteiro.');
                  }

                  const totalBlocks = scriptBlocks.length;
                  setGenerationProgress({
                    currentIndex: -1,
                    completedCount: 0,
                    total: totalBlocks,
                    currentTitle: approvedBriefing.title,
                    status: 'Enviando o blueprint completo para a IA do aplicativo...',
                  });

                  const controller = new AbortController();
                  generationAbortRef.current = controller;
                  const res = await fetch('/api/ai/generate', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    signal: controller.signal,
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

                  const sections = parseExternalScriptSections(text);
                  if (sections.length === 0) {
                    throw new Error('A IA respondeu, mas nao retornou blocos parseaveis.');
                  }
                  if (sections.length < totalBlocks) {
                    throw new Error(`A IA retornou ${sections.length} blocos, mas o blueprint exige ${totalBlocks}.`);
                  }

                  let workingBlocks = [...scriptBlocks];
                  setGenerationProgress({
                    currentIndex: 0,
                    completedCount: 0,
                    total: totalBlocks,
                    currentTitle: 'Distribuindo roteiro nos blocos',
                    status: 'Resposta recebida. Aplicando o roteiro aos cards STG...',
                  });

                  for (let i = 0; i < workingBlocks.length; i++) {
                    if (generationStoppedRef.current) {
                      throw new Error('__GENERATION_ABORTED__');
                    }

                    const block = workingBlocks[i];
                    const nextBlocks = [...workingBlocks];
                    nextBlocks[i] = { ...nextBlocks[i], content: (sections[i] || nextBlocks[i].content).trim() };
                    workingBlocks = nextBlocks;
                    setScriptBlocks(workingBlocks);
                    setGenerationProgress({
                      currentIndex: i,
                      completedCount: i + 1,
                      total: workingBlocks.length,
                      currentTitle: block.title,
                      status: `Bloco ${i + 1} concluido. Preenchendo os cards STG abaixo em tempo real.`,
                    });
                    await new Promise((resolve) => setTimeout(resolve, 20));
                  }

                  setGenerationProgress({
                    currentIndex: -1,
                    completedCount: workingBlocks.length,
                    total: workingBlocks.length,
                    currentTitle: approvedBriefing.title,
                    status: 'Roteiro completo. Finalizando e salvando o snapshot desta execucao...',
                  });

                  setIsGeneratingScript(false);
                  generationAbortRef.current = null;
                  generationStoppedRef.current = false;

                  void syncApprovedThemeSnapshot({
                    scriptBlocks: workingBlocks,
                    scriptStage: 'final',
                    executionMode: 'internal',
                    postScriptPackage: null,
                  }).catch((error) => {
                    console.warn('[ScriptEngine] Falha ao salvar snapshot final apos geracao.', error);
                  });
                  setScriptStage('final');
                  setPostScriptPackage(null);
                  persistExecutionSnapshotLocally({
                    scriptBlocks: workingBlocks,
                    scriptStage: 'final',
                    executionMode: 'internal',
                    postScriptPackage: null,
                  });

                  alert('Roteiro IA gerado nos blocos.');
                  setGenerationProgress(null);
                } catch (e: any) {
                  if (e?.name === 'AbortError' || e?.message === '__GENERATION_ABORTED__') {
                    alert('Geracao interrompida. Os blocos ja concluidos foram mantidos.');
                  } else {
                  alert(`Erro ao gerar roteiro: ${e.message || e}`);
                  }
                } finally {
                  if (generationAbortRef.current) {
                    generationAbortRef.current = null;
                    generationStoppedRef.current = false;
                    setIsGeneratingScript(false);
                    setGenerationProgress(null);
                  }
                }
              }}
              disabled={isGeneratingScript || executionMode === 'external'}
              className="px-8 py-3 bg-blue-500 text-white rounded-xl font-black text-[10px] uppercase tracking-[2px] shadow-lg shadow-blue-500/25 hover:bg-blue-400 hover:shadow-blue-400/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-3 disabled:opacity-40 disabled:cursor-not-allowed"
              title={executionMode === 'external' ? 'Mude para producao no aplicativo se quiser gerar os blocos por IA aqui.' : 'Gerar texto final para cada bloco via IA'}
            >
              {isGeneratingScript ? 'GERANDO...' : executionMode === 'external' ? 'MODO EXTERNO ATIVO' : 'GERAR ROTEIRO IA'} <Play size={14} fill="currentColor" />
            </button>
            {isGeneratingScript && (
              <button
                onClick={stopScriptGeneration}
                className="px-6 py-3 bg-red-500/10 text-red-300 hover:bg-red-500/20 rounded-xl font-black text-[10px] uppercase tracking-[2px] transition-all flex items-center gap-2 border border-red-500/20"
                title="Interromper a geracao e manter o que ja foi concluido"
              >
                <Octagon size={14} /> PARAR GERACAO
              </button>
            )}
          </div>
        </div>

        {generationProgress && (
          <div className="mx-6 xl:mx-8 mt-4 rounded-2xl border border-blue-500/20 bg-blue-500/[0.05] px-5 py-4 shadow-[0_0_30px_rgba(59,130,246,0.08)]">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-blue-300">Geracao em andamento</p>
                <p className="text-sm font-black text-white">{generationProgress.status}</p>
                <p className="text-[11px] text-white/55 leading-relaxed">
                  Bloco atual: <span className="text-white/80">{generationProgress.currentTitle}</span>. O texto gerado vai sendo inserido logo abaixo, dentro dos cards <span className="text-white/80">STG</span>, e permanece salvo no snapshot desta execucao.
                </p>
              </div>
              <div className="xl:w-[280px] space-y-2">
                <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.2em] text-white/45">
                  <span>Progresso</span>
                  <span>{generationProgress.completedCount}/{generationProgress.total} blocos</span>
                </div>
                <div className="h-2 rounded-full bg-white/8 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-blue-400 to-cyan-300 transition-all duration-300"
                    style={{
                      width: `${generationProgress.total > 0 ? (generationProgress.completedCount / generationProgress.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {thumbnailDirectivePanel}

        {approvedBriefing && (
          <div className="mx-6 xl:mx-8 mt-4 p-5 xl:p-6 bg-blue-500/[0.035] border border-blue-500/18 rounded-[28px] shadow-[0_0_40px_rgba(59,130,246,0.08)] space-y-5">
            {/* ⚡ Title-changed banner */}
            {pendingTitleUpdate && (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30">
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-black uppercase tracking-widest text-amber-400 mb-0.5">⚡ Título alterado</p>
                  <p className="text-[11px] text-white/60 leading-relaxed">
                    O tema foi renomeado para <span className="text-amber-300 font-bold">&ldquo;{pendingTitleUpdate.newTitle}&rdquo;</span>. Os blocos abaixo ainda usam o tema anterior.
                  </p>
                </div>
                <div className="flex gap-2 flex-shrink-0">
                  <button
                    onClick={() => {
                      setApprovedTheme(pendingTitleUpdate.newTitle);
                      setPendingTitleUpdate(null);
                      persistExecutionSnapshotLocally();
                      showToast('Título atualizado. Blocos mantidos.');
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-white/10 hover:bg-white/20 text-white/70 hover:text-white transition-all"
                  >
                    Manter blocos
                  </button>
                  <button
                    onClick={() => {
                      if (!approvedBriefing) return;
                      const newTitle = pendingTitleUpdate.newTitle;
                      setApprovedTheme(newTitle);
                      const updatedBriefing = { ...approvedBriefing, title: newTitle };
                      setApprovedBriefing(updatedBriefing);
                      const newBlocks = buildScriptBlocksFromBriefing(updatedBriefing, newTitle);
                      setScriptBlocks(newBlocks);
                      setScriptStage('blueprint');
                      setPendingTitleUpdate(null);
                      persistExecutionSnapshotLocally();
                      showToast('Blocos regenerados com o novo tema!');
                    }}
                    className="px-3 py-1.5 text-[10px] font-bold rounded-lg bg-amber-500 hover:bg-amber-400 text-black transition-all"
                  >
                    Regenerar blocos
                  </button>
                </div>
              </div>
            )}
            <div className="min-w-0 space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.4em] text-blue-300">Briefing aprovado</p>
              <p className="max-w-3xl text-[11px] text-white/45 leading-relaxed">
                O roteiro abaixo esta sendo montado com o briefing travado no assembler. O resumo principal fica visivel aqui para voce acompanhar o que esta sendo produzido sem perder o contexto editorial.
              </p>
            </div>

            <div className="rounded-[24px] border border-white/10 bg-midnight/30 px-5 py-5 xl:px-6 xl:py-6">
              <h4 className="max-w-5xl text-[2rem] xl:text-[2.65rem] font-black text-white italic leading-[0.98] break-words">
                {approvedBriefing.title}
              </h4>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {[
                { label: 'Duracao', value: approvedBriefing.estimatedDuration || 'N/D' },
                { label: 'Blocos', value: `${approvedBriefing.blockCount || approvedBriefing.blocks?.length || 0}` },
                { label: 'Voz', value: approvedBriefing.dominantVoice?.split(' ')[0] || 'N/D' },
                { label: 'Chars', value: approvedBriefing.estimatedChars ? `~${approvedBriefing.estimatedChars.toLocaleString('pt-BR')}` : 'N/D' },
              ].map((item) => (
                <div key={item.label} className="min-w-0 rounded-2xl border border-white/10 bg-midnight/40 px-4 py-3.5">
                  <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">{item.label}</span>
                  <span className="block text-sm font-black leading-tight text-white break-words">
                    {item.value}
                  </span>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              <div className="p-4 rounded-2xl bg-midnight/40 border border-white/5">
                <span className="text-[9px] font-black uppercase tracking-[3px] text-white/25 block mb-1">Camada de abertura</span>
                <p className="text-[11px] text-white/70 leading-relaxed break-words">{approvedBriefing.openingHook?.name || 'Nao definida'}</p>
              </div>
              <div className="p-4 rounded-2xl bg-midnight/40 border border-white/5">
                <span className="text-[9px] font-black uppercase tracking-[3px] text-white/25 block mb-1">Camada final de conversao</span>
                <p className="text-[11px] text-white/70 leading-relaxed break-words">{approvedBriefing.selectedCta?.name || 'Nao definida'}</p>
              </div>
            </div>
          </div>
        )}

        <div className="mx-6 xl:mx-8 mt-4 p-5 xl:p-6 bg-white/[0.02] border border-white/10 rounded-2xl space-y-4">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start">
            <div className="flex-1 flex flex-col gap-4">
              <div>
                <span className="block mb-2 text-[10px] font-black uppercase tracking-widest text-blue-300">Modo de Producao</span>
                <div className="flex gap-1 p-1 bg-black/20 rounded-xl border border-white/8 w-fit">
                {([
                  { value: "internal" as ExecutionMode, title: "No Aplicativo" },
                  { value: "external" as ExecutionMode, title: "Externamente" },
                ]).map((option) => {
                  const isActive = executionMode === option.value;
                  return (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setExecutionMode(option.value)}
                      className={`rounded-lg px-5 py-2 text-[10px] font-black uppercase tracking-[1.5px] transition-all ${
                        isActive
                          ? "bg-blue-500/20 border border-blue-400/40 text-blue-200 shadow-sm"
                          : "text-white/40 hover:text-white/70 border border-transparent"
                      }`}
                    >
                      {option.title}
                    </button>
                  );
                })}
                </div>
              </div>
              
              <div className="flex flex-col gap-2">
                <span className="block text-[10px] font-black uppercase tracking-widest text-purple-300">Personalidade & Tom de Voz</span>
                <textarea
                  value={writingStyleSample}
                  onChange={(e) => {
                    const val = e.target.value;
                    setWritingStyleSample(val);
                    persistExecutionSnapshotLocally({ writingStyleSample: val });
                  }}
                  placeholder="Cole aqui um paragrafo ou roteiro de exemplo do apresentador para calibrar a voz da IA (Opcional)..."
                  className="w-full min-h-[80px] max-h-[160px] bg-midnight/40 border border-white/10 rounded-xl px-3 py-2 text-[10px] text-white/70 leading-normal outline-none focus:border-purple-500/40 resize-y placeholder:text-white/20"
                />
              </div>
            </div>

            <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 w-full xl:w-[380px] shrink-0">
                <label className="block text-[9px] font-black uppercase tracking-[0.24em] text-blue-300">
                  Data e hora de postagem
                </label>
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-1">
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Data</span>
                    <input
                      type="date"
                      value={manualPublishDraftDate}
                      onChange={(e) => {
                        const nextDate = e.target.value;
                        setManualPublishDraftDate(nextDate);
                        if (!nextDate) {
                          setManualPublishDraftTime('');
                          return;
                        }

                        if (!manualPublishDraftTime) {
                          setManualPublishDraftTime('09:00');
                        }
                      }}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-midnight/50 px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-blue-400/40"
                    />
                  </div>
                  <div>
                    <span className="block text-[9px] font-black uppercase tracking-[0.18em] text-white/35">Horario</span>
                    <input
                      type="time"
                      value={manualPublishDraftTime}
                      onChange={(e) => setManualPublishDraftTime(e.target.value)}
                      disabled={!manualPublishDraftDate}
                      className="mt-2 w-full rounded-xl border border-white/10 bg-midnight/50 px-3 py-2 text-[11px] font-bold text-white outline-none focus:border-blue-400/40 disabled:cursor-not-allowed disabled:opacity-40"
                    />
                  </div>
                </div>
                <p className="mt-3 text-[10px] leading-5 text-white/35">
                  Com horario, passado publica e futuro programa. Sem horario, vale a regra por dia.
                </p>
                <div className="mt-3 rounded-xl border border-white/8 bg-black/15 px-3 py-2">
                  <span className="block text-[8px] font-black uppercase tracking-[0.18em] text-white/35">Rastreabilidade</span>
                  <p className="mt-1 text-[10px] leading-5 text-white/60">
                    Snapshot atual: {formatManualPublishTrace(manualPublishDate)}. Esse valor segue junto na execução salva e no tema quando houver registro no banco.
                  </p>
                </div>
                <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    onClick={() => {
                      void applyManualPublishRegistration();
                    }}
                    disabled={!manualPublishDraftDate || !hasPendingManualPublishChange}
                    className="rounded-xl border border-blue-400/30 bg-blue-500/15 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-blue-100 transition-all hover:border-blue-300/50 hover:bg-blue-500/20 disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {manualPublishDate ? 'Atualizar data registrada' : 'Registrar data de postagem'}
                  </button>
                  {hasPendingManualPublishChange && manualPublishDate && (
                    <button
                      type="button"
                      onClick={() => {
                        setManualPublishDraftDate(manualPublishParts.date);
                        setManualPublishDraftTime(manualPublishParts.time);
                      }}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-white/65 transition-all hover:border-white/20 hover:text-white"
                    >
                      Descartar alteracao
                    </button>
                  )}
                  {manualPublishDate && (
                    <button
                      type="button"
                      onClick={() => { void clearPublishDate(); }}
                      className="rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.18em] text-red-300 transition-all hover:border-red-400/50 hover:bg-red-500/20"
                    >
                      Limpar data
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>

          {executionMode === 'external' && (
            <div className="space-y-4">
              {/* ROW 1: Textarea + Plataforma/TXT side by side */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Plataforma externa</label>
                    <input
                      value={externalSourceLabel}
                      onChange={(e) => {
                        const value = e.target.value;
                        setExternalSourceLabel(value);
                        persistExecutionSnapshotLocally({
                          executionMode: 'external',
                          externalSourceLabel: value,
                        });
                      }}
                      placeholder="Ex: ChatGPT, Claude, Gemini..."
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-[11px] text-white outline-none focus:border-blue-400/40 placeholder:text-white/20"
                    />
                  </div>
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Arquivo do roteiro (.txt)</label>
                    <input
                      type="file"
                      accept=".txt,text/plain"
                      onChange={handleExternalScriptUpload}
                      className="block w-full text-[11px] text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-blue-500/15 file:px-4 file:py-2.5 file:text-[10px] file:font-black file:uppercase file:tracking-[0.2em] file:text-blue-300 hover:file:bg-blue-500/20"
                    />
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                      {externalScriptFileName ? `Persistido: ${externalScriptFileName}` : 'Nenhum .txt anexado.'}
                    </div>
                    {externalScriptText && (
                      <button
                        type="button"
                        onClick={extractVisualBlueprintAndCast}
                        disabled={isExtractingVisuals}
                        className={`w-full rounded-xl border border-blue-500/30 bg-blue-500/10 px-3 py-2.5 text-[9px] font-bold uppercase tracking-[0.15em] text-blue-200 transition-all hover:bg-blue-500/20 active:scale-95 flex items-center justify-center gap-2`}
                      >
                        {isExtractingVisuals ? '⏳ Analisando...' : '✨ Analisar Direcao de Arte & Elenco'}
                      </button>
                    )}
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Roteiro externo recebido</label>
                  <textarea
                    value={externalScriptText}
                    onChange={(e) => {
                      const val = e.target.value;
                      setExternalScriptText(val);
                      persistExecutionSnapshotLocally({ externalScriptText: val });
                    }}
                    placeholder="Cole aqui o roteiro final gerado fora do aplicativo. Se ele vier separado em BLOCO 1, BLOCO 2, etc., o app aplica automaticamente nos blocos atuais."
                    className="w-full min-h-[100px] bg-midnight/40 border border-white/10 rounded-2xl px-4 py-4 text-[12px] text-white/85 leading-relaxed outline-none focus:border-blue-400/40 resize-y placeholder:text-white/15"
                  />
                  {externalScriptText && (
                    <div className="space-y-3 mt-2">
                      <div className="flex flex-wrap gap-2.5">
                        <button
                          type="button"
                          onClick={handleExternalHumanize}
                          disabled={isHumanizingExternal}
                          className="px-4 py-2 rounded-xl border border-purple-500/30 bg-purple-500/10 text-[9px] font-black uppercase tracking-wider text-purple-300 hover:bg-purple-500/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Remover vícios de escrita de IA e adaptar ao tom de voz de referência"
                        >
                          {isHumanizingExternal ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              Polindo escrita...
                            </>
                          ) : (
                            <>
                              <Sparkles size={12} />
                              Humanizar Roteiro
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={handleExternalFactCheck}
                          disabled={isFactCheckingExternal}
                          className="px-4 py-2 rounded-xl border border-blue-500/30 bg-blue-500/10 text-[9px] font-black uppercase tracking-wider text-blue-300 hover:bg-blue-500/20 active:scale-95 transition-all flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed"
                          title="Executar verificação factual utilizando Gemini com busca em tempo real do Google"
                        >
                          {isFactCheckingExternal ? (
                            <>
                              <Loader2 size={12} className="animate-spin" />
                              Verificando fatos...
                            </>
                          ) : (
                            <>
                              <Database size={12} />
                              Fact-Check Roteiro
                            </>
                          )}
                        </button>
                        {externalFactCheckReport && (
                          <button
                            type="button"
                            onClick={() => {
                              setExternalFactCheckReport(null);
                              persistExecutionSnapshotLocally({ externalFactCheckReport: null });
                            }}
                            className="px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[9px] font-black uppercase tracking-wider text-white/50 hover:bg-white/10 hover:text-white active:scale-95 transition-all"
                          >
                            Limpar Relatorio
                          </button>
                        )}
                      </div>

                      {externalHumanizeReport && (
                        <div className="rounded-2xl border border-purple-500/20 bg-purple-500/[0.03] p-5 space-y-4 animate-in fade-in-50 slide-in-from-top-2 duration-200">
                          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isHumanizeReportExpanded ? 'pb-3 border-b border-white/5' : ''}`}>
                            <button
                              type="button"
                              onClick={() => setIsHumanizeReportExpanded(!isHumanizeReportExpanded)}
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[2px] text-purple-300 hover:text-purple-200 transition-all text-left outline-none"
                            >
                              <span className="text-[11px] font-bold text-purple-400">{isHumanizeReportExpanded ? '▼' : '▶'}</span>
                              <span>✨ Relatório de Humanização & Ajustes</span>
                            </button>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={handleApplyHumanizedText}
                                className="px-3.5 py-1.5 rounded-lg bg-purple-500/25 hover:bg-purple-500/35 border border-purple-400/40 text-[9px] font-black uppercase tracking-wider text-purple-100 transition-all active:scale-95 shadow-sm"
                              >
                                Aplicar Texto Humanizado
                              </button>
                              {pendingHumanizedText && (
                                <button
                                  type="button"
                                  onClick={() => copyTextToClipboard(pendingHumanizedText, '📋 Roteiro humanizado copiado!')}
                                  className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white/70 transition-all active:scale-95 flex items-center gap-1"
                                  title="Copiar text proposto"
                                >
                                  Copiar Roteiro
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(externalHumanizeReport, '📋 Relatório de auditoria copiado!')}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white/70 transition-all active:scale-95 flex items-center gap-1"
                                title="Copiar relatório de modificações"
                              >
                                Copiar Auditoria
                              </button>
                              <button
                                type="button"
                                onClick={handleDiscardHumanizedText}
                                className="px-3 py-1.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/25 text-[9px] font-black uppercase tracking-wider text-red-300 transition-all active:scale-95"
                              >
                                Descartar
                              </button>
                            </div>
                          </div>
                          
                          {isHumanizeReportExpanded && (
                            <>
                              <div className="text-[11px] text-white/70 leading-relaxed font-medium overflow-x-auto max-w-full space-y-2">
                                {renderMarkdown(externalHumanizeReport)}
                              </div>

                              {pendingHumanizedText && (
                                <div className="mt-3 space-y-2 pt-3 border-t border-white/5">
                                  <span className="block text-[9px] font-black uppercase tracking-widest text-purple-400">Texto Humanizado Proposto:</span>
                                  <div className="p-3.5 bg-black/45 rounded-xl border border-white/5 text-[11px] text-white/80 max-h-[220px] overflow-y-auto font-mono whitespace-pre-wrap leading-relaxed">
                                    {pendingHumanizedText}
                                  </div>
                                </div>
                              )}
                            </>
                          )}
                        </div>
                      )}

                      {externalFactCheckReport && (
                        <div className="rounded-2xl border border-blue-500/20 bg-blue-500/[0.03] p-5 space-y-4 animate-in fade-in-50 slide-in-from-top-2 duration-200">
                          {/* Header colapsável */}
                          <div className={`flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between ${isFactCheckReportExpanded ? 'pb-3 border-b border-white/5' : ''}`}>
                            <button
                              type="button"
                              onClick={() => setIsFactCheckReportExpanded(!isFactCheckReportExpanded)}
                              className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[2px] text-blue-300 hover:text-blue-200 transition-all text-left outline-none"
                            >
                              <span className="text-[11px] font-bold text-blue-400">{isFactCheckReportExpanded ? '▼' : '▶'}</span>
                              <span>🔍 Relatório de Verificação Factual</span>
                            </button>
                            <div className="flex flex-wrap gap-2">
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(externalFactCheckReport, '📋 Relatório de fact-check copiado!')}
                                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-[9px] font-black uppercase tracking-wider text-white/70 transition-all active:scale-95 flex items-center gap-1"
                                title="Copiar relatório de fact-check"
                              >
                                Copiar Relatório
                              </button>
                            </div>
                          </div>

                          {/* Conteúdo expandido com scroll interno */}
                          {isFactCheckReportExpanded && (
                            <div className="max-h-[380px] overflow-y-auto pr-1 scrollbar-thin scrollbar-thumb-blue-500/30 scrollbar-track-transparent">
                              <div className="text-[11px] text-white/70 leading-relaxed font-medium space-y-2 break-words">
                                {renderMarkdown(externalFactCheckReport)}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </div>

              {/* ROW 2: SRT + Formato/Personagem + Estilo + Botoes — 3 cols */}
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-3 rounded-2xl border border-white/10 bg-white/[0.02] p-4">
                {/* Col 1: SRT Upload & Estilo Visual */}
                <div className="space-y-3">
                  <div className="space-y-2">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Arquivo de legendas (.srt)</label>
                    <input
                      type="file"
                      accept=".srt,text/plain"
                      onChange={handleExternalSrtUpload}
                      className="block w-full text-[11px] text-white/70 file:mr-3 file:rounded-xl file:border-0 file:bg-purple-500/15 file:px-4 file:py-2.5 file:text-[10px] file:font-black file:uppercase file:tracking-[0.2em] file:text-purple-200 hover:file:bg-purple-500/20"
                    />
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                      {externalSrtFileName ? `Persistido: ${externalSrtFileName}` : 'Nenhum .srt anexado.'}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-amber-500/80">Estilo Visual do Texto (Render)</p>
                    <select
                      value={textStyleMode}
                      onChange={(e) => setTextStyleMode(e.target.value)}
                      className="w-full bg-midnight/60 border border-white/10 rounded-xl px-3 py-2 text-[10px] uppercase font-black tracking-widest text-white outline-none focus:border-amber-500/40"
                    >
                      <option value="auto">Automatico (IA, Variavel cena a cena)</option>
                      {activeProject?.editing_sop?.text_styles?.split(',').map((s: string) => s.trim()).filter(Boolean).map((opt: string) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                      <option value="custom">Personalizado...</option>
                    </select>
                    {textStyleMode === 'custom' && (
                      <input
                        value={customTextStyle}
                        onChange={(e) => setCustomTextStyle(e.target.value)}
                        placeholder="Ex: Neon, Vintage VHS, Clean White..."
                        className="w-full rounded-xl border border-white/10 bg-midnight/45 px-3 py-2 text-[11px] text-white/80 outline-none placeholder:text-white/20 focus:border-amber-500/40"
                      />
                    )}
                  </div>
                </div>

                {/* Col 2: Formato + Personagem */}
                <div className="space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Formato do Video</p>
                    <div className="grid grid-cols-2 gap-2">
                      {([
                        { value: 'avatar', label: 'Apresentador' },
                        { value: 'vlog', label: 'VLOG' },
                        { value: 'faceless', label: 'Faceless' },
                        { value: 'avatar_flow', label: 'Avatar Flow' },
                        { value: 'catalog', label: 'Catálogo' },
                      ] as { value: VideoFormat; label: string }[]).map((option) => {
                        const selected = videoFormat === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setVideoFormat(option.value)}
                            className={`rounded-xl border px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] transition-all text-center ${
                              selected
                                ? 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100'
                                : 'border-white/10 bg-white/5 text-white/45 hover:text-white/75'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>
                    {videoFormat === 'faceless' && (
                      <p className="text-[9px] text-amber-400/70 leading-relaxed">
                        Modo Faceless: imagens e videos a cada ~6s. As lacunas no CSV ficam em branco — estique a midia anterior no editor.
                      </p>
                    )}
                    {videoFormat === 'vlog' && (
                      <p className="text-[9px] text-cyan-400/70 leading-relaxed">
                        Modo VLOG Imersivo: personagem consistente em selfie trêmula 1ª pessoa e ritmo de B-roll descontraído.
                      </p>
                    )}
                    {videoFormat === 'avatar' && (
                      <p className="text-[9px] text-purple-400/70 leading-relaxed">
                        Modo Apresentador: personagem no home office/cenário fixo com inserções de B-roll frequentes.
                      </p>
                    )}
                    {videoFormat === 'avatar_flow' && (
                      <p className="text-[9px] text-violet-400/80 leading-relaxed">
                        Modo Avatar Flow: Roteiro em blocos de ~25 palavras. Prompts com alternância de ângulos cinematográficos para Personagem001 gerados de forma rápida, sem depender de SRT para começar.
                      </p>
                    )}
                    {videoFormat === 'catalog' && (
                      <p className="text-[9px] text-emerald-400/80 leading-relaxed">
                        Modo Catálogo: Estilo apresentação de slides e colagens com design premium minimalista, sem apresentadores reais e com foco em fatos e produtos reais.
                      </p>
                    )}
                  </div>

                  {/* Ativos e Assets a Gerar */}
                  <div className={`rounded-2xl border p-3 space-y-2 transition-all duration-300 ${
                    (!pipelineVideos && !pipelineImages && !pipelineTexts && !pipelineHyperframes)
                      ? 'border-red-500/50 bg-red-500/[0.03] shadow-[0_0_15px_rgba(239,68,68,0.15)] animate-pulse'
                      : 'border-white/10 bg-black/10'
                  }`}>
                    <div className="flex items-center justify-between">
                      <p className="text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Ativos a gerar no pipeline</p>
                      {(!pipelineVideos && !pipelineImages && !pipelineTexts && !pipelineHyperframes) && (
                        <span className="text-[8px] font-bold text-red-400 uppercase tracking-wider flex items-center gap-1 animate-bounce">
                          ⚠️ Selecione pelo menos um
                        </span>
                      )}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { id: 'video', state: pipelineVideos, setState: setPipelineVideos, label: '📹 Vídeos', color: 'blue' },
                        { id: 'image', state: pipelineImages, setState: setPipelineImages, label: '🖼️ Imagens', color: 'cyan' },
                        { id: 'text', state: pipelineTexts, setState: setPipelineTexts, label: '✍️ Textos', color: 'amber' },
                        { id: 'hyperframe', state: pipelineHyperframes, setState: setPipelineHyperframes, label: '⚡ Hyperframes', color: 'purple' },
                      ].map((assetOpt) => {
                        const active = assetOpt.state;
                        const colorClass = 
                          assetOpt.color === 'blue' ? 'border-blue-400/40 bg-blue-500/15 text-blue-100' :
                          assetOpt.color === 'cyan' ? 'border-cyan-400/40 bg-cyan-500/15 text-cyan-100' :
                          assetOpt.color === 'amber' ? 'border-amber-400/40 bg-amber-500/15 text-amber-100' :
                          'border-purple-400/40 bg-purple-500/15 text-purple-100';
                        return (
                          <button
                            key={assetOpt.id}
                            type="button"
                            onClick={() => {
                              const nextVal = !active;
                              assetOpt.setState(nextVal);
                              persistExecutionSnapshotLocally({
                                [`pipeline${assetOpt.id.charAt(0).toUpperCase() + assetOpt.id.slice(1)}s` as any]: nextVal
                              });
                            }}
                            className={`rounded-xl border px-2 py-2 text-[9px] font-black uppercase tracking-[0.08em] transition-all text-center ${
                              active
                                ? colorClass
                                : 'border-white/10 bg-white/5 text-white/45 hover:text-white/75'
                            }`}
                          >
                            {assetOpt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-black/10 p-3 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-widest text-purple-200">Personagem dos prompts de video</p>
                    <div className="grid grid-cols-3 gap-2">
                      {[
                        { value: 'male', label: 'Masculino' },
                        { value: 'female', label: 'Feminino' },
                        { value: 'custom', label: 'Custom' },
                      ].map((option) => {
                        const selected = videoCharacterMode === option.value;
                        return (
                          <button
                            key={option.value}
                            type="button"
                            onClick={() => setVideoCharacterMode(option.value as VideoCharacterMode)}
                            className={`rounded-xl border px-3 py-2 text-[9px] font-black uppercase tracking-[0.16em] transition-all ${
                              selected
                                ? 'border-purple-300/40 bg-purple-500/15 text-purple-100'
                                : 'border-white/10 bg-white/5 text-white/45 hover:text-white/75'
                            }`}
                          >
                            {option.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Checkbox Forçar Todos os Assets como Vídeo */}
                    <div className="rounded-xl border border-white/5 bg-black/25 p-3.5 space-y-2 mt-2">
                      <label className="relative flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={forceAllAsVideo}
                          onChange={(e) => {
                            setForceAllAsVideo(e.target.checked);
                            persistExecutionSnapshotLocally({ forceAllAsVideo: e.target.checked });
                          }}
                          className="w-4.5 h-4.5 rounded border border-white/10 bg-black/40 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-500 mt-0.5"
                        />
                        <div>
                          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:text-white transition-colors">
                            Forçar todos os assets como vídeo
                          </span>
                          <span className="block text-[9px] text-white/40 mt-1 leading-relaxed">
                            Substitui imagens, HFs e textos por prompts de vídeo completos na geração de IA. Útil para ferramentas/testes que aceitam apenas vídeos.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Checkbox Modo Híbrido (Vídeo + Imagem) */}
                    <div className="rounded-xl border border-white/5 bg-black/25 p-3.5 space-y-2 mt-2">
                      <label className="relative flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={useHybridAssets}
                          onChange={(e) => {
                            setUseHybridAssets(e.target.checked);
                            persistExecutionSnapshotLocally({ useHybridAssets: e.target.checked });
                          }}
                          className="w-4.5 h-4.5 rounded border border-white/10 bg-black/40 text-cyan-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-cyan-500 mt-0.5"
                        />
                        <div>
                          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-cyan-300 hover:text-cyan-200 transition-colors">
                            Gerar assets como Vídeo + Imagem (Modo Híbrido)
                          </span>
                          <span className="block text-[9px] text-white/40 mt-1 leading-relaxed">
                            A partir do SRT, gera prompts de vídeos e imagens baseados na semântica da IA, forçando VÍDEO para cenas com 4s ou mais para evitar mídias estáticas.
                          </span>
                        </div>
                      </label>
                    </div>

                    {/* Checkbox Direção de Arte Ultra-Cinematográfica */}
                    <div className="rounded-xl border border-white/5 bg-black/25 p-3.5 space-y-2 mt-2">
                      <label className="relative flex items-start gap-3 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={ultraCinematic}
                          onChange={(e) => {
                            setUltraCinematic(e.target.checked);
                            persistExecutionSnapshotLocally({ ultraCinematic: e.target.checked });
                          }}
                          className="w-4.5 h-4.5 rounded border border-white/10 bg-black/40 text-purple-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-purple-500 mt-0.5"
                        />
                        <div>
                          <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:text-white transition-colors">
                            Direção de Arte Ultra-Cinematográfica
                          </span>
                          <span className="block text-[9px] text-white/40 mt-1 leading-relaxed">
                            Gera prompts densos (80-150 palavras) com enquadramento de lente, detalhes de época e narrativa visual sob a estrutura cinematográfica.
                          </span>
                        </div>
                      </label>
                    </div>
                    
                    {/* Visual Preview / Customizer Interface */}
                    {videoFormat !== 'faceless' && videoFormat !== 'catalog' && (videoCharacterMode === 'male' || videoCharacterMode === 'female') && (() => {
                      const resolvedPrompt = resolveCharacterProfileInFrontend(
                        videoCharacterMode,
                        videoFormat,
                        activeProject?.name || activeProject?.project_name,
                        undefined,
                        activeProject?.persona_matrix?.demographics || activeProject?.target_persona?.audience,
                        activeProject?.editing_sop?.visual_identity || activeProject?.visual_identity
                      );
                      return (
                        <div className="space-y-1.5 mt-2">
                          <p className="text-[8px] font-bold uppercase tracking-wider text-white/40">Visual Resolvido (Automático):</p>
                          <div className="rounded-xl border border-white/5 bg-black/35 p-3 text-[10px] leading-relaxed text-white/70 italic relative overflow-hidden group">
                            {resolvedPrompt}
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setVideoCharacterCustom(resolvedPrompt);
                              setVideoCharacterMode('custom');
                            }}
                            className="flex items-center justify-center gap-1.5 w-full rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-purple-200 transition-all hover:bg-purple-500/20 active:scale-95"
                          >
                            ✏️ Customizar este visual
                          </button>
                        </div>
                      );
                    })()}

                    {videoCharacterMode === 'custom' && (
                      <div className="space-y-2 mt-2">
                        <textarea
                          value={videoCharacterCustom}
                          onChange={(e) => setVideoCharacterCustom(e.target.value)}
                          placeholder="Descreva o personagem ou cole o template da Skill Mestre contendo: STYLE_DNA: ... | CHARACTER_DNA: ... | EXTRAS_DNA: ... | NEGATIVE_DNA: ..."
                          className="w-full min-h-[90px] resize-y rounded-xl border border-white/10 bg-midnight/45 px-3 py-3 text-[11px] leading-5 text-white/80 outline-none placeholder:text-white/20 focus:border-purple-300/40"
                        />
                        <button
                          type="button"
                          disabled={isSuggestingStyle}
                          onClick={() => suggestVisualStyleWithAI()}
                          className="flex items-center justify-center gap-1 w-full rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-[9px] font-bold uppercase tracking-wider text-white/60 transition-all hover:bg-white/10 hover:text-white/80 disabled:opacity-50"
                        >
                          {isSuggestingStyle ? '⏳ Gerando com IA...' : '✨ Sugerir com base no Canal'}
                        </button>
                      </div>
                    )}
                  </div>
                </div>

                {/* Col 3: Botoes de Acao */}
                <div className="space-y-3">
                  {/* ── BOTÃO PRINCIPAL: PIPELINE COMPLETO ────────────────── */}
                  <div className="flex gap-2 items-stretch">
                    <button
                      type="button"
                      onClick={runFullPipeline}
                      disabled={isPipelineRunning || isProcessingSrtPipeline || isRenderingTextAssets || isGeneratingPostScriptPackage || !externalSrtText.trim() || (!pipelineVideos && !pipelineImages && !pipelineTexts && !pipelineHyperframes)}
                      className="flex-1 rounded-xl border border-emerald-400/30 bg-gradient-to-r from-emerald-600/15 to-cyan-600/15 px-4 py-3.5 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-all hover:from-emerald-600/25 hover:to-cyan-600/25 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isPipelineRunning
                        ? `⏳ ${PIPELINE_STEP_LABELS[pipelineCurrentStep ?? ''] ?? 'AGUARDANDO...'}`
                        : pipelineCurrentStep === 'done'
                          ? '✅ PIPELINE CONCLUÍDO'
                          : '▶ INICIAR PIPELINE COMPLETO'}
                    </button>
                    {(externalSrtPipeline || postScriptPackage || hfBgPrompts) && (
                      <button
                        type="button"
                        title="Limpar resultados processados (mantém .srt e roteiro)"
                        onClick={() => {
                          if (confirm('Limpar todos os resultados processados?\n\nO arquivo .srt e o roteiro serão mantidos. Apenas assets, pacote pós-roteiro e fundos HF serão removidos.')) {
                            resetPipelineResults();
                          }
                        }}
                        disabled={isPipelineRunning}
                        className="rounded-xl border border-rose-400/25 bg-rose-500/10 px-3 py-2 text-rose-300 transition-all hover:bg-rose-500/20 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        🗑
                      </button>
                    )}
                  </div>
                  <p className="text-[9px] text-white/25 text-center">
                    {isPipelineRunning
                      ? 'Pipeline em execução — aguarde a conclusão de cada etapa...'
                      : 'Executa automaticamente: SRT → Fundos HF → Pacote Pós-Roteiro → BATs'}
                  </p>
                  {/* ── Warnings: prompts que não foram resolvidos mesmo após retry ── */}
                  {pipelineWarnings.length > 0 && (
                    <details className="rounded-xl border border-amber-400/25 bg-amber-500/10 px-3 py-2 space-y-1">
                      <summary className="cursor-pointer text-[9px] font-black uppercase tracking-widest text-amber-300 list-none flex items-center gap-2">
                        <span>⚠️</span>
                        <span>{pipelineWarnings.length} prompt{pipelineWarnings.length > 1 ? 's' : ''} incompleto{pipelineWarnings.length > 1 ? 's' : ''} após 2 tentativas</span>
                        <span className="text-amber-500/50 ml-auto">▼ ver detalhes</span>
                      </summary>
                      <ul className="mt-2 space-y-1 pl-1">
                        {pipelineWarnings.map((w, i) => (
                          <li key={i} className="text-[8px] text-amber-200/70 font-mono leading-relaxed">{w}</li>
                        ))}
                      </ul>
                      <p className="text-[8px] text-amber-400/50 mt-1">
                        Use o botão &quot;REGENERAR ITEMS&quot; abaixo para tentar novamente manualmente.
                      </p>
                    </details>
                  )}
                  {/* ── Divisor ───────────────────────────────────────────── */}
                  <div className="flex items-center gap-2 my-1">
                    <div className="flex-1 h-px bg-white/10" />
                    <span className="text-[9px] text-white/25 uppercase tracking-widest">ou etapas individuais</span>
                    <div className="flex-1 h-px bg-white/10" />
                  </div>
                  {/* ── Botão individual: só SRT ──────────────────────────── */}
                  <button
                    type="button"
                    onClick={processAttachedSrtAssets}
                    disabled={isPipelineRunning || isProcessingSrtPipeline || isRenderingTextAssets || !externalSrtText.trim() || (!pipelineVideos && !pipelineImages && !pipelineTexts && !pipelineHyperframes)}
                    className="w-full rounded-xl border border-purple-400/25 bg-purple-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-purple-200 transition-all hover:bg-purple-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    {isProcessingSrtPipeline ? 'PROCESSANDO SRT...' : 'PROCESSAR SRT EM ASSETS'}
                  </button>
                  {externalSrtPipeline && (() => {
                    const fallbackRowsList = externalSrtPipeline.rows.filter((r) => r.isFallback);
                    const fallbackCount = fallbackRowsList.length;
                    if (fallbackCount === 0) return null;
                    return (
                      <div className="rounded-xl border border-orange-400/30 bg-orange-500/10 px-4 py-3 space-y-3">
                        <div className="space-y-1">
                          <p className="text-[10px] text-orange-300 font-black uppercase tracking-widest">
                            ⚠️ {fallbackCount} prompt{fallbackCount > 1 ? 's' : ''} incompleto{fallbackCount > 1 ? 's' : ''}
                          </p>
                          <p className="text-[8px] text-orange-200/60 leading-normal">
                            Os seguintes trechos falharam e usaram prompts de fallback. Clique abaixo para regenerar.
                          </p>
                        </div>

                        <div className="max-h-[140px] overflow-y-auto pr-1 space-y-1.5 scrollbar-thin scrollbar-thumb-orange-500/20 scrollbar-track-transparent">
                          {fallbackRowsList.map((row) => (
                            <div
                              key={row.rowNumber}
                              className="flex flex-col gap-0.5 rounded border border-orange-500/10 bg-black/30 p-2 text-[9px] text-orange-200/80 font-mono"
                            >
                              <div className="flex justify-between items-center gap-1">
                                <span className="text-orange-400 font-bold">Linha #{row.rowNumber}</span>
                                <span className="rounded bg-orange-500/20 px-1 py-0.5 text-[8px] text-orange-300 font-bold uppercase shrink-0">
                                  {row.asset}
                                </span>
                              </div>
                              <div className="text-[8px] opacity-60 font-semibold">{row.startTime} - {row.endTime}</div>
                              <div className="text-white/80 italic mt-0.5 line-clamp-2">&quot;{row.texto}&quot;</div>
                            </div>
                          ))}
                        </div>

                        <button
                          type="button"
                          onClick={regenerateFallbackPrompts}
                          disabled={isRegeneratingFallbacks || isProcessingSrtPipeline}
                          className="w-full rounded-xl border border-orange-400/40 bg-orange-500/15 px-4 py-2 text-[10px] font-black uppercase tracking-[0.2em] text-orange-200 transition-all hover:bg-orange-500/25 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {isRegeneratingFallbacks ? 'REGENERANDO...' : `REGENERAR ${fallbackCount} ITEM${fallbackCount > 1 ? 'S' : ''}`}
                        </button>
                      </div>
                    );
                  })()}
                  {externalSrtPipeline && (
                    <button
                      type="button"
                      onClick={renderTextAssetsFromPipeline}
                      disabled={isPipelineRunning || isProcessingSrtPipeline || isRenderingTextAssets || !postScriptPackage}
                      className="w-full rounded-xl border border-amber-400/25 bg-amber-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-amber-200 transition-all hover:bg-amber-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isRenderingTextAssets ? 'GERANDO BATs...' : 'ETAPA 5 · GERAR BATs'}
                    </button>
                  )}
                  <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                    {externalSrtPipeline?.generatedAt
                      ? `Pipeline persistido em ${new Date(externalSrtPipeline.generatedAt).toLocaleString('pt-BR')}.`
                      : 'Nenhum pipeline processado ainda.'}
                  </div>
                  <div className="space-y-2 rounded-2xl border border-white/10 bg-white/[0.02] p-3">
                    <label className="text-[9px] font-black uppercase tracking-widest text-blue-300">Pacote pos-roteiro</label>
                    <button
                      type="button"
                      onClick={generatePostScriptPackage}
                      disabled={isPipelineRunning || isGeneratingPostScriptPackage || !canProcessPostScriptPackage}
                      className="w-full rounded-xl border border-blue-400/25 bg-blue-500/10 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 transition-all hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {isGeneratingPostScriptPackage ? 'PROCESSANDO PACOTE...' : postScriptPackage ? 'REPROCESSAR PACOTE POS-ROTEIRO' : 'PROCESSAR PACOTE POS-ROTEIRO'}
                    </button>
                    <div className="rounded-xl border border-white/5 bg-black/15 px-3 py-2 text-[10px] text-white/65">
                      {!canProcessPostScriptPackage
                        ? 'Finalize o roteiro interno ou anexe um .txt externo para habilitar esta etapa.'
                        : postScriptPackage
                          ? `Pacote persistido em ${new Date(postScriptPackage.generatedAt).toLocaleString('pt-BR')}.`
                          : 'Nenhum pacote pos-roteiro processado ainda.'}
                    </div>
                  </div>
                  {externalSrtPipeline && (
                    <div className="space-y-2 rounded-2xl border border-emerald-500/20 bg-emerald-500/[0.02] p-3">
                      <label className="text-[9px] font-black uppercase tracking-widest text-emerald-300">Visualização de Storyboard</label>
                      <button
                        type="button"
                        onClick={openStoryboardInNewTab}
                        className="w-full rounded-xl border border-emerald-400/35 bg-emerald-500/15 px-4 py-3 text-[10px] font-black uppercase tracking-[0.2em] text-emerald-200 transition-all hover:bg-emerald-500/25 active:scale-95 flex items-center justify-center gap-2"
                      >
                        <span>🎬 ABRIR STORYBOARD EM NOVA ABA</span>
                      </button>
                      <div className="rounded-xl border border-emerald-500/10 bg-black/15 px-3 py-2 text-[10px] text-emerald-300/70">
                        Gere a visualização instantânea do roteiro com ilustrações SVG dinâmicas.
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* DIREÇÃO DE ARTE & ELENCO CONSISTENTE (FULL WIDTH & GRADE) */}
              <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-white/10 pb-4">
                  <div>
                    <span className="text-[12px] font-black uppercase tracking-[0.2em] text-cyan-300">🎨 Direção de Arte & Elenco Consistente</span>
                    <p className="text-[10px] text-white/40 mt-1">Defina a ambientação visual e gerencie o elenco para consistência via colchetes [Nome].</p>
                  </div>
                  {visualBlueprintCast.length > 0 && (
                    <button
                      type="button"
                      onClick={copyAllCharacterPrompts}
                      className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-4 py-2.5 text-[9px] font-bold text-cyan-200 transition-all hover:bg-cyan-500/20 active:scale-95 flex items-center gap-2 uppercase tracking-wider"
                    >
                      <span>📋 Copiar Todos os Prompts (Elenco)</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  {/* Cenário / Estilo Geral */}
                  <div className="rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Cenário / Estilo Geral (PT-BR)</label>
                    <textarea
                      value={visualBlueprintSetting}
                      onChange={(e) => {
                        const val = e.target.value;
                        setVisualBlueprintSetting(val);
                        persistExecutionSnapshotLocally({ visualBlueprintSetting: val });
                      }}
                      placeholder="Ex: Fantasia sombria Warhammer 40k, catedral espacial gotica gelida..."
                      className="w-full min-h-[140px] resize-y rounded-xl border border-white/10 bg-midnight/45 px-3 py-2 text-[11px] leading-relaxed text-white/80 outline-none focus:border-cyan-300/40"
                    />
                    <p className="text-[9px] text-white/35 leading-relaxed">
                      Descreva a atmosfera, iluminação e visual de fundo geral. O pipeline combina este estilo com as cenas geradas.
                    </p>
                  </div>

                  {/* Elenco de Personagens */}
                  <div className="lg:col-span-2 rounded-2xl border border-white/5 bg-black/20 p-4 space-y-3">
                    <label className="block text-[9px] font-black uppercase tracking-widest text-cyan-300/80">Elenco Narrativo ({visualBlueprintCast.length})</label>
                    {visualBlueprintCast.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-10 text-center border border-dashed border-white/10 rounded-xl bg-black/10">
                        <p className="text-[11px] text-white/35 italic">Nenhum personagem extraído ainda.</p>
                        <p className="text-[9px] text-white/20 mt-1 max-w-xs">
                          Anexe o arquivo do roteiro (.txt) no painel superior e clique em &quot;Analisar Direção de Arte & Elenco&quot; para gerar.
                        </p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[300px] overflow-y-auto pr-1">
                        {visualBlueprintCast.map((char, index) => (
                          <div key={index} className="rounded-xl border border-white/5 bg-midnight/40 p-3.5 space-y-2 flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between border-b border-white/5 pb-2">
                                <span className="font-bold text-[11px] text-cyan-200 tracking-wide">{char.name}</span>
                                <button
                                  type="button"
                                  onClick={() => copyTextToClipboard(getCharacterSheetPrompt(char), `Prompt de ${char.name} copiado!`)}
                                  className="rounded-lg bg-cyan-500/10 border border-cyan-500/20 px-2.5 py-1 text-[9px] font-bold text-cyan-300 hover:bg-cyan-500/20 transition-all uppercase tracking-wider flex items-center gap-1.5"
                                >
                                  <span>📋 Copiar Prompt</span>
                                </button>
                              </div>
                              <textarea
                                value={char.description}
                                onChange={(e) => {
                                  const updatedCast = [...visualBlueprintCast];
                                  updatedCast[index] = { ...char, description: e.target.value };
                                  setVisualBlueprintCast(updatedCast);
                                  persistExecutionSnapshotLocally({ visualBlueprintCast: updatedCast });
                                }}
                                className="w-full min-h-[70px] bg-transparent border-0 text-[10px] leading-relaxed text-white/70 italic resize-y p-0 outline-none focus:text-white"
                              />
                            </div>
                            <div className="text-[8px] text-cyan-400/35 text-right font-mono tracking-wider">
                              Use [{char.name}] no roteiro para vincular
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>


              {(isProcessingSrtPipeline || isRenderingTextAssets || externalSrtPipeline) && (
                <div className="rounded-2xl border border-purple-400/20 bg-purple-500/[0.04] p-5 space-y-4">
                  <div className="space-y-4">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-end xl:justify-between">
                      <div className="space-y-2 max-w-3xl">
                      <p className="text-[10px] font-black uppercase tracking-[0.28em] text-purple-200">Pipeline SRT adaptado ao app</p>
                      <p className="text-sm font-black text-white">
                        {(isProcessingSrtPipeline || isRenderingTextAssets)
                          ? srtPipelineStatus || (isRenderingTextAssets ? 'Executando a etapa 5 sobre o CSV persistido...' : 'Executando as etapas 2, 3 e 4 sobre o .srt anexado...')
                          : srtPipelineStatus || 'CSV base, assets e prompts persistidos nesta execucao.'}
                      </p>
                      <p className="text-[11px] text-white/50 leading-relaxed">
                        Etapa 1 fica coberta pelo upload do arquivo. A partir daqui o app replica a conversao para CSV, a marcacao heuristica de assets, a geracao dos prompts visuais e o render dos assets marcados como texto.
                      </p>
                    </div>
                      <div className="rounded-xl border border-purple-300/15 bg-black/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-purple-100">
                        {isProcessingSrtPipeline ? 'Processando' : isRenderingTextAssets ? 'Renderizando' : externalSrtPipeline ? 'Persistido' : 'Aguardando'}
                      </div>
                    </div>

                    {externalSrtPipeline && (
                      <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-7 gap-3">
                        {[
                          { label: 'Linhas', value: externalSrtPipeline.stats.total },
                          { label: 'Texto', value: externalSrtPipeline.stats.texto },
                          { label: 'Avatar', value: externalSrtPipeline.stats.avatar },
                          { label: 'Video', value: externalSrtPipeline.stats.video },
                          { label: 'Imagem', value: externalSrtPipeline.stats.image },
                          { label: 'Hyperframe', value: externalSrtPipeline.stats.hyperframe },
                          { label: 'Render', value: externalSrtPipeline.rows.filter((row) => row.caminho).length },
                        ].map((item) => (
                          <div key={item.label} className="rounded-2xl border border-white/10 bg-midnight/40 px-4 py-3">
                            <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">{item.label}</span>
                            <span className="block text-sm font-black text-white">{item.value}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                    <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Observador de status</p>
                        <p className="text-[10px] text-white/40 mt-1">Mostra em qual ponto da adaptacao o app esta e o que ja foi concluido.</p>
                      </div>
                      <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[10px] text-white/55">
                        {isProcessingSrtPipeline ? 'Processando agora' : isRenderingTextAssets ? 'Renderizando textos' : externalSrtPipeline ? 'Pipeline pronto' : 'Aguardando processamento'}
                      </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 xl:grid-cols-6">
                      {externalSrtObserver.map((step) => (
                        <div key={step.key} className="rounded-2xl border border-white/8 bg-black/15 px-4 py-4 space-y-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`inline-flex h-2.5 w-2.5 rounded-full ${
                                step.status === 'done'
                                  ? 'bg-emerald-400'
                                  : step.status === 'running'
                                    ? 'bg-blue-400 animate-pulse'
                                    : step.status === 'error'
                                      ? 'bg-red-400'
                                      : 'bg-white/20'
                              }`}
                            />
                            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-white/70">{step.label}</span>
                          </div>
                          <p
                            className={`text-[10px] font-black uppercase tracking-[0.16em] ${
                              step.status === 'done'
                                ? 'text-emerald-300'
                                : step.status === 'running'
                                  ? 'text-blue-300'
                                  : step.status === 'error'
                                    ? 'text-red-300'
                                    : 'text-white/30'
                            }`}
                          >
                            {step.status === 'done' ? 'Concluido' : step.status === 'running' ? 'Em execucao' : step.status === 'error' ? 'Erro' : 'Pendente'}
                          </p>
                          <p className="text-[10px] leading-5 text-white/45">{step.detail}</p>
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-2">
                    <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Onde os arquivos ficam</p>
                    <p className="text-[10px] leading-6 text-white/55">
                      O CSV base e os arquivos de prompts ficam persistidos dentro do snapshot local desta execucao e no snapshot do tema aprovado. Quando voce usa os botoes de exportacao, eles vao para a pasta de downloads padrao do navegador como `.csv` e `.txt`. Ja a etapa 5 escreve um CSV espelho e os videos de texto diretamente no pipeline externo, preservando os caminhos em `caminho`.
                    </p>
                  </div>

                  {externalSrtPipeline && (
                    <>
                      {/* Opções de Formatação de Prompts (Colchetes e Prefixo) */}
                      <div className="flex flex-col md:flex-row gap-4 bg-midnight/25 border border-white/10 rounded-2xl p-4 mb-4">
                        {/* Checkbox global de colchetes */}
                        <div className="flex-1">
                          <label className="relative flex items-start gap-3 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={preserveBrackets}
                              onChange={(e) => {
                                setPreserveBrackets(e.target.checked);
                                persistExecutionSnapshotLocally({ preserveBrackets: e.target.checked });
                              }}
                              className="w-4.5 h-4.5 rounded border border-white/10 bg-black/40 text-blue-500 focus:ring-0 focus:ring-offset-0 cursor-pointer accent-blue-500 mt-0.5"
                            />
                            <div>
                              <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:text-white transition-colors">
                                Preservar [Colchetes] de Personagens Consistentes
                              </span>
                              <span className="block text-[9px] text-white/40 mt-1 leading-relaxed">
                                Marque para manter a tag original do personagem (ex: <strong>[Grey Knight]</strong>) nos prompts copiado/exportados. Desmarque para expandir a descrição física.
                              </span>
                            </div>
                          </label>
                        </div>

                        {/* Divisor vertical para telas maiores */}
                        <div className="hidden md:block w-px bg-white/10 self-stretch" />

                        {/* Seletor de Prefixo */}
                        <div className="flex flex-col gap-2 shrink-0 md:w-80">
                          <div>
                            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-white/75">
                              Prefixo do Prompt
                            </span>
                            <span className="block text-[9px] text-white/40 mt-1 leading-relaxed">
                              Prependido no início absoluto de cada linha de prompt.
                            </span>
                          </div>
                          <div className="flex items-center gap-1 bg-black/40 p-1 border border-white/10 rounded-xl">
                            {[
                              { value: 'none', label: 'Nenhum' },
                              { value: '[IV]', label: '[IV]' },
                              { value: '[I]', label: '[I]' },
                              { value: '[V]', label: '[V]' }
                            ].map((opt) => (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => {
                                  setPromptPrefix(opt.value);
                                  persistExecutionSnapshotLocally({ promptPrefix: opt.value });
                                }}
                                className={`flex-1 text-center py-1.5 rounded-lg text-[9px] font-black uppercase tracking-wider transition-all ${
                                  promptPrefix === opt.value
                                    ? 'bg-blue-500 text-white shadow'
                                    : 'text-white/40 hover:text-white/70 hover:bg-white/5'
                                }`}
                              >
                                {opt.label}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                              <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  copyTextToClipboard(compileUnifiedImagePrompts(), 'Prompts copiados.');
                                }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadTextArtifact(srtArtifactStem, 'prompts_imagem', compileUnifiedImagePrompts());
                                }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                              </div>
                            </div>
                          </div>
                          {/* Inline error banner */}
                          {hfBgPrompts?.[0]?.rowNumber === -1 && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-[11px] text-red-300">
                              ❌ {hfBgPrompts[0].prompt}
                            </div>
                          )}
                          {/* Success banner */}
                          {hfBgPrompts && hfBgPrompts[0]?.rowNumber !== -1 && (
                            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-2 text-[11px] text-violet-300">
                              ✅ {hfBgPrompts.length} fundo(s) gerado(s) — veja abaixo no textarea
                            </div>
                          )}
                          <textarea
                            readOnly
                            value={compileUnifiedImagePrompts() || 'Nenhum prompt de imagem foi gerado para este SRT.'}
                            className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                          />
                        </div>
                      </div>

                      {/* Painel de Prompts Mesclados Híbridos (Vídeo + Imagem) - ABAIXO */}
                      {externalSrtPipeline && (() => {
                        const compileHybridPromptsText = () => {
                          if (externalSrtPipeline.hybridPromptsTxt) {
                            return compilePromptText(externalSrtPipeline.hybridPromptsTxt);
                          }
                          const lines: string[] = [];
                          const isFaceless = videoFormat === 'faceless' || videoFormat === 'catalog';

                          externalSrtPipeline.rows.forEach((row) => {
                            const type = normalizeAssetType(row.asset);
                            if (type !== 'vídeo' && type !== 'imagem' && type !== 'hyperframe') return;

                            let rawPrompt = sanitizePrompt(row.prompt || '');
                            if (!rawPrompt) {
                              if (type === 'imagem') {
                                rawPrompt = `Photorealistic still image of ${row.texto.slice(0, 60).trim()}.`;
                              } else {
                                rawPrompt = `3D technical animation of ${row.texto.slice(0, 60).trim()}. Ambient sound only, no dialogue, no voice-over.`;
                              }
                            }

                            const isHf = type === 'hyperframe';
                            if (isHf && !isFaceless) return;

                            const prefix = isHf && isFaceless ? `${row.rowNumber}-HF` : `${row.rowNumber}`;
                            const charPrefix = promptPrefix !== 'none' ? `${promptPrefix} ` : '';

                            if (type === 'imagem') {
                              const cleanP = cleanImagePromptBoilerplates(rawPrompt);
                              lines.push(`[I] ${charPrefix}${prefix}: ${cleanP}`);
                            } else if (type === 'vídeo' || (isHf && isFaceless)) {
                              const cleanP = cleanHeyGenPrefixes(rawPrompt);
                              lines.push(`[IV] ${charPrefix}${prefix}: ${cleanP}`);
                            }
                          });
                          return lines.join('\n');
                        };

                        const hybridContent = compileHybridPromptsText();
                        if (!hybridContent && !useHybridAssets) return null;

                        return (
                          <div className="rounded-2xl border border-cyan-400/30 bg-cyan-500/[0.04] p-4 space-y-3 mt-4 mb-4">
                            <div className="flex items-center justify-between gap-3">
                              <div>
                                <p className="text-[10px] font-black uppercase tracking-[0.28em] text-cyan-300 flex items-center gap-1.5">
                                  <span>🔀 Prompts Mesclados Híbridos (Vídeo + Imagem)</span>
                                </p>
                                <p className="text-[10px] text-white/50 mt-0.5 leading-relaxed">
                                  Lista sequencial contínua da timeline do SRT. Imagens marcadas com <strong className="text-cyan-300">[I]</strong> e vídeos com <strong className="text-cyan-300">[IV]</strong>.
                                </p>
                              </div>
                              <div className="flex gap-2 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => copyTextToClipboard(hybridContent, 'Prompts híbridos (Vídeo + Imagem) copiados.')}
                                  className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
                                >
                                  <Copy size={12} className="inline mr-1" /> Copiar Híbrido
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadTextArtifact(srtArtifactStem, 'prompts_hibridos', hybridContent)}
                                  className="rounded-xl border border-cyan-400/30 bg-cyan-500/10 px-3.5 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 hover:bg-cyan-500/20 transition-all flex items-center gap-1.5"
                                >
                                  <FileText size={12} className="inline mr-1" /> TXT Híbrido
                                </button>
                              </div>
                            </div>
                            <textarea
                              readOnly
                              value={hybridContent || 'Nenhum prompt híbrido gerado.'}
                              className="w-full min-h-[140px] resize-y rounded-2xl border border-cyan-500/20 bg-black/40 px-4 py-4 text-[11px] leading-6 text-cyan-100/90 font-mono outline-none focus:border-cyan-400/40"
                            />
                          </div>
                        );
                      })()}
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompts de video</p>
                              <p className="text-[10px] text-white/40 mt-1">Saida equivalente ao arquivo `_prompts_video.txt`.</p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => copyTextToClipboard(compilePromptText(externalSrtPipeline.videoPromptsTxt), 'Prompts de video copiados.')}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadTextArtifact(srtArtifactStem, 'prompts_video', compilePromptText(externalSrtPipeline.videoPromptsTxt))}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                            </div>
                          </div>
                          <textarea
                            readOnly
                            value={compilePromptText(externalSrtPipeline.videoPromptsTxt) || 'Nenhum prompt de video foi gerado para este SRT.'}
                            className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                          />
                        </div>

                        <div className="rounded-2xl border border-white/10 bg-midnight/40 p-4 space-y-3">
                          <div className="flex items-center justify-between gap-3">
                            <div>
                              <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompts de imagem</p>
                              <p className="text-[10px] text-white/40 mt-1">
                                Saida equivalente ao arquivo `_prompts_imagem.txt`.{' '}
                                {(() => { const n = externalSrtPipeline.rows.filter(r => normalizeAssetType(r.asset) === 'hyperframe').length; return n > 0 ? <span className="text-violet-400">{n} HF detectado{n > 1 ? 's' : ''}</span> : <span className="text-white/20">0 HF</span>; })()}
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={async () => {
                                  if (videoFormat === 'faceless' || videoFormat === 'catalog') {
                                    alert('Nos formatos Faceless e Catálogo, os HyperFrames já são gerados como prompts de vídeo completos na seção de vídeos acima. Não é necessário gerar fundos de imagem.');
                                    return;
                                  }
                                  await generateHfBgPromptsInternal();
                                }}
                                disabled={isGeneratingHfBg}
                                className={`rounded-xl border px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] transition-all ${
                                  (videoFormat === 'faceless' || videoFormat === 'catalog')
                                    ? 'border-white/10 text-white/35 hover:bg-transparent cursor-pointer'
                                    : 'border-violet-500/30 text-violet-300 hover:border-violet-400/60 hover:text-violet-200'
                                }`}
                              >
                                {(videoFormat === 'faceless' || videoFormat === 'catalog') ? '🚫 Sem Fundos' : (isGeneratingHfBg ? '⏳ Gerando...' : '⚡ Fundos HF')}
                              </button>
                              <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() => {
                                  copyTextToClipboard(compileUnifiedImagePrompts(), 'Prompts copiados.');
                                }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  downloadTextArtifact(srtArtifactStem, 'prompts_imagem', compileUnifiedImagePrompts());
                                }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                              >
                                <FileText size={12} className="inline mr-2" /> TXT
                              </button>
                              </div>
                            </div>
                          </div>
                          {/* Inline error banner */}
                          {hfBgPrompts?.[0]?.rowNumber === -1 && (
                            <div className="rounded-xl border border-red-500/30 bg-red-500/8 px-4 py-3 text-[11px] text-red-300">
                              ❌ {hfBgPrompts[0].prompt}
                            </div>
                          )}
                          {/* Success banner */}
                          {hfBgPrompts && hfBgPrompts[0]?.rowNumber !== -1 && (
                            <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 px-4 py-2 text-[11px] text-violet-300">
                              ✅ {hfBgPrompts.length} fundo(s) gerado(s) — veja abaixo no textarea
                            </div>
                          )}
                          <textarea
                            readOnly
                            value={compileUnifiedImagePrompts() || 'Nenhum prompt de imagem foi gerado para este SRT.'}
                            className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                          />
                        </div>
                      </div>

                      {/* FCPXML CapCut Timeline Synchronizer */}
                      {!externalSrtPipeline ? (
                        <div className="rounded-2xl border border-white/5 bg-midnight/20 opacity-60 p-4 space-y-3">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2 text-white/40">
                              <span className="text-xs">🔒</span>
                              <p className="text-[11px] font-black uppercase tracking-[2px]">Sincronizador CapCut (Exportar FCPXML)</p>
                            </div>
                            <span className="text-[9px] bg-white/5 px-2 py-0.5 rounded text-white/50 uppercase tracking-widest font-black">Pendente</span>
                          </div>
                          <p className="text-[10px] text-white/30 leading-relaxed">
                            Gere um arquivo de linha de tempo XML (.fcpxml). <strong>Este recurso será liberado após o processamento do pipeline SRT</strong> para que todos os brolls (vídeos, imagens e textos renderizados) sejam sincronizados na timeline automaticamente.
                          </p>
                        </div>
                      ) : (
                        <div className="rounded-2xl border border-cyan-500/20 bg-midnight/40 overflow-hidden">
                          <div 
                            onClick={() => setIsCapcutExpanded(!isCapcutExpanded)}
                            className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors select-none group"
                          >
                            <div className="flex items-center gap-2 text-cyan-400">
                              <span className="text-xs">🎬</span>
                              <p className="text-[11px] font-black uppercase tracking-[2px]">Sincronizador CapCut (PC / Windows / Mac)</p>
                            </div>
                            <div className="flex items-center gap-3">
                              <span className="text-[9px] bg-cyan-500/20 px-2 py-0.5 rounded text-cyan-300 uppercase tracking-widest font-black animate-pulse">Disponível</span>
                              <div className={`p-1.5 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isCapcutExpanded ? 'rotate-180' : ''}`}>
                                <ChevronDown size={14} />
                              </div>
                            </div>
                          </div>

                          <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isCapcutExpanded ? 'grid-rows-[1fr] opacity-100 p-4 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
                            <div className="min-h-0 space-y-3 pt-3">
                              <p className="text-[10px] text-white/45 leading-relaxed">
                                Exporte a sua linha de tempo diretamente para o CapCut de três formas:
                              </p>
                              <ul className="list-disc pl-4 text-[10px] text-white/40 space-y-1">
                                <li><strong>Opção 1 (Substituir Rascunho - RECOMENDADO & MAIS SIMPLES):</strong> Baixe apenas o arquivo <code>draft_content.json</code>. No CapCut, crie um projeto novo (ou use um existente) e feche o programa. Vá na pasta desse projeto em <code>CapCut Drafts</code> (ex: <code>0608</code>) e substitua o <code>draft_content.json</code> existente pelo arquivo baixado. É o método mais rápido e direto!</li>
                                <li><strong>Opção 2 (Projeto Completo .zip):</strong> Exporta um arquivo ZIP contendo toda a pasta do projeto configurada. Basta extrair a pasta inteira dentro de <code>CapCut Drafts</code>.</li>
                                <li><strong>Opção 3 (FCPXML):</strong> Exporta uma timeline XML compatível. Importe no CapCut através do menu <em>Menu &gt; Arquivo &gt; Importar &gt; FCPXML</em> (disponível em algumas versões).</li>
                              </ul>
                              
                              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white/[0.02] border border-white/5 rounded-2xl p-4">
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Pasta Local dos Vídeos/Imagens</label>
                                  <input
                                    type="text"
                                    value={fcpxmlBaseDir}
                                    onChange={(e) => setFcpxmlBaseDir(e.target.value)}
                                    placeholder="Ex: D:/ContentFlow/assets/"
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] outline-none focus:border-cyan-400/40 transition-all placeholder:text-white/20"
                                  />
                                  <span className="text-[8px] text-white/30 block">Caminho da pasta local onde estão as mídias.</span>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Padrão de Nome dos Arquivos</label>
                                  <select
                                    value={fcpxmlNaming}
                                    onChange={(e) => setFcpxmlNaming(e.target.value as any)}
                                    className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] outline-none focus:border-cyan-400/40 transition-all"
                                  >
                                    <option value="index_prompt56">[Index]_[Prompt 56 Chars] (Ex: 1_Create_a_...)</option>
                                    <option value="index_only">Apenas Número (Ex: 1.mp4, 2.png)</option>
                                  </select>
                                  <span className="text-[8px] text-white/30 block">Selecione o formato dos nomes das suas mídias locais.</span>
                                </div>
                                <div className="space-y-1.5">
                                  <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Duração Bruta das Mídias</label>
                                  <div className="grid grid-cols-2 gap-2">
                                    <div className="space-y-1">
                                      <input
                                        type="number"
                                        step="0.5"
                                        min="1"
                                        value={fcpxmlVidDuration}
                                        onChange={(e) => setFcpxmlVidDuration(Number(e.target.value))}
                                        placeholder="Vídeo (s)"
                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] outline-none focus:border-cyan-400/40 transition-all text-center"
                                        title="Duração padrão do vídeo bruto gerado (ex: Kling/Runway - 8s)"
                                      />
                                      <span className="text-[8px] text-white/30 text-center block">Vídeo (s)</span>
                                    </div>
                                    <div className="space-y-1">
                                      <input
                                        type="number"
                                        step="0.5"
                                        min="1"
                                        value={fcpxmlImgDuration}
                                        onChange={(e) => setFcpxmlImgDuration(Number(e.target.value))}
                                        placeholder="Imagem (s)"
                                        className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] outline-none focus:border-cyan-400/40 transition-all text-center"
                                        title="Duração padrão de exibição da imagem estática (ex: 5s)"
                                      />
                                      <span className="text-[8px] text-white/30 text-center block">Imagem (s)</span>
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Configurações Avançadas do Sincronizador SRT */}
                              <div className="bg-white/[0.02] border border-white/5 rounded-2xl p-4 space-y-4">
                                <p className="text-[10px] font-black uppercase tracking-wider text-cyan-400">Configurações Avançadas & Sincronia SRT</p>
                                
                                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                                  {/* Aspect Ratio */}
                                  <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Proporção (Aspect Ratio)</label>
                                    <select
                                      value={fcpxmlAspectRatio}
                                      onChange={(e) => setFcpxmlAspectRatio(e.target.value as any)}
                                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] outline-none focus:border-cyan-400/40 transition-all"
                                    >
                                      <option value="horizontal">Horizontal (16:9 - YouTube)</option>
                                      <option value="vertical">Vertical (9:16 - TikTok/Shorts)</option>
                                    </select>
                                    <span className="text-[8px] text-white/30 block">Resolução de saída da timeline do CapCut.</span>
                                  </div>

                                  {/* Cut Mode */}
                                  <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Modo de Corte (Trim Mode)</label>
                                    <select
                                      value={cutMode}
                                      onChange={(e) => setCutMode(e.target.value as any)}
                                      className="w-full bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-white text-[11px] outline-none focus:border-cyan-400/40 transition-all"
                                    >
                                      <option value="middle">Centralizado (Middle)</option>
                                      <option value="start">Início (Start)</option>
                                      <option value="end">Fim (End)</option>
                                    </select>
                                    <span className="text-[8px] text-white/30 block">Qual região do video cortar se ele for mais longo que a fala.</span>
                                  </div>

                                  {/* Video Scan Info */}
                                  <div className="space-y-1.5">
                                    <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Arquivos Escaneados</label>
                                    <div className="bg-black/30 border border-white/10 rounded-xl px-3 py-2 text-[11px] text-white/80 h-9 flex items-center justify-between">
                                      <span>{Object.keys(scannedFilesMap).length} arquivo(s) mapeado(s)</span>
                                      {Object.keys(scannedFilesMap).length > 0 && (
                                        <button
                                          type="button"
                                          onClick={() => setScannedFilesMap({})}
                                          className="text-[9px] text-red-400 hover:text-red-300 font-bold uppercase transition-colors"
                                        >
                                          Limpar
                                        </button>
                                      )}
                                    </div>
                                    <span className="text-[8px] text-white/30 block">Durações reais detectadas nas pastas locais.</span>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 border-t border-white/5 pt-3">
                                  {/* Smart Speedup */}
                                  <div className="space-y-1.5 p-3 rounded-xl bg-black/20 border border-white/5">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Aceleração Inteligente</label>
                                      <input
                                        type="checkbox"
                                        checked={smartSpeedUp}
                                        onChange={(e) => setSmartSpeedUp(e.target.checked)}
                                        className="rounded border-white/15 bg-black/30 text-cyan-500 focus:ring-0 cursor-pointer"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[8px] text-white/30">Mínimo para acelerar:</span>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={targetMinDuration}
                                        onChange={(e) => setTargetMinDuration(parseFloat(e.target.value))}
                                        disabled={!smartSpeedUp}
                                        className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-0.5 text-white text-[10px] outline-none disabled:opacity-40 text-center"
                                      />
                                      <span className="text-[8px] text-white/30">segundos</span>
                                    </div>
                                    <p className="text-[8px] text-white/30 block mt-1 leading-normal">
                                      Acelera suavemente vídeos ligeiramente maiores que o tempo da fala, evitando cortes secos.
                                    </p>
                                  </div>

                                  {/* Smart Slowdown */}
                                  <div className="space-y-1.5 p-3 rounded-xl bg-black/20 border border-white/5">
                                    <div className="flex items-center justify-between">
                                      <label className="text-[9px] font-black uppercase tracking-wider text-white/45">Desaceleração Inteligente</label>
                                      <input
                                        type="checkbox"
                                        checked={smartSlowDown}
                                        onChange={(e) => setSmartSlowDown(e.target.checked)}
                                        className="rounded border-white/15 bg-black/30 text-cyan-500 focus:ring-0 cursor-pointer"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2 mt-1">
                                      <span className="text-[8px] text-white/30">Máximo para desacelerar:</span>
                                      <input
                                        type="number"
                                        step="0.1"
                                        value={targetMaxDuration}
                                        onChange={(e) => setTargetMaxDuration(parseFloat(e.target.value))}
                                        disabled={!smartSlowDown}
                                        className="w-16 bg-black/30 border border-white/10 rounded-lg px-2 py-0.5 text-white text-[10px] outline-none disabled:opacity-40 text-center"
                                      />
                                      <span className="text-[8px] text-white/30">segundos</span>
                                    </div>
                                    <p className="text-[8px] text-white/30 block mt-1 leading-normal">
                                      Desacelera suavemente (até 0.8x) vídeos um pouco menores que o tempo da fala para preencher o tempo.
                                    </p>
                                  </div>
                                </div>

                                {/* Folder Scanner API */}
                                <div className="border-t border-white/5 pt-3 space-y-2">
                                  <label className="text-[9px] font-black uppercase tracking-wider text-white/45 block">Escaneamento Dinâmico de Durações (Local Host)</label>
                                  <p className="text-[9px] text-white/30 leading-normal">
                                    Conecte-se às pastas locais do projeto no seu PC para obter a duração real dos vídeos brutos. Isso garante uma sincronia perfeita na linha de tempo do CapCut sem precisar digitar durações manualmente.
                                  </p>
                                  
                                  <div className="flex flex-col sm:flex-row gap-2">
                                    <button
                                      type="button"
                                      disabled={isScanning}
                                      onClick={() => handleScanFolder(false)}
                                      className="flex-1 rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-cyan-200 transition-all hover:bg-cyan-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
                                    >
                                      {isScanning ? (
                                        <Loader2 size={12} className="animate-spin text-cyan-400" />
                                      ) : (
                                        <FolderOpen size={12} className="text-cyan-400" />
                                      )}
                                      {mainFolderHandle ? `✅ Pasta Vídeos Conectada` : `Selecionar Pasta de Vídeos`}
                                    </button>
                                    
                                    <button
                                      type="button"
                                      disabled={isScanning}
                                      onClick={() => handleScanFolder(true)}
                                      className="flex-1 rounded-xl border border-purple-500/30 bg-purple-500/10 px-3 py-2 text-[10px] font-black uppercase tracking-wider text-purple-200 transition-all hover:bg-purple-500/20 disabled:opacity-40 flex items-center justify-center gap-2"
                                    >
                                      {isScanning ? (
                                        <Loader2 size={12} className="animate-spin text-purple-400" />
                                      ) : (
                                        <FolderOpen size={12} className="text-purple-400" />
                                      )}
                                      {extraFolderHandle ? `✅ Pasta Imagens Conectada` : `Selecionar Pasta de Imagens`}
                                    </button>
                                  </div>
                                </div>
                              </div>

                              <div className="flex flex-wrap justify-end gap-2 pt-1">
                                <button
                                  type="button"
                                  onClick={handleExportCapcutJson}
                                  className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-200 transition-all hover:bg-emerald-500/20 active:scale-95 flex items-center gap-2"
                                >
                                  📄 Baixar JSONs do Rascunho (draft_content & draft_meta_info)
                                </button>
                                <button
                                  type="button"
                                  onClick={handleExportCapcutZip}
                                  className="rounded-xl border border-violet-500/30 bg-violet-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-violet-200 transition-all hover:bg-violet-500/20 active:scale-95 flex items-center gap-2"
                                >
                                  📦 Exportar Projeto Completo (.zip)
                                </button>
                                <button
                                  type="button"
                                  onClick={handleExportFcpxml}
                                  className="rounded-xl border border-cyan-500/30 bg-cyan-500/10 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.16em] text-cyan-200 transition-all hover:bg-cyan-500/20 active:scale-95 flex items-center gap-2"
                                >
                                  🎬 Exportar Timeline para CapCut (.fcpxml)
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      <div className="rounded-2xl border border-white/10 bg-midnight/40 overflow-hidden">
                        <div 
                          onClick={() => setIsTimelineExpanded(!isTimelineExpanded)}
                          className="flex items-center justify-between p-4 cursor-pointer hover:bg-white/[0.03] transition-colors select-none group"
                        >
                          <div className="flex items-center gap-3">
                            <div className="p-2 bg-blue-500/10 rounded-lg group-hover:bg-blue-500/20 transition-colors">
                              <Database size={16} className="text-blue-400" />
                            </div>
                            <div>
                              <p className="text-[11px] font-black uppercase tracking-[2px] text-white/60 group-hover:text-white transition-colors block">Preview da timeline CSV</p>
                              <p className="text-[9px] text-white/30 tracking-widest">{externalSrtPipeline.rows.length} assets rastreados</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className={`p-2 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isTimelineExpanded ? 'rotate-180' : ''}`}>
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>

                        <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isTimelineExpanded ? 'grid-rows-[1fr] opacity-100 p-4 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
                          <div className="min-h-0 space-y-3 pt-3">
                            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                              <div>
                                <p className="text-[10px] text-white/40 mt-1">A estrutura abaixo replica o CSV base das etapas 2 e 3, ja com a coluna `prompt` preenchida na etapa 4.</p>
                              </div>
                              <div className="flex gap-2">
                                <button
                                  type="button"
                                  onClick={() => copyTextToClipboard(buildSfxEnrichedCsvContent(externalSrtPipeline.csvContent, postScriptPackage?.sfxTimelineTxt), 'CSV base copiado.')}
                                  className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                                >
                                  <Copy size={12} className="inline mr-2" /> Copiar CSV
                                </button>
                                <button
                                  type="button"
                                  onClick={() => downloadTextArtifact(srtArtifactStem, 'timeline_assets', buildSfxEnrichedCsvContent(externalSrtPipeline.csvContent, postScriptPackage?.sfxTimelineTxt), { extension: 'csv', mimeType: 'text/csv;charset=utf-8' })}
                                  className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                                >
                                  <FileText size={12} className="inline mr-2" /> Exportar CSV
                                </button>
                              </div>
                            </div>

                            <div className="overflow-x-auto rounded-2xl border border-white/5 bg-black/15">
                              <table className="min-w-full text-left text-[11px] text-white/75">
                                <thead className="bg-white/[0.03] text-[9px] uppercase tracking-[0.2em] text-white/35">
                                  <tr>
                                    <th className="px-4 py-3">#</th>
                                    <th className="px-4 py-3">Inicio</th>
                                    <th className="px-4 py-3">Fim</th>
                                    <th className="px-4 py-3">Asset</th>
                                    <th className="px-4 py-3">Texto</th>
                                    <th className="px-4 py-3">Prompt</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {externalSrtPipeline.rows.slice(0, 8).map((row) => (
                                    <tr key={row.rowNumber} className="border-t border-white/5 align-top">
                                      <td className="px-4 py-3 font-black text-white/60">{row.rowNumber}</td>
                                      <td className="px-4 py-3">{row.startTime}</td>
                                      <td className="px-4 py-3">{row.endTime}</td>
                                      <td className="px-4 py-3 font-black text-blue-200">{row.asset || '-'}</td>
                                      <td className="px-4 py-3 max-w-[260px] leading-5 text-white/70">{row.texto}</td>
                                      <td className="px-4 py-3 max-w-[320px] leading-5 text-white/55">{row.prompt || '—'}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                            {externalSrtPipeline.rows.length > 8 && (
                              <p className="text-[10px] text-white/35">
                                Preview mostrando as primeiras 8 linhas. O CSV completo fica persistido nesta execucao e pode ser exportado.
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="rounded-2xl border border-white/10 bg-midnight/40 overflow-hidden">
                        <div 
                          onClick={() => setIsStep5Expanded(!isStep5Expanded)}
                          className="flex flex-col gap-3 xl:flex-row xl:items-start xl:justify-between p-4 cursor-pointer hover:bg-white/[0.02] transition-colors select-none group"
                        >
                          <div>
                            <p className="text-[9px] font-black uppercase tracking-[0.28em] text-amber-300">Etapa 5 · Scripts BAT (Offline)</p>
                            <p className="text-[10px] text-white/40 mt-1">
                              Gera e baixa automaticamente os scripts `.bat` para renderizar Textos, Hyperframes e SFX localmente na sua máquina.
                            </p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {externalSrtPipeline.textRender?.csvPath && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); copyTextToClipboard(externalSrtPipeline.textRender?.csvPath || '', 'Caminho do CSV espelho copiado.'); }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-amber-400/30 hover:text-amber-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar CSV espelho
                              </button>
                            )}
                            {externalSrtPipeline.textRender?.outputDir && (
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); copyTextToClipboard(externalSrtPipeline.textRender?.outputDir || '', 'Pasta de renders copiada.'); }}
                                className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-amber-400/30 hover:text-amber-200"
                              >
                                <Copy size={12} className="inline mr-2" /> Copiar pasta de render
                              </button>
                            )}
                            <div className={`p-1.5 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isStep5Expanded ? 'rotate-180' : ''}`}>
                              <ChevronDown size={14} />
                            </div>
                          </div>
                        </div>

                        <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isStep5Expanded ? 'grid-rows-[1fr] opacity-100 p-4 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
                          <div className="min-h-0 space-y-3 pt-3">
                            {externalSrtPipeline.textRender ? (
                              <>
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-4">
                                  <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                                    <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">Novos renders</span>
                                    <span className="block text-sm font-black text-white">{externalSrtPipeline.textRender.renderedCount}</span>
                                  </div>
                                  <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3">
                                    <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">Reutilizados</span>
                                    <span className="block text-sm font-black text-white">{externalSrtPipeline.textRender.reusedCount}</span>
                                  </div>
                                  <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-3 xl:col-span-2">
                                    <span className="block text-[9px] uppercase font-black tracking-[3px] text-white/25 mb-1">Ultima renderizacao</span>
                                    <span className="block text-sm font-black text-white">{new Date(externalSrtPipeline.textRender.lastRenderedAt).toLocaleString('pt-BR')}</span>
                                  </div>
                                </div>
                                <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                                  <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                                    <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/35 mb-2">CSV espelho no pipeline externo</p>
                                    <p className="text-[11px] leading-6 text-white/75 break-all">{externalSrtPipeline.textRender.csvPath}</p>
                                  </div>
                                  <div className="rounded-2xl border border-white/10 bg-black/15 px-4 py-4">
                                    <p className="text-[9px] font-black uppercase tracking-[0.28em] text-white/35 mb-2">Pasta de saida dos MP4s</p>
                                    <p className="text-[11px] leading-6 text-white/75 break-all">{externalSrtPipeline.textRender.outputDir}</p>
                                  </div>
                                </div>
                                <textarea
                                  readOnly
                                  value={externalSrtPipeline.textRender.log || 'Sem log de render disponivel.'}
                                  className="w-full min-h-[80px] resize-y rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-6 text-white/80 outline-none"
                                />
                              </>
                            ) : (
                              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                                A etapa 5 ainda nao foi disparada. Quando voce clicar em <span className="font-black text-amber-200">ETAPA 5 · GERAR BATS</span>, o app vai processar e baixar automaticamente todos os scripts necessários para a produção offline dos recursos do projeto. Certifique-se de ter gerado o Pacote Pós-Roteiro primeiro.
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}


        {(canProcessPostScriptPackage || !!postScriptPackage) && (
          <div className="mx-6 xl:mx-8 mt-6 rounded-[32px] border border-blue-500/15 bg-blue-500/[0.03] overflow-hidden shadow-[0_0_40px_rgba(59,130,246,0.06)]">
            <div 
              onClick={() => setIsPostPackageExpanded(!isPostPackageExpanded)}
              className="flex items-center justify-between p-6 xl:p-8 cursor-pointer hover:bg-blue-500/5 transition-colors select-none group"
            >
              <div className="flex items-start gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20 transition-colors mt-1">
                  <Sparkles size={24} className="text-blue-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.38em] text-blue-300">Pacote pos-roteiro</p>
                  <h4 className="text-xl font-black text-white mt-1 group-hover:text-blue-100 transition-colors">Saidas prontas para publicacao</h4>
                  <p className="text-[11px] leading-6 text-white/50 mt-1 max-w-2xl">
                    Esta etapa deriva o roteiro final em titulos virais, descricao SEO com timestamps, prompt musical para Suno e uma timeline de SFX pronta para o editor.
                  </p>
                </div>
              </div>
              <div className="hidden xl:flex items-center gap-4">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); generatePostScriptPackage(); }}
                  disabled={isGeneratingPostScriptPackage || !canProcessPostScriptPackage}
                  className="rounded-2xl border border-blue-400/25 bg-blue-500/15 px-5 py-3 text-[10px] font-black uppercase tracking-[0.24em] text-blue-200 transition-all hover:border-blue-300/35 hover:bg-blue-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingPostScriptPackage ? 'GERANDO...' : postScriptPackage ? 'REGERAR PACOTE' : 'GERAR PACOTE'}
                </button>
                <div className={`p-2 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isPostPackageExpanded ? 'rotate-180' : ''}`}>
                  <ChevronDown size={20} />
                </div>
              </div>
            </div>

            <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isPostPackageExpanded ? 'grid-rows-[1fr] opacity-100 px-6 pb-6 xl:px-8 xl:pb-8 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="min-h-0 space-y-6 pt-6">
                {!canProcessPostScriptPackage && !postScriptPackage ? (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                Finalize o roteiro interno ou anexe um <span className="font-black text-blue-200">.txt externo</span> para liberar esta etapa.
              </div>
            ) : postScriptPackage ? (
              <>
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)_minmax(0,0.95fr)]">
                  <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                    {/* Header row */}
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">
                          {postScriptPackage.titles.length} título{postScriptPackage.titles.length !== 1 ? 's' : ''} virais
                        </p>
                        <p className="mt-1 text-[10px] text-white/40">
                          {titleValidations ? 'Validação concluída. Revise os vereditos abaixo.' : 'Opções persistidas para teste rápido.'}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.titles.map((title, index) => `${index + 1}. ${title}`).join('\n'), 'Titulos virais copiados.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>

                    {/* Titles list */}
                    <div className="space-y-2">
                      {postScriptPackage.titles.map((title, index) => {
                        const validation = titleValidations?.[index];
                        const verdictEmoji = validation
                          ? validation.score >= 4.5 ? '🟩' : validation.score >= 3.0 ? '🟨' : '🟥'
                          : null;
                        const verdictColor = validation
                          ? validation.score >= 4.5
                            ? 'text-emerald-300'
                            : validation.score >= 3.0
                              ? 'text-amber-300'
                              : 'text-red-300'
                          : '';
                        return (
                          <div key={`${index}-${title}`} className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">
                            <div className="flex items-start justify-between gap-2">
                              <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-white/35 mb-1 mt-0.5 shrink-0">
                                Opção {index + 1}
                              </span>
                              {validation && (
                                <span className={`text-[10px] font-black tabular-nums shrink-0 ${verdictColor}`}>
                                  {verdictEmoji} {validation.score}/6 · {validation.verdict}
                                </span>
                              )}
                            </div>
                            <p className="text-[13px] font-bold leading-6 text-white/90">{title}</p>
                          </div>
                        );
                      })}
                    </div>

                    {/* Action buttons */}
                    <div className="flex flex-col gap-2 pt-1">
                      {/* Step 1 → always visible: Validate */}
                      <button
                        type="button"
                        onClick={validateViralTitles}
                        disabled={isValidatingTitles || isRegeneratingTitles}
                        className="w-full rounded-xl border border-blue-400/20 bg-blue-500/8 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-blue-200 transition-all hover:bg-blue-500/15 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        {isValidatingTitles
                          ? 'VALIDANDO...'
                          : !titleValidations
                            ? 'VALIDAR TÍTULOS'
                            : titleValidations.some(v => v === null)
                              ? `VALIDAR NOVOS (${titleValidations.filter(v => v === null).length})`
                              : 'REVALIDAR TÍTULOS'}
                      </button>
                      {/* Step 2 → conditional: Regenerate (appears after validation) */}
                      {titleValidations && (
                        <button
                          type="button"
                          onClick={regenerateViralTitles}
                          disabled={isRegeneratingTitles || isValidatingTitles}
                          className="w-full rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-white/60 transition-all hover:border-blue-400/20 hover:text-blue-200 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          <RotateCcw size={11} className="inline mr-2" />
                          {isRegeneratingTitles
                            ? 'REGERANDO...'
                            : titleValidations
                              ? `REGERAR FRACOS (${titleValidations.filter(v => v !== null && v.verdict !== 'Aprovado').length})`
                              : 'REGERAR TÍTULOS'}
                        </button>
                      )}
                      {/* AI working indicator */}
                      {(isValidatingTitles || isRegeneratingTitles) && (
                        <div className="flex items-center gap-3 rounded-xl border border-blue-400/15 bg-blue-500/5 px-4 py-3">
                          <span className="relative flex h-2 w-2 shrink-0">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-blue-400 opacity-75" />
                            <span className="relative inline-flex h-2 w-2 rounded-full bg-blue-400" />
                          </span>
                          <p className="text-[10px] font-black uppercase tracking-[0.18em] text-blue-300">
                            {isValidatingTitles
                              ? 'IA avaliando os títulos com checklist estrutural...'
                              : 'IA gerando títulos substitutos...'}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Descricao SEO</p>
                        <p className="mt-1 text-[10px] text-white/40">Pronta para colar no YouTube com abertura, capitulos e aviso final.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.seoDescription, 'Descricao SEO copiada.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>
                    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4 space-y-4">
                      <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
                        <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Abertura</p>
                        <div className="mt-3 text-[11px] leading-7 text-white/80 whitespace-pre-wrap">
                          {seoDescriptionSections.intro || postScriptPackage.seoDescription}
                        </div>
                      </div>

                      {seoDescriptionSections.chapters.length > 0 && (
                        <div className="rounded-2xl border border-white/5 bg-white/[0.02] px-4 py-4">
                          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Capitulos</p>
                          <div className="mt-3 space-y-1.5">
                            {seoDescriptionSections.chapters.map((chapter, index) => (
                              <div key={`${chapter.timestamp}-${index}`} className="flex items-center gap-3 rounded-xl border border-white/5 bg-black/10 px-3 py-2.5">
                                <span className="shrink-0 rounded-lg border border-blue-400/20 bg-blue-500/10 px-2 py-1 font-mono text-[10px] font-black text-blue-200">
                                  {chapter.timestamp}
                                </span>
                                <span className="text-[11px] leading-6 text-white/80">{chapter.label}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {seoDescriptionSections.notice && (
                        <div className="rounded-2xl border border-amber-400/10 bg-amber-500/[0.04] px-4 py-4">
                          <p className="text-[9px] font-black uppercase tracking-[0.22em] text-amber-200">Aviso final</p>
                          <div className="mt-3 text-[11px] leading-7 text-white/75 whitespace-pre-wrap">
                            {seoDescriptionSections.notice}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Prompt Suno</p>
                        <p className="mt-1 text-[10px] text-white/40">Prompt musical persistido para gerar a trilha.</p>
                      </div>
                      <button
                        type="button"
                        onClick={() =>
                          copyTextToClipboard(
                            [postScriptPackage.sunoSuggestedTitle, postScriptPackage.sunoPrompt].filter(Boolean).join('\n'),
                            'Titulo e prompt Suno copiados.'
                          )
                        }
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                    </div>
                    {!!postScriptPackage.sunoSuggestedTitle && (
                      <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3">
                        <span className="block text-[9px] font-black uppercase tracking-[0.24em] text-white/35 mb-1">Suggested title</span>
                        <span className="block text-[12px] font-bold text-white/85">{postScriptPackage.sunoSuggestedTitle}</span>
                      </div>
                    )}
                    <div className="rounded-2xl border border-white/5 bg-black/20 px-4 py-4 text-[11px] leading-7 text-white/80 whitespace-pre-wrap">
                      {postScriptPackage.sunoPrompt}
                    </div>
                  </div>
                </div>

                <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                  <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
                    <div>
                      <p className="text-[9px] font-black uppercase tracking-[0.28em] text-blue-300">Preview da timeline SFX</p>
                      <p className="mt-1 text-[10px] text-white/40">Arquivo TXT persistido no snapshot e organizado como guia visual para a edicao.</p>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => copyTextToClipboard(postScriptPackage.sfxTimelineTxt, 'Timeline de SFX copiada.')}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <Copy size={12} className="inline mr-2" /> Copiar
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadTextArtifact(packageArtifactStem, 'sfx_timeline', postScriptPackage.sfxTimelineTxt)}
                        className="rounded-xl border border-white/10 px-3 py-2 text-[10px] font-black uppercase tracking-[0.16em] text-white/75 hover:border-blue-400/30 hover:text-blue-200"
                      >
                        <FileText size={12} className="inline mr-2" /> TXT
                      </button>
                    </div>
                  </div>

                  <div className="overflow-x-auto rounded-2xl border border-white/5 bg-black/15">
                    <table className="min-w-full text-left text-[11px] text-white/75">
                      <thead className="bg-white/[0.03] text-[9px] uppercase tracking-[0.2em] text-white/35">
                        <tr>
                          <th className="px-4 py-3">#</th>
                          <th className="px-4 py-3">Tempo</th>
                          <th className="px-4 py-3">Efeito</th>
                          <th className="px-4 py-3">Funcao</th>
                          <th className="px-4 py-3">Trecho</th>
                          <th className="px-4 py-3">Obs</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sfxTimelinePreview.length > 0 ? (
                          sfxTimelinePreview.map((item, index) => (
                            <tr key={item.id} className="border-t border-white/5 align-top">
                              <td className="px-4 py-4 font-black text-white/55">{index + 1}</td>
                              <td className="px-4 py-4 font-mono text-white/80">{item.timestamp}</td>
                              <td className="px-4 py-4 text-blue-200 font-semibold">{item.effect}</td>
                              <td className="px-4 py-4 leading-6">{item.purpose}</td>
                              <td className="px-4 py-4 leading-6 text-white/85">{item.excerpt}</td>
                              <td className="px-4 py-4 leading-6 text-white/60">{item.notes}</td>
                            </tr>
                          ))
                        ) : (
                          <tr className="border-t border-white/5">
                            <td colSpan={6} className="px-4 py-6 text-[11px] text-white/45">
                              Nenhum item de SFX disponivel ainda. Gere o pacote pos-roteiro para preencher este preview.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              </>
            ) : (
              <div className="rounded-2xl border border-dashed border-white/10 bg-black/10 px-4 py-6 text-[11px] leading-6 text-white/45">
                O pacote ainda nao foi processado. Clique em <span className="font-black text-blue-200">GERAR PACOTE POS-ROTEIRO</span> para derivar titulos, descricao SEO, Suno e a timeline de SFX.
              </div>
            )}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ TEMPLATE STUDIO ═══ */}
        <div className="mx-6 xl:mx-8 mt-6 rounded-[32px] border border-purple-500/15 bg-purple-500/[0.025] overflow-hidden shadow-[0_0_40px_rgba(168,85,247,0.05)]">
          <div
            onClick={() => setIsTemplateStudioExpanded(!isTemplateStudioExpanded)}
            className="flex items-center justify-between p-6 xl:p-8 cursor-pointer hover:bg-purple-500/5 transition-colors select-none group"
          >
            <div className="flex items-start gap-4">
              <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20 transition-colors mt-1">
                <Layout size={24} className="text-purple-400" />
              </div>
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.38em] text-purple-300">Template Studio</p>
                <h4 className="text-xl font-black text-white mt-1 group-hover:text-purple-100 transition-colors">Gerar templates com identidade do canal</h4>
                <p className="text-[11px] leading-6 text-white/50 mt-1 max-w-2xl">
                  Configure as cores, fonte e estilo do canal. O app gera e baixa os 10 templates HTML prontos para salvar na pasta <span className="font-black text-purple-200">Canal/Template HTML/</span>.
                </p>
              </div>
            </div>
            <div className="hidden xl:flex items-center gap-4">
              <div className={`p-2 rounded-full bg-white/5 text-white/40 group-hover:text-white group-hover:bg-white/10 transition-all duration-300 ${isTemplateStudioExpanded ? 'rotate-180' : ''}`}>
                <ChevronDown size={20} />
              </div>
            </div>
          </div>

          <div className={`transition-all duration-500 origin-top overflow-hidden grid ${isTemplateStudioExpanded ? 'grid-rows-[1fr] opacity-100 px-6 pb-6 xl:px-8 xl:pb-8 pt-0 border-t border-white/5' : 'grid-rows-[0fr] opacity-0'}`}>
            <div className="min-h-0 space-y-6 pt-6">

              {/* Color + Font config */}
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-purple-300">Identidade Visual</p>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Cor Primária</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={templatePrimaryColor}
                          onChange={(e) => setTemplatePrimaryColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={templatePrimaryColor}
                          onChange={(e) => setTemplatePrimaryColor(e.target.value)}
                          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] font-mono text-white/80 outline-none focus:border-purple-400/40"
                          maxLength={7}
                          placeholder="#RRGGBB"
                        />
                      </div>
                      <p className="text-[9px] text-white/30">Títulos e acentos principais</p>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Cor Secundária</label>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={templateSecondaryColor}
                          onChange={(e) => setTemplateSecondaryColor(e.target.value)}
                          className="w-10 h-10 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                        />
                        <input
                          type="text"
                          value={templateSecondaryColor}
                          onChange={(e) => setTemplateSecondaryColor(e.target.value)}
                          className="flex-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 text-[12px] font-mono text-white/80 outline-none focus:border-purple-400/40"
                          maxLength={7}
                          placeholder="#RRGGBB"
                        />
                      </div>
                      <p className="text-[9px] text-white/30">Métricas, glow e destaques</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Fonte</label>
                      <div className="relative">
                        <select
                          value={templateFontFamily}
                          onChange={(e) => setTemplateFontFamily(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-[#12121a] px-3 py-2.5 text-[12px] text-white/90 outline-none focus:border-purple-400/40 hover:border-white/20 transition-colors cursor-pointer"
                        >
                          <option value="Inter" className="bg-[#12121a] text-white">Inter (padrão)</option>
                          <option value="Outfit" className="bg-[#12121a] text-white">Outfit (moderno)</option>
                          <option value="Space Grotesk" className="bg-[#12121a] text-white">Space Grotesk (tech)</option>
                          <option value="Sora" className="bg-[#12121a] text-white">Sora (suave)</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <label className="text-[10px] font-black uppercase tracking-[0.2em] text-white/50">Perfil de Estilo</label>
                      <div className="relative">
                        <select
                          value={templateStyleProfile}
                          onChange={(e) => setTemplateStyleProfile(e.target.value)}
                          className="w-full appearance-none rounded-xl border border-white/10 bg-[#12121a] px-3 py-2.5 text-[12px] text-white/90 outline-none focus:border-purple-400/40 hover:border-white/20 transition-colors cursor-pointer"
                        >
                          <option value="Tech" className="bg-[#12121a] text-white">Tech / IA</option>
                          <option value="Business" className="bg-[#12121a] text-white">Business / Negócios</option>
                          <option value="Education" className="bg-[#12121a] text-white">Educação / Cursos</option>
                          <option value="Lifestyle" className="bg-[#12121a] text-white">Lifestyle / Motivação</option>
                        </select>
                        <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 pointer-events-none" />
                      </div>
                    </div>
                  </div>
                </div>

                {/* Preview swatch */}
                <div className="rounded-3xl border border-white/10 bg-midnight/35 p-5 space-y-4">
                  <p className="text-[9px] font-black uppercase tracking-[0.28em] text-purple-300">Preview de Cores</p>
                  
                  {/* Dynamic font injection for preview */}
                  <style dangerouslySetInnerHTML={{__html: `
                    @import url('https://fonts.googleapis.com/css2?family=${String(templateFontFamily || '').replace(/ /g, '+')}:wght@400;700;800;900&display=swap');
                  `}} />

                  <div className="rounded-2xl overflow-hidden border border-white/10 relative" style={{ background: '#0a0a14' }}>
                    <div className="p-6 space-y-3">
                      <div className="text-[11px] font-black uppercase tracking-widest" style={{ color: templatePrimaryColor }}>CANAL · INSIGHT PRINCIPAL</div>
                      <div className="text-2xl font-black text-white" style={{ fontFamily: `'${templateFontFamily}', Arial, sans-serif` }}>Título do Vídeo</div>
                      <div className="text-sm text-white/60">Subtítulo de contexto e informação</div>
                      <div className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-black" style={{ background: `${templatePrimaryColor}18`, border: `1px solid ${templatePrimaryColor}44`, color: templatePrimaryColor }}>
                        ◆ <span style={{ color: templateSecondaryColor }}>+340%</span>
                      </div>
                    </div>
                  </div>
                  <p className="text-[9px] text-white/30">Prévia aproximada. O resultado final é renderizado pelo Playwright.</p>
                </div>
              </div>

              {/* Generate button */}
              <div className="space-y-3">
                <button
                  type="button"
                  disabled={isGeneratingTemplates}
                  onClick={async () => {
                    setIsGeneratingTemplates(true);
                    setTemplateGenResult(null);
                    try {
                      const res = await fetch('/api/template-studio', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          primaryColor: templatePrimaryColor,
                          secondaryColor: templateSecondaryColor,
                          fontFamily: templateFontFamily,
                          styleProfile: templateStyleProfile,
                          channelName: activeProject?.name || activeProject?.project_name || 'Canal',
                        }),
                      });
                      const data = await res.json();
                      if (data.error) throw new Error(data.error);
                      await downloadTemplateZip(data.templates, data.meta);
                      setTemplateGenResult({ total: data.meta.total, missing: data.missing || [] });
                      showToast(`${data.meta.total} templates gerados e baixados!`);
                    } catch (err: any) {
                      showToast(`Erro: ${err.message || 'Falha ao gerar templates.'}`);
                    } finally {
                      setIsGeneratingTemplates(false);
                    }
                  }}
                  className="w-full rounded-2xl border border-purple-400/30 bg-purple-500/15 px-6 py-4 text-[11px] font-black uppercase tracking-[0.26em] text-purple-200 transition-all hover:border-purple-300/40 hover:bg-purple-500/20 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isGeneratingTemplates ? (
                    <span className="flex items-center justify-center gap-3">
                      <span className="relative flex h-2 w-2">
                        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-purple-400 opacity-75" />
                        <span className="relative inline-flex h-2 w-2 rounded-full bg-purple-400" />
                      </span>
                      GERANDO TEMPLATES...
                    </span>
                  ) : '⬇ GERAR E BAIXAR TEMPLATES DO CANAL'}
                </button>

                {templateGenResult && (
                  <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/8 px-5 py-4 space-y-2">
                    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">
                      ✓ {templateGenResult.total} template{templateGenResult.total !== 1 ? 's' : ''} gerado{templateGenResult.total !== 1 ? 's' : ''} com sucesso
                    </p>
                    <p className="text-[10px] text-white/50">
                      Extraia o ZIP em <span className="font-black text-white/70">[Canal]/Template HTML/</span> e o .bat vai encontrá-los automaticamente no próximo processamento.
                    </p>
                    {templateGenResult.missing.length > 0 && (
                      <p className="text-[10px] text-amber-300">
                        ⚠️ Não encontrados: {templateGenResult.missing.join(', ')}
                      </p>
                    )}
                  </div>
                )}

                <div className="rounded-2xl border border-white/5 bg-black/15 px-4 py-3 space-y-1">
                  <p className="text-[9px] font-black uppercase tracking-[0.22em] text-white/35">Instrução pós-download</p>
                  <p className="text-[10px] leading-5 text-white/45">
                    1. Extraia o ZIP · 2. Mova para <span className="font-mono text-white/60">[Canal]/Template HTML/</span> · 3. O .bat vai usar seus templates automaticamente
                  </p>
                </div>
              </div>

            </div>
          </div>
        </div>
        {/* ══════════════════════════════════════════════════════════════════════════════ */}

        <div ref={mainScrollRef} className="flex-1 overflow-y-auto overflow-x-hidden p-6 xl:p-8 flex flex-col gap-8 custom-scrollbar bg-gradient-to-b from-transparent to-midnight/20">
          {scriptBlocks.length > 0 && (
            <div className="rounded-[28px] border border-white/10 bg-white/[0.02] p-4 xl:p-5 space-y-4">
              <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-[0.32em] text-blue-300">Blocos STG agrupados</p>
                  <p className="mt-1 text-[10px] leading-5 text-white/40">
                    Clique em um STG para abrir o bloco. Isso mantém a página navegável sem perder os cards editáveis.
                  </p>
                </div>
                <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2 text-[10px] font-black uppercase tracking-[0.18em] text-white/50">
                  {scriptBlocks.length} blocos
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {scriptBlocks.map((block, index) => {
                  const blockGenerationState = getBlockGenerationState(index);
                  const isActive = block.id === activeStageBlockId;

                  return (
                    <button
                      key={block.id}
                      type="button"
                      onClick={() => setExpandedStageId(block.id)}
                      className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                        isActive
                          ? 'border-blue-400/40 bg-blue-500/15 shadow-lg shadow-blue-500/10'
                          : 'border-white/10 bg-black/10 hover:border-white/20 hover:bg-white/[0.03]'
                      }`}
                    >
                      <span className={`block text-[10px] font-black uppercase tracking-[0.22em] ${isActive ? 'text-blue-200' : 'text-white/40'}`}>
                        STG_{String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mt-2 block truncate text-[11px] font-black text-white/80">
                        {block.title}
                      </span>
                      {blockGenerationState && (
                        <span
                          className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[8px] font-black uppercase tracking-[0.14em] ${
                            blockGenerationState === 'generating'
                              ? 'border-blue-400/30 bg-blue-500/10 text-blue-300'
                              : blockGenerationState === 'completed'
                                ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                                : 'border-white/10 bg-white/5 text-white/35'
                          }`}
                        >
                          {blockGenerationState === 'generating' ? 'Gerando' : blockGenerationState === 'completed' ? 'Concluido' : 'Pendente'}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {scriptBlocks.filter((block) => block.id === activeStageBlockId).map((block) => {
            const index = Math.max(0, scriptBlocks.findIndex((item) => item.id === block.id));
            const blockGenerationState = getBlockGenerationState(index);

            return (
            <div key={block.id} className="relative group animate-in slide-in-from-bottom-4" style={{ animationDelay: `${index * 100}ms` }}>
              <div className="flex items-center gap-3 mb-3 pl-1">
                <div className="text-[11px] font-black text-white/20 tracking-[3px] uppercase">
                  STG_{String(index + 1).padStart(2, '0')}
                </div>
                {blockGenerationState && (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-[9px] font-black uppercase tracking-[0.18em] ${
                      blockGenerationState === 'generating'
                        ? 'border-blue-400/30 bg-blue-500/10 text-blue-300'
                        : blockGenerationState === 'completed'
                          ? 'border-emerald-400/30 bg-emerald-500/10 text-emerald-300'
                          : 'border-white/10 bg-white/5 text-white/35'
                    }`}
                  >
                    {blockGenerationState === 'generating'
                      ? 'Gerando agora'
                      : blockGenerationState === 'completed'
                        ? 'Concluido'
                        : 'Pendente'}
                  </span>
                )}
                <div className="h-px flex-1 bg-gradient-to-r from-white/10 to-transparent" />
              </div>
              <div className={`flex flex-col gap-6 rounded-[32px] p-6 xl:p-8 transition-all shadow-inner relative group/block ${
                blockGenerationState === 'generating'
                  ? 'bg-blue-500/[0.04] border border-blue-400/20 ring-1 ring-blue-400/15 shadow-[0_0_30px_rgba(59,130,246,0.08)]'
                  : blockGenerationState === 'completed'
                    ? 'bg-emerald-500/[0.03] border border-emerald-400/15'
                    : 'bg-white/[0.01] border border-white/[0.05] hover:border-white/10 hover:bg-white/[0.03]'
              }`}>
                
                <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
                  <span className={`inline-flex w-fit max-w-full flex-wrap text-[10px] font-black uppercase tracking-[3px] px-4 py-2 rounded-full border shadow-sm whitespace-normal break-words ${
                    block.type === 'Hook' ? 'text-blue-300 border-blue-400/60 bg-blue-500/10' : 
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
                      className={`w-full rounded-2xl px-5 py-4 text-white/90 leading-8 outline-none transition-all resize-none overflow-hidden min-h-[120px] text-[15px] font-medium placeholder:text-white/10 ${
                        blockGenerationState === 'generating'
                          ? 'bg-blue-500/[0.04] border border-blue-400/20'
                          : blockGenerationState === 'completed'
                            ? 'bg-emerald-500/[0.03] border border-emerald-400/10'
                            : 'bg-midnight/20 border border-white/5'
                      }`}
                      value={block.content}
                      onChange={(e) => {
                        const newBlocks = [...scriptBlocks];
                        newBlocks[index].content = e.target.value;
                        setScriptBlocks(newBlocks);
                      }}
                    />
                  </div>
                  <div className="bg-midnight/40 rounded-3xl p-5 xl:p-6 border border-white/5 flex flex-col gap-4 min-w-0">
                    <div className="flex items-center gap-2 text-[10px] uppercase font-black tracking-[2px] text-blue-300">
                      <PenTool size={14} className="animate-pulse" /> SOP DE EDICAO
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
                      placeholder="Instrucoes para o editor..."
                    />
                  </div>
                </div>
              </div>
            </div>
          )})}

              <button className="w-full border-2 border-dashed border-white/5 hover:border-blue-400/30 rounded-[50px] py-16 flex flex-col items-center gap-3 text-white/20 hover:text-blue-300 transition-all group bg-white/[0.01]">
            <Plus size={32} className="group-hover:rotate-90 transition-transform duration-500" />
            <div className="text-center">
              <span className="text-[11px] uppercase font-black tracking-[0.4em]">Injetar Bloco Modular</span>
              <p className="text-[9px] opacity-40 mt-1 uppercase tracking-widest font-bold">DNA Content OS Kernel</p>
            </div>
          </button>
        </div>
        <ScrollToTopButton containerRef={mainScrollRef} />
          </>
        )}
        </section>
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            right: '28px',
            zIndex: 9999,
            background: 'rgba(20,20,30,0.92)',
            border: '1px solid rgba(255,255,255,0.12)',
            borderRadius: '12px',
            padding: '10px 18px',
            color: '#e0e0ff',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.06em',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 4px 24px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          ✓ {toastMessage}
        </div>
      )}
      {storageUsageMB >= STORAGE_LIMIT_MB * STORAGE_WARN_THRESHOLD && (
        <div
          style={{
            position: 'fixed',
            bottom: '28px',
            left: '28px',
            zIndex: 9998,
            background: 'rgba(20,12,4,0.95)',
            border: `1px solid ${storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? 'rgba(239,68,68,0.5)' : 'rgba(245,158,11,0.4)'}`,
            borderRadius: '14px',
            padding: '12px 16px',
            color: '#fff',
            fontSize: '11px',
            fontWeight: 700,
            backdropFilter: 'blur(14px)',
            boxShadow: '0 4px 32px rgba(0,0,0,0.5)',
            minWidth: '240px',
            maxWidth: '300px',
          }}
        >
          <p style={{ color: storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? '#f87171' : '#fbbf24', fontSize: '9px', letterSpacing: '0.2em', marginBottom: '6px', fontWeight: 900, textTransform: 'uppercase' }}>
            {storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? '🔴 Armazenamento crítico' : '⚠️ Armazenamento alto'}
          </p>
          {/* Usage bar */}
          <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: '6px', height: '5px', marginBottom: '8px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${Math.min(100, (storageUsageMB / STORAGE_LIMIT_MB) * 100).toFixed(1)}%`,
              background: storageUsageMB >= STORAGE_LIMIT_MB * 0.92 ? '#ef4444' : '#f59e0b',
              borderRadius: '6px',
              transition: 'width 0.5s ease',
            }} />
          </div>
          <p style={{ color: 'rgba(255,255,255,0.55)', fontSize: '10px', marginBottom: '8px' }}>
            {storageUsageMB.toFixed(1)} MB de ~{STORAGE_LIMIT_MB} MB usados ({((storageUsageMB / STORAGE_LIMIT_MB) * 100).toFixed(0)}%)
          </p>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '9px', lineHeight: 1.5, marginBottom: '8px' }}>
            Programe os temas prontos para liberar espaço automaticamente.
          </p>
          <button
            onClick={() => {
              // Purge stale snapshot_ keys only — never touch other projects' workspace keys
              try {
                const toRemove: string[] = [];
                for (let i = 0; i < localStorage.length; i++) {
                  const k = localStorage.key(i) || '';
                  if (k.startsWith('snapshot_')) toRemove.push(k);
                }
                toRemove.forEach(k => localStorage.removeItem(k));
                checkStorageUsage();
                showToast(`${toRemove.length} entradas antigas removidas.`);
              } catch { /* ignore */ }
            }}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.15)',
              borderRadius: '8px',
              padding: '5px 10px',
              fontSize: '9px',
              fontWeight: 900,
              letterSpacing: '0.15em',
              color: 'rgba(255,255,255,0.7)',
              cursor: 'pointer',
              textTransform: 'uppercase',
              width: '100%',
            }}
          >
            Limpar dados antigos
          </button>
        </div>
      )}
      </div>
    </div>
  );
}
