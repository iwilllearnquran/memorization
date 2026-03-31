import json

f = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))
wmap = {w["rank"]: w for w in ds["words"]}

print(f"Total: {len(f)} FAILED\n")
print(f"{'#':>2}  {'Rank':>4}  {'Word':>15}  {'Ref':>8}  GPT Example (failed)  ->  Current (fallback)")
print("=" * 120)
for i, x in enumerate(f, 1):
    w = wmap[x["rank"]]
    cur = w.get("gpt_example", "")
    cur_ref = w.get("gpt_reference", "")
    cur_status = w.get("gpt_verified", "")
    print(f"{i:>2}  {x['rank']:>4}  {x['word']:>15}  {x['reference']:>8}  {x['example'][:50]}")
    print(f"    {'':>4}  {'':>15}  {cur_ref:>8}  -> [{cur_status}] {cur[:50]}")
    print()
