"""Diagnose pass2 verification failures against imlaei text."""
import json, os, re

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

# Load imlaei cache
quran = {}
for ch in range(1, 115):
    for v in json.load(open(f"generated/.imlaei_cache/chapter_{ch}.json", encoding="utf-8")):
        quran[v["verse_key"]] = v["text"]

def strip_harakat(s):
    return re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653\u0654\u0655\u0640\u06E5\u06E6'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )

# Categorize failures
cats = {"wrong_ref": [], "extra_words": [], "char_diff": [], "other": []}
failures = []

for w in words:
    if w.get("pass2_verification") != "no":
        continue
    ex = w.get("pass2_gpt_example", "")
    ref = w.get("pass2_gpt_reference", "")
    if not ex or not ref:
        continue

    verse = quran.get(ref, "")
    if not verse:
        cats["wrong_ref"].append(w)
        continue

    ex_s = strip_harakat(ex)
    v_s = strip_harakat(verse)

    # Check if it's a subset issue (individual words all present)
    ex_words = ex_s.split()
    v_words = v_s.split()
    ex_words_in = sum(1 for ew in ex_words if ew in v_words)

    failures.append({
        "rank": w["rank"],
        "arabic": w["arabic"],
        "ex": ex,
        "ex_s": ex_s,
        "verse_s": v_s,
        "ref": ref,
        "words_match": f"{ex_words_in}/{len(ex_words)}",
    })

# Sort by word match ratio descending
failures.sort(key=lambda x: -int(x["words_match"].split("/")[0]) / max(int(x["words_match"].split("/")[1]), 1))

print(f"Total failures with valid ref: {len(failures)}")
print(f"Wrong/missing ref: {len(cats['wrong_ref'])}")

# Show word-match distribution
from collections import Counter
ratios = Counter()
for f in failures:
    matched, total = f["words_match"].split("/")
    pct = int(matched) / max(int(total), 1) * 100
    if pct == 100:
        ratios["100% words match"] += 1
    elif pct >= 75:
        ratios["75-99% words match"] += 1
    elif pct >= 50:
        ratios["50-74% words match"] += 1
    elif pct > 0:
        ratios["1-49% words match"] += 1
    else:
        ratios["0% words match"] += 1

print("\nWord-level match distribution:")
for k in sorted(ratios.keys()):
    print(f"  {k}: {ratios[k]}")

# Show some examples from each category
print("\n--- 100% words in verse but substring fails (likely word order or spacing) ---")
shown = 0
for f in failures:
    m, t = f["words_match"].split("/")
    if int(m) == int(t):
        print(f"\n  [{f['rank']}] {f['arabic']} ref={f['ref']}")
        print(f"    GPT:   {f['ex_s']}")
        # Find where words appear in verse
        for ew in f["ex_s"].split():
            idx = f["verse_s"].find(ew)
            if idx >= 0:
                context = f["verse_s"][max(0,idx-10):idx+len(ew)+10]
                pass  # they're all there
        # Show the diff
        print(f"    Verse: {f['verse_s'][:120]}...")
        shown += 1
        if shown >= 5:
            break

print("\n--- 0% word match (likely wrong verse entirely) ---")
shown = 0
for f in reversed(failures):
    m, t = f["words_match"].split("/")
    if int(m) == 0:
        print(f"\n  [{f['rank']}] {f['arabic']} ref={f['ref']}")
        print(f"    GPT:   {f['ex_s']}")
        print(f"    Verse: {f['verse_s'][:120]}...")
        shown += 1
        if shown >= 5:
            break

print("\n--- Partial match examples (some words match) ---")
shown = 0
for f in failures:
    m, t = f["words_match"].split("/")
    pct = int(m) / max(int(t), 1)
    if 0.3 < pct < 1.0:
        print(f"\n  [{f['rank']}] {f['arabic']} ref={f['ref']} words={f['words_match']}")
        print(f"    GPT:   {f['ex_s']}")
        print(f"    Verse: {f['verse_s'][:150]}...")
        shown += 1
        if shown >= 5:
            break
