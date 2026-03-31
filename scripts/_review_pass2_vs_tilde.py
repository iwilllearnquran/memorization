"""
Cross-reference gpt_examples_pass2.json (47 entries) with current tilde-63.
Check if any pass2 entries provide better examples for our flagged words.
Also verify pass2 entries against imlaei cache.
"""
import json, re, os

DS_PATH = "generated/reel_words_top600.json"
PASS2_PATH = "generated/gpt_examples_pass2.json"
IMLAEI_CACHE = "generated/.imlaei_cache"

ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]
pass2 = json.load(open(PASS2_PATH, encoding="utf-8"))

# Load imlaei
imlaei = {}
for fn in os.listdir(IMLAEI_CACHE):
    verses = json.load(open(f"{IMLAEI_CACHE}/{fn}", encoding="utf-8"))
    for v in verses:
        imlaei[v["verse_key"]] = v["text"]

def strip_d(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653-\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F\u06DC\u06DB]', '', s)
    return s.strip()

def norm(s):
    s = strip_d(s)
    s = s.replace('\u0671', '\u0627').replace('\u0623', '\u0627')
    s = s.replace('\u0625', '\u0627').replace('\u0622', '\u0627')
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# Get tilde words by their arabic field (normalized)
tilde_words = {}
for w in words:
    if w.get("API_TRANSLATION", "").startswith("~"):
        tilde_words[norm(w["arabic"])] = w

# Also get non-found words
not_found = {}
for w in words:
    if "NOT found" in w.get("validation_comment", ""):
        not_found[norm(w["arabic"])] = w

print(f"=== gpt_examples_pass2.json — {len(pass2)} entries ===\n")
print("Cross-referencing with tilde-63 and word-not-found entries...\n")

matches_tilde = 0
matches_notfound = 0
verified_in_quran = 0
failed_in_quran = 0

PREFIXES = ['وال','فال','بال','كال','و','ف','ب','ل','ك','س']

def check_word_in_example(word_n, example):
    ex_tokens = norm(example).split()
    if word_n in ex_tokens:
        return True
    for t in ex_tokens:
        for pfx in PREFIXES:
            if t.startswith(pfx) and t[len(pfx):] == word_n:
                return True
    return False

for p in pass2:
    p_word_n = norm(p["arabic"])
    p_ex = p["corrected_example"]
    p_ref = p["corrected_reference"]
    
    # Verify example is in Quran
    verse_text = imlaei.get(p_ref, "")
    ex_n = norm(p_ex)
    verse_n = norm(verse_text) if verse_text else ""
    in_quran = ex_n in verse_n if verse_n else False

    # Check word in example
    word_in_ex = check_word_in_example(p_word_n, p_ex)
    
    in_tilde = p_word_n in tilde_words
    in_notfound = p_word_n in not_found
    
    tags = []
    if in_tilde:
        tags.append("TILDE-63")
        matches_tilde += 1
    if in_notfound:
        tags.append("WORD-NOT-FOUND")
        matches_notfound += 1
    if in_quran:
        verified_in_quran += 1
    else:
        failed_in_quran += 1
    
    tag_str = " ".join(tags) if tags else "(not in tilde/notfound)"
    quran_str = "IN QURAN" if in_quran else "NOT IN QURAN"
    word_str = "WORD OK" if word_in_ex else "WORD MISSING"
    
    # Show details for relevant ones
    if in_tilde or in_notfound:
        current = tilde_words.get(p_word_n) or not_found.get(p_word_n)
        print(f"[{tag_str}] [{quran_str}] [{word_str}]")
        print(f"  pass2 rank: {p['rank']} | word: {p['arabic']}")
        print(f"  pass2 example: {p_ex}")
        print(f"  pass2 ref: {p_ref}")
        print(f"  pass2 translation: {p.get('corrected_translation','')}")
        if current:
            print(f"  CURRENT example: {current['pass2_gpt_example']}")
            print(f"  CURRENT ref: {current['pass2_gpt_reference']}")
            print(f"  CURRENT issue: {current.get('validation_comment','')}")
        if not in_quran and verse_text:
            print(f"  ACTUAL verse: {verse_text[:80]}...")
        print()
    else:
        # Brief line for non-matching
        print(f"  [{quran_str}] [{word_str}] rank {p['rank']} {p['arabic']} → {p_ex[:40]}... ({p_ref}) {tag_str}")

print(f"\n=== SUMMARY ===")
print(f"pass2 entries: {len(pass2)}")
print(f"Matches tilde-63: {matches_tilde}")
print(f"Matches word-not-found: {matches_notfound}")
print(f"Verified in Quran: {verified_in_quran}/{len(pass2)}")
print(f"NOT in Quran: {failed_in_quran}/{len(pass2)}")

# Show which pass2 entries could replace current bad entries
print(f"\n=== USABLE REPLACEMENTS ===")
print("(pass2 entry is in Quran AND word is in example AND overlaps with flagged entry)\n")
usable = []
for p in pass2:
    p_word_n = norm(p["arabic"])
    p_ex = p["corrected_example"]
    p_ref = p["corrected_reference"]
    
    verse_text = imlaei.get(p_ref, "")
    ex_n = norm(p_ex)
    verse_n = norm(verse_text) if verse_text else ""
    in_quran = ex_n in verse_n if verse_n else False
    
    word_in_ex = check_word_in_example(p_word_n, p_ex)
    
    in_tilde = p_word_n in tilde_words
    in_notfound = p_word_n in not_found
    
    if (in_tilde or in_notfound) and in_quran and word_in_ex:
        current = tilde_words.get(p_word_n) or not_found.get(p_word_n)
        usable.append({
            "rank": current["rank"],
            "arabic": current["arabic"],
            "meaning": current["meaning"],
            "current_example": current["pass2_gpt_example"],
            "current_ref": current["pass2_gpt_reference"],
            "pass2_example": p_ex,
            "pass2_ref": p_ref,
            "pass2_translation": p.get("corrected_translation", ""),
            "issue": current.get("validation_comment", ""),
        })
        print(f"  [{current['rank']}] {current['arabic']} ({current['meaning']})")
        print(f"    Current: {current['pass2_gpt_example']} ({current['pass2_gpt_reference']})")
        print(f"    Pass2:   {p_ex} ({p_ref})")
        print(f"    Trans:   {p.get('corrected_translation','')}")
        print(f"    Issue:   {current.get('validation_comment','')}")
        print()

print(f"Total usable: {len(usable)}")
