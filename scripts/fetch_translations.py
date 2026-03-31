"""
Fetch English translations (Saheeh International, id=20) for all verses
referenced in reel_words_top600.json, then store the full verse translation
as gpt_example_en for each word.
"""
import json, os, time, re
import urllib.request

TRANSLATION_ID = 20  # Saheeh International
CACHE_DIR = "generated/.translation_cache"
os.makedirs(CACHE_DIR, exist_ok=True)

# Load dataset
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

# Collect unique chapters needed
refs = set(w.get("gpt_reference", "") for w in words if w.get("gpt_reference"))
chapters_needed = sorted(set(int(r.split(":")[0]) for r in refs))
print(f"Need translations for {len(refs)} verses in {len(chapters_needed)} chapters")

# Load Quran cache for Arabic text (to align word positions)
quran_cache_dir = "generated/.quran_full_cache"
quran_ar = {}
for ch in range(1, 115):
    path = os.path.join(quran_cache_dir, f"chapter_{ch}.json")
    for v in json.load(open(path, encoding="utf-8")):
        quran_ar[v["verse_key"]] = v["text"]

# Fetch or load cached translations per chapter
translations = {}  # verse_key -> english text

for ch in chapters_needed:
    cache_file = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    
    if os.path.exists(cache_file):
        data = json.load(open(cache_file, encoding="utf-8"))
        for item in data:
            translations[item["verse_key"]] = item["text"]
        continue
    
    # Fetch from API - get all verses of chapter with translation
    url = f"https://api.quran.com/api/v4/verses/by_chapter/{ch}?language=en&translations={TRANSLATION_ID}&per_page=300"
    print(f"  Fetching chapter {ch}...")
    
    try:
        req = urllib.request.Request(url, headers={
            "Accept": "application/json",
            "User-Agent": "Mozilla/5.0"
        })
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = json.load(resp)
        
        chapter_translations = []
        for verse in result.get("verses", []):
            vk = verse.get("verse_key", "")
            trans_list = verse.get("translations", [])
            if trans_list:
                # Strip HTML tags from translation text
                text = trans_list[0].get("text", "")
                text = re.sub(r'<[^>]+>', '', text).strip()
                translations[vk] = text
                chapter_translations.append({"verse_key": vk, "text": text})
        
        # Cache it
        with open(cache_file, "w", encoding="utf-8") as f:
            json.dump(chapter_translations, f, ensure_ascii=False, indent=2)
        
        time.sleep(0.3)  # Rate limiting
        
    except Exception as e:
        print(f"  ERROR chapter {ch}: {e}")

print(f"\nLoaded translations for {len(translations)} verses")

# Now for each word, store the full verse English translation
updated = 0
missing = 0

for w in words:
    ref = w.get("gpt_reference", "")
    if not ref:
        missing += 1
        continue
    
    en = translations.get(ref, "")
    if en:
        w["gpt_example_en"] = en
        updated += 1
    else:
        missing += 1
        print(f"  No translation: rank={w['rank']} ref={ref}")

# Save
with open("generated/reel_words_top600.json", "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nUpdated {updated}/600 with English translations")
if missing:
    print(f"Missing: {missing}")

# Show a few samples
print("\nSamples:")
for w in words[:5]:
    print(f"  rank={w['rank']} {w['arabic']}")
    print(f"    AR: {w.get('gpt_example', '')[:70]}")
    print(f"    EN: {w.get('gpt_example_en', '')[:70]}")
    print(f"    REF: {w.get('gpt_reference', '')}")
    print()
