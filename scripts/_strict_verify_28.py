"""
Strict verifier: For every word in reel_words_top600.json,
check that gpt_example text actually appears in the cited gpt_reference verse.
Focus on the 24 from-uthmani-search + 4 from-verse-window entries.
"""
import json, os, re

# Load dataset
raw = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = raw["words"] if isinstance(raw, dict) else raw

# Load full Quran cache
cache_dir = "generated/.quran_full_cache"
quran = {}  # "chapter:verse" -> uthmani text
for fname in os.listdir(cache_dir):
    if not fname.startswith("chapter_") or not fname.endswith(".json"):
        continue
    ch_data = json.load(open(os.path.join(cache_dir, fname), encoding="utf-8"))
    if isinstance(ch_data, list):
        verses = ch_data
    elif isinstance(ch_data, dict):
        verses = ch_data.get("verses", ch_data.get("result", []))
        if isinstance(verses, dict):
            verses = verses.get("verses", [])
    else:
        verses = []
    for v in verses:
        key = v.get("verse_key", "")
        text = v.get("text", "")
        if key and text:
            quran[key] = text

print(f"Loaded {len(quran)} verses\n")

# Check the 28 entries (24 uthmani-search + 4 verse-window)
targets = [w for w in words if w.get("gpt_verified") in ("from-uthmani-search", "from-verse-window")]
print(f"Checking {len(targets)} entries...\n")

def strip_diacritics(s):
    """Remove all tashkeel/diacritics for loose comparison."""
    return re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]', '', s)

issues = []
for w in targets:
    rank = w["rank"]
    ar = w["arabic"]
    ex = w.get("gpt_example", "")
    ref = w.get("gpt_reference", "")
    verified = w.get("gpt_verified", "")
    
    # Get verse text
    verse_text = quran.get(ref, "")
    if not verse_text:
        print(f"  MISSING VERSE  rank={rank:<4} {ar:<20} ref={ref}")
        issues.append(w)
        continue
    
    # Check if example appears in verse (exact)
    if ex in verse_text:
        status = "OK-exact"
    elif strip_diacritics(ex) in strip_diacritics(verse_text):
        status = "OK-loose"
    else:
        status = "MISMATCH"
        issues.append(w)
    
    print(f"  {status:<12} rank={rank:<4} {ar:<20} ref={ref:<8} [{verified}]")
    if status == "MISMATCH":
        # Show what we have vs what's in the verse
        print(f"    EXAMPLE: {ex[:80]}")
        print(f"    VERSE:   {verse_text[:120]}")
        print()

print(f"\n{'='*60}")
print(f"Total checked: {len(targets)}")
print(f"Issues: {len(issues)}")
