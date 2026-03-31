#!/usr/bin/env python3
"""Quick preview: generate Frame 1 + Frame 2 images only (no TTS/video)."""
import json, sys, io
from pathlib import Path

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

sys.path.insert(0, str(Path(__file__).resolve().parent))
from sample_word_reel import (
    create_combined_poster, create_quiz_poster, _build_quiz_options,
    DATASET_PATH, OUTPUT_DIR, MEMORIZATION_ROOT,
)

data = json.loads(DATASET_PATH.read_text(encoding="utf-8"))
all_words = data["words"]
word = all_words[1]  # rank 2 – so quiz can test previous word (rank 1)

bg = str(MEMORIZATION_ROOT / "background" / "reel_bg.png")
out_dir = OUTPUT_DIR / "_preview"
out_dir.mkdir(parents=True, exist_ok=True)

print(f"Word: {word['arabic']} = {word['meaning']}")

# Frame 1
f1 = create_combined_poster(
    word["arabic"], word["meaning"], word.get("transliteration", ""),
    bg, out_dir / "frame1_combined.png",
    pos_tag=word.get("pos_tag", ""), occurrences=word.get("occurrences", 0),
    root=word.get("root", ""), rank=word.get("rank", 0),
    example_ar=word.get("example_ar", ""), example_en=word.get("example_en", ""),
    example_ref=word.get("example_ref", ""), focus_word_ar=word["arabic"],
)
print(f"Frame 1 saved: {f1}")

# Frame 2 – quiz on the PREVIOUS word (rank 1)
prev_word = all_words[0]
options = _build_quiz_options(prev_word["meaning"], all_words, prev_word["rank"])
f2 = create_quiz_poster(
    prev_word["arabic"], prev_word.get("transliteration", ""),
    options, options.index(prev_word["meaning"]),
    bg, out_dir / "frame2_quiz.png", rank=prev_word.get("rank", 0),
)
print(f"Frame 2 saved: {f2}  (quiz on previous word: {prev_word['arabic']})")
print("Done!")
