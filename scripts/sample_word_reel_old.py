#!/usr/bin/env python3
"""
Generate a Quran-word reel (1080x1920) with ElevenLabs TTS.

Data source:  generated/reel_words_top600.json
  (POS tag, root, occurrences, Quran example, quran.com word audio URL)

Flow per word:
  1) Arabic word + POS tag + occurrences on screen + Quran.com recitation (×2)
  2) English meaning on screen + ElevenLabs English TTS (×2)
  3) Quran example (Arabic) + Arabic TTS
  4) Quran example (English) + English TTS

Usage:
  py sample_word_reel.py --api-key sk_… --rank 1
  py sample_word_reel.py --api-key sk_… --rank 1 --count 5   # batch 5 words
"""
from __future__ import annotations

import argparse
import io
import json
import os
import random
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

# Force UTF-8 output on Windows
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Paths – adapt if your folder layout differs
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
MEMORIZATION_ROOT = SCRIPT_DIR.parent
LEARN_QURAN_ROOT = MEMORIZATION_ROOT.parent / "learnqurandaily"

FONTS_DIR = LEARN_QURAN_ROOT / "fonts"
BG_DIR = LEARN_QURAN_ROOT / "background"
DATASET_PATH = MEMORIZATION_ROOT / "generated" / "reel_words_top600.json"
OUTPUT_DIR = MEMORIZATION_ROOT / "output" / "sample_reel"

ARABIC_FONT = str(FONTS_DIR / "ScheherazadeNew-Bold.ttf")
ENGLISH_FONT = str(FONTS_DIR / "MONTSERRAT-BOLD.TTF")
ENGLISH_FONT_LIGHT = str(FONTS_DIR / "Montserrat-VariableFont_wght.ttf")

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

# ElevenLabs defaults
DEFAULT_ARABIC_VOICE = "VR6AewLTigWG4xSOukaG"    # Arnold – Arabic
DEFAULT_ENGLISH_VOICE = "pNInz6obpgDQGcFmaJgB"   # Adam – English
DEFAULT_MODEL = "eleven_multilingual_v2"

POSTER_W, POSTER_H = 1080, 1920


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------
def download_audio(url: str, out_path: Path) -> Path:
    """Download an audio file from a URL (e.g. quran.com word recitation)."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "LearnQuranDaily/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        with open(out_path, "wb") as f:
            f.write(resp.read())
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"Download produced empty file: {url}")
    return out_path


def tts_elevenlabs(text: str, out_path: Path, *, voice: str, api_key: str, model: str) -> Path:
    from elevenlabs.client import ElevenLabs
    out_path.parent.mkdir(parents=True, exist_ok=True)
    client = ElevenLabs(api_key=api_key)
    audio_gen = client.text_to_speech.convert(
        text=text,
        voice_id=voice,
        model_id=model,
        output_format="mp3_44100_128",
    )
    with open(out_path, "wb") as f:
        for chunk in audio_gen:
            f.write(chunk)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"TTS produced no audio: {out_path}")
    return out_path


def audio_duration(path: Path) -> float:
    r = subprocess.run(
        [FFPROBE, "-v", "error", "-show_entries", "format=duration",
         "-of", "default=nw=1:nk=1", str(path)],
        capture_output=True, text=True, check=True,
    )
    return float(r.stdout.strip())


def silence_clip(ms: int, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run(
        [FFMPEG, "-y", "-f", "lavfi", "-i",
         "anullsrc=r=44100:cl=stereo", "-t", f"{ms / 1000:.3f}",
         "-c:a", "libmp3lame", "-q:a", "9", str(out_path)],
        check=True, capture_output=True,
    )
    return out_path


# ---------------------------------------------------------------------------
# Image generation (Wand / ImageMagick)
# ---------------------------------------------------------------------------
def pick_background() -> str:
    bgs = [f for f in os.listdir(BG_DIR) if f.endswith(".png") or f.endswith(".jpg")]
    if not bgs:
        raise FileNotFoundError(f"No background images in {BG_DIR}")
    return str(BG_DIR / random.choice(bgs))


def _draw_centered(draw, img, text: str, y: int, max_w: int = 0) -> int:
    """Draw text centred horizontally; auto-wrap into 2 lines if too wide.
    Returns total height consumed."""
    max_w = max_w or (POSTER_W - 120)
    line_h = int(draw.font_size * 1.25)
    metrics = draw.get_font_metrics(img, text, True)
    if metrics.text_width <= max_w:
        draw.text(int((POSTER_W - metrics.text_width) / 2), y, text)
        return line_h
    # Split at nearest space to middle
    mid = len(text) // 2
    sp = text.find(" ", mid)
    if sp == -1:
        sp = text.rfind(" ", 0, mid)
    if sp > 0:
        l1, l2 = text[:sp], text[sp + 1:]
        m1 = draw.get_font_metrics(img, l1, True)
        m2 = draw.get_font_metrics(img, l2, True)
        draw.text(int((POSTER_W - m1.text_width) / 2), y, l1)
        draw.text(int((POSTER_W - m2.text_width) / 2), y + line_h, l2)
    else:
        draw.text(int((POSTER_W - metrics.text_width) / 2), y, text)
        return line_h
    return line_h * 2


def _draw_footer(draw, img):
    """Draw the MyQuranQuest branding footer."""
    from wand.color import Color
    draw.font = ENGLISH_FONT_LIGHT
    draw.font_size = 26
    draw.fill_color = Color("#999999")
    footer = "Source: MyQuranQuest  |  Download The App Now"
    fw = draw.get_font_metrics(img, footer, True).text_width
    draw.text(int((POSTER_W - fw) / 2), POSTER_H - 60, footer)


def create_combined_poster(
    arabic: str, english: str, transliteration: str,
    bg_path: str, out_path: Path, *,
    pos_tag: str = "", occurrences: int = 0, root: str = "", rank: int = 0,
    example_ar: str = "", example_en: str = "", example_ref: str = "",
    focus_word_ar: str = "",
) -> Path:
    """Single 1080x1920 poster with ALL info: word, meaning, example."""
    from wand.image import Image
    from wand.drawing import Drawing
    from wand.color import Color

    out_path.parent.mkdir(parents=True, exist_ok=True)

    with Image(filename=bg_path) as img:
        img.resize(POSTER_W, POSTER_H)
        img.depth = 32
        draw = Drawing()

        # ── Attractive title ──────────────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 38
        draw.fill_color = Color("#FFD700")
        title = "Learn Top 600 Quranic Words With Us Daily"
        ttw = draw.get_font_metrics(img, title, True).text_width
        draw.text(int((POSTER_W - ttw) / 2), 90, title)

        if rank:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 26
            draw.fill_color = Color("#AAAAAA")
            sub = f"Word #{rank}"
            sw = draw.get_font_metrics(img, sub, True).text_width
            draw.text(int((POSTER_W - sw) / 2), 140, sub)

        # ── Arabic word (117px = 10% smaller than 130) ────────────
        draw.font = ARABIC_FONT
        draw.font_size = 117
        draw.fill_color = Color("#FFFFFF")
        _draw_centered(draw, img, arabic, 370)

        # ── Transliteration (small, in brackets) ─────────────────
        if transliteration:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 28
            draw.fill_color = Color("#AAAAAA")
            tl = f"({transliteration})"
            tw2 = draw.get_font_metrics(img, tl, True).text_width
            draw.text(int((POSTER_W - tw2) / 2), 460, tl)

        # ── English meaning (117px = same as Arabic) ─────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 117
        draw.fill_color = Color("#FFFFFF")
        meaning_h = _draw_centered(draw, img, english, 600)

        # ── Root + occurrence count ───────────────────────────────
        y_cursor = 600 + meaning_h + 25
        info_parts = []
        if root:
            info_parts.append(f"Root: {root}")
        if occurrences:
            info_parts.append(f"Occurs {occurrences:,}x in Quran")
        if info_parts:
            info_line = "  |  ".join(info_parts)
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 26
            draw.fill_color = Color("#BBBBBB")
            iw = draw.get_font_metrics(img, info_line, True).text_width
            draw.text(int((POSTER_W - iw) / 2), y_cursor, info_line)
            y_cursor += 45

        # ── "Examples From The Quran:" section title ──────────────
        if example_ar or example_en:
            y_cursor += 15
            draw.fill_color = Color("#555555")
            draw.line((POSTER_W // 2 - 200, y_cursor), (POSTER_W // 2 + 200, y_cursor))
            y_cursor += 35

            draw.font = ENGLISH_FONT
            draw.font_size = 30
            draw.fill_color = Color("#FFD700")
            sec = "Example From Quran:"
            secw = draw.get_font_metrics(img, sec, True).text_width
            draw.text(int((POSTER_W - secw) / 2), y_cursor, sec)
            y_cursor += 50

        # ── Example Arabic (35px, ~70% smaller) ──────────────────
        if example_ar:
            draw.font = ARABIC_FONT
            draw.font_size = 35
            draw.fill_color = Color("#E0E0E0")
            eh = _draw_centered(draw, img, example_ar, y_cursor)
            y_cursor += eh + 10

        # ── Example English (35px, ~70% smaller) ─────────────────
        if example_en:
            draw.font = ENGLISH_FONT
            draw.font_size = 35
            draw.fill_color = Color("#CCCCCC")
            eh = _draw_centered(draw, img, example_en, y_cursor)
            y_cursor += eh + 10

        # ── Example reference ─────────────────────────────────────
        if example_ref:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 22
            draw.fill_color = Color("#888888")
            ref_label = f"— Quran {example_ref}"
            rw = draw.get_font_metrics(img, ref_label, True).text_width
            draw.text(int((POSTER_W - rw) / 2), y_cursor + 8, ref_label)

        # ── Footer ────────────────────────────────────────────────
        _draw_footer(draw, img)

        draw(img)
        img.compression_quality = 95
        img.save(filename=str(out_path))

    return out_path


def create_quiz_poster(
    arabic: str, transliteration: str,
    options: list[str], correct_idx: int,
    bg_path: str, out_path: Path, *,
    rank: int = 0,
) -> Path:
    """Second frame: quiz asking viewers to comment the meaning."""
    from wand.image import Image
    from wand.drawing import Drawing
    from wand.color import Color

    out_path.parent.mkdir(parents=True, exist_ok=True)

    labels = ["A", "B", "C", "D"]

    with Image(filename=bg_path) as img:
        img.resize(POSTER_W, POSTER_H)
        img.depth = 32
        draw = Drawing()

        # ── Title ─────────────────────────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 38
        draw.fill_color = Color("#FFD700")
        title = "Learn Top 600 Quranic Words With Us Daily"
        ttw = draw.get_font_metrics(img, title, True).text_width
        draw.text(int((POSTER_W - ttw) / 2), 90, title)

        # ── Subtitle: Review ─────────────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 34
        draw.fill_color = Color("#FFFFFF")
        rev = "Review The Last Lesson"
        rw = draw.get_font_metrics(img, rev, True).text_width
        draw.text(int((POSTER_W - rw) / 2), 200, rev)

        # ── Arabic word ───────────────────────────────────────────
        draw.font = ARABIC_FONT
        draw.font_size = 117
        draw.fill_color = Color("#FFFFFF")
        _draw_centered(draw, img, arabic, 420)

        # ── Transliteration ───────────────────────────────────────
        if transliteration:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 28
            draw.fill_color = Color("#AAAAAA")
            tl = f"({transliteration})"
            tw = draw.get_font_metrics(img, tl, True).text_width
            draw.text(int((POSTER_W - tw) / 2), 510, tl)

        # ── Question ──────────────────────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 36
        draw.fill_color = Color("#FFD700")
        q = "What does this word mean?"
        qw = draw.get_font_metrics(img, q, True).text_width
        draw.text(int((POSTER_W - qw) / 2), 620, q)

        draw.font = ENGLISH_FONT_LIGHT
        draw.font_size = 28
        draw.fill_color = Color("#CCCCCC")
        cta = "Comment your answer below!"
        cw = draw.get_font_metrics(img, cta, True).text_width
        draw.text(int((POSTER_W - cw) / 2), 670, cta)

        # ── 4 options ─────────────────────────────────────────────
        y_opt = 780
        for i, opt in enumerate(options[:4]):
            label = f"{labels[i]})  {opt}"
            draw.font = ENGLISH_FONT
            draw.font_size = 52
            draw.fill_color = Color("#FFFFFF")
            ow = draw.get_font_metrics(img, label, True).text_width
            draw.text(int((POSTER_W - ow) / 2), y_opt, label)
            y_opt += 100

        # ── Footer ────────────────────────────────────────────────
        _draw_footer(draw, img)

        draw(img)
        img.compression_quality = 95
        img.save(filename=str(out_path))

    return out_path


# ---------------------------------------------------------------------------
# Video segment from still image + audio
# ---------------------------------------------------------------------------
def make_segment(image_path: Path, audio_path: Path, out_path: Path) -> Path:
    dur = audio_duration(audio_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        FFMPEG, "-y",
        "-loop", "1", "-i", str(image_path),
        "-i", str(audio_path),
        "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
        "-vf", f"scale={POSTER_W}:{POSTER_H}",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-t", f"{dur + 0.3:.3f}",
        "-shortest",
        str(out_path),
    ], check=True, capture_output=True)
    return out_path


def concat_segments(segments: list[Path], out_path: Path) -> Path:
    list_file = out_path.parent / "concat_list.txt"
    with open(list_file, "w") as f:
        for seg in segments:
            escaped = str(seg.resolve()).replace("'", "'\\''")
            f.write(f"file '{escaped}'\n")

    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c:v", "libx264", "-pix_fmt", "yuv420p",
        "-vf", f"scale={POSTER_W}:{POSTER_H}:force_original_aspect_ratio=decrease,"
               f"pad={POSTER_W}:{POSTER_H}:(ow-iw)/2:(oh-ih)/2",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100",
        "-movflags", "+faststart",
        str(out_path),
    ], check=True, capture_output=True)
    return out_path


# ---------------------------------------------------------------------------
# Main — single word reel
# ---------------------------------------------------------------------------
def generate_reel(word_entry: dict, *, api_key: str, arabic_voice: str,
                  english_voice: str, model: str, bg_path: str | None = None,
                  all_words: list[dict] | None = None) -> Path:
    """Generate one reel from a reel_words_top600.json entry."""
    arabic = word_entry["arabic"]
    english = word_entry["meaning"]
    translit = word_entry.get("transliteration", "")
    pos_tag = word_entry.get("pos_tag", "")
    root = word_entry.get("root", "")
    occurrences = word_entry.get("occurrences", 0)
    rank = word_entry.get("rank", 0)
    audio_url = word_entry.get("audio_url", "")
    example_ar = word_entry.get("example_ar", "")
    example_en = word_entry.get("example_en", "")
    example_ref = word_entry.get("example_ref", "")

    bg = bg_path or pick_background()
    slug = translit or f"word{rank}"
    word_dir = OUTPUT_DIR / slug
    parts = word_dir / "parts"
    parts.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"[#{rank}] {arabic} = {english} ({translit})  {pos_tag}")
    print(f"  Occurrences: {occurrences:,}  Root: {root}  Ref: {example_ref}")
    print(f"  Background: {bg}")

    # ── Intro voice (~10 words) ────────────────────────────────────
    print("  Generating intro TTS...")
    intro_text = f"Word number {rank}. Learn this Quranic word with us."
    intro_audio = tts_elevenlabs(intro_text, parts / "intro.mp3",
                                 voice=english_voice, api_key=api_key, model=model)
    print(f"    -> {audio_duration(intro_audio):.2f}s")

    # ── Arabic audio: download from quran.com (actual recitation) ───
    ar_audio = None
    if audio_url:
        print(f"  Downloading Arabic audio: {audio_url}")
        try:
            ar_audio = download_audio(audio_url, parts / "arabic_quran.mp3")
            print(f"    -> {audio_duration(ar_audio):.2f}s")
        except Exception as exc:
            print(f"    ! Download failed: {exc}, falling back to TTS")
            ar_audio = None

    if ar_audio is None:
        print("  Generating Arabic TTS (fallback)...")
        ar_audio = tts_elevenlabs(arabic, parts / "arabic.mp3",
                                  voice=arabic_voice, api_key=api_key, model=model)
        print(f"    -> {audio_duration(ar_audio):.2f}s")

    # ── English audio: ElevenLabs TTS ──────────────────────────────
    print("  Generating English TTS...")
    en_audio = tts_elevenlabs(english, parts / "english.mp3",
                              voice=english_voice, api_key=api_key, model=model)
    print(f"    -> {audio_duration(en_audio):.2f}s")

    # ── Example audio (if available) ───────────────────────────────
    ex_ar_audio = ex_en_audio = None
    if example_ar and example_en:
        print("  Generating example Arabic TTS...")
        ex_ar_audio = tts_elevenlabs(example_ar, parts / "example_arabic.mp3",
                                     voice=arabic_voice, api_key=api_key, model=model)
        print(f"    -> {audio_duration(ex_ar_audio):.2f}s")

        print("  Generating example English TTS...")
        ex_en_audio = tts_elevenlabs(example_en, parts / "example_english.mp3",
                                     voice=english_voice, api_key=api_key, model=model)
        print(f"    -> {audio_duration(ex_en_audio):.2f}s")

    # ── Quiz voice ─────────────────────────────────────────────────
    print("  Generating quiz TTS...")
    quiz_text = f"Now test yourself. What does {translit or arabic} mean? Comment your answer!"
    quiz_audio = tts_elevenlabs(quiz_text, parts / "quiz_voice.mp3",
                                voice=english_voice, api_key=api_key, model=model)
    print(f"    -> {audio_duration(quiz_audio):.2f}s")

    # ── Silence gaps ──────────────────────────────────────────────────
    gap_short = silence_clip(400, parts / "gap_short.mp3")
    gap_long = silence_clip(800, parts / "gap_long.mp3")

    # ── FRAME 1: Combined poster (word + meaning + example) ──────────
    print("  Creating poster (frame 1)...")
    poster1 = create_combined_poster(
        arabic, english, translit, bg, parts / "poster.png",
        pos_tag=pos_tag, occurrences=occurrences, root=root, rank=rank,
        example_ar=example_ar, example_en=example_en, example_ref=example_ref,
        focus_word_ar=arabic)

    # ── FRAME 2: Quiz poster (4 options) ─────────────────────────────
    print("  Creating quiz poster (frame 2)...")
    quiz_options = _build_quiz_options(english, all_words or [], rank)
    poster2 = create_quiz_poster(
        arabic, translit, quiz_options, quiz_options.index(english),
        bg, parts / "poster_quiz.png", rank=rank)

    # ── Build Frame 1 audio: intro → Arabic×2 → English×2 → examples ─
    print("  Building audio track...")
    f1_parts = [
        intro_audio, gap_long,
        ar_audio, gap_short, ar_audio, gap_long,
        en_audio, gap_short, en_audio, gap_long,
    ]
    if ex_ar_audio:
        f1_parts.extend([ex_ar_audio, gap_long])
    if ex_en_audio:
        f1_parts.extend([ex_en_audio, gap_long])

    f1_list = parts / "f1_audio_list.txt"
    with open(f1_list, "w") as f:
        for ap in f1_parts:
            f.write(f"file '{ap.resolve()}'\n")
    f1_audio = parts / "f1_audio.mp3"
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(f1_list),
        "-c:a", "libmp3lame", "-q:a", "2", str(f1_audio),
    ], check=True, capture_output=True)

    # ── Build Frame 2 audio: quiz voice + pause for thinking ─────────
    gap_think = silence_clip(3000, parts / "gap_think.mp3")
    f2_list = parts / "f2_audio_list.txt"
    with open(f2_list, "w") as f:
        f.write(f"file '{quiz_audio.resolve()}'\n")
        f.write(f"file '{gap_think.resolve()}'\n")
    f2_audio = parts / "f2_audio.mp3"
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(f2_list),
        "-c:a", "libmp3lame", "-q:a", "2", str(f2_audio),
    ], check=True, capture_output=True)

    # ── Render Frame 1 video ──────────────────────────────────────────
    print("  Rendering frame 1...")
    seg1 = make_segment(poster1, f1_audio, parts / "seg_frame1.mp4")

    # ── Render Frame 2 video ──────────────────────────────────────────
    print("  Rendering frame 2...")
    seg2 = make_segment(poster2, f2_audio, parts / "seg_frame2.mp4")

    # ── Concat both frames ────────────────────────────────────────────
    print("  Concatenating frames...")
    final = word_dir / f"word_reel_{slug}.mp4"
    concat_segments([seg1, seg2], final)

    total_dur = audio_duration(f1_audio) + audio_duration(f2_audio)
    print(f"  [OK] Reel saved: {final}  ({total_dur:.1f}s)")
    return final


def _build_quiz_options(correct: str, all_words: list[dict], rank: int) -> list[str]:
    """Pick 3 random wrong meanings + the correct one, shuffled."""
    pool = [w["meaning"] for w in all_words
            if w.get("rank") != rank and w["meaning"] != correct]
    wrong = random.sample(pool, min(3, len(pool))) if pool else ["peace", "mercy", "light"]
    options = wrong + [correct]
    random.shuffle(options)
    return options


def main():
    parser = argparse.ArgumentParser(description="Generate Quran word reels from reel_words_top600.json")
    parser.add_argument("--api-key", required=True, help="ElevenLabs API key")
    parser.add_argument("--rank", type=int, default=1,
                        help="Start rank (1-600) in the dataset (default 1)")
    parser.add_argument("--count", type=int, default=1,
                        help="Number of words to generate (default 1)")
    parser.add_argument("--arabic-voice", default=DEFAULT_ARABIC_VOICE)
    parser.add_argument("--english-voice", default=DEFAULT_ENGLISH_VOICE)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--background", help="Path to background image (random per word if omitted)")
    args = parser.parse_args()

    # Load dataset
    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    all_words = data["words"]
    print(f"Loaded {len(all_words)} words from {DATASET_PATH.name}")

    # Validate range
    start_idx = args.rank - 1  # rank 1 = index 0
    end_idx = min(start_idx + args.count, len(all_words))
    if start_idx < 0 or start_idx >= len(all_words):
        print(f"Error: --rank must be 1-{len(all_words)}")
        sys.exit(1)

    generated = []
    for i in range(start_idx, end_idx):
        word = all_words[i]
        try:
            reel = generate_reel(
                word,
                api_key=args.api_key,
                arabic_voice=args.arabic_voice,
                english_voice=args.english_voice,
                model=args.model,
                bg_path=args.background,
                all_words=all_words,
            )
            generated.append(reel)
        except Exception as exc:
            print(f"  [FAIL] rank {word.get('rank', i+1)}: {exc}")

    print(f"\n{'='*60}")
    print(f"Done! Generated {len(generated)}/{end_idx - start_idx} reels.")
    for p in generated:
        print(f"  • {p}")


if __name__ == "__main__":
    main()
