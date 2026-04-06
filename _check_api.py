import json, requests, time

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'LearnQuranDaily/2.0', 'Accept': 'application/json'})

def fetch(url):
    time.sleep(0.5)
    r = SESSION.get(url, timeout=20)
    r.raise_for_status()
    return r.json()

# 1. List chapter reciters
print("=== Chapter Reciters ===")
try:
    data = fetch('https://api.quran.com/api/v4/resources/chapter_reciters')
    for r in data.get('reciters', []):
        rid = r['id']
        name = r['reciter_name']
        style = r.get('style', {}).get('name', '')
        if rid <= 15 or rid == 7:
            print(f"  {rid}: {name} {style}")
except Exception as e:
    print(f"  Skipped (API error): {e}")

# 2. Get per-ayah recitation data for reciter 7, surah 1 (with segments)
print("\n=== Recitation segments for reciter 7, surah 1 ===")
data2 = fetch('https://api.quran.com/api/v4/recitations/7/by_chapter/1?fields=segments')
for af in data2.get('audio_files', []):
    vk = af.get('verse_key', '')
    segs = af.get('segments', [])
    url = af.get('url', '')
    if segs:
        last_end = max(s[3] for s in segs)
    else:
        last_end = '?'
    print(f"  {vk}: segments={len(segs)}, last_end_ms={last_end}, url={url[:80]}")

# 3. Full chapter audio for reciter 7, surah 1
print("\n=== Full chapter audio ===")
data3 = fetch('https://api.quran.com/api/v4/chapter_recitations/7/1')
print(json.dumps(data3, indent=2))
