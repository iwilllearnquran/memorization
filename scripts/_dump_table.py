import json, sys, io
if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
data = json.loads(open("../generated/reel_words_top600.json", encoding="utf-8").read())
for w in data["words"]:
    print(f"{w['rank']}|{w['arabic']}|{w['meaning']}|{w['occurrences']}")
