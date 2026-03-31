"""
Pass 2 GPT Verification:
1. Parse ALL entries from new_gpr_examples.json (mixed individual objects + arrays)
2. Match each GPT entry's word to reel_words_top600.json using Arabic normalization
3. Add pass2_gpt_example and pass2_gpt_reference fields
4. Handle duplicates by keeping all candidates per word
"""
import json, re

def strip_for_search(s):
    """Normalize Arabic for matching."""
    out = []
    after_tatweel = False
    for c in s:
        cp = ord(c)
        if cp in (0x0653, 0x0654, 0x0655):
            if after_tatweel: out.append('\u0627')
            continue
        if 0x064B <= cp <= 0x065F: continue
        if 0x0610 <= cp <= 0x061A: continue
        if 0x06D6 <= cp <= 0x06ED: continue
        if cp == 0x0640 or cp == 0x0620:
            after_tatweel = True; continue
        if cp in (0x08F0, 0x08F1, 0x08F2): continue
        after_tatweel = False
        if cp == 0x0621: continue
        if cp == 0x0670: out.append('\u0627'); continue
        if cp == 0x06E5 or cp == 0x06E6: continue
        if c in '\u0627\u0671\u0623\u0625\u0622': out.append('\u0627')
        elif c in '\u0649\u064A\u0626': out.append('\u064A')
        elif c == '\u0629': out.append('\u0647')
        elif c == '\u0624': out.append('\u0648')
        else: out.append(c)
    return ''.join(out)

def collapse_dupes(s):
    if not s: return s
    out = [s[0]]
    for c in s[1:]:
        if c != out[-1]: out.append(c)
    return ''.join(out)

def parse_reference(ref_str):
    """Extract chapter:verse from various formats like 'Surah Al-Baqarah 2:3' or '2:3'."""
    m = re.search(r'(\d+):(\d+)', ref_str or "")
    if m:
        return f"{m.group(1)}:{m.group(2)}"
    return ""

# ── Step 1: Parse all GPT entries ──
raw = open("generated/new_gpr_examples.json", "r", encoding="utf-8").read()

# Strategy: extract all {...} blocks that have "word" key using regex, then JSON parse each
entries = []
# Find all JSON objects
pattern = re.compile(r'\{[^{}]*\}', re.DOTALL)
for match in pattern.finditer(raw):
    try:
        obj = json.loads(match.group())
        if isinstance(obj, dict) and "word" in obj and "example" in obj:
            entries.append(obj)
    except json.JSONDecodeError:
        continue

print(f"Parsed {len(entries)} GPT entries from new_gpr_examples.json")

# ── Step 2: Build lookup by normalized word ──
# Group all GPT entries by normalized word (handle duplicates)
from collections import defaultdict

gpt_by_exact = defaultdict(list)    # exact word -> [entries]
gpt_by_norm = defaultdict(list)     # normalized word -> [entries]
gpt_by_skeleton = defaultdict(list) # skeleton (deduped) -> [entries]

for e in entries:
    w = e["word"]
    ex = e.get("example", "")
    ref = parse_reference(e.get("reference", ""))
    if not ex:
        continue
    entry = {"word": w, "example": ex, "reference": ref}
    gpt_by_exact[w].append(entry)
    norm = strip_for_search(w)
    gpt_by_norm[norm].append(entry)
    skel = collapse_dupes(norm)
    gpt_by_skeleton[skel].append(entry)

print(f"Unique exact words: {len(gpt_by_exact)}")
print(f"Unique normalized: {len(gpt_by_norm)}")
print(f"Unique skeleton: {len(gpt_by_skeleton)}")

# Count duplicates
dup_count = sum(1 for v in gpt_by_exact.values() if len(v) > 1)
print(f"Words with duplicate GPT entries: {dup_count}")

# ── Step 3: Load reel_words_top600.json and match ──
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

matched = 0
no_match = 0
multi_match = 0

for w in words:
    ar = w["arabic"]
    ar_norm = strip_for_search(ar)
    ar_skel = collapse_dupes(ar_norm)
    
    # Try exact match first
    candidates = gpt_by_exact.get(ar, [])
    match_type = "exact"
    
    # Then normalized
    if not candidates:
        candidates = gpt_by_norm.get(ar_norm, [])
        match_type = "normalized"
    
    # Then skeleton
    if not candidates:
        candidates = gpt_by_skeleton.get(ar_skel, [])
        match_type = "skeleton"
    
    if candidates:
        # Pick the best candidate: prefer one with a valid reference
        best = None
        for c in candidates:
            if c["reference"]:
                best = c
                break
        if not best:
            best = candidates[0]
        
        w["pass2_gpt_example"] = best["example"]
        w["pass2_gpt_reference"] = best["reference"]
        matched += 1
        if len(candidates) > 1:
            multi_match += 1
    else:
        w["pass2_gpt_example"] = ""
        w["pass2_gpt_reference"] = ""
        no_match += 1

# ── Step 4: Save ──
with open("generated/reel_words_top600.json", "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nResults:")
print(f"  Matched:      {matched}/600")
print(f"  No match:     {no_match}/600")
print(f"  Multi-dupes:  {multi_match} (picked best from duplicates)")

# Show some samples
print("\nSamples:")
for w in words[:6]:
    print(f"  rank={w['rank']} {w['arabic']} ({w.get('meaning','')})")
    print(f"    pass2_gpt_example:   {w.get('pass2_gpt_example', '')[:70]}")
    print(f"    pass2_gpt_reference: {w.get('pass2_gpt_reference', '')}")
    print()

# Show some no-match words
if no_match > 0:
    print(f"\nNo-match words (first 10):")
    for w in words:
        if not w.get("pass2_gpt_example"):
            print(f"  rank={w['rank']} {w['arabic']} ({w.get('meaning','')})")
