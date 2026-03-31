import json

STRIP = set('\u0670\u06e5\u06e6\u08f0\u08f1\u08f2\u06df\u06e0\u06e1\u06e2\u06e3\u06e4\u06e7\u06e8\u06ea\u06eb\u06ec\u06ed\u0653\u0654\u0655\u065f\u0656\u0657\u0658\u06dc\u06d6\u06d7\u06d8\u06d9\u06da\u06db\u06dd\u06de\u0620')
STRIP.update('\u06df\u06e0\u0670')

def normalize(s):
    return ''.join(c for c in s if c not in STRIP)

# Parse GPT file (handles malformed JSON with multiple arrays)
t = open("generated/new_gpr_examples.json", "r", encoding="utf-8").read()
dec = json.JSONDecoder()
objs = []
i = 0
while i < len(t):
    while i < len(t) and t[i] in ' \t\r\n[],':
        i += 1
    if i >= len(t):
        break
    if t[i] == '{':
        try:
            obj, end = dec.raw_decode(t, i)
            objs.append(obj)
            i = end
        except:
            i += 1
    else:
        i += 1

gpt_exact = set(o["word"] for o in objs)
gpt_by_norm = {}
for o in objs:
    n = normalize(o["word"])
    if n not in gpt_by_norm:
        gpt_by_norm[n] = o

ds = json.load(open("generated/words_meanings.json", "r", encoding="utf-8"))

exact = 0
fuzzy = 0
missing = 0
fuzzy_list = []
missing_list = []

for w in ds:
    word = w["word"]
    if word in gpt_exact:
        exact += 1
    elif normalize(word) in gpt_by_norm:
        fuzzy += 1
        g = gpt_by_norm[normalize(word)]
        fuzzy_list.append((word, g["word"]))
    else:
        missing += 1
        missing_list.append(word)

print(f"Exact: {exact}")
print(f"Fuzzy: {fuzzy}")
print(f"No match: {missing}")
print(f"Total usable: {exact + fuzzy}/600")

if fuzzy_list:
    print(f"\nFuzzy matches ({fuzzy}):")
    for ds_word, gpt_word in fuzzy_list:
        print(f"  DS: {ds_word}  <->  GPT: {gpt_word}")

if missing_list:
    print(f"\nTruly missing ({missing}):")
    for w in missing_list:
        print(f"  {w}")
