"""Finish remaining API_TRANSLATION entries (the ones still empty)"""
import json, time
from deep_translator import GoogleTranslator

DS_PATH = "generated/reel_words_top600.json"
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

translator = GoogleTranslator(source='ar', target='en')
filled = 0

for i, w in enumerate(words):
    if w.get("API_TRANSLATION"):
        continue
    ex = w.get("pass2_gpt_example", "")
    if not ex:
        w["API_TRANSLATION"] = ""
        continue
    try:
        t = translator.translate(ex)
        w["API_TRANSLATION"] = t or ""
        if t:
            filled += 1
            print(f"  [{w['rank']}] {t[:60]}")
    except Exception as e:
        print(f"  [{w['rank']}] FAIL: {e}")
        w["API_TRANSLATION"] = ""
    time.sleep(0.5)

with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

at = sum(1 for x in words if x.get("API_TRANSLATION"))
print(f"\nFilled {filled} more. Total API_TRANSLATION: {at}/600")
