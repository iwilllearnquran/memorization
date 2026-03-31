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

# Pre-recorded common audio clips
COMMON_AUDIO_DIR = MEMORIZATION_ROOT / "Quran_word_reel" / "Common Audio"
AUDIO_INTRO = COMMON_AUDIO_DIR / "intro2.mp3"
AUDIO_EXAMPLE_FROM_QURAN = COMMON_AUDIO_DIR / "example_from_quran.mp3"
AUDIO_NEXT_TIME = COMMON_AUDIO_DIR / "next_time_understand_quran_2.mp3"
AUDIO_DOWNLOAD_APP = COMMON_AUDIO_DIR / "download_app-2.mp3"
AUDIO_REVISE = COMMON_AUDIO_DIR / "revise the previous word.mp3"

# ElevenLabs defaults
DEFAULT_VOICE = "MFZUKuGQUsGJPQjTS4wC"
DEFAULT_ARABIC_VOICE = DEFAULT_VOICE
DEFAULT_ENGLISH_VOICE = DEFAULT_VOICE
DEFAULT_MODEL = "eleven_multilingual_v2"
DEFAULT_SPEED = 0.9

# Tone presets (stability, similarity_boost, style, speed)
TONE_SOFT_REVEAL = {"stability": 0.35, "similarity_boost": 0.70, "style": 0.55, "speed": 0.85}
TONE_CALM_CLEAR  = {"stability": 0.65, "similarity_boost": 0.75, "style": 0.20, "speed": 0.90}

POSTER_W, POSTER_H = 1080, 1920

def _approx_occurrences(n: int) -> str:
    """Return a human-friendly 'more than X' string for occurrence counts."""
    if n >= 1000:
        rounded = (n // 1000) * 1000
        return f"more than {rounded:,}"
    if n >= 100:
        rounded = (n // 100) * 100
        return f"more than {rounded:,}"
    return str(n)

# End card (QR code frame) – appended as last frame of every reel
END_CARD_PATH = MEMORIZATION_ROOT / "assets" / "reel_end_card.png"
# Reusable CTA voice-over (generated once on first run)
CTA_AUDIO_PATH = OUTPUT_DIR / "cta_download_app.mp3"


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


QURAN_API_BASE = "https://api.quran.com/api/v4"
QURAN_AUDIO_BASE = "https://verses.quran.com/"
QURAN_RECITER_ID = 7  # Mishari Rashid al-Afasy


def download_ayah_recitation(verse_ref: str, out_path: Path) -> Path:
    """Download ayah recitation from quran.com API (e.g. '2:4')."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    url = f"{QURAN_API_BASE}/recitations/{QURAN_RECITER_ID}/by_ayah/{verse_ref}"
    req = urllib.request.Request(url, headers={"User-Agent": "LearnQuranDaily/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read())
    audio_files = data.get("audio_files", [])
    if not audio_files:
        raise RuntimeError(f"No audio found for {verse_ref}")
    audio_path = audio_files[0].get("url", "")
    if not audio_path:
        raise RuntimeError(f"Empty audio URL for {verse_ref}")
    full_url = QURAN_AUDIO_BASE + audio_path
    return download_audio(full_url, out_path)


def tts_elevenlabs(text: str, out_path: Path, *, voice: str, api_key: str,
                   model: str, speed: float = 1.0,
                   tone: dict | None = None) -> Path:
    """Generate TTS with optional tone preset (stability, similarity_boost, style, speed)."""
    from elevenlabs.client import ElevenLabs
    from elevenlabs.types import VoiceSettings
    out_path.parent.mkdir(parents=True, exist_ok=True)
    client = ElevenLabs(api_key=api_key)

    vs_kwargs: dict = {"speed": speed}
    if tone:
        vs_kwargs["stability"] = tone.get("stability", 0.5)
        vs_kwargs["similarity_boost"] = tone.get("similarity_boost", 0.75)
        vs_kwargs["style"] = tone.get("style", 0.0)
        vs_kwargs["speed"] = tone.get("speed", speed)

    audio_gen = client.text_to_speech.convert(
        text=text,
        voice_id=voice,
        model_id=model,
        output_format="mp3_44100_128",
        voice_settings=VoiceSettings(**vs_kwargs),
    )
    with open(out_path, "wb") as f:
        for chunk in audio_gen:
            f.write(chunk)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"TTS produced no audio: {out_path}")
    # Boost TTS volume by 1.8x
    boosted = out_path.with_suffix(".loud.mp3")
    subprocess.run([
        FFMPEG, "-y", "-i", str(out_path),
        "-af", "volume=1.8",
        "-c:a", "libmp3lame", "-q:a", "2", str(boosted),
    ], check=True, capture_output=True)
    boosted.replace(out_path)
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
    """Draw the MyQuranQuest branding footer (3 lines at bottom)."""
    from wand.color import Color
    # Line 1: CTA in white
    draw.font = ENGLISH_FONT
    draw.font_size = 24
    draw.fill_color = Color("#FFFFFF")
    line1 = "Learn Quranic grammar and memorize Quran on"
    w1 = draw.get_font_metrics(img, line1, True).text_width
    draw.text(int((POSTER_W - w1) / 2), POSTER_H - 300, line1)
    # Line 2: App name in gold/yellow
    draw.font = ENGLISH_FONT
    draw.font_size = 24
    draw.fill_color = Color("#FFD700")
    line2 = "My Quran Quest"
    w2 = draw.get_font_metrics(img, line2, True).text_width
    draw.text(int((POSTER_W - w2) / 2), POSTER_H - 268, line2)
    # Line 3: Download CTA in gray
    draw.font = ENGLISH_FONT
    draw.font_size = 18
    draw.fill_color = Color("#999999")
    line3 = "(Download The App Now)"
    w3 = draw.get_font_metrics(img, line3, True).text_width
    draw.text(int((POSTER_W - w3) / 2), POSTER_H - 238, line3)


# ---------------------------------------------------------------------------
# Highlighted-text helper (gold focus word inside white sentence)
# ---------------------------------------------------------------------------
def _draw_text_with_highlight(draw, img, text: str, y: int,
                               focus_word: str, gold_color, default_color,
                               rtl: bool = False, max_w: int = 0) -> int:
    """Draw centred text; if *focus_word* found, overdraw it in gold.

    Single-line  → pixel-accurate overlay.
    Wrapped LTR  → word-by-word rendering with highlight.
    Wrapped RTL  → fallback to uniform colour.
    """
    max_w = max_w or (POSTER_W - 120)
    line_h = int(draw.font_size * 1.35)
    full_w = draw.get_font_metrics(img, text, True).text_width

    # ── helper: locate focus word in text ────────────────────────
    TASHKEEL = re.compile(r'[\u064B-\u065F\u0670\u06D6-\u06ED]')

    def _find(txt, fw):
        idx = txt.find(fw)
        if idx >= 0:
            return idx, fw
        idx = txt.lower().find(fw.lower())
        if idx >= 0:
            return idx, txt[idx:idx + len(fw)]
        stripped = TASHKEEL.sub('', fw)
        for w in txt.split():
            if stripped in TASHKEEL.sub('', w):
                i = txt.find(w)
                if i >= 0:
                    return i, w
        return None, None

    idx, matched = _find(text, focus_word) if focus_word else (None, None)

    # ── single-line: draw full text then overdraw highlight ──────
    if full_w <= max_w:
        sx = int((POSTER_W - full_w) / 2)
        draw.fill_color = default_color
        draw.text(sx, y, text)
        if idx is not None:
            if rtl:
                # RTL: suffix (chars after the word) appears on the LEFT
                sfx = text[idx + len(matched):]
                sw = draw.get_font_metrics(img, sfx, True).text_width if sfx else 0
                draw.fill_color = gold_color
                draw.text(int(sx + sw), y, matched)
            else:
                pfx = text[:idx]
                pw = draw.get_font_metrics(img, pfx, True).text_width if pfx else 0
                draw.fill_color = gold_color
                draw.text(int(sx + pw), y, matched)
        return line_h

    # ── wrapped RTL: uniform colour (highlight not feasible) ─────
    if rtl:
        draw.fill_color = default_color
        return _draw_centered(draw, img, text, y, max_w)

    # ── wrapped LTR: word-by-word with highlight ─────────────────
    focus_low = focus_word.lower().strip('.,;:!?()') if focus_word else ''
    words = text.split()
    lines: list[list[str]] = []
    cur: list[str] = []
    for w in words:
        test = ' '.join(cur + [w])
        if draw.get_font_metrics(img, test, True).text_width > max_w and cur:
            lines.append(cur)
            cur = [w]
        else:
            cur.append(w)
    if cur:
        lines.append(cur)

    total_h = 0
    for line_words in lines:
        lt = ' '.join(line_words)
        lw_px = draw.get_font_metrics(img, lt, True).text_width
        lx = int((POSTER_W - lw_px) / 2)
        draw.fill_color = default_color
        draw.text(lx, y + total_h, lt)
        for w in line_words:
            if w.lower().strip('.,;:!?()') == focus_low:
                pfx = lt[:lt.find(w)]
                pw = draw.get_font_metrics(img, pfx, True).text_width if pfx else 0
                draw.fill_color = gold_color
                draw.text(int(lx + pw), y + total_h, w)
                break
        total_h += line_h
    return total_h


# ---------------------------------------------------------------------------
# Poster frames
# ---------------------------------------------------------------------------
def create_combined_poster(
    arabic: str, english: str, transliteration: str,
    bg_path: str, out_path: Path, *,
    pos_tag: str = "", occurrences: int = 0, root: str = "", rank: int = 0,
    example_ar: str = "", example_en: str = "", example_ref: str = "",
    focus_word_ar: str = "",
) -> Path:
    """Frame 1 – word + meaning + Quran example (1080×1920)."""
    from wand.image import Image
    from wand.drawing import Drawing
    from wand.color import Color

    out_path.parent.mkdir(parents=True, exist_ok=True)
    GOLD = Color("#FFD700")

    with Image(filename=bg_path) as img:
        img.resize(POSTER_W, POSTER_H)
        img.depth = 32
        draw = Drawing()

        # ── Title: "This word appears N times in Quran" ──────────
        draw.font = ENGLISH_FONT
        draw.font_size = 38
        draw.fill_color = Color("#FFFFFF")
        title = "Learn the meaning of frequently"
        ttw = draw.get_font_metrics(img, title, True).text_width
        draw.text(int((POSTER_W - ttw) / 2), 240, title)

        draw.font_size = 38
        title2 = "appearing words in the Quran"
        t2w = draw.get_font_metrics(img, title2, True).text_width
        draw.text(int((POSTER_W - t2w) / 2), 280, title2)

        # ── Subtitle: occurrence count ────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 24
        draw.fill_color = Color("#AAAAAA")
        sub = f"(This word ppears {occurrences:,} times in the Quran)"
        sw = draw.get_font_metrics(img, sub, True).text_width
        draw.text(int((POSTER_W - sw) / 2), 320, sub)

        # ── Arabic word (large, GOLD) ────────────────────────────
        draw.font = ARABIC_FONT
        draw.font_size = 150
        draw.fill_color = GOLD
        _draw_centered(draw, img, arabic, 580)

        # ── Transliteration ──────────────────────────────────────
        if transliteration:
            draw.font = ENGLISH_FONT
            draw.font_size = 28
            draw.fill_color = Color("#AAAAAA")
            tl = f"({transliteration})"
            tw = draw.get_font_metrics(img, tl, True).text_width
            draw.text(int((POSTER_W - tw) / 2), 700, tl)

        # ── English meaning (large, GOLD) ────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 130
        draw.fill_color = GOLD
        _draw_centered(draw, img, english, 810)

        # ── "Examples From The Quran:" ───────────────────────────
        if example_ar or example_en:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 22
            draw.fill_color = Color("#BBBBBB")
            sec = "Example from Quran:"
            secw = draw.get_font_metrics(img, sec, True).text_width
            draw.text(int((POSTER_W - secw) / 2), 980, sec)

        # ── Arabic example with highlight ────────────────────────
        if example_ar:
            draw.font = ARABIC_FONT
            draw.font_size = 52
            _draw_text_with_highlight(
                draw, img, example_ar, 1050,
                focus_word_ar or arabic, GOLD, Color("#E0E0E0"),
                rtl=True, max_w=POSTER_W - 200)

        # ── English example with highlight ───────────────────────
        if example_en:
            draw.font = ENGLISH_FONT
            draw.font_size = 36
            _draw_text_with_highlight(
                draw, img, example_en, 1190,
                english, GOLD, Color("#FFFFFF"),
                rtl=False, max_w=POSTER_W - 200)

        # ── Footer ───────────────────────────────────────────────
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
    """Frame 2 – quiz asking viewers to comment the meaning."""
    from wand.image import Image
    from wand.drawing import Drawing
    from wand.color import Color

    out_path.parent.mkdir(parents=True, exist_ok=True)
    GOLD = Color("#FFD700")
    labels = ["A", "B", "C", "D"]

    with Image(filename=bg_path) as img:
        img.resize(POSTER_W, POSTER_H)
        img.depth = 32
        draw = Drawing()

        # ── "Review The Last Lesson" ─────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 38
        draw.fill_color = Color("#FFFFFF")
        rev = "Review The Last Lesson"
        rw = draw.get_font_metrics(img, rev, True).text_width
        draw.text(int((POSTER_W - rw) / 2), 350, rev)

        # ── Arabic word (gold) ───────────────────────────────────
        draw.font = ARABIC_FONT
        draw.font_size = 120
        draw.fill_color = GOLD
        _draw_centered(draw, img, arabic, 530)

        # ── Question ─────────────────────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 34
        draw.fill_color = GOLD
        q = "What does this word mean?"
        qw = draw.get_font_metrics(img, q, True).text_width
        draw.text(int((POSTER_W - qw) / 2), 660, q)

        draw.font = ENGLISH_FONT_LIGHT
        draw.font_size = 24
        draw.fill_color = Color("#CCCCCC")
        cta = "Comment your answer below!"
        cw = draw.get_font_metrics(img, cta, True).text_width
        draw.text(int((POSTER_W - cw) / 2), 710, cta)

        # ── 4 options (left-aligned) ─────────────────────────────
        y_opt = 800
        x_opt = 120  # left margin
        for i, opt in enumerate(options[:4]):
            label = f"{labels[i]})  {opt}"
            draw.font = ENGLISH_FONT
            draw.font_size = 48
            draw.fill_color = Color("#FFFFFF")
            draw.text(x_opt, y_opt, label)
            y_opt += 80

        # ── Footer ───────────────────────────────────────────────
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
        "-t", f"{dur:.3f}",
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

    bg = bg_path or str(MEMORIZATION_ROOT / "background" / f"{random.randint(1, 21)}.png")
    slug = translit or f"word{rank}"
    word_dir = OUTPUT_DIR / slug
    parts = word_dir / "parts"
    parts.mkdir(parents=True, exist_ok=True)

    print(f"\n{'='*60}")
    print(f"[#{rank}] {arabic} = {english} ({translit})  {pos_tag}")
    print(f"  Occurrences: {occurrences:,}  Root: {root}  Ref: {example_ref}")
    print(f"  Background: {bg}")


    # --- Pre-recorded intro ---
    print("  Using pre-recorded intro audio...")
    intro_audio = AUDIO_INTRO
    if not intro_audio.exists():
        raise FileNotFoundError(f"Missing intro audio: {intro_audio}")
    print(f"    -> {audio_duration(intro_audio):.2f}s")

    # Arabic audio: download from quran.com (actual recitation)
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
                                  voice=arabic_voice, api_key=api_key, model=model,
                                  tone=TONE_SOFT_REVEAL)
        print(f"    -> {audio_duration(ar_audio):.2f}s")

    # English meaning — "it means — {english}" with soft reveal tone
    print("  Generating English meaning TTS (soft reveal)...")
    en_text = f"It means — {english}."
    en_audio = tts_elevenlabs(en_text, parts / "english.mp3",
                              voice=english_voice, api_key=api_key, model=model,
                              tone=TONE_SOFT_REVEAL)
    print(f"    -> {audio_duration(en_audio):.2f}s")

    # Pre-recorded "Example from Quran" transition
    print("  Using pre-recorded 'Example from Quran' audio...")
    ex_intro_audio = AUDIO_EXAMPLE_FROM_QURAN
    if not ex_intro_audio.exists():
        raise FileNotFoundError(f"Missing example audio: {ex_intro_audio}")
    print(f"    -> {audio_duration(ex_intro_audio):.2f}s")

    # Example Arabic — calm, clear tone
    ex_ar_audio = None
    if example_ar:
        print("  Generating example Arabic TTS (calm, clear)...")
        ex_ar_audio = tts_elevenlabs(example_ar, parts / "example_arabic.mp3",
                                     voice=arabic_voice, api_key=api_key, model=model,
                                     tone={**TONE_CALM_CLEAR, "speed": 0.85})
        print(f"    -> {audio_duration(ex_ar_audio):.2f}s")

    # Example English — calm, clear tone
    ex_en_audio = None
    if example_en:
        print("  Generating example English TTS (calm, clear)...")
        ex_en_audio = tts_elevenlabs(example_en, parts / "example_english.mp3",
                                     voice=english_voice, api_key=api_key, model=model,
                                     tone=TONE_CALM_CLEAR)
        print(f"    -> {audio_duration(ex_en_audio):.2f}s")

    # Pre-recorded "Next time understand when you hear" audio
    print("  Using pre-recorded 'next time understand' audio...")
    next_time_audio = AUDIO_NEXT_TIME
    if not next_time_audio.exists():
        raise FileNotFoundError(f"Missing next-time audio: {next_time_audio}")
    print(f"    -> {audio_duration(next_time_audio):.2f}s")

    # Quiz/Revise — pre-recorded clip
    print("  Using pre-recorded 'revise the previous word' audio...")
    quiz_audio = AUDIO_REVISE
    if not quiz_audio.exists():
        raise FileNotFoundError(f"Missing revise audio: {quiz_audio}")
    print(f"    -> {audio_duration(quiz_audio):.2f}s")

    # Pre-recorded download app CTA audio
    print("  Using pre-recorded download app audio...")
    download_app_audio = AUDIO_DOWNLOAD_APP
    if not download_app_audio.exists():
        raise FileNotFoundError(f"Missing download app audio: {download_app_audio}")
    print(f"    -> {audio_duration(download_app_audio):.2f}s")

    # ── Determine previous word for quiz (review last lesson) ───────
    prev_word = None
    if all_words and rank > 1:
        prev_word = all_words[rank - 2]  # rank is 1-based; index = rank-2

    # ── Silence gaps ──────────────────────────────────────────────────
    gap_short = silence_clip(400, parts / "gap_short.mp3")
    gap_long = silence_clip(800, parts / "gap_long.mp3")

    # ── CTA voice — use pre-recorded download app audio ──────────────
    cta_audio = download_app_audio

    # ── Quiz voice — use pre-recorded revise clip ────────────────
    quiz_cta_audio = AUDIO_REVISE if prev_word else None

    # ── FRAME 1: Combined poster (word + meaning + example) ──────────
    print("  Creating poster (frame 1)...")
    poster1 = create_combined_poster(
        arabic, english, translit, bg, parts / "poster.png",
        pos_tag=pos_tag, occurrences=occurrences, root=root, rank=rank,
        example_ar=example_ar, example_en=example_en, example_ref=example_ref,
        focus_word_ar=arabic)

    # ── FRAME 2: Quiz poster – only when there IS a previous word ────
    poster2 = None
    if prev_word:
        print("  Creating quiz poster (frame 2)...")
        quiz_ar = prev_word["arabic"]
        quiz_en = prev_word["meaning"]
        quiz_translit = prev_word.get("transliteration", "")
        quiz_options = _build_quiz_options(quiz_en, all_words, prev_word.get("rank", 0))
        poster2 = create_quiz_poster(
            quiz_ar, quiz_translit, quiz_options, quiz_options.index(quiz_en),
            bg, parts / "poster_quiz.png", rank=prev_word.get("rank", 0))
    else:
        print("  Skipping quiz poster (first word, no previous lesson)")


    # --- Custom audio sequence ---
    # Flow: intro.mp3 → Arabic word → "it means..." → example_from_quran.mp3
    #       → Arabic example → English example → next_time.mp3
    print("  Building custom audio track...")
    f1_parts = [
        intro_audio, gap_long,
        ar_audio, gap_short,
        en_audio, gap_long,
        ex_intro_audio, gap_short,
    ]
    if ex_ar_audio:
        f1_parts.extend([ex_ar_audio, gap_short])
    if ex_en_audio:
        f1_parts.extend([ex_en_audio, gap_long])
    f1_parts.extend([
        next_time_audio, gap_long,
    ])

    f1_list = parts / "f1_audio_list.txt"
    with open(f1_list, "w") as f:
        for ap in f1_parts:
            f.write(f"file '{ap.resolve()}'\n")
    f1_audio = parts / "f1_audio.mp3"
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(f1_list),
        "-c:a", "libmp3lame", "-q:a", "2", str(f1_audio),
    ], check=True, capture_output=True)

    # ── Build Frame 2 audio (quiz) — only if prev_word exists ────────
    f2_audio = None
    if prev_word and quiz_cta_audio:
        gap_think = silence_clip(3000, parts / "gap_think.mp3")
        # Quiz audio: revise clip → thinking pause (single play, no repeat)
        f2_list = parts / "f2_audio_list.txt"
        with open(f2_list, "w") as f:
            f.write(f"file '{quiz_cta_audio.resolve()}'\n")
            f.write(f"file '{gap_think.resolve()}'\n")
        f2_audio = parts / "f2_audio.mp3"
        subprocess.run([
            FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(f2_list),
            "-c:a", "libmp3lame", "-q:a", "2", str(f2_audio),
        ], check=True, capture_output=True)

    # ── Build end card audio: download_app.mp3 + short tail silence ─────
    end_silence = silence_clip(1500, parts / "end_silence.mp3")
    f_end_list = parts / "f_end_audio_list.txt"
    with open(f_end_list, "w") as f:
        f.write(f"file '{download_app_audio.resolve()}'\n")
        f.write(f"file '{end_silence.resolve()}'\n")
    f3_audio = parts / "f3_audio.mp3"
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(f_end_list),
        "-c:a", "libmp3lame", "-q:a", "2", str(f3_audio),
    ], check=True, capture_output=True)

    # ── Render Frame 1 video ──────────────────────────────────────────
    print("  Rendering frame 1...")
    seg1 = make_segment(poster1, f1_audio, parts / "seg_frame1.mp4")

    # ── Render Frame 2 video (quiz) — only if prev_word exists ────────
    seg2 = None
    if prev_word and poster2 and f2_audio:
        print("  Rendering frame 2 (quiz)...")
        seg2 = make_segment(poster2, f2_audio, parts / "seg_frame2.mp4")

    # ── Render end card video ─────────────────────────────────────────
    print("  Rendering end card frame...")
    seg_end = make_segment(END_CARD_PATH, f3_audio, parts / "seg_frame_end.mp4")

    # ── Concat frames ─────────────────────────────────────────────────
    print("  Concatenating frames...")
    segments = [seg1]
    if seg2:
        segments.append(seg2)
    segments.append(seg_end)

    final = word_dir / f"word_reel_{slug}.mp4"
    concat_segments(segments, final)

    total_dur = audio_duration(f1_audio)
    if f2_audio:
        total_dur += audio_duration(f2_audio)
    total_dur += audio_duration(f3_audio)
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
