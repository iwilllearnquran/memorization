"""
For each non-OK word, fetch the API ayah, find the best Uthmani window that
covers the SAME semantic range as the original example, and print OLD vs NEW.
Only touches non-match_ok words. Does NOT write to file — just prints proposals.
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
    if b.endswith(a) and len(a) >= 2: return True
    if a.endswith(b) and len(b) >= 2: return True
    sa, sb = _strip_alef(a), _strip_alef(b)
    if sa and sa == sb: return True
    if sb.endswith(sa) and len(sa) >= 2: return True
    if sa.endswith(sb) and len(sb) >= 2: return True
    return False

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}
def fetch_ayah_words(vk):
    enc = urllib.parse.quote(vk, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{enc}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        return json.loads(resp.read().decode("utf-8"))["verse"]["words"]

def find_window_join(ex_norms, ay_norms):
    """Return (best_start, best_ay_span, best_ex_count) using join-aware matching."""
    best_s, best_a, best_e = 0, 0, 0
    for s in range(len(ay_norms)):
        ei, ai = 0, 0
        while ei < len(ex_norms) and (s + ai) < len(ay_norms):
            at = ay_norms[s + ai]
            et = ex_norms[ei]
            if _fuzzy(et, at):
                ei += 1; ai += 1
            elif ei+1 < len(ex_norms) and _fuzzy(et + ex_norms[ei+1], at):
                ei += 2; ai += 1
            elif ei+2 < len(ex_norms) and _fuzzy(et + ex_norms[ei+1] + ex_norms[ei+2], at):
                ei += 3; ai += 1
            elif (s+ai+1) < len(ay_norms) and _fuzzy(et, at + ay_norms[s+ai+1]):
                ei += 1; ai += 2
            else:
                break
        if ei > best_e:
            best_s, best_a, best_e = s, ai, ei
    return best_s, best_a, best_e

d = json.load(open("generated/reel_words_top600_validated.json", encoding="utf-8"))

for w in d["words"]:
    comment = w.get("latest_validation_comment", "")
    if comment == "match_ok":
        continue

    rank = w["rank"]
    arabic = w["arabic"]

    ex_field = "pass3_example" if w.get("pass3_example") else "pass2_gpt_example" if w.get("pass2_gpt_example") else None
    ref_field = "pass3_reference" if w.get("pass3_reference") else "pass2_gpt_reference" if w.get("pass2_gpt_reference") else None
    if not ex_field or not ref_field:
        print(f"#{rank} {arabic} - no example/ref fields, skip")
        continue

    old_ex = w[ex_field]
    ref = w[ref_field]

    time.sleep(0.3)
    try:
        all_words = fetch_ayah_words(ref)
    except Exception as exc:
        print(f"#{rank} {arabic} - API error: {exc}")
        continue

    ay_words = [x for x in all_words if x["char_type_name"] == "word"]
    ay_uthmani = [x.get("text_uthmani", x.get("text", "")) for x in ay_words]
    ay_norms = [_norm(t) for t in ay_uthmani]

    ex_norms = [_norm(t) for t in old_ex.split() if _norm(t)]
    best_s, best_a, best_e = find_window_join(ex_norms, ay_norms)

    # Build the new example: same ayah position span but use Uthmani text
    if best_a > 0:
        new_ex = " ".join(ay_uthmani[best_s : best_s + best_a])
        status = "FULL" if best_e == len(ex_norms) else "PARTIAL"
    else:
        new_ex = "(no match found)"
        status = "NONE"

    changed = new_ex != old_ex
    print(f"#{rank:>3} {arabic:>20}  [{comment}]")
    print(f"      OLD ({len(ex_norms)} toks): {old_ex}")
    print(f"      NEW ({best_a} toks, {status}): {new_ex}")
    if not changed:
        print(f"      ** SAME — no improvement")

    # Show the full ayah for manual review of problem cases
    if status != "FULL" or not changed:
        print(f"      FULL AYAH ({len(ay_uthmani)} words): {' '.join(ay_uthmani)}")
    print()
