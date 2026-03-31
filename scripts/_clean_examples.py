"""Clean example_en and meaning fields in reel_words_top600.json.
Removes (), [], and cleans up for better TTS pronunciation."""
import json, re
from pathlib import Path

fp = Path(__file__).resolve().parent.parent / "generated" / "reel_words_top600.json"
data = json.loads(fp.read_text(encoding="utf-8"))

def clean_for_tts(text):
    """Remove brackets, parens, and other TTS-unfriendly chars."""
    t = text
    t = re.sub(r'\[([^\]]*)\]', r'\1', t)   # [d] -> d
    t = re.sub(r'\(([^)]*)\)', r'\1', t)     # (is) -> is
    t = re.sub(r'\s+', ' ', t).strip()       # collapse whitespace
    # Remove leading/trailing punctuation artifacts
    t = t.strip(' ,;-')
    return t

changed = 0
for w in data["words"]:
    for field in ("example_en", "meaning", "example_ar"):
        old = w.get(field, "")
        if not old:
            continue
        new = clean_for_tts(old)
        if new != old:
            print(f"  rank {w['rank']} {field}: {old!r} -> {new!r}")
            w[field] = new
            changed += 1

fp.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
print(f"\nDone. {changed} fields cleaned.")
