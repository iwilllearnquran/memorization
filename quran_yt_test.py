"""
Generate a ~5 min test video: Surah 2, Ayahs 255-265 (Ayatul Kursi + following ayahs)
Reciter: Mishary Alafasy
Purpose: YouTube copyright test upload
"""

import os
import requests
import numpy as np
from moviepy import (
    VideoFileClip, AudioFileClip, ImageClip,
    CompositeVideoClip, concatenate_videoclips, concatenate_audioclips
)
from PIL import Image, ImageDraw, ImageFont, ImageFilter
import arabic_reshaper
from bidi.algorithm import get_display
import textwrap

# ─── CONFIG ─────────────────────────────────────────────────────────────────
WIDTH, HEIGHT = 1920, 1080
SURAH = 2
AYAH_START = 255
AYAH_END = 265
FPS = 24

BG_VIDEO = "background/last.mp4"

# Available fonts in workspace
FONT_AR = "fonts/PDMS_SALEEM_QURANFONTQESHIP_0_alt.ttf"
FONT_EN = "fonts/Montserrat-VariableFont_wght.ttf"

OUTPUT_DIR = "output_videos"
TEMP_DIR = "temp"

# everyayah.com reciter folder for Mishary Alafasy 128kbps
AUDIO_BASE = "https://everyayah.com/data/Alafasy_128kbps"

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)


def reshape_arabic(text):
    """Reshape Arabic text for correct display in PIL."""
    return get_display(arabic_reshaper.reshape(text))


# ─── API ────────────────────────────────────────────────────────────────────

def fetch_ayahs(surah, start, end):
    """Fetch ayah text + English translation from quran.com API."""
    ayahs = []
    for ayah_num in range(start, end + 1):
        verse_key = f"{surah}:{ayah_num}"
        url = (
            f"https://api.quran.com/api/v4/verses/by_key/{verse_key}"
            f"?language=en&translations=20&fields=text_uthmani"
        )
        resp = requests.get(url, timeout=15)
        resp.raise_for_status()
        data = resp.json()["verse"]

        en_text = ""
        if data.get("translations"):
            en_text = data["translations"][0]["text"]
            # Strip HTML tags from translation
            import re
            en_text = re.sub(r"<[^>]+>", "", en_text)

        ayahs.append({
            "key": verse_key,
            "number": ayah_num,
            "arabic": data["text_uthmani"],
            "english": en_text,
        })
        print(f"  Fetched {verse_key}")
    return ayahs


def download_ayah_audio(surah, ayah_num):
    """Download individual ayah audio from everyayah.com."""
    filename = f"{surah:03d}{ayah_num:03d}.mp3"
    local_path = os.path.join(TEMP_DIR, filename)

    if not os.path.exists(local_path):
        url = f"{AUDIO_BASE}/{filename}"
        print(f"  Downloading audio: {url}")
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
        with open(local_path, "wb") as f:
            f.write(resp.content)
    else:
        print(f"  Audio cached: {local_path}")

    return local_path


# ─── VISUAL ─────────────────────────────────────────────────────────────────

def wrap_text(text, font, max_width, draw):
    """Word-wrap text to fit within max_width pixels."""
    words = text.split()
    lines = []
    current_line = ""

    for word in words:
        test = f"{current_line} {word}".strip()
        bbox = draw.textbbox((0, 0), test, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_line = test
        else:
            if current_line:
                lines.append(current_line)
            current_line = word

    if current_line:
        lines.append(current_line)

    return lines


def wrap_arabic(text, font, max_width, draw):
    """Word-wrap Arabic text (RTL) to fit within max_width pixels."""
    words = text.split()
    lines = []
    current_words = []

    for word in words:
        test_words = current_words + [word]
        test_text = reshape_arabic(" ".join(test_words))
        bbox = draw.textbbox((0, 0), test_text, font=font)
        if bbox[2] - bbox[0] <= max_width:
            current_words = test_words
        else:
            if current_words:
                lines.append(reshape_arabic(" ".join(current_words)))
            current_words = [word]

    if current_words:
        lines.append(reshape_arabic(" ".join(current_words)))

    return lines


def create_ayah_frame(ayah, show_bismillah=False):
    """Create a transparent overlay frame for one ayah."""
    img = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Draw a semi-transparent dark panel for readability
    panel_margin = 80
    panel = Image.new("RGBA", (WIDTH, HEIGHT), (0, 0, 0, 0))
    panel_draw = ImageDraw.Draw(panel)
    panel_draw.rounded_rectangle(
        [panel_margin, 60, WIDTH - panel_margin, HEIGHT - 60],
        radius=30,
        fill=(0, 0, 0, 160),
    )
    img.alpha_composite(panel)
    draw = ImageDraw.Draw(img)

    # ─ Ayah reference (top)
    font_ref = ImageFont.truetype(FONT_EN, 28)
    ref_text = f"Surah Al-Baqarah (2:{ayah['number']})"
    draw.text((WIDTH // 2, 100), ref_text, font=font_ref,
              fill=(180, 220, 255, 255), anchor="mm")

    # ─ Arabic text
    font_ar = ImageFont.truetype(FONT_AR, 58)
    ar_lines = wrap_arabic(ayah["arabic"], font_ar, WIDTH - 240, draw)

    y = 180
    line_spacing = 80
    for line in ar_lines:
        draw.text((WIDTH // 2, y), line, font=font_ar,
                  fill=(255, 255, 255, 255), anchor="mm")
        y += line_spacing

    # ─ Separator line
    sep_y = y + 20
    draw.line([(300, sep_y), (WIDTH - 300, sep_y)],
              fill=(100, 200, 180, 120), width=2)

    # ─ English translation
    font_en = ImageFont.truetype(FONT_EN, 30)
    en_lines = wrap_text(ayah["english"], font_en, WIDTH - 280, draw)

    y = sep_y + 40
    for line in en_lines:
        draw.text((WIDTH // 2, y), line, font=font_en,
                  fill=(200, 200, 200, 230), anchor="mm")
        y += 45

    return np.array(img)


# ─── BUILD VIDEO ────────────────────────────────────────────────────────────

def build_video():
    print("=" * 60)
    print("Quran YT Test Video Generator")
    print(f"Surah {SURAH}, Ayahs {AYAH_START}-{AYAH_END}")
    print("=" * 60)

    # 1. Fetch text
    print("\n[1/4] Fetching ayah text & translations...")
    ayahs = fetch_ayahs(SURAH, AYAH_START, AYAH_END)

    # 2. Download audio
    print("\n[2/4] Downloading ayah audio...")
    audio_paths = []
    for ayah in ayahs:
        path = download_ayah_audio(SURAH, ayah["number"])
        audio_paths.append(path)

    # 3. Build per-ayah clips (each is self-contained with bg baked in)
    print("\n[3/4] Building per-ayah video clips...")

    # Load background video once
    bg_clip = VideoFileClip(BG_VIDEO).resized((WIDTH, HEIGHT))

    clips_to_concat = []
    total_dur = 0.0

    for i, (ayah, audio_path) in enumerate(zip(ayahs, audio_paths)):
        print(f"  Building clip for {ayah['key']}...")

        # Load ayah audio
        ayah_audio = AudioFileClip(audio_path)
        duration = ayah_audio.duration

        # Add a small pause after each ayah
        pause = 1.5
        clip_duration = duration + pause

        # Create the text overlay as an RGB numpy array (not RGBA)
        overlay_rgba = create_ayah_frame(ayah)
        # Convert RGBA overlay to RGB ImageClip with proper mask
        overlay_rgb = overlay_rgba[:, :, :3]
        overlay_alpha = overlay_rgba[:, :, 3] / 255.0

        overlay_clip = (
            ImageClip(overlay_rgb)
            .with_duration(clip_duration)
            .with_mask(ImageClip(overlay_alpha, is_mask=True).with_duration(clip_duration))
        )

        # Get a segment of background for this ayah
        # Loop bg if needed
        bg_start = total_dur % bg_clip.duration
        bg_end = bg_start + clip_duration

        if bg_end <= bg_clip.duration:
            bg_segment = bg_clip.subclipped(bg_start, bg_end)
        else:
            # Wrap around: take remainder from start
            part1_dur = bg_clip.duration - bg_start
            part2_dur = clip_duration - part1_dur
            part1 = bg_clip.subclipped(bg_start, bg_clip.duration)
            part2 = bg_clip.subclipped(0, min(part2_dur, bg_clip.duration))
            bg_segment = concatenate_videoclips([part1, part2])

        # Composite overlay on background for this ayah only
        ayah_video = CompositeVideoClip([bg_segment, overlay_clip])

        # Build audio: ayah recitation + silence pause
        from moviepy import AudioClip
        silence = AudioClip(
            lambda t: np.zeros((1, 2)),
            duration=pause,
            fps=44100,
        )
        ayah_full_audio = concatenate_audioclips([ayah_audio, silence])

        ayah_video = ayah_video.with_audio(ayah_full_audio)

        clips_to_concat.append(ayah_video)
        total_dur += clip_duration

    print(f"\n  Total duration: {total_dur:.1f}s ({total_dur/60:.1f} min)")

    # 4. Concatenate all ayah clips
    print("\n[4/4] Writing final video...")
    final = concatenate_videoclips(clips_to_concat, method="compose")

    output_path = os.path.join(OUTPUT_DIR, f"surah_{SURAH}_{AYAH_START}-{AYAH_END}_test.mp4")

    final.write_videofile(
        output_path,
        fps=FPS,
        codec="libx264",
        audio_codec="aac",
        preset="ultrafast",
        threads=6,
        logger="bar",
    )

    # Cleanup
    bg_clip.close()
    for c in clips_to_concat:
        c.close()

    print(f"\n{'=' * 60}")
    print(f"Video saved: {output_path}")
    print(f"Duration: {total_dur:.1f}s ({total_dur/60:.1f} min)")
    print(f"{'=' * 60}")

    return output_path


if __name__ == "__main__":
    build_video()
