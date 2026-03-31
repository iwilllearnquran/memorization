"""
Fix remaining 194 QURAN_TRANSLATION by matching via imlaei word positions.

Strategy: 
1. Find the example phrase in the imlaei verse text (we know it's there from pass2 verification)
2. Determine which word indices in the imlaei text correspond to the phrase
3. Map those indices to WBW entries (same verse, same word count)
4. Concatenate the English WBW translations
"""
import json, os, re

DS_PATH = "generated/reel_words_top600.json"
WBW_CACHE = "generated/.wbw_cache"
IMLAEI_CACHE = "generated/.imlaei_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

# Load WBW
wbw = {}
for fn in os.listdir(WBW_CACHE):
    d = json.load(open(f"{WBW_CACHE}/{fn}", encoding="utf-8"))
    wbw.update(d)

# Load imlaei (list of {verse_key, text} per chapter file)
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
    
    if not verse_imlaei or not verse_wbw:
        failed += 1
        fail_samples.append(f"  NO_DATA [{w['rank']}] ref={ref}")
        continue

    # Split imlaei verse into words
    imlaei_words = verse_imlaei.split()
    ex_words = ex.split()
    
    # Normalize for matching
    imlaei_words_n = [norm(iw) for iw in imlaei_words]
    ex_words_n = [norm(ew) for ew in ex_words]
    
    # Find the example phrase in the imlaei verse
    start_idx = -1
    for i in range(len(imlaei_words_n) - len(ex_words_n) + 1):
        if imlaei_words_n[i:i+len(ex_words_n)] == ex_words_n:
            start_idx = i
            break
    
    if start_idx < 0:
        failed += 1
        if len(fail_samples) < 10:
            fail_samples.append(f"  NO_IMLAEI_MATCH [{w['rank']}] ref={ref} ex={ex_words_n[:3]}... vs imlaei={imlaei_words_n[:5]}...")
        continue

    # Check if imlaei and WBW have same word count
    if len(imlaei_words) != len(verse_wbw):
        # Word counts differ - try to handle
        # Sometimes bismillah is included in imlaei but not WBW, or vice versa
        offset = len(imlaei_words) - len(verse_wbw)
        
        if offset > 0 and start_idx >= offset:
            # Imlaei has more words at the start (bismillah)
            adjusted_start = start_idx - offset
            if adjusted_start >= 0 and adjusted_start + len(ex_words_n) <= len(verse_wbw):
                matched_en = [verse_wbw[adjusted_start + j]["en"] for j in range(len(ex_words_n))]
                w["QURAN_TRANSLATION"] = " ".join(matched_en)
                fixed += 1
                continue
        
        failed += 1
        if len(fail_samples) < 10:
            fail_samples.append(f"  WORD_COUNT_MISMATCH [{w['rank']}] ref={ref} imlaei={len(imlaei_words)} wbw={len(verse_wbw)}")
        continue

    # Map word indices to WBW
    if start_idx + len(ex_words_n) <= len(verse_wbw):
        matched_en = [verse_wbw[start_idx + j]["en"] for j in range(len(ex_words_n))]
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        fixed += 1
    else:
        failed += 1
        if len(fail_samples) < 10:
            fail_samples.append(f"  INDEX_OOB [{w['rank']}] ref={ref} start={start_idx} len={len(ex_words_n)} wbw_len={len(verse_wbw)}")

print(f"Fixed: {fixed}")
print(f"Failed: {failed}")
for s in fail_samples:
    print(s)

# Save
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

qt = sum(1 for x in words if x.get("QURAN_TRANSLATION"))
print(f"\nTotal QURAN_TRANSLATION: {qt}/600")
