"""Export remaining 55 pass2 failures as JSON + prompt."""
import json

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

failures = []
for w in ds["words"]:
    if w.get("pass2_verification") == "no":
        failures.append({
            "rank": w["rank"],
            "arabic": w["arabic"],
            "transliteration": w.get("transliteration", ""),
            "meaning": w.get("meaning", ""),
            "pass2_gpt_example": w.get("pass2_gpt_example", ""),
            "pass2_gpt_reference": w.get("pass2_gpt_reference", ""),
        })

# Save JSON
with open("generated/pass2_failed_55.json", "w", encoding="utf-8") as fp:
    json.dump(failures, fp, ensure_ascii=False, indent=2)
print(f"Saved {len(failures)} failures to generated/pass2_failed_55.json")

# Build prompt
lines = []
lines.append("I have a list of Quran vocabulary words. For each word, provide a SHORT Arabic phrase (2-5 words) from the Quran that contains this word, along with the verse reference (chapter:verse).")
lines.append("")
lines.append("CRITICAL RULES:")
lines.append("1. The phrase MUST be an EXACT, CONTIGUOUS substring copied directly from a SINGLE Quran verse — do NOT paraphrase, reorder, or change any word forms")
lines.append("2. Use standard Arabic script (NOT Uthmani) — e.g. use الذين not ٱلَّذِينَ")
lines.append("3. Include full harakat/tashkeel on every word")
lines.append("4. Do NOT combine text from two different verses (e.g. الم + next verse is WRONG)")
lines.append("5. Do NOT change word forms — if the verse says وَكَلَا use that, not كُلُوا; if it says عَذَابٌ use that, not عَذَابًا")
lines.append("6. Verify: strip all diacritics from your phrase and from the verse — the stripped phrase MUST appear as a substring in the stripped verse")
lines.append("7. The verse reference MUST be the verse that actually contains the phrase")
lines.append("")
lines.append("COMMON MISTAKES TO AVOID:")
lines.append("- Writing إِنِّي when the verse says إِنَّنِي")
lines.append("- Writing كُلُوا when the verse says وَكَلَا")
lines.append("- Writing عَذَابًا when the verse says عَذَابٌ")
lines.append("- Citing verse 2:1 for الم ذلك الكتاب (الم is verse 2:1 alone, ذلك الكتاب is verse 2:2)")
lines.append("- Dropping words from the middle of a phrase")
lines.append("")
lines.append("Return as JSON array: [{\"word\": \"...\", \"example\": \"...\", \"reference\": \"chapter:verse\"}]")
lines.append("")
lines.append("Words:")
lines.append("")

for f in failures:
    lines.append(f"- {f['arabic']} ({f['transliteration']}) = {f['meaning']}")

prompt = "\n".join(lines)
with open("generated/gpt_prompt_pass2_55.txt", "w", encoding="utf-8") as fp:
    fp.write(prompt)
print(f"Saved prompt to generated/gpt_prompt_pass2_55.txt")
