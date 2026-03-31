"""Export the 159 pass2 verification failures as JSON + GPT prompt."""
import json

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

failures = []
for w in words:
    v = w.get("pass2_verification", "")
    if v == "no":
        failures.append({
            "rank": w["rank"],
            "arabic": w["arabic"],
            "transliteration": w.get("transliteration", ""),
            "meaning": w.get("meaning", ""),
            "pass2_gpt_example": w.get("pass2_gpt_example", ""),
            "pass2_gpt_reference": w.get("pass2_gpt_reference", ""),
        })

# Save JSON
with open("generated/pass2_failed_159.json", "w", encoding="utf-8") as fp:
    json.dump(failures, fp, ensure_ascii=False, indent=2)
print(f"Saved {len(failures)} failures to generated/pass2_failed_159.json")

# Build GPT prompt
lines = []
lines.append("I have a list of Quran vocabulary words. For each word, provide a SHORT Arabic phrase (2-5 words) from the Quran that contains this word, along with the verse reference (chapter:verse).")
lines.append("")
lines.append("IMPORTANT RULES:")
lines.append("1. The phrase MUST be an EXACT substring copied from the Quran verse - do NOT paraphrase or rearrange words")
lines.append("2. Use standard Arabic script (NOT Uthmani) - e.g. use الذين not ٱلَّذِينَ")
lines.append("3. Include harakat/tashkeel on the phrase")
lines.append("4. The phrase must appear character-for-character in the verse you cite")
lines.append("5. Do NOT combine text from two different verses")
lines.append("6. Keep it short: 2-5 words maximum")
lines.append("7. Double-check: if you remove diacritics from your phrase, it must be a substring of the verse with diacritics removed")
lines.append("")
lines.append("Return as JSON array with objects: {\"word\", \"example\", \"reference\"}")
lines.append("")
lines.append("Here are the words:")
lines.append("")

for f in failures:
    lines.append(f"- {f['arabic']} ({f['transliteration']}) = {f['meaning']}")

prompt = "\n".join(lines)
with open("generated/gpt_prompt_pass2_159.txt", "w", encoding="utf-8") as fp:
    fp.write(prompt)
print(f"Saved prompt to generated/gpt_prompt_pass2_159.txt")
