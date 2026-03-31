"""Deep review of all ~ marked entries — check word match, example quality, patterns."""
import json, re

DS_PATH = "generated/reel_words_top600.json"
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def script_norm(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653-\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F'
        r'\u06DC\u06DB\u0615-\u061A\u065D-\u065F]', '', s)
    s = s.replace('\u0671', '\u0627').replace('\u0623', '\u0627')
    s = s.replace('\u0625', '\u0627').replace('\u0622', '\u0627')
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    s = re.sub(r'[\u06D6-\u06ED\u0600-\u0605\u060C-\u060F]', '', s)
    return s.strip()

def loose_norm(s):
    return script_norm(s).replace('\u0627', '')

PREFIXES = ['وال', 'فال', 'بال', 'كال', 'ولل', 'وب', 'فب', 'ول', 'فل', 'وا', 'فا',
            'و', 'ف', 'ب', 'ل', 'ك', 'ا', 'س']

def word_in_example(ar, ex):
    """Returns (found, how) — True with description of how found."""
    ar_n = script_norm(ar)
    ex_tokens = script_norm(ex).split()
    ar_loose = loose_norm(ar)
    ex_tokens_loose = [loose_norm(t) for t in ex_tokens]
    
    if ar_n in ex_tokens:
        return True, "exact"
    for t in ex_tokens:
        for p in PREFIXES:
            if t.startswith(p) and t[len(p):] == ar_n:
                return True, f"prefix '{p}'+word"
    if ar_loose in ex_tokens_loose:
        return True, "loose (Uthmani/imlaei)"
    for t in ex_tokens:
        for p in PREFIXES:
            pn = loose_norm(p)
            tl = loose_norm(t)
            if tl.startswith(pn) and tl[len(pn):] == ar_loose:
                return True, f"loose prefix '{p}'+word"
    joined = ''.join(ex_tokens)
    if ar_n in joined or ar_loose in loose_norm(joined):
        return True, "spans tokens"
    return False, "NOT FOUND"

tilde = [x for x in words if x.get("API_TRANSLATION","").startswith("~")]
print(f"Total ~ entries: {len(tilde)}\n")

# Categorize
categories = {
    "word_ok_translation_suspect": [],
    "word_not_found": [],
}

for w in tilde:
    found, how = word_in_example(w["arabic"], w["pass2_gpt_example"])
    at = w["API_TRANSLATION"]
    qt = w.get("QURAN_TRANSLATION", "")
    
    cat = "word_ok_translation_suspect" if found else "word_not_found"
    categories[cat].append(w)
    
    tag = f"[WORD OK: {how}]" if found else "[WORD MISSING]"
    tilde_count = len(at) - len(at.lstrip('~'))
    
    print(f"[{w['rank']:3d}] {tag}")
    print(f"  arabic:  {w['arabic']}")
    print(f"  meaning: {w['meaning']}")
    print(f"  example: {w['pass2_gpt_example']}")
    print(f"  ref:     {w['pass2_gpt_reference']}")
    print(f"  QT: {qt}")
    print(f"  AT: {at}")
    if tilde_count > 1:
        print(f"  *** DOUBLE TILDE ({tilde_count}x) ***")
    print()

wok = len(categories["word_ok_translation_suspect"])
wnf = len(categories["word_not_found"])
print(f"\n=== SUMMARY ===")
print(f"Word found in example (translation to review): {wok}")
print(f"Word NOT found in example (bad example):       {wnf}")

# Check for patterns in the "word ok" ones — what makes translation suspicious?
print(f"\n=== PATTERN ANALYSIS ===")

# Look at the AT vs QT alignment 
print("\n--- Comparing QT vs AT for word-ok entries ---")
for w in categories["word_ok_translation_suspect"][:10]:
    qt = w.get("QURAN_TRANSLATION","")
    at = w["API_TRANSLATION"].lstrip("~").strip()
    print(f"  [{w['rank']}] '{w['arabic']}' ({w['meaning']})")
    print(f"    QT: {qt}")
    print(f"    AT: {at}")
    print()

# Show the word-not-found ones with analysis
print("\n--- Word NOT found details ---")
for w in categories["word_not_found"]:
    ar_n = script_norm(w["arabic"])
    ex_n = script_norm(w["pass2_gpt_example"])
    ex_tokens = ex_n.split()
    
    # Find closest token
    closest = None
    best = 0
    for t in ex_tokens:
        common = sum(1 for a,b in zip(ar_n, t) if a == b)
        if common > best:
            best = common
            closest = t
    
    print(f"  [{w['rank']}] word='{ar_n}' closest_token='{closest}'")
    print(f"    arabic: {w['arabic']}  meaning: {w['meaning']}")
    print(f"    example: {w['pass2_gpt_example']}")
    print()
