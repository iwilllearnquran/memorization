"""
Re-verify ALL GPT examples from new_gpr_examples.json against the full Quran.
Uses improved normalization (superscript alef replacement, spaceless, dedup).
For each GPT example:
  1. Try the cited verse first
  2. If that fails, search ALL 6236 verses
  3. Update dataset with correct reference + verification status
"""
import json, re, os, sys

CACHE_DIR = os.path.join(os.path.dirname(__file__), "..", "generated", ".quran_full_cache")

# ── Normalization ──────────────────────────────────────────────────────────

def strip_for_search(s):
    """Aggressive normalization: strip marks, replace superscript alef → ا.
    Handles Uthmani tatweel+hamza (ـَٔ) → ا to match standard أ → ا."""
    out = []
    after_tatweel = False  # track if we just stripped a tatweel
    for c in s:
        cp = ord(c)
        # Handle combining hamza/maddah BEFORE tashkeel (they're in the same range)
        if cp in (0x0653, 0x0654, 0x0655):        # maddah, hamza combining
            if after_tatweel:
                out.append('\u0627')              # tatweel was the seat → output ا
            # else: preceding letter IS the seat, just strip the mark
            continue
        if 0x064B <= cp <= 0x065F: continue       # tashkeel (don't reset after_tatweel)
        if 0x0610 <= cp <= 0x061A: continue       # signs above
        if 0x06D6 <= cp <= 0x06DC: continue       # Quranic annotations
        if 0x06DD <= cp <= 0x06DE: continue       # verse markers
        if 0x06DF <= cp <= 0x06E4: continue       # Quranic marks
        if 0x06E7 <= cp <= 0x06E8: continue       # Quranic marks
        if 0x06EA <= cp <= 0x06ED: continue       # Quranic marks
        if cp == 0x0640 or cp == 0x0620:          # tatweel, dotless
            after_tatweel = True; continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        after_tatweel = False
        if cp == 0x0621: continue                 # standalone hamza ء → strip
        if cp == 0x0670:                          # superscript alef → ا
            out.append('\u0627'); continue
        if cp == 0x06E5: continue                 # small waw (pronunciation mark) → strip
        if cp == 0x06E6: continue                 # small ya (pronunciation mark) → strip
        if c in '\u0627\u0671\u0623\u0625\u0622':
            out.append('\u0627')
        elif c in '\u0649\u064A\u0626':           # ya variants + ya-hamza
            out.append('\u064A')
        elif c == '\u0629':
            out.append('\u0647')
        elif c == '\u0624':
            out.append('\u0648')
        else:
            out.append(c)
    return ''.join(out)


def collapse_dupes(s):
    if not s: return s
    out = [s[0]]
    for c in s[1:]:
        if c != out[-1]:
            out.append(c)
    return ''.join(out)


def normalize_light(s):
    """Light normalization: only strip Quranic annotation marks (keep tashkeel)."""
    STRIP = set('\u0670\u06e5\u06e6\u08f0\u08f1\u08f2\u06df\u06e0\u06e1\u06e2'
                '\u06e3\u06e4\u06e7\u06e8\u06ea\u06eb\u06ec\u06ed\u0653\u0654'
                '\u0655\u065f\u0656\u0657\u0658\u06dc\u06d6\u06d7\u06d8\u06d9'
                '\u06da\u06db\u06dd\u06de\u0620')
    return ''.join(c for c in s if c not in STRIP)


# ── Matching ───────────────────────────────────────────────────────────────

def example_in_verse(example, verse):
    """Multi-tier matching of example phrase against verse text.
    Returns (match_type, None) if found in this verse, or (None, None) if not."""

    # 1. Exact substring
    if example in verse:
        return "exact"

    # 2. Light normalized (strip Quranic marks only)
    if normalize_light(example) in normalize_light(verse):
        return "normalized"

    # 3. Skeleton (full strip)
    ex = strip_for_search(example)
    vx = strip_for_search(verse)
    if ex in vx:
        return "skeleton"

    # 4. Spaceless
    ex_ns = ex.replace(' ', '')
    vx_ns = vx.replace(' ', '')
    if ex_ns in vx_ns:
        return "spaceless"

    # 5. Dedup (handles الليل vs اليل)
    if collapse_dupes(ex_ns) in collapse_dupes(vx_ns):
        return "dedup"

    # 6. Word-level
    ex_words = [w for w in ex.split() if len(w) > 1]
    vx_words = set(vx.split())
    if ex_words:
        matched = sum(1 for w in ex_words if w in vx_words)
        ratio = matched / len(ex_words)
        if ratio >= 0.7:
            return f"word-match-{matched}/{len(ex_words)}"

    return None


def find_in_full_quran(example, all_verses):
    """Search all 6236 verses for the example phrase."""
    ex = strip_for_search(example)
    ex_ns = ex.replace(' ', '')
    ex_dd = collapse_dupes(ex_ns)

    # Pass 1: skeleton substring
    matches = []
    for vk, stripped, stripped_ns, stripped_dd in all_verses:
        if ex in stripped:
            matches.append(vk)
    if len(matches) == 1:
        return matches[0], "found-unique"
    if len(matches) > 1:
        return matches[0], f"found-multi-{len(matches)}"

    # Pass 2: spaceless
    matches = []
    for vk, stripped, stripped_ns, stripped_dd in all_verses:
        if ex_ns in stripped_ns:
            matches.append(vk)
    if len(matches) == 1:
        return matches[0], "found-spaceless-unique"
    if len(matches) > 1:
        return matches[0], f"found-spaceless-multi-{len(matches)}"

    # Pass 3: dedup
    matches = []
    for vk, stripped, stripped_ns, stripped_dd in all_verses:
        if ex_dd in stripped_dd:
            matches.append(vk)
    if len(matches) == 1:
        return matches[0], "found-dedup-unique"
    if len(matches) > 1:
        return matches[0], f"found-dedup-multi-{len(matches)}"

    # Pass 4: word-level
    ex_words = [w for w in ex.split() if len(w) > 1]
    if not ex_words:
        return None, "no-words"
    best_key = None
    best_ratio = 0
    for vk, stripped, stripped_ns, stripped_dd in all_verses:
        vs_words = set(stripped.split())
        matched = sum(1 for w in ex_words if w in vs_words)
        ratio = matched / len(ex_words)
        if ratio > best_ratio:
            best_ratio = ratio
            best_key = vk
    if best_ratio >= 0.7:
        return best_key, f"found-word-{best_ratio:.0%}"

    return None, "not-found"


# ── Helpers ────────────────────────────────────────────────────────────────

def parse_verse_key(reference):
    m = re.search(r'(\d+):(\d+)', reference)
    return f"{m.group(1)}:{m.group(2)}" if m else None


def parse_gpt_json(path):
    """Parse malformed concatenated JSON arrays."""
    t = open(path, "r", encoding="utf-8").read()
    dec = json.JSONDecoder()
    entries = []
    i = 0
    while i < len(t):
        while i < len(t) and t[i] in ' \t\r\n[],':
            i += 1
        if i >= len(t):
            break
        if t[i] == '{':
            try:
                obj, end = dec.raw_decode(t, i)
                entries.append(obj)
                i = end
            except:
                i += 1
        else:
            i += 1
    return entries


def load_full_quran():
    """Load all chapters from cache, return list of (verse_key, stripped, stripped_ns, stripped_dd)."""
    all_verses = []
    for ch in range(1, 115):
        path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
        if not os.path.exists(path):
            print(f"  WARNING: chapter {ch} not cached!")
            continue
        for v in json.load(open(path, "r", encoding="utf-8")):
            s = strip_for_search(v["text"])
            ns = s.replace(' ', '')
            dd = collapse_dupes(ns)
            all_verses.append((v["verse_key"], s, ns, dd))
    return all_verses


def build_verse_map(all_verses_raw):
    """Build verse_key → raw text map from cache files."""
    vmap = {}
    for ch in range(1, 115):
        path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
        if not os.path.exists(path): continue
        for v in json.load(open(path, "r", encoding="utf-8")):
            vmap[v["verse_key"]] = v["text"]
    return vmap


# ── Main ───────────────────────────────────────────────────────────────────

def main():
    # 1. Parse GPT entries
    gpt_entries = parse_gpt_json("generated/new_gpr_examples.json")
    with_example = [e for e in gpt_entries if "example" in e]
    print(f"GPT entries: {len(gpt_entries)} total, {len(with_example)} with examples\n")

    # 2. Build GPT lookup by word (exact + stripped) — store ALL entries per word
    gpt_by_exact = {}
    gpt_by_strip = {}
    for e in with_example:
        w = e["word"]
        gpt_by_exact.setdefault(w, []).append(e)
        n = strip_for_search(w)
        gpt_by_strip.setdefault(n, []).append(e)

    # 3. Load dataset
    ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))

    # 4. Load full Quran
    print("Loading full Quran...")
    all_verses = load_full_quran()
    verse_map = build_verse_map(all_verses)
    print(f"Loaded {len(all_verses)} verses\n")

    # 5. Match and verify
    stats = {"matched": 0, "no-gpt": 0}
    verify_stats = {}

    for word_entry in ds["words"]:
        arabic = word_entry["arabic"]

        # Find GPT entries (all candidates)
        gpt_list = gpt_by_exact.get(arabic) or gpt_by_strip.get(strip_for_search(arabic))
        if not gpt_list:
            stats["no-gpt"] += 1
            word_entry["gpt_example"] = word_entry.get("short_example_ar", "")
            word_entry["gpt_reference"] = word_entry.get("example_ref", "")
            word_entry["gpt_verified"] = "no-gpt"
            continue

        stats["matched"] += 1

        # Try each GPT entry, pick the first one that verifies
        best_example = None
        best_reference = None
        best_verified = None

        for gpt in gpt_list:
            example = gpt["example"]
            reference = gpt.get("reference", "")
            verse_key = parse_verse_key(reference)

            if not verse_key:
                if best_verified is None:
                    best_example, best_reference, best_verified = example, reference, "no-ref"
                continue

            # Step A: check cited verse
            verse_text = verse_map.get(verse_key, "")
            if verse_text:
                match_type = example_in_verse(example, verse_text)
                if match_type:
                    best_example = example
                    best_reference = verse_key
                    best_verified = match_type
                    break  # Found at cited verse — best possible

            # Step B: search full Quran
            found_key, found_type = find_in_full_quran(example, all_verses)
            if found_key:
                if best_verified is None or best_verified in ("no-ref", "FAILED"):
                    best_example = example
                    best_reference = found_key
                    best_verified = found_type
                continue  # Keep trying other entries for a cited-verse match

            # Not found anywhere
            if best_verified is None:
                best_example, best_reference, best_verified = example, verse_key or reference, "FAILED"

        word_entry["gpt_example"] = best_example or gpt_list[0]["example"]
        word_entry["gpt_reference"] = best_reference or parse_verse_key(gpt_list[0].get("reference", "")) or gpt_list[0].get("reference", "")
        word_entry["gpt_verified"] = best_verified or "FAILED"
        verify_stats[word_entry["gpt_verified"]] = verify_stats.get(word_entry["gpt_verified"], 0) + 1

    # 6. For no-gpt entries that have short_example_ar, use that
    for word_entry in ds["words"]:
        if word_entry.get("gpt_verified") == "no-gpt":
            se = word_entry.get("short_example_ar", "")
            ref = word_entry.get("example_ref", "")
            if se:
                word_entry["gpt_example"] = se
                word_entry["gpt_reference"] = ref
                word_entry["gpt_verified"] = "from-short-example"

    # 7. Save
    with open("generated/reel_words_top600.json", "w", encoding="utf-8") as f:
        json.dump(ds, f, ensure_ascii=False, indent=2)

    # 8. Report
    print("=" * 60)
    print(f"GPT matched: {stats['matched']}  |  No GPT: {stats['no-gpt']}")
    print()
    print("Verification results (GPT-matched entries only):")
    # Group
    cited_ok = 0
    searched_ok = 0
    failed = 0
    for k, v in verify_stats.items():
        if k in ("exact", "normalized", "skeleton", "spaceless", "dedup") or k.startswith("word-match"):
            cited_ok += v
        elif k.startswith("found-"):
            searched_ok += v
        elif k == "FAILED":
            failed += v

    print(f"  Verified at cited verse:  {cited_ok}")
    print(f"  Found in different verse: {searched_ok}")
    print(f"  Not found anywhere:       {failed}")
    print(f"  No reference:             {verify_stats.get('no-ref', 0)}")
    print()
    print("Detailed breakdown:")
    for k, v in sorted(verify_stats.items(), key=lambda x: -x[1]):
        print(f"  {k}: {v}")

    # 9. Save failed list
    failed_list = []
    for w in ds["words"]:
        if w.get("gpt_verified") == "FAILED":
            failed_list.append({
                "rank": w.get("rank"),
                "word": w["arabic"],
                "example": w.get("gpt_example", ""),
                "reference": w.get("gpt_reference", ""),
            })
    with open("generated/failed_verifications.json", "w", encoding="utf-8") as f:
        json.dump(failed_list, f, ensure_ascii=False, indent=2)
    print(f"\nFailed list saved: {len(failed_list)} entries -> generated/failed_verifications.json")


if __name__ == "__main__":
    main()
