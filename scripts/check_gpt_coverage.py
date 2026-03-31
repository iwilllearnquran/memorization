import json, re, sys

# Parse the possibly-malformed GPT examples file
t = open("generated/new_gpr_examples.json", "r", encoding="utf-8").read()

# Extract all JSON objects using raw_decode
dec = json.JSONDecoder()
objs = []
i = 0
while i < len(t):
    # Skip whitespace and array delimiters
    while i < len(t) and t[i] in ' \t\r\n[],':
        i += 1
    if i >= len(t):
        break
    if t[i] == '{':
        try:
            obj, end = dec.raw_decode(t, i)
            objs.append(obj)
            i = end
        except json.JSONDecodeError:
            i += 1
    else:
        i += 1

# Load dataset
ds = json.load(open("generated/words_meanings.json", "r", encoding="utf-8"))

words_gpt = set(w["word"] for w in objs)
missing = [w["word"] for w in ds if w["word"] not in words_gpt]

print(f"GPT entries: {len(objs)} total, {len(words_gpt)} unique words")
print(f"Dataset: {len(ds)} words")
print(f"Covered: {len(ds) - len(missing)}")
print(f"Still missing: {len(missing)}")
if missing:
    print()
    for w in missing:
        print(f"  {w}")

# Also export missing
missing_full = [w for w in ds if w["word"] not in words_gpt]
json.dump(missing_full, open("generated/missing_words.json", "w", encoding="utf-8"), ensure_ascii=False, indent=2)
print(f"\nExported to generated/missing_words.json")
