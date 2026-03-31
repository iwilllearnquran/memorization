"""
Strict verification of ALL 600 words: check that gpt_example text
actually appears in the cited gpt_reference verse from cached Quran.
"""
import json, os, re
from collections import Counter

# Load dataset
raw = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = raw["words"] if isinstance(raw, dict) else raw

# Load full Quran cache
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

print(f"Loaded {len(quran)} verses, {len(words)} words\n")

def strip_diacritics(s):
    return re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]', '', s)

results = Counter()
issues = []

for w in words:
    rank = w["rank"]
    ar = w["arabic"]
    ex = w.get("gpt_example", "")
    ref = w.get("gpt_reference", "")
    verified = w.get("gpt_verified", "")
    
    if not ex:
        results["NO_EXAMPLE"] += 1
        issues.append((rank, ar, verified, "NO_EXAMPLE", ref))
        continue
    if not ref:
        results["NO_REF"] += 1
        issues.append((rank, ar, verified, "NO_REF", ""))
        continue
    
    verse_text = quran.get(ref, "")
    if not verse_text:
        results["MISSING_VERSE"] += 1
        issues.append((rank, ar, verified, "MISSING_VERSE", ref))
        continue
    
    if ex in verse_text:
        results["EXACT"] += 1
    elif strip_diacritics(ex) in strip_diacritics(verse_text):
        results["LOOSE"] += 1
    else:
        results["MISMATCH"] += 1
        issues.append((rank, ar, verified, "MISMATCH", ref))

print("Verification results:")
for k in ["EXACT", "LOOSE", "MISMATCH", "NO_EXAMPLE", "NO_REF", "MISSING_VERSE"]:
    if results[k]:
        print(f"  {k}: {results[k]}")

print(f"\nTotal OK: {results['EXACT'] + results['LOOSE']}/{len(words)}")

if issues:
    print(f"\n{'='*60}")
    print(f"Issues ({len(issues)}):\n")
    for rank, ar, verified, problem, ref in issues:
        w_entry = next(x for x in words if x["rank"] == rank)
        ex = w_entry.get("gpt_example", "")[:80]
        verse = quran.get(ref, "")[:120] if ref else ""
        print(f"  rank={rank:<4} {ar:<20} [{verified}] -> {problem} ref={ref}")
        if problem == "MISMATCH":
            print(f"    EX:    {ex}")
            print(f"    VERSE: {verse}")
            print()
