#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Resume pipeline: Regenerate images + assemble video
Uses existing script, TTS audio, and SRT from a previous run.
"""

import os
import sys
import io
import re
import wave
import time
import random
from pathlib import Path

os.environ["PYTHONIOENCODING"] = "utf-8"

from dotenv import load_dotenv
from google import genai
from google.genai import types
from PIL import Image as PILImage

# Import everything from main
from main import (
    BASE_DIR, OUTPUT_BASE, IMAGE_MODELS, IMAGE_STYLE_PROMPT, THUMBNAIL_STYLE_PROMPT,
    VIDEO_WIDTH, VIDEO_HEIGHT, FPS, IMAGE_DELAY, MAX_RETRIES,
    log, ensure_dir, api_call_with_retry, create_fallback_image,
    get_wav_duration, format_srt_time, split_into_sentences, count_words,
    generate_scene_descriptions, generate_scene_image, generate_all_images,
    generate_thumbnail, calculate_image_durations, create_ken_burns_clips,
    assemble_final_video, get_video_duration, split_script_into_sections,
)


def resume_pipeline(project_name=None):
    """Resume from images step using existing text/audio/SRT"""

    print("\n" + "=" * 65)
    print("   ChillDude Pipeline - RESUME MODE", flush=True)
    print("   Regenerating images + assembling video", flush=True)
    print("=" * 65 + "\n")

    start_time = time.time()

    # Load env
    load_dotenv(BASE_DIR / ".env")

    # Try OAuth2 first (higher quotas), fall back to API key
    client = None
    try:
        from load_creds import load_creds as lc
        creds = lc()
        if creds:
            client = genai.Client(credentials=creds)
            log("Gemini client initialized (OAuth2)", "OK")
    except Exception as e:
        log(f"OAuth2 failed: {e}", "WARN")

    if client is None:
        api_key = os.getenv("GEMINI_API_KEY")
        if not api_key:
            log("No auth method available!", "ERR")
            sys.exit(1)
        client = genai.Client(api_key=api_key)
        log("Gemini client initialized (API key)", "OK")

    # Find project directory
    if not project_name:
        # List available projects
        if OUTPUT_BASE.exists():
            projects = [d.name for d in OUTPUT_BASE.iterdir() if d.is_dir()]
            if not projects:
                log("No projects found in output directory!", "ERR")
                sys.exit(1)
            print("Available projects:")
            for i, p in enumerate(projects):
                print(f"  {i+1}. {p}")
            if len(projects) == 1:
                project_name = projects[0]
                print(f"\n  Auto-selected: {project_name}")
            else:
                choice = input("\nSelect project number: ").strip()
                project_name = projects[int(choice) - 1]
        else:
            log("No output directory found!", "ERR")
            sys.exit(1)

    project_dir = OUTPUT_BASE / project_name
    if not project_dir.exists():
        log(f"Project directory not found: {project_dir}", "ERR")
        sys.exit(1)

    log(f"Project: {project_dir}")

    # Check required files
    script_path = project_dir / "script.txt"
    audio_path = project_dir / "narration_full.wav"
    srt_path = project_dir / "subtitles.srt"

    for p in [script_path, audio_path, srt_path]:
        if not p.exists():
            log(f"Missing required file: {p}", "ERR")
            sys.exit(1)

    # Read existing data
    script = script_path.read_text(encoding='utf-8')
    sections = split_script_into_sections(script)

    # Get section durations from individual WAV files
    narration_dir = project_dir / "narration"
    durations = []
    for i in range(len(sections)):
        wav_file = narration_dir / f"section_{i:02d}.wav"
        if wav_file.exists():
            durations.append(get_wav_duration(str(wav_file)))
        else:
            log(f"Missing WAV: {wav_file}", "WARN")
            durations.append(30.0)

    title = "Unknown Title"
    title_path = project_dir / "title.txt"
    if title_path.exists():
        title = title_path.read_text(encoding='utf-8').strip()

    log(f"Title: {title}")
    log(f"Sections: {len(sections)}")
    log(f"Total audio: {sum(durations)/60:.1f} min")

    # Read SRT for timing
    srt_entries = []
    srt_text = srt_path.read_text(encoding='utf-8')
    # Simple SRT parser
    blocks = srt_text.strip().split('\n\n')
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            srt_entries.append({
                'num': int(lines[0]),
                'text': ' '.join(lines[2:]),
                'section': 0,
            })

    # Check if scene_descriptions.txt exists
    desc_path = project_dir / "scene_descriptions.txt"
    if desc_path.exists():
        log("Using existing scene descriptions")
        scene_descriptions = []
        for line in desc_path.read_text(encoding='utf-8').strip().split('\n'):
            clean = re.sub(r'^Scene\s*\d+:\s*', '', line).strip()
            if clean:
                scene_descriptions.append(clean)
    else:
        scene_descriptions = generate_scene_descriptions(client, sections)
        with open(str(desc_path), 'w', encoding='utf-8') as f:
            for i, desc in enumerate(scene_descriptions):
                f.write(f"Scene {i+1}: {desc}\n")

    # Generate images (skip already existing ones)
    scenes_dir = ensure_dir(project_dir / "scenes")
    image_paths = []
    generated_count = 0

    for i, desc in enumerate(scene_descriptions):
        output_path = scenes_dir / f"scene_{i:03d}.png"

        # Check if a real image already exists (not just a fallback)
        if output_path.exists() and output_path.stat().st_size > 10000:
            log(f"  Image {i+1} already exists, skipping")
            image_paths.append(output_path)
            continue

        # Generate new image
        success = False
        for attempt in range(MAX_RETRIES):
            try:
                success = generate_scene_image(client, desc, output_path, i + 1)
                if success:
                    generated_count += 1
                    break
            except Exception as e:
                log(f"  Image {i+1} attempt {attempt+1} failed: {e}", "WARN")
                if attempt < MAX_RETRIES - 1:
                    time.sleep(10)

        if not success:
            log(f"  Using fallback for image {i+1}", "WARN")
            create_fallback_image(output_path)

        image_paths.append(output_path)

        if (i + 1) % 5 == 0:
            log(f"  Progress: {i+1}/{len(scene_descriptions)} images")

    log(f"Images ready: {len(image_paths)} total ({generated_count} newly generated)", "OK")

    # Generate thumbnail
    thumbnail_path = project_dir / "thumbnail.png"
    if not thumbnail_path.exists() or thumbnail_path.stat().st_size < 10000:
        generate_thumbnail(client, title, project_name.replace('_', ' '), thumbnail_path)
    else:
        log("Thumbnail already exists, skipping")

    # Calculate durations and create clips
    image_durations = calculate_image_durations(srt_entries, len(image_paths), sections, durations)

    clips_dir = ensure_dir(project_dir / "clips")
    clip_paths = create_ken_burns_clips(image_paths, image_durations, clips_dir)

    # Assemble final video
    final_path = project_dir / "video_final.mp4"
    result = assemble_final_video(clip_paths, audio_path, srt_path, final_path, project_dir)

    elapsed = time.time() - start_time

    if result:
        duration = get_video_duration(final_path)
        print("\n" + "=" * 65, flush=True)
        print(f"   [OK] VIDEO COMPLETE!", flush=True)
        print(f"   Video:     {final_path}", flush=True)
        print(f"   Thumbnail: {thumbnail_path}", flush=True)
        print(f"   Duration:  {duration/60:.1f} minutes", flush=True)
        print(f"   Pipeline:  {elapsed/60:.1f} minutes", flush=True)
        print("=" * 65, flush=True)
    else:
        print("\n[FAIL] Video assembly failed!", flush=True)


if __name__ == "__main__":
    project = sys.argv[1] if len(sys.argv) > 1 else None
    resume_pipeline(project)
