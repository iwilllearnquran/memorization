"""Categorize the 31 remaining match issues."""
import json, re, io, sys

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

d = json.load(open('generated/reel_words_top600.json', encoding='utf-8'))
words = {w['rank']: w for w in d['words']}

fails = [45,62,77,117,119,163,216,221,227,241,305,314,318,341,358,361,470,495,515,530]
partials = [9,91,263,294,389,463,466,496,498,568,587]

print("=== FAILURES (20) ===\n")

ya_join = []  # يا + word joined in Uthmani
waw_alef = [] # وٰ vs ا (salat/zakat pattern)
data_typo = []
other = []

for r in fails:
    w = words[r]
    ex = w.get('pass2_gpt_example','')
    ref = w.get('pass2_gpt_reference','')
    ar = w['arabic']
    
    # Check if example starts with يَا as separate word
    if 'يَا ' in ex or 'يَٰ' in ar or 'يا ' in ex:
        ya_join.append(r)
        cat = "YA-JOIN"
    elif 'صَلَ' in ex or 'زَكَ' in ex or 'صلو' in ar or 'زكو' in ar:
        waw_alef.append(r)
        cat = "WAW-ALEF"
    elif 'يي' in ex:
        data_typo.append(r)
        cat = "TYPO"
    else:
        other.append(r)
        cat = "OTHER"
    
    print(f"  [{cat:8s}] #{r:3d} {ar:20s} ref={ref:8s}  ex: {ex}")

print(f"\n--- Categories ---")
print(f"  YA-JOIN (يا joined to next word in Uthmani): {len(ya_join)} -> {ya_join}")
print(f"  WAW-ALEF (وٰ vs ا spelling):                 {len(waw_alef)} -> {waw_alef}")
print(f"  DATA TYPO:                                    {len(data_typo)} -> {data_typo}")
print(f"  OTHER:                                        {len(other)} -> {other}")

print(f"\n=== PARTIALS (11) ===\n")
for r in partials:
    w = words[r]
    ex = w.get('pass2_gpt_example','')
    ref = w.get('pass2_gpt_reference','')
    print(f"  #{r:3d} {w['arabic']:20s} ref={ref:8s}  ex: {ex}")
