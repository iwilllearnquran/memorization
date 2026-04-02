"""
Rename fields to meaningful names and remove QURAN_TRANSLATION + pass2_verification.

Renames:
  pass2_gpt_example        -> example_ar
  pass2_gpt_reference      -> example_ref
  API_TRANSLATION          -> example_en
  latest_validation_comment -> validation

Removes:
  QURAN_TRANSLATION  (redundant, API_TRANSLATION is better)
  pass2_verification (all 600 are "yes")
"""
import json, sys, io

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

RENAMES = {
    "pass2_gpt_example": "example_ar",
    "pass2_gpt_reference": "example_ref",
    "API_TRANSLATION": "example_en",
    "latest_validation_comment": "validation",
}
REMOVE = {"QURAN_TRANSLATION", "pass2_verification"}

SRC = DST = "generated/reel_words_top600_validated.json"
d = json.load(open(SRC, encoding="utf-8"))

rename_counts = {old: 0 for old in RENAMES}
remove_counts = {f: 0 for f in REMOVE}

for w in d["words"]:
    # Rename fields (preserving order by rebuilding dict)
    new_w = {}
    for k, v in w.items():
        if k in REMOVE:
            remove_counts[k] += 1
            continue
        new_key = RENAMES.get(k, k)
        new_w[new_key] = v
        if new_key != k:
            rename_counts[k] += 1
    w.clear()
    w.update(new_w)

with open(DST, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print("Done!")
print("\nRenamed:")
for old, count in rename_counts.items():
    print(f"  {old} -> {RENAMES[old]}: {count}")
print("\nRemoved:")
for f, count in remove_counts.items():
    print(f"  {f}: {count}")
print(f"\nFinal fields: {list(d['words'][0].keys())}")
print(f"Written to {DST}")
