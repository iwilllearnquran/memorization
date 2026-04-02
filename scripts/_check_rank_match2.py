"""Find the CORRECT ranks for the 16 mismatched pass2 words."""
import json, re

ds = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
p2 = json.load(open("generated/gpt_examples_pass2.json", encoding="utf-8"))

rank_map = {w["rank"]: w for w in ds["words"]}

def strip_d(s):
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653-\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F\u06DC\u06DB]', '', s)
    return s.strip()

def norm(s):
    s = strip_d(s)
    s = s.replace('\u0671', '\u0627').replace('\u0623', '\u0627')
    s = s.replace('\u0625', '\u0627').replace('\u0622', '\u0627')
    s = s.replace('\u0626', '\u064A').replace('\u0624', '\u0648').replace('\u0621', '')
    s = s.replace('\u0649', '\u064A').replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# Build normalized word -> dataset entry map
norm_to_ds = {}
for w in ds["words"]:
    n = norm(w["arabic"])
    norm_to_ds.setdefault(n, []).append(w)

mismatched = []
for p in p2:
    r = p["rank"]
    w = rank_map.get(r)
    if w and p["arabic"] != w["arabic"]:
        mismatched.append(p)

print(f"=== {len(mismatched)} mismatched entries — finding correct ranks ===\n")

found = 0
not_found = 0
wrongly_applied = []

for p in mismatched:
    pn = norm(p["arabic"])
    matches = norm_to_ds.get(pn, [])
    if matches:
        found += 1
        m = matches[0]
        print(f"  pass2 rank {p['rank']} word '{p['arabic']}' -> CORRECT rank {m['rank']} '{m['arabic']}'")
        already_has_pass3 = "pass3_example" in m
        wrong_target = rank_map.get(p["rank"])
        wrong_has_pass3 = "pass3_example" in wrong_target if wrong_target else False
        if wrong_has_pass3:
            wrongly_applied.append((p, m, wrong_target))
            print(f"    !! WRONG rank {p['rank']} ({wrong_target['arabic']}) got pass3 fields from this entry")
        if already_has_pass3:
            print(f"    NOTE: correct rank {m['rank']} already has pass3 fields")
    else:
        not_found += 1
        print(f"  pass2 rank {p['rank']} word '{p['arabic']}' -> NOT FOUND in dataset by word")

print(f"\nFound correct rank: {found}")
print(f"Not found: {not_found}")
print(f"Wrongly applied pass3 fields: {len(wrongly_applied)}")

if wrongly_applied:
    print(f"\n=== WRONGLY APPLIED (pass3 on wrong word) ===")
    for p, correct, wrong in wrongly_applied:
        print(f"  Rank {wrong['rank']} '{wrong['arabic']}' incorrectly got pass3 from '{p['arabic']}'")
        print(f"    Should be on rank {correct['rank']} '{correct['arabic']}'")
