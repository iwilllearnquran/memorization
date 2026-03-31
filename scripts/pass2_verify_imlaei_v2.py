"""
Pass 2 Verification v2 against standard Arabic (imlaei) text.
- Normalises whitespace (collapse double spaces)
- If cited verse fails, searches entire Quran for the phrase
- Adds pass2_verification: "yes", "yes-other-verse", or "no"
"""
import json, os, re

DS_PATH = "generated/reel_words_top600.json"
CACHE_DIR = "generated/.imlaei_cache"

# Load imlaei cache
quran = {}
for ch in range(1, 115):
    for v in json.load(open(f"{CACHE_DIR}/chapter_{ch}.json", encoding="utf-8")):
        quran[v["verse_key"]] = v["text"]

print(f"Loaded {len(quran)} imlaei verses")

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def norm(s):
    """Strip harakat + normalise alef forms + collapse whitespace."""
    # Strip diacritics
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653\u0654\u0655\u0640\u06E5\u06E6'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    # Normalise alef variants: ٱ أ إ آ → ا
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    # Normalise alef maqsura → ya: ى → ي
    s = s.replace('\u0649', '\u064A')
    # Normalise ta marbuta → ha: ة → ه
    s = s.replace('\u0629', '\u0647')
    # Collapse whitespace
    return re.sub(r'\s+', ' ', s).strip()

# Pre-normalise all verses for search
quran_normed = {vk: norm(txt) for vk, txt in quran.items()}

yes = 0
yes_other = 0
no = 0
empty = 0
no_list = []

for w in words:
    ex = w.get("pass2_gpt_example", "")
    ref = w.get("pass2_gpt_reference", "")

    if not ex or not ref:
        w["pass2_verification"] = "no"
        empty += 1
        continue

    ex_n = norm(ex)

    # 1. Check cited verse
    verse_n = quran_normed.get(ref, "")
    if verse_n and ex_n in verse_n:
        w["pass2_verification"] = "yes"
        yes += 1
        continue

    # 2. Search entire Quran
    found = None
    for vk, vn in quran_normed.items():
        if ex_n in vn:
            found = vk
            break

    if found:
        w["pass2_verification"] = "yes-other-verse"
        w["pass2_found_in"] = found
        yes_other += 1
    else:
        w["pass2_verification"] = "no"
        no += 1
        no_list.append({
            "rank": w["rank"], "arabic": w["arabic"],
            "ex": ex, "ref": ref,
            "ex_n": ex_n,
            "verse_n": quran_normed.get(ref, "(no verse)")[:80]
        })

with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nResults (imlaei v2 with space-norm + fallback search):")
print(f"  yes (cited verse):     {yes}")
print(f"  yes (other verse):     {yes_other}")
print(f"  no:                    {no}")
print(f"  empty:                 {empty}")
print(f"  total:                 {yes + yes_other + no + empty}")

# Show some "no" examples
print(f"\n--- Sample 'no' failures ---")
for item in no_list[:15]:
    print(f"\n  [{item['rank']}] {item['arabic']} ref={item['ref']}")
    print(f"    GPT normed: {item['ex_n']}")
    print(f"    Verse norm: {item['verse_n']}")
