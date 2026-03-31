import json
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
w = ds["words"]
qt = sum(1 for x in w if x.get("QURAN_TRANSLATION"))
at = sum(1 for x in w if x.get("API_TRANSLATION"))
print(f"QURAN_TRANSLATION filled: {qt}/600")
print(f"API_TRANSLATION filled:   {at}/600")
for x in w[:5]:
    print(f"\n  [{x['rank']}] {x['pass2_gpt_example']}")
    print(f"    QT: {x.get('QURAN_TRANSLATION','')}")
    print(f"    AT: {x.get('API_TRANSLATION','')}")
