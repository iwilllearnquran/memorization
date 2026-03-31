#!/usr/bin/env python3
"""One-time script: remove Proper Noun entries and re-rank."""
import json
from pathlib import Path

fp = Path(__file__).resolve().parent.parent / "generated" / "reel_words_top600.json"
data = json.loads(fp.read_text(encoding="utf-8"))
before = len(data["words"])

removed = [w for w in data["words"] if w.get("pos_tag") == "Proper Noun"]
filtered = [w for w in data["words"] if w.get("pos_tag") != "Proper Noun"]

print(f"Before: {before} words")
print(f"Removed {len(removed)} proper nouns:")
for w in removed:
    print(f"  rank {w['rank']:3d}  {w['arabic']}  =  {w['meaning']}  ({w['occurrences']:,}x)")

# Re-rank
for i, w in enumerate(filtered, 1):
    w["rank"] = i

data["words"] = filtered
data["total_words"] = len(filtered)

fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nAfter: {len(filtered)} words. File saved.")
