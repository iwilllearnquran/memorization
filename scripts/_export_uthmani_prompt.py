import json

raw = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
data = raw["words"] if isinstance(raw, dict) else raw
fus = [w for w in data if w.get("gpt_verified") == "from-uthmani-search"]

words_json = json.dumps(
    [{"word": w["arabic"], "meaning": w.get("meaning", "")} for w in fus],
    ensure_ascii=False, indent=2
)

prompt = f"""I need you to provide short Quranic Arabic example phrases for each word below.

CRITICAL RULES:
1. The example MUST be a VERBATIM excerpt from the Quran in Uthmani script — copy-paste directly from a Quran source, do NOT write from memory.
2. Use Uthmani orthography: ٱلصَّلَوٰةَ (NOT الصَّلَاة), ءَامَنُوا۟ (NOT آمَنُوا), ٱلزَّكَوٰةَ (NOT الزَّكَاة), بِـَٔايَـٰتِنَا (NOT بِآيَاتِنَا), etc.
3. Each example should be 3-7 Arabic words — a natural phrase from a single verse (do NOT combine words from different verses).
4. Include the Surah:Verse reference in "chapter:verse" number format (e.g., "2:255" not "Al-Baqarah 2:255").
5. The example phrase must actually appear IN THAT VERSE. Double-check before including.
6. Copy the "word" field EXACTLY as I provide it — do not retype or change any characters.
7. Return valid JSON array format.

COMMON MISTAKES TO AVOID:
- Do NOT use standard Arabic spelling — use Uthmani script only (e.g., الصلوٰة not الصلاة, الزكوٰة not الزكاة)
- Do NOT paraphrase or reconstruct from memory — only copy exact text from Quran
- Do NOT cross verse boundaries — the phrase must come from a single verse
- Do NOT change the word form (e.g., nominative vs accusative ending must match)

Output format - JSON array:
[
  {{{{
    "word": "<exact word from input - COPY PASTE, do not retype>",
    "example": "<3-7 word Uthmani Quranic phrase containing the word>",
    "reference": "chapter:verse"
  }}}}
]

Here are the {len(fus)} words:

{words_json}
"""

with open("generated/gpt_prompt_uthmani24.txt", "w", encoding="utf-8") as f:
    f.write(prompt)

print(f"Written {len(fus)} words to generated/gpt_prompt_uthmani24.txt")
