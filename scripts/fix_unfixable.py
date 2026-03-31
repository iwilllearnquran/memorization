"""
Fix the 106 'unfixable' GPT examples by improving Arabic normalization.

Root cause: strip_for_search() was REMOVING superscript alef (U+0670) instead
of REPLACING it with regular alef (ا). This caused Uthmani "صرٰط" → "صرط" 
while GPT's standard "صراط" → "صراط" — no match.

Fix: Map U+0670 → ا, U+06E5 → و, U+06E6 → ي (replace, not strip).
"""
import json, os

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "generated", ".quran_full_cache")


def strip_for_search(s):
    """Aggressive normalization — fixed to REPLACE superscript alef with regular alef."""
    out = []
    for c in s:
        cp = ord(c)
        if 0x064B <= cp <= 0x065F:  # tashkeel (includes shadda U+0651)
            continue
        if 0x0610 <= cp <= 0x061A:  # signs above
            continue
        if 0x06D6 <= cp <= 0x06DC:  # Quranic annotations
            continue
        if 0x06DD <= cp <= 0x06DE:  # verse markers
            continue
        if 0x06DF <= cp <= 0x06E4:  # more Quranic marks
            continue
        if 0x06E7 <= cp <= 0x06E8:  # Quranic marks
            continue
        if 0x06EA <= cp <= 0x06ED:  # Quranic marks
            continue
        if cp == 0x0653 or cp == 0x0654 or cp == 0x0655:  # maddah, hamza above/below
            continue
        if cp == 0x0640:  # tatweel
            continue
        if cp == 0x0620:  # dotless head of khah
            continue
        if cp in (0x08F0, 0x08F1, 0x08F2):  # combining marks
            continue
        # KEY FIX: superscript alef → regular alef (not stripped!)
        if cp == 0x0670:
            out.append('\u0627')  # ا
            continue
        # Small waw/ya → regular
        if cp == 0x06E5:
            out.append('\u0648')  # و
            continue
        if cp == 0x06E6:
            out.append('\u064A')  # ي
            continue
        # Normalize alef variants
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        elif c in '\u0649\u064A':
            out.append('\u064A')
        elif c == '\u0629':  # ta marbuta → ha
            out.append('\u0647')
        elif c == '\u0624':  # waw hamza → waw
            out.append('\u0648')
        else:
            out.append(c)
    return ''.join(out)


def collapse_dupes(s):
    """Collapse consecutive identical characters: الليل → اليل"""
    if not s:
        return s
    out = [s[0]]
    for c in s[1:]:
        if c != out[-1]:
            out.append(c)
    return ''.join(out)


def load_full_quran():
    """Load all 114 chapters from cache."""
    all_verses = []
    for ch in range(1, 115):
        cache_file = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
        if not os.path.exists(cache_file):
            print(f"  WARNING: chapter {ch} not cached!")
            continue
        verses = json.load(open(cache_file, "r", encoding="utf-8"))
        for v in verses:
            all_verses.append((v["verse_key"], v["text"], strip_for_search(v["text"])))
    return all_verses


def find_verse(example_text, all_verses):
    """Find which verse(s) contain the example phrase."""
    ex_stripped = strip_for_search(example_text)

    # Pass 1: normal substring match
    matches = []
    for verse_key, text, stripped in all_verses:
        if ex_stripped in stripped:
            matches.append(verse_key)

    if len(matches) == 1:
        return matches[0], "unique"
    elif len(matches) > 1:
        return matches[0], f"multi-{len(matches)}"

    # Pass 2: spaceless match (handles يا أيها vs يآأيها etc.)
    ex_nospace = ex_stripped.replace(' ', '')
    matches = []
    for verse_key, text, stripped in all_verses:
        if ex_nospace in stripped.replace(' ', ''):
            matches.append(verse_key)

    if len(matches) == 1:
        return matches[0], "spaceless-unique"
    elif len(matches) > 1:
        return matches[0], f"spaceless-multi-{len(matches)}"

    # Pass 3: spaceless + dedup (handles ال+sun letter: الليل vs اليل)
    ex_dedup = collapse_dupes(ex_nospace)
    matches = []
    for verse_key, text, stripped in all_verses:
        if ex_dedup in collapse_dupes(stripped.replace(' ', '')):
            matches.append(verse_key)

    if len(matches) == 1:
        return matches[0], "dedup-unique"
    elif len(matches) > 1:
        return matches[0], f"dedup-multi-{len(matches)}"

    # Fallback: word-level match
    ex_words = [w for w in ex_stripped.split() if len(w) > 1]
    if not ex_words:
        return None, "no-words"

    best_key = None
    best_ratio = 0
    for verse_key, text, stripped in all_verses:
        vs_words = set(stripped.split())
        matched = sum(1 for w in ex_words if w in vs_words)
        ratio = matched / len(ex_words)
        if ratio > best_ratio:
            best_ratio = ratio
            best_key = verse_key

    if best_ratio >= 0.8:
        return best_key, f"word-match-{best_ratio:.0%}"

    return None, "not-found"


def main():
    # Verify the fix works on known cases
    test_cases = [
        ("ٱهْدِنَا ٱلصِّرَٰطَ ٱلْمُسْتَقِيمَ", "اهْدِنَا الصِّرَاطَ الْمُسْتَقِيمَ", "superscript alef"),
        ("ٱلَّيْلِ", "اللَّيْلِ", "sun letter lam (dedup)"),
        ("يَٰٓأَيُّهَا", "يَا أَيُّهَا", "spacing difference"),
    ]
    print("Sanity checks:")
    for uthmani, standard, desc in test_cases:
        v = strip_for_search(uthmani)
        g = strip_for_search(standard)
        # Try all matching strategies
        ok = (g in v
              or g.replace(' ', '') in v.replace(' ', '')
              or collapse_dupes(g.replace(' ', '')) in collapse_dupes(v.replace(' ', '')))
        print(f"  {desc}: '{v}' vs '{g}' → {'OK' if ok else 'FAIL'}")
        assert ok, f"Sanity check failed: {desc}"
    print()

    print("Loading full Quran text...")
    all_verses = load_full_quran()
    print(f"Loaded {len(all_verses)} verses\n")

    # Precompute spaceless versions for faster matching
    for i, (vk, txt, stripped) in enumerate(all_verses):
        all_verses[i] = (vk, txt, stripped)

    # Load dataset
    ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))

    unfixable_count = 0
    fixed = 0
    still_failed = 0

    for word_entry in ds["words"]:
        if not word_entry.get("gpt_verified", "").startswith("unfixable"):
            continue

        unfixable_count += 1
        example = word_entry.get("gpt_example", "")
        if not example:
            still_failed += 1
            print(f"  NO EXAMPLE: {word_entry['arabic']}")
            continue

        correct_key, match_type = find_verse(example, all_verses)

        if correct_key:
            old_ref = word_entry.get("gpt_reference", "?")
            word_entry["gpt_reference"] = correct_key
            word_entry["gpt_verified"] = f"fixed2-{match_type}"
            fixed += 1
            print(f"  Fixed: {word_entry['arabic']} | {old_ref} -> {correct_key} ({match_type})")
        else:
            still_failed += 1
            print(f"  STILL UNFIXABLE: {word_entry['arabic']} | {example[:50]}... ({match_type})")

    # Save
    with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=2)

    print(f"\nResults:")
    print(f"  Unfixable entries: {unfixable_count}")
    print(f"  Now fixed: {fixed}")
    print(f"  Still unfixable: {still_failed}")


if __name__ == "__main__":
    main()
