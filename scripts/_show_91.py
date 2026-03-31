import json

raw = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
data = raw["words"] if isinstance(raw, dict) else raw
fse = [w for w in data if w.get("gpt_verified") == "from-short-example"]
print(f"Total from-short-example: {len(fse)}\n")
for i, w in enumerate(fse, 1):
    rank = w["rank"]
    ar = w["arabic"]
    meaning = w.get("meaning", "")[:35]
    ex = w.get("gpt_example", "")[:70]
    print(f"{i:3}. rank={rank:<4} {ar:<20} {meaning:<37} ex: {ex}")
