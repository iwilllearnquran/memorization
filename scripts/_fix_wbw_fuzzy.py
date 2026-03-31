"""
Fix remaining 85 QURAN_TRANSLATION using fuzzy position matching.
- For word count mismatches: use fuzzy matching between imlaei and WBW
- For imlaei match failures: try substring/fuzzy matching
"""
import json, os, re

DS_PATH = "generated/reel_words_top600.json"
WBW_CACHE = "generated/.wbw_cache"
IMLAEI_CACHE = "generated/.imlaei_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

wbw = {}
for fn in os.listdir(WBW_CACHE):
    d = json.load(open(f"{WBW_CACHE}/{fn}", encoding="utf-8"))
    wbw.update(d)

imlaei = {}
for fn in os.listdir(IMLAEI_CACHE):
    verses = json.load(open(f"{IMLAEI_CACHE}/{fn}", encoding="utf-8"))
    for v in verses:
        imlaei[v["verse_key"]] = v["text"]

def norm(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

def fuzzy_match_words(a, b):
    """Check if two normalized Arabic words match fuzzily"""
    if a == b:
        return True
    # One contains the other
    if a in b or b in a:
        return True
    # Remove leading و (waw conjunction) and check
    a2 = a.lstrip('و') if len(a) > 2 else a
    b2 = b.lstrip('و') if len(b) > 2 else b
    if a2 == b2:
        return True
    if a2 in b2 or b2 in a2:
        return True
    # Remove leading ف/ل/ب prefixes
    for prefix in ['ف', 'ل', 'ب', 'ك', 'وال', 'ال', 'و']:
        if a.startswith(prefix) and a[len(prefix):] == b:
            return True
        if b.startswith(prefix) and b[len(prefix):] == a:
            return True
    return False

fixed = 0
failed = 0
fail_samples = []

for w in words:
    if w.get("QURAN_TRANSLATION"):
        continue
    
    ref = w.get("pass2_gpt_reference", "")
    ex = w.get("pass2_gpt_example", "")
    if not ex or not ref:
        failed += 1
        continue

    verse_imlaei = imlaei.get(ref, "")
    verse_wbw = wbw.get(ref, [])
    
    if not verse_wbw:
        failed += 1
        fail_samples.append(f"  NO_WBW [{w['rank']}] ref={ref}")
        continue

    ex_words_n = [norm(ew) for ew in ex.split()]
    wbw_words_n = [norm(ww["ar"]) for ww in verse_wbw]
    
    # Strategy 1: Direct fuzzy sliding window on WBW
    best_score = 0
    best_start = -1
    
    for i in range(len(wbw_words_n) - len(ex_words_n) + 1):
        score = sum(1 for j in range(len(ex_words_n)) 
                    if fuzzy_match_words(ex_words_n[j], wbw_words_n[i + j]))
        if score > best_score:
            best_score = score
            best_start = i
    
    # Strategy 2: Sequential greedy match (for when conjunctions are split differently)
    greedy_indices = []
    search_from = 0
    for ew in ex_words_n:
        found = False
        for j in range(search_from, len(wbw_words_n)):
            if fuzzy_match_words(ew, wbw_words_n[j]):
                greedy_indices.append(j)
                search_from = j + 1
                found = True
                break
        if not found:
            break
    
    greedy_ok = len(greedy_indices) == len(ex_words_n)
    
    # Use the best approach
    if best_score == len(ex_words_n):
        # Perfect sliding window match
        matched_en = [verse_wbw[best_start + j]["en"] for j in range(len(ex_words_n))]
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        fixed += 1
    elif best_score >= len(ex_words_n) * 0.7 and best_start >= 0:
        # Good enough sliding window
        matched_en = [verse_wbw[best_start + j]["en"] for j in range(len(ex_words_n))]
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        fixed += 1
    elif greedy_ok:
        # Greedy sequential match
        matched_en = [verse_wbw[idx]["en"] for idx in greedy_indices]
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        fixed += 1
    else:
        failed += 1
        if len(fail_samples) < 15:
            fail_samples.append(
                f"  [{w['rank']}] ref={ref} best_score={best_score}/{len(ex_words_n)} greedy={len(greedy_indices)}/{len(ex_words_n)}"
                f"\n    ex={ex_words_n}"
                f"\n    wbw={wbw_words_n}"
            )

print(f"Fixed: {fixed}")
print(f"Failed: {failed}")
for s in fail_samples:
    print(s)

with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

qt = sum(1 for x in words if x.get("QURAN_TRANSLATION"))
print(f"\nTotal QURAN_TRANSLATION: {qt}/600")
