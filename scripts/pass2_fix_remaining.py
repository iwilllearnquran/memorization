"""
Programmatically fix all remaining pass2 'no' entries by searching
the imlaei (standard Arabic) Quran cache for each word.
Extracts a 2-5 word window containing the word from the verse.
Marks pass2_verification = "non_gpt".
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

def strip(s):
    """Strip all diacritics + normalise for search."""
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A')
    s = s.replace('\u0624', '\u0648')
    s = s.replace('\u0621', '')
    s = s.replace('\u0649', '\u064A')
    s = s.replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# Pre-strip all verses
quran_stripped = {}
for vk, txt in quran.items():
    quran_stripped[vk] = (strip(txt), txt)

def find_word_in_quran(arabic_word):
    """Search for the word in all verses, return (verse_key, window_text) or None."""
    word_s = strip(arabic_word)
    
    best = None
    for vk, (v_stripped, v_orig) in quran_stripped.items():
        v_words_s = v_stripped.split()
        v_words_o = v_orig.split()
        
        # Find the word in stripped verse words
        for i, ws in enumerate(v_words_s):
            if ws == word_s:
                # Found! Extract a 2-5 word window from the ORIGINAL verse
                # Try to get ~3 words centered on the target
                start = max(0, i - 1)
                end = min(len(v_words_o), i + 3)  # 2-4 words total
                window = ' '.join(v_words_o[start:end])
                
                # Verify the window is a substring of the original verse
                if window in v_orig:
                    # Prefer shorter surahs (words appear more prominently)
                    ch = int(vk.split(':')[0])
                    verse_len = len(v_words_o)
                    score = verse_len  # prefer shorter verses
                    if best is None or score < best[2]:
                        best = (vk, window, score)
                    # Don't search forever, break after finding a good short one
                    if verse_len <= 10:
                        return (vk, window)
                break  # only check first occurrence per verse
    
    return (best[0], best[1]) if best else None

# Fix all "no" entries
to_fix = [w for w in words if w.get("pass2_verification") == "no"]
print(f"\nFixing {len(to_fix)} entries...")

fixed = 0
failed = 0

for w in to_fix:
    result = find_word_in_quran(w["arabic"])
    if result:
        vk, window = result
        w["pass2_gpt_example"] = window
        w["pass2_gpt_reference"] = vk
        w["pass2_verification"] = "non_gpt"
        if "pass2_found_in" in w:
            del w["pass2_found_in"]
        fixed += 1
        print(f"  [{w['rank']}] {w['arabic']} → {window} ({vk})")
    else:
        # Try partial match (word might have prefixes)
        failed += 1
        print(f"  [{w['rank']}] {w['arabic']} — NOT FOUND")

print(f"\nFixed: {fixed}, Not found: {failed}")

# For any remaining not found, try prefix-aware search
if failed > 0:
    print("\n--- Retrying with substring match ---")
    still_no = [w for w in words if w.get("pass2_verification") == "no"]
    for w in still_no:
        word_s = strip(w["arabic"])
        found = False
        for vk, (v_stripped, v_orig) in quran_stripped.items():
            v_words_s = v_stripped.split()
            v_words_o = v_orig.split()
            for i, ws in enumerate(v_words_s):
                # Check if the word appears as a substring of a verse word
                # (for prefixed words like لمن، للذين etc.)
                if word_s in ws or ws in word_s:
                    start = max(0, i - 1)
                    end = min(len(v_words_o), i + 3)
                    window = ' '.join(v_words_o[start:end])
                    if window in v_orig:
                        w["pass2_gpt_example"] = window
                        w["pass2_gpt_reference"] = vk
                        w["pass2_verification"] = "non_gpt"
                        print(f"  [{w['rank']}] {w['arabic']} → {window} ({vk})")
                        found = True
                        break
            if found:
                break
        if not found:
            # Last resort: search stripped word as substring of stripped verse
            for vk, (v_stripped, v_orig) in quran_stripped.items():
                if word_s in v_stripped:
                    # Find position and extract window
                    idx = v_stripped.find(word_s)
                    # Map character position to word position
                    prefix = v_stripped[:idx]
                    word_idx = len(prefix.split()) - (1 if prefix.endswith(' ') or prefix == '' else 0)
                    v_words_o = v_orig.split()
                    start = max(0, word_idx)
                    end = min(len(v_words_o), start + 4)
                    window = ' '.join(v_words_o[start:end])
                    if window in v_orig:
                        w["pass2_gpt_example"] = window
                        w["pass2_gpt_reference"] = vk
                        w["pass2_verification"] = "non_gpt"
                        print(f"  [{w['rank']}] {w['arabic']} → {window} ({vk})")
                        break

# Save
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

# Final count
counts = {}
for w in words:
    v = w.get("pass2_verification", "?")
    counts[v] = counts.get(v, 0) + 1
print(f"\nFinal counts:")
for k, v in sorted(counts.items()):
    print(f"  {k}: {v}")
