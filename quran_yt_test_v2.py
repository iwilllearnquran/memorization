"""
Quran YouTube Video Generator
Reciter: Mishary Alafasy

Usage:
  py quran_yt_test_v2.py --preview 2          # Preview first ayah of surah 2
  py quran_yt_test_v2.py --surah 2             # Full video for surah 2
  py quran_yt_test_v2.py --all                 # All 114 surahs
  py quran_yt_test_v2.py --range 1-10          # Surahs 1 through 10

Speed optimizations:
  - Batch API (1 call per surah, not per ayah)
  - Parallel audio downloads (ThreadPool, 10 workers)
  - JPEG temp frames (faster writes than PNG)
  - ultrafast preset, 1fps for still images
  - Stream-copy concat (instant final merge)
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
BG_IMAGE = "c:/Users/Abrar/github/private/memorization/background/yt_background.png"

FONT_DIR = "c:/Users/Abrar/github/private/learnqurandaily/fonts"
FONT_AR = os.path.join(FONT_DIR, "PDMS_SALEEM_QURANFONTQESHIP_0.ttf")
FONT_EN_BOLD = os.path.join(FONT_DIR, "MONTSERRAT-BOLD.TTF")
FONT_EN = os.path.join(FONT_DIR, "Montserrat-VariableFont_wght.ttf")

OUTPUT_DIR = "output_videos"
TEMP_DIR = "temp"

AUDIO_BASE = "https://everyayah.com/data/Alafasy_128kbps"
TOTAL_QURAN_AYAHS = 6236
PAUSE_AFTER_AYAH = 1.5  # seconds of silence after each ayah

FFMPEG = get_ffmpeg_exe()
SESSION = requests.Session()  # reuse connections

os.makedirs(OUTPUT_DIR, exist_ok=True)
os.makedirs(TEMP_DIR, exist_ok=True)


# ─── API (batch) ────────────────────────────────────────────────────────────

def fetch_all_chapters():
    """Fetch all chapter metadata in one call. Returns dict keyed by chapter id."""
    resp = SESSION.get("https://api.quran.com/api/v4/chapters", timeout=15)
    resp.raise_for_status()
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
    """Fetch ALL ayahs for a surah in one API call (batch, paginated if needed)."""
    ayahs = []
    page = 1
    per_page = 50  # API max per page
    while len(ayahs) < verses_count:
        url = (
            f"https://api.quran.com/api/v4/verses/by_chapter/{surah}"
            f"?language=en&translations=20&fields=text_indopak"
            f"&per_page={per_page}&page={page}"
        )
        resp = SESSION.get(url, timeout=30)
        resp.raise_for_status()
        data = resp.json()
        for v in data["verses"]:
            en = ""
            if v.get("translations"):
                en = re.sub(r"<[^>]+>", "", v["translations"][0]["text"])
                # Strip footnote numbers (e.g. "Ever-Living,1" → "Ever-Living,")
                en = re.sub(r'(?<=[.,;:\)])\d+', '', en)
                # Also strip standalone superscript-style numbers at word boundaries
                en = re.sub(r'(?<=\w)\d+(?=\s|$)', '', en)
            # Strip waqf/pause marks (U+06D6–U+06DC) and end-of-ayah (U+06DD)
            ar = v.get("text_indopak", "")
            ar = re.sub(r'[\u06D6-\u06DD\u06DE\u06DF\u0615-\u061A]', '', ar)
            ar = re.sub(r'\s{2,}', ' ', ar).strip()

            ayahs.append({
                "key": v["verse_key"],
                "number": v["verse_number"],
                "arabic": ar,
                "english": en,
            })
        if len(data["verses"]) < per_page:
            break
        page += 1
    return ayahs


# ─── AUDIO (parallel) ──────────────────────────────────────────────────────

def _download_one(surah, ayah_num):
    """Download a single ayah audio file. Thread-safe."""
    fname = f"{surah:03d}{ayah_num:03d}.mp3"
    path = os.path.join(TEMP_DIR, fname)
    if not os.path.exists(path):
        url = f"{AUDIO_BASE}/{fname}"
        r = requests.get(url, timeout=30)
        r.raise_for_status()
        with open(path, "wb") as f:
            f.write(r.content)
    return ayah_num, path


def download_all_audio(surah, ayah_numbers):
    """Download all ayah audio files in parallel. Returns {ayah_num: path}."""
    results = {}
    fn = partial(_download_one, surah)
    with ThreadPoolExecutor(max_workers=10) as pool:
        for ayah_num, path in pool.map(fn, ayah_numbers):
            results[ayah_num] = path
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
    """Render a single ayah frame to JPEG."""
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
    ck.font_size = 60
    ar_w = ck.get_font_metrics(img, ayah["arabic"], True).text_width
    if ar_w > 3500:
        ar_fs = 44
    elif ar_w > 2500:
        ar_fs = 52
    elif ar_w > 1500:
        ar_fs = 60
    else:
        ar_fs = 68
    en_fs = max(22, min(28, ar_fs // 2))

    # ─── Title ───
    draw.font = FONT_AR
    draw.font_size = 58
    draw.fill_color = Color("#FFFFFF")
    w = draw.get_font_metrics(img, surah_meta["name_arabic"], True).text_width
    draw.text(int((WIDTH - w) / 2), 90, surah_meta["name_arabic"])

    draw.font = FONT_EN_BOLD
    draw.font_size = 26
    draw.fill_color = Color("#FFFFFF")
    en_name = f"{surah_meta['name_simple']} ({surah_meta['translated_name']})"
    w = draw.get_font_metrics(img, en_name, True).text_width
    draw.text(int((WIDTH - w) / 2), 132, en_name)

    draw.font = FONT_EN
    draw.font_size = 22
    draw.fill_color = Color("#FFFFFF")
    ref = f"Surah {surah_num} : Ayah {ayah['number']}"
    w = draw.get_font_metrics(img, ref, True).text_width
    draw.text(int((WIDTH - w) / 2), 164, ref)

    # ─── Progress bar ───
    pos = cum_offset + ayah["number"]
    pct = round((pos / TOTAL_QURAN_AYAHS) * 100, 2)
    bar_w, bar_h = 800, 8
    bar_x = (WIDTH - bar_w) // 2
    bar_y = 192
    filled = max(1, int((pos / TOTAL_QURAN_AYAHS) * bar_w))

    draw.fill_color = Color("rgba(166, 166, 166, 0.5)")
    draw.rectangle(left=bar_x, top=bar_y, width=bar_w, height=bar_h)
    draw.fill_color = Color("#FFFFFF")
    draw.rectangle(left=bar_x, top=bar_y, width=filled, height=bar_h)

    draw.font = FONT_EN
    draw.font_size = 18
    draw.fill_color = Color("#FFFFFF")
    pt = f"Quran Completion: {pct}%"
    w = draw.get_font_metrics(img, pt, True).text_width
    draw.text(int((WIDTH - w) / 2), bar_y + 28, pt)

    # ─── Wrap text ───
    max_tw = WIDTH - 300
    ar_line_sp, en_line_sp, sep_gap = 25, 14, 50

    ar_lines = _wrap(img, FONT_AR, ar_fs, ayah["arabic"], max_tw)
    en_lines = _wrap(img, FONT_EN_BOLD, en_fs, ayah["english"], max_tw)

    # Vertical centering
    ar_h = len(ar_lines) * (ar_fs + ar_line_sp)
    en_h = len(en_lines) * (en_fs + en_line_sp)
    total_h = ar_h + sep_gap + en_h
    top, bottom = 245, HEIGHT - 40
    y = top + max(0, (bottom - top - total_h) // 2)

    # Arabic (no font_weight — avoids italic on some ImageMagick builds)
    draw.font = FONT_AR
    draw.font_size = ar_fs
    draw.fill_color = Color("#FFFFFF")
    for line in ar_lines:
        lw = draw.get_font_metrics(img, line, True).text_width
        draw.text(int((WIDTH - lw) / 2), int(y), line)
        y += ar_fs + ar_line_sp

    # Separator
    y += 10
    draw.fill_color = Color("rgba(255, 255, 255, 0.3)")
    draw.rectangle(left=400, top=int(y), width=WIDTH - 800, height=1)
    y += sep_gap

    # English (Montserrat Bold font — inherently bold, no font_weight needed)
    draw.font = FONT_EN_BOLD
    draw.font_size = en_fs
    draw.fill_color = Color("rgba(200, 200, 200, 1.0)")
    for line in en_lines:
        lw = draw.get_font_metrics(img, line, True).text_width
        draw.text(int((WIDTH - lw) / 2), int(y), line)
        y += en_fs + en_line_sp

    draw(img)

    img.compression_quality = 92
    img.save(filename=out_path)
    img.close()
    return out_path


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


# ─── FFMPEG ─────────────────────────────────────────────────────────────────

def pad_audio_with_silence(audio_path, padded_path, pause):
    """Append silence to an audio file. Returns padded duration."""
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
    return total


def build_surah_video(surah_num, surah_meta, chapters, ayahs, audio_paths):
    """
    Single-pass encoding per surah (much faster than per-ayah):
    1. Render frames sequentially
    2. Pad each audio with silence, concat into one audio file
    3. Create frame concat list with durations matching padded audio
    4. One ffmpeg call: frame concat + combined audio → final mp4
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

    # ── 2. Pad audio + build concat lists ──
    t1 = time.time()
    audio_concat = os.path.join(surah_dir, "audio_list.txt")
    frame_concat = os.path.join(surah_dir, "frame_list.txt")
    total_dur = 0

    with open(audio_concat, "w") as af, open(frame_concat, "w") as ff:
        for i, (ayah, fp) in enumerate(zip(ayahs, frame_paths)):
            ap = audio_paths[ayah["number"]]
            padded = os.path.join(surah_dir, f"a_{ayah['number']:03d}.mp3")
            dur = pad_audio_with_silence(ap, padded, PAUSE_AFTER_AYAH)
            total_dur += dur

            abs_fp = os.path.abspath(fp).replace("\\", "/")
            abs_ap = os.path.abspath(padded).replace("\\", "/")

            af.write(f"file '{abs_ap}'\n")
            ff.write(f"file '{abs_fp}'\n")
            ff.write(f"duration {dur:.4f}\n")

            if (i + 1) % 50 == 0 or i == len(ayahs) - 1:
                print(f"    Audio pad: {i + 1}/{len(ayahs)}", flush=True)

        # Concat demuxer needs last file repeated
        ff.write(f"file '{os.path.abspath(frame_paths[-1]).replace(chr(92), '/')}'\n")

    # ── 3. Concat all padded audio ──
    combined_audio = os.path.join(surah_dir, "combined.mp3")
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0",
        "-i", audio_concat, "-c", "copy", combined_audio,
    ], capture_output=True, check=True)
    print(f"    Audio prepared in {time.time() - t1:.1f}s")

    # ── 4. Single-pass encode ──
    output = os.path.join(OUTPUT_DIR, f"surah_{surah_num:03d}.mp4")
    t2 = time.time()
    subprocess.run([
        FFMPEG, "-y",
        "-f", "concat", "-safe", "0", "-i", frame_concat,
        "-i", combined_audio,
        "-c:v", "libx264", "-preset", "ultrafast", "-tune", "stillimage",
        "-c:a", "aac", "-b:a", "192k",
        "-pix_fmt", "yuv420p",
        "-r", "1",
        "-shortest",
        output,
    ], capture_output=True, check=True)
    print(f"    Encode: {time.time() - t2:.1f}s → {output} ({total_dur:.0f}s / {total_dur / 60:.1f}m)")

    # ── 5. Thumbnail ──
    thumb_dir = os.path.join(OUTPUT_DIR, "thumbnails")
    os.makedirs(thumb_dir, exist_ok=True)
    thumb_path = os.path.join(thumb_dir, f"surah_{surah_num:03d}.jpg")
    render_thumbnail(surah_num, surah_meta, thumb_path)
    print(f"    Thumbnail: {thumb_path}")

    return output, total_dur


def render_thumbnail(surah_num, surah_meta, out_path):
    """Render a YouTube-style thumbnail with proper spacing."""
    img = WandImage(filename=BG_IMAGE)
    img.resize(WIDTH, HEIGHT)
    img.depth = 32

    # Darken for readability
    d0 = Drawing()
    d0.fill_color = Color("rgba(0, 0, 0, 0.45)")
    d0.rectangle(left=0, top=0, width=WIDTH, height=HEIGHT)
    d0(img)

    draw = Drawing()
    cx = WIDTH // 2

    # ── Arabic surah name (big, centered) ──
    draw.font = FONT_AR
    draw.font_size = 180
    draw.fill_color = Color("#FFFFFF")
    name_ar = surah_meta["name_arabic"]
    w = draw.get_font_metrics(img, name_ar, True).text_width
    draw.text(int(cx - w / 2), 360, name_ar)

    # ── English name + translation ──
    draw.font = FONT_EN_BOLD
    draw.font_size = 68
    draw.fill_color = Color("#FFFFFF")
    name_en = f"{surah_meta['name_simple']} ({surah_meta['translated_name']})"
    w = draw.get_font_metrics(img, name_en, True).text_width
    draw.text(int(cx - w / 2), 460, name_en)

    # ── Surah info line ──
    draw.font = FONT_EN_BOLD
    draw.font_size = 44
    draw.fill_color = Color("rgba(200, 200, 200, 1.0)")
    info = f"Surah {surah_num}  •  {surah_meta['verses_count']} Ayahs"
    w = draw.get_font_metrics(img, info, True).text_width
    draw.text(int(cx - w / 2), 530, info)

    # ── Reciter ──
    draw.font = FONT_EN_BOLD
    draw.font_size = 38
    draw.fill_color = Color("rgba(200, 200, 200, 1.0)")
    reciter = "Recitation by Mishary Rashid Alafasy"
    w = draw.get_font_metrics(img, reciter, True).text_width
    draw.text(int(cx - w / 2), 640, reciter)

    # ── Translator ──
    draw.font = FONT_EN_BOLD
    draw.font_size = 34
    draw.fill_color = Color("rgba(170, 170, 170, 1.0)")
    credit = "English Translation by Saheeh International"
    w = draw.get_font_metrics(img, credit, True).text_width
    draw.text(int(cx - w / 2), 700, credit)

    draw(img)
    img.compression_quality = 95
    img.save(filename=out_path)
    img.close()


# ─── ENTRY POINTS ──────────────────────────────────────────────────────────

def preview(surah_num):
    """Generate a single preview frame."""
    print(f"Generating preview for Surah {surah_num}...")
    chapters = fetch_all_chapters()
    meta = chapters[surah_num]
    ayahs = fetch_surah_ayahs(surah_num, 1)  # just first ayah
    cum_offset = sum(chapters[s]["verses_count"] for s in range(1, surah_num))
    fp = os.path.join(OUTPUT_DIR, "preview.jpg")
    render_frame(ayahs[0], surah_num, meta, cum_offset, fp)
    print(f"Preview saved: {fp}")


def generate_surahs(surah_list, ayah_range=None):
    """Generate videos for a list of surah numbers.
    ayah_range: optional (start, end) tuple to limit ayahs."""
    t_start = time.time()

    print("=" * 60)
    print(f"Quran Video Generator — {len(surah_list)} surah(s)")
    print("Reciter: Mishary Alafasy")
    print("=" * 60)

    # Fetch all chapter metadata once
    print("\n[1] Fetching chapter metadata...")
    chapters = fetch_all_chapters()

    for idx, surah_num in enumerate(surah_list, 1):
        meta = chapters[surah_num]
        vc = meta["verses_count"]
        print(f"\n{'─' * 60}")
        print(f"[{idx}/{len(surah_list)}] Surah {surah_num}: {meta['name_simple']} ({vc} ayahs)")
        print(f"{'─' * 60}")

        # Fetch ayah text (batch)
        print(f"  Fetching text...")
        ayahs = fetch_surah_ayahs(surah_num, vc)
        # Limit ayahs if range specified
        if ayah_range:
            a_start, a_end = ayah_range
            ayahs = [a for a in ayahs if a_start <= a["number"] <= a_end]
        print(f"    {len(ayahs)} ayahs fetched")

        # Download audio (parallel)
        print(f"  Downloading audio...")
        t0 = time.time()
        audio_paths = download_all_audio(surah_num, [a["number"] for a in ayahs])
        print(f"    Done in {time.time() - t0:.1f}s")

        # Build video
        print(f"  Building video...")
        output, dur = build_surah_video(surah_num, meta, chapters, ayahs, audio_paths)

    elapsed = time.time() - t_start
    print(f"\n{'=' * 60}")
    print(f"ALL DONE in {elapsed:.0f}s ({elapsed / 60:.1f} min)")
    print(f"{'=' * 60}")


# ─── CLI ────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Quran YouTube Video Generator")
    parser.add_argument("--preview", type=int, metavar="SURAH",
                        help="Preview first ayah of a surah")
    parser.add_argument("--surah", type=int, metavar="N",
                        help="Generate full video for surah N")
    parser.add_argument("--range", type=str, metavar="A-B",
                        help="Generate surahs A through B (e.g. 1-10)")
    parser.add_argument("--all", action="store_true",
                        help="Generate all 114 surahs")
    parser.add_argument("--ayahs", type=str, metavar="A-B",
                        help="Limit to ayahs A through B (e.g. 1-5)")
    args = parser.parse_args()

    ayah_range = None
    if args.ayahs:
        a, b = map(int, args.ayahs.split("-"))
        ayah_range = (a, b)

    if args.preview:
        preview(args.preview)
    elif args.surah:
        generate_surahs([args.surah], ayah_range)
    elif args.range:
        a, b = map(int, args.range.split("-"))
        generate_surahs(list(range(a, b + 1)), ayah_range)
    elif args.all:
        generate_surahs(list(range(1, 115)), ayah_range)
    else:
        # Default: just surah 2
        generate_surahs([2], ayah_range)
