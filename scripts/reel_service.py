#!/usr/bin/env python3
"""
Private Quran reel generator service.

Usage:
  1) Set token:  set REEL_ADMIN_TOKEN=your-secret-token
  2) Run:        python scripts/reel_service.py
  3) Open:       /_private/reel-admin.html (not linked anywhere)
"""

from __future__ import annotations

import datetime as dt
import hmac
import json
import os
import random
import re
import subprocess
import urllib.parse
from pathlib import Path
from typing import Dict, List, Tuple

import requests
from flask import Flask, jsonify, request, send_from_directory
from PIL import Image, ImageDraw, ImageFont
try:
    from wand.color import Color as WandColor
    from wand.drawing import Drawing as WandDrawing
    from wand.image import Image as WandImage
    WAND_AVAILABLE = True
    WAND_IMPORT_ERROR = ""
except Exception as e:
    WAND_AVAILABLE = False
    WAND_IMPORT_ERROR = str(e)


ROOT = Path(__file__).resolve().parents[1]
RECITE_DIR = ROOT / "build" / "recite" / "surahs"
DUAS_JSON_PATH = ROOT / "duas" / "quranwbw_duas.json"
OUTPUT_DIR = ROOT / "generated" / "reels"
TMP_DIR = OUTPUT_DIR / "_tmp"
BACKGROUND_DIR = ROOT / "background"

ADMIN_TOKEN = os.getenv("REEL_ADMIN_TOKEN", "").strip()
PORT = int(os.getenv("PORT", os.getenv("REEL_SERVICE_PORT", "8787")))
HOST = os.getenv("REEL_SERVICE_HOST", "0.0.0.0")
FFMPEG_BIN = os.getenv("FFMPEG_BIN", "ffmpeg")
FFMPEG_PRESET = os.getenv("REEL_FFMPEG_PRESET", "veryfast").strip() or "veryfast"
FFMPEG_CRF = os.getenv("REEL_FFMPEG_CRF", "25").strip() or "25"

W, H = 1080, 1920
QURAN_API_BASE = "https://api.quran.com/api/v4"
USE_REMOTE_INDOPAK = os.getenv("REEL_USE_REMOTE_INDOPAK", "1").strip() != "0"
REEL_RENDERER = os.getenv("REEL_RENDERER", "pillow").strip().lower()
METADATA_ROOT = "http://metadata.google.internal/computeMetadata/v1"
FREE_TIER_REQUESTS = int(os.getenv("REEL_FREE_TIER_REQUESTS", "2000000"))
FREE_TIER_VCPU_SECONDS = float(os.getenv("REEL_FREE_TIER_VCPU_SECONDS", "180000"))
FREE_TIER_GIB_SECONDS = float(os.getenv("REEL_FREE_TIER_GIB_SECONDS", "360000"))
ALLOCATED_VCPU = float(os.getenv("REEL_ALLOCATED_VCPU", "1"))
ALLOCATED_MEMORY_GIB = float(os.getenv("REEL_ALLOCATED_MEMORY_GIB", "0.5"))
CORS_ORIGIN = os.getenv("REEL_CORS_ORIGIN", "https://myquranquest.com").strip() or "https://myquranquest.com"


def require_token(incoming: str) -> bool:
    if not ADMIN_TOKEN or not incoming:
        return False
    return hmac.compare_digest(incoming, ADMIN_TOKEN)


def clean_text(text: str) -> str:
    text = re.sub(r"<[^>]+>", "", str(text or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text


def fetch_json(url: str, timeout: int = 20) -> Dict:
    r = requests.get(url, timeout=timeout)
    r.raise_for_status()
    return r.json()


def fetch_metadata(path: str, timeout: int = 2) -> str:
    url = f"{METADATA_ROOT}/{path.lstrip('/')}"
    r = requests.get(url, headers={"Metadata-Flavor": "Google"}, timeout=timeout)
    r.raise_for_status()
    return r.text.strip()


def get_access_token() -> str:
    payload = fetch_json(f"{METADATA_ROOT}/instance/service-accounts/default/token", timeout=3)
    return str(payload.get("access_token", "")).strip()


def query_monitoring_sum(
    project_id: str, metric_type: str, service_name: str, start_iso: str, end_iso: str
) -> float:
    raw_filter = (
        f'metric.type="{metric_type}" '
        f'AND resource.type="cloud_run_revision" '
        f'AND resource.labels.service_name="{service_name}"'
    )
    params = {
        "filter": raw_filter,
        "interval.startTime": start_iso,
        "interval.endTime": end_iso,
        "view": "FULL",
        "aggregation.alignmentPeriod": "86400s",
        "aggregation.perSeriesAligner": "ALIGN_SUM",
        "aggregation.crossSeriesReducer": "REDUCE_SUM",
    }
    query = urllib.parse.urlencode(params)
    token = get_access_token()
    url = f"https://monitoring.googleapis.com/v3/projects/{project_id}/timeSeries?{query}"
    r = requests.get(url, headers={"Authorization": f"Bearer {token}"}, timeout=15)
    r.raise_for_status()
    payload = r.json()

    total = 0.0
    for series in payload.get("timeSeries", []) or []:
        for point in series.get("points", []) or []:
            value = point.get("value", {})
            if "doubleValue" in value:
                total += float(value["doubleValue"])
            elif "int64Value" in value:
                total += float(value["int64Value"])
    return total


def load_ayah_payload_remote(surah: int, ayah: int, custom_title: str = "") -> Dict:
    verse_key = f"{surah}:{ayah}"
    arabic_url = f"{QURAN_API_BASE}/quran/verses/indopak?verse_key={verse_key}"
    chapter_url = f"{QURAN_API_BASE}/chapters/{surah}"
    english_url = f"https://api.alquran.cloud/v1/surah/{surah}/en.sahih"
    audio_url = f"{QURAN_API_BASE}/recitations/7/by_ayah/{verse_key}"

    ar_payload = fetch_json(arabic_url)
    ch_payload = fetch_json(chapter_url)
    en_payload = fetch_json(english_url)
    au_payload = fetch_json(audio_url)

    chapter = ch_payload.get("chapter", {})
    verse = (ar_payload.get("verses") or [{}])[0]
    ayahs = (en_payload.get("data") or {}).get("ayahs") or []
    en_text = next(
        (a.get("text", "") for a in ayahs if int(a.get("numberInSurah", 0)) == ayah),
        "",
    )
    audio_rel = ((au_payload.get("audio_files") or [{}])[0]).get("url", "")
    audio_ar = f"https://verses.quran.com/{audio_rel}" if audio_rel else ""

    return {
        "surah": surah,
        "ayah": ayah,
        "surah_ar": clean_text(chapter.get("name_arabic", "")),
        "surah_en": clean_text(chapter.get("name_simple", "")),
        "surah_en_t": clean_text((chapter.get("translated_name") or {}).get("name", "")),
        "arabic": clean_text(verse.get("text_indopak", "")),
        "translation_en": clean_text(en_text),
        "audio_ar": clean_text(audio_ar),
        "custom_title": clean_text(custom_title),
    }


def load_ayah_payload_local(surah: int, ayah: int, custom_title: str = "") -> Dict:
    path = RECITE_DIR / f"surah_{surah:03d}.json"
    if not path.exists():
        raise FileNotFoundError(f"Missing surah file: {path}")

    with path.open("r", encoding="utf-8") as f:
        payload = json.load(f)

    surah_data = payload.get("surah", {})
    ayahs = surah_data.get("ayahs", [])
    row = next((a for a in ayahs if int(a.get("ayah", 0)) == ayah), None)
    if not row:
        raise ValueError(f"Ayah {surah}:{ayah} not found")

    return {
        "surah": surah,
        "ayah": ayah,
        "surah_ar": clean_text(surah_data.get("arabicName", "")),
        "surah_en": clean_text(surah_data.get("englishName", "")),
        "surah_en_t": clean_text(surah_data.get("englishNameTranslation", "")),
        "arabic": clean_text(row.get("arabic", "")),
        "translation_en": clean_text(row.get("translation_en", "")),
        "audio_ar": clean_text((row.get("audio") or {}).get("ar", "")),
        "custom_title": clean_text(custom_title),
    }


def load_ayah_payload(surah: int, ayah: int, custom_title: str = "") -> Dict:
    if USE_REMOTE_INDOPAK:
        try:
            return load_ayah_payload_remote(surah, ayah, custom_title)
        except Exception:
            # Fallback to local dataset if remote fetch fails.
            return load_ayah_payload_local(surah, ayah, custom_title)
    return load_ayah_payload_local(surah, ayah, custom_title)


def load_dua_payload(surah: int, ayah: int, custom_title: str = "") -> Dict:
    if not DUAS_JSON_PATH.exists():
        raise FileNotFoundError(f"Missing dua file: {DUAS_JSON_PATH}")

    with DUAS_JSON_PATH.open("r", encoding="utf-8") as f:
        rows = json.load(f)

    ref = f"{surah}:{ayah}"
    row = next(
        (
            d
            for d in rows
            if str(d.get("reference", "")).replace(" ", "").strip() == ref
        ),
        None,
    )
    if not row:
        raise ValueError(f"Dua reference {ref} not found in {DUAS_JSON_PATH.name}")

    payload = load_ayah_payload_local(surah, ayah, custom_title)
    # In dua mode, preserve dua JSON text exactly as stored.
    dua_arabic = str(row.get("arabic", ""))
    dua_translation = str(row.get("translation", ""))
    if not dua_arabic.strip() or not dua_translation.strip():
        raise ValueError(f"Dua reference {ref} has missing arabic/translation in {DUAS_JSON_PATH.name}")
    payload["arabic"] = dua_arabic
    payload["translation_en"] = dua_translation
    payload["custom_title"] = clean_text(custom_title)
    return payload


def load_reel_payload(source: str, surah: int, ayah: int, custom_title: str = "") -> Dict:
    source = clean_text(source).lower() or "ayah"
    if source == "dua":
        return load_dua_payload(surah, ayah, custom_title)
    return load_ayah_payload(surah, ayah, custom_title)


def get_required_assets() -> Dict[str, List[str]]:
    return {
        "backgrounds": [
            str(BACKGROUND_DIR / "background_1.jpg"),
        ],
        "fonts": [
            str(ROOT / "PDMS_SALEEM_QURANFONTQESHIP_0.ttf"),
            str(ROOT / "fonts" / "MONTSERRAT-BOLD.TTF"),
            str(ROOT / "fonts" / "Montserrat-VariableFont_wght.ttf"),
        ],
    }


def get_missing_assets() -> List[str]:
    missing = []
    assets = get_required_assets()
    for group in assets.values():
        for raw in group:
            if not Path(raw).exists():
                missing.append(raw)
    return missing


def find_font(candidates: Tuple[Path, ...], size: int) -> ImageFont.FreeTypeFont:
    for p in candidates:
        if p.exists():
            try:
                return ImageFont.truetype(str(p), size=size)
            except Exception:
                continue
    return ImageFont.load_default()


def wrap_lines(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont, max_w: int):
    words = text.split()
    lines = []
    line = ""
    for w in words:
        trial = (line + " " + w).strip()
        tw = draw.textbbox((0, 0), trial, font=font)[2]
        if tw <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def wrap_lines_wand(draw: "WandDrawing", img: "WandImage", text: str, font_path: Path, font_size: int, max_w: int):
    words = str(text or "").split()
    lines = []
    line = ""
    draw.font = str(font_path)
    draw.font_size = font_size

    for w in words:
        trial = (line + " " + w).strip()
        metrics = draw.get_font_metrics(img, trial, True)
        if metrics.text_width <= max_w or not line:
            line = trial
        else:
            lines.append(line)
            line = w
    if line:
        lines.append(line)
    return lines


def measure_w(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.ImageFont) -> int:
    box = draw.textbbox((0, 0), text, font=font)
    return max(0, box[2] - box[0])


def pick_background_image() -> Image.Image:
    numbered = []
    i = 1
    while True:
        p = BACKGROUND_DIR / f"{i}.png"
        if p.exists():
            numbered.append(p)
            i += 1
            continue
        break
    if numbered:
        chosen = random.choice(numbered)
        img = Image.open(chosen).convert("RGB")
        return img.resize((W, H), Image.Resampling.LANCZOS)

    preferred = BACKGROUND_DIR / "background_1.jpg"
    if preferred.exists():
        img = Image.open(preferred).convert("RGB")
        return img.resize((W, H), Image.Resampling.LANCZOS)

    if BACKGROUND_DIR.exists():
        items = [
            p
            for p in BACKGROUND_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        ]
        if items:
            chosen = random.choice(items)
            img = Image.open(chosen).convert("RGB")
            return img.resize((W, H), Image.Resampling.LANCZOS)

    return Image.new("RGB", (W, H), "#0b1f2a")


def pick_background_path() -> Path | None:
    # Prefer numbered backgrounds like 1.png, 2.png, 3.png...
    numbered = []
    i = 1
    while True:
        p = BACKGROUND_DIR / f"{i}.png"
        if p.exists():
            numbered.append(p)
            i += 1
            continue
        break
    if numbered:
        return random.choice(numbered)

    preferred = BACKGROUND_DIR / "background_1.jpg"
    if preferred.exists():
        return preferred
    if BACKGROUND_DIR.exists():
        items = [
            p
            for p in BACKGROUND_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"}
        ]
        if items:
            return random.choice(items)
    return None


def render_poster_wand(meta: Dict, out_path: Path) -> None:
    if not WAND_AVAILABLE:
        raise RuntimeError(f"Wand not available: {WAND_IMPORT_ERROR}")

    bg_path = pick_background_path()
    if bg_path and bg_path.exists():
        img = WandImage(filename=str(bg_path))
        img.resize(W, H)
    else:
        img = WandImage(width=W, height=H, background=WandColor("#0b1f2a"))

    pdms_font = ROOT / "PDMS_SALEEM_QURANFONTQESHIP_0.ttf"
    if not pdms_font.exists():
        pdms_font = ROOT / "fonts" / "PDMS_SALEEM_QURANFONTQESHIP_0_alt.ttf"

    title_en_font = ROOT / "fonts" / "MONTSERRAT-BOLD.TTF"
    if not title_en_font.exists():
        title_en_font = ROOT / "Gilroy-Medium.ttf"

    footer_font = ROOT / "fonts" / "Montserrat-VariableFont_wght.ttf"
    if not footer_font.exists():
        footer_font = title_en_font

    if not pdms_font.exists():
        raise FileNotFoundError("Missing Arabic font: PDMS_SALEEM_QURANFONTQESHIP_0.ttf")
    if not title_en_font.exists():
        raise FileNotFoundError("Missing English title font: MONTSERRAT-BOLD.TTF")

    draw = WandDrawing()
    draw.fill_color = WandColor("#FFFFFF")
    draw.text_antialias = True

    # Dynamic sizing logic aligned with original script.
    draw.font = str(pdms_font)
    draw.font_size = 65
    ar_width = draw.get_font_metrics(img, meta["arabic"], True).text_width
    if ar_width > 2000:
        ar_body_size = 40
        en_body_size = 20
    elif 1000 < ar_width < 2000:
        ar_body_size = 45
        en_body_size = 25
    elif 500 < ar_width < 1000:
        ar_body_size = 55
        en_body_size = 25
    else:
        ar_body_size = 65
        en_body_size = 30

    header_ar = meta["surah_ar"] or f"سورة {meta['surah']}"
    header_en = meta["surah_en"] or "Quran"
    header_combo = f"{header_en} ({meta['surah_en_t']})" if meta["surah_en_t"] else header_en
    custom_title = meta.get("custom_title", "")
    ref = f"(surah {meta['surah']} : {meta['ayah']} ayah)"

    # Header
    draw.font = str(pdms_font)
    draw.font_size = 75
    draw.font_weight = 700
    draw.text_direction = "right_to_left"
    m = draw.get_font_metrics(img, header_ar, True)
    draw.text(int((W - m.text_width) // 2), 145, header_ar)

    draw.font = str(title_en_font)
    draw.font_size = 25
    draw.font_weight = 600
    draw.text_direction = "left_to_right"
    m = draw.get_font_metrics(img, header_combo, True)
    draw.text(int((W - m.text_width) // 2), 195, header_combo)

    m = draw.get_font_metrics(img, ref, True)
    draw.text(int((W - m.text_width) // 2), 225, ref)
    if custom_title:
        draw.font = str(title_en_font)
        draw.font_size = 28
        draw.font_weight = 700
        m = draw.get_font_metrics(img, custom_title, True)
        draw.text(int((W - m.text_width) // 2), 350, custom_title)

    # Body
    arabic_line_spacing = 25
    english_line_spacing = 10
    arabic_lines = wrap_lines_wand(draw, img, meta["arabic"], pdms_font, ar_body_size, max_w=900)
    trans_lines = wrap_lines_wand(draw, img, meta["translation_en"], title_en_font, en_body_size, max_w=900)

    total_height = (
        len(arabic_lines) * (ar_body_size + arabic_line_spacing)
        + len(trans_lines) * (en_body_size + english_line_spacing)
    )
    y = max(300, int((H - total_height) // 2))

    draw.font = str(pdms_font)
    draw.font_size = ar_body_size
    draw.font_weight = 700
    draw.text_direction = "right_to_left"
    for line in arabic_lines:
        m = draw.get_font_metrics(img, line, True)
        draw.text(int((W - m.text_width) // 2), int(y), line)
        y += ar_body_size + arabic_line_spacing

    draw.font = str(title_en_font)
    draw.font_size = en_body_size
    draw.font_weight = 500
    draw.text_direction = "left_to_right"
    for line in trans_lines:
        m = draw.get_font_metrics(img, line, True)
        draw.text(int((W - m.text_width) // 2), int(y), line)
        y += en_body_size + english_line_spacing

    # Footer
    draw.font = str(footer_font)
    draw.font_size = 28
    m = draw.get_font_metrics(img, "see more at:", True)
    draw.text(int((W - m.text_width) // 2), 1790, "see more at:")

    draw.font = str(title_en_font)
    draw.font_size = 32
    m = draw.get_font_metrics(img, "myquranquest.com", True)
    draw.text(int((W - m.text_width) // 2), 1820, "myquranquest.com")

    draw(img)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(filename=str(out_path))
    img.close()


def render_poster(meta: Dict, out_path: Path) -> None:
    img = pick_background_image()
    draw = ImageDraw.Draw(img)

    # Keep the same font intent as your original script.
    title_ar_font = find_font(
        (
            ROOT / "PDMS_SALEEM_QURANFONTQESHIP_0.ttf",
            ROOT / "fonts" / "PDMS_SALEEM_QURANFONTQESHIP_0_alt.ttf",
            ROOT / "fonts" / "AlQuran-IndoPak-QuranWBW.ttf",
        ),
        75,
    )
    base_ar_body_font = find_font(
        (
            ROOT / "PDMS_SALEEM_QURANFONTQESHIP_0.ttf",
            ROOT / "fonts" / "PDMS_SALEEM_QURANFONTQESHIP_0_alt.ttf",
            ROOT / "fonts" / "AlQuran-IndoPak-QuranWBW.ttf",
        ),
        65,
    )
    title_en_font = find_font(
        (
            ROOT / "fonts" / "MONTSERRAT-BOLD.TTF",
            ROOT / "Gilroy-Medium.ttf",
        ),
        25,
    )
    body_en_font = find_font(
        (
            ROOT / "fonts" / "MONTSERRAT-BOLD.TTF",
            ROOT / "Gilroy-Medium.ttf",
        ),
        30,
    )
    footer_en_font = find_font(
        (
            ROOT / "fonts" / "Montserrat-VariableFont_wght.ttf",
            ROOT / "fonts" / "MONTSERRAT-BOLD.TTF",
            ROOT / "Gilroy-Medium.ttf",
        ),
        30,
    )

    # Dynamic size selection aligned to original script logic.
    ar_width = measure_w(draw, meta["arabic"], base_ar_body_font)
    if ar_width > 2000:
        ar_body_size = 40
        en_body_size = 20
    elif 1000 < ar_width < 2000:
        ar_body_size = 45
        en_body_size = 25
    elif 500 < ar_width < 1000:
        ar_body_size = 55
        en_body_size = 25
    else:
        ar_body_size = 65
        en_body_size = 30

    ar_text_font = find_font(
        (
            ROOT / "PDMS_SALEEM_QURANFONTQESHIP_0.ttf",
            ROOT / "fonts" / "PDMS_SALEEM_QURANFONTQESHIP_0_alt.ttf",
            ROOT / "fonts" / "AlQuran-IndoPak-QuranWBW.ttf",
        ),
        ar_body_size,
    )
    body_en_font = find_font(
        (
            ROOT / "fonts" / "MONTSERRAT-BOLD.TTF",
            ROOT / "Gilroy-Medium.ttf",
        ),
        en_body_size,
    )

    # Header block matches original positions.
    header_ar = meta["surah_ar"] or f"سورة {meta['surah']}"
    header_en = meta["surah_en"] or "Quran"
    ref = f"(surah {meta['surah']} : {meta['ayah']} ayah)"
    header_combo = f"{header_en} ({meta['surah_en_t']})" if meta["surah_en_t"] else header_en
    custom_title = meta.get("custom_title", "")

    def safe_text(xy, text, *, fill, font, anchor=None, direction=None):
        try:
            draw.text(xy, text, fill=fill, font=font, anchor=anchor, direction=direction)
        except Exception:
            draw.text(xy, text, fill=fill, font=font, anchor=anchor)

    safe_text((W // 2, 145), header_ar, fill="#ffffff", font=title_ar_font, anchor="mm", direction="rtl")
    draw.text((W // 2, 195), header_combo, fill="#ffffff", font=title_en_font, anchor="mm")
    draw.text((W // 2, 225), ref, fill="#ffffff", font=title_en_font, anchor="mm")
    if custom_title:
        draw.text((W // 2, 295), custom_title, fill="#ffffff", font=body_en_font, anchor="mm")

    arabic_line_spacing = 25
    english_line_spacing = 10
    arabic_lines = wrap_lines(draw, meta["arabic"], ar_text_font, max_w=900)
    trans_lines = wrap_lines(draw, meta["translation_en"], body_en_font, max_w=900)

    total_height = (
        len(arabic_lines) * (ar_body_size + arabic_line_spacing)
        + len(trans_lines) * (en_body_size + english_line_spacing)
    )
    y = max(300, (H - total_height) // 2)

    for line in arabic_lines:
        tw = measure_w(draw, line, ar_text_font)
        x = (W - tw) // 2
        safe_text((x, y), line, fill="#ffffff", font=ar_text_font, direction="rtl")
        y += ar_body_size + arabic_line_spacing

    for line in trans_lines:
        tw = measure_w(draw, line, body_en_font)
        x = (W - tw) // 2
        draw.text((x, y), line, fill="#ffffff", font=body_en_font)
        y += en_body_size + english_line_spacing

    # Footer aligned with your request and original style intent.
    draw.text((W // 2, 1790), "see more at:", fill="#ffffff", font=footer_en_font, anchor="mm")
    draw.text((W // 2, 1820), "myquranquest.com", fill="#ffffff", font=body_en_font, anchor="mm")

    out_path.parent.mkdir(parents=True, exist_ok=True)
    img.save(out_path, format="PNG", quality=100)


def download_audio(url: str, path: Path) -> None:
    if not url:
        raise ValueError("No Arabic audio URL found for this ayah")
    path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=30) as r:
        r.raise_for_status()
        with path.open("wb") as f:
            for chunk in r.iter_content(chunk_size=1024 * 128):
                if chunk:
                    f.write(chunk)


def create_reel_video(image_path: Path, audio_path: Path, output_path: Path) -> None:
    output_path.parent.mkdir(parents=True, exist_ok=True)
    cmd = [
        FFMPEG_BIN,
        "-y",
        "-loop",
        "1",
        "-i",
        str(image_path),
        "-i",
        str(audio_path),
        "-c:v",
        "libx264",
        "-preset",
        FFMPEG_PRESET,
        "-crf",
        FFMPEG_CRF,
        "-tune",
        "stillimage",
        "-r",
        "30",
        "-pix_fmt",
        "yuv420p",
        "-vf",
        "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
        "-c:a",
        "aac",
        "-b:a",
        "128k",
        "-shortest",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    subprocess.run(cmd, check=True, capture_output=True, text=True)


def generate_for_ayah(surah: int, ayah: int, title: str = "", source: str = "ayah") -> Dict:
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    TMP_DIR.mkdir(parents=True, exist_ok=True)

    stamp = dt.datetime.utcnow().strftime("%Y%m%d_%H%M%S")
    source = clean_text(source).lower() or "ayah"
    slug_prefix = "d" if source == "dua" else "s"
    slug = f"{slug_prefix}{surah:03d}_a{ayah:03d}_{stamp}"

    poster = TMP_DIR / f"{slug}.png"
    audio = TMP_DIR / f"{slug}.mp3"
    video = OUTPUT_DIR / f"{slug}.mp4"

    meta = load_reel_payload(source, surah, ayah, title)
    renderer = "pillow"
    renderer_error = ""
    try:
        use_wand = REEL_RENDERER == "wand"
        if use_wand and WAND_AVAILABLE:
            render_poster_wand(meta, poster)
            renderer = "wand"
        else:
            render_poster(meta, poster)
    except Exception as e:
        # Fallback to PIL path so generation can continue.
        renderer = "pillow"
        renderer_error = str(e)
        render_poster(meta, poster)

    download_audio(meta["audio_ar"], audio)
    create_reel_video(poster, audio, video)

    return {
        "ok": True,
        "source": source,
        "surah": surah,
        "ayah": ayah,
        "title": meta.get("custom_title", ""),
        "filename": video.name,
        "renderer": renderer,
        "renderer_error": renderer_error,
    }


app = Flask(__name__)


@app.after_request
def apply_cors(resp):
    resp.headers["Access-Control-Allow-Origin"] = CORS_ORIGIN
    resp.headers["Access-Control-Allow-Methods"] = "GET,POST,OPTIONS"
    resp.headers["Access-Control-Allow-Headers"] = "Content-Type, X-Reel-Token"
    return resp


@app.get("/api/reel/health")
def health():
    result = {"ok": True, "service": "quran-reel-generator"}
    token = str(request.headers.get("X-Reel-Token", "")).strip()
    if require_token(token):
        missing = get_missing_assets()
        result.update(
            {
                "tokenConfigured": bool(ADMIN_TOKEN),
                "outputDir": str(OUTPUT_DIR),
                "missingAssets": missing,
                "wandAvailable": WAND_AVAILABLE,
                "wandImportError": WAND_IMPORT_ERROR,
                "useRemoteIndopak": USE_REMOTE_INDOPAK,
                "rendererMode": REEL_RENDERER,
            }
        )
    return jsonify(result)


@app.route("/api/reel/generate", methods=["POST", "OPTIONS"])
def generate():
    if request.method == "OPTIONS":
        return ("", 204)

    body = request.get_json(silent=True) or {}
    token = (
        request.headers.get("X-Reel-Token", "").strip()
        or str(body.get("token", "")).strip()
        or str(request.args.get("token", "")).strip()
    )
    if not require_token(token):
        return jsonify({"ok": False, "error": "unauthorized"}), 403

    try:
        surah = int(body.get("surah"))
        ayah = int(body.get("ayah"))
    except Exception:
        return jsonify({"ok": False, "error": "surah and ayah must be integers"}), 400
    title = clean_text(str(body.get("title", "")))
    source = clean_text(str(body.get("source", "ayah"))).lower() or "ayah"

    if source not in {"ayah", "dua"}:
        return jsonify({"ok": False, "error": "source must be 'ayah' or 'dua'"}), 400
    if surah < 1 or surah > 114 or ayah < 1:
        return jsonify({"ok": False, "error": "invalid surah/ayah range"}), 400

    try:
        result = generate_for_ayah(surah, ayah, title, source=source)
        download_url = f"{request.host_url.rstrip('/')}/api/reel/download/{result['filename']}"
        result["download_url"] = download_url
        return jsonify(result)
    except subprocess.CalledProcessError as e:
        return jsonify({"ok": False, "error": "ffmpeg failed", "details": e.stderr[-4000:]}), 500
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/reel/usage")
def usage():
    token = str(request.headers.get("X-Reel-Token", "")).strip()
    if not require_token(token):
        return jsonify({"ok": False, "error": "unauthorized"}), 403

    try:
        project_id = (
            os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
            or fetch_metadata("project/project-id")
        )
        service_name = os.getenv("K_SERVICE", "").strip() or "quran-reel-service"
        start = dt.datetime.utcnow().replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end = dt.datetime.utcnow()
        start_iso = start.strftime("%Y-%m-%dT%H:%M:%SZ")
        end_iso = end.strftime("%Y-%m-%dT%H:%M:%SZ")

        request_count = query_monitoring_sum(
            project_id=project_id,
            metric_type="run.googleapis.com/request_count",
            service_name=service_name,
            start_iso=start_iso,
            end_iso=end_iso,
        )
        billable_seconds = query_monitoring_sum(
            project_id=project_id,
            metric_type="run.googleapis.com/container/billable_instance_time",
            service_name=service_name,
            start_iso=start_iso,
            end_iso=end_iso,
        )

        vcpu_used = billable_seconds * ALLOCATED_VCPU
        gib_seconds_used = billable_seconds * ALLOCATED_MEMORY_GIB
        requests_remaining = max(0.0, float(FREE_TIER_REQUESTS) - request_count)
        vcpu_remaining = max(0.0, FREE_TIER_VCPU_SECONDS - vcpu_used)
        gib_seconds_remaining = max(0.0, FREE_TIER_GIB_SECONDS - gib_seconds_used)

        return jsonify(
            {
                "ok": True,
                "periodStartUtc": start_iso,
                "periodEndUtc": end_iso,
                "projectId": project_id,
                "serviceName": service_name,
                "allocation": {
                    "vcpuPerInstance": ALLOCATED_VCPU,
                    "memoryGiBPerInstance": ALLOCATED_MEMORY_GIB,
                },
                "usage": {
                    "requestCount": int(round(request_count)),
                    "billableInstanceSeconds": billable_seconds,
                    "vcpuSeconds": vcpu_used,
                    "gibSeconds": gib_seconds_used,
                },
                "freeTier": {
                    "requestCount": FREE_TIER_REQUESTS,
                    "vcpuSeconds": FREE_TIER_VCPU_SECONDS,
                    "gibSeconds": FREE_TIER_GIB_SECONDS,
                },
                "remaining": {
                    "requestCount": int(round(requests_remaining)),
                    "vcpuSeconds": vcpu_remaining,
                    "gibSeconds": gib_seconds_remaining,
                },
            }
        )
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500


@app.get("/api/reel/download/<name>")
def download(name: str):
    token = (
        request.headers.get("X-Reel-Token", "").strip()
        or str(request.args.get("token", "")).strip()
    )
    if not require_token(token):
        return jsonify({"ok": False, "error": "unauthorized"}), 403
    if "/" in name or "\\" in name or ".." in name:
        return jsonify({"ok": False, "error": "invalid filename"}), 400
    return send_from_directory(OUTPUT_DIR, name, as_attachment=True)


if __name__ == "__main__":
    if not ADMIN_TOKEN:
        raise SystemExit("Set REEL_ADMIN_TOKEN before running this service.")
    app.run(host=HOST, port=PORT, debug=False)
