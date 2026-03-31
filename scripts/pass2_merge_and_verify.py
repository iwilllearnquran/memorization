"""
Merge gpt_examples_pass2.json into reel_words_top600.json (updating pass2_ fields),
then re-verify ALL 600 words against imlaei (standard Arabic) Quran text.
"""
import json, os, re

DS_PATH = "generated/reel_words_top600.json"
GPT_PATH = "generated/gpt_examples_pass2.json"  # current round
CACHE_DIR = "generated/.imlaei_cache"

# --- Load imlaei cache ---
quran = {}
for ch in range(1, 115):
    for v in json.load(open(f"{CACHE_DIR}/chapter_{ch}.json", encoding="utf-8")):
        quran[v["verse_key"]] = v["text"]
print(f"Loaded {len(quran)} imlaei verses")

# --- Load GPT responses ---
gpt_entries = json.load(open(GPT_PATH, encoding="utf-8"))
print(f"Loaded {len(gpt_entries)} GPT entries")

# --- Load dataset ---
ds = json.load(open(DS_PATH, encoding="utf-8"))
words = ds["words"]

# --- Build lookup from GPT entries by word ---
def norm(s):
    """Strip harakat + normalise Arabic letters + collapse whitespace."""
    # Strip diacritics, small marks, tatweel, etc.
    s = re.sub(
        r'[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED'
        r'\u0653\u0654\u0655\u0640\u06E5\u06E6\u06DF'
        r'\u08D3-\u08E1\u08E3-\u08FF\uFE70-\uFE7F]',
        '', s
    )
    # Normalise alef variants: ٱ أ إ آ → ا
    s = re.sub(r'[\u0671\u0623\u0625\u0622]', '\u0627', s)
    # Normalise hamza carriers: ئ → ي, ؤ → و
    s = s.replace('\u0626', '\u064A')
    s = s.replace('\u0624', '\u0648')
    # Strip standalone hamza ء
    s = s.replace('\u0621', '')
    # Alef maqsura → ya: ى → ي
    s = s.replace('\u0649', '\u064A')
    # Ta marbuta → ha: ة → ه
    s = s.replace('\u0629', '\u0647')
    return re.sub(r'\s+', ' ', s).strip()

# Map by normalised word
gpt_lookup = {}
for e in gpt_entries:
    key = norm(e["word"])
    gpt_lookup[key] = e

# --- Merge: update pass2 fields for the 163 failed words ---
merged = 0
not_found = 0
for w in words:
    if w.get("pass2_verification") != "no":
        continue
    key = norm(w["arabic"])
    if key in gpt_lookup:
        e = gpt_lookup[key]
        w["pass2_gpt_example"] = e["example"]
        w["pass2_gpt_reference"] = e["reference"]
        # Clear old fields
        if "pass2_found_in" in w:
            del w["pass2_found_in"]
        merged += 1
    else:
        not_found += 1

print(f"Merged: {merged}, Not found in GPT: {not_found}")

# --- Re-verify ALL 600 against imlaei ---
quran_normed = {vk: norm(txt) for vk, txt in quran.items()}

yes = 0
yes_other = 0
no = 0
empty = 0
no_list = []

for w in words:
    ex = w.get("pass2_gpt_example", "")
    ref = w.get("pass2_gpt_reference", "")

    if not ex or not ref:
        w["pass2_verification"] = "no"
        empty += 1
        continue

    ex_n = norm(ex)

    # 1. Check cited verse
    verse_n = quran_normed.get(ref, "")
    if verse_n and ex_n in verse_n:
        w["pass2_verification"] = "yes"
        if "pass2_found_in" in w:
            del w["pass2_found_in"]
        yes += 1
        continue

    # 2. Search entire Quran
    found = None
    for vk, vn in quran_normed.items():
        if ex_n in vn:
            found = vk
            break

    if found:
        w["pass2_verification"] = "yes-other-verse"
        w["pass2_found_in"] = found
        yes_other += 1
    else:
        w["pass2_verification"] = "no"
        no += 1
        no_list.append({
            "rank": w["rank"], "arabic": w["arabic"],
            "ex": ex, "ref": ref,
            "ex_n": ex_n,
            "verse_n": quran_normed.get(ref, "(no verse)")[:100]
        })

# Save
with open(DS_PATH, "w", encoding="utf-8") as fp:
    json.dump(ds, fp, ensure_ascii=False, indent=2)

print(f"\nResults (full re-verification against imlaei):")
print(f"  yes (cited verse):     {yes}")
print(f"  yes (other verse):     {yes_other}")
print(f"  no:                    {no}")
print(f"  empty:                 {empty}")
print(f"  total:                 {yes + yes_other + no + empty}")

if no_list:
    print(f"\n--- Remaining 'no' failures ({len(no_list)}) ---")
    for item in no_list[:20]:
        print(f"\n  [{item['rank']}] {item['arabic']} ref={item['ref']}")
        print(f"    GPT normed: {item['ex_n']}")
        print(f"    Verse norm: {item['verse_n']}")
