#!/usr/bin/env python3
"""
Generate YouTube HD (1920×1080) Quran vocabulary word videos — V2.

Audio sources:
  - Arabic word:     quran.com word-by-word recitation
  - English word:    reuses ElevenLabs pronunciation from v1 output (if available)
  - Arabic example:  Al-Husary recitation trimmed via API segment timestamps
  - English example: ElevenLabs TTS (--api-key), falls back to Edge-TTS if omitted

Data source:  generated/reel_words_top600.json

Flow per word:
  1) Arabic word on screen  + quran.com wbw audio
  2) English word on screen + v1 TTS pronunciation (or silence)
  3) Arabic example         + Al-Husary trimmed recitation
  4) English example (Sahih) + ElevenLabs TTS (or Edge-TTS fallback)

Usage:
  py yt_word_video_v2.py --rank 1 --api-key sk_...
  py yt_word_video_v2.py --rank 1 --count 5 --api-key sk_...
  py yt_word_video_v2.py --rank 1              # falls back to Edge-TTS
"""
from __future__ import annotations

import argparse
import asyncio
import io
import json
import re
import shutil
import subprocess
import sys
import time
import unicodedata
import urllib.parse
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
OUTPUT_DIR = MEMORIZATION_ROOT / "output" / "new_folder"
V1_OUTPUT_DIR = MEMORIZATION_ROOT / "output" / "yt_word_videos"   # reuse TTS
BG_PATH = MEMORIZATION_ROOT / "background" / "yt_background.png"

ARABIC_FONT = str(FONTS_DIR / "ScheherazadeNew-Bold.ttf")
ENGLISH_FONT = str(FONTS_DIR / "MONTSERRAT-BOLD.TTF")
ENGLISH_FONT_LIGHT = str(FONTS_DIR / "Montserrat-VariableFont_wght.ttf")

FFMPEG = shutil.which("ffmpeg") or "ffmpeg"
FFPROBE = shutil.which("ffprobe") or "ffprobe"

VID_W, VID_H = 1920, 1080
# Strip tashkeel marks — but NOT U+0670 (superscript alef), handled in ALEF_MAP
TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u06D6-\u06ED\u0640]')

ALEF_MAP = str.maketrans({
    '\u0622': '\u0627',   # آ → ا
    '\u0623': '\u0627',   # أ → ا
    '\u0625': '\u0627',   # إ → ا
    '\u0671': '\u0627',   # ٱ → ا
    '\u0670': '\u0627',   # ٰ  (superscript/dagger alef) → ا
    '\u0621': '',          # ء (standalone hamza) → remove
    '\u0654': '',          # hamza above
    '\u0655': '',          # hamza below
    '\u0674': '',          # high hamza
    '\u0653': '',          # madda above
    '\u0649': '\u064A',   # ى (alef maqsura) → ي (ya)
    '\u0629': '\u0647',   # ة (taa marbuta) → ه (ha)
    '\u0624': '\u0648',   # ؤ (waw+hamza)   → و (waw)
    '\u0626': '\u064A',   # ئ (ya+hamza)    → ي (ya)
    '\u06E1': '',          # ۡ (small high dotless head of khah)
    '\u06DF': '',          # ۟ (small high rounded zero)
    '\u06E5': '',          # ۥ (small waw)
    '\u06E6': '',          # ۦ (small ya)
})

REQUEST_DELAY = 0.35      # polite delay between API calls


def _norm_ar(text: str) -> str:
    """Normalize Arabic for fuzzy matching: strip tashkeel + normalize alef."""
    return TASHKEEL_RE.sub('', text).translate(ALEF_MAP).strip()


# ---------------------------------------------------------------------------
# Network helpers
# ---------------------------------------------------------------------------
_HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}


def fetch_json(url: str) -> dict:
    req = urllib.request.Request(url, headers=_HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))


def download_audio(url: str, out_path: Path) -> Path:
    """Download audio and normalize to 44100 Hz stereo MP3."""
    out_path.parent.mkdir(parents=True, exist_ok=True)
    raw_path = out_path.with_suffix(".raw.mp3")
    req = urllib.request.Request(url, headers={"User-Agent": "LearnQuranDaily/2.0"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        with open(raw_path, "wb") as f:
            f.write(resp.read())
    if not raw_path.exists() or raw_path.stat().st_size == 0:
        raise RuntimeError(f"Download produced empty file: {url}")
    # Normalize to 44100 Hz stereo to avoid concat issues
    subprocess.run([
        FFMPEG, "-y", "-i", str(raw_path),
        "-ar", "44100", "-ac", "2",
        "-c:a", "libmp3lame", "-q:a", "2", str(out_path),
    ], check=True, capture_output=True)
    raw_path.unlink(missing_ok=True)
    return out_path


# ---------------------------------------------------------------------------
# Audio helpers (FFmpeg)
# ---------------------------------------------------------------------------
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


def trim_audio(input_path: Path, start_ms: int, end_ms: int,
               out_path: Path, *, fade_ms: int = 350,
               speed: float = 1.0) -> Path:
    """Trim audio with strong fade in/out to eliminate bleed from adjacent words.

    Uses atrim filter for sample-accurate trimming (not keyframe-based -ss),
    then resets timestamps so afade works on the trimmed portion.
    Optional speed adjustment via atempo (0.5–2.0).
    """
    out_path.parent.mkdir(parents=True, exist_ok=True)
    start_s = start_ms / 1000
    end_s = end_ms / 1000
    dur = (end_s - start_s) / speed   # effective duration after tempo change
    fade_s = fade_ms / 1000
    # atrim = accurate cut, asetpts = reset clock to 0, then fade on trimmed audio
    af = f"atrim=start={start_s:.3f}:end={end_s:.3f},asetpts=PTS-STARTPTS"
    if speed != 1.0:
        af += f",atempo={speed:.2f}"
    af += f",afade=t=in:d={fade_s:.3f}"
    if dur > fade_s * 2:
        af += f",afade=t=out:st={dur - fade_s:.3f}:d={fade_s:.3f}"
    subprocess.run([
        FFMPEG, "-y",
        "-i", str(input_path),
        "-af", af,
        "-ar", "44100", "-ac", "2",
        "-c:a", "libmp3lame", "-q:a", "2", str(out_path),
    ], check=True, capture_output=True)
    return out_path


def boost_volume(input_path: Path, factor: float = 1.5) -> Path:
    """Boost volume in-place."""
    boosted = input_path.with_suffix(".loud.mp3")
    subprocess.run([
        FFMPEG, "-y", "-i", str(input_path),
        "-af", f"volume={factor}",
        "-c:a", "libmp3lame", "-q:a", "2", str(boosted),
    ], check=True, capture_output=True)
    boosted.replace(input_path)
    return input_path


# ---------------------------------------------------------------------------
# Reuse v1 English word pronunciation
# ---------------------------------------------------------------------------
def find_v1_english_audio(slug: str) -> Path | None:
    """Look for english.mp3 in the v1 output folder for this word."""
    candidate = V1_OUTPUT_DIR / slug / "parts" / "english.mp3"
    if candidate.exists() and candidate.stat().st_size > 0:
        return candidate
    return None


def find_v1_example_english_audio(slug: str) -> Path | None:
    """Look for example_english.mp3 in the v1 output folder for this word."""
    candidate = V1_OUTPUT_DIR / slug / "parts" / "example_english.mp3"
    if candidate.exists() and candidate.stat().st_size > 0:
        return candidate
    return None


# ---------------------------------------------------------------------------
# ElevenLabs TTS
# ---------------------------------------------------------------------------
EL_VOICE = "MFZUKuGQUsGJPQjTS4wC"
EL_MODEL = "eleven_v3"
EL_TONE_EXAMPLE = {
    "stability": 0.75, "similarity_boost": 0.85,
    "style": 0.15, "use_speaker_boost": True, "speed": 0.85,
}

_EL_API_KEY: str | None = None   # set from CLI --api-key
_AR_TTS_MODE: str = "quran"       # "quran" or "elevenlabs"


def tts_elevenlabs(text: str, out_path: Path, *, voice: str = EL_VOICE,
                   api_key: str = "", model: str = EL_MODEL,
                   tone: dict | None = None) -> Path:
    """Synthesize text via ElevenLabs TTS."""
    from elevenlabs.client import ElevenLabs
    from elevenlabs.types import VoiceSettings
    out_path.parent.mkdir(parents=True, exist_ok=True)
    client = ElevenLabs(api_key=api_key or _EL_API_KEY)

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
    # Boost volume + pad to prevent clipping
    boosted = out_path.with_suffix(".loud.mp3")
    subprocess.run([
        FFMPEG, "-y", "-i", str(out_path),
        "-af", "volume=1.8,apad=pad_dur=0.3",
        "-c:a", "libmp3lame", "-q:a", "2", str(boosted),
    ], check=True, capture_output=True)
    boosted.replace(out_path)
    return out_path


# ---------------------------------------------------------------------------
# Edge-TTS (free fallback — no API key)
# ---------------------------------------------------------------------------
EDGE_TTS_VOICE = "en-US-GuyNeural"


def tts_edge(text: str, out_path: Path, *, voice: str = EDGE_TTS_VOICE) -> Path:
    """Synthesize English text to MP3 via edge-tts (free, no key)."""
    import edge_tts
    out_path.parent.mkdir(parents=True, exist_ok=True)
    communicate = edge_tts.Communicate(text, voice)
    asyncio.run(communicate.save(str(out_path)))
    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"edge-tts produced no audio for: {text!r}")
    return out_path


def build_translation_from_words(
    ayah_words: list[dict], start_idx: int, end_idx: int
) -> str:
    """Concatenate word-by-word translations for the matched range."""
    parts = []
    for i in range(start_idx, end_idx + 1):
        t = ayah_words[i].get("translation", "").strip()
        if t:
            parts.append(t)
    return " ".join(parts)


# ---------------------------------------------------------------------------
# Arabic audio pipeline  (quran.com recitation + Al-Husary segments)
# ---------------------------------------------------------------------------
DEFAULT_RECITER = 6   # Mahmoud Khalil Al-Husary


def fetch_ayah_segments(verse_key: str, reciter_id: int = DEFAULT_RECITER) -> tuple[list, str]:
    """Return (segments_list, audio_url) from quran.com.

    Each segment: [word_0idx, word_1idx, start_ms, end_ms]
    """
    time.sleep(REQUEST_DELAY)
    encoded = urllib.parse.quote(verse_key, safe="")
    url = (f"https://api.quran.com/api/v4/recitations/{reciter_id}"
           f"/by_ayah/{encoded}?fields=segments")
    data = fetch_json(url)
    af = data["audio_files"][0]
    raw_url = af["url"]
    # API may return //mirrors... or relative path — normalize
    if raw_url.startswith("//"):
        raw_url = "https:" + raw_url
    elif not raw_url.startswith("http"):
        raw_url = "https://verses.quran.com/" + raw_url
    return af["segments"], raw_url


def fetch_ayah_words(verse_key: str) -> list[dict]:
    """Fetch word-by-word data (text + translation) for an ayah."""
    time.sleep(REQUEST_DELAY)
    encoded = urllib.parse.quote(verse_key, safe="")
    url = (f"https://api.quran.com/api/v4/verses/by_key/{encoded}"
           f"?language=en&words=true&word_fields=text_uthmani")
    data = fetch_json(url)
    words = []
    for w in data["verse"]["words"]:
        if w["char_type_name"] == "word":
            words.append({
                "position": w["position"],
                "text": w.get("text_uthmani", w.get("text", "")),
                "translation": w.get("translation", {}).get("text", ""),
            })
    return words


def _strip_alef(text: str) -> str:
    """Remove all alefs — for skeleton comparison of Uthmani vs simplified."""
    return text.replace('\u0627', '')


def _fuzzy_tok_eq(ex_tok: str, ay_tok: str) -> bool:
    """Fuzzy compare two normalized Arabic tokens.

    Handles:
    - Exact match
    - Prefix differences (وَ، فَ، بِ، etc. attached)
    - Alef-count differences between Uthmani and simplified scripts
    """
    if ex_tok == ay_tok:
        return True
    # Check if one is a suffix of the other (prefix attached)
    if ay_tok.endswith(ex_tok) and len(ex_tok) >= 2:
        return True
    if ex_tok.endswith(ay_tok) and len(ay_tok) >= 2:
        return True
    # Alef-skeleton: Uthmani may omit/add alefs vs simplified Arabic
    ex_skel = _strip_alef(ex_tok)
    ay_skel = _strip_alef(ay_tok)
    if ex_skel and ex_skel == ay_skel:
        return True
    # Alef-skeleton + prefix check
    if ay_skel.endswith(ex_skel) and len(ex_skel) >= 2:
        return True
    if ex_skel.endswith(ay_skel) and len(ay_skel) >= 2:
        return True
    return False


def match_example_to_word_range(
    example_ar: str, ayah_words: list[dict]
) -> tuple[int | None, int | None]:
    """Find 0-based (start_idx, end_idx) of example_ar within the ayah words.

    Returns (None, None) if no good match is found.
    """
    ex_tokens = [_norm_ar(w) for w in example_ar.split() if _norm_ar(w)]
    ay_tokens = [_norm_ar(w["text"]) for w in ayah_words]

    if not ex_tokens or not ay_tokens:
        return None, None

    best_start, best_len = 0, 0
    for start in range(len(ay_tokens)):
        match_len = 0
        for j in range(len(ex_tokens)):
            if start + j < len(ay_tokens) and _fuzzy_tok_eq(ex_tokens[j], ay_tokens[start + j]):
                match_len += 1
            else:
                break
        if match_len > best_len:
            best_start = start
            best_len = match_len

    # Require at least 50 % of example words to match
    if best_len < max(1, len(ex_tokens) // 2):
        return None, None

    return best_start, best_start + best_len - 1


# ---------------------------------------------------------------------------
# Sahih International text (matches what Ibrahim Walk reads aloud)
# ---------------------------------------------------------------------------
def fetch_sahih_text(verse_key: str) -> str:
    """Fetch Sahih International (id=20) full ayah translation."""
    time.sleep(REQUEST_DELAY)
    encoded = urllib.parse.quote(verse_key, safe="")
    url = (f"https://api.quran.com/api/v4/verses/by_key/{encoded}"
           f"?translations=20&language=en")
    data = fetch_json(url)
    for t in data["verse"].get("translations", []):
        text = re.sub(r'<[^>]+>', '', t.get("text", ""))
        # Strip footnote numbers like "1" that Sahih uses
        text = re.sub(r'(?<=\w)\d+(?=\s|$|[,;.\-])', '', text)
        return text.strip()
    return ""


def trim_sahih_to_window(
    sahih_full: str,
    ar_start_idx: int, ar_end_idx: int,
    total_ayah_words: int,
) -> str:
    """Extract the portion of Sahih text that corresponds to the Arabic word window.

    Uses proportional mapping since English word count differs from Arabic.
    """
    if not sahih_full:
        return sahih_full
    en_words = sahih_full.split()
    total_en = len(en_words)
    if total_en <= 13 or total_ayah_words == 0:
        return sahih_full  # short enough already

    # Proportional start/end in English
    ratio_start = ar_start_idx / total_ayah_words
    ratio_end = (ar_end_idx + 1) / total_ayah_words
    en_start = max(0, int(ratio_start * total_en) - 1)
    en_end = min(total_en, int(ratio_end * total_en) + 1)

    # Clamp to max ~13 words
    if en_end - en_start > 13:
        en_end = en_start + 13

    snippet = ' '.join(en_words[en_start:en_end])
    # Clean up leading/trailing punctuation artifacts
    snippet = snippet.strip(' ,;:-')
    return snippet


# ---------------------------------------------------------------------------
# English audio pipeline  (Ibrahim Walk via alquran.cloud)
# ---------------------------------------------------------------------------
def detect_silences(audio_path: Path, noise_db: int = -30,
                    min_dur: float = 0.25) -> list[tuple[float, float]]:
    """Return list of (start_sec, end_sec) silence periods."""
    result = subprocess.run(
        [FFMPEG, "-i", str(audio_path),
         "-af", f"silencedetect=noise={noise_db}dB:d={min_dur}",
         "-f", "null", "-"],
        capture_output=True, text=True,
    )
    silences: list[tuple[float, float]] = []
    start = None
    for line in result.stderr.split('\n'):
        if 'silence_start:' in line:
            try:
                start = float(line.split('silence_start:')[1].strip().split()[0])
            except (ValueError, IndexError):
                start = None
        elif 'silence_end:' in line and start is not None:
            try:
                end = float(line.split('silence_end:')[1].strip().split()[0])
                silences.append((start, end))
            except (ValueError, IndexError):
                pass
            start = None
    return silences


def _snap_to_silence(target_ms: int,
                     silences: list[tuple[float, float]],
                     direction: str = 'before',
                     max_drift_ms: int = 2000) -> int:
    """Find the nearest silence midpoint in *direction* of target_ms."""
    best, best_dist = target_ms, float('inf')
    for s_start, s_end in silences:
        mid = int((s_start + s_end) / 2 * 1000)
        if direction == 'before' and mid > target_ms:
            continue
        if direction == 'after' and mid < target_ms:
            continue
        dist = abs(mid - target_ms)
        if dist < best_dist:
            best, best_dist = mid, dist
    return best if best_dist <= max_drift_ms else target_ms


def get_english_example_audio(
    verse_key: str, example_en: str,
    ar_start_ratio: float, ar_end_ratio: float,
    out_dir: Path,
) -> Path | None:
    """Download Ibrahim Walk English recitation and trim proportionally."""
    try:
        time.sleep(REQUEST_DELAY)
        surah, ayah = verse_key.split(":")
        url = f"https://api.alquran.cloud/v1/ayah/{surah}:{ayah}/en.walk"
        data = fetch_json(url)
        audio_url = data["data"]["audio"]

        full_audio = out_dir / "ayah_english_full.mp3"
        download_audio(audio_url, full_audio)

        dur_s = audio_duration(full_audio)
        dur_ms = int(dur_s * 1000)

        # Short verse or example covers the whole thing → use full audio
        if dur_s <= 10 or (ar_start_ratio <= 0.05 and ar_end_ratio >= 0.95):
            print(f"    English: using full audio ({dur_s:.1f}s)")
            return full_audio

        # Proportional trimming with silence-snap
        est_start_ms = int(ar_start_ratio * dur_ms)
        est_end_ms = int(ar_end_ratio * dur_ms)

        silences = detect_silences(full_audio)
        if silences:
            start_ms = _snap_to_silence(est_start_ms, silences, 'before')
            end_ms = _snap_to_silence(est_end_ms, silences, 'after')
        else:
            start_ms = max(0, est_start_ms - 300)
            end_ms = min(dur_ms, est_end_ms + 300)

        start_ms = max(0, start_ms)
        end_ms = min(dur_ms, end_ms)

        if end_ms - start_ms < 1000:
            print(f"    English: trimmed too short, using full ({dur_s:.1f}s)")
            return full_audio

        print(f"    Trimming English: {start_ms}ms–{end_ms}ms (of {dur_ms}ms)")
        trimmed = out_dir / "example_english_trimmed.mp3"
        return trim_audio(full_audio, start_ms, end_ms, trimmed)

    except Exception as exc:
        print(f"    ! English example audio failed: {exc}")
        return None


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
        """Find focus word in text, always returning a full space-delimited token
        so the gold highlight aligns properly (no partial-token overlap)."""
        # 1) Exact full-token match
        for w in txt.split():
            if w == fw:
                i = txt.find(w)
                if i >= 0:
                    return i, w
        # 2) Substring match — but snap to the enclosing full token
        idx = txt.find(fw)
        if idx >= 0:
            start = txt.rfind(' ', 0, idx)
            start = start + 1 if start >= 0 else 0
            end = txt.find(' ', idx + len(fw))
            end = end if end >= 0 else len(txt)
            return start, txt[start:end]
        # 2b) Case-insensitive token match (English: "Not" matches "not")
        fw_ci = fw.lower()
        for w in txt.split():
            if w.lower().strip('.,;:!?()') == fw_ci:
                i = txt.find(w)
                if i >= 0:
                    return i, w
        # 2c) Case-insensitive substring match
        txt_lo = txt.lower()
        idx_ci = txt_lo.find(fw_ci)
        if idx_ci >= 0:
            start = txt.rfind(' ', 0, idx_ci)
            start = start + 1 if start >= 0 else 0
            end = txt.find(' ', idx_ci + len(fw))
            end = end if end >= 0 else len(txt)
            return start, txt[start:end]
        # 3) Normalized match (strip tashkeel + normalize alef variants)
        norm_fw = _norm_ar(fw)
        for w in txt.split():
            if norm_fw in _norm_ar(w):
                i = txt.find(w)
                if i >= 0:
                    return i, w
        # 3b) Try with trailing alef stripped (handles ىٰ → يا vs ى → ي)
        norm_fw_trimmed = norm_fw.rstrip('\u0627')
        if norm_fw_trimmed != norm_fw and len(norm_fw_trimmed) >= 2:
            for w in txt.split():
                if norm_fw_trimmed in _norm_ar(w):
                    i = txt.find(w)
                    if i >= 0:
                        return i, w
        # 4) Strip ال prefix from word and retry (handles ال vs لل/ول prefixes)
        bare = norm_fw.lstrip('و')  # strip leading waw conjunction
        if bare.startswith('ال'):
            bare = bare[2:]  # strip definite article
        if len(bare) >= 2:
            for w in txt.split():
                nw = _norm_ar(w)
                nw_bare = nw.lstrip('و')
                # strip any single-char preposition prefix (ل، ب، ف، ك) + optional ال
                for pfx in ('لل', 'بال', 'فال', 'كال', 'ل', 'ب', 'ف', 'ك', 'وال', 'ول', 'وب', ''):
                    if nw_bare.startswith(pfx) and nw_bare[len(pfx):] == bare:
                        i = txt.find(w)
                        if i >= 0:
                            return i, w
                    if nw_bare.startswith(pfx) and bare in nw_bare[len(pfx):]:
                        i = txt.find(w)
                        if i >= 0:
                            return i, w
        # 5) Split by '/' and try each part (handles meanings like "is/was")
        if '/' in fw:
            for part in fw.split('/'):
                part = re.sub(r'[()]', '', part).strip()
                if not part or len(part) < 2:
                    continue
                # Try as substring in text (for multi-word parts like "in it")
                part_low = part.lower()
                txt_low = txt.lower()
                si = txt_low.find(part_low)
                if si >= 0:
                    # Snap to enclosing token boundaries
                    start = txt.rfind(' ', 0, si)
                    start = start + 1 if start >= 0 else 0
                    end = txt.find(' ', si + len(part))
                    end = end if end >= 0 else len(txt)
                    return start, txt[start:end]
                # Single-word part: try exact token match
                for w in txt.split():
                    if w.lower().strip('.,;:!?()') == part_low:
                        i = txt.find(w)
                        if i >= 0:
                            return i, w
        # 6) Stem-prefix match: "wronged" matches "wrong", "destroyed" matches "destroy"
        fw_low = re.sub(r'[()]', '', fw).lower().strip()
        fw_words = fw_low.split()
        if fw_words:
            stem = fw_words[-1]  # use last word as stem (e.g. "We destroyed" → "destroyed")
            if len(stem) >= 4:
                for w in txt.split():
                    wl = w.lower().strip('.,;:!?()')
                    if wl.startswith(stem) or stem.startswith(wl):
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

    focus_low = re.sub(r'[()]', '', focus_word).lower().strip() if focus_word else ''
    focus_parts = [p.strip() for p in focus_low.split('/')] if '/' in focus_low else []
    focus_stem = focus_low.split()[-1] if focus_low and len(focus_low.split()[-1]) >= 4 else ''
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
            wl = w.lower().strip('.,;:!?()')
            # Match exact word, /‑parts, or stem prefix
            matched_w = (wl == focus_low
                         or (focus_parts and wl in focus_parts)
                         or (focus_stem and len(wl) >= 4 and (wl.startswith(focus_stem) or focus_stem.startswith(wl))))
            if matched_w:
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
        S = SCALE

        draw.font = ENGLISH_FONT
        draw.font_size = 32 * S
        draw.fill_color = Color("#FFFFFF")
        title = "Learn These 600 Words & Understand 56% of the Qur’an"
        _draw_centered(draw, img, title, 80 * S)

        if rank:
            draw.font = ENGLISH_FONT
            draw.font_size = 24 * S
            draw.fill_color = Color("#FFD700")
            rank_text = f"{rank}/{total_words}"
            rw = draw.get_font_metrics(img, rank_text, True).text_width
            draw.text(int(W2 - rw - 40 * S), 50 * S, rank_text)

        draw.font = ENGLISH_FONT
        draw.font_size = 22 * S
        draw.fill_color = Color("#AAAAAA")
        sub = f"This word appears {occurrences:,} times in the Quran"
        sw = draw.get_font_metrics(img, sub, True).text_width
        draw.text(int((W2 - sw) / 2), 125 * S, sub)

        draw.font = ARABIC_FONT
        draw.font_size = 110 * S
        draw.fill_color = GOLD
        _draw_centered(draw, img, arabic, 275 * S)

        if transliteration:
            draw.font = ENGLISH_FONT_LIGHT
            draw.font_size = 28 * S
            draw.fill_color = Color("#AAAAAA")
            tl = f"({transliteration})"
            tl_m = draw.get_font_metrics(img, tl, True)
            draw.text(int((W2 - tl_m.text_width) / 2), 360 * S, tl)

        draw.font = ENGLISH_FONT
        draw.font_size = 72 * S
        draw.fill_color = GOLD
        _draw_centered(draw, img, english, 450 * S)

        draw.stroke_color = Color("#444444")
        draw.stroke_width = 1 * S
        draw.line((int(W2 * 0.1), 480 * S), (int(W2 * 0.9), 500 * S))
        draw.stroke_width = 0

        if example_ar or example_en:
            draw.font = ENGLISH_FONT
            draw.font_size = 22 * S
            draw.fill_color = Color("#BBBBBB")
            sec = "Example from Quran:"
            sec_m = draw.get_font_metrics(img, sec, True)
            draw.text(int((W2 - sec_m.text_width) / 2), 570 * S, sec)

        if example_ar:
            draw.font = ARABIC_FONT
            draw.font_size = 58 * S
            _draw_text_with_highlight(
                draw, img, example_ar, 660 * S,
                focus_word_ar or arabic, GOLD, Color("#E0E0E0"),
                rtl=True, max_w=W2 - 200 * S)

        if example_en:
            draw.font = ENGLISH_FONT
            draw.font_size = 38 * S
            _draw_text_with_highlight(
                draw, img, example_en, 780 * S,
                english, GOLD, Color("#FFFFFF"),
                rtl=False, max_w=W2 - 200 * S)

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
def generate_yt_word_v2(word_entry: dict, *, total_words: int = 600) -> dict:
    arabic = word_entry["arabic"]
    english = word_entry["meaning"].lower()
    translit = word_entry.get("transliteration", "")
    occurrences = word_entry.get("occurrences", 0)
    rank = word_entry.get("rank", 0)
    audio_url = word_entry.get("audio_url", "")
    example_ar = word_entry.get("example_ar", "")
    example_en = word_entry.get("example_en", "")
    example_ref = word_entry.get("example_ref", "")

    slug = translit or f"word{rank}"
    slug = unicodedata.normalize("NFD", slug)
    slug = slug.encode("ascii", "ignore").decode("ascii")
    slug = re.sub(r'[^a-zA-Z0-9_-]', '', slug) or f"word{rank}"
    word_dir = OUTPUT_DIR / slug
    parts = word_dir / "parts"
    parts.mkdir(parents=True, exist_ok=True)

    bg = str(BG_PATH)
    print(f"\n{'=' * 60}")
    print(f"[#{rank}] {arabic} = {english} ({translit})  occ={occurrences:,}")
    print(f"  Example: {example_ref} | {example_ar}")
    print(f"           {example_en}")

    # ── 1) Arabic word audio (quran.com word-by-word) ────────────
    ar_word_audio = None
    if audio_url:
        print(f"  Downloading Arabic word audio...")
        try:
            full_url = (audio_url if audio_url.startswith("http")
                        else f"https://verses.quran.com/{audio_url}")
            ar_word_audio = download_audio(full_url, parts / "arabic_word.mp3")
            boost_volume(ar_word_audio, 1.5)
            print(f"    -> {audio_duration(ar_word_audio):.2f}s")
        except Exception as exc:
            print(f"    ! Download failed: {exc}")

    if ar_word_audio is None:
        print("  ! No Arabic word audio — using 0.5s silence")
        ar_word_audio = silence_clip(500, parts / "arabic_word.mp3")

    # ── 1b) English word pronunciation (reuse v1 TTS) ────────────
    en_word_audio = find_v1_english_audio(slug)
    if en_word_audio:
        # Copy to parts so concat paths are local
        local_en = parts / "english_word.mp3"
        if not local_en.exists():
            shutil.copy2(en_word_audio, local_en)
        en_word_audio = local_en
        print(f"  Reusing v1 English pronunciation: {audio_duration(en_word_audio):.2f}s")
    else:
        print(f"  ! No v1 English pronunciation for '{slug}' — using 1s silence")
        en_word_audio = silence_clip(1000, parts / "english_word.mp3")

    # ── 2) Arabic example audio ──────────────────────────────────
    ar_example_audio = None
    ar_start_ratio, ar_end_ratio = 0.0, 1.0
    start_idx, end_idx, total_ayah_words = None, None, 0
    ayah_words = []

    if example_ar and example_ref:
        if _AR_TTS_MODE == "elevenlabs" and _EL_API_KEY:
            # ── ElevenLabs TTS for Arabic example ──
            print(f"  ElevenLabs Arabic: \"{example_ar[:60]}...\"")
            try:
                ar_example_audio = tts_elevenlabs(
                    example_ar, parts / "example_arabic.mp3",
                    model="eleven_v3", tone=EL_TONE_EXAMPLE)
                print(f"  ElevenLabs Arabic example: {audio_duration(ar_example_audio):.2f}s")
            except Exception as exc:
                print(f"  ! ElevenLabs Arabic failed: {exc}, falling back to Quran API")

        if ar_example_audio is None:
            # ── Al-Husary recitation from Quran API (default) ──
            print(f"  Fetching Arabic example (Al-Husary)...")
            try:
                segments, full_ar_url = fetch_ayah_segments(example_ref)
                full_ar_audio = parts / "ayah_arabic_full.mp3"
                download_audio(full_ar_url, full_ar_audio)

                ayah_words = fetch_ayah_words(example_ref)
                total_ayah_words = len(ayah_words)
                start_idx, end_idx = match_example_to_word_range(example_ar, ayah_words)

                if start_idx is not None and end_idx is not None:
                    # Clamp end_idx to last available segment
                    end_idx = min(end_idx, len(segments) - 1)
                    ar_start_ratio = start_idx / total_ayah_words
                    ar_end_ratio = (end_idx + 1) / total_ayah_words

                    # Use exact segment boundaries — no offset before start
                    # to avoid capturing tail of previous word
                    start_ms = segments[start_idx][2]
                    end_ms = segments[end_idx][3] + 100
                    print(f"    Matched words {start_idx}–{end_idx}/{total_ayah_words}")
                    print(f"    Trimming: {start_ms}ms – {end_ms}ms")

                    ar_example_audio = trim_audio(
                        full_ar_audio, start_ms, end_ms,
                        parts / "example_arabic_trimmed.mp3",
                        speed=1.5)
                    print(f"    -> {audio_duration(ar_example_audio):.2f}s")
                else:
                    print(f"    ! Word matching failed, using full ayah")
                    ar_example_audio = full_ar_audio
                    print(f"    -> {audio_duration(ar_example_audio):.2f}s")
            except Exception as exc:
                print(f"    ! Arabic example failed: {exc}")

    # ── 3) English example audio (ElevenLabs or Edge-TTS fallback) ──
    en_example_audio = None
    if example_en:
        if _EL_API_KEY:
            print(f"  ElevenLabs: \"{example_en[:80]}{'...' if len(example_en) > 80 else ''}\"")
            try:
                en_example_audio = tts_elevenlabs(
                    example_en, parts / "example_english.mp3",
                    tone=EL_TONE_EXAMPLE)
                print(f"  ElevenLabs English example: {audio_duration(en_example_audio):.2f}s")
            except Exception as exc:
                print(f"  ! ElevenLabs failed: {exc}, falling back to Edge-TTS")
        if en_example_audio is None:
            print(f"  Edge-TTS: \"{example_en[:80]}{'...' if len(example_en) > 80 else ''}\"")
            try:
                en_example_audio = tts_edge(
                    example_en, parts / "example_english.mp3")
                print(f"  Edge-TTS English example: {audio_duration(en_example_audio):.2f}s")
            except Exception as exc:
                print(f"  ! Edge-TTS failed: {exc}")
    if en_example_audio is None:
        print(f"  ! No English example audio generated")

    # ── Build combined audio ─────────────────────────────────────
    gap_short = silence_clip(400, parts / "gap_short.mp3")
    gap_medium = silence_clip(800, parts / "gap_medium.mp3")

    # Flow: word → gap → english word → gap → arabic example → gap → english example
    audio_parts: list[Path] = [
        ar_word_audio, gap_short,
        en_word_audio, gap_medium,
    ]
    if ar_example_audio:
        audio_parts.extend([ar_example_audio, gap_short])
    if en_example_audio:
        audio_parts.extend([en_example_audio, gap_medium])

    combined_audio = parts / "combined_audio.mp3"
    concat_audio(audio_parts, combined_audio)

    final_dur = audio_duration(combined_audio)
    print(f"  Combined audio: {final_dur:.1f}s")

    # ── Save standalone HD MP3 ───────────────────────────────────
    final_mp3 = word_dir / f"word_{slug}.mp3"
    subprocess.run([
        FFMPEG, "-y", "-i", str(combined_audio),
        "-c:a", "libmp3lame", "-b:a", "320k", "-ar", "44100", "-ac", "2",
        str(final_mp3),
    ], check=True, capture_output=True)
    print(f"  MP3: {final_mp3}")

    # ── Create poster ────────────────────────────────────────────
    print("  Creating poster...")
    poster = word_dir / f"poster_{slug}.png"
    create_yt_poster(
        arabic, english, translit, bg, poster,
        occurrences=occurrences, rank=rank, total_words=total_words,
        example_ar=example_ar, example_en=example_en,
        focus_word_ar=arabic)

    # ── Render video ─────────────────────────────────────────────
    print("  Rendering video...")
    final_mp4 = word_dir / f"word_{slug}.mp4"
    make_segment(poster, combined_audio, final_mp4)

    print(f"  [OK] Video: {final_mp4} ({final_dur:.1f}s)")
    return {
        "rank": rank, "arabic": arabic, "english": english,
        "video": str(final_mp4), "mp3": str(final_mp3),
        "poster": str(poster), "duration": round(final_dur, 2),
    }


# ---------------------------------------------------------------------------
# CLI
# ---------------------------------------------------------------------------
def _make_slug(word, fallback_idx=0):
    s = word.get("transliteration") or f"word{word.get('rank', fallback_idx + 1)}"
    s = unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii")
    return re.sub(r'[^a-zA-Z0-9_-]', '', s) or f"word{word.get('rank', fallback_idx + 1)}"


def main():
    parser = argparse.ArgumentParser(
        description="Generate YouTube Quran word videos V2 (free audio, no TTS)")
    parser.add_argument("--rank", type=int, default=1,
                        help="Start rank (1-600)")
    parser.add_argument("--count", type=int, default=1,
                        help="Number of words to generate")
    parser.add_argument("--poster-only", action="store_true",
                        help="Only generate poster PNG (no audio / no video)")
    parser.add_argument("--combine", action="store_true",
                        help="Concatenate all videos into one MP4")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip words that already have a video")
    parser.add_argument("--api-key", default=None,
                        help="ElevenLabs API key (uses ElevenLabs for English example; falls back to Edge-TTS if omitted)")
    parser.add_argument("--ar-tts", choices=["quran", "elevenlabs"], default="quran",
                        help="Arabic example source: 'quran' = Al-Husary recitation (default), 'elevenlabs' = ElevenLabs TTS (needs --api-key)")
    args = parser.parse_args()

    global _EL_API_KEY, _AR_TTS_MODE
    _EL_API_KEY = args.api_key
    _AR_TTS_MODE = args.ar_tts
    if _AR_TTS_MODE == "elevenlabs" and not _EL_API_KEY:
        print("Error: --ar-tts elevenlabs requires --api-key")
        sys.exit(1)

    data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
    all_words = data["words"]
    print(f"Loaded {len(all_words)} words from {DATASET_PATH.name}")
    print(f"Output dir: {OUTPUT_DIR}")
    tts_label = 'ElevenLabs' if _EL_API_KEY else 'Edge-TTS (no --api-key)'
    print(f"Mode: {'poster-only' if args.poster_only else f'full video ({tts_label})'}")

    start_idx = args.rank - 1
    end_idx = min(start_idx + args.count, len(all_words))
    if start_idx < 0 or start_idx >= len(all_words):
        print(f"Error: --rank must be 1-{len(all_words)}")
        sys.exit(1)

    results = []
    skipped = 0
    for i in range(start_idx, end_idx):
        word = all_words[i]

        if args.skip_existing and not args.poster_only:
            s = _make_slug(word, i)
            if (OUTPUT_DIR / s / f"word_{s}.mp4").exists():
                skipped += 1
                results.append({"rank": word.get("rank"), "video": str(OUTPUT_DIR / s / f"word_{s}.mp4")})
                print(f"  [SKIP] #{word.get('rank')} {word['arabic']} (exists)")
                continue

        try:
            if args.poster_only:
                slug = _make_slug(word, i)
                wd = OUTPUT_DIR / slug
                wd.mkdir(parents=True, exist_ok=True)
                poster = wd / f"poster_{slug}.png"
                create_yt_poster(
                    word["arabic"], word["meaning"],
                    word.get("transliteration", ""), str(BG_PATH), poster,
                    occurrences=word.get("occurrences", 0),
                    rank=word.get("rank", 0), total_words=len(all_words),
                    example_ar=word.get("example_ar", ""),
                    example_en=word.get("example_en", ""),
                    focus_word_ar=word["arabic"])
                print(f"  [OK] Poster: {poster}")
                results.append({"rank": word.get("rank"), "poster": str(poster)})
            else:
                res = generate_yt_word_v2(word, total_words=len(all_words))
                results.append(res)
        except Exception as exc:
            print(f"  [FAIL] rank {word.get('rank', i + 1)}: {exc}")

    print(f"\n{'=' * 60}")
    print(f"Done! Generated {len(results)}/{end_idx - start_idx} items.  Skipped: {skipped}")
    for r in results:
        print(f"  #{r.get('rank', '?')}  {r}")

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
