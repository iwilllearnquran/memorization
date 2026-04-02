import json

fixes = json.load(open("scripts/_audio_fixes.json", encoding="utf-8"))
d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

applied = 0
for w in d["words"]:
    key = str(w["rank"])
    if key in fixes:
        w["audio_url"] = fixes[key]
        applied += 1

with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print(f"Applied {applied} audio URL fixes")
