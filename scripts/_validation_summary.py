import json, collections

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
w = ds["words"]

# Check fields exist
assert "validation_flag" in w[0], "validation_flag missing!"
assert "validation_comment" in w[0], "validation_comment missing!"

good = sum(1 for x in w if x["validation_flag"])
review = sum(1 for x in w if not x["validation_flag"])
print(f"validation_flag=true:  {good}/600")
print(f"validation_flag=false: {review}/600")

# Categorize by comment patterns
cats = collections.Counter()
for x in w:
    c = x["validation_comment"]
    if not c:
        cats["(no issues)"] += 1
    elif "API_TRANSLATION marked ~" in c and "not standalone" in c:
        cats["~ + prefix"] += 1
    elif "API_TRANSLATION marked ~" in c and "NOT found" in c:
        cats["~ + not found"] += 1
    elif "API_TRANSLATION marked ~" in c and "Uthmani" in c:
        cats["~ + Uthmani variant"] += 1
    elif "API_TRANSLATION marked ~" in c:
        cats["~ only"] += 1
    elif "Uthmani" in c:
        cats["Uthmani variant only"] += 1
    elif "not standalone" in c:
        cats["prefix only"] += 1
    elif "NOT found" in c:
        cats["not found only"] += 1
    elif "spans across" in c:
        cats["spans tokens"] += 1
    else:
        cats["other: " + c[:40]] += 1

print("\n--- Categories ---")
for k, v in cats.most_common():
    print(f"  {v:4d}  {k}")

# Show ~-flagged entries
print("\n--- All ~ flagged API_TRANSLATION (63) ---")
tilde = [x for x in w if x.get("API_TRANSLATION","").startswith("~")]
for t in tilde:
    flag_str = "OK" if t["validation_flag"] else "REVIEW"
    print(f"  [{t['rank']:3d}] [{flag_str:6s}] {t['arabic']:15s} AT: {t['API_TRANSLATION'][:70]}")

# Show "not found" entries
print("\n--- Word NOT found (most problematic) ---")
nf = [x for x in w if "NOT found" in x.get("validation_comment","")]
for x in nf:
    flag_str = "OK" if x["validation_flag"] else "REVIEW"
    print(f"  [{x['rank']:3d}] [{flag_str}] word='{x['arabic']}'  ex='{x['pass2_gpt_example']}'")
