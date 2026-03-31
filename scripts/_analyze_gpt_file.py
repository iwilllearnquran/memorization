import json, os

size = os.path.getsize("generated/new_gpr_examples.json")
data = open("generated/new_gpr_examples.json", "r", encoding="utf-8").read()
print(f"File size: {size} bytes")
print(f"Opening [ count: {data.count('[')}")
print(f"First 5 chars: {repr(data[:5])}")
print(f"Last 5 chars: {repr(data[-5:])}")

# Try parsing as concatenated JSON arrays
dec = json.JSONDecoder()
pos = 0
arrays = []
entries = []
while pos < len(data):
    stripped = data[pos:].lstrip()
    pos = len(data) - len(stripped)
    if pos >= len(data):
        break
    try:
        obj, end = dec.raw_decode(data, pos)
        pos += end
        if isinstance(obj, list):
            arrays.append(len(obj))
            for item in obj:
                if isinstance(item, dict) and "word" in item:
                    entries.append(item)
        elif isinstance(obj, dict) and "word" in obj:
            entries.append(obj)
    except json.JSONDecodeError:
        pos += 1

print(f"\nParsed {len(arrays)} JSON arrays")
print(f"Array sizes: {arrays}")
print(f"Total valid entries: {len(entries)}")

from collections import Counter
c = Counter(e["word"] for e in entries)
print(f"Unique words: {len(c)}")
dupes = [(w, n) for w, n in c.most_common() if n > 1]
print(f"Words with duplicates: {len(dupes)}")
for w, n in dupes[:10]:
    print(f"  {w}: {n} times")

# Show ref formats
refs = set()
for e in entries[:20]:
    refs.add(e.get("reference", ""))
print(f"\nReference samples: {list(refs)[:5]}")
