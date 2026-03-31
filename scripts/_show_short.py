import json
ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))
words = [w for w in ds["words"] if w.get("gpt_verified") == "from-short-example"]
print(f"Total from-short-example: {len(words)}\n")
for w in sorted(words, key=lambda x: x.get("rank", 999)):
    r = w.get("rank", "?")
    ar = w["arabic"]
    ref = w["gpt_reference"]
    ex = w["gpt_example"][:55]
    print(f"  {r:>3} | {ar:>20} | {ref:>6} | {ex}")
