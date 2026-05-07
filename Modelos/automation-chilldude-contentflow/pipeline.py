#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ChillDude Pipeline v2 - Orchestrator
=====================================
Step-by-step pipeline with CSV-based image tracking.

Steps:
  1. Title + Thumbnail
  2. Script (roteiro) + chunks
  3. Narration (TTS per chunk)
  4. SRT subtitles
  5. CSV: SRT -> CSV -> mark assets -> generate prompts -> generate images
  6. Ken Burns clips
  7. Final video assembly
"""

import os, sys, io, re, csv, json, wave, time, math, random, shutil, subprocess
from pathlib import Path

os.environ["PYTHONIOENCODING"] = "utf-8"

from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image as PILImage

# ─── Config ───────────────────────────────────────────────────
BASE_DIR = Path(__file__).parent
OUTPUT_BASE = BASE_DIR / "output"

MODEL_TEXT = "gemini-2.5-flash"
MODEL_TTS = "gemini-2.5-flash-preview-tts"
IMAGE_MODELS = ["gemini-2.5-flash-image", "gemini-3.1-flash-image-preview"]
VOICE_NAME = "Kore"
FPS = 25
VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080
API_DELAY = 2
IMAGE_DELAY = 5
MAX_RETRIES = 3

# ─── Asset marking config ───
# Very aggressive intervals = LOTS of images (150-200+ for a 12min video)
TEXT_MAX_CHARS = 10          # Only skip very short lines (numbers, transitions)
FIRST_SECTION_LIMIT = 0.30
SECOND_SECTION_LIMIT = 0.70
FIRST_SECTION_INTERVAL_MS = 3_000    # First 30%: image every ~3s
SECOND_SECTION_INTERVAL_MS = 5_000   # Middle 40%: image every ~5s
THIRD_SECTION_INTERVAL_MS = 8_000    # Last 30%: image every ~8s

# ─── Prompts ──────────────────────────────────────────────────

TITLE_SYSTEM_PROMPT = """You are a YouTube title generator for a viral educational channel.

The formula for titles is: [Universal Familiarity] + [Value Contradiction]
The title combines a common concept everyone understands with a logical break that seems impossible.

Examples:
- "Things That Are Stupidly Expensive But Cost Nothing To Make"
- "Technologies That Got Destroyed For Making Life Too Easy"
- "Lies Everyone Agrees To Pretend Are True"
- "Normal Things We Do That Animals Think Are Insane"
- "Red Flags Therapists Look For That You Don't Know About"
- "Skills Nobody Has Anymore Because Technology Made Them Pointless"

Rules:
- English, Title Case
- Maximum 12 words
- Must create cognitive dissonance / paradox
- Must feel universally relatable
- No clickbait like "You Won't Believe"
- No numbers unless comparing prices"""

SCRIPT_SYSTEM_PROMPT = """You are a scriptwriter for a viral YouTube channel.

Style (match exactly):
- Conversational, slightly sarcastic narrator
- Like a smart friend explaining something wild over coffee
- Uses funny, relatable analogies
- Each item starts with "Number X, [topic]."
- Starts with a hook, uses specific numbers/facts
- Includes surprising comparisons
- Ends with brief outro

Format:
- Start directly with "Let's get right into it. Number 10,"
- Exactly 10 items, counting DOWN from 10 to 1
- Each item 220-280 words
- End with "That's all for today. I'll be making similar videos in the future. Subscribe to see them."
- Total 2400-2800 words
- NO stage directions, NO [brackets]
- Just pure narration text
- Separate each item with a blank line"""

VOICE_NOTES = """# AUDIO PROFILE: Educational Narrator - "The Smart Friend"
Style: Casual, conversational, slightly sarcastic. Witty friend explaining something over coffee.
Pacing: Medium with natural rhythm. Faster during reveals, slower for key facts.
Accent: Standard American English, young adult male voice.

### TRANSCRIPT
"""

IMAGE_STYLE = """Create a SINGLE cartoon scene illustration that FILLS THE ENTIRE IMAGE.

CRITICAL LAYOUT:
- ONE SINGLE SCENE, NOT a comic strip, NOT multiple panels
- Scene FILLS THE ENTIRE FRAME edge to edge, NO borders, NO margins
- NO panel divisions, NO comic strip format, NO split screens
- SINGLE WIDE CINEMATIC SHOT, like a frame from an animated movie
- Background extends to ALL EDGES

ART STYLE:
- STICK FIGURES with large round white heads
- Messy spiky orange-brown hair
- Simple black dot eyes (can show emotion: hearts, dollar signs, X eyes)
- Very expressive exaggerated faces
- Thin BLACK LINE stick-figure bodies
- BOLD BLACK OUTLINES on everything
- FLAT SOLID colors, NO gradients
- SOFT PASTEL background colors FILLING ENTIRE FRAME
- Style similar to Cyanide and Happiness webcomic as SINGLE WIDE SCENE
- Humorous and visually exaggerated
- Horizontal 16:9 widescreen, background fills everything
- NO text, NO watermarks, NO borders, NO labels"""

THUMBNAIL_STYLE = """Create a YouTube thumbnail image.

MANDATORY STYLE:
- Multiple expressive stick-figure cartoon characters (4-6 characters)
- Round white heads, spiky orange-brown hair, big expressive eyes, stick bodies
- Bold black outlines, flat colors, exaggerated expressions
- Style similar to Cyanide and Happiness webcomic
- WHITE or very light background
- Characters showing extreme emotions related to the topic
- Relevant objects/icons scattered around characters
- Busy, eye-catching composition
- Horizontal 1280x720
- The title text must be written IN THE IMAGE in big bold black letters at the TOP
- NO other text, NO watermarks"""


# ═══════════════════════════════════════════════════════════════
# HELPERS
# ═══════════════════════════════════════════════════════════════

def log(msg, level="INFO"):
    icons = {"INFO": "i", "OK": "+", "WARN": "!", "ERR": "X", "STEP": ">"}
    prefix = icons.get(level, " ")
    print(f"[{time.strftime('%H:%M:%S')}] [{prefix}] {msg}", flush=True)

def ensure_dir(path):
    path = Path(path)
    path.mkdir(parents=True, exist_ok=True)
    return path

def api_call_with_retry(func, *args, **kwargs):
    for attempt in range(MAX_RETRIES):
        try:
            result = func(*args, **kwargs)
            time.sleep(API_DELAY)
            return result
        except Exception as e:
            err = str(e)
            if "429" in err or "quota" in err.lower() or "rate" in err.lower():
                wait = (attempt + 1) * 15
                log(f"  Rate limit, waiting {wait}s...", "WARN")
                time.sleep(wait)
            elif attempt < MAX_RETRIES - 1:
                log(f"  Retry {attempt+1}: {err[:100]}", "WARN")
                time.sleep(5)
            else:
                raise

def get_client():
    """Get Gemini client with OAuth2 first, API key fallback."""
    load_dotenv(BASE_DIR / ".env")
    try:
        from load_creds import load_creds
        creds = load_creds()
        if creds:
            client = genai.Client(credentials=creds)
            log("Client initialized (OAuth2)", "OK")
            return client
    except Exception as e:
        log(f"OAuth2 failed: {e}", "WARN")

    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        log("No auth available!", "ERR")
        sys.exit(1)
    client = genai.Client(api_key=api_key)
    log("Client initialized (API key)", "OK")
    return client

def count_words(text):
    return len(text.split())

def parse_srt_time_to_ms(t):
    h, m, rest = t.strip().split(":")
    s, ms = rest.split(",")
    return (int(h)*3600 + int(m)*60 + int(s)) * 1000 + int(ms)

def ms_to_srt_time(ms):
    h = ms // 3600000
    ms %= 3600000
    m = ms // 60000
    ms %= 60000
    s = ms // 1000
    ms %= 1000
    return f"{h:02d}:{m:02d}:{s:02d},{ms:03d}"


# ═══════════════════════════════════════════════════════════════
# STEP 1: TITLE + THUMBNAIL
# ═══════════════════════════════════════════════════════════════

def step1_title_and_thumbnail(client, theme, project_dir):
    log("STEP 1: Title + Thumbnail", "STEP")
    
    title_path = project_dir / "title.txt"
    thumb_path = project_dir / "thumbnail.png"
    
    # Generate title
    if title_path.exists():
        title = title_path.read_text(encoding="utf-8").strip()
        log(f"  Title (cached): {title}")
    else:
        resp = api_call_with_retry(
            client.models.generate_content,
            model=MODEL_TEXT,
            contents=f"Generate exactly 1 YouTube video title about the theme: '{theme}'",
            config=types.GenerateContentConfig(
                system_instruction=TITLE_SYSTEM_PROMPT,
                temperature=0.9
            )
        )
        title = resp.text.strip().strip('"').strip("'")
        title_path.write_text(title, encoding="utf-8")
        log(f"  Title: {title}", "OK")
    
    # Generate thumbnail with title text
    if thumb_path.exists() and thumb_path.stat().st_size > 10000:
        log("  Thumbnail (cached)")
    else:
        prompt = f"""{THUMBNAIL_STYLE}

The title to write on the thumbnail is: "{title}"
The theme is: {theme}

IMPORTANT: Write the title text "{title}" in BIG BOLD BLACK LETTERS at the top of the image. The text must be clearly readable."""

        for model_name in IMAGE_MODELS:
            try:
                resp = api_call_with_retry(
                    client.models.generate_content,
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"],
                        temperature=0.8
                    )
                )
                if resp.candidates and resp.candidates[0].content.parts:
                    for part in resp.candidates[0].content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            img = PILImage.open(io.BytesIO(part.inline_data.data))
                            img = img.resize((1280, 720), PILImage.LANCZOS)
                            img.save(str(thumb_path))
                            log(f"  Thumbnail saved ({model_name})", "OK")
                            break
                    else:
                        continue
                    break
            except Exception as e:
                log(f"  Thumbnail error ({model_name}): {str(e)[:80]}", "WARN")
    
    return title


# ═══════════════════════════════════════════════════════════════
# STEP 2: SCRIPT + CHUNKS
# ═══════════════════════════════════════════════════════════════

def step2_script_and_chunks(client, theme, title, project_dir):
    log("STEP 2: Script + Chunks", "STEP")
    
    script_path = project_dir / "script.txt"
    chunks_dir = ensure_dir(project_dir / "chunks")
    
    # Generate script
    if script_path.exists() and script_path.stat().st_size > 500:
        script = script_path.read_text(encoding="utf-8")
        log(f"  Script (cached): {count_words(script)} words")
    else:
        resp = api_call_with_retry(
            client.models.generate_content,
            model=MODEL_TEXT,
            contents=f"Write a YouTube narration script about: '{theme}'\nTitle: '{title}'\nTarget: 2400-2800 words, exactly 10 items counting down.",
            config=types.GenerateContentConfig(
                system_instruction=SCRIPT_SYSTEM_PROMPT,
                temperature=0.7,
                max_output_tokens=8000
            )
        )
        script = resp.text.strip()
        script_path.write_text(script, encoding="utf-8")
        log(f"  Script generated: {count_words(script)} words", "OK")
    
    # Split into chunks (sections)
    sections = re.split(r'\n\s*\n', script)
    sections = [s.strip() for s in sections if s.strip() and len(s.strip()) > 30]
    
    # Write chunks
    for i, section in enumerate(sections):
        chunk_path = chunks_dir / f"chunk_{i+1:03d}.txt"
        chunk_path.write_text(section, encoding="utf-8")
    
    log(f"  {len(sections)} chunks created", "OK")
    
    # Validate
    total_chars = sum(len(s) for s in sections)
    log(f"  Total chars: {total_chars}, Words: {count_words(script)}")
    
    return sections


# ═══════════════════════════════════════════════════════════════
# STEP 3: NARRATION (TTS)
# ═══════════════════════════════════════════════════════════════

def step3_narration(client, sections, project_dir):
    log("STEP 3: Narration TTS", "STEP")
    
    narration_dir = ensure_dir(project_dir / "narration")
    full_audio = project_dir / "narration_full.wav"
    
    wav_files = []
    durations = []
    
    for i, section in enumerate(sections):
        wav_path = narration_dir / f"section_{i+1:03d}.wav"
        
        if wav_path.exists() and wav_path.stat().st_size > 1000:
            # Read duration from existing file
            with wave.open(str(wav_path), 'rb') as wf:
                dur = wf.getnframes() / wf.getframerate()
            wav_files.append(wav_path)
            durations.append(dur)
            log(f"  Section {i+1} (cached): {dur:.1f}s")
            continue
        
        log(f"  Generating TTS {i+1}/{len(sections)}...")
        
        tts_text = VOICE_NOTES + section
        
        try:
            resp = api_call_with_retry(
                client.models.generate_content,
                model=MODEL_TTS,
                contents=tts_text,
                config=types.GenerateContentConfig(
                    response_modalities=["AUDIO"],
                    speech_config=types.SpeechConfig(
                        voice_config=types.VoiceConfig(
                            prebuilt_voice_config=types.PrebuiltVoiceConfig(
                                voice_name=VOICE_NAME
                            )
                        )
                    )
                )
            )
            
            audio_data = resp.candidates[0].content.parts[0].inline_data.data
            
            with wave.open(str(wav_path), 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(audio_data)
            
            with wave.open(str(wav_path), 'rb') as wf:
                dur = wf.getnframes() / wf.getframerate()
            
            wav_files.append(wav_path)
            durations.append(dur)
            log(f"  Section {i+1}: {dur:.1f}s", "OK")
            
        except Exception as e:
            log(f"  Section {i+1} TTS error: {e}", "ERR")
            # Create silence
            dur = len(section.split()) * 0.5
            with wave.open(str(wav_path), 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(24000)
                wf.writeframes(b'\x00' * int(dur * 24000 * 2))
            wav_files.append(wav_path)
            durations.append(dur)
    
    # Concatenate
    if not full_audio.exists() or full_audio.stat().st_size < 1000:
        log("  Concatenating audio...")
        with wave.open(str(full_audio), 'wb') as out:
            out.setnchannels(1)
            out.setsampwidth(2)
            out.setframerate(24000)
            for wf_path in wav_files:
                with wave.open(str(wf_path), 'rb') as wf:
                    out.writeframes(wf.readframes(wf.getnframes()))
    
    total_dur = sum(durations)
    log(f"  Total narration: {total_dur/60:.1f} min", "OK")
    
    return wav_files, durations


# ═══════════════════════════════════════════════════════════════
# STEP 4: SRT SUBTITLES
# ═══════════════════════════════════════════════════════════════

def step4_srt(sections, durations, project_dir):
    log("STEP 4: SRT Subtitles", "STEP")
    
    srt_path = project_dir / "subtitles.srt"
    
    if srt_path.exists() and srt_path.stat().st_size > 100:
        log("  SRT (cached)")
        return srt_path
    
    entries = []
    current_ms = 0
    idx = 1
    
    for sec_i, (section, duration) in enumerate(zip(sections, durations)):
        words = section.split()
        total_words = len(words)
        if total_words == 0:
            current_ms += int(duration * 1000)
            continue
        
        # ~8-12 words per subtitle line
        chunk_size = 10
        word_idx = 0
        sec_dur_ms = int(duration * 1000)
        
        while word_idx < total_words:
            end_word = min(word_idx + chunk_size, total_words)
            text = " ".join(words[word_idx:end_word])
            
            start_frac = word_idx / total_words
            end_frac = end_word / total_words
            
            start_ms = current_ms + int(start_frac * sec_dur_ms)
            end_ms = current_ms + int(end_frac * sec_dur_ms)
            
            entries.append({
                "index": idx,
                "start": ms_to_srt_time(start_ms),
                "end": ms_to_srt_time(end_ms),
                "text": text,
                "start_ms": start_ms,
                "end_ms": end_ms
            })
            
            idx += 1
            word_idx = end_word
        
        current_ms += sec_dur_ms
    
    # Write SRT
    with open(str(srt_path), 'w', encoding='utf-8') as f:
        for e in entries:
            f.write(f"{e['index']}\n")
            f.write(f"{e['start']} --> {e['end']}\n")
            f.write(f"{e['text']}\n\n")
    
    log(f"  SRT: {len(entries)} entries, {current_ms/1000/60:.1f} min", "OK")
    return srt_path


# ═══════════════════════════════════════════════════════════════
# STEP 5: CSV-BASED IMAGE GENERATION
# (Logic from referencia-csv: srt_to_csv -> mark_assets -> prompts -> images)
# ═══════════════════════════════════════════════════════════════

def srt_to_csv_rows(srt_path):
    """Convert SRT file to CSV rows (like referencia-csv/srt_to_csv.py)."""
    with open(str(srt_path), 'r', encoding='utf-8') as f:
        content = f.read()
    
    blocks = re.split(r'\r?\n\s*\r?\n', content.strip())
    rows = []
    
    for block in blocks:
        lines = block.splitlines()
        if len(lines) >= 3:
            time_line = lines[1]
            start, end = time_line.split(" --> ")
            text = " ".join(lines[2:]).strip()
            rows.append({
                "start time": start.strip(),
                "end time": end.strip(),
                "texto": text,
                "asset": "",
                "prompt": "",
                "caminho": ""
            })
    
    return rows


def mark_assets(rows):
    """Mark which rows need images (like referencia-csv/marcar_assets.py)."""
    if not rows:
        return rows
    
    last_broll_ms = 0
    total = len(rows)
    
    for i, row in enumerate(rows):
        text = row.get("texto", "").strip()
        start_ms = parse_srt_time_to_ms(row["start time"])
        end_ms = parse_srt_time_to_ms(row["end time"])
        
        if len(text) <= TEXT_MAX_CHARS:
            row["asset"] = "texto"
            continue
        
        progress = (i + 1) / total
        if progress <= FIRST_SECTION_LIMIT:
            interval = FIRST_SECTION_INTERVAL_MS
        elif progress <= SECOND_SECTION_LIMIT:
            interval = SECOND_SECTION_INTERVAL_MS
        else:
            interval = THIRD_SECTION_INTERVAL_MS
        
        if end_ms - last_broll_ms >= interval:
            row["asset"] = "imagem"
            last_broll_ms = max(last_broll_ms + interval, start_ms)
            continue
        
        row["asset"] = "avatar"
    
    return rows


def generate_prompts_for_csv(client, rows):
    """Generate image prompts for rows marked as 'imagem' (like referencia-csv/gerar_prompts.py)."""
    
    BATCH_SIZE = 12
    
    # Collect rows that need prompts
    items_to_prompt = []
    for i, row in enumerate(rows):
        if row.get("asset") == "imagem" and not row.get("prompt", "").strip():
            items_to_prompt.append({
                "row_number": i + 1,
                "asset": "imagem",
                "text": row.get("texto", "").strip(),
                "previous_text": rows[i-1].get("texto", "").strip() if i > 0 else "",
                "next_text": rows[i+1].get("texto", "").strip() if i+1 < len(rows) else "",
            })
    
    if not items_to_prompt:
        log("  All prompts already generated")
        return rows
    
    log(f"  Generating prompts for {len(items_to_prompt)} images...")
    
    PROMPT_SYSTEM = """You generate visual prompts for cartoon scene illustrations.
Return only valid JSON. Write every prompt in English.
Do not include subtitles, on-screen text, logos, watermarks.
Keep prompts concise, vivid, and generator-friendly (18-40 words).
Each prompt must describe a SINGLE WIDE CINEMATIC scene (not comic panels).
The prompt must begin with "Cartoon stick-figure scene of".
Focus on actions, expressions, objects, and environment."""

    # Process in batches
    for batch_start in range(0, len(items_to_prompt), BATCH_SIZE):
        batch = items_to_prompt[batch_start:batch_start + BATCH_SIZE]
        
        payload = json.dumps({"items": batch}, ensure_ascii=False, indent=2)
        
        schema = {
            "type": "object",
            "properties": {
                "prompts": {
                    "type": "array",
                    "items": {
                        "type": "object",
                        "properties": {
                            "row_number": {"type": "integer"},
                            "prompt": {"type": "string"}
                        },
                        "required": ["row_number", "prompt"]
                    }
                }
            },
            "required": ["prompts"]
        }
        
        try:
            resp = api_call_with_retry(
                client.models.generate_content,
                model=MODEL_TEXT,
                contents=payload,
                config=types.GenerateContentConfig(
                    system_instruction=PROMPT_SYSTEM,
                    response_mime_type="application/json",
                    response_schema=schema,
                    max_output_tokens=2400
                )
            )
            
            result = json.loads(resp.text)
            for item in result.get("prompts", []):
                row_num = item["row_number"]
                if 1 <= row_num <= len(rows):
                    rows[row_num - 1]["prompt"] = item["prompt"].strip()
            
            log(f"  Batch {batch_start//BATCH_SIZE + 1}: {len(result.get('prompts', []))} prompts", "OK")
            
        except Exception as e:
            log(f"  Prompt batch error: {str(e)[:100]}", "ERR")
            # Fallback: basic prompts
            for item in batch:
                rn = item["row_number"]
                rows[rn-1]["prompt"] = f"Cartoon stick-figure scene of characters reacting to: {item['text'][:60]}"
    
    return rows


def generate_images_from_csv(client, rows, images_dir):
    """Generate images for each row with a prompt (CSV-tracked)."""
    
    images_to_gen = [(i, row) for i, row in enumerate(rows) 
                     if row.get("asset") == "imagem" and row.get("prompt", "").strip()]
    
    total = len(images_to_gen)
    log(f"  {total} images to generate")
    generated = 0
    
    for idx, (row_i, row) in enumerate(images_to_gen):
        img_name = f"scene_{row_i+1:04d}.png"
        img_path = images_dir / img_name
        
        # Skip if already exists
        if img_path.exists() and img_path.stat().st_size > 10000:
            row["caminho"] = str(img_path)
            generated += 1
            if (idx + 1) % 10 == 0:
                log(f"  Progress: {idx+1}/{total} (cached)")
            continue
        
        prompt = f"{IMAGE_STYLE}\n\nScene to illustrate: {row['prompt']}"
        
        success = False
        for model_name in IMAGE_MODELS:
            try:
                resp = api_call_with_retry(
                    client.models.generate_content,
                    model=model_name,
                    contents=prompt,
                    config=types.GenerateContentConfig(
                        response_modalities=["IMAGE", "TEXT"],
                        temperature=0.8
                    )
                )
                
                if resp.candidates and resp.candidates[0].content.parts:
                    for part in resp.candidates[0].content.parts:
                        if hasattr(part, 'inline_data') and part.inline_data:
                            img = PILImage.open(io.BytesIO(part.inline_data.data))
                            img = img.resize((VIDEO_WIDTH, VIDEO_HEIGHT), PILImage.LANCZOS)
                            img.save(str(img_path))
                            row["caminho"] = str(img_path)
                            success = True
                            generated += 1
                            break
                
                if success:
                    break
                    
            except Exception as e:
                log(f"  Image {row_i+1} error ({model_name}): {str(e)[:60]}", "WARN")
                time.sleep(IMAGE_DELAY)
        
        if not success:
            log(f"  Image {row_i+1}: fallback solid color", "WARN")
            img = PILImage.new('RGB', (VIDEO_WIDTH, VIDEO_HEIGHT), 
                             (random.randint(40,80), random.randint(40,80), random.randint(80,120)))
            img.save(str(img_path))
            row["caminho"] = str(img_path)
            generated += 1
        
        if (idx + 1) % 5 == 0:
            log(f"  Progress: {idx+1}/{total} images ({generated} ready)")
    
    log(f"  Images complete: {generated}/{total}", "OK")
    return rows


def step5_csv_images(client, srt_path, project_dir):
    log("STEP 5: CSV-based Image Generation", "STEP")
    
    csv_path = project_dir / "scenes.csv"
    images_dir = ensure_dir(project_dir / "scenes")
    
    # 5a: SRT -> CSV rows
    if csv_path.exists():
        # Read existing CSV
        with open(str(csv_path), 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            rows = [dict(r) for r in reader]
        log(f"  CSV loaded: {len(rows)} rows")
    else:
        rows = srt_to_csv_rows(srt_path)
        log(f"  SRT -> CSV: {len(rows)} subtitle rows")
    
    # 5b: Mark assets
    image_count = sum(1 for r in rows if r.get("asset") == "imagem")
    if image_count == 0:
        rows = mark_assets(rows)
        image_count = sum(1 for r in rows if r.get("asset") == "imagem")
    log(f"  Assets marked: {image_count} images needed")
    
    # Save CSV checkpoint
    _write_csv(csv_path, rows)
    
    # 5c: Generate prompts
    needs_prompts = sum(1 for r in rows if r.get("asset") == "imagem" and not r.get("prompt", "").strip())
    if needs_prompts > 0:
        rows = generate_prompts_for_csv(client, rows)
        _write_csv(csv_path, rows)  # Save after prompts
    else:
        log("  Prompts (cached)")
    
    # 5d: Generate images
    rows = generate_images_from_csv(client, rows, images_dir)
    _write_csv(csv_path, rows)  # Save after first pass
    
    # 5e: VERIFY + RETRY missing/broken images
    for retry_pass in range(3):
        missing = []
        for i, row in enumerate(rows):
            if row.get("asset") != "imagem":
                continue
            caminho = row.get("caminho", "").strip()
            if not caminho:
                missing.append((i, "no path"))
                continue
            p = Path(caminho)
            if not p.exists():
                missing.append((i, "file missing"))
                row["caminho"] = ""
                continue
            if p.stat().st_size < 15000:
                # Likely a solid-color fallback, retry
                missing.append((i, f"too small ({p.stat().st_size}b)"))
                p.unlink(missing_ok=True)
                row["caminho"] = ""
                continue
        
        if not missing:
            log(f"  Verification pass {retry_pass+1}: ALL {image_count} images OK", "OK")
            break
        
        log(f"  Verification pass {retry_pass+1}: {len(missing)} images need retry", "WARN")
        for i, reason in missing[:5]:
            log(f"    Row {i+1}: {reason}")
        if len(missing) > 5:
            log(f"    ... and {len(missing)-5} more")
        
        # Retry generation for missing ones
        rows = generate_images_from_csv(client, rows, images_dir)
        _write_csv(csv_path, rows)
    
    # Collect image paths in order
    image_rows = [(i, r) for i, r in enumerate(rows) if r.get("asset") == "imagem" and r.get("caminho")]
    image_paths = [Path(r["caminho"]) for _, r in image_rows]
    
    # Filter out images that still don't exist
    valid_pairs = [(p, i) for p, (i, r) in zip(image_paths, image_rows) if p.exists() and p.stat().st_size > 5000]
    image_paths = [p for p, _ in valid_pairs]
    valid_indices = [i for _, i in valid_pairs]
    
    # Calculate durations for each image (time until next image or end)
    image_durations = []
    for idx in range(len(valid_indices)):
        row_i, row = valid_indices[idx]
        start_ms = parse_srt_time_to_ms(row["start time"])
        if idx + 1 < len(valid_indices):
            next_row_i, next_row = valid_indices[idx + 1]
            next_start = parse_srt_time_to_ms(next_row["start time"])
            dur = (next_start - start_ms) / 1000.0
        else:
            end_ms = parse_srt_time_to_ms(rows[-1]["end time"])
            dur = (end_ms - start_ms) / 1000.0
        dur = max(3.0, min(dur, 60.0))
        image_durations.append(dur)
    
    log(f"  {len(image_paths)} verified images with durations ready", "OK")
    return image_paths, image_durations, rows


def _write_csv(path, rows):
    fieldnames = ["start time", "end time", "texto", "asset", "prompt", "caminho"]
    with open(str(path), 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            clean = {k: row.get(k, "") for k in fieldnames}
            writer.writerow(clean)


# ═══════════════════════════════════════════════════════════════
# STEP 6: KEN BURNS CLIPS
# ═══════════════════════════════════════════════════════════════

def step6_ken_burns(image_paths, image_durations, project_dir):
    log("STEP 6: Ken Burns Clips", "STEP")
    
    clips_dir = ensure_dir(project_dir / "clips")
    clip_paths = []
    
    for i, (img_path, duration) in enumerate(zip(image_paths, image_durations)):
        clip_path = clips_dir / f"clip_{i+1:04d}.mp4"
        
        if clip_path.exists() and clip_path.stat().st_size > 1000:
            clip_paths.append(clip_path)
            if (i + 1) % 10 == 0:
                log(f"  Progress: {i+1}/{len(image_paths)} clips")
            continue
        
        # Random Ken Burns parameters
        zoom_start = round(random.uniform(1.0, 1.15), 3)
        zoom_end = round(random.uniform(1.05, 1.25), 3)
        if random.random() < 0.4:
            zoom_start, zoom_end = zoom_end, zoom_start  # zoom out
        
        pan_x = random.uniform(-0.03, 0.03)
        pan_y = random.uniform(-0.03, 0.03)
        
        n_frames = int(duration * FPS)
        
        filter_str = (
            f"scale=8000:-1,"
            f"zoompan=z='if(eq(on,1),{zoom_start},{zoom_start}+(({zoom_end}-{zoom_start})*on/{n_frames}))':"
            f"x='iw/2-(iw/zoom/2)+({pan_x}*iw*on/{n_frames})':"
            f"y='ih/2-(ih/zoom/2)+({pan_y}*ih*on/{n_frames})':"
            f"d={n_frames}:s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:fps={FPS},"
            f"format=yuv420p"
        )
        
        cmd = [
            'ffmpeg', '-y',
            '-i', str(img_path),
            '-vf', filter_str,
            '-c:v', 'libx264', '-preset', 'fast',
            '-t', str(duration),
            '-an', str(clip_path)
        ]
        
        try:
            subprocess.run(cmd, capture_output=True, text=True, timeout=120)
            clip_paths.append(clip_path)
        except Exception as e:
            log(f"  Clip {i+1} error: {e}", "ERR")
        
        if (i + 1) % 5 == 0:
            log(f"  Progress: {i+1}/{len(image_paths)} clips")
    
    log(f"  {len(clip_paths)} clips created", "OK")
    return clip_paths


# ═══════════════════════════════════════════════════════════════
# STEP 7: FINAL VIDEO ASSEMBLY
# ═══════════════════════════════════════════════════════════════

def step7_assemble(clip_paths, project_dir):
    log("STEP 7: Final Video Assembly", "STEP")
    
    final_path = project_dir / "video_final.mp4"
    audio_path = project_dir / "narration_full.wav"
    
    # Concat list
    concat_file = project_dir / "concat_list.txt"
    with open(str(concat_file), 'w', encoding='utf-8') as f:
        for cp in clip_paths:
            escaped = str(cp).replace('\\', '/')
            f.write(f"file '{escaped}'\n")
    
    # Step 1: Concat clips (stream copy - fast)
    concat_video = project_dir / "concat_video.mp4"
    log("  Step 1/3: Concatenating clips...")
    cmd = ['ffmpeg', '-y', '-f', 'concat', '-safe', '0',
           '-i', str(concat_file), '-c', 'copy', '-an', str(concat_video)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        log(f"  Concat failed: {result.stderr[-200:]}", "ERR")
        return None
    
    # Step 2: Convert audio
    audio_aac = project_dir / "narration.aac"
    log("  Step 2/3: Converting audio...")
    cmd = ['ffmpeg', '-y', '-i', str(audio_path),
           '-c:a', 'aac', '-b:a', '192k', '-ar', '44100', str(audio_aac)]
    subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    
    # Step 3: Mux video + audio
    log("  Step 3/3: Muxing video + audio...")
    cmd = ['ffmpeg', '-y', '-i', str(concat_video), '-i', str(audio_aac),
           '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
           '-shortest', str(final_path)]
    result = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    
    if result.returncode != 0:
        log(f"  Mux failed: {result.stderr[-200:]}", "ERR")
        return None
    
    # Get duration
    try:
        probe = subprocess.run(
            ['ffprobe', '-v', 'error', '-show_entries', 'format=duration',
             '-of', 'default=noprint_wrappers=1:nokey=1', str(final_path)],
            capture_output=True, text=True, timeout=30
        )
        dur_min = float(probe.stdout.strip()) / 60
    except:
        dur_min = 0
    
    size_mb = final_path.stat().st_size / (1024*1024)
    log(f"  Video: {final_path}", "OK")
    log(f"  Size: {size_mb:.1f} MB | Duration: {dur_min:.1f} min", "OK")
    return final_path


# ═══════════════════════════════════════════════════════════════
# ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════

def run(theme=None, start_step=1):
    print("\n" + "=" * 60, flush=True)
    print("  ChillDude Pipeline v2", flush=True)
    print("=" * 60, flush=True)
    
    t0 = time.time()
    
    client = get_client()
    
    if not theme:
        theme = input("\nEnter video theme: ").strip()
        if not theme:
            theme = "everyday scams people still fall for"
    
    safe_name = re.sub(r'[^\w\s-]', '', theme)[:50].strip().replace(' ', '_').lower()
    project_dir = ensure_dir(OUTPUT_BASE / safe_name)
    log(f"Project: {project_dir}")
    
    # Check ffmpeg
    if not shutil.which("ffmpeg"):
        log("FFmpeg not found!", "ERR")
        sys.exit(1)
    
    # Step 1
    if start_step <= 1:
        title = step1_title_and_thumbnail(client, theme, project_dir)
    else:
        title = (project_dir / "title.txt").read_text(encoding="utf-8").strip()
    
    # Step 2
    if start_step <= 2:
        sections = step2_script_and_chunks(client, theme, title, project_dir)
    else:
        chunks_dir = project_dir / "chunks"
        sections = sorted(chunks_dir.glob("chunk_*.txt"))
        sections = [f.read_text(encoding="utf-8") for f in sections]
    
    # Step 3
    if start_step <= 3:
        wav_files, durations = step3_narration(client, sections, project_dir)
    else:
        narration_dir = project_dir / "narration"
        wav_files = sorted(narration_dir.glob("section_*.wav"))
        durations = []
        for wf in wav_files:
            with wave.open(str(wf), 'rb') as w:
                durations.append(w.getnframes() / w.getframerate())
    
    # Step 4
    if start_step <= 4:
        srt_path = step4_srt(sections, durations, project_dir)
    else:
        srt_path = project_dir / "subtitles.srt"
    
    # Step 5
    if start_step <= 5:
        image_paths, image_durations, csv_rows = step5_csv_images(client, srt_path, project_dir)
    else:
        # Load from CSV
        csv_path = project_dir / "scenes.csv"
        with open(str(csv_path), 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            csv_rows = [dict(r) for r in reader]
        image_rows = [(i,r) for i,r in enumerate(csv_rows) if r.get("asset")=="imagem" and r.get("caminho")]
        image_paths = [Path(r["caminho"]) for _,r in image_rows]
        image_durations = []
        for idx, (ri,r) in enumerate(image_rows):
            s = parse_srt_time_to_ms(r["start time"])
            if idx+1 < len(image_rows):
                e = parse_srt_time_to_ms(image_rows[idx+1][1]["start time"])
            else:
                e = parse_srt_time_to_ms(csv_rows[-1]["end time"])
            image_durations.append(max(3.0, min((e-s)/1000, 60.0)))
    
    # Step 6
    if start_step <= 6:
        clip_paths = step6_ken_burns(image_paths, image_durations, project_dir)
    else:
        clips_dir = project_dir / "clips"
        clip_paths = sorted(clips_dir.glob("clip_*.mp4"))
    
    # Step 7
    if start_step <= 7:
        result = step7_assemble(clip_paths, project_dir)
    
    elapsed = (time.time() - t0) / 60
    print("\n" + "=" * 60, flush=True)
    if result:
        print(f"  [OK] VIDEO COMPLETE in {elapsed:.1f} min", flush=True)
        print(f"  Video: {result}", flush=True)
    else:
        print(f"  [FAIL] Assembly failed after {elapsed:.1f} min", flush=True)
    print("=" * 60, flush=True)
    
    return result


if __name__ == "__main__":
    theme = None
    start = 1
    
    for arg in sys.argv[1:]:
        if arg.startswith("--step="):
            start = int(arg.split("=")[1])
        else:
            theme = arg if not theme else theme + " " + arg
    
    run(theme=theme, start_step=start)
