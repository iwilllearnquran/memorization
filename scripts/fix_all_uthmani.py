"""
Replace ALL GPT examples with verbatim Uthmani text from the cited verse.
For each word where gpt_example doesn't exactly appear in the cited verse,
find the word in that verse and extract a clean 3-7 word window.
"""
import json, os, re
from collections import Counter

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

# Load Quran cache
quran = {}  # verse_key -> text
all_verses = []
for ch in range(1, 115):
    path = os.path.join(CACHE_DIR, f"chapter_{ch}.json")
    data = json.load(open(path, "r", encoding="utf-8"))
    for v in data:
        quran[v["verse_key"]] = v["text"]
        all_verses.append(v)

print(f"Loaded {len(quran)} verses")

# Load dataset
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]
print(f"Processing {len(words)} words\n")

def find_word_in_verse(target_word, verse_text):
    """Find target_word in verse_text using normalized matching.
    Returns (index, match_quality) or (None, 0)."""
    target_s = strip_for_search(target_word)
    target_dd = collapse_dupes(target_s)
    verse_words = verse_text.split()
    
    best_idx = None
    best_score = 0
    
    for i, vw in enumerate(verse_words):
        vw_s = strip_for_search(vw)
        vw_dd = collapse_dupes(vw_s)
        
        if target_s == vw_s:
            return i, 3  # exact normalized match
        elif target_dd == vw_dd and best_score < 2:
            best_idx, best_score = i, 2
        elif (target_s in vw_s or vw_s in target_s) and best_score < 1:
            best_idx, best_score = i, 1
    
    return best_idx, best_score

def extract_window(verse_text, word_idx, target_len=5):
    """Extract a natural 3-7 word window around word_idx."""
    vwords = verse_text.split()
    n = len(vwords)
    
    # Try to center the window around the word
    half = (target_len - 1) // 2
    start = max(0, word_idx - half)
    end = min(n, start + target_len)
    start = max(0, end - target_len)  # adjust back if at end
    
    # Ensure 3-7 words
    window_len = end - start
    if window_len < 3:
        start = max(0, word_idx - 1)
        end = min(n, word_idx + 2)
    if end - start > 7:
        end = start + 7
    
    return " ".join(vwords[start:end])

fixed = 0
already_ok = 0
no_verse = 0
no_match = 0

for w in words:
    ex = w.get("gpt_example", "")
    ref = w.get("gpt_reference", "")
    ar = w["arabic"]
    
    if not ex or not ref:
        continue
    
    verse_text = quran.get(ref, "")
    if not verse_text:
        no_verse += 1
        continue
    
    # Already exact match?
    if ex in verse_text:
        already_ok += 1
        continue
    
    # Find the word in the cited verse
    word_idx, score = find_word_in_verse(ar, verse_text)
    
    if word_idx is not None:
        # Extract window from the ACTUAL Uthmani verse
        new_example = extract_window(verse_text, word_idx)
        
        # Verify the new example is actually in the verse
        if new_example in verse_text:
            w["gpt_example"] = new_example
            fixed += 1
        else:
            # Try smaller window
            vwords = verse_text.split()
            start = max(0, word_idx - 1)
            end = min(len(vwords), word_idx + 3)
            new_example = " ".join(vwords[start:end])
            if new_example in verse_text:
                w["gpt_example"] = new_example
                fixed += 1
            else:
                no_match += 1
                print(f"  WINDOW FAIL rank={w['rank']:<4} {ar[:20]:<20} ref={ref}")
    else:
        # Word not found in cited verse — try full Quran search
        found = False
        target_s = strip_for_search(ar)
        target_dd = collapse_dupes(target_s)
        
        for v in all_verses:
            vtext = v["text"]
            idx, sc = find_word_in_verse(ar, vtext)
            if idx is not None and sc >= 2:
                new_example = extract_window(vtext, idx)
                if new_example in vtext:
                    w["gpt_example"] = new_example
                    w["gpt_reference"] = v["verse_key"]
                    w["gpt_verified"] = "from-uthmani-search"
                    fixed += 1
                    found = True
                    break
        
        if not found:
            no_match += 1
            print(f"  NOT FOUND  rank={w['rank']:<4} {ar[:20]:<20} ref={ref}")

# Save
with open("generated/reel_words_top600.json", "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nResults:")
print(f"  Already exact match: {already_ok}")
print(f"  Fixed with Uthmani:  {fixed}")
print(f"  No verse in cache:   {no_verse}")
print(f"  Could not match:     {no_match}")
print(f"  Total:               {already_ok + fixed + no_verse + no_match}")

# Verify
ok = 0
for w in words:
    ex = w.get("gpt_example", "")
    ref = w.get("gpt_reference", "")
    if ex and ref and ex in quran.get(ref, ""):
        ok += 1
print(f"\nStrict verification: {ok}/600 examples appear exactly in cited verse")
