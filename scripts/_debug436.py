import json, sys, io, re
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

T = re.compile(r'[\u064B-\u065F\u06D6-\u06ED\u0640]')
A = str.maketrans({
    '\u0622':'\u0627','\u0623':'\u0627','\u0625':'\u0627',
    '\u0671':'\u0627','\u0670':'\u0627',
    '\u0621':'','\u0654':'','\u0655':'','\u0674':'','\u0653':'',
    '\u0649':'\u064A','\u0629':'\u0647','\u0624':'\u0648','\u0626':'\u064A',
    '\u06E1':'','\u06DF':'','\u06E5':'','\u06E6':'',
})
def n(t): return T.sub('',t).translate(A).strip()

d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
w = [x for x in d["words"] if x["rank"] == 436][0]
print(f"arabic: {w['arabic']}")
print(f"example_ar: {w['example_ar']}")
print(f"example_ref: {w['example_ref']}")
print(f"\nExample tokens (normalized):")
for tok in w['example_ar'].split():
    print(f"  {tok:<30} -> {n(tok)}")
