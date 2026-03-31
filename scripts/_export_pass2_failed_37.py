"""Export remaining 37 pass2 failures with strict prompt showing previous wrong attempts."""
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

with open("generated/pass2_failed_37.json", "w", encoding="utf-8") as fp:
    json.dump(failures, fp, ensure_ascii=False, indent=2)
print(f"Saved {len(failures)} failures to generated/pass2_failed_37.json")

lines = []
lines.append("For each Arabic word below, give me an EXACT phrase from the Quran (2-5 words) that contains this word, plus the verse reference.")
lines.append("")
lines.append("YOU HAVE FAILED MULTIPLE TIMES ON THESE WORDS. Please be EXTREMELY careful.")
lines.append("")
lines.append("ABSOLUTE RULES:")
lines.append("1. COPY-PASTE the phrase directly from a Quran text source. Do NOT write from memory.")
lines.append("2. Use STANDARD Arabic (not Uthmani): الذين not ٱلَّذِينَ")
lines.append("3. NEVER change word forms. Use the EXACT inflection from the verse:")
lines.append("   - عَذَابٌ not عَذَابًا, هُدَاهُمْ not هُدَاىَ, شَيْئًا not شَيْـًٔا")
lines.append("4. NEVER skip/drop words. Every word between start and end must be included.")
lines.append("5. NEVER span two verses.")
lines.append("6. The reference MUST be the actual verse that contains your exact phrase.")
lines.append("")
lines.append("VERIFICATION PROCEDURE (do this for EVERY entry):")
lines.append("1. Look up the verse you're citing")
lines.append("2. Strip ALL diacritics from both your phrase and the verse")
lines.append("3. Check: is your stripped phrase a contiguous substring of the stripped verse?")
lines.append("4. If NO → pick a DIFFERENT verse. Do NOT submit it.")
lines.append("")
lines.append("Return JSON array: [{\"word\": \"...\", \"example\": \"...\", \"reference\": \"chapter:verse\"}]")
lines.append("")
lines.append("Words:")
lines.append("")

for f in failures:
    prev = f"[WRONG: {f['pass2_gpt_example']} @ {f['pass2_gpt_reference']}]" if f['pass2_gpt_example'] else ""
    lines.append(f"- {f['arabic']} ({f['transliteration']}) = {f['meaning']} {prev}")

prompt = "\n".join(lines)
with open("generated/gpt_prompt_pass2_37.txt", "w", encoding="utf-8") as fp:
    fp.write(prompt)
print(f"Saved prompt to generated/gpt_prompt_pass2_37.txt")
