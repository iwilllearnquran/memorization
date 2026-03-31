"""
Fill in missing translations:
1. Fix WBW matching for the 197 that failed (try looser matching)
2. Run Google Translate for all 600
"""
import json, os, re, time

DS_PATH = "generated/reel_words_top600.json"
WBW_CACHE = "generated/.wbw_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

# Load all WBW
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

# ─── Fix WBW for missing 197 ───
print("=== Fixing QURAN_TRANSLATION ===")
fixed_wbw = 0
still_missing = 0

for w in words:
    if w.get("QURAN_TRANSLATION"):
        continue
    
    ex = w.get("pass2_gpt_example", "")
    ref = w.get("pass2_gpt_reference", "")
    if not ex or not ref:
        still_missing += 1
        continue

    verse_wbw = wbw.get(ref, [])
    if not verse_wbw:
        still_missing += 1
        continue

    ex_words_n = norm(ex).split()
    wbw_words_n = [norm(ww["ar"]) for ww in verse_wbw]

    # Try exact match first
    start_idx = -1
    for i in range(len(wbw_words_n) - len(ex_words_n) + 1):
        if wbw_words_n[i:i+len(ex_words_n)] == ex_words_n:
            start_idx = i
            break

    # If no exact match, try greedy word-by-word matching
    if start_idx < 0:
        # Find each ex word in the wbw list sequentially
        matched_indices = []
        search_from = 0
        for ew in ex_words_n:
            found = False
            for j in range(search_from, len(wbw_words_n)):
                if wbw_words_n[j] == ew:
                    matched_indices.append(j)
                    search_from = j + 1
                    found = True
                    break
            if not found:
                break
        
        if len(matched_indices) == len(ex_words_n):
            matched_en = [verse_wbw[idx]["en"] for idx in matched_indices]
            w["QURAN_TRANSLATION"] = " ".join(matched_en)
            fixed_wbw += 1
            continue

    if start_idx >= 0:
        matched_en = [verse_wbw[start_idx + j]["en"] for j in range(len(ex_words_n))]
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        fixed_wbw += 1
    else:
        still_missing += 1

print(f"  Fixed: {fixed_wbw}")
print(f"  Still missing: {still_missing}")

# Save WBW progress
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

# ─── Google Translate ───
print("\n=== API_TRANSLATION (Google Translate) ===")

from deep_translator import GoogleTranslator

translator = GoogleTranslator(source='ar', target='en')

api_ok = 0
api_fail = 0

for i, w in enumerate(words):
    ex = w.get("pass2_gpt_example", "")
    if not ex:
        w["API_TRANSLATION"] = ""
        api_fail += 1
        continue
    
    # Skip if already translated
    if w.get("API_TRANSLATION"):
        api_ok += 1
        continue
    
    try:
        t = translator.translate(ex)
        w["API_TRANSLATION"] = t or ""
        if t:
            api_ok += 1
        else:
            api_fail += 1
    except Exception as e:
        w["API_TRANSLATION"] = ""
        api_fail += 1
    
    if (i + 1) % 50 == 0:
        print(f"  {i+1}/600...")
        # Save periodically
        with open(DS_PATH, "w", encoding="utf-8") as fp:
            json.dump(ds, fp, ensure_ascii=False, indent=2)
    
    time.sleep(0.3)

print(f"  Google ok:   {api_ok}")
print(f"  Google fail: {api_fail}")

# Final save
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

qt = sum(1 for x in words if x.get("QURAN_TRANSLATION"))
at = sum(1 for x in words if x.get("API_TRANSLATION"))
print(f"\nFinal: QURAN_TRANSLATION={qt}/600, API_TRANSLATION={at}/600")
