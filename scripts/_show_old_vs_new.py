import json

ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))
failed = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
failed_ranks = {x["rank"] for x in failed}

print(f"{'Rank':>4}  {'Word':>15}  {'Ref':>8}  Old GPT Example  -->  New Example")
print("=" * 120)
for f in failed:
    w = next(x for x in ds["words"] if x.get("rank") == f["rank"])
    old_ex = f["example"]
    new_ex = w.get("gpt_example", "")
    new_ref = w.get("gpt_reference", "")
    status = w.get("gpt_verified", "")
    print(f"{f['rank']:>4}  {f['word']:>15}  {f['reference']:>8}  {old_ex}")
    print(f"      {'':>15}  {new_ref:>8}  -> {new_ex}")
    print()
