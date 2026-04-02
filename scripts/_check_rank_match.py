"""Check if pass2 arabic words match the dataset words at the same rank."""
import json

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
p2 = json.load(open("generated/gpt_examples_pass2.json", encoding="utf-8"))

rank_map = {w["rank"]: w for w in ds["words"]}

mismatch = 0
ok = 0
for p in p2:
    r = p["rank"]
    w = rank_map.get(r)
    if w:
        if p["arabic"] == w["arabic"]:
            ok += 1
        else:
            mismatch += 1
            print(f"  MISMATCH rank {r}:")
            print(f"    pass2:   {p['arabic']} ({p['meaning']})")
            print(f"    dataset: {w['arabic']} ({w['meaning']})")
            print()
    else:
        print(f"  rank {r}: NOT IN DATASET")

print(f"OK: {ok}  |  MISMATCH: {mismatch}  |  Total: {len(p2)}")
