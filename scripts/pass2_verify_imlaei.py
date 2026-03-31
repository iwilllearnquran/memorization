"""
Pass 2 Verification against standard Arabic (Imlaei) text.
Fetches/caches imlaei text from quran.com API, then checks
if each pass2_gpt_example appears in the cited verse.
"""
import json, os, re, time, urllib.request

DS_PATH = "generated/reel_words_top600.json"
CACHE_DIR = "generated/.imlaei_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

# --- Fetch / cache imlaei text per chapter ---
def fetch_chapter(ch):
    path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    if os.path.exists(path):
        return json.load(open(path, encoding="utf-8"))
    url = f"https://api.quran.com/api/v4/quran/verses/imlaei?chapter_number={ch}"
    req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0"})
    with urllib.request.urlopen(req) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    verses = [{"verse_key": v["verse_key"], "text": v["text_imlaei"]}
              for v in data["verses"]]
    with open(path, "w", encoding="utf-8") as fp:
        json.dump(verses, fp, ensure_ascii=False, indent=2)
    return verses

quran = {}
for ch in range(1, 115):
    cache_path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    if os.path.exists(cache_path):
        verses = json.load(open(cache_path, encoding="utf-8"))
    else:
        print(f"Fetching chapter {ch}...")
        verses = fetch_chapter(ch)
        time.sleep(0.3)
    for v in verses:
        quran[v["verse_key"]] = v["text"]

print(f"Loaded {len(quran)} imlaei verses")

# --- Load dataset ---
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def strip_harakat(s):
    """Remove all diacritics/tashkeel for comparison."""
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
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nResults (imlaei verification):")
print(f"  yes:   {yes}")
print(f"  no:    {no}")
print(f"  empty: {empty}")
print(f"  total: {yes + no + empty}")
