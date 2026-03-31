#!/usr/bin/env python3
from __future__ import annotations

import asyncio
import importlib.util
import json
import os
import re
import shutil
import subprocess
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT = Path(__file__).resolve().parents[1]
DEFAULT_VOCAB_DATA_PATH = ROOT / "memo-practice-words.json"
DEFAULT_TTS_PROVIDER = "edge-tts"
DEFAULT_TTS_ARABIC_VOICE = "ar-SA-HamedNeural"
DEFAULT_TTS_ENGLISH_VOICE = "en-US-ChristopherNeural"
DEFAULT_TTS_ARABIC_RATE = "-6%"
DEFAULT_TTS_ENGLISH_RATE = "-4%"
DEFAULT_TTS_ARABIC_PITCH = "-2Hz"
DEFAULT_TTS_ENGLISH_PITCH = "-2Hz"
DEFAULT_TTS_PAUSE_BETWEEN_LANGUAGES_MS = 260
DEFAULT_TTS_PAUSE_BETWEEN_ENTRIES_MS = 680
DEFAULT_ELEVENLABS_ARABIC_VOICE = "pNInz6obpgDQGcFmaJgB"  # Adam
DEFAULT_ELEVENLABS_ENGLISH_VOICE = "pNInz6obpgDQGcFmaJgB"  # Adam
DEFAULT_ELEVENLABS_MODEL = "eleven_multilingual_v2"
FFMPEG_BIN = "ffmpeg"
FFPROBE_BIN = "ffprobe"
SRT_LINE_RE = re.compile(
    r"^(?P<start>\d{2}:\d{2}:\d{2},\d{3})\s-->\s(?P<end>\d{2}:\d{2}:\d{2},\d{3})$"
)


@dataclass
class VocabEntry:
    arabic: str
    english: str
    transliteration: str = ""
    occurrences: int = 0


def clean_text(text: str) -> str:
    return re.sub(r"\s+", " ", str(text or "")).strip()


def slugify(text: str) -> str:
    text = clean_text(text).lower()
    text = re.sub(r"[^a-z0-9]+", "_", text)
    return text.strip("_") or "output"


def ensure_binary(name: str) -> str:
    resolved = shutil.which(name)
    if not resolved:
        raise RuntimeError(f"Required binary not found in PATH: {name}")
    return resolved


def run(cmd: list[str]) -> subprocess.CompletedProcess[str]:
    return subprocess.run(cmd, check=True, capture_output=True, text=True)


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


def write_srt(cues: Iterable[tuple[float, float, str]], out_path: Path) -> None:
    out_path.parent.mkdir(parents=True, exist_ok=True)
    lines: list[str] = []
    for idx, (start_s, end_s, text) in enumerate(cues, start=1):
        lines.append(str(idx))
        lines.append(f"{format_srt_timestamp(start_s)} --> {format_srt_timestamp(end_s)}")
        lines.append(str(text).strip())
        lines.append("")
    out_path.write_text("\n".join(lines), encoding="utf-8")


def parse_custom_vocab_lines(raw: str) -> list[VocabEntry]:
    entries: list[VocabEntry] = []
    for line_no, raw_line in enumerate(str(raw or "").replace("\r\n", "\n").split("\n"), start=1):
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        separator = "|" if "|" in line else ("\t" if "\t" in line else None)
        if not separator:
            raise ValueError(
                f"Custom vocab line {line_no} must look like Arabic | English"
            )

        arabic_raw, english_raw = [part.strip() for part in line.split(separator, 1)]
        arabic = clean_text(arabic_raw)
        english = clean_text(english_raw)
        if not arabic or not english:
            raise ValueError(
                f"Custom vocab line {line_no} must include both Arabic and English text"
            )
        entries.append(VocabEntry(arabic=arabic, english=english))

    if not entries:
        raise ValueError("No custom Arabic | English vocab lines were provided")
    return entries


def load_top_vocab_entries(dataset_path: Path, *, count: int, offset: int) -> list[VocabEntry]:
    if not dataset_path.exists():
        raise FileNotFoundError(f"Quran word dataset not found: {dataset_path}")

    payload = json.loads(dataset_path.read_text(encoding="utf-8-sig"))
    words = payload.get("words") or []
    if not isinstance(words, list) or not words:
        raise RuntimeError(f"Dataset did not contain a usable 'words' list: {dataset_path}")

    count = max(1, int(count))
    offset = max(0, int(offset))
    selected = words[offset: offset + count]
    if not selected:
        raise ValueError(
            f"No Quran words were available at offset {offset} with count {count} from {dataset_path}"
        )

    entries: list[VocabEntry] = []
    for row in selected:
        arabic = clean_text(row.get("arabic", ""))
        english = clean_text(row.get("meaning", ""))
        transliteration = clean_text(row.get("transliteration", ""))
        occurrences = int(row.get("occurrences") or 0)
        if arabic and english:
            entries.append(
                VocabEntry(
                    arabic=arabic,
                    english=english,
                    transliteration=transliteration,
                    occurrences=occurrences,
                )
            )

    if not entries:
        raise RuntimeError(f"No usable Arabic + English entries were found in {dataset_path}")
    return entries


def ensure_edge_tts_module():
    if importlib.util.find_spec("edge_tts") is None:
        raise RuntimeError(
            "Natural Arabic + English TTS needs the 'edge-tts' package and internet access. "
            "Install it with: py -3 -m pip install edge-tts"
        )
    import edge_tts
    return edge_tts


async def _save_edge_tts_audio(
    *,
    edge_tts_module,
    text: str,
    voice: str,
    out_path: Path,
    rate: str,
    pitch: str,
) -> None:
    communicate = edge_tts_module.Communicate(
        text=text,
        voice=voice,
        rate=rate,
        pitch=pitch,
    )
    await communicate.save(str(out_path))


def synthesize_edge_tts_audio(
    text: str,
    out_path: Path,
    *,
    voice: str,
    rate: str,
    pitch: str,
) -> Path:
    if not clean_text(text):
        raise ValueError("Cannot synthesize empty TTS text")

    edge_tts_module = ensure_edge_tts_module()
    out_path.parent.mkdir(parents=True, exist_ok=True)
    asyncio.run(
        _save_edge_tts_audio(
            edge_tts_module=edge_tts_module,
            text=text,
            voice=voice,
            out_path=out_path,
            rate=rate,
            pitch=pitch,
        )
    )

    if not out_path.exists() or out_path.stat().st_size == 0:
        raise RuntimeError(f"TTS synthesis completed without producing audio: {out_path}")
    return out_path


def ensure_elevenlabs_module():
    if importlib.util.find_spec("elevenlabs") is None:
        raise RuntimeError(
            "ElevenLabs TTS needs the 'elevenlabs' package. "
            "Install it with: py -3 -m pip install elevenlabs"
        )
    import elevenlabs
    return elevenlabs


def synthesize_elevenlabs_audio(
    text: str,
    out_path: Path,
    *,
    voice: str,
    api_key: str,
    model: str = DEFAULT_ELEVENLABS_MODEL,
) -> Path:
    if not clean_text(text):
        raise ValueError("Cannot synthesize empty TTS text")
    if not api_key:
        raise ValueError(
            "ElevenLabs API key is required. "
            "Set it in the UI or via the ELEVENLABS_API_KEY environment variable."
        )

    elevenlabs = ensure_elevenlabs_module()
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
        raise RuntimeError(f"ElevenLabs TTS completed without producing audio: {out_path}")
    return out_path


def create_silence_clip(duration_ms: int, out_path: Path) -> Path | None:
    duration_ms = max(0, int(duration_ms))
    if duration_ms <= 0:
        return None

    out_path.parent.mkdir(parents=True, exist_ok=True)
    run(
        [
            ensure_binary(FFMPEG_BIN),
            "-y",
            "-f",
            "lavfi",
            "-i",
            "anullsrc=r=24000:cl=mono",
            "-t",
            f"{duration_ms / 1000.0:.3f}",
            "-c:a",
            "libmp3lame",
            "-q:a",
            "9",
            str(out_path),
        ]
    )
    return out_path


def _concat_line(path: Path) -> str:
    escaped = str(path.resolve()).replace("'", "'\\''")
    return f"file '{escaped}'"


def build_vocab_tts_audio_and_srt(
    output_dir: Path,
    *,
    vocab_source: str,
    vocab_lines: str,
    vocab_count: int,
    vocab_offset: int,
    vocab_dataset_path: Path,
    arabic_voice: str,
    english_voice: str,
    arabic_rate: str,
    english_rate: str,
    arabic_pitch: str,
    english_pitch: str,
    pause_between_languages_ms: int,
    pause_between_entries_ms: int,
    title: str = "",
    tts_provider: str = DEFAULT_TTS_PROVIDER,
    elevenlabs_api_key: str = "",
    elevenlabs_model: str = DEFAULT_ELEVENLABS_MODEL,
) -> tuple[Path, Path, dict]:
    source = clean_text(vocab_source).lower() or "top-words"
    if source not in {"top-words", "custom"}:
        raise ValueError("vocab_source must be 'top-words' or 'custom'")

    if source == "custom":
        entries = parse_custom_vocab_lines(vocab_lines)
        label = clean_text(title) or "custom_quran_vocab"
    else:
        entries = load_top_vocab_entries(
            vocab_dataset_path,
            count=vocab_count,
            offset=vocab_offset,
        )
        label = clean_text(title) or f"top_{len(entries)}_quran_words"

    output_dir.mkdir(parents=True, exist_ok=True)
    parts_dir = output_dir / "vocab_tts_parts"
    parts_dir.mkdir(parents=True, exist_ok=True)

    language_gap = create_silence_clip(
        pause_between_languages_ms,
        parts_dir / "_pause_between_languages.mp3",
    )
    entry_gap = create_silence_clip(
        pause_between_entries_ms,
        parts_dir / "_pause_between_entries.mp3",
    )

    provider = clean_text(tts_provider).lower() or DEFAULT_TTS_PROVIDER
    use_elevenlabs = provider == "elevenlabs"
    if use_elevenlabs:
        el_api_key = clean_text(elevenlabs_api_key) or os.environ.get("ELEVENLABS_API_KEY", "")
        el_model = clean_text(elevenlabs_model) or DEFAULT_ELEVENLABS_MODEL

    concat_lines: list[str] = []
    cues: list[tuple[float, float, str]] = []
    current = 0.0

    for idx, entry in enumerate(entries, start=1):
        cue_start = current

        arabic_path = parts_dir / f"{idx:03d}_arabic.mp3"
        if use_elevenlabs:
            synthesize_elevenlabs_audio(
                entry.arabic,
                arabic_path,
                voice=arabic_voice,
                api_key=el_api_key,
                model=el_model,
            )
        else:
            synthesize_edge_tts_audio(
                entry.arabic,
                arabic_path,
                voice=arabic_voice,
                rate=arabic_rate,
                pitch=arabic_pitch,
            )
        arabic_duration = ffprobe_duration(arabic_path)
        concat_lines.append(_concat_line(arabic_path))
        current += arabic_duration

        if language_gap:
            concat_lines.append(_concat_line(language_gap))
            current += pause_between_languages_ms / 1000.0

        english_path = parts_dir / f"{idx:03d}_english.mp3"
        if use_elevenlabs:
            synthesize_elevenlabs_audio(
                entry.english,
                english_path,
                voice=english_voice,
                api_key=el_api_key,
                model=el_model,
            )
        else:
            synthesize_edge_tts_audio(
                entry.english,
                english_path,
                voice=english_voice,
                rate=english_rate,
                pitch=english_pitch,
            )
        english_duration = ffprobe_duration(english_path)
        concat_lines.append(_concat_line(english_path))
        current += english_duration

        cue_text = f"{entry.arabic}\n{entry.english}"
        cues.append((cue_start, current, cue_text))

        if idx != len(entries) and entry_gap:
            concat_lines.append(_concat_line(entry_gap))
            current += pause_between_entries_ms / 1000.0

    concat_path = output_dir / f"{slugify(label)}_tts_concat.txt"
    concat_path.write_text("\n".join(concat_lines) + "\n", encoding="utf-8")

    merged_audio = output_dir / f"{slugify(label)}_tts_audio.mp3"
    run(
        [
            ensure_binary(FFMPEG_BIN),
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            str(concat_path),
            "-c:a",
            "libmp3lame",
            "-q:a",
            "2",
            str(merged_audio),
        ]
    )

    srt_path = output_dir / f"{slugify(label)}_tts.srt"
    write_srt(cues, srt_path)

    metadata = {
        "mode": "vocab",
        "vocab_source": source,
        "title": label,
        "entry_count": len(entries),
        "tts_provider": provider,
        "arabic_voice": arabic_voice,
        "english_voice": english_voice,
        "pause_between_languages_ms": int(pause_between_languages_ms),
        "pause_between_entries_ms": int(pause_between_entries_ms),
    }
    if use_elevenlabs:
        metadata["elevenlabs_model"] = el_model
    else:
        metadata["arabic_rate"] = arabic_rate
        metadata["english_rate"] = english_rate
        metadata["arabic_pitch"] = arabic_pitch
        metadata["english_pitch"] = english_pitch
    if source == "top-words":
        metadata["vocab_dataset_path"] = str(vocab_dataset_path)
        metadata["vocab_count"] = int(vocab_count)
        metadata["vocab_offset"] = int(vocab_offset)

    return merged_audio, srt_path, metadata
