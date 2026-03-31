"""
Fix final 29 QURAN_TRANSLATION using aggressive matching.
Handle: ya-merge (يا+word → يا word), alef dropping, etc.
"""
import json, os, re

DS_PATH = "generated/reel_words_top600.json"
WBW_CACHE = "generated/.wbw_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

wbw = {}
for fn in os.listdir(WBW_CACHE):
    d = json.load(open(f"{WBW_CACHE}/{fn}", encoding="utf-8"))
    wbw.update(d)

def norm(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

def strip_alef(s):
    """Remove all alef characters for aggressive matching"""
    return s.replace('\u0627', '')

def match_score(a, b):
    """Score how well two normalized Arabic words match (0-1)"""
    if a == b:
        return 1.0
    # Strip-alef match (handles الصالحات vs الصلحت, السماوات vs السموت, etc.)
    if strip_alef(a) == strip_alef(b):
        return 0.95
    # One contains the other
    if len(a) > 1 and len(b) > 1:
        if a in b or b in a:
            return 0.85
    # Strip-alef containment
    sa, sb = strip_alef(a), strip_alef(b)
    if len(sa) > 1 and len(sb) > 1:
        if sa in sb or sb in sa:
            return 0.8
    # First 2 chars and last char match (common root pattern)
    if len(a) >= 3 and len(b) >= 3 and a[:2] == b[:2] and a[-1] == b[-1]:
        return 0.6
    return 0.0

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

    verse_wbw = wbw.get(ref, [])
    if not verse_wbw:
        failed += 1
        continue

    ex_words = ex.split()
    ex_words_n = [norm(ew) for ew in ex_words]
    wbw_n = [norm(ww["ar"]) for ww in verse_wbw]
    
    # Handle يا merge: if example starts with يا, try merging first two words
    merged_ex = None
    if len(ex_words_n) >= 2 and ex_words_n[0] == 'يا':
        merged_ex = ['يا' + ex_words_n[1]] + ex_words_n[2:]
    
    # Also try: if example has يا ايها → يايها  
    ya_ayuha = None
    if len(ex_words_n) >= 2 and ex_words_n[0] == 'يا' and ex_words_n[1] in ('ايها', 'اهل', 'بني'):
        ya_ayuha = ['يا' + ex_words_n[1]] + ex_words_n[2:]

    best_result = None
    best_total_score = 0

    for try_ex in [ex_words_n, merged_ex, ya_ayuha]:
        if try_ex is None:
            continue
        
        for i in range(len(wbw_n) - len(try_ex) + 1):
            total = sum(match_score(try_ex[j], wbw_n[i+j]) for j in range(len(try_ex)))
            if total > best_total_score:
                best_total_score = total
                best_result = (i, try_ex)
    
    threshold = len(ex_words_n) * 0.55  # At least 55% match
    
    if best_result and best_total_score >= threshold:
        start_idx, matched_ex = best_result
        # For merged ex, we need to map back
        if matched_ex is not ex_words_n:
            # The WBW window is shorter (merged), need to include the ya WBW
            matched_en = [verse_wbw[start_idx + j]["en"] for j in range(len(matched_ex))]
        else:
            matched_en = [verse_wbw[start_idx + j]["en"] for j in range(len(matched_ex))]
        
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        fixed += 1
        print(f"  OK [{w['rank']}] score={best_total_score:.1f}/{len(ex_words_n)} → {w['QURAN_TRANSLATION']}")
    else:
        failed += 1
        if len(fail_samples) < 20:
            fail_samples.append(
                f"  [{w['rank']}] ref={ref} best={best_total_score:.1f}/{len(ex_words_n)}"
                f"\n    ex={ex_words_n}"
                f"\n    wbw={wbw_n}"
            )

print(f"\nFixed: {fixed}")
print(f"Failed: {failed}")
for s in fail_samples:
    print(s)

with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

qt = sum(1 for x in words if x.get("QURAN_TRANSLATION"))
print(f"\nTotal QURAN_TRANSLATION: {qt}/600")
