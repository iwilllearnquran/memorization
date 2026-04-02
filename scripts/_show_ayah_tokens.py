"""
Fetch word-by-word tokens for all problematic ayahs.
Print positions so we can specify exact Uthmani ranges.
"""
import json, sys, io, time, urllib.request, urllib.parse

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}

def fetch_ayah_words(vk):
    enc = urllib.parse.quote(vk, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{enc}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return data["verse"]["words"]

# All ayahs referenced by the 16 remaining problematic items
AYAHS = {
    "6:32":  [77],    # وَمَا الْحَيَاةُ الدُّنْيَا إِلَّا لَعِبٌ
    "3:199": [91],    # وَمَا أُنزِلَ إِلَيْكَ
    "26:5":  [195],   # وَمَا تَأْتِيهِم مِّنْ ءَايَةٍ (fixed ref)
    "2:61":  [227],   # وَيَقْتُلُونَ النَّبِيّٖنَ بِغَيْرِ الْحَقِّ
    "7:60":  [263],   # مِن قَوْمِهِ إِنَّا لَنَرَاكَ
    "36:60": [294],   # أَلَمْ أَعْهَدْ إِلَيْكُمْ (fixed ref)
    "2:40":  [305, 470],  # يَا بَنِي إِسْرَائِيلَ
    "7:86":  [341],   # وَانْظُرُوا كَيْفَ كَانَ عَاقِبَةُ الْمُفْسِدِينَ
    "8:29":  [389],   # يُكَفِّرْ عَنْكُمْ سَيِّئَاتِكُمْ
    "2:26":  [466],   # إِنَّ اللَّهَ لَا يَسْتَحْيِي أَن يَضْرِبَ مَثَلًا
    "2:4":   [495],   # وَبِالْآخِرَةِ هُمْ يُوقِنُونَ
    "2:179": [496],   # وَلَكُمْ فِي الْقِصَاصِ حَيَاةٌ
    "36:82": [498],   # إِذَا أَرَادَ شَيْئًا
    "10:56": [515],   # يُحْيِي وَيُمِيتُ وَإِلَيْهِ تُرْجَعُونَ
    "3:19":  [568],   # اللَّهَ سَرِيعُ الْحِسَابِ
    "3:197": [587],   # مَتَاعٌ قَلِيلٌ ثُمَّ مَأْوَاهُمْ
}

for vk, ranks in sorted(AYAHS.items(), key=lambda x: x[1][0]):
    time.sleep(0.3)
    try:
        all_words = fetch_ayah_words(vk)
    except Exception as e:
        print(f"ERROR fetching {vk}: {e}")
        continue

    word_words = [w for w in all_words if w["char_type_name"] == "word"]
    print(f"\n{'='*70}")
    print(f"AYAH {vk} — ranks {ranks}")
    print(f"{'='*70}")
    for i, w in enumerate(word_words):
        ut = w.get("text_uthmani", w.get("text", ""))
        tr = w.get("translation", {})
        en = tr.get("text", "") if isinstance(tr, dict) else ""
        print(f"  [{i:2d}] {ut:30s}  {en}")
    print()
