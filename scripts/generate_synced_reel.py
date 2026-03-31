#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import shutil
import subprocess
import sys
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Iterable

import requests

from scripts.reel_vocab_tts import (
    DEFAULT_TTS_ARABIC_PITCH,
    DEFAULT_TTS_ARABIC_RATE,
    DEFAULT_TTS_ARABIC_VOICE,
    DEFAULT_TTS_ENGLISH_PITCH,
    DEFAULT_TTS_ENGLISH_RATE,
    DEFAULT_TTS_ENGLISH_VOICE,
    DEFAULT_TTS_PAUSE_BETWEEN_ENTRIES_MS,
    DEFAULT_TTS_PAUSE_BETWEEN_LANGUAGES_MS,
    DEFAULT_VOCAB_DATA_PATH,
    build_vocab_tts_audio_and_srt,
)

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

SRT_LINE_RE = re.compile(
    r"^(?P<start>\d{2}:\d{2}:\d{2},\d{3})\s-->\s(?P<end>\d{2}:\d{2}:\d{2},\d{3})$"
)

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_OUTPUT_ROOT = ROOT / "generated" / "reels" / "script_runs"
DEFAULT_WHISPER_CACHE = ROOT / "generated" / "reels" / "models"

FFMPEG_BIN = "ffmpeg"
FFPROBE_BIN = "ffprobe"
DEFAULT_SUBTITLE_FONT = "Arial"
DEFAULT_AUDIO_CODEC = "aac"
DEFAULT_VIDEO_CODEC = "libx264"
QURAN_API_BASE = "https://api.alquran.cloud/v1"

WHISPER_MODEL_URLS = {
    "tiny": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-tiny.bin",
    "base": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin",
    "small": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-small.bin",
    "medium": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-medium.bin",
    "large-v3": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3.bin",
    "large-v3-turbo": "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-large-v3-turbo.bin",
}

VIDEO_EXTENSIONS = {".mp4", ".mov", ".mkv", ".webm", ".avi", ".m4v"}
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp"}


@dataclass
class QuranAyahAsset:
    ayah: int
    arabic: str
    audio_url: str


def clean_text(text: str) -> str:
    text = str(text or "")
    text = re.sub(r"\s+", " ", text).strip()
    return text


def slugify(text: str) -> str:
    text = clean_text(text).lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    text = text.strip("_")
    return text or "output"


def prompt_non_empty(label: str, default: str = "") -> str:
    suffix = f" [{default}]" if default else ""
    while True:
        value = input(f"{label}{suffix}: ").strip()
        if value:
            return value
        if default:
            return default
        print("Please enter a value.")


def prompt_multiline(label: str) -> str:
    print(f"{label} Finish with an empty line.")
    lines: list[str] = []
    while True:
        line = input().rstrip()
        if not line:
            break
        lines.append(line)
    return "\n".join(lines)


def ensure_binary(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise RuntimeError(f"Required binary not found in PATH: {name}")
    return resolved


def run(cmd: list[str], *, capture_output: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, capture_output=capture_output, text=True)


def ffprobe_duration(path: Path) -> float:
    result = run(
        [
            ensure_binary(FFPROBE_BIN),
            "-v",
            "error",
            "-show_entries",
            "format=duration",
            "-of",
            "default=nw=1:nk=1",
            str(path),
        ]
    )
    return float(result.stdout.strip())


def ffmpeg_escape(value: str | Path) -> str:
    escaped = str(Path(value).resolve()).replace("\\", "/")
    escaped = escaped.replace(":", r"\:")
    escaped = escaped.replace("'", r"\'")
    escaped = escaped.replace(",", r"\,")
    escaped = escaped.replace("[", r"\[")
    escaped = escaped.replace("]", r"\]")
    return escaped


def format_srt_timestamp(total_seconds: float) -> str:
    if total_seconds < 0:
        total_seconds = 0.0
    hours = int(total_seconds // 3600)
    minutes = int((total_seconds % 3600) // 60)
    seconds = int(total_seconds % 60)
    millis = int(round((total_seconds - int(total_seconds)) * 1000))
    if millis == 1000:
        millis = 0
        seconds += 1
    if seconds == 60:
        seconds = 0
        minutes += 1
    if minutes == 60:
        minutes = 0
        hours += 1
    return f"{hours:02d}:{minutes:02d}:{seconds:02d},{millis:03d}"


def parse_srt_timestamp(raw: str) -> float:
    hours, minutes, rest = raw.split(":")
    seconds, millis = rest.split(",")
    return (
        int(hours) * 3600
        + int(minutes) * 60
        + int(seconds)
        + (int(millis) / 1000.0)
    )


def shift_srt_file(srt_path: Path, offset_ms: int) -> None:
    if not offset_ms:
        return

    lines = srt_path.read_text(encoding="utf-8").splitlines()
    shifted: list[str] = []
    offset_seconds = offset_ms / 1000.0

    for line in lines:
        match = SRT_LINE_RE.match(line.strip())
        if not match:
            shifted.append(line)
            continue

        start = max(0.0, parse_srt_timestamp(match.group("start")) + offset_seconds)
        end = max(start, parse_srt_timestamp(match.group("end")) + offset_seconds)
        shifted.append(f"{format_srt_timestamp(start)} --> {format_srt_timestamp(end)}")

    srt_path.write_text("\n".join(shifted) + "\n", encoding="utf-8")


def write_srt(cues: Iterable[tuple[float, float, str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    for idx, (start_s, end_s, text) in enumerate(cues, start=1):
        lines.append(str(idx))
        lines.append(f"{format_srt_timestamp(start_s)} --> {format_srt_timestamp(end_s)}")
        lines.append(str(text).strip())
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")


def download_file(url: str, out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    with requests.get(url, stream=True, timeout=60) as response:
        response.raise_for_status()
        with out_path.open("wb") as file_obj:
            for chunk in response.iter_content(chunk_size=1024 * 256):
                if chunk:
                    file_obj.write(chunk)


def fetch_json(url: str) -> dict:
    response = requests.get(url, timeout=60)
    response.raise_for_status()
    return response.json()


def parse_quran_ref(ref: str) -> tuple[int, int, int]:
    raw = clean_text(ref)
    match = re.fullmatch(r"(\d+):(\d+)(?:-(\d+))?", raw)
    if not match:
        raise ValueError("Quran ref must look like 97:1 or 97:1-5")
    surah = int(match.group(1))
    ayah_start = int(match.group(2))
    ayah_end = int(match.group(3) or ayah_start)
    if ayah_end < ayah_start:
        raise ValueError("End ayah must be greater than or equal to start ayah")
    return surah, ayah_start, ayah_end


def ensure_whisper_filter() -> None:
    result = run([ensure_binary(FFMPEG_BIN), "-hide_banner", "-filters"])
    if " whisper " not in result.stdout:
        raise RuntimeError(
            "This FFmpeg build does not have the whisper filter. "
            "Install an FFmpeg build with whisper support or use a local model with such a build."
        )


def resolve_whisper_model_path(model_or_path: str, cache_dir: Path) -> Path:
    candidate = Path(model_or_path)
    if candidate.exists():
        return candidate.resolve()

    if model_or_path not in WHISPER_MODEL_URLS:
        allowed = ", ".join(sorted(WHISPER_MODEL_URLS))
        raise ValueError(
            f"Unknown whisper model '{model_or_path}'. "
            f"Use a local .bin path or one of: {allowed}"
        )

    cache_dir.mkdir(parents=True, exist_ok=True)
    target = cache_dir / f"ggml-{model_or_path}.bin"
    if target.exists():
        return target.resolve()

    print(f"Downloading whisper model '{model_or_path}' to {target} ...")
    download_file(WHISPER_MODEL_URLS[model_or_path], target)
    return target.resolve()


def transcribe_audio_to_srt(
    audio_path: Path,
    srt_path: Path,
    *,
    language: str,
    whisper_model: str,
    whisper_cache_dir: Path,
) -> Path:
    ensure_whisper_filter()
    model_path = resolve_whisper_model_path(whisper_model, whisper_cache_dir)
    srt_path.parent.mkdir(parents=True, exist_ok=True)

    filter_parts = [
        f"whisper=model='{ffmpeg_escape(model_path)}'",
        f"destination='{ffmpeg_escape(srt_path)}'",
        "format=srt",
    ]
    if language and language.lower() != "auto":
        filter_parts.append(f"language={language}")

    run(
        [
            ensure_binary(FFMPEG_BIN),
            "-y",
            "-i",
            str(audio_path),
            "-vn",
            "-af",
            ":".join(filter_parts),
            "-f",
            "null",
            "-",
        ]
    )

    if not srt_path.exists():
        raise RuntimeError("Whisper transcription finished without producing an SRT file")
    return srt_path


def load_quran_assets(
    quran_ref: str,
    *,
    audio_edition: str,
    text_edition: str,
) -> tuple[list[QuranAyahAsset], dict]:
    surah, ayah_start, ayah_end = parse_quran_ref(quran_ref)
    text_payload = fetch_json(f"{QURAN_API_BASE}/surah/{surah}/{text_edition}")
    audio_payload = fetch_json(f"{QURAN_API_BASE}/surah/{surah}/{audio_edition}")

    text_data = text_payload.get("data") or {}
    audio_data = audio_payload.get("data") or {}
    text_ayahs = text_data.get("ayahs") or []
    audio_ayahs = audio_data.get("ayahs") or []
    text_map = {int(row.get("numberInSurah", 0)): clean_text(row.get("text", "")) for row in text_ayahs}
    audio_map = {int(row.get("numberInSurah", 0)): clean_text(row.get("audio", "")) for row in audio_ayahs}

    assets: list[QuranAyahAsset] = []
    for ayah in range(ayah_start, ayah_end + 1):
        arabic = text_map.get(ayah, "")
        audio_url = audio_map.get(ayah, "")
        if not arabic:
            raise RuntimeError(f"Missing Quran text from API for {surah}:{ayah}")
        if not audio_url:
            raise RuntimeError(f"Missing Quran audio from API for {surah}:{ayah}")
        assets.append(QuranAyahAsset(ayah=ayah, arabic=arabic, audio_url=audio_url))

    metadata = {
        "surah": surah,
        "ayah_start": ayah_start,
        "ayah_end": ayah_end,
        "surah_name": clean_text(text_data.get("englishName", "")),
        "surah_name_translation": clean_text(text_data.get("englishNameTranslation", "")),
        "surah_name_ar": clean_text(text_data.get("name", "")),
        "audio_edition": audio_edition,
        "text_edition": text_edition,
    }
    return assets, metadata


def build_quran_audio_and_srt(
    quran_ref: str,
    output_dir: Path,
    *,
    audio_edition: str,
    text_edition: str,
) -> tuple[Path, Path, dict]:
    assets, metadata = load_quran_assets(quran_ref, audio_edition=audio_edition, text_edition=text_edition)
    audio_dir = output_dir / "quran_audio_parts"
    audio_dir.mkdir(parents=True, exist_ok=True)

    cues: list[tuple[float, float, str]] = []
    concat_lines: list[str] = []
    current = 0.0

    for asset in assets:
        part_path = audio_dir / f"{metadata['surah']:03d}_{asset.ayah:03d}.mp3"
        download_file(asset.audio_url, part_path)
        duration = ffprobe_duration(part_path)
        cues.append((current, current + duration, asset.arabic))
        current += duration
        escaped_part = str(part_path.resolve()).replace("'", "'\\''")
        concat_lines.append(f"file '{escaped_part}'")

    slug = f"quran_{metadata['surah']}_{metadata['ayah_start']}"
    if metadata["ayah_end"] != metadata["ayah_start"]:
        slug += f"_{metadata['ayah_end']}"

    concat_file = output_dir / f"{slug}_concat.txt"
    concat_file.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    merged_audio = output_dir / f"{slug}_audio.mp3"
    run(
        [
            ensure_binary(FFMPEG_BIN),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_file),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(merged_audio),
        ]
    )

    srt_path = output_dir / f"{slug}.srt"
    write_srt(cues, srt_path)
    return merged_audio, srt_path, metadata


def is_image(path: Path) -> bool:
    return path.suffix.lower() in IMAGE_EXTENSIONS


def is_video(path: Path) -> bool:
    return path.suffix.lower() in VIDEO_EXTENSIONS


def render_reel(
    background_path: Path,
    audio_path: Path,
    srt_path: Path,
    output_video: Path,
    *,
    subtitle_font: str,
    subtitle_size: int,
    margin_v: int,
) -> None:
    if not background_path.exists():
        raise FileNotFoundError(f"Background not found: {background_path}")
    if not audio_path.exists():
        raise FileNotFoundError(f"Audio not found: {audio_path}")
    if not srt_path.exists():
        raise FileNotFoundError(f"SRT not found: {srt_path}")

    audio_duration = ffprobe_duration(audio_path)
    background_is_image = is_image(background_path)
    background_is_video = is_video(background_path)
    if not background_is_image and not background_is_video:
        raise ValueError("Background must be a PNG/JPG/WebP image or a video file")

    style_parts = [
        f"FontName={subtitle_font}",
        f"FontSize={subtitle_size}",
        "PrimaryColour=&H00FFFFFF",
        "OutlineColour=&H64000000",
        "BackColour=&H00000000",
        "Outline=2",
        "Shadow=1",
        "BorderStyle=1",
        "Alignment=2",
        f"MarginV={margin_v}",
    ]
    style = ",".join(style_parts)
    subtitle_filter = (
        f"subtitles='{ffmpeg_escape(srt_path)}':"
        f"force_style='{style}'"
    )
    video_filter = (
        "scale=1080:1920:force_original_aspect_ratio=increase,"
        "crop=1080:1920,"
        f"{subtitle_filter}"
    )

    cmd = [ensure_binary(FFMPEG_BIN), "-y"]
    if background_is_image:
        cmd += ["-loop", "1", "-i", str(background_path)]
    else:
        cmd += ["-stream_loop", "-1", "-i", str(background_path)]
    cmd += [
        "-i",
        str(audio_path),
        "-filter:v",
        video_filter,
        "-map",
        "0:v:0",
        "-map",
        "1:a:0",
        "-c:v",
        DEFAULT_VIDEO_CODEC,
        "-preset",
        "medium",
        "-crf",
        "18",
        "-c:a",
        DEFAULT_AUDIO_CODEC,
        "-b:a",
        "192k",
        "-pix_fmt",
        "yuv420p",
        "-t",
        f"{audio_duration:.3f}",
        str(output_video),
    ]
    run(cmd)


def build_output_dir(mode: str, label: str, explicit_output_dir: str) -> Path:
    if explicit_output_dir:
        path = Path(explicit_output_dir)
        if not path.is_absolute():
            path = ROOT / path
        path.mkdir(parents=True, exist_ok=True)
        return path
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_dir = DEFAULT_OUTPUT_ROOT / f"{mode}_{slugify(label)}_{timestamp}"
    out_dir.mkdir(parents=True, exist_ok=True)
    return out_dir


def resolve_path(path_str: str) -> Path:
    path = Path(path_str)
    if path.is_absolute():
        return path
    return (ROOT / path).resolve()


def maybe_prompt_args(args: argparse.Namespace) -> argparse.Namespace:
    if not args.mode:
        args.mode = prompt_non_empty("Mode", "non-quran").strip().lower()

    if args.mode not in {"quran", "non-quran", "vocab"}:
        raise ValueError("Mode must be 'quran', 'non-quran', or 'vocab'")

    if not args.background:
        args.background = prompt_non_empty("Background PNG/video path")

    if args.mode == "quran":
        if not args.quran_ref:
            args.quran_ref = prompt_non_empty("Quran ref (example 97:1 or 97:1-5)")
        if not args.quran_audio_edition:
            args.quran_audio_edition = prompt_non_empty("Quran audio edition", "ar.alafasy")
        if not args.quran_text_edition:
            args.quran_text_edition = prompt_non_empty("Quran text edition", "quran-uthmani")
    elif args.mode == "vocab":
        if not args.vocab_source:
            args.vocab_source = prompt_non_empty("Vocab source (top-words or custom)", "top-words")
        if args.vocab_source == "custom" and not args.vocab_lines:
            args.vocab_lines = prompt_multiline("Enter vocab lines as Arabic | English.")
    else:
        if not args.audio:
            args.audio = prompt_non_empty("Audio file path")
        if not args.language:
            args.language = prompt_non_empty("Whisper language (or auto)", "auto")
        if not args.whisper_model:
            args.whisper_model = prompt_non_empty("Whisper model or local GGML model path", "small")

    return args


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        description=(
            "Generate an SRT and a subtitle-burned reel from either Quran API data "
            "or a normal audio file. Supports PNG or video backgrounds."
        )
    )
    parser.add_argument("--mode", choices=["quran", "non-quran", "vocab"], help="Generation mode")
    parser.add_argument("--background", help="Path to a PNG/JPG/WebP image or a video file")
    parser.add_argument("--output-dir", default="", help="Output directory. Defaults to a timestamped folder under generated/reels/script_runs")

    parser.add_argument("--quran-ref", default="", help="Quran reference like 97:1 or 97:1-5")
    parser.add_argument("--quran-audio-edition", default="ar.alafasy", help="alquran.cloud audio edition for Quran mode")
    parser.add_argument("--quran-text-edition", default="quran-uthmani", help="alquran.cloud text edition for Quran mode")

    parser.add_argument("--audio", default="", help="Audio file path for non-Quran mode")
    parser.add_argument("--language", default="auto", help="Language for Whisper, or 'auto'")
    parser.add_argument("--whisper-model", default="small", help="Whisper GGML model name or a local ggml-*.bin path")
    parser.add_argument("--whisper-cache-dir", default=str(DEFAULT_WHISPER_CACHE), help="Where auto-downloaded GGML models should be stored")

    parser.add_argument("--vocab-source", default="top-words", choices=["top-words", "custom"], help="Use top Quran words from the dataset or custom Arabic | English lines")
    parser.add_argument("--vocab-title", default="", help="Optional title/label used for vocab reel output names")
    parser.add_argument("--vocab-lines", default="", help="Custom vocab lines formatted as Arabic | English, one per line")
    parser.add_argument("--vocab-count", type=int, default=12, help="How many top Quran words to use in vocab mode")
    parser.add_argument("--vocab-offset", type=int, default=0, help="Skip this many top Quran words before selecting vocab entries")
    parser.add_argument("--vocab-dataset-path", default=str(DEFAULT_VOCAB_DATA_PATH), help="Path to the top Quran words JSON dataset")
    parser.add_argument("--tts-arabic-voice", default=DEFAULT_TTS_ARABIC_VOICE, help="Edge TTS Arabic voice name")
    parser.add_argument("--tts-english-voice", default=DEFAULT_TTS_ENGLISH_VOICE, help="Edge TTS English voice name")
    parser.add_argument("--tts-arabic-rate", default=DEFAULT_TTS_ARABIC_RATE, help="Arabic TTS speaking rate, for example -6%")
    parser.add_argument("--tts-english-rate", default=DEFAULT_TTS_ENGLISH_RATE, help="English TTS speaking rate, for example -4%")
    parser.add_argument("--tts-arabic-pitch", default=DEFAULT_TTS_ARABIC_PITCH, help="Arabic TTS pitch, for example -2Hz")
    parser.add_argument("--tts-english-pitch", default=DEFAULT_TTS_ENGLISH_PITCH, help="English TTS pitch, for example -2Hz")
    parser.add_argument("--tts-pause-between-languages-ms", type=int, default=DEFAULT_TTS_PAUSE_BETWEEN_LANGUAGES_MS, help="Pause between Arabic and English audio for each word")
    parser.add_argument("--tts-pause-between-entries-ms", type=int, default=DEFAULT_TTS_PAUSE_BETWEEN_ENTRIES_MS, help="Pause between each word entry")

    parser.add_argument("--subtitle-font", default=DEFAULT_SUBTITLE_FONT, help="Subtitle font name used by FFmpeg subtitles filter")
    parser.add_argument("--subtitle-size", type=int, default=18, help="Subtitle font size")
    parser.add_argument("--subtitle-margin-v", type=int, default=80, help="Bottom subtitle margin in pixels")
    parser.add_argument("--subtitle-offset-ms", type=int, default=0, help="Shift all subtitle cues by this many milliseconds. Positive moves text later.")
    return parser


def main() -> int:
    parser = build_parser()
    args = maybe_prompt_args(parser.parse_args())

    background_path = resolve_path(args.background)
    if not background_path.exists():
        raise FileNotFoundError(f"Background path does not exist: {background_path}")

    if args.mode == "quran":
        output_dir = build_output_dir("quran", args.quran_ref, args.output_dir)
        audio_path, srt_path, metadata = build_quran_audio_and_srt(
            args.quran_ref,
            output_dir,
            audio_edition=args.quran_audio_edition,
            text_edition=args.quran_text_edition,
        )
        video_slug = f"quran_{metadata['surah']}_{metadata['ayah_start']}"
        if metadata["ayah_end"] != metadata["ayah_start"]:
            video_slug += f"_{metadata['ayah_end']}"
    elif args.mode == "vocab":
        vocab_label = args.vocab_title or (f"top_{args.vocab_count}_quran_words" if args.vocab_source == "top-words" else "custom_quran_vocab")
        output_dir = build_output_dir("vocab", vocab_label, args.output_dir)
        audio_path, srt_path, metadata = build_vocab_tts_audio_and_srt(
            output_dir,
            vocab_source=args.vocab_source,
            vocab_lines=args.vocab_lines,
            vocab_count=args.vocab_count,
            vocab_offset=args.vocab_offset,
            vocab_dataset_path=resolve_path(args.vocab_dataset_path),
            arabic_voice=args.tts_arabic_voice,
            english_voice=args.tts_english_voice,
            arabic_rate=args.tts_arabic_rate,
            english_rate=args.tts_english_rate,
            arabic_pitch=args.tts_arabic_pitch,
            english_pitch=args.tts_english_pitch,
            pause_between_languages_ms=args.tts_pause_between_languages_ms,
            pause_between_entries_ms=args.tts_pause_between_entries_ms,
            title=args.vocab_title,
        )
        video_slug = slugify(metadata.get("title", "vocab_word_reel"))
    else:
        audio_path = resolve_path(args.audio)
        if not audio_path.exists():
            raise FileNotFoundError(f"Audio path does not exist: {audio_path}")
        output_dir = build_output_dir("non_quran", audio_path.stem, args.output_dir)
        srt_path = output_dir / f"{slugify(audio_path.stem)}.srt"
        transcribe_audio_to_srt(
            audio_path,
            srt_path,
            language=args.language,
            whisper_model=args.whisper_model,
            whisper_cache_dir=resolve_path(args.whisper_cache_dir),
        )
        video_slug = f"{slugify(audio_path.stem)}_subtitled"
        metadata = {
            "mode": "non-quran",
            "language": args.language,
        }

    if args.subtitle_offset_ms:
        shift_srt_file(srt_path, args.subtitle_offset_ms)

    output_video = output_dir / f"{video_slug}.mp4"
    render_reel(
        background_path,
        audio_path,
        srt_path,
        output_video,
        subtitle_font=args.subtitle_font,
        subtitle_size=args.subtitle_size,
        margin_v=args.subtitle_margin_v,
    )

    result = {
        "ok": True,
        "mode": args.mode,
        "background": str(background_path),
        "audio": str(audio_path),
        "srt": str(srt_path),
        "video": str(output_video),
        "output_dir": str(output_dir),
        "meta": metadata,
    }
    print(json.dumps(result, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        print("\nCancelled.", file=sys.stderr)
        raise SystemExit(130)