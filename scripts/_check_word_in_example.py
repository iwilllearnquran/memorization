"""Deeper analysis of word-in-example matching edge cases"""
import json, re

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
words = ds["words"]

def strip_d(s):
    return re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653-\u0655\u0640\u06E5\u06E6\u06DF]', '', s)

# Check all 600
exact_match = 0
no_match = 0
no_match_samples = []

for w in words:
    ar = strip_d(w["arabic"])
    ex = strip_d(w["pass2_gpt_example"])
    ex_words = ex.split()
    
    if ar in ex_words:
        exact_match += 1
    else:
        no_match += 1
        if len(no_match_samples) < 30:
            # Show which words could be partial matches
            partials = [ew for ew in ex_words if ar in ew or ew in ar]
            no_match_samples.append(
                f"  [{w['rank']}] word='{ar}' | ex_words={ex_words} | partials={partials}"
            )

print(f"Exact word in example: {exact_match}/600")
print(f"Not found as-is: {no_match}/600")
print()
for s in no_match_samples:
    print(s)
