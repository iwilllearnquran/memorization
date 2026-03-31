import os, json
path = "generated/new_gpr_examples.json"
stat = os.stat(path)
print(f"File size: {stat.st_size} bytes")
print(f"Modified: {os.path.getmtime(path)}")

t = open(path, "r", encoding="utf-8").read()
dec = json.JSONDecoder()
entries = []
i = 0
while i < len(t):
    while i < len(t) and t[i] in ' \t\r\n[],':
        i += 1
    if i >= len(t): break
    if t[i] == '{':
        try:
            obj, end = dec.raw_decode(t, i)
            entries.append(obj)
            i = end
        except: i += 1
    else: i += 1

with_ex = [e for e in entries if "example" in e]
print(f"Total entries: {len(entries)}, with examples: {len(with_ex)}")
print(f"Last 5 entries:")
for e in entries[-5:]:
    print(f"  {e.get('word','')} -> {e.get('example','')[:50]} ({e.get('reference','')})")
