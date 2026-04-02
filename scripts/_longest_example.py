import json, sys, io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
d = json.load(open("generated/reel_words_top600.json", encoding="utf-8"))
ws = sorted(d["words"], key=lambda w: len(w.get("example_en", "")), reverse=True)
for w in ws[:5]:
    print(f"Rank {w['rank']:>3}  {w['arabic']:<20} en_len={len(w.get('example_en',''))}  {w['example_en']}")
