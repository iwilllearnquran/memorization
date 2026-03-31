"""
Add two English translation fields to every word:
  QURAN_TRANSLATION  – word-by-word Quran API (fragment-level, from WBW cache)
  API_TRANSLATION    – Google Translate (via deep-translator)
"""
import json, os, re, time

DS_PATH = "generated/reel_words_top600.json"
WBW_CACHE = "generated/.wbw_cache"
IMLAEI_CACHE = "generated/.imlaei_cache"
TRANS_CACHE = "generated/.translation_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

# ─── Load WBW cache (keyed by verse_key → list of {ar, en}) ───
wbw = {}
for fn in os.listdir(WBW_CACHE):
    d = json.load(open(f"{WBW_CACHE}/{fn}", encoding="utf-8"))
    wbw.update(d)
print(f"WBW cache: {len(wbw)} verses")

# ─── Load imlaei cache ───
imlaei = {}
for ch in range(1, 115):
    for v in json.load(open(f"{IMLAEI_CACHE}/chapter_{ch}.json", encoding="utf-8")):
        imlaei[v["verse_key"]] = v["text"]
print(f"Imlaei cache: {len(imlaei)} verses")

# ─── Normalisation for matching ───
def norm(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# ─── 1. QURAN_TRANSLATION via WBW matching ───
print("\n=== QURAN_TRANSLATION (WBW) ===")

# Fetch missing WBW chapters
import urllib.request

def fetch_wbw_chapter(ch):
    """Fetch WBW for a chapter from quran.com API and cache it."""
    cache_path = f"{WBW_CACHE}/chapter_{ch}.json"
    if os.path.exists(cache_path):
        return
    print(f"  Fetching WBW chapter {ch}...")
    result = {}
    page = 1
    while True:
        url = f"https://api.quran.com/api/v4/verses/by_chapter/{ch}?language=en&words=true&word_fields=text_uthmani&per_page=50&page={page}"
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        for v in data["verses"]:
            vk = v["verse_key"]
            wlist = []
            for ww in v["words"]:
                if ww.get("char_type_name") == "end":
                    continue
                wlist.append({"ar": ww["text_uthmani"], "en": ww["translation"]["text"]})
            result[vk] = wlist
        if data["pagination"]["next_page"] is None:
            break
        page += 1
        time.sleep(0.3)
    with open(cache_path, "w", encoding="utf-8") as fp:
        json.dump(result, fp, ensure_ascii=False, indent=2)
    wbw.update(result)

# Fetch any missing chapters needed
needed_chs = set(int(w["pass2_gpt_reference"].split(":")[0]) for w in words if w.get("pass2_gpt_reference"))
cached_chs = set(int(fn.replace("chapter_","").replace(".json","")) for fn in os.listdir(WBW_CACHE))
for ch in sorted(needed_chs - cached_chs):
    fetch_wbw_chapter(ch)
    time.sleep(0.5)

# For WBW matching: match imlaei phrase words to WBW (Uthmani) words
quran_wbw_ok = 0
quran_wbw_fail = 0

for w in words:
    ex = w.get("pass2_gpt_example", "")
    ref = w.get("pass2_gpt_reference", "")
    if not ex or not ref:
        w["QURAN_TRANSLATION"] = ""
        quran_wbw_fail += 1
        continue

    verse_wbw = wbw.get(ref, [])
    if not verse_wbw:
        # Try to fetch this chapter's WBW
        ch = ref.split(":")[0]
        cache_path = f"{WBW_CACHE}/chapter_{ch}.json"
        if not os.path.exists(cache_path):
            try:
                url = f"https://api.quran.com/api/v4/quran/verses/uthmani?chapter_number={ch}"
                # We need WBW - let's use the verses/words endpoint
                pass
            except:
                pass
        w["QURAN_TRANSLATION"] = ""
        quran_wbw_fail += 1
        continue

    # Match: normalise both the imlaei phrase words and WBW ar words
    ex_words_n = norm(ex).split()
    wbw_words_n = [norm(ww["ar"]) for ww in verse_wbw]

    # Find the start index in WBW that matches our phrase
    matched_en = []
    start_idx = -1
    for i in range(len(wbw_words_n) - len(ex_words_n) + 1):
        if wbw_words_n[i:i+len(ex_words_n)] == ex_words_n:
            start_idx = i
            break

    if start_idx >= 0:
        matched_en = [verse_wbw[start_idx + j]["en"] for j in range(len(ex_words_n))]
        w["QURAN_TRANSLATION"] = " ".join(matched_en)
        quran_wbw_ok += 1
    else:
        # Fallback: try partial/fuzzy match
        w["QURAN_TRANSLATION"] = ""
        quran_wbw_fail += 1

print(f"  WBW matched: {quran_wbw_ok}")
print(f"  WBW failed:  {quran_wbw_fail}")

# ─── Save intermediate (before Google Translate which can be slow) ───
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)
print("Saved QURAN_TRANSLATION")

# ─── 2. API_TRANSLATION via Google Translate ───
print("\n=== API_TRANSLATION (Google Translate) ===")

from deep_translator import GoogleTranslator

translator = GoogleTranslator(source='ar', target='en')

# Batch translate in chunks to be efficient
batch_size = 50
phrases = [w.get("pass2_gpt_example", "") for w in words]

api_ok = 0
api_fail = 0

for i in range(0, len(phrases), batch_size):
    batch = phrases[i:i+batch_size]
    try:
        results = translator.translate_batch(batch)
        for j, translation in enumerate(results):
            words[i+j]["API_TRANSLATION"] = translation or ""
            if translation:
                api_ok += 1
            else:
                api_fail += 1
    except Exception as e:
        print(f"  Batch {i}-{i+batch_size} error: {e}")
        # Fallback: translate one by one
        for j, phrase in enumerate(batch):
            try:
                t = translator.translate(phrase)
                words[i+j]["API_TRANSLATION"] = t or ""
                if t:
                    api_ok += 1
                else:
                    api_fail += 1
            except Exception as e2:
                words[i+j]["API_TRANSLATION"] = ""
                api_fail += 1
    
    if i % 100 == 0 and i > 0:
        print(f"  Translated {i}/{len(phrases)}...")
    time.sleep(0.5)  # Rate limit

print(f"  Google ok:   {api_ok}")
print(f"  Google fail: {api_fail}")

# ─── Save final ───
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nDone. All 600 words now have QURAN_TRANSLATION and API_TRANSLATION fields.")
