"""
Pass 2 Verification: Check if each pass2_gpt_example phrase actually appears
in the cited pass2_gpt_reference verse, using harakat-stripped comparison.
Adds pass2_verification field: "yes" or "no".
"""
import json, os, re

# Load dataset
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

# Load full Quran cache
quran = {}
cache_dir = "generated/.quran_full_cache"
for ch in range(1, 115):
    path = os.path.join(cache_dir, f"chapter_{ch}.json")
    for v in json.load(open(path, encoding="utf-8")):
        quran[v["verse_key"]] = v["text"]

print(f"Loaded {len(quran)} verses")

def strip_harakat(s):
    """Remove all diacritics/tashkeel for comparison."""
    # Remove: tashkeel (064B-065F), hamza above/below (0654,0655,0653),
    # maddah, superscript alef, small marks, etc.
    return re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653\u0654\u0655\u0640\u06E5\u06E6'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )

yes = 0
no = 0
empty = 0

for w in words:
    ex = w.get("pass2_gpt_example", "")
    ref = w.get("pass2_gpt_reference", "")

    if not ex or not ref:
        w["pass2_verification"] = "no"
        empty += 1
        continue

    verse_text = quran.get(ref, "")
    if not verse_text:
        w["pass2_verification"] = "no"
        no += 1
        continue

    ex_stripped = strip_harakat(ex)
    verse_stripped = strip_harakat(verse_text)

    if ex_stripped in verse_stripped:
        w["pass2_verification"] = "yes"
        yes += 1
    else:
        w["pass2_verification"] = "no"
        no += 1

# Save
with open("generated/reel_words_top600.json", "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nResults:")
print(f"  yes:   {yes}")
print(f"  no:    {no}")
print(f"  empty: {empty}")
print(f"  total: {yes + no + empty}")
