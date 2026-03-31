import json
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
w = ds["words"]
nf = [x for x in w if "NOT found" in x.get("validation_comment","")]
print(f"NOT found: {len(nf)}")
for x in nf:
    print(f"  [{x['rank']}] word='{x['arabic']}'  ex='{x['pass2_gpt_example']}'")
