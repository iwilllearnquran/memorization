"""Revert bad example fixes back to original text."""
import json

SRC = "generated/reel_words_top600_validated.json"
d = json.load(open(SRC, encoding="utf-8"))

# Map rank -> (field, original_value)
reverts = {
    77:  ("pass2_gpt_example", "وَمَا الْحَيَاةُ الدُّنْيَا إِلَّا لَعِبٌ"),
    195: ("pass3_example",     "وَمَا تَأْتِيهِم مِّنْ ءَايَةٍ"),
    305: ("pass2_gpt_example", "يَا بَنِي إِسْرَائِيلَ"),
    466: ("pass2_gpt_example", "إِنَّ اللَّهَ لَا يَسْتَحْيِي أَن يَضْرِبَ مَثَلًا"),
    470: ("pass2_gpt_example", "يَا بَنِي إِسْرَائِيلَ"),
    568: ("pass2_gpt_example", "اللّٰهَ سَرِيۡعُ الۡحِسَابِ\u200f "),
}

for w in d["words"]:
    r = w["rank"]
    if r in reverts:
        field, old_val = reverts[r]
        print(f"#{r:>3}: '{w[field]}' -> '{old_val}'")
        w[field] = old_val

with open(SRC, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print(f"\nReverted {len(reverts)} examples.")
