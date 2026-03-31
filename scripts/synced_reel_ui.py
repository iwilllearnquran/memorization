#!/usr/bin/env python3
from __future__ import annotations

import os
import sys
from datetime import datetime
from pathlib import Path

from flask import Flask, jsonify, request, send_from_directory
from werkzeug.utils import secure_filename

ROOT = Path(__file__).resolve().parents[1]
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from scripts.generate_synced_reel import (
    DEFAULT_SUBTITLE_FONT,
    DEFAULT_WHISPER_CACHE,
    clean_text,
    build_quran_audio_and_srt,
    render_reel,
    resolve_path,
    shift_srt_file,
    slugify,
    transcribe_audio_to_srt,
)
from scripts.reel_vocab_tts import build_vocab_tts_audio_and_srt


HOST = os.getenv("SYNCED_REEL_UI_HOST", "127.0.0.1")
PORT = int(os.getenv("SYNCED_REEL_UI_PORT", "8788"))
UI_OUTPUT_ROOT = ROOT / "generated" / "reels" / "ui_runs"
UI_PAGE = ROOT / "_private" / "synced-reel-admin.html"
MAX_UPLOAD_MB = int(os.getenv("SYNCED_REEL_UI_MAX_UPLOAD_MB", "512"))

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = MAX_UPLOAD_MB * 1024 * 1024


def build_run_dir(label: str) -> tuple[str, Path]:
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    run_id = f"{timestamp}_{slugify(label)}"
    run_dir = UI_OUTPUT_ROOT / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    return run_id, run_dir


def clamp_int(raw: str | None, default: int, minimum: int, maximum: int) -> int:
    try:
        value = int(str(raw or "").strip())
    except Exception:
        return default
    return max(minimum, min(maximum, value))


def resolve_optional_path(raw: str | None) -> Path | None:
    cleaned = clean_text(raw or "")
    if not cleaned:
        return None
    return resolve_path(cleaned)


def choose_label_hint() -> str:
    mode = clean_text(request.form.get("mode", "")).lower()
    if mode == "vocab":
        vocab_title = clean_text(request.form.get("vocab_title", ""))
        if vocab_title:
            return vocab_title
        vocab_source = clean_text(request.form.get("vocab_source", "top-words")) or "top-words"
        vocab_count = clean_text(request.form.get("vocab_count", "12")) or "12"
        if vocab_source == "custom":
            return "custom_quran_vocab"
        return f"top_{vocab_count}_quran_words"

    quran_ref = clean_text(request.form.get("quran_ref", ""))
    if quran_ref:
        return f"quran_{quran_ref}"

    audio_upload = request.files.get("audio_upload")
    if audio_upload and audio_upload.filename:
        return Path(audio_upload.filename).stem

    audio_path = clean_text(request.form.get("audio_path", ""))
    if audio_path:
        return Path(audio_path).stem

    background_upload = request.files.get("background_upload")
    if background_upload and background_upload.filename:
        return Path(background_upload.filename).stem

    background_path = clean_text(request.form.get("background_path", ""))
    if background_path:
        return Path(background_path).stem

    return "reel"


def save_upload(file_key: str, upload_dir: Path, prefix: str) -> Path | None:
    upload = request.files.get(file_key)
    if not upload or not upload.filename:
        return None

    safe_name = secure_filename(Path(upload.filename).name) or f"{prefix}.bin"
    target = upload_dir / f"{prefix}_{safe_name}"
    upload.save(target)
    return target


def resolve_input_file(path_key: str, upload_key: str, upload_dir: Path, prefix: str) -> Path | None:
    uploaded = save_upload(upload_key, upload_dir, prefix)
    if uploaded:
        return uploaded

    candidate = resolve_optional_path(request.form.get(path_key, ""))
    if not candidate:
        return None
    if not candidate.exists() or not candidate.is_file():
        raise FileNotFoundError(f"File not found: {candidate}")
    return candidate


def relative_download_url(run_id: str, filename: str) -> str:
    return f"/api/synced-reel/files/{run_id}/{filename}"


@app.get("/")
@app.get("/ui")
def ui_index():
    if not UI_PAGE.exists():
        return "UI file missing", 404
    return UI_PAGE.read_text(encoding="utf-8"), 200, {"Content-Type": "text/html; charset=utf-8"}


@app.get("/api/synced-reel/health")
def health():
    return jsonify(
        {
            "ok": True,
            "service": "synced-reel-ui",
            "ui": str(UI_PAGE),
            "output_root": str(UI_OUTPUT_ROOT),
        }
    )


@app.post("/api/synced-reel/generate")
def generate():
    mode = clean_text(request.form.get("mode", "non-quran")).lower() or "non-quran"
    if mode not in {"quran", "non-quran", "vocab"}:
        return jsonify({"ok": False, "error": "mode must be quran, non-quran, or vocab"}), 400

    run_id, run_dir = build_run_dir(choose_label_hint())
    upload_dir = run_dir / "_uploads"
    upload_dir.mkdir(parents=True, exist_ok=True)

    try:
        background_path = resolve_input_file("background_path", "background_upload", upload_dir, "background")
        if not background_path:
            return jsonify({"ok": False, "error": "Background path or upload is required"}), 400

        subtitle_font = clean_text(request.form.get("subtitle_font", "")) or DEFAULT_SUBTITLE_FONT
        subtitle_size = clamp_int(request.form.get("subtitle_size"), 18, 10, 120)
        subtitle_margin_v = clamp_int(request.form.get("subtitle_margin_v"), 80, 0, 500)
        subtitle_offset_ms = clamp_int(request.form.get("subtitle_offset_ms"), 0, -5000, 5000)

        if mode == "quran":
            quran_ref = clean_text(request.form.get("quran_ref", ""))
            if not quran_ref:
                return jsonify({"ok": False, "error": "Quran ref is required in Quran mode"}), 400

            quran_audio_edition = clean_text(request.form.get("quran_audio_edition", "")) or "ar.alafasy"
            quran_text_edition = clean_text(request.form.get("quran_text_edition", "")) or "quran-uthmani"

            audio_path, srt_path, metadata = build_quran_audio_and_srt(
                quran_ref,
                run_dir,
                audio_edition=quran_audio_edition,
                text_edition=quran_text_edition,
            )
            output_name = f"quran_{metadata['surah']}_{metadata['ayah_start']}"
            if metadata["ayah_end"] != metadata["ayah_start"]:
                output_name += f"_{metadata['ayah_end']}"
            output_video = run_dir / f"{output_name}.mp4"
        elif mode == "vocab":
            vocab_source = clean_text(request.form.get("vocab_source", "top-words")) or "top-words"
            vocab_title = clean_text(request.form.get("vocab_title", ""))
            vocab_lines = request.form.get("vocab_lines", "") or ""
            vocab_count = clamp_int(request.form.get("vocab_count"), 12, 1, 500)
            vocab_offset = clamp_int(request.form.get("vocab_offset"), 0, 0, 100000)
            vocab_dataset_path = resolve_optional_path(request.form.get("vocab_dataset_path", "")) or resolve_path("memo-practice-words.json")
            tts_provider = clean_text(request.form.get("tts_provider", "")) or "edge-tts"
            tts_arabic_voice = clean_text(request.form.get("tts_arabic_voice", "")) or ("ar-SA-HamedNeural" if tts_provider != "elevenlabs" else "pNInz6obpgDQGcFmaJgB")
            tts_english_voice = clean_text(request.form.get("tts_english_voice", "")) or ("en-US-ChristopherNeural" if tts_provider != "elevenlabs" else "pNInz6obpgDQGcFmaJgB")
            tts_arabic_rate = clean_text(request.form.get("tts_arabic_rate", "")) or "-6%"
            tts_english_rate = clean_text(request.form.get("tts_english_rate", "")) or "-4%"
            tts_arabic_pitch = clean_text(request.form.get("tts_arabic_pitch", "")) or "-2Hz"
            tts_english_pitch = clean_text(request.form.get("tts_english_pitch", "")) or "-2Hz"
            tts_pause_between_languages_ms = clamp_int(request.form.get("tts_pause_between_languages_ms"), 260, 0, 10000)
            tts_pause_between_entries_ms = clamp_int(request.form.get("tts_pause_between_entries_ms"), 680, 0, 10000)
            elevenlabs_api_key = clean_text(request.form.get("elevenlabs_api_key", ""))
            elevenlabs_model = clean_text(request.form.get("elevenlabs_model", "")) or "eleven_multilingual_v2"

            audio_path, srt_path, metadata = build_vocab_tts_audio_and_srt(
                run_dir,
                vocab_source=vocab_source,
                vocab_lines=vocab_lines,
                vocab_count=vocab_count,
                vocab_offset=vocab_offset,
                vocab_dataset_path=vocab_dataset_path,
                arabic_voice=tts_arabic_voice,
                english_voice=tts_english_voice,
                arabic_rate=tts_arabic_rate,
                english_rate=tts_english_rate,
                arabic_pitch=tts_arabic_pitch,
                english_pitch=tts_english_pitch,
                pause_between_languages_ms=tts_pause_between_languages_ms,
                pause_between_entries_ms=tts_pause_between_entries_ms,
                title=vocab_title,
                tts_provider=tts_provider,
                elevenlabs_api_key=elevenlabs_api_key,
                elevenlabs_model=elevenlabs_model,
            )
            output_name = slugify(metadata.get("title", "quran_vocab_tts"))
            output_video = run_dir / f"{output_name}.mp4"
        else:
            audio_path = resolve_input_file("audio_path", "audio_upload", upload_dir, "audio")
            if not audio_path:
                return jsonify({"ok": False, "error": "Audio path or upload is required in non-Quran mode"}), 400

            language = clean_text(request.form.get("language", "")) or "auto"
            whisper_model = clean_text(request.form.get("whisper_model", "")) or "small"
            whisper_cache_dir = resolve_optional_path(request.form.get("whisper_cache_dir", "")) or DEFAULT_WHISPER_CACHE

            srt_path = run_dir / f"{slugify(audio_path.stem)}.srt"
            transcribe_audio_to_srt(
                audio_path,
                srt_path,
                language=language,
                whisper_model=whisper_model,
                whisper_cache_dir=whisper_cache_dir,
            )
            output_video = run_dir / f"{slugify(audio_path.stem)}_subtitled.mp4"
            metadata = {
                "mode": "non-quran",
                "language": language,
                "whisper_model": whisper_model,
            }

        if subtitle_offset_ms:
            shift_srt_file(srt_path, subtitle_offset_ms)

        render_reel(
            background_path,
            audio_path,
            srt_path,
            output_video,
            subtitle_font=subtitle_font,
            subtitle_size=subtitle_size,
            margin_v=subtitle_margin_v,
        )

        response = {
            "ok": True,
            "run_id": run_id,
            "mode": mode,
            "background": str(background_path),
            "audio": str(audio_path),
            "srt": str(srt_path),
            "video": str(output_video),
            "output_dir": str(run_dir),
            "video_url": relative_download_url(run_id, output_video.name),
            "srt_url": relative_download_url(run_id, srt_path.name),
            "meta": {**metadata, "subtitle_offset_ms": subtitle_offset_ms},
        }
        if audio_path.parent == run_dir:
            response["audio_url"] = relative_download_url(run_id, audio_path.name)
        return jsonify(response)
    except Exception as exc:
        return jsonify({"ok": False, "error": str(exc), "run_id": run_id}), 500


@app.get("/api/synced-reel/files/<run_id>/<path:filename>")
def download_generated_file(run_id: str, filename: str):
    run_dir = (UI_OUTPUT_ROOT / run_id).resolve()
    if not run_dir.exists() or UI_OUTPUT_ROOT.resolve() not in run_dir.parents:
        return jsonify({"ok": False, "error": "Unknown run id"}), 404
    return send_from_directory(run_dir, filename, as_attachment=False)


if __name__ == "__main__":
    UI_OUTPUT_ROOT.mkdir(parents=True, exist_ok=True)
    print(f"Synced Reel UI running at http://{HOST}:{PORT}")
    app.run(host=HOST, port=PORT, debug=False)