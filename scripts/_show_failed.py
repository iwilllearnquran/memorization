import json
f = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
print(f"Total: {len(f)} FAILED entries\n")
print(f"{'Rank':>4}  {'Word':>15}  {'Ref':>8}  GPT Example (truncated)")
print("-" * 80)
for x in f:
    print(f"{x['rank']:>4}  {x['word']:>15}  {x['reference']:>8}  {x['example'][:55]}")
