#!/usr/bin/env python3
"""
Dummy reel: generate each line with its annotated tone via ElevenLabs,
then concatenate into a single MP3 for A/B comparison against pre-recorded clips.
"""
import io, json, subprocess, shutil, sys
from pathlib import Path
from elevenlabs.client import ElevenLabs
from elevenlabs.types import VoiceSettings

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

API_KEY  = "0ab1348a8d65d543bcb8a75f2ca3e2a5360c2badf4ba8089ee1fa98fb7c47c40"
VOICE_ID = "MFZUKuGQUsGJPQjTS4wC"
MODEL    = "eleven_multilingual_v2"
FFMPEG   = shutil.which("ffmpeg") or "ffmpeg"

OUT_DIR  = Path(__file__).resolve().parent.parent / "output" / "tone_test"
OUT_DIR.mkdir(parents=True, exist_ok=True)

# ── Tone presets mapped to the script annotations ──────────────
TONES = {
    "uplifting_clear":    {"stability": 0.50, "similarity_boost": 0.75, "style": 0.60, "speed": 0.90},
}

# ── Script lines: (filename, tone_key, text) ──────────────────
LINES = [
    ("01_intro",        "uplifting_clear", "You have heard this word many times in the Quran."),
    ("02_know",         "uplifting_clear", "Know what it means."),
    ("03_arabic_word",  "uplifting_clear", "مِن"),
    ("04_meaning",      "uplifting_clear", "It means — from."),
    ("05_example_cue",  "uplifting_clear", "Example from the Quran:"),
    ("06_example_ar",   "uplifting_clear", "وَمَآ أُنزِلَ مِن قَبْلِكَ وَبِٱلْـَٔاخِرَةِ"),
    ("07_example_en",   "uplifting_clear", "and what was sent down from before you and in the Hereafter"),
    ("08_next_time",    "uplifting_clear", "Next time when you hear this word, remember its meaning."),
    ("09_quiz_intro",   "uplifting_clear", "Revise the previous word. What does this word mean?"),
    ("10_quiz_cta",     "uplifting_clear", "Comment your answers."),
    ("11_app_promo",    "uplifting_clear", "Learn Quranic Grammar and Memorize Quran on My Quran Quest app."),
    ("12_download",     "uplifting_clear", "Download the app now or visit myquranquest.com"),
]


def tts(text: str, out: Path, tone: dict) -> Path:
    client = ElevenLabs(api_key=API_KEY)
    audio = client.text_to_speech.convert(
        text=text, voice_id=VOICE_ID, model_id=MODEL,
        output_format="mp3_44100_128",
        voice_settings=VoiceSettings(**tone),
    )
    with open(out, "wb") as f:
        for chunk in audio:
            f.write(chunk)
    return out


def silence(ms: int, out: Path) -> Path:
    subprocess.run([
        FFMPEG, "-y", "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
        "-t", f"{ms/1000:.3f}", "-c:a", "libmp3lame", "-q:a", "9", str(out),
    ], check=True, capture_output=True)
    return out


def main():
    clips = []
    gap = OUT_DIR / "gap.mp3"
    silence(500, gap)

    for fname, tone_key, text in LINES:
        tone = TONES[tone_key]
        out = OUT_DIR / f"{fname}.mp3"
        print(f"  [{tone_key:25s}] {text[:60]}...")
        tts(text, out, tone)
        clips.append(out)
        clips.append(gap)

    # Concatenate all clips
    list_file = OUT_DIR / "concat.txt"
    with open(list_file, "w") as f:
        for c in clips:
            f.write(f"file '{c.resolve()}'\n")

    final = OUT_DIR / "full_tone_test_reel.mp3"
    subprocess.run([
        FFMPEG, "-y", "-f", "concat", "-safe", "0", "-i", str(list_file),
        "-af", "volume=1.8",
        "-c:a", "libmp3lame", "-q:a", "2", str(final),
    ], check=True, capture_output=True)

    print(f"\n  Done! -> {final}")


if __name__ == "__main__":
    main()
