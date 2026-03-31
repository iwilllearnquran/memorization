data = open("generated/new_gpr_examples.json", "r", encoding="utf-8").read()
lines = data.split("\n")
print(f"Total lines: {len(lines)}")
for i, line in enumerate(lines):
    s = line.strip()
    if s == "[" or s == "]" or s == "]\n":
        print(f"  Line {i+1}: {repr(s)}")
    elif s.startswith("[") and len(s) < 5:
        print(f"  Line {i+1}: {repr(s)}")
