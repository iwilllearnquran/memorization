"""Check Urdu audio API and available reciters."""
import json, requests, time

SESSION = requests.Session()
SESSION.headers.update({'User-Agent': 'LearnQuranDaily/2.0', 'Accept': 'application/json'})

# 1. Test alquran.cloud ur.khan per-ayah audio for surah 1 ayah 1
print("=== alquran.cloud ur.khan per-ayah ===")
for ayah in range(1, 4):
    r = SESSION.get(f"https://api.alquran.cloud/v1/ayah/1:{ayah}/ur.khan", timeout=20)
    data = r.json()["data"]
    print(f"  1:{ayah}: audio={data.get('audio', 'NONE')[:80]}")
    time.sleep(0.3)

# 2. Test alquran.cloud full surah endpoint
print("\n=== alquran.cloud full surah ur.khan ===")
r = SESSION.get("https://api.alquran.cloud/v1/surah/1/ur.khan", timeout=20)
data = r.json()["data"]
print(f"  Surah name: {data.get('englishName', '?')}")
for a in data.get("ayahs", [])[:3]:
    print(f"  Ayah {a['numberInSurah']}: audio={a.get('audio', 'NONE')[:80]}")

# 3. Check quran.com for Urdu-related reciters in chapter_recitations
print("\n=== quran.com chapter_reciters (checking for Urdu) ===")
try:
    r = SESSION.get("https://api.quran.com/api/v4/resources/chapter_reciters", timeout=20)
    r.raise_for_status()
    for rec in r.json().get("reciters", []):
        name = rec['reciter_name'].lower()
        if any(k in name for k in ['urdu', 'khan', 'jalandhry', 'fateh']):
            print(f"  {rec['id']}: {rec['reciter_name']}")
except Exception as e:
    print(f"  API error: {e}")

# 4. Also check regular recitations API for Urdu
print("\n=== quran.com recitations (checking for Urdu) ===")
try:
    r = SESSION.get("https://api.quran.com/api/v4/resources/recitations?language=ur", timeout=20)
    r.raise_for_status()
    for rec in r.json().get("recitations", []):
        name = str(rec.get('reciter_name', '') or rec.get('translated_name', {}).get('name', ''))
        if any(k in name.lower() for k in ['urdu', 'khan', 'fateh']):
            print(f"  {rec['id']}: {name}")
except Exception as e:
    print(f"  API error: {e}")
