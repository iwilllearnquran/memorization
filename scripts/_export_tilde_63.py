"""Export 63 tilde-marked entries as JSON + GPT prompt for corrections."""
import json, re

DS_PATH = "generated/reel_words_top600.json"
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def script_norm(s):
    s = re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653-\u0655\u0640\u06E5\u06E6\u06DF\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F\u06DC\u06DB]', '', s)
    s = s.replace('\u0671', '\u0627').replace('\u0623', '\u0627').replace('\u0625', '\u0627').replace('\u0622', '\u0627')
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    s = re.sub(r'[\u06D6-\u06ED\u0600-\u0605\u060C-\u060F]', '', s)
    return s.strip()

def loose_norm(s):
    return script_norm(s).replace('\u0627', '')

PREFIXES = ['وال','فال','بال','كال','ولل','وب','فب','ول','فل','وا','فا','و','ف','ب','ل','ك','ا','س']

def check_word(ar, ex):
    ar_n = script_norm(ar)
    ex_tokens = script_norm(ex).split()
    ar_l = loose_norm(ar)
    if ar_n in ex_tokens:
        return "WORD OK (exact)"
    for t in ex_tokens:
        for p in PREFIXES:
            if t.startswith(p) and t[len(p):] == ar_n:
                return "WORD OK (with prefix)"
    if ar_l in [loose_norm(t) for t in ex_tokens]:
        return "WORD OK (Uthmani variant)"
    for t in ex_tokens:
        for p in PREFIXES:
            tl, pl = loose_norm(t), loose_norm(p)
            if tl.startswith(pl) and tl[len(pl):] == ar_l:
                return "WORD OK (loose+prefix)"
    if ar_n in ''.join(ex_tokens) or ar_l in loose_norm(''.join(ex_tokens)):
        return "WORD OK (spans tokens)"
    return "WORD MISSING — example does not contain this exact word form, NEEDS NEW EXAMPLE"

tilde = [x for x in words if x.get("API_TRANSLATION", "").startswith("~")]

# Build export list
export = []
for w in tilde:
    word_status = check_word(w["arabic"], w["pass2_gpt_example"])
    issue = word_status
    if "MISSING" not in word_status:
        issue += " — but translation flagged for review"
    
    export.append({
        "rank": w["rank"],
        "arabic": w["arabic"],
        "meaning": w["meaning"],
        "current_example": w["pass2_gpt_example"],
        "current_reference": w["pass2_gpt_reference"],
        "current_QURAN_TRANSLATION": w.get("QURAN_TRANSLATION", ""),
        "current_API_TRANSLATION": w.get("API_TRANSLATION", "").lstrip("~").strip(),
        "issue": issue,
        # Fields GPT should fill:
        "corrected_example": "",
        "corrected_reference": "",
        "corrected_translation": "",
    })

with open("generated/tilde_63_for_gpt.json", "w", encoding="utf-8") as f:
    json.dump(export, f, ensure_ascii=False, indent=2)

print(f"Exported {len(export)} entries to generated/tilde_63_for_gpt.json")

# Build GPT prompt
prompt = """You are a Quran Arabic linguist. I have a dataset of 600 most frequent Quran words. Each word has a short Quranic Arabic example phrase (2-5 words from an actual verse) and its verse reference.

I need you to review and correct 63 entries that have been flagged. For each entry I give you:
- rank, arabic word, meaning
- current_example (Arabic phrase from Quran)
- current_reference (surah:ayah)
- current_QURAN_TRANSLATION (word-by-word English)
- current_API_TRANSLATION (Google Translate English)
- issue (what was flagged)

YOUR TASK for each entry:
1. CHECK if the exact Arabic word form appears in the example phrase (with or without common prefixes like و ف ب ل ك س attached). The EXACT word form must be there — not a different grammatical case, number, gender, or derived form.
2. CHECK if the English translations make sense for the Arabic example phrase.
3. For each entry, return:
   - "corrected_example": A short Quranic phrase (2-5 words) from an ACTUAL verse that contains the EXACT word form. If the current example is fine, copy it as-is.
   - "corrected_reference": The correct surah:ayah. If unchanged, copy as-is.
   - "corrected_translation": A clear, natural English translation of the phrase. If the current translations are fine, pick the better one or write a new one.

CRITICAL RULES:
- The corrected_example MUST be an exact substring of the actual Quran verse (standard/imlaei Arabic script).
- The exact word form (after removing diacritics) must appear in the phrase — either standalone or with a single prefix (و، ف، ب، ل، ك، أ، س) attached.
- Different grammatical cases are NOT acceptable (e.g., المؤمنين ≠ المؤمنون, الظالمون ≠ الظالمين).
- Different number/gender is NOT acceptable (e.g., جنة ≠ جنات, أخرى ≠ آخر).
- Different word entirely is NOT acceptable (e.g., القيامة cannot use example with الدين).
- Keep phrases short (2-5 words) and meaningful.

Return ONLY valid JSON array — same structure as input but with corrected_example, corrected_reference, and corrected_translation filled in.

Here are the 63 entries:

"""

prompt += json.dumps(export, ensure_ascii=False, indent=2)

with open("generated/gpt_prompt_tilde_63.txt", "w", encoding="utf-8") as f:
    f.write(prompt)

print(f"GPT prompt written to generated/gpt_prompt_tilde_63.txt")
print(f"\nBreakdown:")
issues = {}
for e in export:
    i = e["issue"] or "(no specific issue — translation flagged)"
    key = i.split(";")[0].strip() if ";" in i else i
    issues[key] = issues.get(key, 0) + 1
for k, v in sorted(issues.items(), key=lambda x: -x[1]):
    print(f"  {v:3d}  {k}")
