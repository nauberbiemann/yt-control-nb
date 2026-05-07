"""
Quick video assembly test using reference images.
Skips API calls and uses existing cena-exemplo images to test the 
FFmpeg Ken Burns pipeline with the already-generated audio and SRT.
"""
import os
import sys
import shutil
import random
from pathlib import Path

os.environ["PYTHONIOENCODING"] = "utf-8"

from main import (
    BASE_DIR, OUTPUT_BASE, VIDEO_WIDTH, VIDEO_HEIGHT, FPS,
    log, ensure_dir, get_wav_duration,
    calculate_image_durations, create_ken_burns_clips,
    assemble_final_video, get_video_duration, split_script_into_sections,
)
from PIL import Image as PILImage

def quick_assemble():
    project_dir = OUTPUT_BASE / "everyday_scams_people_still_fall_for"
    
    if not project_dir.exists():
        print("Project directory not found!")
        return
    
    print("=" * 60, flush=True)
    print("  Quick Assembly Test - Using Reference Images", flush=True)
    print("=" * 60, flush=True)
    
    # Check required files
    audio_path = project_dir / "narration_full.wav"
    srt_path = project_dir / "subtitles.srt"
    script_path = project_dir / "script.txt"
    
    for p in [audio_path, srt_path, script_path]:
        if not p.exists():
            print(f"Missing: {p}", flush=True)
            return
    
    # Get reference images from workspace root
    ref_images = sorted(BASE_DIR.glob("cena-exemplo*.png"))
    print(f"Found {len(ref_images)} reference images", flush=True)
    
    if not ref_images:
        print("No reference images found!", flush=True)
        return
    
    # Read script sections for timing
    script = script_path.read_text(encoding='utf-8')
    sections = split_script_into_sections(script)
    
    # Get section durations
    narration_dir = project_dir / "narration"
    durations = []
    for i in range(len(sections)):
        wav_file = narration_dir / f"section_{i:02d}.wav"
        if wav_file.exists():
            durations.append(get_wav_duration(str(wav_file)))
        else:
            durations.append(30.0)
    
    total_dur = sum(durations)
    print(f"Total audio: {total_dur:.1f}s ({total_dur/60:.1f} min)", flush=True)
    print(f"Sections: {len(sections)}", flush=True)
    
    # Distribute reference images across sections (repeat to fill)
    # We need roughly 2 images per section = ~22 images
    target_count = len(sections) * 2
    scenes_dir = ensure_dir(project_dir / "scenes_ref")
    
    image_paths = []
    for i in range(target_count):
        src = ref_images[i % len(ref_images)]
        dst = scenes_dir / f"scene_{i:03d}.png"
        
        # Copy and resize to target resolution
        img = PILImage.open(str(src))
        img = img.resize((VIDEO_WIDTH, VIDEO_HEIGHT), PILImage.LANCZOS)
        img.save(str(dst))
        image_paths.append(dst)
    
    print(f"Prepared {len(image_paths)} scene images", flush=True)
    
    # Simple SRT entries for timing
    srt_text = srt_path.read_text(encoding='utf-8')
    blocks = srt_text.strip().split('\n\n')
    srt_entries = []
    for block in blocks:
        lines = block.strip().split('\n')
        if len(lines) >= 3:
            srt_entries.append({'num': int(lines[0]), 'text': lines[2], 'section': 0})
    
    # Calculate durations
    image_durations = calculate_image_durations(srt_entries, len(image_paths), sections, durations)
    
    print(f"Image durations: min={min(image_durations):.1f}s, max={max(image_durations):.1f}s, avg={sum(image_durations)/len(image_durations):.1f}s", flush=True)
    
    # Create Ken Burns clips
    clips_dir = ensure_dir(project_dir / "clips_ref")
    print("\nCreating Ken Burns clips...", flush=True)
    clip_paths = create_ken_burns_clips(image_paths, image_durations, clips_dir)
    
    # Assemble final video
    final_path = project_dir / "video_test.mp4"
    print("\nAssembling final video...", flush=True)
    result = assemble_final_video(clip_paths, audio_path, srt_path, final_path, project_dir)
    
    if result:
        size_mb = final_path.stat().st_size / (1024*1024)
        duration = get_video_duration(final_path)
        print("\n" + "=" * 60, flush=True)
        print(f"  VIDEO READY!", flush=True)
        print(f"  File: {final_path}", flush=True)
        print(f"  Size: {size_mb:.1f} MB", flush=True)
        print(f"  Duration: {duration/60:.1f} min", flush=True)
        print("=" * 60, flush=True)
    else:
        print("\nVideo assembly failed!", flush=True)


if __name__ == "__main__":
    quick_assemble()
