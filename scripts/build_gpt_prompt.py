import json

missing = json.load(open("generated/missing_words_for_gpt.json", "r", encoding="utf-8"))
words_json = json.dumps(missing, ensure_ascii=False, indent=2)

prompt = f"""I need you to provide short Quranic Arabic example phrases for each word below.

CRITICAL RULES:
1. Use the EXACT Arabic word spelling I provide - copy-paste it, do NOT retype it. These use Uthmani Quranic script with special characters like \u06df \u0670 \u0653 \u06ed \u06e2 \u06e5 \u06e6 - you MUST preserve them exactly.
2. Each example should be 4-7 Arabic words from the Quran containing that word.
3. The example should be a natural, meaningful phrase - not start or end abruptly.
4. Include the Surah name and verse number as reference.
5. Return valid JSON array format.

Output format - JSON array:
[
  {{
    "word": "<exact word from input - COPY PASTE, do not retype>",
    "example": "<4-7 word Quranic phrase containing the word>",
    "reference": "Surah Name V:A"
  }}
]

Here are the 197 words (copy the "word" field EXACTLY as-is):

{words_json}
"""

with open("generated/gpt_prompt_missing_words.txt", "w", encoding="utf-8") as f:
    f.write(prompt)

print(f"Prompt written ({len(prompt)} chars, {len(missing)} words)")
