#!/usr/bin/env python3
"""
Generate YouTube HD (1920×1080) Quran vocabulary word videos.

Data source:  generated/reel_words_top600.json

Flow per word:
  1) Arabic word on screen + quran.com recitation
  2) English meaning on screen + ElevenLabs TTS
  3) Quran example (Arabic) on screen + Arabic TTS
  4) Quran example (English) on screen + English TTS

Outputs per word:
  - word_<slug>.mp4   (1920×1080 H.264 video)
  - word_<slug>.mp3   (HD audio, 44.1 kHz stereo)
  - poster_<slug>.png (thumbnail / sample poster)

Usage:
  py yt_word_video.py --api-key YOUR_KEY --rank 1
  py yt_word_video.py --api-key YOUR_KEY --rank 1 --count 5
"""
from __future__ import annotations

import argparse
import io
import json
import re
import shutil
import subprocess
import sys
import urllib.request
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
SCRIPT_DIR = Path(__file__).resolve().parent
MEMORIZATION_ROOT = SCRIPT_DIR.parent
LEARN_QURAN_ROOT = MEMORIZATION_ROOT.parent / "learnqurandaily"

FONTS_DIR = LEARN_QURAN_ROOT / "fonts"
DATASET_PATH = MEMORIZATION_ROOT / "generated" / "reel_words_top600.json"
OUTPUT_DIR = MEMORIZATION_ROOT / "output" / "yt_word_videos"
BG_PATH = MEMORIZATION_ROOT / "background" / "yt_background.png"

ARABIC_FONT = str(FONTS_DIR / "ScheherazadeNew-Bold.ttf")
ENGLISH_FONT = str(FONTS_DIR / "MONTSERRAT-BOLD.TTF")
ENGLISH_FONT_LIGHT = str(FONTS_DIR / "Montserrat-VariableFont_wght.ttf")

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

# ElevenLabs defaults
DEFAULT_VOICE = "MFZUKuGQUsGJPQjTS4wC"
DEFAULT_MODEL = "eleven_multilingual_v2"

TONE_SOFT_REVEAL = {"stability": 0.35, "similarity_boost": 0.70, "style": 0.55, "speed": 0.85}
TONE_CALM_CLEAR = {"stability": 0.65, "similarity_boost": 0.75, "style": 0.20, "speed": 0.90}
TONE_ENGLISH_WORD = {"stability": 0.75, "similarity_boost": 0.85, "style": 0.15, "speed": 0.90}
TONE_EXAMPLE = {"stability": 0.75, "similarity_boost": 0.85, "style": 0.15, "use_speaker_boost": True, "speed": 0.85}

# YouTube HD landscape
VID_W, VID_H = 1920, 1080

TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u0670\u06D6-\u06ED]')


# ---------------------------------------------------------------------------
# Audio helpers
# ---------------------------------------------------------------------------
def download_audio(url: str, out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    req = urllib.request.Request(url, headers={"User-Agent": "LearnQuranDaily/1.0"})
    with urllib.request.urlopen(req, timeout=20) as resp:
        with open(out_path, "wb") as f:
            f.write(resp.read())
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"Download produced empty file: {url}")
    return out_path


def tts_elevenlabs(text: str, out_path: Path, *, voice: str, api_key: str,
                   model: str, tone: dict | None = None) -> Path:
    from elevenlabs.client import ElevenLabs
    from elevenlabs.types import VoiceSettings
    out_path.parent.mkdir(parents=True, exist_ok=True)
    client = ElevenLabs(api_key=api_key)

    vs_kwargs: dict = {"speed": 0.9}
    if tone:
        vs_kwargs["stability"] = tone.get("stability", 0.5)
        vs_kwargs["similarity_boost"] = tone.get("similarity_boost", 0.75)
        vs_kwargs["style"] = tone.get("style", 0.0)
        vs_kwargs["speed"] = tone.get("speed", 0.9)
        if tone.get("use_speaker_boost") is not None:
            vs_kwargs["use_speaker_boost"] = tone["use_speaker_boost"]

    audio_gen = client.text_to_speech.convert(
        text=text, voice_id=voice, model_id=model,
        output_format="mp3_44100_128",
        voice_settings=VoiceSettings(**vs_kwargs),
    )
    with open(out_path, "wb") as f:
        for chunk in audio_gen:
            f.write(chunk)
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"TTS produced no audio: {out_path}")
    # Boost volume and add 300ms padding to prevent clipping on short words
    boosted = out_path.with_suffix(".loud.mp3")
    subprocess.run([
        FFMPEG, "-y", "-i", str(out_path),
        "-af", "volume=1.8,apad=pad_dur=0.3",
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


def concat_audio(parts: list[Path], out_path: Path) -> Path:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    list_file = out_path.parent / f"{out_path.stem}_concat.txt"
    with open(list_file, "w") as f:
        for p in parts:
            f.write(f"file '{p.resolve()}'\n")
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-c:a", "libmp3lame", "-q:a", "2", str(out_path),
    ], check=True, capture_output=True)
    return out_path


# ---------------------------------------------------------------------------
# Image generation (Wand / ImageMagick) — 1920×1080 landscape
# ---------------------------------------------------------------------------
def _draw_centered(draw, img, text: str, y: int, max_w: int = 0) -> int:
    iw = img.width
    max_w = max_w or (iw - 160)
    line_h = int(draw.font_size * 1.25)
    metrics = draw.get_font_metrics(img, text, True)
    if metrics.text_width <= max_w:
        draw.text(int((iw - metrics.text_width) / 2), y, text)
        return line_h
    mid = len(text) // 2
    sp = text.find(" ", mid)
    if sp == -1:
        sp = text.rfind(" ", 0, mid)
    if sp > 0:
        l1, l2 = text[:sp], text[sp + 1:]
        m1 = draw.get_font_metrics(img, l1, True)
        m2 = draw.get_font_metrics(img, l2, True)
        draw.text(int((iw - m1.text_width) / 2), y, l1)
        draw.text(int((iw - m2.text_width) / 2), y + line_h, l2)
    else:
        draw.text(int((iw - metrics.text_width) / 2), y, text)
        return line_h
    return line_h * 2


def _draw_text_with_highlight(draw, img, text: str, y: int,
                               focus_word: str, gold_color, default_color,
                               rtl: bool = False, max_w: int = 0) -> int:
    max_w = max_w or (img.width - 200)
    line_h = int(draw.font_size * 1.35)
    full_w = draw.get_font_metrics(img, text, True).text_width

    def _find(txt, fw):
        idx = txt.find(fw)
        if idx >= 0:
            return idx, fw
        idx = txt.lower().find(fw.lower())
        if idx >= 0:
            return idx, txt[idx:idx + len(fw)]
        stripped = TASHKEEL_RE.sub('', fw)
        for w in txt.split():
            if stripped in TASHKEEL_RE.sub('', w):
                i = txt.find(w)
                if i >= 0:
                    return i, w
        return None, None

    iw = img.width
    idx, matched = _find(text, focus_word) if focus_word else (None, None)

    if full_w <= max_w:
        sx = int((iw - full_w) / 2)
        draw.fill_color = default_color
        draw.text(sx, y, text)
        if idx is not None:
            if rtl:
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

    if rtl:
        draw.fill_color = default_color
        return _draw_centered(draw, img, text, y, max_w)

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
        lx = int((iw - lw_px) / 2)
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


def _draw_footer(draw, img):
    from wand.color import Color
    iw, ih = img.width, img.height
    draw.font = ENGLISH_FONT
    draw.font_size = 20 * (iw // VID_W)
    draw.fill_color = Color("#FFFFFF")
    line1 = "Learn Quranic grammar and memorize Quran on"
    w1 = draw.get_font_metrics(img, line1, True).text_width
    draw.text(int((iw - w1) / 2), ih - 90 * (iw // VID_W), line1)

    draw.fill_color = Color("#FFD700")
    line2 = "My Quran Quest"
    w2 = draw.get_font_metrics(img, line2, True).text_width
    draw.text(int((iw - w2) / 2), ih - 65 * (iw // VID_W), line2)

    draw.font_size = 16 * (iw // VID_W)
    draw.fill_color = Color("#999999")
    line3 = "(Download the app now - link in description)"
    w3 = draw.get_font_metrics(img, line3, True).text_width
    draw.text(int((iw - w3) / 2), ih - 42 * (iw // VID_W), line3)


def create_yt_poster(
    arabic: str, english: str, transliteration: str,
    bg_path: str, out_path: Path, *,
    occurrences: int = 0, rank: int = 0, total_words: int = 600,
    example_ar: str = "", example_en: str = "",
    focus_word_ar: str = "",
) -> Path:
    """Create a 1920×1080 YouTube poster frame."""
    from wand.image import Image
    from wand.drawing import Drawing
    from wand.color import Color

    out_path.parent.mkdir(parents=True, exist_ok=True)
    GOLD = Color("#FFD700")

    SCALE = 2
    W2, H2 = VID_W * SCALE, VID_H * SCALE
    with Image(filename=bg_path) as img:
        img.resize(W2, H2, filter='lanczos')
        img.depth = 8
        draw = Drawing()

        S = SCALE  # shorthand

        # ── Title ────────────────────────────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 32 * S
        draw.fill_color = Color("#FFFFFF")
        title = "Learn the meaning of frequently appearing words in the Quran"
        _draw_centered(draw, img, title, 80 * S)

        # ── Rank badge (top-right) ───────────────────────────────
        if rank:
            draw.font = ENGLISH_FONT
            draw.font_size = 24 * S
            draw.fill_color = Color("#FFD700")
            rank_text = f"{rank}/{total_words}"
            rw = draw.get_font_metrics(img, rank_text, True).text_width
            draw.text(int(W2 - rw - 40 * S), 50 * S, rank_text)

        # ── Occurrence count (bold font) ─────────────────────────
        draw.font = ENGLISH_FONT
        draw.font_size = 22 * S
        draw.fill_color = Color("#AAAAAA")
        sub = f"This word appears {occurrences:,} times in the Quran"
        sw = draw.get_font_metrics(img, sub, True).text_width
        draw.text(int((W2 - sw) / 2), 125 * S, sub)

        # ── Arabic word (centred) ────────────────────────────────
        draw.font = ARABIC_FONT
        draw.font_size = 110 * S
        draw.fill_color = GOLD
        _draw_centered(draw, img, arabic, 275 * S)

        # ── Transliteration (centred, below Arabic) ──────────────
        if transliteration:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 28 * S
            draw.fill_color = Color("#AAAAAA")
            tl = f"({transliteration})"
            tl_m = draw.get_font_metrics(img, tl, True)
            draw.text(int((W2 - tl_m.text_width) / 2), 360 * S, tl)

        # ── English meaning (centred, below transliteration) ─────
        draw.font = ENGLISH_FONT
        draw.font_size = 72 * S
        draw.fill_color = GOLD
        _draw_centered(draw, img, english, 450 * S)

        # ── Divider line ─────────────────────────────────────────
        draw.stroke_color = Color("#444444")
        draw.stroke_width = 1 * S
        draw.line((int(W2 * 0.1), 480 * S), (int(W2 * 0.9), 500 * S))
        draw.stroke_width = 0

        # ── "Example from Quran:" ────────────────────────────────
        if example_ar or example_en:
            draw.font = ENGLISH_FONT
            draw.font_size = 22 * S
            draw.fill_color = Color("#BBBBBB")
            sec = "Example from Quran:"
            sec_m = draw.get_font_metrics(img, sec, True)
            draw.text(int((W2 - sec_m.text_width) / 2), 570 * S, sec)

        # ── Arabic example with highlight ────────────────────────
        if example_ar:
            draw.font = ARABIC_FONT
            draw.font_size = 58 * S
            _draw_text_with_highlight(
                draw, img, example_ar, 660 * S,
                focus_word_ar or arabic, GOLD, Color("#E0E0E0"),
                rtl=True, max_w=W2 - 200 * S)

        # ── English example with highlight ───────────────────────
        if example_en:
            draw.font = ENGLISH_FONT
            draw.font_size = 38 * S
            _draw_text_with_highlight(
                draw, img, example_en, 780 * S,
                english, GOLD, Color("#FFFFFF"),
                rtl=False, max_w=W2 - 200 * S)

        # ── Footer ───────────────────────────────────────────────
        _draw_footer(draw, img)

        draw(img)
        img.resize(VID_W, VID_H, filter='lanczos')
        img.compression_quality = 100
        img.save(filename=str(out_path))

    return out_path


# ---------------------------------------------------------------------------
# Video rendering
# ---------------------------------------------------------------------------
def make_segment(image_path: Path, audio_path: Path, out_path: Path) -> Path:
    dur = audio_duration(audio_path)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    subprocess.run([
        FFMPEG, "-y",
        "-loop", "1", "-i", str(image_path),
        "-i", str(audio_path),
        "-c:v", "libx264", "-tune", "stillimage", "-pix_fmt", "yuv420p",
        "-vf", f"scale={VID_W}:{VID_H}",
        "-c:a", "aac", "-b:a", "192k", "-ar", "44100", "-ac", "2",
        "-t", f"{dur:.3f}", "-shortest",
        str(out_path),
    ], check=True, capture_output=True)
    return out_path


# ---------------------------------------------------------------------------
# Main generation
# ---------------------------------------------------------------------------
def generate_yt_word(word_entry: dict, *, api_key: str, voice: str,
                     model: str, total_words: int = 600) -> dict:
    """Generate one YouTube word video + MP3 + poster."""
    arabic = word_entry["arabic"]
    english = word_entry["meaning"]
    translit = word_entry.get("transliteration", "")
    occurrences = word_entry.get("occurrences", 0)
    rank = word_entry.get("rank", 0)
    audio_url = word_entry.get("audio_url", "")
    example_ar = word_entry.get("example_ar", "")
    example_en = word_entry.get("example_en", "")
    example_ref = word_entry.get("example_ref", "")

    slug = translit or f"word{rank}"
    # Sanitize slug: replace special transliteration chars with ASCII equivalents
    import unicodedata
    slug = unicodedata.normalize("NFD", slug)
    slug = slug.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r'[^a-zA-Z0-9_-]', '', slug) or f"word{rank}"
    word_dir = OUTPUT_DIR / slug
    parts = word_dir / "parts"
    parts.mkdir(parents=True, exist_ok=True)

    bg = str(BG_PATH)
    print(f"\n{'=' * 60}")
    print(f"[#{rank}] {arabic} = {english} ({translit})  occ={occurrences:,}")

    # ── Audio clips ──────────────────────────────────────────────
    # 1) Arabic word recitation from quran.com
    ar_audio = None
    if audio_url:
        print(f"  Downloading Arabic audio: {audio_url}")
        try:
            ar_audio = download_audio(audio_url, parts / "arabic_quran.mp3")
            print(f"    -> {audio_duration(ar_audio):.2f}s")
        except Exception as exc:
            print(f"    ! Download failed: {exc}, falling back to TTS")
    if ar_audio is None:
        print("  Generating Arabic TTS...")
        ar_audio = tts_elevenlabs(arabic, parts / "arabic.mp3",
                                  voice=voice, api_key=api_key, model=model,
                                  tone=TONE_SOFT_REVEAL)
        print(f"    -> {audio_duration(ar_audio):.2f}s")

    # 2) English meaning TTS (eleven_v3 for clearer pronunciation)
    print("  Generating English meaning TTS...")
    en_text = f"{english}."
    en_audio = tts_elevenlabs(en_text, parts / "english.mp3",
                              voice=voice, api_key=api_key, model="eleven_v3",
                              tone=TONE_ENGLISH_WORD)
    print(f"    -> {audio_duration(en_audio):.2f}s")

    # 3) Arabic example TTS (eleven_v3)
    ex_ar_audio = None
    if example_ar:
        print("  Generating Arabic example TTS...")
        ex_ar_audio = tts_elevenlabs(example_ar, parts / "example_arabic.mp3",
                                     voice=voice, api_key=api_key, model="eleven_v3",
                                     tone=TONE_EXAMPLE)
        print(f"    -> {audio_duration(ex_ar_audio):.2f}s")

    # 4) English example TTS (eleven_v3)
    ex_en_audio = None
    if example_en:
        print("  Generating English example TTS...")
        ex_en_audio = tts_elevenlabs(example_en, parts / "example_english.mp3",
                                     voice=voice, api_key=api_key, model="eleven_v3",
                                     tone=TONE_EXAMPLE)
        print(f"    -> {audio_duration(ex_en_audio):.2f}s")

    # ── Gaps ─────────────────────────────────────────────────────
    gap_short = silence_clip(400, parts / "gap_short.mp3")
    gap_long = silence_clip(800, parts / "gap_long.mp3")

    # ── Combine audio: Arabic → gap → English → gap → English (repeat) → gap → example_ar → gap → example_en
    audio_parts = [ar_audio, gap_short, en_audio, gap_long, en_audio, gap_long]
    if ex_ar_audio:
        audio_parts.extend([ex_ar_audio, gap_short])
    if ex_en_audio:
        audio_parts.extend([ex_en_audio, gap_long])

    combined_audio = parts / "combined_audio.mp3"
    concat_audio(audio_parts, combined_audio)

    # ── Save standalone HD MP3 ───────────────────────────────────
    final_mp3 = word_dir / f"word_{slug}.mp3"
    subprocess.run([
        FFMPEG, "-y", "-i", str(combined_audio),
        "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "44100", "-ac", "2",
        str(final_mp3),
    ], check=True, capture_output=True)
    print(f"  MP3 saved: {final_mp3}")

    # ── Create poster ────────────────────────────────────────────
    print("  Creating YouTube poster...")
    poster = word_dir / f"poster_{slug}.png"
    create_yt_poster(
        arabic, english, translit, bg, poster,
        occurrences=occurrences, rank=rank, total_words=total_words,
        example_ar=example_ar, example_en=example_en,
        focus_word_ar=arabic)

    # ── Render video (poster + combined audio) ───────────────────
    print("  Rendering YouTube video...")
    final_mp4 = word_dir / f"word_{slug}.mp4"
    make_segment(poster, combined_audio, final_mp4)

    dur = audio_duration(combined_audio)
    print(f"  [OK] Video: {final_mp4}  ({dur:.1f}s)")
    print(f"       MP3:   {final_mp3}")
    print(f"       Poster:{poster}")

    return {
        "rank": rank,
        "arabic": arabic,
        "english": english,
        "video": str(final_mp4),
        "mp3": str(final_mp3),
        "poster": str(poster),
        "duration": round(dur, 2),
    }


def _make_slug(word, fallback_idx=0):
    """Compute the ASCII slug for a word entry."""
    import unicodedata as _ud
    s = word.get("transliteration") or f"word{word.get('rank', fallback_idx+1)}"
    s = _ud.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r'[^a-zA-Z0-9_-]', '', s) or f"word{word.get('rank', fallback_idx+1)}"


def main():
    parser = argparse.ArgumentParser(
        description="Generate YouTube HD (1920×1080) Quran word videos with pronunciation")
    parser.add_argument("--api-key", required=True, help="ElevenLabs API key")
    parser.add_argument("--rank", type=int, default=1,
                        help="Start rank (1-600) in the dataset")
    parser.add_argument("--count", type=int, default=1,
                        help="Number of words to generate")
    parser.add_argument("--voice", default=DEFAULT_VOICE,
                        help="ElevenLabs voice ID")
    parser.add_argument("--model", default=DEFAULT_MODEL,
                        help="ElevenLabs model ID")
    parser.add_argument("--poster-only", action="store_true",
                        help="Only generate poster PNG (no TTS / no video)")
    parser.add_argument("--combine", action="store_true",
                        help="After generating, concatenate all videos into one combined MP4")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip words that already have a video MP4 in the output folder")
    parser.add_argument("--generate-missing", type=int, default=0, metavar="N",
                        help="Scan all words, find missing videos, and generate the first N missing ones")
    args = parser.parse_args()

    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    all_words = data["words"]
    print(f"Loaded {len(all_words)} words from {DATASET_PATH.name}")

    # ── Generate-missing mode: find N words without videos ────────
    if args.generate_missing > 0:
        missing = []
        existing_videos = []
        for idx, w in enumerate(all_words):
            slug = _make_slug(w, idx)
            mp4 = OUTPUT_DIR / slug / f"word_{slug}.mp4"
            if mp4.exists():
                existing_videos.append((w, str(mp4)))
            else:
                missing.append((idx, w))
        print(f"Existing: {len(existing_videos)} | Missing: {len(missing)} | Will generate: {min(args.generate_missing, len(missing))}")
        targets = missing[:args.generate_missing]
        results = []
        for idx, word in targets:
            try:
                res = generate_yt_word(
                    word, api_key=args.api_key, voice=args.voice, model=args.model,
                    total_words=len(all_words))
                results.append(res)
            except Exception as exc:
                print(f"  [FAIL] rank {word.get('rank', idx+1)}: {exc}")
        print(f"\n{'=' * 60}")
        print(f"Done! Generated {len(results)}/{len(targets)} missing words.")
        for r in results:
            print(f"  #{r.get('rank', '?')}  {r}")
        return

    start_idx = args.rank - 1
    end_idx = min(start_idx + args.count, len(all_words))
    if start_idx < 0 or start_idx >= len(all_words):
        print(f"Error: --rank must be 1-{len(all_words)}")
        sys.exit(1)

    results = []
    skipped = 0
    for i in range(start_idx, end_idx):
        word = all_words[i]

        # Skip existing check
        if args.skip_existing and not args.poster_only:
            _s = _make_slug(word, i)
            existing_mp4 = OUTPUT_DIR / _s / f"word_{_s}.mp4"
            if existing_mp4.exists():
                skipped += 1
                results.append({"rank": word.get("rank"), "video": str(existing_mp4)})
                continue

        try:
            if args.poster_only:
                slug = word.get("transliteration") or f"word{word.get('rank', i+1)}"
                import unicodedata as _ud
                slug = _ud.normalize("NFD", slug)
                slug = slug.encode("ascii", "ignore").decode("ascii")
                slug = re.sub(r'[^a-zA-Z0-9_-]', '', slug) or f"word{word.get('rank', i+1)}"
                word_dir = OUTPUT_DIR / slug
                word_dir.mkdir(parents=True, exist_ok=True)
                poster = word_dir / f"poster_{slug}.png"
                create_yt_poster(
                    word["arabic"], word["meaning"],
                    word.get("transliteration", ""), str(BG_PATH), poster,
                    occurrences=word.get("occurrences", 0),
                    rank=word.get("rank", 0),
                    total_words=len(all_words),
                    example_ar=word.get("example_ar", ""),
                    example_en=word.get("example_en", ""),
                    focus_word_ar=word["arabic"])
                print(f"  [OK] Poster: {poster}")
                results.append({"rank": word.get("rank"), "poster": str(poster)})
            else:
                res = generate_yt_word(
                    word, api_key=args.api_key, voice=args.voice, model=args.model,
                    total_words=len(all_words))
                results.append(res)
        except Exception as exc:
            print(f"  [FAIL] rank {word.get('rank', i+1)}: {exc}")

    print(f"\n{'=' * 60}")
    print(f"Done! Generated {len(results)}/{end_idx - start_idx} items.  Skipped (existing): {skipped}")
    for r in results:
        print(f"  #{r.get('rank', '?')}  {r}")

    # ── Combine all videos into one ──────────────────────────────
    if args.combine and not args.poster_only:
        video_paths = [r["video"] for r in results if "video" in r]
        if len(video_paths) < 2:
            print("Not enough videos to combine.")
        else:
            print(f"\nCombining {len(video_paths)} videos...")
            concat_list = OUTPUT_DIR / "concat_list.txt"
            with open(concat_list, "w", encoding="utf-8") as f:
                for vp in video_paths:
                    f.write(f"file '{vp}'\n")
            combined_out = OUTPUT_DIR / f"quran_words_{args.rank}_to_{args.rank + len(video_paths) - 1}_combined.mp4"
            subprocess.run([
                FFMPEG, "-y", "-f", "concat", "-safe", "0",
                "-i", str(concat_list),
                "-c:v", "libx264", "-crf", "18", "-preset", "medium",
                "-c:a", "aac", "-b:a", "192k",
                str(combined_out),
            ], check=True)
            total_dur = audio_duration(combined_out)
            mins = int(total_dur // 60)
            secs = total_dur % 60
            print(f"  [OK] Combined: {combined_out}")
            print(f"       Duration: {mins}m {secs:.0f}s  ({len(video_paths)} words)")


if __name__ == "__main__":
    main()
