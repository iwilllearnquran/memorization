"""Export remaining 50 pass2 failures with a very strict prompt."""
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

with open("generated/pass2_failed_50.json", "w", encoding="utf-8") as fp:
    json.dump(failures, fp, ensure_ascii=False, indent=2)
print(f"Saved {len(failures)} failures to generated/pass2_failed_50.json")

lines = []
lines.append("For each Arabic word below, give me an EXACT phrase from the Quran (2-5 words) that contains this word, plus the verse reference.")
lines.append("")
lines.append("STRICT RULES — read carefully, your previous attempts had these exact errors:")
lines.append("")
lines.append("1. COPY-PASTE from the Quran. Do NOT write from memory. Every word in your phrase must appear consecutively in the verse.")
lines.append("2. Use STANDARD Arabic (not Uthmani). Example: write الذين not ٱلَّذِينَ")
lines.append("3. Do NOT change word forms:")
lines.append("   - If the verse says عَذَابٌ أَلِيمٌ do NOT write عَذَابًا أَلِيمًا")
lines.append("   - If the verse says وَنَزَّلْنَا do NOT write وَأَنزَلْنَا")
lines.append("   - If the verse says إِنَّنِي do NOT write إِنِّي")
lines.append("   - If the verse says وَكَلَا do NOT write كُلُوا")
lines.append("   - If the verse says شَيْئًا keep the hamza, do NOT drop it")
lines.append("4. Do NOT skip words from the middle of a phrase. If the verse says 'قال ابراهيم ربي' do NOT write 'قال ربي'")
lines.append("5. Do NOT span two verses. الم is verse 2:1 ALONE. ذلك الكتاب is verse 2:2.")
lines.append("6. The verse reference must be the ACTUAL verse containing your phrase")
lines.append("7. Include harakat/tashkeel")
lines.append("")
lines.append("SELF-CHECK before submitting each entry:")
lines.append("- Remove all diacritics from your phrase AND from the actual verse text")
lines.append("- Confirm your stripped phrase is a contiguous substring of the stripped verse")
lines.append("- If it fails, pick a DIFFERENT verse where the word actually appears as-is")
lines.append("")
lines.append("Return JSON array: [{\"word\": \"...\", \"example\": \"...\", \"reference\": \"chapter:verse\"}]")
lines.append("")
lines.append("Words:")
lines.append("")

for f in failures:
    prev = f"(previous wrong attempt: {f['pass2_gpt_example']} @ {f['pass2_gpt_reference']})" if f['pass2_gpt_example'] else ""
    lines.append(f"- {f['arabic']} ({f['transliteration']}) = {f['meaning']} {prev}")

prompt = "\n".join(lines)
with open("generated/gpt_prompt_pass2_50.txt", "w", encoding="utf-8") as fp:
    fp.write(prompt)
print(f"Saved prompt to generated/gpt_prompt_pass2_50.txt")
