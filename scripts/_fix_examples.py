"""Fix partial/fail examples by replacing with correct Uthmani tokens from API."""
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
def _norm_ar(t): return TASHKEEL_RE.sub('', t).translate(ALEF_MAP).strip()
def _strip_alef(t): return t.replace('\u0627', '')
def _fuzzy_tok_eq(ex_tok, ay_tok):
    if ex_tok == ay_tok: return True
    if ay_tok.endswith(ex_tok) and len(ex_tok) >= 2: return True
    if ex_tok.endswith(ay_tok) and len(ay_tok) >= 2: return True
    ex_s, ay_s = _strip_alef(ex_tok), _strip_alef(ay_tok)
    if ex_s and ex_s == ay_s: return True
    if ay_s.endswith(ex_s) and len(ex_s) >= 2: return True
    if ex_s.endswith(ay_s) and len(ay_s) >= 2: return True
    return False

HEADERS = {"User-Agent": "LearnQuranDaily/2.0", "Accept": "application/json"}
def fetch_ayah_words(verse_key):
    encoded = urllib.parse.quote(verse_key, safe="")
    url = f"https://api.quran.com/api/v4/verses/by_key/{encoded}?language=en&words=true&word_fields=text_uthmani"
    req = urllib.request.Request(url, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=20) as resp:
        data = json.loads(resp.read().decode("utf-8"))
    return [w for w in data["verse"]["words"] if w["char_type_name"] == "word"]

def find_best_window(ex_tokens_norm, ay_words):
    """Find best starting position and span in ayah words using join-aware matching."""
    ay_tokens_norm = [_norm_ar(w.get("text_uthmani", w.get("text", ""))) for w in ay_words]
    best_start, best_ay_span, best_ex_matched = 0, 0, 0
    for start in range(len(ay_tokens_norm)):
        ei, ai = 0, 0
        while ei < len(ex_tokens_norm) and (start + ai) < len(ay_tokens_norm):
            ay_tok = ay_tokens_norm[start + ai]
            ex_tok = ex_tokens_norm[ei]
            if _fuzzy_tok_eq(ex_tok, ay_tok):
                ei += 1; ai += 1
            elif ei + 1 < len(ex_tokens_norm) and _fuzzy_tok_eq(ex_tok + ex_tokens_norm[ei + 1], ay_tok):
                ei += 2; ai += 1
            elif ei + 2 < len(ex_tokens_norm) and _fuzzy_tok_eq(ex_tok + ex_tokens_norm[ei + 1] + ex_tokens_norm[ei + 2], ay_tok):
                ei += 3; ai += 1
            elif (start + ai + 1) < len(ay_tokens_norm) and _fuzzy_tok_eq(ex_tok, ay_tok + ay_tokens_norm[start + ai + 1]):
                ei += 1; ai += 2
            else:
                break
        if ei > best_ex_matched:
            best_start, best_ay_span, best_ex_matched = start, ai, ei
    return best_start, best_ay_span, best_ex_matched

# Load
SRC = "generated/reel_words_top600_validated.json"
d = json.load(open(SRC, encoding="utf-8"))
words = d["words"]

fixed = 0
for w in words:
    comment = w.get("latest_validation_comment", "")
    if "partial" not in comment and "fail" not in comment:
        continue

    rank = w["rank"]
    arabic = w["arabic"]

    # Determine which field holds the example
    if w.get("pass3_example"):
        ex_field = "pass3_example"
    elif w.get("pass2_gpt_example"):
        ex_field = "pass2_gpt_example"
    else:
        continue

    if w.get("pass3_reference"):
        ref_field = "pass3_reference"
    elif w.get("pass2_gpt_reference"):
        ref_field = "pass2_gpt_reference"
    else:
        continue

    old_example = w[ex_field]
    ref = w[ref_field]

    time.sleep(0.3)
    try:
        ay_words = fetch_ayah_words(ref)
    except Exception as exc:
        print(f"  #{rank} API ERROR: {exc}")
        continue

    ex_tokens_norm = [_norm_ar(t) for t in old_example.split() if _norm_ar(t)]
    best_start, best_ay_span, best_ex_matched = find_best_window(ex_tokens_norm, ay_words)

    if best_ay_span == 0:
        print(f"  #{rank} {arabic} - no window found, skipping")
        continue

    # Extract correct Uthmani text from API for the matched window
    new_tokens = []
    for i in range(best_start, best_start + best_ay_span):
        ut = ay_words[i].get("text_uthmani", ay_words[i].get("text", ""))
        new_tokens.append(ut)
    new_example = " ".join(new_tokens)

    # Verify the new example fully matches
    new_norm = [_norm_ar(t) for t in new_example.split() if _norm_ar(t)]
    ay_norms = [_norm_ar(x.get("text_uthmani", x.get("text", ""))) for x in ay_words]
    # Quick check: all new tokens should be directly from the API, so match should be perfect
    _, _, verify_matched = find_best_window(new_norm, ay_words)

    print(f"  #{rank:>3} {arabic:>20}")
    print(f"        OLD: {old_example}")
    print(f"        NEW: {new_example}")
    print(f"        was: {best_ex_matched}/{len(ex_tokens_norm)} -> now: {verify_matched}/{len(new_norm)}")
    print()

    w[ex_field] = new_example
    fixed += 1

# Save
with open(SRC, "w", encoding="utf-8") as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

print(f"Fixed {fixed} examples. Saved to {SRC}")
