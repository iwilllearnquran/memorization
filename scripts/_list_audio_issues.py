import json, sys, io
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")

d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))

missing = [28,30,33,42,66,127,137,155,178,203,218,223,224,245,250,263,273,283,295,302,318,331,342,356,377,378,402,406,412,431,434,436,460,505,512,525,546,548,578,587,598]
mismatch = [201,383,501]
all_ranks = sorted(set(missing + mismatch))

print(f"{'Rank':>4}  {'Arabic':<20} {'Meaning':<30} {'Issue':<10} Audio URL")
print("-" * 120)
for w in d["words"]:
    r = w["rank"]
    if r in all_ranks:
        url = w.get("audio_url", "")
        issue = "MISMATCH" if r in mismatch else "MISSING"
        print(f"{r:>4}  {w['arabic']:<20} {w['meaning']:<30} {issue:<10} {url or '(none)'}")
