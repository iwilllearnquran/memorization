"""Export the 37 non_gpt entries with a reasoning-focused prompt."""
import json

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

non_gpt = []
for w in ds["words"]:
    if w.get("pass2_verification") == "non_gpt":
        non_gpt.append({
            "rank": w["rank"],
            "arabic": w["arabic"],
            "transliteration": w.get("transliteration", ""),
            "meaning": w.get("meaning", ""),
            "current_example": w.get("pass2_gpt_example", ""),
            "current_reference": w.get("pass2_gpt_reference", ""),
        })

with open("generated/pass2_non_gpt_37.json", "w", encoding="utf-8") as fp:
    json.dump(non_gpt, fp, ensure_ascii=False, indent=2)
print(f"Saved {len(non_gpt)} entries to generated/pass2_non_gpt_37.json")

lines = []
lines.append("Use your reasoning ability for this task. Think step by step.")
lines.append("")
lines.append("For each Arabic word below, find a MEANINGFUL phrase from the Quran that contains this word.")
lines.append("The phrase can be 1-6 words — choose whatever length makes it meaningful and memorable.")
lines.append("It should be a well-known or impactful phrase that helps someone remember the word's meaning.")
lines.append("")
lines.append("REQUIREMENTS:")
lines.append("1. Use STANDARD Arabic script (not Uthmani) — e.g. الذين not ٱلَّذِينَ")
lines.append("2. The phrase MUST be an exact contiguous substring from a single Quran verse")
lines.append("3. Include full tashkeel/harakat")
lines.append("4. The reference must be the actual verse containing the phrase")
lines.append("")
lines.append("REASONING STEPS (do this for each word):")
lines.append("1. Think of a well-known verse that contains this word")
lines.append("2. Write out the full verse text")
lines.append("3. Pick a meaningful segment (1-6 words) that includes the target word")
lines.append("4. VERIFY: strip diacritics from your phrase and from the verse — confirm substring match")
lines.append("5. If it doesn't match, try another verse")
lines.append("")
lines.append("Return JSON array: [{\"word\": \"...\", \"example\": \"...\", \"reference\": \"chapter:verse\"}]")
lines.append("")
lines.append("Words:")
lines.append("")

for e in non_gpt:
    lines.append(f"- {e['arabic']} ({e['transliteration']}) = {e['meaning']}")

prompt = "\n".join(lines)
with open("generated/gpt_prompt_pass2_non_gpt_37.txt", "w", encoding="utf-8") as fp:
    fp.write(prompt)
print(f"Saved prompt to generated/gpt_prompt_pass2_non_gpt_37.txt")
