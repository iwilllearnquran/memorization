"""
Fetch word-by-word English translations for each gpt_example fragment.
Uses quran.com API word-by-word data to extract only the English
corresponding to the specific Arabic fragment, not the whole verse.
"""
import json, os, time, re
import urllib.request

WBW_CACHE_DIR = "generated/.wbw_cache"
os.makedirs(WBW_CACHE_DIR, exist_ok=True)

# Load dataset
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

# Load Quran Arabic cache for reference
quran_cache_dir = "generated/.quran_full_cache"
quran_ar = {}
for ch in range(1, 115):
    path = os.path.join(quran_cache_dir, f"chapter_{ch}.json")
    for v in json.load(open(path, encoding="utf-8")):
        quran_ar[v["verse_key"]] = v["text"]

# Collect unique verse_keys needed
refs = sorted(set(w.get("gpt_reference", "") for w in words if w.get("gpt_reference")))
chapters_needed = sorted(set(int(r.split(":")[0]) for r in refs))
print(f"Need wbw for {len(refs)} verses in {len(chapters_needed)} chapters\n")

def strip_for_search(s):
    out = []
    after_tatweel = False
    for c in s:
        cp = ord(c)
        if cp in (0x0653, 0x0654, 0x0655):
            if after_tatweel: out.append('\u0627')
            continue
        if 0x064B <= cp <= 0x065F: continue
        if 0x0610 <= cp <= 0x061A: continue
        if 0x06D6 <= cp <= 0x06ED: continue
        if cp == 0x0640 or cp == 0x0620:
            after_tatweel = True; continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        after_tatweel = False
        if cp == 0x0621: continue
        if cp == 0x0670: out.append('\u0627'); continue
        if cp == 0x06E5 or cp == 0x06E6: continue
        if c in '\u0627\u0671\u0623\u0625\u0622': out.append('\u0627')
        elif c in '\u0649\u064A\u0626': out.append('\u064A')
        elif c == '\u0629': out.append('\u0647')
        elif c == '\u0624': out.append('\u0648')
        else: out.append(c)
    return ''.join(out)

# Fetch wbw data per chapter (cached)
wbw_data = {}  # verse_key -> list of {text_uthmani, translation}

for ch in chapters_needed:
    cache_file = os.path.join(WBW_CACHE_DIR, f"chapter_{ch}.json")
    
    if os.path.exists(cache_file):
        data = json.load(open(cache_file, encoding="utf-8"))
        for vk, wds in data.items():
            wbw_data[vk] = wds
        continue
    
    # Fetch all verses for chapter with word-by-word data
    page = 1
    chapter_wbw = {}
    while True:
        url = (f"https://api.quran.com/api/v4/verses/by_chapter/{ch}"
               f"?language=en&words=true&word_fields=text_uthmani,translation"
               f"&per_page=50&page={page}")
        
        try:
            req = urllib.request.Request(url, headers={
                "User-Agent": "Mozilla/5.0",
                "Accept": "application/json"
            })
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = json.load(resp)
            
            for verse in result.get("verses", []):
                vk = verse.get("verse_key", "")
                verse_words = []
                for wd in verse.get("words", []):
                    if wd.get("char_type_name") == "end":
                        continue  # skip verse number markers
                    verse_words.append({
                        "ar": wd.get("text_uthmani", wd.get("text", "")),
                        "en": wd.get("translation", {}).get("text", "")
                    })
                chapter_wbw[vk] = verse_words
            
            pagination = result.get("pagination", {})
            if page >= pagination.get("total_pages", 1):
                break
            page += 1
            time.sleep(0.2)
            
        except Exception as e:
            print(f"  ERROR chapter {ch} page {page}: {e}")
            break
    
    # Cache
    with open(cache_file, "w", encoding="utf-8") as f:
        json.dump(chapter_wbw, f, ensure_ascii=False, indent=2)
    
    for vk, wds in chapter_wbw.items():
        wbw_data[vk] = wds
    
    print(f"  Fetched chapter {ch}: {len(chapter_wbw)} verses")
    time.sleep(0.3)

print(f"\nLoaded wbw for {len(wbw_data)} verses")

# Now for each word, find the fragment words in the verse wbw and extract English
updated = 0
issues = []

for w in words:
    ex = w.get("gpt_example", "")
    ref = w.get("gpt_reference", "")
    if not ex or not ref:
        continue
    
    verse_wbw = wbw_data.get(ref, [])
    if not verse_wbw:
        issues.append((w["rank"], w["arabic"], "no wbw data"))
        continue
    
    # Split fragment into words
    frag_words = ex.split()
    
    # Find starting position in verse by matching Arabic words
    verse_ar_words = [wd["ar"] for wd in verse_wbw]
    
    # Try exact match first
    best_start = -1
    best_score = 0
    
    for start in range(len(verse_ar_words) - len(frag_words) + 1):
        score = 0
        for j, fw in enumerate(frag_words):
            vw = verse_ar_words[start + j]
            fw_s = strip_for_search(fw)
            vw_s = strip_for_search(vw)
            if fw == vw:
                score += 3
            elif fw_s == vw_s:
                score += 2
            elif fw_s in vw_s or vw_s in fw_s:
                score += 1
        if score > best_score:
            best_score = score
            best_start = start
    
    if best_start >= 0:
        # Extract English for matched words
        en_parts = []
        for j in range(len(frag_words)):
            en = verse_wbw[best_start + j]["en"]
            if en:
                en_parts.append(en)
        
        en_translation = " ".join(en_parts)
        w["gpt_example_en"] = en_translation
        updated += 1
    else:
        issues.append((w["rank"], w["arabic"], "no match in wbw"))

# Save
with open("generated/reel_words_top600.json", "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nUpdated {updated}/600 with fragment-level English translations")
if issues:
    print(f"Issues: {len(issues)}")
    for rank, ar, reason in issues[:10]:
        print(f"  rank={rank} {ar}: {reason}")

# Show samples
print("\nSamples:")
for w in words[:8]:
    print(f"  rank={w['rank']} {w['arabic']} ({w.get('meaning','')})")
    print(f"    AR: {w.get('gpt_example', '')[:70]}")
    print(f"    EN: {w.get('gpt_example_en', '')[:70]}")
    print()
