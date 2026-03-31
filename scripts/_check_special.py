import json

data = json.load(open("../generated/reel_words_top600.json", encoding="utf-8"))
for w in data["words"]:
    m = w.get("meaning", "")
    if any(c in m for c in "[](){}"):
        print(f"  rank {w['rank']}: meaning = {m!r}")
    ee = w.get("example_en", "")
    if any(c in ee for c in "[](){}"):
        print(f"  rank {w['rank']}: example_en = {ee!r}")
