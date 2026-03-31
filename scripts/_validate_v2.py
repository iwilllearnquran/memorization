"""
Redo validation:
- Word with prefix (و، ف، ب، ل، ك، أ، س، وال، فال، بال، etc.) attached = FINE
- But the exact word form must match — different grammatical form is NOT okay
  (e.g., المؤمنين vs المؤمنون = NOT ok, جنة vs جنات = NOT ok)

Rewrites validation_flag and validation_comment. Does NOT touch any other fields.
"""
import json, re

DS_PATH = "generated/reel_words_top600.json"
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def script_norm(s):
    """Normalize script-level differences (Uthmani vs imlaei) + strip diacritics."""
    # Strip diacritics and Quranic marks
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653-\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F'
        r'\u06DC\u06DB\u0615\u0616\u0617\u0618\u0619\u061A'
        r'\u065D\u065E\u065F'  
        r']', '', s
    )
    # Alef wasla/hamza variants → plain alef
    s = s.replace('\u0671', '\u0627')  # ٱ → ا
    s = s.replace('\u0623', '\u0627')  # أ → ا
    s = s.replace('\u0625', '\u0627')  # إ → ا
    s = s.replace('\u0622', '\u0627')  # آ → ا
    # Hamza carriers
    s = s.replace('\u0626', '\u064A')  # ئ → ي
    s = s.replace('\u0624', '\u0648')  # ؤ → و
    s = s.replace('\u0621', '')        # ء → remove
    # Alef maqsura ↔ ya
    s = s.replace('\u0649', '\u064A')  # ى → ي
    # Ta marbuta → ha
    s = s.replace('\u0629', '\u0647')  # ة → ه
    # Remove small high characters and other marks
    s = re.sub(r'[\u06D7-\u06ED\u0600-\u0605\u060C-\u060F]', '', s)
    # Strip Quran-specific signs (ۗ ۚ etc)
    s = re.sub(r'[\u06D6-\u06DC\u06DD-\u06DE\u06DF-\u06E4\u06E7-\u06ED]', '', s)
    return s.strip()

def loose_norm(s):
    """Also strips alefs for Uthmani/imlaei spelling variants."""
    s = script_norm(s)
    s = s.replace('\u0627', '')  # remove all alefs
    return s

# Common Arabic prefixes (single and compound)
PREFIXES = [
    'وال', 'فال', 'بال', 'كال', 'ولل',
    'وب', 'فب', 'ول', 'فل', 'وا', 'فا',
    'و', 'ف', 'ب', 'ل', 'ك', 'ا', 'س',
]

def strip_prefix(token, word):
    """Check if token = prefix + word. Returns True if match found."""
    for p in PREFIXES:
        if token.startswith(p) and token[len(p):] == word:
            return True
    return False

def strip_prefix_loose(token, word):
    """Same but with loose (alef-stripped) matching."""
    t_l = loose_norm_cache.get(token, loose_norm(token))
    w_l = loose_norm(word)
    for p in PREFIXES:
        pn = loose_norm(p)
        if t_l.startswith(pn) and t_l[len(pn):] == w_l:
            return True
    return False

# Pre-compute
loose_norm_cache = {}

good = 0
review = 0

for w in words:
    comments = []
    is_good = True

    ar = w["arabic"]
    ex = w["pass2_gpt_example"]
    at = w.get("API_TRANSLATION", "")

    # --- Check 1: ~ marker on API_TRANSLATION ---
    if at.startswith("~"):
        comments.append("API_TRANSLATION marked ~ for review")
        is_good = False

    # --- Check 2: Word in example (exact form, prefix OK) ---
    ar_n = script_norm(ar)
    ex_n = script_norm(ex)
    ex_tokens = ex_n.split()

    word_found = False

    # 2a: Exact standalone match
    if ar_n in ex_tokens:
        word_found = True

    # 2b: Token = prefix + exact word
    if not word_found:
        for t in ex_tokens:
            if strip_prefix(t, ar_n):
                word_found = True
                break

    # 2c: Loose norm (handles Uthmani alef differences) — standalone
    if not word_found:
        ar_loose = loose_norm(ar_n)
        ex_tokens_loose = [loose_norm(t) for t in ex_tokens]
        if ar_loose in ex_tokens_loose:
            word_found = True

    # 2d: Loose norm with prefix stripping
    if not word_found:
        for t in ex_tokens:
            if strip_prefix_loose(t, ar_n):
                word_found = True
                break

    # 2e: Handle يأيها → يا أيها type splits (token in key is joined, example splits them)
    if not word_found:
        joined_ex = ''.join(ex_tokens)
        joined_ex_loose = loose_norm(joined_ex)
        ar_loose = loose_norm(ar_n)
        if ar_n in joined_ex or ar_loose in joined_ex_loose:
            word_found = True

    if not word_found:
        comments.append(f"word '{ar_n}' NOT found in example (different form)")
        is_good = False

    # --- Set fields ---
    w["validation_flag"] = is_good
    w["validation_comment"] = "; ".join(comments) if comments else ""

    if is_good:
        good += 1
    else:
        review += 1

# Save
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"Good (flag=true):  {good}/600")
print(f"Review (flag=false): {review}/600")

# Breakdown
tilde_count = sum(1 for w in words if w.get("API_TRANSLATION","").startswith("~"))
word_nf = sum(1 for w in words if "NOT found" in w.get("validation_comment",""))
tilde_only = sum(1 for w in words 
                 if "~" in w.get("validation_comment","") 
                 and "NOT found" not in w.get("validation_comment",""))
tilde_and_nf = sum(1 for w in words 
                   if "~" in w.get("validation_comment","") 
                   and "NOT found" in w.get("validation_comment",""))
nf_only = sum(1 for w in words 
              if "NOT found" in w.get("validation_comment","")
              and "~" not in w.get("validation_comment",""))

print(f"\nBreakdown of {review} review items:")
print(f"  ~ only (translation):     {tilde_only}")
print(f"  word NOT found only:      {nf_only}")
print(f"  ~ AND word NOT found:     {tilde_and_nf}")

# Show NOT found
nf_list = [x for x in words if "NOT found" in x.get("validation_comment","")]
print(f"\n--- Word NOT found ({len(nf_list)}) ---")
for x in nf_list:
    tilde_mark = " [~]" if x.get("API_TRANSLATION","").startswith("~") else ""
    print(f"  [{x['rank']:3d}]{tilde_mark} word='{x['arabic']}'  ex='{x['pass2_gpt_example']}'")
