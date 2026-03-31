"""
Create JSON for all yes-other-verse entries with correct verse reference.
Also fix pass2_gpt_reference in the main dataset.
"""
import json, re

DS_PATH = "generated/reel_words_top600.json"
CACHE_DIR = "generated/.imlaei_cache"

# Load imlaei cache
quran = {}
for ch in range(1, 115):
    for v in json.load(open(f"{CACHE_DIR}/chapter_{ch}.json", encoding="utf-8")):
        quran[v["verse_key"]] = v["text"]

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def norm(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

quran_normed = {vk: norm(txt) for vk, txt in quran.items()}

# Find correct verse for all yes-other-verse entries
others = [w for w in words if w.get("pass2_verification") == "yes-other-verse"]
print(f"Total yes-other-verse: {len(others)}")

output = []
fixed = 0
for w in others:
    ex = w.get("pass2_gpt_example", "")
    ex_n = norm(ex)
    
    # Find the actual verse
    correct_ref = None
    for vk, vn in quran_normed.items():
        if ex_n in vn:
            correct_ref = vk
            break
    
    entry = {
        "rank": w["rank"],
        "key": w.get("key", ""),
        "arabic": w["arabic"],
        "transliteration": w.get("transliteration", ""),
        "meaning": w.get("meaning", ""),
        "occurrences": w.get("occurrences", 0),
        "first_seen": w.get("first_seen", ""),
        "pass2_gpt_example": ex,
        "pass2_gpt_reference": w.get("pass2_gpt_reference", ""),
        "pass2_found_in": correct_ref or "",
        "pass2_verification": "yes-other-verse",
    }
    output.append(entry)
    
    # Also fix the reference in the main dataset
    if correct_ref:
        w["pass2_gpt_reference"] = correct_ref
        w["pass2_verification"] = "yes"
        if "pass2_found_in" in w:
            del w["pass2_found_in"]
        fixed += 1

# Save the extracted JSON
with open("generated/pass2_other_verse_95.json", "w", encoding="utf-8") as fp:
    json.dump(output, fp, ensure_ascii=False, indent=2)
print(f"Saved {len(output)} entries to generated/pass2_other_verse_95.json")

# Save updated main dataset
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)
print(f"Fixed {fixed} references in main dataset")

# Final counts
counts = {}
for w in words:
    v = w.get("pass2_verification", "?")
    counts[v] = counts.get(v, 0) + 1
print(f"\nFinal counts:")
for k, v in sorted(counts.items()):
    print(f"  {k}: {v}")
