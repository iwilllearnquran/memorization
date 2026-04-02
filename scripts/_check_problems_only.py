"""
Dry-run validation: check all 600 words against API.
Only report match_fail, match_partial, no_example_data, api_error.
Skip match_ok and match_soft (ar_missing / en_missing).
Does NOT write anything.
"""
import json, re, sys, io, time, urllib.request, urllib.parse

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
def _norm(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()
def _strip_alef(t): return t.replace('\u0627', '')
def _fuzzy(a, b):
    if a == b: return True
    if not a or not b: return False
    if b.endswith(a) and len(a) >= 2: return True
    if a.endswith(b) and len(b) >= 2: return True
    sa, sb = _strip_alef(a), _strip_alef(b)
    if sa and sa == sb: return True
    if sb and sb.endswith(sa) and len(sa) >= 2: return True
    if sa and sa.endswith(sb) and len(sb) >= 2: return True
    return False

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}

def fetch_ayah_words(vk):
    enc = urllib.parse.quote(vk, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{enc}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]

def match(example_ar, ayah_words):
    ex_tokens = [_norm(w) for w in example_ar.split() if _norm(w)]
    ay_tokens = [_norm(w.get("text_uthmani", w.get("text", ""))) for w in ayah_words]
    if not ex_tokens or not ay_tokens:
        return 0, 0

    best_e = 0
    for s in range(len(ay_tokens)):
        ei, ai = 0, 0
        while ei < len(ex_tokens) and (s + ai) < len(ay_tokens):
            at = ay_tokens[s + ai]
            et = ex_tokens[ei]
            if _fuzzy(et, at):
                ei += 1; ai += 1
            elif ei+1 < len(ex_tokens) and _fuzzy(et + ex_tokens[ei+1], at):
                ei += 2; ai += 1
            elif ei+2 < len(ex_tokens) and _fuzzy(et + ex_tokens[ei+1] + ex_tokens[ei+2], at):
                ei += 3; ai += 1
            elif (s+ai+1) < len(ay_tokens) and _fuzzy(et, at + ay_tokens[s+ai+1]):
                ei += 1; ai += 2
            else:
                break
        if ei > best_e:
            best_e = ei
    return len(ex_tokens), best_e

# ── Load ──
d = json.load(open("generated/reel_words_top600_validated.json", encoding="utf-8"))
words = d["words"]

counts = {"ok": 0, "soft": 0, "partial": 0, "fail": 0, "no_example": 0, "api_error": 0}
problems = []

for i, w in enumerate(words):
    rank = w.get("rank", 0)
    arabic = w["arabic"]

    ex = (w.get("pass3_example", "") or w.get("pass2_gpt_example", "") or w.get("example_ar", ""))
    ref = (w.get("pass3_reference", "") or w.get("pass2_gpt_reference", "") or w.get("example_ref", ""))

    if not ex or not ref:
        counts["no_example"] += 1
        problems.append(f"#{rank:>3} {arabic:>20}  NO EXAMPLE DATA")
        continue

    try:
        time.sleep(0.25)
        ayah_words = fetch_ayah_words(ref)
        total, matched = match(ex, ayah_words)

        if matched == 0 or matched < max(1, total // 2):
            counts["fail"] += 1
            problems.append(f"#{rank:>3} {arabic:>20}  FAIL ({matched}/{total})  ref={ref}  ex={ex}")
        elif matched < total:
            counts["partial"] += 1
            problems.append(f"#{rank:>3} {arabic:>20}  PARTIAL ({matched}/{total})  ref={ref}  ex={ex}")
        else:
            # full token match — either ok or soft (we don't care about soft)
            counts["ok"] += 1

    except Exception as exc:
        counts["api_error"] += 1
        problems.append(f"#{rank:>3} {arabic:>20}  API ERROR: {exc}")

    if (i+1) % 50 == 0:
        print(f"  [{i+1}/600] checked...", file=sys.stderr)

print(f"\n{'='*70}")
print(f"SUMMARY: {len(words)} words checked")
print(f"  OK + Soft: {counts['ok']}")
print(f"  Fail:      {counts['fail']}")
print(f"  Partial:   {counts['partial']}")
print(f"  No data:   {counts['no_example']}")
print(f"  API error: {counts['api_error']}")

if problems:
    print(f"\nPROBLEMS ({len(problems)}):")
    for p in problems:
        print(f"  {p}")
else:
    print(f"\nNo problems found!")
