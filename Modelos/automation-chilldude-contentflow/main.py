#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ChillDude Video Automation Pipeline
====================================
Generates YouTube videos using Gemini API for all content creation.
Uses FFmpeg for final video assembly with Ken Burns effect.

Pipeline:
1. User provides a theme
2. Gemini generates titles (auto-selects best)
3. Gemini generates a 9-12 minute narration script
4. Gemini TTS generates voice narration (section by section)
5. SRT subtitles are created from audio timing
6. Nano Banana 2 generates cartoon-style scene images
7. Nano Banana Pro generates thumbnail
8. FFmpeg assembles everything with Ken Burns effect
"""

import os
import sys
import io
import re
import wave
import time
import math
import random
import shutil
import subprocess
import traceback
from pathlib import Path

# Fix Windows UTF-8 output
os.environ["PYTHONIOENCODING"] = "utf-8"


from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image as PILImage

# ═══════════════════════════════════════════════════════════════
# CONFIGURATION
# ═══════════════════════════════════════════════════════════════

BASE_DIR = Path(__file__).parent
OUTPUT_BASE = BASE_DIR / "output"

# Models
MODEL_TEXT = "gemini-2.5-flash"
MODEL_TTS = "gemini-2.5-flash-preview-tts"
# Image model fallback chain (try each one if quota is exhausted)
IMAGE_MODELS = [
    "gemini-2.5-flash-image",        # Nano Banana (original)
    "gemini-3.1-flash-image-preview", # Nano Banana 2
    "gemini-2.5-flash",              # Gemini Flash (also supports image output)
]
MODEL_THUMBNAIL = "gemini-2.5-flash-image"  # Use same model for thumbnail

# Voice
VOICE_NAME = "Kore"

# Video settings
FPS = 25
VIDEO_WIDTH = 1920
VIDEO_HEIGHT = 1080

# Timing
API_DELAY = 3       # seconds between API calls
IMAGE_DELAY = 8    # longer delay for image generation (rate limited)
MAX_RETRIES = 3

# ═══════════════════════════════════════════════════════════════
# STYLE PROMPTS
# ═══════════════════════════════════════════════════════════════

TITLE_SYSTEM_PROMPT = """You are a YouTube title generator for a viral educational channel.

The formula for titles is: [Universal Familiarity] + [Value Contradiction]
The title always combines a common concept everyone understands with a logical break that seems impossible.

Examples of real titles from this channel:
- "Things That Are Stupidly Expensive But Cost Nothing To Make"
- "Technologies That Got Destroyed For Making Life Too Easy"
- "Lies Everyone Agrees To Pretend Are True"
- "Things We All Pretend To Understand But Nobody Actually Does"
- "Skills Nobody Has Anymore Because Technology Made Them Pointless"
- "Normal Things We Do That Animals Think Are Insane"
- "Red Flags Therapists Look For That You Don't Know About"
- "Everyday Objects That Are Secretly Making You Sick"
- "Professional Services You Can Replace With Free Apps Nobody Knows"
- "Things That Cost 500 At The Mechanic But 5 To Fix Yourself"

Rules:
- Title must be in English
- Title Case Capitalization
- Maximum 12 words
- Must create cognitive dissonance / paradox
- Must feel universally relatable
- No clickbait phrases like "You Won't Believe"
- No numbers in the title unless comparing prices"""

SCRIPT_SYSTEM_PROMPT = """You are a scriptwriter for a viral YouTube channel that makes educational/entertainment videos.

Style guide (match this exact tone):
- Conversational, slightly sarcastic narrator
- Like a smart friend explaining something wild over coffee
- Uses funny, relatable analogies (comparing expensive things to buying pizza, etc.)
- Each item starts with "Number X, [topic]." format
- Starts with a hook that immediately grabs attention
- Uses specific numbers and facts for credibility
- Includes surprising comparisons to make points hit harder
- Ends with a brief, clean outro

Format requirements:
- Start directly with "Let's get right into it. Number 10,"
- Exactly 10 items, counting DOWN from 10 to 1
- Each item should be 220-280 words
- End with "That's all for today. I'll be making similar videos in the future. Subscribe to see them."
- Total word count: 2400-2800 words
- NO stage directions, NO [brackets], NO (parenthetical notes)
- Just pure narration text that will be read aloud
- Separate each numbered item with a blank line
- Write ONLY the narration text"""

VOICE_DIRECTOR_NOTES = """# AUDIO PROFILE: Educational Narrator
## "The Smart Friend"

### DIRECTOR'S NOTES
Style: Casual, conversational, slightly sarcastic narrator. Think of a witty, informed friend explaining something fascinating over coffee. Occasionally incredulous when revealing shocking facts. Sometimes genuinely amused by the absurdity. Always engaging and easy to listen to. Natural micro-pauses between sentences. Clear emphasis on surprising numbers, percentages, and facts.

Pacing: Medium pace with natural conversational rhythm. Slightly faster during exciting reveals or building momentum. Slower and more deliberate for dramatic effect on key facts or punchlines. Never monotone. The pace flows like natural storytelling.

Accent: Standard American English, young adult male voice.

### TRANSCRIPT
"""

IMAGE_STYLE_PROMPT = """Create a SINGLE cartoon scene illustration that FILLS THE ENTIRE IMAGE.

CRITICAL LAYOUT RULES:
- This is ONE SINGLE SCENE, NOT a comic strip, NOT multiple panels, NOT a grid layout
- The scene must FILL THE ENTIRE FRAME edge to edge with NO borders, NO margins, NO white space around it
- NO panel divisions, NO comic strip format, NO split screens, NO story sequence
- Think of it as a SINGLE WIDE CINEMATIC SHOT, like a frame from an animated movie
- The background must extend to ALL EDGES of the image

MANDATORY ART STYLE RULES:
- Characters are STICK FIGURES with large round white heads
- Characters have messy spiky orange-brown hair on top of their heads
- Eyes are simple black dots (can show emotion: hearts, dollar signs, X eyes, anger veins)
- Faces are very expressive and exaggerated (wide open mouths, furrowed brows, etc.)
- Bodies are thin BLACK LINES in stick-figure style
- Art uses BOLD BLACK OUTLINES on everything
- Colors are FLAT and SOLID - absolutely NO gradients
- Backgrounds use SOFT PASTEL colors that FILL THE ENTIRE FRAME
- Overall style is similar to Cyanide and Happiness webcomic but as a SINGLE WIDE SCENE
- The scene should be humorous and visually exaggerated
- Horizontal 16:9 widescreen composition - background fills everything
- NO text, NO watermarks, NO borders, NO labels, NO panel borders"""

THUMBNAIL_STYLE_PROMPT = """Create a YouTube thumbnail image.

MANDATORY STYLE:
- Multiple expressive stick-figure cartoon characters (4-6 characters)
- Characters have round white heads, spiky orange-brown hair, big expressive eyes, stick bodies
- Bold black outlines, flat colors, exaggerated expressions
- Style similar to "Cyanide and Happiness" webcomic
- WHITE or very light background
- Characters showing extreme emotions related to the topic (shocked, angry, confused, happy)
- Relevant objects/icons scattered around characters
- Busy, eye-catching composition suitable for YouTube thumbnail
- Horizontal format (1280x720 pixels)
- NO text in the image, NO watermarks, NO borders"""


# ═══════════════════════════════════════════════════════════════
# UTILITY FUNCTIONS
# ═══════════════════════════════════════════════════════════════

def log(msg, level="INFO"):
    """Print a timestamped log message"""
    timestamp = time.strftime("%H:%M:%S")
    icons = {"INFO": "i", "OK": "+", "WARN": "!", "ERR": "X", "STEP": ">"}
    prefix = icons.get(level, "")
    print(f"[{timestamp}] [{prefix}] {msg}", flush=True)


def save_wav(filename, pcm_data, channels=1, rate=24000, sample_width=2):
    """Save raw PCM data as a WAV file"""
    with wave.open(str(filename), "wb") as wf:
        wf.setnchannels(channels)
        wf.setsampwidth(sample_width)
        wf.setframerate(rate)
        wf.writeframes(pcm_data)


def get_wav_duration(filepath):
    """Get duration of a WAV file in seconds"""
    with wave.open(str(filepath), "rb") as wf:
        frames = wf.getnframes()
        rate = wf.getframerate()
        return frames / rate


def format_srt_time(seconds):
    """Format seconds to SRT time format HH:MM:SS,mmm"""
    if seconds < 0:
        seconds = 0
    hours = int(seconds // 3600)
    minutes = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds % 1) * 1000)
    return f"{hours:02d}:{minutes:02d}:{secs:02d},{millis:03d}"


def split_into_sentences(text):
    """Split text into sentences"""
    sentences = re.split(r'(?<=[.!?])\s+', text.strip())
    return [s.strip() for s in sentences if s.strip()]


def count_words(text):
    """Count words in text"""
    return len(text.split())


def parse_retry_delay(error_str):
    """Extract retry delay from API error message"""
    match = re.search(r'retryDelay.*?(\d+\.?\d*)s', error_str)
    if match:
        return min(float(match.group(1)) + 2, 120)  # add 2s buffer, cap at 120s
    match = re.search(r'retry in (\d+\.?\d*)s', error_str, re.IGNORECASE)
    if match:
        return min(float(match.group(1)) + 2, 120)
    return None


def api_call_with_retry(func, *args, max_retries=MAX_RETRIES, delay=API_DELAY, **kwargs):
    """Call an API function with retry logic, rate limiting, and smart backoff"""
    for attempt in range(max_retries):
        try:
            result = func(*args, **kwargs)
            time.sleep(delay)
            return result
        except Exception as e:
            err_str = str(e)
            if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                retry_delay = parse_retry_delay(err_str)
                wait = retry_delay if retry_delay else (attempt + 1) * 15
                if attempt < max_retries - 1:
                    log(f"Rate limited (attempt {attempt+1}/{max_retries}). Waiting {wait:.0f}s...", "WARN")
                    time.sleep(wait)
                else:
                    log(f"Rate limit exhausted after {max_retries} attempts", "ERR")
                    raise
            else:
                if attempt < max_retries - 1:
                    wait = (attempt + 1) * 5
                    log(f"API error (attempt {attempt+1}/{max_retries}): {err_str[:100]}. Retry in {wait}s...", "WARN")
                    time.sleep(wait)
                else:
                    log(f"API failed after {max_retries} attempts: {err_str[:200]}", "ERR")
                    raise


def ensure_dir(path):
    """Create directory if it doesn't exist"""
    Path(path).mkdir(parents=True, exist_ok=True)
    return Path(path)


def check_ffmpeg():
    """Check if FFmpeg is available"""
    try:
        result = subprocess.run(['ffmpeg', '-version'], capture_output=True, text=True, timeout=10)
        return result.returncode == 0
    except Exception:
        return False


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 1: GENERATE TITLES
# ═══════════════════════════════════════════════════════════════

def generate_titles(client, theme):
    """Generate 5 viral YouTube titles for a given theme"""
    log(f"Generating titles for theme: '{theme}'", "STEP")

    response = api_call_with_retry(
        client.models.generate_content,
        model=MODEL_TEXT,
        contents=f"Generate exactly 5 YouTube video titles about the theme: '{theme}'.\n\nReturn ONLY the 5 titles, one per line, numbered 1-5. No explanations.",
        config=types.GenerateContentConfig(
            system_instruction=TITLE_SYSTEM_PROMPT,
            temperature=1.0,
        )
    )

    titles = []
    for line in response.text.strip().split("\n"):
        line = line.strip()
        if line:
            clean = re.sub(r'^\d+[\.\)]\s*', '', line).strip('"').strip("'").strip()
            if clean and len(clean) > 10:
                titles.append(clean)

    log(f"Generated {len(titles)} titles", "OK")
    return titles[:5]


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 2: GENERATE SCRIPT
# ═══════════════════════════════════════════════════════════════

def generate_script(client, theme, title):
    """Generate a full narration script (2400-2800 words)"""
    log(f"Generating script for: '{title}'", "STEP")

    prompt = f"""Write a complete narration script for a YouTube video titled: "{title}"
The video explores the theme of "{theme}" through 10 specific, fascinating examples.

Requirements:
- Exactly 10 items, counting down from Number 10 to Number 1
- Each item: 220-280 words with specific facts, numbers, percentages
- Total: 2400-2800 words
- Start with "Let's get right into it. Number 10,"
- End with brief outro
- Conversational, sarcastic, engaging tone
- Funny analogies and surprising comparisons
- ONLY narration text - no formatting, no stage directions"""

    response = api_call_with_retry(
        client.models.generate_content,
        model=MODEL_TEXT,
        contents=prompt,
        config=types.GenerateContentConfig(
            system_instruction=SCRIPT_SYSTEM_PROMPT,
            temperature=0.9,
        )
    )

    script = response.text.strip()
    word_count = count_words(script)
    log(f"Script generated: {word_count} words", "OK")
    return script


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 3: SPLIT SCRIPT INTO SECTIONS
# ═══════════════════════════════════════════════════════════════

def split_script_into_sections(script):
    """Split script into sections by 'Number X' markers"""
    # Split on "Number X," patterns
    parts = re.split(
        r'(?=(?:Number\s+(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten))[,.\s])',
        script,
        flags=re.IGNORECASE
    )

    sections = []
    for part in parts:
        part = part.strip()
        if part and len(part) > 20:
            sections.append(part)

    # If splitting failed, divide by word count
    if len(sections) < 3:
        words = script.split()
        chunk_size = max(200, len(words) // 8)
        sections = []
        for i in range(0, len(words), chunk_size):
            chunk = ' '.join(words[i:i+chunk_size])
            if chunk.strip():
                sections.append(chunk.strip())

    log(f"Script split into {len(sections)} sections", "OK")
    for i, sec in enumerate(sections):
        log(f"  Section {i+1}: {count_words(sec)} words")
    return sections


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 4: GENERATE TTS NARRATION
# ═══════════════════════════════════════════════════════════════

def generate_tts_section(client, text, output_path, section_num):
    """Generate TTS audio for a single section"""
    log(f"  TTS section {section_num} ({count_words(text)} words)...")

    tts_prompt = VOICE_DIRECTOR_NOTES + text

    response = api_call_with_retry(
        client.models.generate_content,
        model=MODEL_TTS,
        contents=tts_prompt,
        config=types.GenerateContentConfig(
            response_modalities=["AUDIO"],
            speech_config=types.SpeechConfig(
                voice_config=types.VoiceConfig(
                    prebuilt_voice_config=types.PrebuiltVoiceConfig(
                        voice_name=VOICE_NAME,
                    )
                )
            ),
        )
    )

    data = response.candidates[0].content.parts[0].inline_data.data
    save_wav(str(output_path), data)
    duration = get_wav_duration(str(output_path))
    log(f"  Section {section_num} TTS: {duration:.1f}s ({duration/60:.1f}min)", "OK")
    return duration


def generate_all_tts(client, sections, output_dir):
    """Generate TTS for all sections and return file paths + durations"""
    log("Generating narration (TTS)...", "STEP")
    ensure_dir(output_dir)

    wav_files = []
    durations = []

    for i, section in enumerate(sections):
        output_path = output_dir / f"section_{i:02d}.wav"

        try:
            duration = generate_tts_section(client, section, output_path, i + 1)
            wav_files.append(output_path)
            durations.append(duration)
        except Exception as e:
            log(f"  TTS section {i+1} failed: {e}", "ERR")
            # Create short silence as fallback
            silence_duration = max(5, count_words(section) * 0.4)
            silence_data = b'\x00' * int(silence_duration * 24000 * 2)
            save_wav(str(output_path), silence_data)
            wav_files.append(output_path)
            durations.append(silence_duration)

    total_duration = sum(durations)
    log(f"Total narration: {total_duration:.1f}s ({total_duration/60:.1f} min)", "OK")
    return wav_files, durations


def concatenate_wavs(wav_files, output_path, gap_seconds=0.3):
    """Concatenate WAV files with small gaps between them"""
    log("Concatenating audio files...", "STEP")

    all_data = b""
    silence = b'\x00' * int(gap_seconds * 24000 * 2)

    for i, wav_file in enumerate(wav_files):
        with wave.open(str(wav_file), "rb") as wf:
            all_data += wf.readframes(wf.getnframes())
        if i < len(wav_files) - 1:
            all_data += silence

    save_wav(str(output_path), all_data)
    duration = get_wav_duration(str(output_path))
    log(f"Full audio: {duration:.1f}s ({duration/60:.1f} min)", "OK")
    return duration


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 5: GENERATE SRT
# ═══════════════════════════════════════════════════════════════

def generate_srt(sections, durations, output_path, gap_seconds=0.3):
    """Generate SRT subtitle file from sections and their audio durations"""
    log("Generating SRT subtitles...", "STEP")

    srt_entries = []
    segment_num = 1
    cumulative_time = 0.0

    for sec_idx, (section_text, section_duration) in enumerate(zip(sections, durations)):
        sentences = split_into_sentences(section_text)
        if not sentences:
            cumulative_time += section_duration + gap_seconds
            continue

        total_words = sum(count_words(s) for s in sentences)
        if total_words == 0:
            cumulative_time += section_duration + gap_seconds
            continue

        time_cursor = cumulative_time

        for sent in sentences:
            sent_words = count_words(sent)
            sent_duration = (sent_words / total_words) * section_duration
            sent_duration = max(0.8, sent_duration)  # minimum 0.8s per entry

            start_time = time_cursor
            end_time = time_cursor + sent_duration

            srt_entries.append({
                'num': segment_num,
                'start': start_time,
                'end': end_time,
                'text': sent,
                'section': sec_idx,
            })

            segment_num += 1
            time_cursor = end_time

        cumulative_time = time_cursor + gap_seconds

    # Write SRT file
    with open(str(output_path), 'w', encoding='utf-8') as f:
        for entry in srt_entries:
            f.write(f"{entry['num']}\n")
            f.write(f"{format_srt_time(entry['start'])} --> {format_srt_time(entry['end'])}\n")
            f.write(f"{entry['text']}\n")
            f.write("\n")

    log(f"SRT generated: {len(srt_entries)} subtitle entries", "OK")
    return srt_entries


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 6: GENERATE SCENE IMAGES
# ═══════════════════════════════════════════════════════════════

def generate_scene_descriptions(client, sections):
    """Ask Gemini to describe visual scenes for each script section.
    First 30% of sections get MORE images (6 per section) for faster pacing.
    Remaining sections get 4 images each.
    """
    log("Generating scene descriptions...", "STEP")

    all_descriptions = []
    total_sections = len(sections)
    first_30_pct = max(1, int(total_sections * 0.3))

    for i, section in enumerate(sections):
        # First 30% gets more images for faster visual pacing
        if i < first_30_pct:
            num_scenes = 6
        else:
            num_scenes = 4

        log(f"  Section {i+1}/{total_sections}: requesting {num_scenes} scenes...")

        prompt = f"""Based on this narration from a YouTube video, describe exactly {num_scenes} individual cartoon scenes.

IMPORTANT: Each scene is a SINGLE WIDE CINEMATIC SHOT (like a movie frame), NOT a comic strip panel.
Each description should represent ONE moment in time that illustrates a specific point from the narration.

Narration:
\"{section}\"

For each scene, write a concise visual description (1-2 sentences) focusing on:
- What stick-figure characters are doing in this specific moment
- Their facial expressions and body language
- Key objects, props, or environment elements visible
- The setting/background
- Each scene should be DIFFERENT from the others - show different moments, actions, or perspectives

Return ONLY {num_scenes} descriptions, numbered, one per line.
No explanations, just the visual descriptions."""

        try:
            response = api_call_with_retry(
                client.models.generate_content,
                model=MODEL_TEXT,
                contents=prompt,
                config=types.GenerateContentConfig(temperature=0.8)
            )

            scenes = []
            for line in response.text.strip().split('\n'):
                line = line.strip()
                if line:
                    clean = re.sub(r'^[\d]+[:\.\)]\s*', '', line).strip()
                    clean = re.sub(r'^Scene\s*\d+[:\.\)]\s*', '', clean, flags=re.IGNORECASE).strip()
                    if clean and len(clean) > 15:
                        scenes.append(clean)

            # Take up to the requested number
            all_descriptions.extend(scenes[:num_scenes])
            log(f"    Got {min(len(scenes), num_scenes)} scene descriptions")
        except Exception as e:
            log(f"  Scene description {i+1} failed: {e}", "WARN")
            # Fallback descriptions
            for _ in range(num_scenes):
                all_descriptions.append(
                    "A stick figure character in a wide cinematic scene, "
                    "showing an exaggerated emotional reaction, "
                    "with a pastel-colored background filling the entire frame"
                )

    log(f"Total scene descriptions: {len(all_descriptions)}", "OK")
    return all_descriptions


def generate_scene_image(client, scene_description, output_path, image_num):
    """Generate a single cartoon scene image, trying multiple models"""
    log(f"  Generating image {image_num}...")

    prompt = f"""{IMAGE_STYLE_PROMPT}

Scene to illustrate: {scene_description}"""

    for model_name in IMAGE_MODELS:
        try:
            response = api_call_with_retry(
                client.models.generate_content,
                model=model_name,
                contents=prompt,
                delay=IMAGE_DELAY,
            )

            # Extract image from response
            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data is not None:
                        try:
                            img_data = part.inline_data.data
                            img = PILImage.open(io.BytesIO(img_data))
                            img = img.resize((VIDEO_WIDTH, VIDEO_HEIGHT), PILImage.LANCZOS)
                            img.save(str(output_path))
                            log(f"  Image {image_num} saved (model: {model_name})", "OK")
                            return True
                        except Exception as e:
                            log(f"  Image {image_num} save error: {e}", "WARN")

            log(f"  Image {image_num}: No image data from {model_name}", "WARN")
        except Exception as e:
            err_str = str(e)
            if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                log(f"  Model {model_name} rate limited, trying next model...", "WARN")
                continue
            else:
                log(f"  Model {model_name} error: {err_str[:100]}", "WARN")
                continue

    log(f"  Image {image_num}: All models failed", "WARN")
    return False


def create_fallback_image(output_path, text="", color=None):
    """Create a simple solid-color fallback image"""
    if color is None:
        color = random.choice([
            (173, 216, 230),  # light blue
            (144, 238, 144),  # light green
            (255, 228, 196),  # bisque
            (221, 160, 221),  # plum
            (176, 196, 222),  # light steel blue
        ])
    img = PILImage.new('RGB', (VIDEO_WIDTH, VIDEO_HEIGHT), color)
    img.save(str(output_path))


def generate_all_images(client, scene_descriptions, output_dir):
    """Generate all scene images"""
    log(f"Generating {len(scene_descriptions)} scene images...", "STEP")
    ensure_dir(output_dir)

    image_paths = []

    for i, desc in enumerate(scene_descriptions):
        output_path = output_dir / f"scene_{i:03d}.png"

        success = False
        for attempt in range(MAX_RETRIES):
            try:
                success = generate_scene_image(client, desc, output_path, i + 1)
                if success:
                    break
            except Exception as e:
                log(f"  Image {i+1} attempt {attempt+1} failed: {e}", "WARN")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(5)

        if not success:
            log(f"  Using fallback for image {i+1}", "WARN")
            create_fallback_image(output_path)

        image_paths.append(output_path)

        if (i + 1) % 5 == 0:
            log(f"  Progress: {i+1}/{len(scene_descriptions)} images done")

    log(f"Generated {len(image_paths)} images", "OK")
    return image_paths


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 7: GENERATE THUMBNAIL
# ═══════════════════════════════════════════════════════════════

def generate_thumbnail(client, title, theme, output_path):
    """Generate YouTube video thumbnail, trying multiple models"""
    log("Generating thumbnail...", "STEP")

    prompt = f"""{THUMBNAIL_STYLE_PROMPT}

The video is about: "{title}"
Theme: {theme}

Create a visually striking thumbnail with cartoon characters showing extreme reactions to this topic."""

    for model_name in IMAGE_MODELS:
        try:
            response = api_call_with_retry(
                client.models.generate_content,
                model=model_name,
                contents=prompt,
                delay=IMAGE_DELAY,
            )

            if response.candidates and response.candidates[0].content.parts:
                for part in response.candidates[0].content.parts:
                    if hasattr(part, 'inline_data') and part.inline_data is not None:
                        try:
                            img_data = part.inline_data.data
                            img = PILImage.open(io.BytesIO(img_data))
                            img = img.resize((1280, 720), PILImage.LANCZOS)
                            img.save(str(output_path))
                            log(f"Thumbnail generated (model: {model_name})", "OK")
                            return True
                        except Exception:
                            pass
        except Exception as e:
            err_str = str(e)
            if '429' in err_str or 'RESOURCE_EXHAUSTED' in err_str:
                log(f"  Thumbnail: {model_name} rate limited, trying next...", "WARN")
                continue
            log(f"  Thumbnail: {model_name} error: {err_str[:80]}", "WARN")

    log("Using fallback thumbnail", "WARN")
    create_fallback_image(output_path, color=(40, 40, 40))
    return False


# ═══════════════════════════════════════════════════════════════
# PIPELINE STEP 8: ASSEMBLE VIDEO WITH FFMPEG
# ═══════════════════════════════════════════════════════════════

def calculate_image_durations(srt_entries, num_images, sections, section_durations):
    """Calculate how long each image should be displayed based on SRT timing"""
    total_duration = sum(section_durations)
    images_per_section = max(1, num_images // len(sections)) if sections else 1

    image_durations = []
    img_idx = 0

    for sec_idx, sec_dur in enumerate(section_durations):
        n_imgs = images_per_section
        # Last section gets remaining images
        if sec_idx == len(section_durations) - 1:
            n_imgs = num_images - img_idx

        if n_imgs <= 0:
            break

        per_image = sec_dur / n_imgs
        for _ in range(n_imgs):
            if img_idx < num_images:
                image_durations.append(max(3.0, per_image))
                img_idx += 1

    # Fill any remaining
    while len(image_durations) < num_images:
        image_durations.append(5.0)

    return image_durations[:num_images]


def create_ken_burns_clips(image_paths, image_durations, clips_dir):
    """Create individual video clips with Ken Burns zoom effect"""
    log(f"Creating {len(image_paths)} Ken Burns video clips...", "STEP")
    ensure_dir(clips_dir)

    clip_paths = []

    for i, (img_path, duration) in enumerate(zip(image_paths, image_durations)):
        clip_path = clips_dir / f"clip_{i:03d}.mp4"
        total_frames = max(2, int(duration * FPS))

        # Vary the zoom speed and max zoom for visual interest
        zoom_speed = random.uniform(0.0004, 0.0010)
        max_zoom = random.uniform(1.15, 1.35)

        # Build zoompan filter - zoom in from center
        zoom_filter = (
            f"scale=3840:-1,"
            f"zoompan=z='min(zoom+{zoom_speed:.6f},{max_zoom:.2f})':"
            f"d={total_frames}:"
            f"x='iw/2-(iw/zoom/2)':"
            f"y='ih/2-(ih/zoom/2)':"
            f"s={VIDEO_WIDTH}x{VIDEO_HEIGHT}:"
            f"fps={FPS}"
        )

        cmd = [
            'ffmpeg', '-y',
            '-loop', '1',
            '-i', str(img_path),
            '-vf', zoom_filter,
            '-t', f"{duration:.2f}",
            '-c:v', 'libx264',
            '-preset', 'fast',
            '-pix_fmt', 'yuv420p',
            '-an',
            str(clip_path)
        ]

        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=180)
            if result.returncode != 0:
                # Fallback: simple static image (no Ken Burns)
                log(f"  Clip {i+1}: Ken Burns failed, using static", "WARN")
                fallback_cmd = [
                    'ffmpeg', '-y',
                    '-loop', '1', '-i', str(img_path),
                    '-t', f"{duration:.2f}",
                    '-vf', f'scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}:force_original_aspect_ratio=decrease,pad={VIDEO_WIDTH}:{VIDEO_HEIGHT}:(ow-iw)/2:(oh-ih)/2',
                    '-c:v', 'libx264', '-preset', 'fast',
                    '-pix_fmt', 'yuv420p', '-an',
                    str(clip_path)
                ]
                subprocess.run(fallback_cmd, capture_output=True, text=True, timeout=120)
        except Exception as e:
            log(f"  Clip {i+1} error: {e}", "WARN")
            fallback_cmd = [
                'ffmpeg', '-y',
                '-loop', '1', '-i', str(img_path),
                '-t', f"{duration:.2f}",
                '-vf', f'scale={VIDEO_WIDTH}:{VIDEO_HEIGHT}',
                '-c:v', 'libx264', '-preset', 'fast',
                '-pix_fmt', 'yuv420p', '-an',
                str(clip_path)
            ]
            subprocess.run(fallback_cmd, capture_output=True, text=True, timeout=120)

        clip_paths.append(clip_path)

        if (i + 1) % 5 == 0:
            log(f"  Ken Burns progress: {i+1}/{len(image_paths)} clips")

    log(f"Created {len(clip_paths)} video clips", "OK")
    return clip_paths


def assemble_final_video(clip_paths, audio_path, srt_path, output_path, project_dir):
    """Assemble the final video: concat clips + audio + subtitles"""
    log("Assembling final video...", "STEP")

    # Step 1: Create concat list file
    concat_file = project_dir / "concat_list.txt"
    with open(str(concat_file), 'w', encoding='utf-8') as f:
        for clip_path in clip_paths:
            escaped = str(clip_path).replace('\\', '/')
            f.write(f"file '{escaped}'\n")

    # Step 2: Concatenate video clips (use 'copy' — all clips share same codec)
    concat_video = project_dir / "concat_video.mp4"
    log("  Step 1/3: Concatenating video clips...")
    cmd_concat = [
        'ffmpeg', '-y',
        '-f', 'concat', '-safe', '0',
        '-i', str(concat_file),
        '-c', 'copy', '-an',
        str(concat_video)
    ]
    result = subprocess.run(cmd_concat, capture_output=True, text=True, timeout=1800)
    if result.returncode != 0:
        log(f"  Concat error: {result.stderr[-300:]}", "ERR")
        return None

    # Step 3: Convert WAV audio to AAC
    audio_aac = project_dir / "narration.aac"
    log("  Step 2/3: Converting audio...")
    cmd_audio = [
        'ffmpeg', '-y',
        '-i', str(audio_path),
        '-c:a', 'aac', '-b:a', '192k', '-ar', '44100',
        str(audio_aac)
    ]
    subprocess.run(cmd_audio, capture_output=True, text=True, timeout=120)

    # Step 4: Combine video + audio + subtitles
    log("  Step 3/3: Final assembly (video + audio + subtitles)...")

    # Try with subtitles burned in
    srt_escaped = str(srt_path).replace('\\', '/').replace(':', '\\\\:')
    subtitle_style = (
        "FontSize=24,FontName=Arial,Bold=1,"
        "PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,"
        "Outline=2,Shadow=1,MarginV=45,Alignment=2"
    )

    cmd_final = [
        'ffmpeg', '-y',
        '-i', str(concat_video),
        '-i', str(audio_aac),
        '-vf', f"subtitles='{srt_escaped}':force_style='{subtitle_style}'",
        '-c:v', 'libx264', '-preset', 'medium', '-crf', '20',
        '-c:a', 'aac', '-b:a', '192k',
        '-shortest',
        '-pix_fmt', 'yuv420p',
        str(output_path)
    ]

    result = subprocess.run(cmd_final, capture_output=True, text=True, timeout=1800)

    if result.returncode != 0:
        log("  Subtitle burn-in failed, assembling without subtitles...", "WARN")
        # Fallback: mux without subtitle filter
        cmd_nosub = [
            'ffmpeg', '-y',
            '-i', str(concat_video),
            '-i', str(audio_aac),
            '-c:v', 'copy', '-c:a', 'aac', '-b:a', '192k',
            '-shortest',
            str(output_path)
        ]
        result = subprocess.run(cmd_nosub, capture_output=True, text=True, timeout=600)
        if result.returncode != 0:
            log(f"  Final assembly error: {result.stderr[-300:]}", "ERR")
            return None

    # Clean up temp files
    try:
        concat_video.unlink(missing_ok=True)
        audio_aac.unlink(missing_ok=True)
        concat_file.unlink(missing_ok=True)
    except Exception:
        pass

    if output_path.exists():
        size_mb = output_path.stat().st_size / (1024 * 1024)
        duration = get_video_duration(output_path)
        log(f"Final video: {output_path}", "OK")
        log(f"  Size: {size_mb:.1f} MB | Duration: {duration:.1f}s ({duration/60:.1f} min)")
        return output_path
    else:
        log("Final video file was not created", "ERR")
        return None


def get_video_duration(video_path):
    """Get video duration using ffprobe"""
    try:
        cmd = [
            'ffprobe', '-v', 'error',
            '-show_entries', 'format=duration',
            '-of', 'default=noprint_wrappers=1:nokey=1',
            str(video_path)
        ]
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
        return float(result.stdout.strip())
    except Exception:
        return 0.0


# ═══════════════════════════════════════════════════════════════
# MAIN PIPELINE ORCHESTRATOR
# ═══════════════════════════════════════════════════════════════

def run_pipeline(theme=None):
    """Run the complete video generation pipeline end-to-end"""

    print("\n" + "=" * 65, flush=True)
    print("   ChillDude Video Automation Pipeline", flush=True)
    print("   Powered by Gemini API + FFmpeg", flush=True)
    print("=" * 65 + "\n", flush=True)

    start_time = time.time()

    # ── Setup ──
    load_dotenv(BASE_DIR / ".env")

    if not check_ffmpeg():
        log("FFmpeg not found! Please install FFmpeg and add it to PATH.", "ERR")
        sys.exit(1)

    # Try OAuth2 first (higher quotas), fall back to API key
    client = None
    try:
        from load_creds import load_creds
        creds = load_creds()
        if creds:
            client = genai.Client(credentials=creds)
            log("Gemini client initialized (OAuth2 - higher quotas!)", "OK")
    except Exception as e:
        log(f"OAuth2 setup failed: {e}", "WARN")

    if client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            log("No authentication method available (OAuth2 failed, no API key)", "ERR")
            sys.exit(1)
        client = genai.Client(api_key=api_key)
        log("Gemini client initialized (API key - limited quotas)", "OK")

    # ── 1. Get Theme ──
    if not theme:
        theme = input("\nEnter the video theme: ").strip()
        if not theme:
            theme = "everyday scams"
    log(f"Theme: '{theme}'")

    # Create project directory
    safe_name = re.sub(r'[^\w\s-]', '', theme)[:50].strip().replace(' ', '_').lower()
    project_dir = ensure_dir(OUTPUT_BASE / safe_name)
    log(f"Project directory: {project_dir}")

    # ── 2. Generate Titles ──
    titles = generate_titles(client, theme)
    print("\nGenerated titles:", flush=True)
    for i, t in enumerate(titles):
        print(f"   {i+1}. {t}", flush=True)

    chosen_title = titles[0] if titles else f"Things About {theme.title()} Nobody Tells You"
    print(f"\n   => Auto-selected: \"{chosen_title}\"", flush=True)

    with open(str(project_dir / "title.txt"), 'w', encoding='utf-8') as f:
        f.write(chosen_title)

    # ── 3. Generate Script ──
    script = generate_script(client, theme, chosen_title)
    with open(str(project_dir / "script.txt"), 'w', encoding='utf-8') as f:
        f.write(script)
    log(f"Script saved to script.txt ({count_words(script)} words)")

    # ── 4. Split Script ──
    sections = split_script_into_sections(script)

    # Save sections for reference
    with open(str(project_dir / "sections.txt"), 'w', encoding='utf-8') as f:
        for i, sec in enumerate(sections):
            f.write(f"=== SECTION {i+1} ({count_words(sec)} words) ===\n")
            f.write(sec + "\n\n")

    # ── 5. Generate TTS ──
    narration_dir = ensure_dir(project_dir / "narration")
    wav_files, durations = generate_all_tts(client, sections, narration_dir)

    # ── 6. Concatenate Audio ──
    full_audio = project_dir / "narration_full.wav"
    total_duration = concatenate_wavs(wav_files, full_audio)
    log(f"Target video duration: {total_duration/60:.1f} minutes")

    # ── 7. Generate SRT ──
    srt_path = project_dir / "subtitles.srt"
    srt_entries = generate_srt(sections, durations, srt_path)

    # ── 8. Generate Scene Descriptions ──
    scene_descriptions = generate_scene_descriptions(client, sections)

    # Save scene descriptions for reference
    with open(str(project_dir / "scene_descriptions.txt"), 'w', encoding='utf-8') as f:
        for i, desc in enumerate(scene_descriptions):
            f.write(f"Scene {i+1}: {desc}\n")

    # ── 9. Generate Scene Images ──
    scenes_dir = ensure_dir(project_dir / "scenes")
    image_paths = generate_all_images(client, scene_descriptions, scenes_dir)

    # ── 10. Generate Thumbnail ──
    thumbnail_path = project_dir / "thumbnail.png"
    generate_thumbnail(client, chosen_title, theme, thumbnail_path)

    # ── 11. Calculate Image Durations ──
    image_durations = calculate_image_durations(
        srt_entries, len(image_paths), sections, durations
    )

    # ── 12. Create Ken Burns Clips ──
    clips_dir = ensure_dir(project_dir / "clips")
    clip_paths = create_ken_burns_clips(image_paths, image_durations, clips_dir)

    # ── 13. Assemble Final Video ──
    final_path = project_dir / "video_final.mp4"
    result = assemble_final_video(clip_paths, full_audio, srt_path, final_path, project_dir)

    # ── Done! ──
    elapsed = time.time() - start_time
    elapsed_min = elapsed / 60

    if result:
        print("\n" + "=" * 65)
        print(f"   ✅ VIDEO COMPLETE!")
        print(f"   📁 Video:     {final_path}")
        print(f"   🖼️ Thumbnail: {thumbnail_path}")
        print(f"   ⏱️ Duration:  {total_duration/60:.1f} minutes")
        print(f"   🕐 Pipeline:  {elapsed_min:.1f} minutes")
        print("=" * 65)
    else:
        print("\n" + "=" * 65)
        print(f"   ❌ VIDEO ASSEMBLY FAILED")
        print(f"   📁 Project dir: {project_dir}")
        print(f"   Check individual files in the project directory")
        print("=" * 65)

    return result


# ═══════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════

if __name__ == "__main__":
    theme = None
    if len(sys.argv) > 1:
        theme = " ".join(sys.argv[1:])
    run_pipeline(theme)
