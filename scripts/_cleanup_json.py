"""
Clean up reel_words_top600_validated.json:
1. When pass3_example exists, copy to pass2_gpt_example (overwrite), delete pass3_example
2. When pass3_reference exists, copy to pass2_gpt_reference (overwrite), delete pass3_reference
3. When pass3_translation exists, copy to API_TRANSLATION (overwrite), delete pass3_translation
4. Remove: validation_flag, validation_comment
5. Keep: latest_validation_comment
"""
import json, sys, io

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

SRC = DST = "generated/reel_words_top600_validated.json"
d = json.load(open(SRC, encoding="utf-8"))
words = d["words"]

stats = {"pass3_example_merged": 0, "pass3_reference_merged": 0,
         "pass3_translation_merged": 0, "validation_flag_removed": 0,
         "validation_comment_removed": 0}

for w in words:
    rank = w.get("rank", "?")

    # Merge pass3_example -> pass2_gpt_example
    if w.get("pass3_example"):
        w["pass2_gpt_example"] = w["pass3_example"]
        del w["pass3_example"]
        stats["pass3_example_merged"] += 1

    # Merge pass3_reference -> pass2_gpt_reference
    if w.get("pass3_reference"):
        w["pass2_gpt_reference"] = w["pass3_reference"]
        del w["pass3_reference"]
        stats["pass3_reference_merged"] += 1

    # Merge pass3_translation -> API_TRANSLATION
    if w.get("pass3_translation"):
        w["API_TRANSLATION"] = w["pass3_translation"]
        del w["pass3_translation"]
        stats["pass3_translation_merged"] += 1

    # Remove validation_flag, validation_comment
    if "validation_flag" in w:
        del w["validation_flag"]
        stats["validation_flag_removed"] += 1
    if "validation_comment" in w:
        del w["validation_comment"]
        stats["validation_comment_removed"] += 1

# Write
with open(DST, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print("Cleanup done!")
for k, v in stats.items():
    print(f"  {k}: {v}")

# Verify no pass3_ or validation_ fields remain
remaining = set()
for w in words:
    for k in w:
        if k.startswith("pass3_") or k in ("validation_flag", "validation_comment"):
            remaining.add(k)
if remaining:
    print(f"\nWARNING: leftover fields: {remaining}")
else:
    print(f"\nAll pass3_* and validation_flag/comment fields removed.")

# Show sample fields for rank 1
print(f"\nSample (rank 1) fields: {list(words[0].keys())}")
print(f"Written to {DST}")
