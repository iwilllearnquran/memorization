import json, os, re
from collections import Counter

raw = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = raw["words"] if isinstance(raw, dict) else raw

cache_dir = "generated/.quran_full_cache"
quran = {}
for fname in os.listdir(cache_dir):
    if not fname.startswith("chapter_") or not fname.endswith(".json"):
        continue
    ch_data = json.load(open(os.path.join(cache_dir, fname), encoding="utf-8"))
    verses = ch_data if isinstance(ch_data, list) else ch_data.get("verses", [])
    for v in verses:
        key = v.get("verse_key", "")
        text = v.get("text", "")
        if key and text:
            quran[key] = text

def strip_d(s):
    return re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]', '', s)

r = Counter()
mismatches = []
for w in words:
    ex = w.get("gpt_example", "")
    ref = w.get("gpt_reference", "")
    ver = w.get("gpt_verified", "")
    if not ex:
        r["NO_EX"] += 1
        continue
    if not ref:
        r["NO_REF"] += 1
        continue
    vt = quran.get(ref, "")
    if not vt:
        r["MISS_VERSE"] += 1
        continue
    if ex in vt:
        r["EXACT"] += 1
    elif strip_d(ex) in strip_d(vt):
        r["LOOSE"] += 1
    else:
        r["MISMATCH"] += 1
        mismatches.append(w)

exact = r["EXACT"]
loose = r["LOOSE"]
mismatch = r["MISMATCH"]
print(f"EXACT: {exact}, LOOSE: {loose}, MISMATCH: {mismatch}")
print(f"OK: {exact+loose}/600")
print(f"\nMismatches by gpt_verified type:")
by_type = Counter(w["gpt_verified"] for w in mismatches)
for k, v in by_type.most_common():
    print(f"  {k}: {v}")
