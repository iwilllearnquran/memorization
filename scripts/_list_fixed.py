"""List all items that were previously match_fail or match_partial, showing current example + reference."""
import json, sys, io

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

d = json.load(open("generated/reel_words_top600_validated.json", encoding="utf-8"))

# These were the 25 items that were match_fail or match_partial before fixing
FIXED_RANKS = [7, 45, 62, 77, 91, 195, 216, 221, 227, 241, 263, 294, 305, 314, 341, 389, 466, 470, 495, 496, 498, 515, 530, 568, 587]

by_rank = {w["rank"]: w for w in d["words"]}

print(f"{'Rank':<6} {'Word':<20} {'Status':<15} {'Reference':<10} Example (Uthmani)")
print("=" * 120)
for r in FIXED_RANKS:
    w = by_rank[r]
    ex = w.get("pass3_example") or w.get("pass2_gpt_example", "")
    ref = w.get("pass3_reference") or w.get("pass2_gpt_reference", "")
    comment = w.get("latest_validation_comment", "")
    status_now = comment.split("(")[0].strip() if "(" in comment else comment
    print(f"{r:<6} {w['arabic']:<20} {status_now:<15} {ref:<10} {ex}")
