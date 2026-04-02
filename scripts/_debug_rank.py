import json, urllib.request, urllib.parse, re, sys, io

if sys.stdout.encoding != "utf-8":
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
    sys.stderr = io.TextIOWrapper(sys.stderr.buffer, encoding="utf-8", errors="replace")

TASHKEEL_RE = re.compile(r'[\u064B-\u065F\u06D6-\u06ED\u0640]')
ALEF_MAP = str.maketrans({
    '\u0622': '\u0627', '\u0623': '\u0627', '\u0625': '\u0627',
    '\u0671': '\u0627', '\u0670': '\u0627',
    '\u0621': '', '\u0654': '', '\u0655': '', '\u0674': '', '\u0653': '',
    '\u0649': '\u064A', '\u0629': '\u0647', '\u0624': '\u0648', '\u0626': '\u064A',
    '\u06E1': '', '\u06DF': '', '\u06E5': '', '\u06E6': '',
})
def norm(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}

def fetch_ayah_words(verse_key):
    encoded = urllib.parse.quote(verse_key, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{encoded}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]

d = json.load(open("generated/reel_words_top600_validated.json", encoding="utf-8"))
w = [x for x in d["words"] if x["rank"] == 91][0]
ex = w.get("pass3_example", "") or w.get("pass2_gpt_example", "")
ref = w.get("pass3_reference", "") or w.get("pass2_gpt_reference", "")

ay_words = fetch_ayah_words(ref)

print(f"Rank #91: {w['arabic']}")
print(f"Ref: {ref}")
print(f"Example: {ex}")
print()
print("EXAMPLE tokens (raw -> normalized):")
ex_toks = []
for t in ex.split():
    n = norm(t)
    ex_toks.append(n)
    print(f"  [{len(ex_toks)-1}] {t:>25}  ->  {n}")
print()
print("API AYAH tokens (uthmani -> normalized):")
ay_toks = []
for x in ay_words:
    ut = x.get("text_uthmani", x.get("text", ""))
    n = norm(ut)
    ay_toks.append(n)
    print(f"  [{len(ay_toks)-1}] {ut:>25}  ->  {n}")
print()
print("TOKEN COMPARISON:")
for i, et in enumerate(ex_toks):
    matched = False
    for j, at in enumerate(ay_toks):
        if et == at:
            print(f"  ex[{i}] '{et}' == ay[{j}] '{at}'  MATCH")
            matched = True
            break
    if not matched:
        print(f"  ex[{i}] '{et}' -> NO EXACT MATCH in ayah tokens")
        # Show closest
        for j, at in enumerate(ay_toks):
            if et in at or at in et:
                print(f"         partial: ay[{j}] '{at}' (substring)")
