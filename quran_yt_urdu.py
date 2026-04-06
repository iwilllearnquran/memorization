"""
Quran YouTube Video Generator — Urdu Translation
Full surah Urdu audio + per-ayah synced frames.

Audio: Urdu recitation from alquran.cloud (ur.khan / Fateh Muhammad Jalandhry)
       Per-ayah files concatenated into one seamless surah audio.
Frames change in sync with exact ayah boundaries.

Usage:
  py quran_yt_urdu.py --preview 2          # Preview first ayah of surah 2
  py quran_yt_urdu.py --surah 2            # Full video for surah 2
  py quran_yt_urdu.py --all                # All 114 surahs
  py quran_yt_urdu.py --range 1-10         # Surahs 1 through 10
"""

import os
import re
import sys
import time
import subprocess
import argparse
from concurrent.futures import ThreadPoolExecutor
from functools import partial

import requests
from wand.image import Image as WandImage
from wand.drawing import Drawing
from wand.color import Color
from PIL import Image as PILImage
from imageio_ffmpeg import get_ffmpeg_exe

# ─── CONFIG ─────────────────────────────────────────────────────────────────
os.environ["IMAGEMAGICK_BINARY"] = r"C:\Program Files\ImageMagick-7.1.2-Q16-HDRI\magick.exe"

WIDTH, HEIGHT = 1920, 1080
BG_IMAGE = "c:/Users/Abrar/github/private/memorization/background/background_ty.png"

FONT_DIR = "c:/Users/Abrar/github/private/memorization/fonts"
FONT_AR = os.path.join(FONT_DIR, "UthmanicHafs1v18p3.ttf")
FONT_UR = "c:/Users/Abrar/github/private/learnurduqurandaily/fonts/NotoNastaliqUrdu-VariableFont_wght.ttf"

FONT_DIR_EN = "c:/Users/Abrar/github/private/learnqurandaily/fonts"
FONT_EN_BOLD = os.path.join(FONT_DIR_EN, "MONTSERRAT-BOLD.TTF")
FONT_EN = os.path.join(FONT_DIR_EN, "Montserrat-VariableFont_wght.ttf")

OUTPUT_DIR = "output_videos_urdu"
TEMP_DIR = "temp_urdu"

URDU_AUDIO_BASE = "https://cdn.islamic.network/quran/audio/64/ur.khan"
TOTAL_QURAN_AYAHS = 6236
PAUSE_AFTER_AYAH = 0.3  # seconds of silence between ayahs

FFMPEG = get_ffmpeg_exe()
SESSION = requests.Session()

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)

# Arabic-Indic numeral mapping for verse-end markers
_WESTERN_TO_ARABIC_INDIC = str.maketrans('0123456789', '٠١٢٣٤٥٦٧٨٩')

def _verse_end_marker(ayah_num: int) -> str:
    """Return ornate parentheses with Arabic-Indic ayah number: ﴿٢٥﴾"""
    return '﴿' + str(ayah_num).translate(_WESTERN_TO_ARABIC_INDIC) + '﴾'


# ─── API (batch) ────────────────────────────────────────────────────────────

def fetch_all_chapters():
    """Fetch all chapter metadata in one call. Returns dict keyed by chapter id."""
    try:
        resp = SESSION.get("https://api.quran.com/api/v4/chapters", timeout=15)
        resp.raise_for_status()
    except Exception as e:
        print(f"\n[FATAL] Failed to fetch chapter metadata: {e}")
        sys.exit(1)
    chapters = {}
    for ch in resp.json()["chapters"]:
        chapters[ch["id"]] = {
            "name_simple": ch.get("name_simple", ""),
            "name_arabic": ch.get("name_arabic", ""),
            "translated_name": ch.get("translated_name", {}).get("name", ""),
            "verses_count": ch.get("verses_count", 0),
        }
    return chapters


def fetch_surah_ayahs(surah, verses_count):
    """Fetch ALL ayahs for a surah: Uthmani Arabic + Urdu translation."""
    # 1. Fetch Uthmani Arabic text from quran.com API (batch, paginated)
    arabic_map = {}
    page = 1
    per_page = 50
    while len(arabic_map) < verses_count:
        url = (
            f"https://api.quran.com/api/v4/quran/verses/uthmani"
            f"?chapter_number={surah}"
        )
        try:
            resp = SESSION.get(url, timeout=30)
            resp.raise_for_status()
        except Exception as e:
            print(f"\n[FATAL] Failed to fetch Arabic text for Surah {surah}: {e}")
            sys.exit(1)
        for v in resp.json()["verses"]:
            ayah_num = int(v["verse_key"].split(":")[1])
            arabic_map[ayah_num] = v.get("text_uthmani", "")
        break  # This endpoint returns all verses at once

    if len(arabic_map) < verses_count:
        print(f"\n[FATAL] Arabic text incomplete for Surah {surah}: got {len(arabic_map)}/{verses_count}")
        sys.exit(1)

    # 2. Fetch Urdu translation (batch from alquran.cloud)
    urdu_map = {}
    try:
        resp = SESSION.get(
            f"https://api.alquran.cloud/v1/surah/{surah}/ur.jalandhry",
            timeout=30,
        )
        resp.raise_for_status()
    except Exception as e:
        print(f"\n[FATAL] Failed to fetch Urdu translation for Surah {surah}: {e}")
        sys.exit(1)
    for ayah in resp.json()["data"]["ayahs"]:
        urdu_map[ayah["numberInSurah"]] = ayah["text"]

    # 3. Combine (append verse-end marker to Arabic text)
    ayahs = []
    for num in range(1, verses_count + 1):
        ar = arabic_map.get(num, "")
        ur = urdu_map.get(num, "")
        ayahs.append({
            "key": f"{surah}:{num}",
            "number": num,
            "arabic": ar + _verse_end_marker(num),
            "urdu": ur,
        })
    return ayahs


# ─── AUDIO (Urdu reciter: ur.khan) ─────────────────────────────────────────────────

def _cumulative_ayah_number(surah, ayah_num):
    """Return the global ayah number (1-6236) for a given surah:ayah."""
    # Pre-computed verse counts for surahs 1-114
    _VERSE_COUNTS = [
        7,286,200,176,120,165,206,75,129,109,123,111,43,52,99,128,111,
        110,98,135,112,78,118,64,77,227,93,88,69,60,34,30,73,54,45,83,
        182,88,75,85,54,53,89,59,37,35,38,88,52,77,28,76,96,18,21,45,
        30,20,14,37,40,52,38,11,18,42,11,98,5,8,12,5,4,8,16,75,13,
        19,17,7,5,4,5,6,8,3,6,3,8,29,11,5,5,6,8,3,6,3,11,8,5,4,
    ]
    return sum(_VERSE_COUNTS[:surah - 1]) + ayah_num


def _download_one_urdu(surah, ayah_num, total_ayahs_surah):
    """Download a single Urdu ayah audio file. Thread-safe."""
    global_num = _cumulative_ayah_number(surah, ayah_num)
    fname = f"ur_khan_{global_num}.mp3"
    path = os.path.join(TEMP_DIR, fname)
    if not os.path.exists(path) or os.path.getsize(path) < 500:
        url = f"{URDU_AUDIO_BASE}/{global_num}.mp3"
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
    return ayah_num, path


def download_urdu_audio(surah, ayah_numbers):
    """Download all Urdu ayah audio files in parallel. Returns {ayah_num: path}."""
    results = {}
    fn = partial(_download_one_urdu, surah, total_ayahs_surah=len(ayah_numbers))
    try:
        with ThreadPoolExecutor(max_workers=8) as pool:
            for ayah_num, path in pool.map(fn, ayah_numbers):
                results[ayah_num] = path
    except Exception as e:
        print(f"\n[FATAL] Failed to download Urdu audio for Surah {surah}: {e}")
        sys.exit(1)
    # Validate all files exist
    for num in ayah_numbers:
        if num not in results or not os.path.exists(results[num]) or os.path.getsize(results[num]) < 500:
            print(f"\n[FATAL] Missing or empty audio for Surah {surah}:{num}")
            sys.exit(1)
    return results


def get_audio_duration(path):
    result = subprocess.run([FFMPEG, "-i", path, "-hide_banner"],
                            capture_output=True, text=True)
    m = re.search(r"Duration:\s*(\d+):(\d+):(\d+\.\d+)", result.stderr)
    if m:
        return int(m.group(1)) * 3600 + int(m.group(2)) * 60 + float(m.group(3))
    return 5


# ─── FRAME RENDERING ────────────────────────────────────────────────────────

def render_frame(ayah, surah_num, surah_meta, cum_offset, out_path):
    """Render a single ayah frame (Arabic + Urdu) to JPEG."""
    img = WandImage(filename=BG_IMAGE)
    img.resize(WIDTH, HEIGHT)
    img.depth = 32

    # Darken
    d0 = Drawing()
    d0.fill_color = Color("rgba(0, 0, 0, 0.35)")
    d0.rectangle(left=0, top=0, width=WIDTH, height=HEIGHT)
    d0(img)

    draw = Drawing()

    # Dynamic Arabic font size
    ck = Drawing()
    ck.font = FONT_AR
    ck.font_size = 55
    ar_w = ck.get_font_metrics(img, ayah["arabic"], True).text_width
    if ar_w > 3500:
        ar_fs = 40
    elif ar_w > 2500:
        ar_fs = 48
    elif ar_w > 1500:
        ar_fs = 55
    else:
        ar_fs = 62

    # Urdu font size (slightly smaller than Arabic)
    ur_fs = max(26, ar_fs - 16)

    GOLD = Color("#FFD700")

    # ─── Title ───
    draw.font = FONT_AR
    draw.font_size = 58
    draw.fill_color = GOLD
    w = draw.get_font_metrics(img, surah_meta["name_arabic"], True).text_width
    draw.text(int((WIDTH - w) / 2), 90, surah_meta["name_arabic"])

    draw.font = FONT_EN_BOLD
    draw.font_size = 24
    draw.fill_color = GOLD
    en_name = f"{surah_meta['name_simple']} ({surah_meta['translated_name']})"
    w = draw.get_font_metrics(img, en_name, True).text_width
    draw.text(int((WIDTH - w) / 2), 130, en_name)

    draw.font = FONT_EN_BOLD
    draw.font_size = 20
    draw.fill_color = Color("#FFFFFF")
    ref = f"Surah {surah_num} : Ayah {ayah['number']}"
    w = draw.get_font_metrics(img, ref, True).text_width
    draw.text(int((WIDTH - w) / 2), 158, ref)

    # ─── Progress bar ───
    pos = cum_offset + ayah["number"]
    pct = round((pos / TOTAL_QURAN_AYAHS) * 100, 2)
    bar_w, bar_h = 800, 8
    bar_x = (WIDTH - bar_w) // 2
    bar_y = 182
    filled = max(1, int((pos / TOTAL_QURAN_AYAHS) * bar_w))

    draw.fill_color = Color("rgba(166, 166, 166, 0.5)")
    draw.rectangle(left=bar_x, top=bar_y, width=bar_w, height=bar_h)
    draw.fill_color = GOLD
    draw.rectangle(left=bar_x, top=bar_y, width=filled, height=bar_h)

    draw.font = FONT_EN_BOLD
    draw.font_size = 16
    draw.fill_color = Color("#FFFFFF")
    pt = f"Quran Completion: {pct}%"
    w = draw.get_font_metrics(img, pt, True).text_width
    draw.text(int((WIDTH - w) / 2), bar_y + 26, pt)

    # ─── Wrap text ───
    max_tw = WIDTH - 300
    ar_line_sp = 22
    ur_line_sp = 18
    sep_gap = 80

    ar_lines = _wrap(img, FONT_AR, ar_fs, ayah["arabic"], max_tw)
    ur_lines = _wrap(img, FONT_UR, ur_fs, ayah["urdu"], max_tw)

    # Vertical centering (leave room for footer)
    ar_h = len(ar_lines) * (ar_fs + ar_line_sp)
    ur_h = len(ur_lines) * (ur_fs + ur_line_sp)
    total_h = ar_h + sep_gap + ur_h
    top, bottom = 230, HEIGHT - 120
    y = top + max(0, (bottom - top - total_h) // 2)

    # Arabic text (UthmanicHafs — italic)
    draw.font = FONT_AR
    draw.font_size = ar_fs
    draw.font_style = 'italic'
    draw.fill_color = Color("#FFFFFF")
    for line in ar_lines:
        lw = draw.get_font_metrics(img, line, True).text_width
        draw.text(int((WIDTH - lw) / 2), int(y), line)
        y += ar_fs + ar_line_sp

    draw.font_style = 'normal'  # reset italic

    # Separator
    y += 10
    draw.fill_color = Color("rgba(255, 255, 255, 0.3)")
    draw.rectangle(left=400, top=int(y), width=WIDTH - 800, height=1)
    y += sep_gap

    # Urdu text (NotoNastaliqUrdu — RTL, centered)
    draw.font = FONT_UR
    draw.font_size = ur_fs
    draw.fill_color = Color("rgba(220, 220, 220, 1.0)")
    for line in ur_lines:
        lw = draw.get_font_metrics(img, line, True).text_width
        draw.text(int((WIDTH - lw) / 2), int(y), line)
        y += ur_fs + ur_line_sp

    # Footer
    _draw_footer(draw, img)

    draw(img)

    img.compression_quality = 92
    img.save(filename=out_path)
    img.close()
    return out_path


def _draw_footer(draw, img):
    iw, ih = img.width, img.height
    draw.font = FONT_EN_BOLD
    draw.font_size = 20
    draw.fill_color = Color("#FFFFFF")
    line1 = "Learn Quranic grammar and memorize Quran on"
    w1 = draw.get_font_metrics(img, line1, True).text_width
    draw.text(int((iw - w1) / 2), ih - 90, line1)

    draw.fill_color = Color("#FFD700")
    line2 = "My Quran Quest"
    w2 = draw.get_font_metrics(img, line2, True).text_width
    draw.text(int((iw - w2) / 2), ih - 65, line2)

    draw.font_size = 16
    draw.fill_color = Color("#999999")
    line3 = "(Download the app now - link in description)"
    w3 = draw.get_font_metrics(img, line3, True).text_width
    draw.text(int((iw - w3) / 2), ih - 42, line3)


def _wrap(img, font, font_size, text, max_width):
    d = Drawing()
    d.font = font
    d.font_size = font_size
    words = text.split()
    lines, current = [], ""
    for word in words:
        test = f"{current} {word}".strip()
        if d.get_font_metrics(img, test, True).text_width < max_width:
            current = test
        else:
            if current:
                lines.append(current)
            current = word
    if current:
        lines.append(current)
    return lines


# ─── VIDEO BUILD ────────────────────────────────────────────────────────────

def build_surah_video(surah_num, surah_meta, chapters, ayahs, audio_paths):
    """
    Per-ayah clip approach — perfect sync guaranteed:
    1. Render each ayah frame
    2. For each ayah: still image + ayah audio → short clip (+ silence gap)
    3. Concat all clips into final surah video
    """
    surah_dir = os.path.join(TEMP_DIR, f"s{surah_num}")
    os.makedirs(surah_dir, exist_ok=True)

    cum_offset = sum(chapters[s]["verses_count"] for s in range(1, surah_num))

    # ── 1. Render frames ──
    t0 = time.time()
    frame_paths = []
    for i, ayah in enumerate(ayahs):
        fp = os.path.join(surah_dir, f"f_{ayah['number']:03d}.jpg")
        render_frame(ayah, surah_num, surah_meta, cum_offset, fp)
        frame_paths.append(fp)
        if (i + 1) % 20 == 0 or i == len(ayahs) - 1:
            print(f"    Frames: {i + 1}/{len(ayahs)}", flush=True)
    print(f"    Frames done in {time.time() - t0:.1f}s")

    # ── 2. Build per-ayah clips ──
    t1 = time.time()
    clip_paths = []
    total_dur = 0
    for i, (ayah, fp) in enumerate(zip(ayahs, frame_paths)):
        ap = audio_paths[ayah["number"]]
        # Pad audio with silence gap
        padded = os.path.join(surah_dir, f"a_{ayah['number']:03d}.mp3")
        pad_audio_with_silence(ap, padded, PAUSE_AFTER_AYAH)

        clip = os.path.join(surah_dir, f"clip_{ayah['number']:03d}.mp4")
        subprocess.run([
            FFMPEG, "-y",
            "-loop", "1", "-i", fp,
            "-i", padded,
            "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
            "-c:a", "aac", "-b:a", "192k",
            "-pix_fmt", "yuv420p",
            "-shortest",
            clip,
        ], capture_output=True, check=True)
        clip_paths.append(clip)
        dur = get_audio_duration(padded)
        total_dur += dur

        if (i + 1) % 20 == 0 or i == len(ayahs) - 1:
            print(f"    Clips: {i + 1}/{len(ayahs)}", flush=True)
    print(f"    Clips done in {time.time() - t1:.1f}s ({total_dur:.0f}s / {total_dur / 60:.1f}m)")

    # ── 3. Concat all clips ──
    concat_list = os.path.join(surah_dir, "concat_list.txt")
    with open(concat_list, "w") as f:
        for cp in clip_paths:
            f.write(f"file '{os.path.abspath(cp).replace(chr(92), '/')}'\n")

    output = os.path.join(OUTPUT_DIR, f"surah_{surah_num:03d}_urdu.mp4")
    t2 = time.time()
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", concat_list,
        "-c", "copy",
        output,
    ], capture_output=True, check=True)
    print(f"    Concat: {time.time() - t2:.1f}s → {output} ({total_dur:.0f}s / {total_dur / 60:.1f}m)")

    # ── 4. Thumbnail ──
    thumb_dir = os.path.join(OUTPUT_DIR, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    thumb_path = os.path.join(thumb_dir, f"surah_{surah_num:03d}_urdu.jpg")
    render_thumbnail(surah_num, surah_meta, thumb_path)
    print(f"    Thumbnail: {thumb_path}")

    return output, total_dur


def pad_audio_with_silence(audio_path, padded_path, pause):
    """Append silence to an audio file. Returns actual padded duration."""
    dur = get_audio_duration(audio_path)
    total = dur + pause
    subprocess.run([
        FFMPEG, "-y",
        "-i", audio_path,
        "-af", f"apad=pad_dur={pause}",
        "-t", f"{total:.4f}",
        "-c:a", "libmp3lame", "-b:a", "192k",
        padded_path,
    ], capture_output=True, check=True)
    # Return actual file duration to avoid cumulative drift
    return get_audio_duration(padded_path)


def render_thumbnail(surah_num, surah_meta, out_path):
    """Render a YouTube-style thumbnail."""
    img = WandImage(filename=BG_IMAGE)
    img.resize(WIDTH, HEIGHT)
    img.depth = 32

    d0 = Drawing()
    d0.fill_color = Color("rgba(0, 0, 0, 0.45)")
    d0.rectangle(left=0, top=0, width=WIDTH, height=HEIGHT)
    d0(img)

    draw = Drawing()
    cx = WIDTH // 2

    # Arabic surah name
    draw.font = FONT_AR
    draw.font_size = 180
    draw.fill_color = Color("#FFFFFF")
    name_ar = surah_meta["name_arabic"]
    w = draw.get_font_metrics(img, name_ar, True).text_width
    draw.text(int(cx - w / 2), 320, name_ar)

    # English name + translation
    draw.font = FONT_EN_BOLD
    draw.font_size = 68
    draw.fill_color = Color("#FFFFFF")
    name_en = f"{surah_meta['name_simple']} ({surah_meta['translated_name']})"
    w = draw.get_font_metrics(img, name_en, True).text_width
    draw.text(int(cx - w / 2), 420, name_en)

    # Surah info
    draw.font = FONT_EN_BOLD
    draw.font_size = 44
    draw.fill_color = Color("rgba(200, 200, 200, 1.0)")
    info = f"Surah {surah_num}  •  {surah_meta['verses_count']} Ayahs"
    w = draw.get_font_metrics(img, info, True).text_width
    draw.text(int(cx - w / 2), 490, info)

    # Reciter
    draw.font = FONT_EN_BOLD
    draw.font_size = 38
    draw.fill_color = Color("rgba(200, 200, 200, 1.0)")
    reciter = "Urdu Recitation by Fateh Muhammad Jalandhry"
    w = draw.get_font_metrics(img, reciter, True).text_width
    draw.text(int(cx - w / 2), 580, reciter)

    # Urdu translator
    draw.font = FONT_EN_BOLD
    draw.font_size = 34
    draw.fill_color = Color("rgba(170, 170, 170, 1.0)")
    credit = "Urdu Translation by Fateh Muhammad Jalandhry"
    w = draw.get_font_metrics(img, credit, True).text_width
    draw.text(int(cx - w / 2), 640, credit)

    # Urdu label
    draw.font = FONT_UR
    draw.font_size = 48
    draw.fill_color = Color("rgba(200, 200, 200, 1.0)")
    urdu_label = "اردو ترجمہ کے ساتھ"
    w = draw.get_font_metrics(img, urdu_label, True).text_width
    draw.text(int(cx - w / 2), 720, urdu_label)

    draw(img)
    img.compression_quality = 95
    img.save(filename=out_path)
    img.close()


# ─── ENTRY POINTS ──────────────────────────────────────────────────────────

def preview(surah_num, ayah_num=1):
    """Generate a single preview frame for a specific ayah."""
    print(f"Generating preview for Surah {surah_num}, Ayah {ayah_num}...")
    chapters = fetch_all_chapters()
    meta = chapters[surah_num]
    ayahs = fetch_surah_ayahs(surah_num, meta["verses_count"])
    target = [a for a in ayahs if a["number"] == ayah_num]
    if not target:
        print(f"Ayah {ayah_num} not found in Surah {surah_num}")
        return
    cum_offset = sum(chapters[s]["verses_count"] for s in range(1, surah_num))
    fp = os.path.join(OUTPUT_DIR, f"preview_urdu_{surah_num}_{ayah_num}.jpg")
    render_frame(target[0], surah_num, meta, cum_offset, fp)
    print(f"Preview saved: {fp}")


def _generate_one_surah(surah_num, chapters, ayah_range=None, skip_existing=False):
    """Generate a single surah video. Returns (surah_num, output_path, duration) or None."""
    meta = chapters[surah_num]
    vc = meta["verses_count"]

    # Skip if already exists
    if skip_existing:
        out = os.path.join(OUTPUT_DIR, f"surah_{surah_num:03d}_urdu.mp4")
        if os.path.exists(out) and os.path.getsize(out) > 10000:
            print(f"  [SKIP] Surah {surah_num} already exists", flush=True)
            return (surah_num, out, 0)

    print(f"\n{'─' * 60}", flush=True)
    print(f"  Surah {surah_num}: {meta['name_simple']} ({vc} ayahs)", flush=True)
    print(f"{'─' * 60}", flush=True)

    print(f"  Fetching text (Arabic + Urdu)...", flush=True)
    ayahs = fetch_surah_ayahs(surah_num, vc)
    if ayah_range:
        a_start, a_end = ayah_range
        ayahs = [a for a in ayahs if a_start <= a["number"] <= a_end]
    print(f"    {len(ayahs)} ayahs fetched", flush=True)

    print(f"  Downloading Urdu audio (ur.khan)...", flush=True)
    t0 = time.time()
    audio_paths = download_urdu_audio(surah_num, [a["number"] for a in ayahs])
    print(f"    Done in {time.time() - t0:.1f}s", flush=True)

    print(f"  Building video...", flush=True)
    output, dur = build_surah_video(surah_num, meta, chapters, ayahs, audio_paths)
    return (surah_num, output, dur)


def generate_surahs(surah_list, ayah_range=None, workers=1, skip_existing=False):
    """Generate videos for a list of surah numbers."""
    t_start = time.time()

    print("=" * 60)
    print(f"Quran Video Generator (Urdu) — {len(surah_list)} surah(s), {workers} worker(s)")
    print("Reciter: Fateh Muhammad Jalandhry (ur.khan)")
    print("Translation: Fateh Muhammad Jalandhry (Urdu)")
    print("Audio: Per-ayah Urdu from alquran.cloud, concatenated")
    print("=" * 60)

    print("\n[1] Fetching chapter metadata...", flush=True)
    chapters = fetch_all_chapters()

    # Pre-fetch ALL text + audio for every surah first (fail-fast)
    print(f"\n[2] Pre-fetching text & audio for {len(surah_list)} surahs...", flush=True)
    surah_data = {}
    for idx, surah_num in enumerate(surah_list, 1):
        meta = chapters[surah_num]
        vc = meta["verses_count"]

        if skip_existing:
            out = os.path.join(OUTPUT_DIR, f"surah_{surah_num:03d}_urdu.mp4")
            if os.path.exists(out) and os.path.getsize(out) > 10000:
                print(f"  [{idx}/{len(surah_list)}] Surah {surah_num} — SKIP (exists)", flush=True)
                continue

        print(f"  [{idx}/{len(surah_list)}] Surah {surah_num} ({vc} ayahs) — fetching...", flush=True)
        ayahs = fetch_surah_ayahs(surah_num, vc)
        if ayah_range:
            a_start, a_end = ayah_range
            ayahs = [a for a in ayahs if a_start <= a["number"] <= a_end]
        audio_paths = download_urdu_audio(surah_num, [a["number"] for a in ayahs])
        surah_data[surah_num] = (ayahs, audio_paths)

    print(f"\n  All data fetched OK — {len(surah_data)} surahs to render", flush=True)

    # Now render videos (parallelizable — no more API calls)
    print(f"\n[3] Rendering videos ({workers} workers)...", flush=True)

    def _render_one(surah_num):
        meta = chapters[surah_num]
        ayahs, audio_paths = surah_data[surah_num]
        print(f"\n  Surah {surah_num}: {meta['name_simple']} ({len(ayahs)} ayahs)", flush=True)
        output, dur = build_surah_video(surah_num, meta, chapters, ayahs, audio_paths)
        return (surah_num, output, dur)

    results = []
    render_list = list(surah_data.keys())
    if workers <= 1:
        for sn in render_list:
            results.append(_render_one(sn))
    else:
        from concurrent.futures import as_completed
        with ThreadPoolExecutor(max_workers=workers) as pool:
            futures = {pool.submit(_render_one, sn): sn for sn in render_list}
            for fut in as_completed(futures):
                sn = futures[fut]
                try:
                    results.append(fut.result())
                except Exception as e:
                    print(f"\n[FATAL] Surah {sn} failed: {e}", flush=True)
                    sys.exit(1)

    elapsed = time.time() - t_start
    print(f"\n{'=' * 60}")
    print(f"ALL DONE — {len(results)} surahs in {elapsed:.0f}s ({elapsed / 60:.1f} min)")
    print(f"{'=' * 60}")


# ─── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quran YouTube Video Generator — Urdu")
    parser.add_argument("--preview", type=str, metavar="SURAH[:AYAH]",
                        help="Preview a specific ayah (e.g. 2 or 2:255)")
    parser.add_argument("--surah", type=int, metavar="N",
                        help="Generate full video for surah N")
    parser.add_argument("--range", type=str, metavar="A-B",
                        help="Generate surahs A through B (e.g. 1-10)")
    parser.add_argument("--all", action="store_true",
                        help="Generate all 114 surahs")
    parser.add_argument("--ayahs", type=str, metavar="A-B",
                        help="Limit to ayahs A through B (e.g. 1-5)")
    parser.add_argument("--workers", type=int, default=1,
                        help="Parallel surah workers (default 1). Use 2-3 for faster batch.")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip surahs that already have a video")
    args = parser.parse_args()

    ayah_range = None
    if args.ayahs:
        a, b = map(int, args.ayahs.split("-"))
        ayah_range = (a, b)

    if args.preview:
        if ':' in args.preview:
            s, a = map(int, args.preview.split(':'))
            preview(s, a)
        else:
            preview(int(args.preview))
    elif args.surah:
        generate_surahs([args.surah], ayah_range, args.workers, args.skip_existing)
    elif args.range:
        a, b = map(int, args.range.split("-"))
        generate_surahs(list(range(a, b + 1)), ayah_range, args.workers, args.skip_existing)
    elif args.all:
        generate_surahs(list(range(1, 115)), ayah_range, args.workers, args.skip_existing)
    else:
        generate_surahs([2], ayah_range, args.workers, args.skip_existing)
