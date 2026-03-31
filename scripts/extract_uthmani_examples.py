"""Extract verbatim Uthmani example phrases for the 19 FAILED words
directly from the cached Quran (no GPT needed)."""
import json, os, re

CACHE_DIR = os.path.join("generated", ".quran_full_cache")

def strip_for_search(s):
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
        if cp == 0x06E5: continue
        if cp == 0x06E6: continue
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

# Load all verses
all_verses = []
for ch in range(1, 115):
    path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    for v in json.load(open(path, "r", encoding="utf-8")):
        all_verses.append(v)

# Load the 19 failed words
failed = json.load(open("generated/failed_verifications.json", "r", encoding="utf-8"))
ds = json.load(open("generated/reel_words_top600.json", "r", encoding="utf-8"))
wmap = {w["rank"]: w for w in ds["words"]}

print(f"Searching {len(all_verses)} verses for {len(failed)} words...\n")

results = []
for f in failed:
    word = f["word"]
    rank = f["rank"]
    word_s = strip_for_search(word)
    word_s_dd = collapse_dupes(word_s)

    best = None
    best_score = 0

    for v in all_verses:
        text = v["text"]
        words = text.split()

        # Find the target word in verse words
        for i, w in enumerate(words):
            ws = strip_for_search(w)
            ws_dd = collapse_dupes(ws)

            # Match: exact stripped, or dedup, or substring
            match = False
            if word_s == ws:
                score = 3
                match = True
            elif word_s_dd == ws_dd:
                score = 2
                match = True
            elif word_s in ws or ws in word_s:
                score = 1
                match = True

            if match and score > best_score:
                # Extract 3-6 word window around the match
                start = max(0, i - 2)
                end = min(len(words), i + 4)
                window = " ".join(words[start:end])
                # Prefer shorter, cleaner windows (3-7 words)
                wcount = end - start
                if 3 <= wcount <= 7:
                    best = {
                        "rank": rank,
                        "word": word,
                        "example": window,
                        "reference": v["verse_key"],
                        "word_pos": i - start,
                        "score": score
                    }
                    best_score = score
                    if score == 3:
                        break  # Perfect match, stop searching this verse
        if best_score == 3:
            break  # Perfect match found, stop searching all verses

    if best:
        results.append(best)
        print(f"  rank={rank:>3}  {word:>15}  {best['reference']:>8}  {best['example'][:60]}")
    else:
        print(f"  rank={rank:>3}  {word:>15}  NOT FOUND")

# Now update the dataset
updated = 0
for r in results:
    w = wmap[r["rank"]]
    w["gpt_example"] = r["example"]
    w["gpt_reference"] = r["reference"]
    w["gpt_verified"] = "from-uthmani-search"
    updated += 1

with open("generated/reel_words_top600.json", "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nUpdated {updated}/{len(failed)} words with verbatim Uthmani phrases")

# Final stats
from collections import Counter
c = Counter(w.get("gpt_verified", "?") for w in ds["words"])
has_ex = sum(1 for w in ds["words"] if w.get("gpt_example"))
print(f"Final: {has_ex}/600 have gpt_example")
for k, v in sorted(c.items(), key=lambda x: -x[1]):
    print(f"  {k}: {v}")
