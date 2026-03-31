import json
f = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
for x in f:
    r = x["rank"]
    w = x["word"]
    ref = x["reference"]
    ex = x["example"]
    print(f"{r:>3}  {w:>15}  {ref:>8}  {ex}")
