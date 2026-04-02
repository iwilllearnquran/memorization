import json, sys, io
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
d = json.load(open("generated/reel_words_top600_validated.json", encoding="utf-8"))
for w in d["words"]:
    c = w.get("latest_validation_comment", "")
    if "soft" in c:
        ex = w.get("pass3_example", "") or w.get("pass2_gpt_example", "")
        ref = w.get("pass3_reference", "") or w.get("pass2_gpt_reference", "")
        en = w.get("API_TRANSLATION", "") or w.get("QURAN_TRANSLATION", "")
        print(f"#{w['rank']} {w['arabic']} meaning='{w['meaning']}'")
        print(f"  example: {ex}")
        print(f"  ref: {ref}")
        print(f"  translation: {en}")
        print(f"  comment: {c}")
