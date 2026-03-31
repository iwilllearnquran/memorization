"""
Validation script: Add two new fields to each word entry.
  - validation_comment: text explaining any issues found
  - validation_flag: true = good example, false = needs review

Checks:
1. ~ prefix on API_TRANSLATION → flagged for review
2. Does the exact word appear as-is in the example (with script normalization)?
   - Uthmani ٱ vs imlaei ا, ya shapes ى vs ي, etc.
   - NOT normalizing prefixes: وما ≠ ما (that's a derived/attached form)

DOES NOT modify any existing fields.
"""
import json, re

DS_PATH = "generated/reel_words_top600.json"
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

def script_norm(s):
    """Normalize ONLY script-level differences (Uthmani vs imlaei).
    Does NOT strip prefixes or change word forms."""
    # Strip diacritics
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653-\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    # Alef wasla → plain alef
    s = s.replace('\u0671', '\u0627')  # ٱ → ا
    # Alef variants → plain alef
    s = s.replace('\u0623', '\u0627')  # أ → ا
    s = s.replace('\u0625', '\u0627')  # إ → ا
    s = s.replace('\u0622', '\u0627')  # آ → ا
    # Standalone hamza (Uthmani uses ء before alef, imlaei uses آ/أ)
    s = s.replace('\u0621', '')  # ء → remove
    # Alef maqsura ↔ ya (Uthmani uses ى, imlaei uses ي interchangeably)
    s = s.replace('\u0649', '\u064A')  # ى → ي
    # Ta marbuta ↔ ha (some Uthmani spellings differ)
    s = s.replace('\u0629', '\u0647')  # ة → ه
    return s.strip()

def loose_norm(s):
    """Aggressive normalization: also strips internal alefs.
    Handles Uthmani/imlaei spelling variants like السموت↔السماوات."""
    s = script_norm(s)
    # Remove alefs entirely (Uthmani often drops alefs that imlaei has)
    s = s.replace('\u0627', '')
    return s

issues = []
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

    # --- Check 2: Word in example ---
    ar_n = script_norm(ar)
    ex_n = script_norm(ex)
    ex_tokens = ex_n.split()

    if ar_n in ex_tokens:
        # Exact match after script normalization — perfect
        pass
    else:
        # Try loose normalization (handles Uthmani/imlaei alef differences)
        ar_loose = loose_norm(ar)
        ex_tokens_loose = [loose_norm(t) for t in ex_tokens]

        if ar_loose in ex_tokens_loose:
            # Found via loose norm — Uthmani/imlaei spelling variant, still good
            comments.append(f"Uthmani/imlaei spelling variant (word '{ar_n}' matched loosely)")
        else:
            # Check if word appears inside a token (prefix attached)
            containing = [t for t in ex_tokens if ar_n in t and t != ar_n]
            containing_loose = [t for t in ex_tokens
                                if ar_loose in loose_norm(t)
                                and loose_norm(t) != ar_loose] if not containing else []

            if containing or containing_loose:
                # Word appears only with prefix(es) attached
                shown = containing or containing_loose
                comments.append(f"word '{ar_n}' not standalone; found inside: {shown}")
                is_good = False
            else:
                # Word not found at all — check spanning
                joined_ex = ex_n.replace(' ', '')
                joined_loose = loose_norm(ex)
                if ar_n in joined_ex or ar_loose in joined_loose:
                    comments.append(f"word '{ar_n}' spans across tokens in example")
                    is_good = False
                else:
                    comments.append(f"word '{ar_n}' NOT found in example")
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

# Breakdown of issues
tilde_count = sum(1 for w in words if w.get("API_TRANSLATION","").startswith("~"))
word_not_standalone = sum(1 for w in words if "not standalone" in w.get("validation_comment",""))
word_not_found = sum(1 for w in words if "NOT found" in w.get("validation_comment",""))
word_spans = sum(1 for w in words if "spans across" in w.get("validation_comment",""))
uthmani_spell = sum(1 for w in words if "Uthmani/imlaei" in w.get("validation_comment",""))

print(f"\nBreakdown:")
print(f"  ~ on API_TRANSLATION:        {tilde_count}")
print(f"  Word not standalone (prefix): {word_not_standalone}")
print(f"  Word NOT found at all:        {word_not_found}")
print(f"  Word spans across tokens:     {word_spans}")
print(f"  Uthmani spelling diff (ok):   {uthmani_spell}")

# Show some review samples
print(f"\n--- Sample review items ---")
count = 0
for w in words:
    if not w["validation_flag"] and count < 15:
        print(f"  [{w['rank']}] word='{w['arabic']}' | ex='{w['pass2_gpt_example']}'")
        print(f"         comment: {w['validation_comment']}")
        if w.get("API_TRANSLATION","").startswith("~"):
            print(f"         AT: {w['API_TRANSLATION'][:80]}")
        count += 1
