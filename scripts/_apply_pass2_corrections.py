"""
Add verified pass2 corrections as NEW fields to reel_words_top600.json.
Only adds entries that are verified in Quran (39/47).
New fields: pass3_example, pass3_reference, pass3_translation
"""
import json, re, os

DS_PATH = "generated/reel_words_top600.json"
PASS2_PATH = "generated/gpt_examples_pass2.json"
IMLAEI_CACHE = "generated/.imlaei_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]
pass2 = json.load(open(PASS2_PATH, encoding="utf-8"))

# Load imlaei
imlaei = {}
for fn in os.listdir(IMLAEI_CACHE):
    verses = json.load(open(f"{IMLAEI_CACHE}/{fn}", encoding="utf-8"))
    for v in verses:
        imlaei[v["verse_key"]] = v["text"]

def strip_d(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653-\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F\u06DC\u06DB]', '', s)
    return s.strip()

def norm(s):
    s = strip_d(s)
    s = s.replace('\u0671', '\u0627').replace('\u0623', '\u0627')
    s = s.replace('\u0625', '\u0627').replace('\u0622', '\u0627')
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# Build rank -> word index
rank_map = {}
for i, w in enumerate(words):
    rank_map[w["rank"]] = i

# Verify each pass2 entry against Quran and apply if verified
added = 0
skipped = 0
not_found = 0

for p in pass2:
    p_ref = p["corrected_reference"]
    p_ex = p["corrected_example"]
    
    # Verify in Quran
    verse_text = imlaei.get(p_ref, "")
    if not verse_text:
        print(f"  SKIP rank {p['rank']} {p['arabic']} — ref {p_ref} not in imlaei cache")
        skipped += 1
        continue
    
    ex_n = norm(p_ex)
    verse_n = norm(verse_text)
    in_quran = ex_n in verse_n
    
    if not in_quran:
        print(f"  SKIP rank {p['rank']} {p['arabic']} — example NOT in Quran verse {p_ref}")
        skipped += 1
        continue
    
    # Find in main dataset by rank
    idx = rank_map.get(p["rank"])
    if idx is None:
        print(f"  SKIP rank {p['rank']} {p['arabic']} — rank not found in dataset")
        not_found += 1
        continue
    
    # Add new fields
    words[idx]["pass3_example"] = p["corrected_example"]
    words[idx]["pass3_reference"] = p["corrected_reference"]
    words[idx]["pass3_translation"] = p["corrected_translation"]
    added += 1

print(f"\nAdded pass3 fields: {added}")
print(f"Skipped (not in Quran): {skipped}")
print(f"Not found in dataset: {not_found}")

# Save
with open(DS_PATH, "w", encoding="utf-8") as f:
    json.dump(ds, f, ensure_ascii=False, indent=2)
print(f"Saved {DS_PATH}")
