import json
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
w = ds["words"]
qt = sum(1 for x in w if x.get("QURAN_TRANSLATION"))
at = sum(1 for x in w if x.get("API_TRANSLATION"))
print(f"QURAN_TRANSLATION: {qt}/600")
print(f"API_TRANSLATION:   {at}/600")
print()
for x in w[:8]:
    r = x["rank"]
    ex = x["pass2_gpt_example"]
    q = x.get("QURAN_TRANSLATION", "")
    a = x.get("API_TRANSLATION", "")
    print(f"[{r}] {ex}")
    print(f"  QT: {q}")
    print(f"  AT: {a}")
    print()
