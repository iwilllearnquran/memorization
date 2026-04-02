"""
Check which words DON'T match in their example text (Arabic and English).
Arabic: after normalizing (strip tashkeel + ALEF_MAP), check if word appears in any example token.
English: case-insensitive check if meaning appears in example_en.
"""
import json, re, sys, io

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u06D6-\u06ED\u0640]')
ALEF_MAP = str.maketrans({
    '\u0622': '\u0627', '\u0623': '\u0627', '\u0625': '\u0627',
    '\u0671': '\u0627', '\u0670': '\u0627',
    '\u0621': '', '\u0654': '', '\u0655': '', '\u0674': '', '\u0653': '',
    '\u0649': '\u064A', '\u0629': '\u0647', '\u0624': '\u0648', '\u0626': '\u064A',
    '\u06E1': '', '\u06DF': '', '\u06E5': '', '\u06E6': '',
})
def _norm(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()

d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

ar_miss = []
en_miss = []

for w in d["words"]:
    rank = w["rank"]
    arabic = w["arabic"]
    meaning = w["meaning"]
    example_ar = w.get("example_ar", "")
    example_en = w.get("example_en", "")

    # Arabic check: normalized word should appear in at least one normalized example token
    norm_word = _norm(arabic)
    if norm_word and len(norm_word) >= 2 and example_ar:
        found = False
        # Step 1: direct substring match
        for tok in example_ar.split():
            if norm_word in _norm(tok):
                found = True
                break
        # Step 1b: trailing-alef-stripped match (handles ىٰ→يا vs ى→ي)
        if not found:
            trimmed = norm_word.rstrip('\u0627')
            if trimmed != norm_word and len(trimmed) >= 2:
                for tok in example_ar.split():
                    if trimmed in _norm(tok):
                        found = True
                        break
        # Step 2: prefix-stripped match (ال prefix vs لل/ول etc)
        if not found:
            bare = norm_word.lstrip('و')
            if bare.startswith('ال'):
                bare = bare[2:]
            if len(bare) >= 2:
                for tok in example_ar.split():
                    nt = _norm(tok).lstrip('و')
                    for pfx in ('لل', 'بال', 'فال', 'كال', 'ل', 'ب', 'ف', 'ك', 'وال', 'ول', 'وب', ''):
                        if nt.startswith(pfx) and bare in nt[len(pfx):]:
                            found = True
                            break
                    if found:
                        break
        if not found:
            ar_miss.append((rank, arabic, norm_word, example_ar))

    # English check: meaning (case-insensitive) should appear in example_en
    if meaning and example_en:
        meaning_low = meaning.lower().strip()
        en_low = example_en.lower()
        found = meaning_low in en_low
        if not found:
            # Try individual words of meaning (for multi-word meanings)
            words = meaning_low.split()
            found = any(mw in en_low for mw in words if len(mw) > 2)
        if not found and '/' in meaning_low:
            # Try each part of "/" separated meaning (e.g. "is/was", "We (were)/ We (used to)")
            import re as _re
            parts = [_re.sub(r'[()]', '', p).strip() for p in meaning_low.split('/')]
            for part in parts:
                if len(part) >= 2 and part in en_low:
                    found = True
                    break
        if not found:
            # Stem-prefix match: "wronged"→"wrong", "destroyed"→"destroy"
            stem_meaning = re.sub(r'[()]', '', meaning_low).strip().split()
            if stem_meaning:
                stem = stem_meaning[-1]
                if len(stem) >= 4:
                    for ew in example_en.split():
                        ewl = ew.lower().strip('.,;:!?()')
                        if ewl.startswith(stem) or stem.startswith(ewl):
                            found = True
                            break
        if not found:
            en_miss.append((rank, arabic, meaning, example_en))

print(f"ARABIC MISMATCHES ({len(ar_miss)}):")
print(f"{'Rank':<6} {'Word':<20} {'Normalized':<20} Example")
print("-" * 100)
for rank, arabic, norm, ex in ar_miss:
    print(f"{rank:<6} {arabic:<20} {norm:<20} {ex}")

print(f"\nENGLISH MISMATCHES ({len(en_miss)}):")
print(f"{'Rank':<6} {'Word':<20} {'Meaning':<25} Example EN")
print("-" * 100)
for rank, arabic, meaning, en in en_miss:
    print(f"{rank:<6} {arabic:<20} {meaning:<25} {en}")
