import json
ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
w = ds["words"]

# Count ~ markers
tilde = [x for x in w if x.get("API_TRANSLATION","").startswith("~")]
print(f"Tilde-marked API_TRANSLATION: {len(tilde)}")
for t in tilde[:10]:
    print(f"  [{t['rank']}] {t['arabic']}  AT: {t['API_TRANSLATION'][:80]}")
if len(tilde) > 10:
    print(f"  ... and {len(tilde)-10} more")

print()
# Show fields
print("Fields:", list(w[0].keys()))
print()
# First entry
for k,v in w[0].items():
    print(f"  {k}: {v}")

# Check word-in-example for a few
import re
def strip_diacritics(s):
    return re.sub(r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0653-\u0655\u0640\u06E5\u06E6\u06DF]', '', s)

print("\n--- Word-in-example check (first 10) ---")
for x in w[:10]:
    ar = x["arabic"]
    ex = x["pass2_gpt_example"]
    ar_clean = strip_diacritics(ar)
    ex_clean = strip_diacritics(ex)
    ex_words = ex_clean.split()
    found = ar_clean in ex_words
    print(f"  [{x['rank']}] word='{ar_clean}' in example words? {found}  | ex='{ex_clean}'")
