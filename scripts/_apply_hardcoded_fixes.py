"""
Apply precise Uthmani text fixes for all 26 non-OK items.
Uses hardcoded token positions derived from API output.
Also fixes wrong references for #195 and #294.
Strips ۞ section markers from token text.

Does NOT touch any match_ok items.
"""
import json, sys, io, time, urllib.request, urllib.parse

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}
_cache = {}

def fetch_ayah_words(vk):
    if vk in _cache:
        return _cache[vk]
    enc = urllib.parse.quote(vk, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{enc}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    words = [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]
    _cache[vk] = words
    time.sleep(0.3)
    return words

def extract_uthmani(vk, start, end):
    """Extract Uthmani text for positions [start..end] inclusive, stripping ۞."""
    words = fetch_ayah_words(vk)
    tokens = []
    for w in words[start:end+1]:
        t = w.get("text_uthmani", w.get("text", ""))
        # Strip Quran section marker ۞
        t = t.replace("۞ ", "").replace("۞", "").strip()
        tokens.append(t)
    return " ".join(tokens)


# ── Hardcoded fixes ──
# Format: rank -> { ref: (field_to_use, correct_ref), ex: (ayah_key, start_pos, end_pos) }
# ref is only set when the reference needs changing.
# ex always specifies the ayah to fetch from and the token range.

FIXES = {
    # Group A: FULL matches (already applied by previous script, but verify)
    7:   {"ex": ("2:255",   0,  4)},  # ٱللَّهُ لَآ إِلَـٰهَ إِلَّا هُوَ
    45:  {"ex": ("2:21",    0,  2)},  # يَـٰٓأَيُّهَا ٱلنَّاسُ ٱعْبُدُوا۟
    62:  {"ex": ("2:21",    0,  3)},  # يَـٰٓأَيُّهَا ٱلنَّاسُ ٱعْبُدُوا۟ رَبَّكُمُ
    201: {"ex": ("104:8",   0,  2)},  # إِنَّهَا عَلَيْهِم مُّؤْصَدَةٌۭ
    # 216, 221, 241, 314, 530 already correct — skip re-fetching

    # Group B: PARTIAL-OK items that got WRONG windows — fix with correct positions
    77:  {"ex": ("6:32",    0,  4)},  # وَمَا ٱلْحَيَوٰةُ ٱلدُّنْيَآ إِلَّا لَعِبٌۭ
    227: {"ex": ("2:61",   50, 53)},  # وَيَقْتُلُونَ ٱلنَّبِيِّـۧنَ بِغَيْرِ ٱلْحَقِّ
    263: {"ex": ("7:60",    2,  5)},  # مِن قَوْمِهِۦٓ إِنَّا لَنَرَىٰكَ
    341: {"ex": ("7:86",   19, 23)},  # وَٱنظُرُوا۟ كَيْفَ كَانَ عَـٰقِبَةُ ٱلْمُفْسِدِينَ
    496: {"ex": ("2:179",   0,  3)},  # وَلَكُمْ فِى ٱلْقِصَاصِ حَيَوٰةٌۭ
    515: {"ex": ("10:56",   1,  4)},  # يُحْىِۦ وَيُمِيتُ وَإِلَيْهِ تُرْجَعُونَ
    587: {"ex": ("3:197",   0,  3)},  # مَتَـٰعٌۭ قَلِيلٌۭ ثُمَّ مَأْوَىٰهُمْ

    # Group C: Reference fixes + correct positions
    195: {"ref": "6:4",  "ex": ("6:4",    0,  3)},  # fix ref + وَمَا تَأْتِيهِم مِّنْ ءَايَةٍۢ
    294: {"ref": "36:60", "ex": ("36:60",  0,  2)},  # fix ref + أَلَمْ أَعْهَدْ إِلَيْكُمْ (strip ۞)

    # Group D: Skipped items — need correct Uthmani text
    91:  {"ex": ("3:199",   7,  9)},  # وَمَآ أُنزِلَ إِلَيْكُمْ
    305: {"ex": ("2:40",    0,  1)},  # يَـٰبَنِىٓ إِسْرَٰٓءِيلَ
    389: {"ex": ("8:29",    9, 11)},  # وَيُكَفِّرْ عَنكُمْ سَيِّـَٔاتِكُمْ
    466: {"ex": ("2:26",    0,  6)},  # إِنَّ ٱللَّهَ لَا يَسْتَحْىِۦٓ أَن يَضْرِبَ مَثَلًۭا (strip ۞)
    470: {"ex": ("2:40",    0,  1)},  # يَـٰبَنِىٓ إِسْرَٰٓءِيلَ
    495: {"ex": ("2:4",     9, 11)},  # وَبِٱلْـَٔاخِرَةِ هُمْ يُوقِنُونَ
    498: {"ex": ("36:82",   2,  4)},  # إِذَآ أَرَادَ شَيْـًٔا
    568: {"ex": ("3:19",   23, 25)},  # ٱللَّهَ سَرِيعُ ٱلْحِسَابِ
}

# ── Load JSON ──
SRC = DST = "generated/reel_words_top600_validated.json"
d = json.load(open(SRC, encoding="utf-8"))
by_rank = {w["rank"]: w for w in d["words"]}

applied = []
errors = []

for rank, fix in sorted(FIXES.items()):
    w = by_rank.get(rank)
    if not w:
        errors.append(f"#{rank}: not found in JSON")
        continue

    # Determine which fields to use
    ex_field = "pass3_example" if w.get("pass3_example") else \
               "pass2_gpt_example" if w.get("pass2_gpt_example") else None
    ref_field = "pass3_reference" if w.get("pass3_reference") else \
                "pass2_gpt_reference" if w.get("pass2_gpt_reference") else None

    if not ex_field or not ref_field:
        errors.append(f"#{rank}: no example/ref fields")
        continue

    old_ex = w[ex_field]
    old_ref = w[ref_field]

    # Fix reference if needed
    if "ref" in fix:
        w[ref_field] = fix["ref"]
        print(f"  #{rank:>3}: ref {old_ref} -> {fix['ref']}")

    # Extract correct Uthmani text
    vk, start, end = fix["ex"]
    try:
        new_ex = extract_uthmani(vk, start, end)
    except Exception as exc:
        errors.append(f"#{rank}: API error for {vk}: {exc}")
        continue

    if new_ex == old_ex:
        applied.append(f"#{rank:>3} {w['arabic']:>20}: SAME (already correct)")
    else:
        w[ex_field] = new_ex
        applied.append(f"#{rank:>3} {w['arabic']:>20}: {old_ex}  ->  {new_ex}")

# ── Also fix items 216, 221, 241, 314, 530 if they're still wrong ──
# These were FULL matches from the first script. Let's verify they're good.
full_already = [216, 221, 241, 314, 530]
for rank in full_already:
    w = by_rank[rank]
    comment = w.get("latest_validation_comment", "")
    ex_field = "pass3_example" if w.get("pass3_example") else "pass2_gpt_example"
    applied.append(f"#{rank:>3} {w['arabic']:>20}: KEPT (already FULL-applied: {w[ex_field][:50]})")

# ── Write ──
with open(DST, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print(f"\n{'='*70}")
print(f"APPLIED/VERIFIED ({len(applied)}):")
for a in applied:
    print(f"  {a}")
if errors:
    print(f"\nERRORS ({len(errors)}):")
    for e in errors:
        print(f"  {e}")
print(f"\nWritten to {DST}")
